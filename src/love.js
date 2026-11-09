// src/love.js
// ميزة الارتباط: جدول relationships + إعدادات rel_prefs + مسارات /api/rel/*.
// الواجهة: public/love.html (الإطار) وsrc/rel.js (الزر داخل الشات).
// القواعد: لكل عضو علاقة نشطة واحدة فقط، والزائر لا يستطيع الارتباط.
import { json, readBody } from './http.js';
import { currentUser } from './security.js';
import { DAY } from './config.js';
import { gestureTables, GEST_WANT, GEST_POST, GEST_GET } from './gestures.js';
import { memTables, MEM_WANT, MEM_POST, MEM_GET } from './memories.js';
import { dateTables, DATE_WANT, DATE_POST, DATE_GET } from './dates.js';
import { lrTables, LR_WANT, LR_POST, LR_GET } from './lovereport.js';

export const LOVE_ROOM_PREFIX = 'love:'; // غرفة الحب: love:<id العلاقة>
export const isLoveRoom = (room) => typeof room === 'string' && room.startsWith(LOVE_ROOM_PREFIX);
const PENDING_TTL = 7 * DAY;             // الطلب غير المجاب يسقط بعد 7 أيام
const MAX_OUT = 5;                       // أقصى عدد طلبات معلّقة يرسلها العضو
const PREF_DEFAULTS = { auto_accept: 0, full_screen: 1, sound: 1, reduce_motion: 0, paused: 0 };
const PREF_KEYS = Object.keys(PREF_DEFAULTS);

// ---------- المخطط (يُستدعى من database.js ضمن نفس الدفعة) ----------
export function loveTables(env) {
  return [
    env.DB.prepare("CREATE TABLE IF NOT EXISTS relationships(id INTEGER PRIMARY KEY AUTOINCREMENT, user_a INTEGER NOT NULL, user_b INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER NOT NULL DEFAULT 0, ended_by INTEGER)"),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_rel_a ON relationships(user_a,status)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_rel_b ON relationships(user_b,status)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rel_prefs(user_id INTEGER PRIMARY KEY, auto_accept INTEGER NOT NULL DEFAULT 0, full_screen INTEGER NOT NULL DEFAULT 1, sound INTEGER NOT NULL DEFAULT 1, reduce_motion INTEGER NOT NULL DEFAULT 0, paused INTEGER NOT NULL DEFAULT 0)'),
    ...gestureTables(env),
    ...memTables(env),
    ...dateTables(env),
    ...lrTables(env),
  ];
}

export const LOVE_WANT = {
  relationships: ['id', 'user_a', 'user_b', 'status', 'created_at', 'started_at', 'ended_at', 'ended_by'],
  rel_prefs: ['user_id', 'auto_accept', 'full_screen', 'sound', 'reduce_motion', 'paused'],
  ...GEST_WANT,
  ...MEM_WANT,
  ...DATE_WANT,
  ...LR_WANT,
};

// ---------- أدوات داخلية ----------
const notify = (env, uid, text, ref, now) =>
  env.DB.prepare("INSERT INTO notifications(user_id,ty,text,ref,ts) VALUES(?,'info',?,?,?)").bind(uid, text, ref || null, now);

async function authMember(req, env) {
  const u = await currentUser(req, env);
  if (!u) return { err: json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401) };
  if (u.role === 'visitor') return { err: json({ error: 'الزائر لا يستطيع الارتباط. سجّل كعضو.' }, 403) };
  return { u };
}

const myActive = (env, uid) =>
  env.DB.prepare("SELECT id,user_a,user_b FROM relationships WHERE status='active' AND (user_a=? OR user_b=?) LIMIT 1").bind(uid, uid).first();

// تفعيل طلب معلّق بتعليمة واحدة: تفشل (0 صفوف) إن صار أحد الطرفين مرتبطاً في هذه الأثناء.
async function activate(env, r, now) {
  const x = await env.DB.prepare(
    "UPDATE relationships SET status='active', started_at=? WHERE id=? AND status='pending' AND NOT EXISTS (" +
    "SELECT 1 FROM relationships x WHERE x.status='active' AND (x.user_a IN (relationships.user_a,relationships.user_b) OR x.user_b IN (relationships.user_a,relationships.user_b)))"
  ).bind(now, r.id).run();
  if (!x.meta || x.meta.changes !== 1) return false;
  // أي طلبات معلّقة أخرى لأحد الطرفين تسقط
  await env.DB.prepare(
    "UPDATE relationships SET status='declined', ended_at=? WHERE status='pending' AND (user_a IN (?,?) OR user_b IN (?,?))"
  ).bind(now, r.user_a, r.user_b, r.user_a, r.user_b).run();
  return true;
}

// ---------- GET /api/rel/status ----------
async function relStatus(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const now = Date.now();
  const [rows, pf, gp] = await env.DB.batch([
    env.DB.prepare(
      'SELECT r.id,r.user_a,r.status,r.started_at,p.id pid,p.name pname FROM relationships r ' +
      'JOIN users p ON p.id=CASE WHEN r.user_a=? THEN r.user_b ELSE r.user_a END ' +
      "WHERE (r.user_a=? OR r.user_b=?) AND (r.status='active' OR (r.status='pending' AND r.created_at>?)) ORDER BY r.id DESC"
    ).bind(u.id, u.id, u.id, now - PENDING_TTL),
    env.DB.prepare('SELECT auto_accept,full_screen,sound,reduce_motion,paused FROM rel_prefs WHERE user_id=?').bind(u.id),
    env.DB.prepare('SELECT accept FROM gesture_prefs WHERE user_id=?').bind(u.id),
  ]);
  const out = { ok: true, active: null, incoming: [], outgoing: [], prefs: { ...PREF_DEFAULTS, ...(pf.results[0] || {}), gest_ok: gp.results[0] ? gp.results[0].accept : 1 } };
  for (const r of rows.results) {
    const item = { id: r.id, partner: { id: r.pid, name: r.pname } };
    if (r.status === 'active') { if (!out.active) out.active = { ...item, since: r.started_at, room: LOVE_ROOM_PREFIX + r.id }; }
    else if (r.user_a === u.id) out.outgoing.push(item);
    else out.incoming.push(item);
  }
  return json(out);
}

// ---------- POST /api/rel/request {to} ----------
async function relRequest(req, env) {
  const { u, err } = await authMember(req, env);
  if (err) return err;
  const b = await readBody(req);
  const to = b ? parseInt(b.to, 10) : 0;
  if (!to || to === u.id) return json({ error: 'طلب غير صالح' }, 400);
  const t = await env.DB.prepare('SELECT id,name,role FROM users WHERE id=?').bind(to).first();
  if (!t) return json({ error: 'المستخدم غير موجود' }, 404);
  if (t.role === 'visitor') return json({ error: 'لا يمكن الارتباط بزائر' }, 400);
  const now = Date.now();
  const fresh = now - PENDING_TTL;

  const mine = await myActive(env, u.id);
  if (mine) {
    if (mine.user_a === to || mine.user_b === to) return json({ ok: true, status: 'accepted' });
    return json({ error: 'أنت مرتبط بالفعل. أنهِ الارتباط الحالي أولاً' }, 400);
  }
  const s = await env.DB.prepare(
    "SELECT (SELECT id FROM relationships WHERE status='pending' AND user_a=? AND user_b=? AND created_at>?) mine," +
    " (SELECT id FROM relationships WHERE status='pending' AND user_a=? AND user_b=? AND created_at>?) theirs," +
    " (SELECT 1 FROM relationships WHERE status='active' AND (user_a=? OR user_b=?) LIMIT 1) tact," +
    ' (SELECT 1 FROM ignores WHERE user_id=? AND target_id=?) ig,' +
    ' (SELECT COUNT(*) FROM relationships WHERE user_a=? AND created_at>?) recent,' +
    " (SELECT COUNT(*) FROM relationships WHERE user_a=? AND status='pending' AND created_at>?) outn," +
    ' (SELECT auto_accept FROM rel_prefs WHERE user_id=?) auto'
  ).bind(u.id, to, fresh, to, u.id, fresh, to, to, to, u.id, u.id, now - 6e4, u.id, fresh, to).first();

  if (s.tact) return json({ error: 'هذا العضو مرتبط بشخص آخر' }, 400);
  if (s.theirs) { // طلب متبادل: يصبحان مرتبطين فوراً
    const ok = await activate(env, { id: s.theirs, user_a: to, user_b: u.id }, now);
    return ok ? json({ ok: true, status: 'accepted' }) : json({ error: 'تعذر تفعيل الارتباط' }, 409);
  }
  if (s.mine) return json({ ok: true, status: 'pending' });
  if (s.recent >= 5) return json({ error: 'أبطئ قليلاً، طلبات كثيرة' }, 429);
  if (s.outn >= MAX_OUT) return json({ error: 'لديك طلبات معلّقة كثيرة. انتظر الرد أو ألغِ بعضها' }, 400);
  if (s.ig) return json({ ok: true, status: 'pending' }); // المستلم يتجاهلك: لا يصله شيء ولا نخبرك

  const ins = await env.DB.prepare("INSERT INTO relationships(user_a,user_b,status,created_at) VALUES(?,?, 'pending', ?)").bind(u.id, to, now).run();
  const rid = ins.meta && ins.meta.last_row_id;
  if (s.auto && rid && await activate(env, { id: rid, user_a: u.id, user_b: to }, now)) {
    await notify(env, to, '💞 أصبحت مرتبطاً مع ' + u.name, u.id, now).run();
    return json({ ok: true, status: 'accepted' });
  }
  await notify(env, to, '💞 ' + u.name + ' أرسل لك طلب ارتباط', u.id, now).run();
  return json({ ok: true, status: 'pending' });
}

// ---------- POST /api/rel/accept {id} ----------
async function relAccept(req, env) {
  const { u, err } = await authMember(req, env);
  if (err) return err;
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const r = await env.DB.prepare("SELECT id,user_a,user_b,created_at FROM relationships WHERE id=? AND user_b=? AND status='pending'").bind(id, u.id).first();
  if (!r) return json({ error: 'الطلب غير موجود' }, 404);
  const now = Date.now();
  if (r.created_at <= now - PENDING_TTL) return json({ error: 'انتهت صلاحية الطلب' }, 410);
  if (!(await activate(env, r, now))) return json({ error: 'أحد الطرفين مرتبط بالفعل' }, 409);
  await notify(env, r.user_a, '💞 ' + u.name + ' قَبِل طلب الارتباط', u.id, now).run();
  return json({ ok: true });
}

// ---------- POST /api/rel/decline {id} (رفض الوارد أو إلغاء الصادر) ----------
async function relDecline(req, env) {
  const { u, err } = await authMember(req, env);
  if (err) return err;
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const x = await env.DB.prepare("UPDATE relationships SET status='declined', ended_at=?, ended_by=? WHERE id=? AND status='pending' AND (user_a=? OR user_b=?)")
    .bind(Date.now(), u.id, id, u.id, u.id).run();
  if (!x.meta || x.meta.changes !== 1) return json({ error: 'الطلب غير موجود' }, 404);
  return json({ ok: true });
}

// ---------- POST /api/rel/end {id} ----------
async function relEnd(req, env) {
  const { u, err } = await authMember(req, env);
  if (err) return err;
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const r = await env.DB.prepare("SELECT id,user_a,user_b FROM relationships WHERE id=? AND status='active' AND (user_a=? OR user_b=?)").bind(id, u.id, u.id).first();
  if (!r) return json({ error: 'الارتباط غير موجود' }, 404);
  const now = Date.now();
  const x = await env.DB.prepare("UPDATE relationships SET status='ended', ended_at=?, ended_by=? WHERE id=? AND status='active'").bind(now, u.id, id).run();
  if (!x.meta || x.meta.changes !== 1) return json({ error: 'الارتباط غير موجود' }, 404);
  await notify(env, r.user_a === u.id ? r.user_b : r.user_a, 'أنهى ' + u.name + ' الارتباط معك', u.id, now).run();
  return json({ ok: true });
}

// ---------- POST /api/rel/prefs {<مفتاح>: 0|1} ----------
async function relPrefs(req, env) {
  const { u, err } = await authMember(req, env);
  if (err) return err;
  const b = await readBody(req);
  const isObj = b && typeof b === 'object';
  const keys = isObj ? PREF_KEYS.filter((k) => k in b) : [];
  const hasG = isObj && 'gest_ok' in b;
  if (!keys.length && !hasG) return json({ error: 'طلب غير صالح' }, 400);
  const st = [];
  if (keys.length) {
    // الصف الجديد يُنشأ بالقيم الافتراضية الصريحة (لا بقيم أعمدة الجدول القديم)
    st.push(env.DB.prepare('INSERT INTO rel_prefs(user_id,auto_accept,full_screen,sound,reduce_motion,paused) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING')
      .bind(u.id, PREF_DEFAULTS.auto_accept, PREF_DEFAULTS.full_screen, PREF_DEFAULTS.sound, PREF_DEFAULTS.reduce_motion, PREF_DEFAULTS.paused));
    // المفاتيح من قائمة بيضاء ثابتة، فلا خطر حقن في اسم العمود
    for (const k of keys) st.push(env.DB.prepare('UPDATE rel_prefs SET ' + k + '=? WHERE user_id=?').bind(b[k] ? 1 : 0, u.id));
  }
  if (hasG) st.push(env.DB.prepare('INSERT INTO gesture_prefs(user_id,accept) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET accept=excluded.accept').bind(u.id, b.gest_ok ? 1 : 0));
  await env.DB.batch(st);
  return json({ ok: true });
}

// ---------- حارس غرف الحب ----------
// يُستدعى من poll وpostMsg قبل أي منطق. الغرف العادية تمر (null)،
// وغرفة love:<id> لا يدخلها إلا طرفا علاقة نشطة.
export async function loveGuard(env, u, room) {
  if (typeof room !== 'string' || !room.startsWith(LOVE_ROOM_PREFIX)) return null;
  const id = parseInt(room.slice(LOVE_ROOM_PREFIX.length), 10);
  const ok = id ? await env.DB.prepare("SELECT 1 x FROM relationships WHERE id=? AND status='active' AND (user_a=? OR user_b=?)").bind(id, u.id, u.id).first() : null;
  return ok ? null : json({ error: 'غرفة غير متاحة' }, 403);
}

export const REL_POST = {
  ...GEST_POST,
  ...MEM_POST,
  ...DATE_POST,
  ...LR_POST,
  '/api/rel/request': relRequest,
  '/api/rel/accept': relAccept,
  '/api/rel/decline': relDecline,
  '/api/rel/end': relEnd,
  '/api/rel/prefs': relPrefs,
};
export const REL_GET = { '/api/rel/status': relStatus, ...GEST_GET, ...MEM_GET, ...DATE_GET, ...LR_GET };
