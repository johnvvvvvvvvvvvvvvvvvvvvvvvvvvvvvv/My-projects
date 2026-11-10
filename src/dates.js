// src/dates.js
// المواعيد الغرامية بين طرفي العلاقة النشطة: دعوة ← موافقة ← مشهد موعد حي ← حفظ في ذكرياتنا.
// الحالات: pending (بانتظار الرد) | accepted | live | done | declined | cancelled
// مشهد الموعد: فقاعة واحدة لكل طرف. الرسائل القصيرة تُحفظ ساعات في date_msgs وتُقرأ بالاستعلام الدوري.
// القاعدة: يُفحص كل شيء هنا في الخادم، ولا يصل أي موعد إلا لطرفي علاقته النشطة.
import { json, readBody } from './http.js';
import { currentUser } from './security.js';
import { DAY } from './config.js';

export const DATE_TYPES = ['عشاء رومانسي', 'سينما', 'مشي على الشاطئ', 'قهوة وحديث', 'أمسية ألعاب'];
const QUESTIONS = [
  'ما أول شيء فكرت به عندما رأيتني؟',
  'لو سافرنا غداً فأين نذهب؟',
  'ما الأغنية التي تذكّرك بي؟',
  'ما أجمل لحظة بيننا حتى الآن؟',
  'ما الشيء الصغير الذي يسعدك؟',
  'ما حلمك لنا بعد سنة؟',
];
const MAX_OPEN = 5;                 // أقصى مواعيد مفتوحة (معلّقة أو مقبولة أو جارية) لكل علاقة
const PENDING_TTL = 7 * DAY;        // الدعوة غير المجاب عنها تسقط من العرض بعد 7 أيام
const LIVE_TTL = 6 * 3600e3;        // الموعد الجاري يُغلق تلقائياً بعد 6 ساعات
const SAY_MAX = 120;                // أقصى طول لرسالة الموعد
const SAY_GAP = 700;                // أقل فاصل بين رسالتين من العضو نفسه (مللي ثانية)
const ASK_GAP = 3000;               // أقل فاصل بين سؤالين
const FRESH = 8000;                 // أول استعلام لا يُعيد إلا رسائل آخر 8 ثوانٍ

export function dateTables(env) {
  return [
    env.DB.prepare("CREATE TABLE IF NOT EXISTS rel_dates(id INTEGER PRIMARY KEY AUTOINCREMENT, rel_id INTEGER NOT NULL, from_id INTEGER NOT NULL, ty TEXT NOT NULL, place TEXT NOT NULL DEFAULT '', at_ts INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER)"),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_date_rel ON rel_dates(rel_id,id)'),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS date_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, date_id INTEGER NOT NULL, user_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'm', text TEXT NOT NULL, ts INTEGER NOT NULL)"),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_dmsg_date ON date_msgs(date_id,id)'),
    // «المساحة الشخصية»: جدول مستقل كي لا نمسّ rel_prefs القائم؛ الافتراضي 0 (تأثيرات القرب مفتوحة)
    env.DB.prepare('CREATE TABLE IF NOT EXISTS scene_prefs(user_id INTEGER PRIMARY KEY, personal_space INTEGER NOT NULL DEFAULT 0)'),
  ];
}

export const DATE_WANT = {
  rel_dates: ['id', 'rel_id', 'from_id', 'ty', 'place', 'at_ts', 'status', 'created_at', 'started_at', 'ended_at'],
  date_msgs: ['id', 'date_id', 'user_id', 'kind', 'text', 'ts'],
  scene_prefs: ['user_id', 'personal_space'],
};

async function ctx(req, env) {
  const u = await currentUser(req, env);
  if (!u) return { err: json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401) };
  if (u.role === 'visitor') return { err: json({ error: 'الزائر لا يستطيع الارتباط. سجّل كعضو.' }, 403) };
  const r = await env.DB.prepare(
    "SELECT id,user_a,user_b FROM relationships WHERE status='active' AND (user_a=? OR user_b=?) LIMIT 1"
  ).bind(u.id, u.id).first();
  if (!r) return { err: json({ error: 'المواعيد متاحة بعد قبول الارتباط' }, 403) };
  return { u, r, partner: r.user_a === u.id ? r.user_b : r.user_a };
}

// موعد يخص علاقة العضو الحالية فقط
const getDate = (env, c, id) =>
  env.DB.prepare('SELECT * FROM rel_dates WHERE id=? AND rel_id=?').bind(id, c.r.id).first();

const notify = (env, uid, text, ref, now) =>
  env.DB.prepare("INSERT INTO notifications(user_id,ty,text,ref,ts) VALUES(?,'info',?,?,?)").bind(uid, text, ref || null, now);

const pint = (v) => { const n = parseInt(v, 10); return n > 0 ? n : 0; };

// ---------- POST /api/date/invite {ty, place, at} ----------
async function dInvite(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const ty = String(b.ty || '');
  if (!DATE_TYPES.includes(ty)) return json({ error: 'نوع الموعد غير معروف' }, 400);
  const place = String(b.place || '').trim().slice(0, 60);
  const now = Date.now();
  const at = Number(b.at);
  if (!(at > now - 2 * 3600e3 && at < now + 60 * DAY)) return json({ error: 'وقت الموعد غير صالح' }, 400);
  const n = await env.DB.prepare(
    "SELECT COUNT(*) c FROM rel_dates WHERE rel_id=? AND status IN ('pending','accepted','live') AND created_at>?"
  ).bind(c.r.id, now - PENDING_TTL).first();
  if (n.c >= MAX_OPEN) return json({ error: 'لديكما مواعيد مفتوحة كثيرة. أنهيا أو ألغيا بعضها أولاً.' }, 429);
  const x = await env.DB.prepare(
    "INSERT INTO rel_dates(rel_id,from_id,ty,place,at_ts,status,created_at) VALUES(?,?,?,?,?,'pending',?)"
  ).bind(c.r.id, c.u.id, ty, place, Math.floor(at), now).run();
  const id = x.meta && x.meta.last_row_id;
  await notify(env, c.partner, '📅 دعوة موعد «' + ty + '» من ' + c.u.name, c.u.id, now).run();
  return json({ ok: true, id });
}

// ---------- POST /api/date/respond {id, accept} ----------
async function dRespond(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  const id = b ? pint(b.id) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const d = await getDate(env, c, id);
  if (!d || d.status !== 'pending') return json({ error: 'الدعوة لم تعد متاحة' }, 404);
  if (d.from_id === c.u.id) return json({ error: 'لا يمكنك الرد على دعوتك' }, 403);
  const accept = !!(b && b.accept);
  const now = Date.now();
  const x = await env.DB.prepare("UPDATE rel_dates SET status=? WHERE id=? AND status='pending'").bind(accept ? 'accepted' : 'declined', id).run();
  if (!x.meta || x.meta.changes !== 1) return json({ error: 'الدعوة لم تعد متاحة' }, 409);
  await notify(env, d.from_id, accept ? '💞 ' + c.u.name + ' وافق على موعد «' + d.ty + '»' : c.u.name + ' اعتذر عن موعد «' + d.ty + '»', c.u.id, now).run();
  return json({ ok: true });
}

// ---------- POST /api/date/cancel {id} ----------
async function dCancel(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  const id = b ? pint(b.id) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const d = await getDate(env, c, id);
  if (!d) return json({ error: 'الموعد غير موجود' }, 404);
  const x = await env.DB.prepare("UPDATE rel_dates SET status='cancelled', ended_at=? WHERE id=? AND status IN ('pending','accepted')").bind(Date.now(), id).run();
  if (!x.meta || x.meta.changes !== 1) return json({ error: 'لا يمكن إلغاء هذا الموعد الآن' }, 409);
  return json({ ok: true });
}

// ---------- POST /api/date/start {id} ----------
// أي طرف يستطيع بدء موعد مقبول، ومن يدخل بعده ينضم لنفس الموعد الجاري.
async function dStart(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  const id = b ? pint(b.id) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const d = await getDate(env, c, id);
  if (!d) return json({ error: 'الموعد غير موجود' }, 404);
  const now = Date.now();
  if (d.status === 'accepted') {
    const x = await env.DB.prepare("UPDATE rel_dates SET status='live', started_at=? WHERE id=? AND status='accepted'").bind(now, id).run();
    if (x.meta && x.meta.changes === 1) {
      await notify(env, c.partner, '🕯️ ' + c.u.name + ' بدأ موعد «' + d.ty + '». انضم إليه من 💞 الارتباط ← مواعيد', c.u.id, now).run();
    }
  } else if (d.status !== 'live') {
    return json({ error: 'الموعد غير جاهز للبدء' }, 409);
  }
  return json({ ok: true });
}

// ---------- POST /api/date/say {id, text} ----------
async function dSay(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  const id = b ? pint(b.id) : 0;
  const text = b && typeof b.text === 'string' ? b.text.trim().slice(0, SAY_MAX) : '';
  if (!id || !text) return json({ error: 'طلب غير صالح' }, 400);
  const d = await getDate(env, c, id);
  if (!d || d.status !== 'live') return json({ error: 'الموعد غير جارٍ' }, 409);
  const now = Date.now();
  const last = await env.DB.prepare('SELECT MAX(ts) t FROM date_msgs WHERE date_id=? AND user_id=?').bind(id, c.u.id).first();
  if (last && last.t && now - last.t < SAY_GAP) return json({ error: 'أبطئ قليلاً' }, 429);
  const x = await env.DB.prepare("INSERT INTO date_msgs(date_id,user_id,kind,text,ts) VALUES(?,?,'m',?,?)").bind(id, c.u.id, text, now).run();
  return json({ ok: true, id: x.meta && x.meta.last_row_id });
}

// ---------- POST /api/date/ask {id} ----------
// سؤال حوار يظهر عند الطرفين. النص يختاره الخادم من قائمته، فلا يحقن العميل شيئاً.
async function dAsk(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  const id = b ? pint(b.id) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const d = await getDate(env, c, id);
  if (!d || d.status !== 'live') return json({ error: 'الموعد غير جارٍ' }, 409);
  const now = Date.now();
  const last = await env.DB.prepare("SELECT MAX(ts) t FROM date_msgs WHERE date_id=? AND kind='q'").bind(id).first();
  if (last && last.t && now - last.t < ASK_GAP) return json({ error: 'انتظر قليلاً قبل السؤال التالي' }, 429);
  const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  await env.DB.prepare("INSERT INTO date_msgs(date_id,user_id,kind,text,ts) VALUES(?,?,'q',?,?)").bind(id, c.u.id, q, now).run();
  return json({ ok: true });
}

// ---------- POST /api/date/end {id} ----------
// ينهي الموعد الجاري ويحفظه في ذكرياتنا مرة واحدة فقط.
async function dEnd(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  const id = b ? pint(b.id) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const d = await getDate(env, c, id);
  if (!d) return json({ error: 'الموعد غير موجود' }, 404);
  const now = Date.now();
  const x = await env.DB.prepare("UPDATE rel_dates SET status='done', ended_at=? WHERE id=? AND status='live'").bind(now, id).run();
  if (x.meta && x.meta.changes === 1) {
    const mins = Math.max(0, Math.floor((now - (d.started_at || now)) / 60000));
    await env.DB.batch([
      env.DB.prepare("INSERT INTO rel_memories(rel_id,by_id,kind,text,ts) VALUES(?,?,'date',?,?)")
        .bind(c.r.id, c.u.id, 'أنهينا موعد «' + d.ty + '»' + (d.place ? ' (' + d.place + ')' : '') + ' بعد ' + mins + ' دقيقة', now),
      env.DB.prepare('DELETE FROM date_msgs WHERE date_id=?').bind(id),
    ]);
  }
  // أغلق مسرح الموعد (يُحذف ما في ذاكرته). فشله لا يؤثر على إنهاء الموعد.
  if (env.DATE_SCENE) {
    try { await env.DATE_SCENE.get(env.DATE_SCENE.idFromName('d' + id)).end(); } catch (e) { console.error('scene end', (e && e.message) || e); }
  }
  return json({ ok: true });
}

// ---------- GET /api/date/list ----------
async function dList(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const now = Date.now();
  // موعد جارٍ نسيه الطرفان يُغلق (بلا ذكرى)
  await env.DB.prepare("UPDATE rel_dates SET status='done', ended_at=? WHERE rel_id=? AND status='live' AND started_at<?").bind(now, c.r.id, now - LIVE_TTL).run();
  const rs = await env.DB.batch([
    env.DB.prepare(
      "SELECT id,from_id,ty,place,at_ts,status,created_at,started_at,ended_at FROM rel_dates WHERE rel_id=? AND ((status IN ('accepted','live')) OR (status='pending' AND created_at>?)) ORDER BY at_ts ASC LIMIT 20"
    ).bind(c.r.id, now - PENDING_TTL),
    env.DB.prepare(
      "SELECT id,from_id,ty,place,at_ts,status,created_at,started_at,ended_at FROM rel_dates WHERE rel_id=? AND status IN ('done','declined','cancelled') ORDER BY id DESC LIMIT 10"
    ).bind(c.r.id),
    env.DB.prepare('SELECT name FROM users WHERE id=?').bind(c.partner),
  ]);
  const map = (r) => ({ id: r.id, mine: r.from_id === c.u.id, ty: r.ty, place: r.place, at: r.at_ts, status: r.status, started: r.started_at, ended: r.ended_at });
  return json({
    ok: true,
    types: DATE_TYPES,
    partner: { id: c.partner, name: rs[2].results[0] ? rs[2].results[0].name : '' },
    open: rs[0].results.map(map),
    past: rs[1].results.map(map),
  });
}

// ---------- GET /api/date/poll?id=&after= ----------
// حالة الموعد + الرسائل الجديدة. تُستدعى كل ثانية ونصف أثناء المشهد.
async function dPoll(req, env, url) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const q = url ? url.searchParams : new URLSearchParams();
  const id = pint(q.get('id'));
  const after = pint(q.get('after'));
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const d = await getDate(env, c, id);
  if (!d) return json({ error: 'الموعد غير موجود' }, 404);
  const now = Date.now();
  let msgs = [];
  if (d.status === 'live') {
    const rs = after
      ? await env.DB.prepare('SELECT id,user_id,kind,text,ts FROM date_msgs WHERE date_id=? AND id>? ORDER BY id LIMIT 50').bind(id, after).all()
      : await env.DB.prepare('SELECT id,user_id,kind,text,ts FROM date_msgs WHERE date_id=? AND ts>? ORDER BY id LIMIT 50').bind(id, now - FRESH).all();
    msgs = rs.results.map((m) => ({ id: m.id, mine: m.user_id === c.u.id, kind: m.kind, text: m.text, ts: m.ts }));
  }
  // أول استعلام فقط: معرّفات الطرفين ونسخة صورتيهما لعرضهما على المسرح
  let who = null;
  if (!after && d.status === 'live') {
    const pr = await env.DB.prepare('SELECT user_id,iv FROM profiles WHERE user_id IN (?,?)').bind(c.u.id, c.partner).all();
    const iv = {};
    for (const p of pr.results) iv[p.user_id] = p.iv || 0;
    who = { me: { id: c.u.id, iv: iv[c.u.id] || 0 }, partner: { id: c.partner, iv: iv[c.partner] || 0 } };
  }
  return json({ ok: true, now, status: d.status, ty: d.ty, place: d.place, started: d.started_at, msgs, who });
}

export async function dateCleanup(env, now) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM date_msgs WHERE ts<?').bind(now - DAY),
    env.DB.prepare('DELETE FROM date_msgs WHERE date_id NOT IN (SELECT id FROM rel_dates)'),
    env.DB.prepare('DELETE FROM rel_dates WHERE rel_id NOT IN (SELECT id FROM relationships)'),
  ]);
}

export const DATE_POST = {
  '/api/date/invite': dInvite, '/api/date/respond': dRespond, '/api/date/cancel': dCancel,
  '/api/date/start': dStart, '/api/date/say': dSay, '/api/date/ask': dAsk, '/api/date/end': dEnd,
};
export const DATE_GET = { '/api/date/list': dList, '/api/date/poll': dPoll };
