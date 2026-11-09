// src/memories.js
// «ذكرياتنا»: سجل مشترك بين طرفي العلاقة النشطة.
// - ملاحظة يكتبها أحد الطرفين (note)
// - رسالة محفوظة من غرفة الحب (msg): تُنسخ نصاً لأن رسائل الغرف تُحذف بعد KEEP يوماً
// - الحركات المتبادلة (gesture): تُقرأ من gesture_log ولا تُنسخ، فلا تكرار
// القاعدة: لا يرى السجل أو يغيّره إلا طرفا علاقة نشطة، ويُفحص كل شيء هنا في الخادم.
import { json, readBody } from './http.js';
import { currentUser } from './security.js';
import { DAY } from './config.js';

const ROOM_PREFIX = 'love:';        // نفس بادئة LOVE_ROOM_PREFIX في love.js (لا استيراد لتفادي الدوران)
const NOTE_MAX = 300;               // أقصى طول للملاحظة
const MSG_MAX = 500;                // أقصى طول لرسالة محفوظة (حد الرسالة في الشات)
const CAP = 500;                    // أقصى عدد ذكريات (ملاحظات + رسائل) لكل علاقة
const HOURLY_MAX = 30;              // أقصى إضافة في الساعة لكل عضو
const PAGE = 30;                    // حجم الصفحة

const KINDS = ['all', 'note', 'msg', 'date', 'gesture'];

export function memTables(env) {
  return [
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rel_memories(id INTEGER PRIMARY KEY AUTOINCREMENT, rel_id INTEGER NOT NULL, by_id INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, src_mid INTEGER, src_name TEXT, src_ts INTEGER, ts INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mem_rel ON rel_memories(rel_id,ts)'),
    // رسالة واحدة تُحفظ مرة واحدة فقط لكل علاقة (الصفوف بلا src_mid، أي الملاحظات، لا تتأثر)
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_mem_src ON rel_memories(rel_id,src_mid)'),
  ];
}

export const MEM_WANT = {
  rel_memories: ['id', 'rel_id', 'by_id', 'kind', 'text', 'src_mid', 'src_name', 'src_ts', 'ts'],
};

async function ctx(req, env) {
  const u = await currentUser(req, env);
  if (!u) return { err: json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401) };
  if (u.role === 'visitor') return { err: json({ error: 'الزائر لا يستطيع الارتباط. سجّل كعضو.' }, 403) };
  const r = await env.DB.prepare(
    "SELECT id,user_a,user_b FROM relationships WHERE status='active' AND (user_a=? OR user_b=?) LIMIT 1"
  ).bind(u.id, u.id).first();
  if (!r) return { err: json({ error: 'ذكرياتنا متاحة بعد قبول الارتباط' }, 403) };
  return { u, r, partner: r.user_a === u.id ? r.user_b : r.user_a };
}

// حدّ الإضافة: سقف كلي للعلاقة وسقف ساعي للعضو
async function canAdd(env, c, now) {
  const s = await env.DB.prepare(
    'SELECT (SELECT COUNT(*) FROM rel_memories WHERE rel_id=?) total, (SELECT COUNT(*) FROM rel_memories WHERE by_id=? AND ts>?) hour'
  ).bind(c.r.id, c.u.id, now - 3600e3).first();
  if (s.total >= CAP) return 'امتلأ سجل الذكريات (' + CAP + '). احذف بعض الذكريات القديمة أولاً.';
  if (s.hour >= HOURLY_MAX) return 'أضفت ذكريات كثيرة خلال الساعة الأخيرة، حاول لاحقاً';
  return '';
}

// ---------- POST /api/mem/add {text} ----------
async function memAdd(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  const text = b && typeof b.text === 'string' ? b.text.trim().slice(0, NOTE_MAX) : '';
  if (!text) return json({ error: 'اكتب نص الذكرى' }, 400);
  const now = Date.now();
  const lim = await canAdd(env, c, now);
  if (lim) return json({ error: lim }, 429);
  const x = await env.DB.prepare(
    "INSERT INTO rel_memories(rel_id,by_id,kind,text,ts) VALUES(?,?,'note',?,?)"
  ).bind(c.r.id, c.u.id, text, now).run();
  return json({ ok: true, id: x.meta && x.meta.last_row_id });
}

// ---------- POST /api/mem/save {id} ----------
// حفظ رسالة من غرفة الحب نفسها فقط. تُنسخ باسم كاتبها ووقتها الأصليين.
async function memSave(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  const mid = b ? parseInt(b.id, 10) : 0;
  if (!mid) return json({ error: 'طلب غير صالح' }, 400);
  const m = await env.DB.prepare(
    'SELECT id,user_id,uname,text,ts,del,kind FROM messages WHERE id=? AND room=?'
  ).bind(mid, ROOM_PREFIX + c.r.id).first();
  if (!m || m.del || (m.kind && m.kind !== 'sys') || !String(m.text || '').trim()) return json({ error: 'الرسالة غير متاحة للحفظ' }, 404);
  const now = Date.now();
  const lim = await canAdd(env, c, now);
  if (lim) return json({ error: lim }, 429);
  try {
    await env.DB.prepare(
      "INSERT INTO rel_memories(rel_id,by_id,kind,text,src_mid,src_name,src_ts,ts) VALUES(?,?,'msg',?,?,?,?,?)"
    ).bind(c.r.id, c.u.id, String(m.text).slice(0, MSG_MAX), m.id, String(m.uname || '').slice(0, 40), m.ts, now).run();
  } catch (e) {
    if (/UNIQUE/i.test(String((e && e.message) || e))) return json({ ok: true, dup: true });
    throw e;
  }
  return json({ ok: true });
}

// ---------- POST /api/mem/del {id} ----------
// يحذف كل طرف ما أضافه هو فقط.
async function memDel(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const x = await env.DB.prepare('DELETE FROM rel_memories WHERE id=? AND rel_id=? AND by_id=?').bind(id, c.r.id, c.u.id).run();
  if (!x.meta || x.meta.changes !== 1) return json({ error: 'لا يمكنك حذف هذه الذكرى' }, 403);
  return json({ ok: true });
}

// ---------- GET /api/mem/list?kind=all|note|msg|gesture&before=<ts> ----------
async function memList(req, env, url) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const q = url ? url.searchParams : new URLSearchParams();
  let kind = q.get('kind') || 'all';
  if (!KINDS.includes(kind)) kind = 'all';
  let before = parseInt(q.get('before'), 10);
  if (!(before > 0)) before = Date.now() + DAY; // أول صفحة: كل شيء
  const rid = c.r.id;

  // الأعمدة موحّدة: id, src (m = ذكرى محفوظة، g = حركة), kind, text, by_id, aux, ts
  const mem = "SELECT id,'m' src,kind,text,by_id,src_name aux,COALESCE(src_ts,ts) ts FROM rel_memories WHERE rel_id=? AND COALESCE(src_ts,ts)<?" + (kind === 'note' || kind === 'msg' || kind === 'date' ? ' AND kind=?' : '');
  const ges = "SELECT l.id,'g' src,'gesture' kind,g.name text,l.from_id by_id,g.emoji aux,l.ts ts FROM gesture_log l JOIN gestures g ON g.id=l.gid WHERE l.rel_id=? AND l.ts<?";
  let sql, args;
  if (kind === 'gesture') { sql = ges; args = [rid, before]; }
  else if (kind === 'note' || kind === 'msg' || kind === 'date') { sql = mem; args = [rid, before, kind]; }
  else { sql = mem + ' UNION ALL ' + ges; args = [rid, before, rid, before]; }
  // الترتيب بوقت الحدث (وقت الرسالة الأصلي للمحفوظة). الصفحة التالية تبدأ من آخر ts مُعاد.
  sql = 'SELECT * FROM (' + sql + ') ORDER BY ts DESC, id DESC LIMIT ?';
  args.push(PAGE + 1);

  const st = [env.DB.prepare(sql).bind(...args), env.DB.prepare('SELECT name FROM users WHERE id=?').bind(c.partner)];
  const first = !q.get('before');
  if (first) {
    st.push(env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM rel_memories WHERE rel_id=? AND kind='note') note, (SELECT COUNT(*) FROM rel_memories WHERE rel_id=? AND kind='msg') msg, (SELECT COUNT(*) FROM rel_memories WHERE rel_id=? AND kind='date') date, (SELECT COUNT(*) FROM gesture_log WHERE rel_id=?) gesture"
    ).bind(rid, rid, rid, rid));
  }
  const rs = await env.DB.batch(st);
  let rows = rs[0].results;
  const more = rows.length > PAGE;
  if (more) rows = rows.slice(0, PAGE);
  const out = {
    ok: true,
    me: { id: c.u.id, name: c.u.name },
    partner: { id: c.partner, name: rs[1].results[0] ? rs[1].results[0].name : '' },
    items: rows.map((r) => ({ id: r.id, src: r.src, kind: r.kind, text: r.text, by: r.by_id, aux: r.aux || '', ts: r.ts, mine: r.by_id === c.u.id && r.src === 'm' })),
    more,
    next: rows.length ? rows[rows.length - 1].ts : 0,
  };
  if (first) out.counts = rs[2].results[0];
  return json(out);
}

export const MEM_POST = { '/api/mem/add': memAdd, '/api/mem/save': memSave, '/api/mem/del': memDel };
export const MEM_GET = { '/api/mem/list': memList };
