// src/points.js
// نقاط الحب: نقاط للعلاقة النشطة، عشرة مستويات، مهام يومية وأسبوعية، شارات، ولوحة «أجمل الأزواج».
// القواعد:
// - النقاط للعلاقة (rel_id) لا للعضو. تنتهي العلاقة فتختفي نقاطها، والعلاقة الجديدة تبدأ من الصفر.
// - كل شيء يُحسب ويُفحص هنا في الخادم. العميل لا يرسل نقاطاً أبداً، فالنقاط تأتي فقط من أحداث حقيقية
//   (حركة، رسالة في غرفة الحب، ذكرى، موعد) تستدعي award() من وحداتها.
// - سقف يومي لكل نوع حدث وسقف كلي للعلاقة، وبلا نقاط إن كان الحسابان من العنوان نفسه (BLOCK_SAME_IP).
// - اللوحة العامة اختيارية: لا يظهر زوج فيها إلا إذا فعّل الطرفان الخيار (الافتراضي مخفي).
import { json, readBody } from './http.js';
import { currentUser } from './security.js';
import { DAY } from './config.js';

const TZ = 3 * 3600e3;              // حدّ اليوم والأسبوع بتوقيت UTC+3 (غيّره إن أردت توقيتاً آخر)
const DAY_CAP = 80;                 // أقصى نقاط أحداث في اليوم للعلاقة (مكافآت المهام خارج هذا السقف)
const BLOCK_SAME_IP = true;         // لا نقاط إن كان آخر عنوان للحسابين واحداً. ملاحظة: يشمل زوجين على شبكة واحدة
const DEFAULT_SHOW_BOARD = 0;       // الظهور في اللوحة العامة: 0 مخفي افتراضياً، ويلزم تفعيل الطرفين
const TOP_N = 10;

// ---------- المستويات: الاسم والإيموجي وألوان البانر والإطار ----------
export const LEVELS = [
  { n: 1, from: 0, name: 'بداية الحب', e: '🌱', c1: '#fda4af', c2: '#fb7185' },
  { n: 2, from: 50, name: 'تعارف جميل', e: '🌷', c1: '#f9a8d4', c2: '#ec4899' },
  { n: 3, from: 150, name: 'قلبان', e: '💕', c1: '#f0abfc', c2: '#d946ef' },
  { n: 4, from: 300, name: 'ودّ ثابت', e: '💞', c1: '#c4b5fd', c2: '#8b5cf6' },
  { n: 5, from: 500, name: 'رفقة دافئة', e: '💗', c1: '#a5b4fc', c2: '#6366f1' },
  { n: 6, from: 800, name: 'حب راسخ', e: '💝', c1: '#93c5fd', c2: '#3b82f6' },
  { n: 7, from: 1200, name: 'توأم الروح', e: '💖', c1: '#67e8f9', c2: '#06b6d4' },
  { n: 8, from: 1800, name: 'عشق نادر', e: '✨', c1: '#6ee7b7', c2: '#10b981' },
  { n: 9, from: 2600, name: 'حكاية خالدة', e: '🌟', c1: '#fde047', c2: '#f59e0b' },
  { n: 10, from: 3600, name: 'أسطورة الحب', e: '👑', c1: '#fcd34d', c2: '#e11d48' },
];

export function levelInfo(pts) {
  const p = Math.max(0, pts | 0);
  let i = 0;
  while (i + 1 < LEVELS.length && p >= LEVELS[i + 1].from) i++;
  const L = LEVELS[i], nx = LEVELS[i + 1] || null;
  return { n: L.n, name: L.name, e: L.e, c1: L.c1, c2: L.c2, from: L.from, next: nx ? nx.from : null, nextName: nx ? nx.name : '' };
}

// ---------- الأحداث التي تعطي نقاطاً: pts لكل حدث، وmax أقصى عدد يحتسب في اليوم للعلاقة ----------
const EVENTS = {
  gesture: { pts: 2, max: 20 },     // حركة بين الشريكين
  lmsg: { pts: 1, max: 20 },        // رسالة في غرفة الحب
  note: { pts: 3, max: 5 },         // ملاحظة في ذكرياتنا
  msg: { pts: 2, max: 5},          // رسالة محفوظة في ذكرياتنا
  date: { pts: 15, max: 4 },        // موعد أُنهي بعد 3 دقائق على الأقل
};

// ---------- المهام: per = d يومية | w أسبوعية، ev = الحدث الذي يقدّمها، reward = نقاط عند الإنجاز ----------
const QUESTS = [
  { id: 'd_gest3', per: 'd', ev: 'gesture', goal: 3, reward: 10, e: '🤗', l: 'أرسلا 3 حركات اليوم' },
  { id: 'd_chat10', per: 'd', ev: 'lmsg', goal: 10, reward: 8, e: '💬', l: 'تبادلا 10 رسائل في غرفة الحب' },
  { id: 'd_note1', per: 'd', ev: 'note', goal: 1, reward: 5, e: '📝', l: 'اكتبا ذكرى جديدة اليوم' },
  { id: 'w_date1', per: 'w', ev: 'date', goal: 1, reward: 40, e: '🍽️', l: 'اقضيا موعداً هذا الأسبوع' },
  { id: 'w_gest20', per: 'w', ev: 'gesture', goal: 20, reward: 25, e: '💞', l: 'أرسلا 20 حركة هذا الأسبوع' },
  { id: 'w_mem3', per: 'w', ev: 'msg', goal: 3, reward: 15, e: '💌', l: 'احفظا 3 رسائل في ذكرياتنا' },
];

// ---------- الشارات: k = عدّاد مدى الحياة | time = أيام الارتباط | lvl = مستوى ----------
const BADGES = [
  { id: 'g10', e: '🤗', l: '10 حركات', k: 'gesture', n: 10 },
  { id: 'g100', e: '💞', l: '100 حركة', k: 'gesture', n: 100 },
  { id: 'hug100', e: '🫂', l: '100 عناق', k: 'hug', n: 100 },
  { id: 'd1', e: '🍽️', l: 'أول موعد', k: 'date', n: 1 },
  { id: 'd10', e: '🌹', l: '10 مواعيد', k: 'date', n: 10 },
  { id: 'n10', e: '📖', l: 'كاتبا الذكريات (10 ملاحظات)', k: 'note', n: 10 },
  { id: 'm10', e: '💌', l: 'حافظا الكلام (10 رسائل)', k: 'msg', n: 10 },
  { id: 'c100', e: '💬', l: '100 رسالة في غرفة الحب', k: 'lmsg', n: 100 },
  { id: 't7', e: '📅', l: 'أسبوع معاً', time: 7 },
  { id: 't30', e: '🗓️', l: 'شهر معاً', time: 30 },
  { id: 't365', e: '🎂', l: 'سنة معاً', time: 365 },
  { id: 'l5', e: '💗', l: 'المستوى 5', lvl: 5 },
  { id: 'l10', e: '👑', l: 'المستوى 10', lvl: 10 },
];

// ---------- المخطط (يُستدعى من love.js ضمن نفس الدفعة) ----------
export function ptsTables(env) {
  return [
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rel_points(rel_id INTEGER PRIMARY KEY, pts INTEGER NOT NULL DEFAULT 0, upd INTEGER NOT NULL DEFAULT 0)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_relpts_pts ON rel_points(pts)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rel_point_log(id INTEGER PRIMARY KEY AUTOINCREMENT, rel_id INTEGER NOT NULL, by_id INTEGER NOT NULL, kind TEXT NOT NULL, pts INTEGER NOT NULL, day INTEGER NOT NULL, ts INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ptlog_rel ON rel_point_log(rel_id,day,kind)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rel_stats(rel_id INTEGER NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(rel_id,k))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rel_quest_prog(rel_id INTEGER NOT NULL, qid TEXT NOT NULL, per INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(rel_id,qid,per))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rel_badges(rel_id INTEGER NOT NULL, bid TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(rel_id,bid))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS pts_prefs(user_id INTEGER PRIMARY KEY, show_board INTEGER NOT NULL DEFAULT 0)'),
  ];
}

export const PTS_WANT = {
  rel_points: ['rel_id', 'pts', 'upd'],
  rel_point_log: ['id', 'rel_id', 'by_id', 'kind', 'pts', 'day', 'ts'],
  rel_stats: ['rel_id', 'k', 'n'],
  rel_quest_prog: ['rel_id', 'qid', 'per', 'n', 'done'],
  rel_badges: ['rel_id', 'bid', 'ts'],
  pts_prefs: ['user_id', 'show_board'],
};

// تنظيف دوري: يُستدعى من cleanup في database.js
export function ptsCleanupStmts(env, now) {
  const oldDay = dayOf(now) - 60;
  return [
    env.DB.prepare('DELETE FROM rel_point_log WHERE day<?').bind(oldDay),
    env.DB.prepare('DELETE FROM rel_quest_prog WHERE per<? AND qid LIKE \'d\\_%\' ESCAPE \'\\\'').bind(dayOf(now) - 7),
    env.DB.prepare('DELETE FROM rel_quest_prog WHERE per<? AND qid LIKE \'w\\_%\' ESCAPE \'\\\'').bind(weekOf(dayOf(now)) - 4),
    env.DB.prepare('DELETE FROM rel_points WHERE rel_id NOT IN (SELECT id FROM relationships)'),
    env.DB.prepare('DELETE FROM rel_stats WHERE rel_id NOT IN (SELECT id FROM relationships)'),
    env.DB.prepare('DELETE FROM rel_badges WHERE rel_id NOT IN (SELECT id FROM relationships)'),
    env.DB.prepare('DELETE FROM rel_quest_prog WHERE rel_id NOT IN (SELECT id FROM relationships)'),
    env.DB.prepare('DELETE FROM rel_point_log WHERE rel_id NOT IN (SELECT id FROM relationships)'),
  ];
}

// ---------- أدوات ----------
const dayOf = (ts) => Math.floor((ts + TZ) / DAY);
const weekOf = (day) => Math.floor((day + 3) / 7);   // الأسبوع يبدأ الاثنين (اليوم 4 = الاثنين 1970-01-05)
const notif = (env, uid, text, now) =>
  env.DB.prepare("INSERT INTO notifications(user_id,ty,text,ref,ts) VALUES(?,'info',?,NULL,?)").bind(uid, text, now);
const bothNotif = (env, rel, text, now) => [notif(env, rel.user_a, text, now), notif(env, rel.user_b, text, now)];

async function sameIp(env, a, b) {
  const r = await env.DB.prepare('SELECT x.last_ip p, y.last_ip q FROM users x JOIN users y ON y.id=? WHERE x.id=?').bind(b, a).first();
  return !!(r && r.p && r.q && r.p === r.q);
}

async function getStats(env, relId) {
  const rs = await env.DB.prepare('SELECT k,n FROM rel_stats WHERE rel_id=?').bind(relId).all();
  const o = {};
  for (const x of rs.results) o[x.k] = x.n;
  return o;
}

// يمنح الشارات المستحقة ولم تُمنح بعد، مع إشعار الطرفين. لا يرمي خطأ.
async function checkBadges(env, rel, pts, now) {
  try {
    const [stats, have] = await Promise.all([
      getStats(env, rel.id),
      env.DB.prepare('SELECT bid FROM rel_badges WHERE rel_id=?').bind(rel.id).all(),
    ]);
    const got = new Set(have.results.map((x) => x.bid));
    const lvl = levelInfo(pts).n;
    const days = rel.started_at ? Math.floor((now - rel.started_at) / DAY) : 0;
    const st = [];
    for (const b of BADGES) {
      if (got.has(b.id)) continue;
      const ok = b.k ? (stats[b.k] || 0) >= b.n : b.time ? days >= b.time : lvl >= b.lvl;
      if (!ok) continue;
      st.push(env.DB.prepare('INSERT OR IGNORE INTO rel_badges(rel_id,bid,ts) VALUES(?,?,?)').bind(rel.id, b.id, now));
      st.push(...bothNotif(env, rel, '🏅 شارة جديدة لعلاقتكما: ' + b.e + ' ' + b.l, now));
    }
    if (st.length) await env.DB.batch(st);
  } catch (e) { console.error('badges', (e && e.message) || e); }
}

// ---------- منح النقاط: يُستدعى من الوحدات الأخرى بعد نجاح الحدث ----------
// o = { relId, uid, kind: gesture|lmsg|note|msg|date, gid? }
// لا يرمي أبداً: فشل النقاط يجب ألا يُفشل الحركة أو الرسالة.
export async function award(env, o) {
  try { return await awardInner(env, o); }
  catch (e) { console.error('points', (e && e.message) || e); return null; }
}

async function awardInner(env, o) {
  const ev = EVENTS[o.kind];
  if (!ev || !o.relId || !o.uid) return null;
  const rel = await env.DB.prepare("SELECT id,user_a,user_b,started_at FROM relationships WHERE id=? AND status='active'").bind(o.relId).first();
  if (!rel) return null;
  const partner = rel.user_a === o.uid ? rel.user_b : rel.user_a;
  if (BLOCK_SAME_IP && await sameIp(env, o.uid, partner)) return { blocked: true };

  const now = Date.now(), day = dayOf(now), week = weekOf(day);
  const s = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM rel_point_log WHERE rel_id=? AND day=? AND kind=?) n," +
    " (SELECT COALESCE(SUM(pts),0) FROM rel_point_log WHERE rel_id=? AND day=? AND kind<>'quest') tot," +
    ' (SELECT pts FROM rel_points WHERE rel_id=?) pts'
  ).bind(rel.id, day, o.kind, rel.id, day, rel.id).first();
  const before = s.pts || 0;
  const gain = s.n < ev.max ? Math.max(0, Math.min(ev.pts, DAY_CAP - s.tot)) : 0;

  const up = (k) => env.DB.prepare('INSERT INTO rel_stats(rel_id,k,n) VALUES(?,?,1) ON CONFLICT(rel_id,k) DO UPDATE SET n=n+1').bind(rel.id, k);
  const st = [up(o.kind)];
  if (o.kind === 'gesture' && o.gid === 'hug') st.push(up('hug'));
  if (gain > 0) {
    st.push(env.DB.prepare('INSERT INTO rel_point_log(rel_id,by_id,kind,pts,day,ts) VALUES(?,?,?,?,?,?)').bind(rel.id, o.uid, o.kind, gain, day, now));
    st.push(env.DB.prepare('INSERT INTO rel_points(rel_id,pts,upd) VALUES(?,?,?) ON CONFLICT(rel_id) DO UPDATE SET pts=pts+excluded.pts, upd=excluded.upd').bind(rel.id, gain, now));
  }
  const qs = QUESTS.filter((q) => q.ev === o.kind);
  for (const q of qs) {
    st.push(env.DB.prepare('INSERT INTO rel_quest_prog(rel_id,qid,per,n) VALUES(?,?,?,1) ON CONFLICT(rel_id,qid,per) DO UPDATE SET n=MIN(n+1,?)')
      .bind(rel.id, q.id, q.per === 'd' ? day : week, q.goal));
  }
  await env.DB.batch(st);

  // إنجاز المهام: التحويل إلى done يتم بتعليمة واحدة، فلا تُصرف المكافأة مرتين
  let bonus = 0;
  for (const q of qs) {
    const per = q.per === 'd' ? day : week;
    const x = await env.DB.prepare('UPDATE rel_quest_prog SET done=1 WHERE rel_id=? AND qid=? AND per=? AND done=0 AND n>=?').bind(rel.id, q.id, per, q.goal).run();
    if (x.meta && x.meta.changes === 1) {
      bonus += q.reward;
      await env.DB.batch([
        env.DB.prepare('INSERT INTO rel_point_log(rel_id,by_id,kind,pts,day,ts) VALUES(?,?,?,?,?,?)').bind(rel.id, o.uid, 'quest', q.reward, day, now),
        env.DB.prepare('INSERT INTO rel_points(rel_id,pts,upd) VALUES(?,?,?) ON CONFLICT(rel_id) DO UPDATE SET pts=pts+excluded.pts, upd=excluded.upd').bind(rel.id, q.reward, now),
        ...bothNotif(env, rel, '🎯 أنجزتما مهمة «' + q.l + '» (+' + q.reward + ' نقطة)', now),
      ]);
    }
  }

  const after = before + gain + bonus;
  const l0 = levelInfo(before), l1 = levelInfo(after);
  if (l1.n > l0.n) await env.DB.batch(bothNotif(env, rel, '🎉 ارتقت علاقتكما إلى المستوى ' + l1.n + ': ' + l1.e + ' ' + l1.name, now));
  await checkBadges(env, rel, after, now);
  return { gain, bonus, pts: after, level: l1.n };
}

// ---------- الواجهات ----------
async function ctx(req, env) {
  const u = await currentUser(req, env);
  if (!u) return { err: json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401) };
  if (u.role === 'visitor') return { err: json({ error: 'الزائر لا يستطيع الارتباط. سجّل كعضو.' }, 403) };
  const r = await env.DB.prepare(
    "SELECT id,user_a,user_b,started_at FROM relationships WHERE status='active' AND (user_a=? OR user_b=?) LIMIT 1"
  ).bind(u.id, u.id).first();
  if (!r) return { err: json({ error: 'نقاط الحب متاحة بعد قبول الارتباط' }, 403) };
  return { u, r, partner: r.user_a === u.id ? r.user_b : r.user_a };
}

// ---------- GET /api/rel/points ----------
async function ptsStatus(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const now = Date.now(), day = dayOf(now), week = weekOf(day);
  const p0 = await env.DB.prepare('SELECT pts FROM rel_points WHERE rel_id=?').bind(c.r.id).first();
  const pts = p0 ? p0.pts : 0;
  await checkBadges(env, c.r, pts, now);          // شارات الوقت والمستوى تُمنح عند الفتح أيضاً
  const rs = await env.DB.batch([
    env.DB.prepare("SELECT COALESCE(SUM(pts),0) t FROM rel_point_log WHERE rel_id=? AND day=? AND kind<>'quest'").bind(c.r.id, day),
    env.DB.prepare('SELECT qid,per,n,done FROM rel_quest_prog WHERE rel_id=? AND per IN (?,?)').bind(c.r.id, day, week),
    env.DB.prepare('SELECT bid,ts FROM rel_badges WHERE rel_id=?').bind(c.r.id),
    env.DB.prepare('SELECT show_board FROM pts_prefs WHERE user_id=?').bind(c.u.id),
    env.DB.prepare('SELECT show_board FROM pts_prefs WHERE user_id=?').bind(c.partner),
  ]);
  const prog = {};
  for (const x of rs[1].results) prog[x.qid + ':' + x.per] = x;
  const badgeTs = {};
  for (const x of rs[2].results) badgeTs[x.bid] = x.ts;
  const mine = rs[3].results[0] ? rs[3].results[0].show_board : DEFAULT_SHOW_BOARD;
  const theirs = rs[4].results[0] ? rs[4].results[0].show_board : DEFAULT_SHOW_BOARD;
  return json({
    ok: true,
    pts,
    level: levelInfo(pts),
    levels: LEVELS.map((l) => ({ n: l.n, name: l.name, e: l.e, from: l.from, c1: l.c1, c2: l.c2 })),
    today: { pts: rs[0].results[0] ? rs[0].results[0].t : 0, cap: DAY_CAP },
    quests: QUESTS.map((q) => {
      const x = prog[q.id + ':' + (q.per === 'd' ? day : week)];
      return { id: q.id, per: q.per, e: q.e, l: q.l, goal: q.goal, reward: q.reward, n: x ? x.n : 0, done: x && x.done ? 1 : 0 };
    }),
    badges: BADGES.map((b) => ({ id: b.id, e: b.e, l: b.l, got: badgeTs[b.id] || 0 })),
    show_board: mine ? 1 : 0,
    partner_show_board: theirs ? 1 : 0,
    blocked: BLOCK_SAME_IP ? await sameIp(env, c.u.id, c.partner) : false,
  });
}

// ---------- GET /api/rel/points/top ----------
// لا يظهر زوج إلا إذا فعّل الطرفان «إظهار علاقتنا». للأعضاء المسجّلين فقط.
async function ptsTop(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (u.role === 'visitor') return json({ error: 'اللوحة للأعضاء المسجّلين' }, 403);
  const rs = await env.DB.prepare(
    'SELECT p.rel_id,p.pts,r.user_a,r.user_b,ua.name an,ub.name bn FROM rel_points p ' +
    "JOIN relationships r ON r.id=p.rel_id AND r.status='active' " +
    'JOIN users ua ON ua.id=r.user_a JOIN users ub ON ub.id=r.user_b ' +
    'WHERE p.pts>0 AND COALESCE((SELECT show_board FROM pts_prefs WHERE user_id=r.user_a),' + DEFAULT_SHOW_BOARD + ')=1 ' +
    'AND COALESCE((SELECT show_board FROM pts_prefs WHERE user_id=r.user_b),' + DEFAULT_SHOW_BOARD + ')=1 ' +
    'ORDER BY p.pts DESC, p.rel_id ASC LIMIT ' + TOP_N
  ).all();
  return json({
    ok: true,
    rows: rs.results.map((x, i) => ({
      rank: i + 1, a: x.an, b: x.bn, pts: x.pts, level: levelInfo(x.pts), mine: x.user_a === u.id || x.user_b === u.id,
    })),
  });
}

// ---------- POST /api/rel/points/prefs {show_board} ----------
async function ptsPrefs(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  if (!b || typeof b !== 'object' || !('show_board' in b)) return json({ error: 'طلب غير صالح' }, 400);
  await env.DB.prepare('INSERT INTO pts_prefs(user_id,show_board) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET show_board=excluded.show_board')
    .bind(c.u.id, b.show_board ? 1 : 0).run();
  return json({ ok: true });
}

export const PTS_POST = { '/api/rel/points/prefs': ptsPrefs };
export const PTS_GET = { '/api/rel/points': ptsStatus, '/api/rel/points/top': ptsTop };
