// src/gestures.js
// المرحلة 4: محرك الحركات بين الشريكين.
// القاعدة: لا تُرسَل حركة إلا بين طرفي علاقة نشطة، ويُفحص كل شيء هنا في الخادم لا في الواجهة.
// الحركات بيانات في جدول gestures: إضافة حركة = صف جديد (INSERT) دون تعديل أي كود.
// نص الحركة (caption) يأتي من الجدول فقط، فلا يستطيع العميل حقن نص في شاشة الشريك.
import { json, readBody } from './http.js';
import { currentUser } from './security.js';
import { DAY } from './config.js';
import { award } from './points.js';

const COOLDOWN_MS = 30 * 1000; // فترة التهدئة بين حركتين من العضو نفسه
const DAILY_MAX = 200;         // سقف يومي لكل عضو
const PENDING_MS = 90 * 1000;  // الحركة غير المستلَمة تسقط بعد 90 ثانية (لا تُعرض متأخرة)

// الحركات الأساسية. lottie = اسم ملف داخل /public/lottie بلا امتداد. fx = إيموجي الجسيمات.
// ملاحظة: INSERT OR IGNORE، فلا يُكتب فوق صف عدّلته لاحقاً من قاعدة البيانات.
const SEED = [
  ['hug',     'حضن',          '🤗', 'heart-face', 'يرسل لك حضناً', '💗', 1],
  ['kiss',    'قبلة',         '😘', 'kiss',       'يرسل لك قبلة', '💋', 2],
  ['hearts',  'قلوب',         '💖', 'hearts',     'يرسل لك قلوباً', '💖', 3],
  ['flowers', 'باقة ورد',     '💐', 'bouquet',    'أهداك باقة ورد', '🌸', 4],
  ['miss',    'اشتقت لك',     '💭', 'hearts',     'يقول: اشتقت لك', '💞', 5],
  ['morning', 'صباح الخير',   '☀️', 'sparkles',   'يقول: صباح الخير', '✨', 6],
  ['night',   'تصبح على خير', '🌙', 'star',       'يقول: تصبح على خير', '⭐', 7],
  ['clap',    'تصفيق',        '👏', 'clap',       'يصفّق لك', '✨', 8],
  ['star',    'نجمة',         '⭐', 'star',       'أهداك نجمة', '⭐', 9],
  ['party',   'احتفال',       '🎉', 'sparkles',   'يحتفل معك', '🎉', 10],
  ['hands',   'مسك اليد',     '🤝', 'hearts',     'يمسك يدك', '🤍', 11],
];

export function gestureTables(env) {
  return [
    env.DB.prepare('CREATE TABLE IF NOT EXISTS gestures(id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL, lottie TEXT NOT NULL, caption TEXT NOT NULL, fx TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, cd INTEGER NOT NULL DEFAULT 30, active INTEGER NOT NULL DEFAULT 1)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS gesture_log(id INTEGER PRIMARY KEY AUTOINCREMENT, rel_id INTEGER NOT NULL, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, gid TEXT NOT NULL, ts INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_glog_to ON gesture_log(to_id,seen,ts)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_glog_from ON gesture_log(from_id,ts)'),
    // إعداد قبول الحركات: جدول مستقل كي لا نمسّ rel_prefs القائم؛ الافتراضي مفتوح (1) كما طُلب
    env.DB.prepare('CREATE TABLE IF NOT EXISTS gesture_prefs(user_id INTEGER PRIMARY KEY, accept INTEGER NOT NULL DEFAULT 1)'),
    ...SEED.map((g) =>
      env.DB.prepare('INSERT OR IGNORE INTO gestures(id,name,emoji,lottie,caption,fx,sort) VALUES(?,?,?,?,?,?,?)').bind(...g)
    ),
  ];
}

export const GEST_WANT = {
  gestures: ['id', 'name', 'emoji', 'lottie', 'caption', 'fx', 'sort', 'cd', 'active'],
  gesture_log: ['id', 'rel_id', 'from_id', 'to_id', 'gid', 'ts', 'seen'],
  gesture_prefs: ['user_id', 'accept'],
};

async function authMember(req, env) {
  const u = await currentUser(req, env);
  if (!u) return { err: json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401) };
  if (u.role === 'visitor') return { err: json({ error: 'الحركات للأعضاء المرتبطين فقط' }, 403) };
  return { u };
}

// ---------- GET /api/gesture/list ----------
async function gList(req, env) {
  const { u, err } = await authMember(req, env);
  if (err) return err;
  const rs = await env.DB.prepare('SELECT id,name,emoji,lottie,caption,fx,cd FROM gestures WHERE active=1 ORDER BY sort,id').all();
  return json({ ok: true, items: rs.results });
}

// ---------- POST /api/gesture/send {gid} ----------
async function gSend(req, env) {
  const { u, err } = await authMember(req, env);
  if (err) return err;
  const b = await readBody(req);
  const gid = b && typeof b.gid === 'string' ? b.gid.slice(0, 32) : '';
  if (!gid) return json({ error: 'طلب غير صالح' }, 400);
  const now = Date.now();

  // العلاقة النشطة وشريكها
  const r = await env.DB.prepare("SELECT id,user_a,user_b FROM relationships WHERE status='active' AND (user_a=? OR user_b=?) LIMIT 1").bind(u.id, u.id).first();
  if (!r) return json({ error: 'الحركات متاحة بعد قبول الارتباط' }, 403);
  const to = r.user_a === u.id ? r.user_b : r.user_a;

  // العناق ومسك اليد: إن كان للعلاقة موعد جارٍ فلا يُقبلان إلا والطرفان متقاربان في المسرح (يُفحص في الخادم)
  if ((gid === 'hug' || gid === 'hands') && env.DATE_SCENE) {
    const live = await env.DB.prepare("SELECT id FROM rel_dates WHERE rel_id=? AND status='live' LIMIT 1").bind(r.id).first();
    if (live) {
      let ok = false;
      try { ok = await env.DATE_SCENE.get(env.DATE_SCENE.idFromName('d' + live.id)).canTouch(u.id); } catch (e) { ok = false; }
      if (!ok) return json({ error: 'العناق ومسك اليد يحتاجان أن تكونا متقاربين في مسرح الموعد' }, 403);
    }
  }

  const s = await env.DB.prepare(
    'SELECT (SELECT cd FROM gestures WHERE id=? AND active=1) cd,' +
    ' (SELECT 1 FROM gestures WHERE id=? AND active=1) ok,' +
    ' (SELECT MAX(ts) FROM gesture_log WHERE from_id=?) last,' +
    ' (SELECT COUNT(*) FROM gesture_log WHERE from_id=? AND ts>?) today,' +
    ' (SELECT accept FROM gesture_prefs WHERE user_id=?) acc,' +
    ' (SELECT paused FROM rel_prefs WHERE user_id=?) tpaused,' +
    ' (SELECT paused FROM rel_prefs WHERE user_id=?) mpaused,' +
    ' (SELECT 1 FROM ignores WHERE user_id=? AND target_id=?) ig'
  ).bind(gid, gid, u.id, u.id, now - DAY, to, to, u.id, to, u.id).first();

  if (!s.ok) return json({ error: 'حركة غير موجودة' }, 404);
  if (s.mpaused) return json({ error: 'أوقفتَ الحركات مؤقتاً من إعدادات الارتباط' }, 403);
  const cd = Math.max(COOLDOWN_MS, (s.cd || 0) * 1000);
  if (s.last && now - s.last < cd) {
    return json({ error: 'انتظر قليلاً قبل الحركة التالية', wait: Math.ceil((cd - (now - s.last)) / 1000) }, 429);
  }
  if (s.today >= DAILY_MAX) return json({ error: 'بلغت الحد اليومي للحركات' }, 429);
  if (s.acc === 0) return json({ error: 'شريكك أغلق استقبال الحركات' }, 403);
  if (s.tpaused) return json({ error: 'شريكك أوقف الحركات مؤقتاً' }, 403);
  // الشريك يتجاهلك: لا تُسجَّل ولا تصله، ولا نخبرك (كما في طلبات الارتباط)
  if (s.ig) return json({ ok: true, to: 0 });

  await env.DB.prepare('INSERT INTO gesture_log(rel_id,from_id,to_id,gid,ts) VALUES(?,?,?,?,?)').bind(r.id, u.id, to, gid, now).run();
  await award(env, { relId: r.id, uid: u.id, kind: 'gesture', gid });   // نقاط الحب (لا ترمي أبداً)
  return json({ ok: true, to });
}

// ---------- GET /api/gesture/pending ----------
// الحركات الواردة غير المعروضة. تُعلَّم كمعروضة بنفس الطلب، وتُسقَط إن انتهت العلاقة أو تأخرت.
async function gPending(req, env) {
  const { u, err } = await authMember(req, env);
  if (err) return err;
  const now = Date.now();
  const rs = await env.DB.prepare(
    "SELECT l.id,l.gid,l.from_id,l.ts,p.name fname,g.name gname,g.emoji,g.lottie,g.caption,g.fx FROM gesture_log l " +
    "JOIN gestures g ON g.id=l.gid " +
    "JOIN users p ON p.id=l.from_id " +
    "JOIN relationships r ON r.id=l.rel_id AND r.status='active' " +
    "WHERE l.to_id=? AND l.seen=0 AND l.ts>? ORDER BY l.id LIMIT 5"
  ).bind(u.id, now - PENDING_MS).all();
  // تعليم كل غير المعروض (حتى المتأخر) كمعروض لئلا يتراكم
  await env.DB.prepare('UPDATE gesture_log SET seen=1 WHERE to_id=? AND seen=0').bind(u.id).run();
  return json({ ok: true, items: rs.results });
}

export const GEST_POST = { '/api/gesture/send': gSend };
export const GEST_GET = { '/api/gesture/list': gList, '/api/gesture/pending': gPending };
