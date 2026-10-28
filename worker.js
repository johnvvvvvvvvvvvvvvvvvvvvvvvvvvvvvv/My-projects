// المرحلة 1: تسجيل الدخول الحقيقي (تسجيل، دخول، زائر، خروج، من أنا)
// المرحلة 2: الغرف العامة المحفوظة في D1 (حفظ 30 يوماً) + المتصلون الحقيقيون
// المرحلة 3: الرسائل الخاصة المحفوظة في D1 (30 يوماً) + غير المقروء + الرسائل المؤقتة
// المرحلة 4: الأصدقاء + الإشعارات + التجاهل + التبليغ + خصوصية الخاص (كلها على الخادم)
// المرحلة 5: تعديل وحذف الرسائل + التفاعلات + التثبيت + الاستطلاعات + الأوامر (/dice /me /poll) + حذف الخاص + فلترة المتجاهَلين في الخادم
const NAME_OK = /^[\p{L}\p{M}\p{N}_\-. ]+$/u;
const RESERVED = /(admin|owner|moderator|operator|ادمن|أدمن|مشرف|صاحب|مبرمج|سوبر)/i;
const DAY = 864e5;
const enc = new TextEncoder();
const ROOMS = ['العامة', 'الخليج', 'مصر', 'المغرب العربي', 'الشباب', 'الثقافة والمنوعات'];
const KEEP = 30 * DAY;      // مدة حفظ الرسائل
const ONLINE_MS = 45000;    // يُعدّ المستخدم متصلاً إن كان آخر نبض خلال 45 ثانية
const MAX_TEXT = 500;
const HISTORY = 15;        // عدد الرسائل القديمة عند دخول الغرفة
const TMP_OK = [30000, 3600000, 86400000]; // مدد الرسائل المؤقتة المسموحة: 30 ث، ساعة، يوم
const PM_HISTORY = 200;    // عدد رسائل الخاص المحمّلة عند الدخول
const MAX_FRIENDS = 200;
const MAX_IGNORES = 300;
const EDIT_MS = 15 * 6e4;   // مهلة تعديل الرسالة
const EMOJI = ['👍', '❤️', '😂', '😮', '😢'];
const LVN = { visitor: 0, member: 1, rankmod: 2, roommod: 3, genmod: 4, super: 5, programmer: 6, owner: 7 };
function lvOf(u) {
  if (u.role === 'member') { const r = u.rank || 0; return r >= 98 ? 5 : r >= 91 ? 4 : r >= 90 ? 2 : 1; }
  return LVN[u.role] || 0;
}
const pwOf = (u) => lvOf(u) * 100 + (u.role === 'member' ? (u.rank || 0) : 0);
function canMod(a, t, min) {
  if (a.id === t.id) return false;
  if (a.role === 'owner') return true;
  if (t.role === 'owner') return false;
  return lvOf(a) >= min && pwOf(a) > pwOf(t);
}
const DEBUG = false;       // true يُظهر سبب خطأ الخادم للتشخيص فقط

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

function serverError(e, where) {
  console.error('ERR ' + where, (e && e.stack) || e);
  const d = String((e && e.message) || e).slice(0, 200);
  return json({ error: DEBUG ? 'خطأ في الخادم [' + where + ': ' + d + ']' : 'خطأ في الخادم' }, 500);
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const rand = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function sha256(s) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

async function hashPass(pass, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 },
    key,
    256
  );
  return hex(bits);
}

function getCookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

async function currentUser(req, env) {
  const tok = getCookie(req, 'sid');
  if (!tok) return null;
  const th = await sha256(tok);
  return await env.DB.prepare(
    'SELECT u.id,u.name,u.role,u.rank,u.age,u.gender,u.country,u.lang,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?'
  ).bind(th, Date.now()).first();
}

async function startSession(env, userId, days = 30) {
  const tok = rand(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .bind(await sha256(tok), userId, now, now + days * DAY).run();
  return 'sid=' + tok + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + days * 86400;
}

async function tooManyAttempts(env, ip) {
  const since = Date.now() - 15 * 6e4;
  await env.DB.prepare('DELETE FROM attempts WHERE ts<?').bind(since).run();
  const r = await env.DB.prepare('SELECT COUNT(*) c FROM attempts WHERE ip=? AND ts>?').bind(ip, since).first();
  return r.c >= 10;
}
const noteAttempt = (env, ip) =>
  env.DB.prepare('INSERT INTO attempts(ip,ts) VALUES(?,?)').bind(ip, Date.now()).run();

async function readBody(req) {
  try { return await req.json(); } catch { return null; }
}

async function register(req, env, ip) {
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const name = String(b.name || '').trim();
  const pass = String(b.password || '');
  const age = parseInt(b.age, 10);
  if (name.length < 2 || name.length > 16) return json({ error: 'الاسم من 2 إلى 16 حرفاً' }, 400);
  if (!NAME_OK.test(name)) return json({ error: 'الاسم يقبل الحروف والأرقام و _ - . فقط' }, 400);
  if (pass.length < 8 || pass.length > 100) return json({ error: 'كلمة المرور من 8 أحرف على الأقل' }, 400);
  if (!(age >= 18 && age <= 99)) return json({ error: 'الموقع للبالغين فقط (18 سنة فما فوق)' }, 400);
  if (await tooManyAttempts(env, ip)) return json({ error: 'محاولات كثيرة، انتظر 15 دقيقة' }, 429);
  await noteAttempt(env, ip);

  const count = (await env.DB.prepare('SELECT COUNT(*) c FROM users').first()).c;
  const first = count === 0; // أول حساب يُسجَّل يصبح صاحب الموقع
  if (!first && RESERVED.test(name)) return json({ error: 'هذا الاسم محجوز' }, 400);

  const salt = rand(16);
  const ph = await hashPass(pass, salt);
  try {
    const r = await env.DB.prepare(
      'INSERT INTO users(name,pass_hash,salt,role,rank,age,gender,country,lang,last_ip,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      name, ph, salt, first ? 'owner' : 'member', first ? 0 : 1, age,
      String(b.gender || '').slice(0, 10), String(b.country || '').slice(0, 30),
      String(b.lang || '').slice(0, 20), ip, Date.now()
    ).run();
    const cookie = await startSession(env, r.meta.last_row_id);
    return json({ ok: true, owner: first }, 200, { 'set-cookie': cookie });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return json({ error: 'الاسم مستخدم، اختر اسماً آخر' }, 409);
    return serverError(e, 'register');
  }
}

async function login(req, env, ip) {
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  if (await tooManyAttempts(env, ip)) return json({ error: 'محاولات كثيرة، انتظر 15 دقيقة' }, 429);
  const u = await env.DB.prepare('SELECT * FROM users WHERE name=?').bind(String(b.name || '').trim()).first();
  const ph = u ? await hashPass(String(b.password || ''), u.salt) : null;
  if (!u || ph !== u.pass_hash) {
    await noteAttempt(env, ip);
    return json({ error: 'الاسم أو كلمة المرور غير صحيحة' }, 401);
  }
  await env.DB.prepare('UPDATE users SET last_ip=? WHERE id=?').bind(ip, u.id).run();
  const cookie = await startSession(env, u.id);
  return json({ ok: true }, 200, { 'set-cookie': cookie });
}

async function guest(req, env, ip) {
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const want = String(b.name || '').trim();
  if (b.adult !== true) return json({ error: 'الموقع للبالغين فقط (18 سنة فما فوق)' }, 400);
  if (want.length < 2 || want.length > 16) return json({ error: 'الاسم من 2 إلى 16 حرفاً' }, 400);
  if (!NAME_OK.test(want)) return json({ error: 'الاسم يقبل الحروف والأرقام و _ - . فقط' }, 400);
  if (RESERVED.test(want)) return json({ error: 'هذا الاسم محجوز' }, 400);
  if (await tooManyAttempts(env, ip)) return json({ error: 'محاولات كثيرة، انتظر 15 دقيقة' }, 429);
  await noteAttempt(env, ip);
  const age = 18;
  const now = Date.now();
  // تنظيف الزوار القدامى الذين انتهت جلساتهم
  await env.DB.prepare(
    "DELETE FROM users WHERE role='visitor' AND created_at<? AND id NOT IN (SELECT user_id FROM sessions WHERE expires_at>?)"
  ).bind(now - DAY, now).run();
  const name = want;
  for (let i = 0; i < 1; i++) {
    const salt = rand(16);
    try {
      const r = await env.DB.prepare(
        'INSERT INTO users(name,pass_hash,salt,role,rank,age,gender,country,lang,last_ip,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(
        name, rand(32), salt, 'visitor', 0, age,
        String(b.gender || '').slice(0, 10), String(b.country || '').slice(0, 30),
        String(b.lang || '').slice(0, 20), ip, now
      ).run();
      const cookie = await startSession(env, r.meta.last_row_id, 1);
      return json({ ok: true }, 200, { 'set-cookie': cookie });
    } catch (e) {
      if (String(e).includes('UNIQUE')) return json({ error: 'الاسم مستخدم، اختر اسماً آخر' }, 409);
      return serverError(e, 'guest');
    }
  }
  return json({ error: 'خطأ في الخادم' }, 500);
}

// ---------- المرحلة 2: الغرف ----------
let schemaP = null;
function ensureSchema(env) {
  if (!schemaP) {
    schemaP = env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, user_id INTEGER NOT NULL, uname TEXT NOT NULL, text TEXT NOT NULL, rn TEXT, rt TEXT, rid INTEGER, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS presence(user_id INTEGER PRIMARY KEY, room TEXT NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS pms(id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, text TEXT NOT NULL, rn TEXT, rt TEXT, rid INTEGER, ts INTEGER NOT NULL, exp INTEGER, read_at INTEGER)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pms_to ON pms(to_id,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pms_from ON pms(from_id,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pms_ts ON pms(ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS friendships(user_id INTEGER NOT NULL, friend_id INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(user_id,friend_id))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS friend_requests(from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(from_id,to_id))'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_freq_to ON friend_requests(to_id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, ty TEXT NOT NULL, text TEXT NOT NULL, ref INTEGER, ts INTEGER NOT NULL, rd INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id,id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS ignores(user_id INTEGER NOT NULL, target_id INTEGER NOT NULL, PRIMARY KEY(user_id,target_id))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS user_prefs(user_id INTEGER PRIMARY KEY, pm TEXT NOT NULL DEFAULT \'all\')'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS user_reports(id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL, target_id INTEGER NOT NULL, reason TEXT NOT NULL, ctx TEXT, ts INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS reactions(scope TEXT NOT NULL, mid INTEGER NOT NULL, user_id INTEGER NOT NULL, emoji TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(scope,mid,user_id))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS poll_votes(mid INTEGER NOT NULL, user_id INTEGER NOT NULL, opt INTEGER NOT NULL, PRIMARY KEY(mid,user_id))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS pins(room TEXT PRIMARY KEY, mid INTEGER NOT NULL, text TEXT NOT NULL, by_id INTEGER NOT NULL, ts INTEGER NOT NULL)'),
    ]).then(() => migrate(env)).then(() => verifySchema(env)).catch((e) => { schemaP = null; throw e; });
  }
  return schemaP;
}

// المرحلة 5: أعمدة جديدة تُضاف للجداول الموجودة (دون حذف أي بيانات)
const MIG = {
  messages: [['ed', 'INTEGER'], ['del', 'INTEGER NOT NULL DEFAULT 0'], ['kind', 'TEXT'], ['pl', 'TEXT'], ['orig', 'TEXT'], ['upd', 'INTEGER NOT NULL DEFAULT 0']],
  pms: [['ed', 'INTEGER'], ['del', 'INTEGER NOT NULL DEFAULT 0'], ['orig', 'TEXT'], ['upd', 'INTEGER NOT NULL DEFAULT 0'], ['del_from', 'INTEGER NOT NULL DEFAULT 0'], ['del_to', 'INTEGER NOT NULL DEFAULT 0']],
};
async function migrate(env) {
  for (const t of Object.keys(MIG)) {
    const cols = (await env.DB.prepare('PRAGMA table_info(' + t + ')').all()).results.map((c) => c.name);
    for (const [c, ty] of MIG[t]) {
      if (cols.includes(c)) continue;
      try { await env.DB.prepare('ALTER TABLE ' + t + ' ADD COLUMN ' + c + ' ' + ty).run(); }
      catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
    }
  }
  await env.DB.batch([
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_messages_upd ON messages(room,upd)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pms_upd ON pms(upd)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_react_mid ON reactions(scope,mid)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_votes_mid ON poll_votes(mid)'),
  ]);
}

// يتحقق أن الجداول بالبنية المطلوبة (جدول قديم بنفس الاسم لا يُستبدل تلقائياً ويسبب أخطاء غامضة)
const WANT = {
  messages: ['id', 'room', 'user_id', 'uname', 'text', 'rn', 'rt', 'rid', 'ts', 'ed', 'del', 'kind', 'pl', 'orig', 'upd'],
  presence: ['user_id', 'room', 'ts'],
  pms: ['id', 'from_id', 'to_id', 'text', 'rn', 'rt', 'rid', 'ts', 'exp', 'read_at', 'ed', 'del', 'orig', 'upd', 'del_from', 'del_to'],
  friendships: ['user_id', 'friend_id', 'ts'],
  friend_requests: ['from_id', 'to_id', 'ts'],
  notifications: ['id', 'user_id', 'ty', 'text', 'ref', 'ts', 'rd', 'done'],
  ignores: ['user_id', 'target_id'],
  user_prefs: ['user_id', 'pm'],
  user_reports: ['id', 'reporter_id', 'target_id', 'reason', 'ctx', 'ts', 'done'],
  reactions: ['scope', 'mid', 'user_id', 'emoji', 'ts'],
  poll_votes: ['mid', 'user_id', 'opt'],
  pins: ['room', 'mid', 'text', 'by_id', 'ts'],
};
async function verifySchema(env) {
  for (const t of Object.keys(WANT)) {
    const cols = (await env.DB.prepare('PRAGMA table_info(' + t + ')').all()).results.map((c) => c.name);
    const miss = WANT[t].filter((c) => !cols.includes(c));
    if (miss.length) throw new Error('SCHEMA: الجدول ' + t + ' قديم وينقصه الأعمدة ' + miss.join(',') + ' — نفّذ DROP TABLE ' + t + ' ثم أعد المحاولة');
  }
}

let lastClean = 0;
async function cleanup(env) {
  const now = Date.now();
  if (now - lastClean < 10 * 6e4) return;
  lastClean = now;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM messages WHERE ts<?').bind(now - KEEP),
    env.DB.prepare('DELETE FROM presence WHERE ts<?').bind(now - DAY),
    env.DB.prepare('DELETE FROM pms WHERE ts<? OR (exp IS NOT NULL AND exp<?)').bind(now - KEEP, now),
    env.DB.prepare('DELETE FROM notifications WHERE ts<?').bind(now - KEEP),
    env.DB.prepare('DELETE FROM friend_requests WHERE ts<?').bind(now - KEEP),
    env.DB.prepare('DELETE FROM pms WHERE del_from=1 AND del_to=1'),
    env.DB.prepare("DELETE FROM reactions WHERE (scope='r' AND mid NOT IN (SELECT id FROM messages)) OR (scope='p' AND mid NOT IN (SELECT id FROM pms))"),
    env.DB.prepare('DELETE FROM poll_votes WHERE mid NOT IN (SELECT id FROM messages)'),
    env.DB.prepare('DELETE FROM pins WHERE mid NOT IN (SELECT id FROM messages)'),
  ]);
}

const cleanText = (v) =>
  String(v || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim();

const GONE = '🚫 تم حذف الرسالة';
const IGN_SQL = 'SELECT target_id FROM ignores WHERE user_id=?';

// يضيف التفاعلات (rx) لقائمة صفوف: scope = 'r' غرف، 'p' خاص
async function attachRx(env, scope, rows) {
  const ids = rows.filter((r) => !r.del).map((r) => r.id);
  rows.forEach((r) => { r.rx = {}; });
  if (!ids.length) return;
  const rx = (await env.DB.prepare('SELECT mid,user_id,emoji FROM reactions WHERE scope=? AND mid IN (' + ids.map(() => '?').join(',') + ')')
    .bind(scope, ...ids).all()).results;
  const map = {};
  rx.forEach((x) => { const m = map[x.mid] || (map[x.mid] = {}); (m[x.emoji] || (m[x.emoji] = [])).push(x.user_id); });
  rows.forEach((r) => { r.rx = map[r.id] || {}; });
}

// يضيف نتائج الاستطلاعات (poll) لصفوف الغرف
async function attachPolls(env, rows) {
  const ps = rows.filter((r) => r.kind === 'poll' && !r.del);
  if (!ps.length) return;
  const vs = (await env.DB.prepare('SELECT mid,user_id,opt FROM poll_votes WHERE mid IN (' + ps.map(() => '?').join(',') + ')')
    .bind(...ps.map((r) => r.id)).all()).results;
  ps.forEach((r) => {
    let opts = [];
    try { opts = JSON.parse(r.pl) || []; } catch { opts = []; }
    r.poll = { o: opts.map((t, i) => ({ t, v: vs.filter((x) => x.mid === r.id && x.opt === i).map((x) => x.user_id) })) };
  });
}

const msgRow = (r, vlv) => {
  const o = {
    id: r.id, user_id: r.user_id, uname: r.uname, role: r.role || 'visitor', rank: r.rank || 0,
    kind: r.kind || null, ts: r.ts, rx: r.rx || {},
  };
  if (r.del) { o.del = 1; o.text = ''; return o; }
  o.text = r.text; o.rn = r.rn; o.rt = r.rt; o.rid = r.rid;
  if (r.ed) o.ed = 1;
  if (r.poll) o.poll = r.poll;
  if (r.orig && vlv >= 5) o.o = r.orig;
  return o;
};

async function poll(req, env, url) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const room = url.searchParams.get('room') || '';
  if (!ROOMS.includes(room)) return json({ error: 'غرفة غير موجودة' }, 400);
  const after = parseInt(url.searchParams.get('after'), 10) || 0;
  const ut = parseInt(url.searchParams.get('ut'), 10) || 0;
  const now = Date.now();
  const vlv = lvOf(u);

  if (url.searchParams.get('hb') === '1') {
    await env.DB.prepare(
      'INSERT INTO presence(user_id,room,ts) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET room=excluded.room, ts=excluded.ts'
    ).bind(u.id, room, now).run();
  }

  // المتجاهَلون لا تصل رسائلهم من الخادم أصلاً (يُفلتَر هنا وليس في المتصفح)
  const sel = 'SELECT m.id,m.user_id,m.uname,m.text,m.rn,m.rt,m.rid,m.ts,m.kind,m.ed,m.del,m.pl,m.orig,u.role,u.rank FROM messages m LEFT JOIN users u ON u.id=m.user_id ';
  const ign = ' AND m.user_id NOT IN (' + IGN_SQL + ') ';
  let msgs;
  if (after > 0) {
    msgs = (await env.DB.prepare(sel + 'WHERE m.room=? AND m.id>? AND m.ts>?' + ign + 'ORDER BY m.id LIMIT 100')
      .bind(room, after, now - KEEP, u.id).all()).results;
  } else {
    msgs = (await env.DB.prepare(sel + 'WHERE m.room=? AND m.ts>?' + ign + 'ORDER BY m.id DESC LIMIT ' + HISTORY)
      .bind(room, now - KEEP, u.id).all()).results.reverse();
  }
  // رسائل قديمة تغيّرت (تعديل/حذف/تفاعل/تصويت) منذ آخر نبضة
  let upd = [];
  if (after > 0 && ut > 0) {
    upd = (await env.DB.prepare(sel + 'WHERE m.room=? AND m.id<=? AND m.upd>? AND m.ts>?' + ign + 'ORDER BY m.upd LIMIT 100')
      .bind(room, after, ut, now - KEEP, u.id).all()).results;
  }
  const all = msgs.concat(upd);
  await attachRx(env, 'r', all);
  await attachPolls(env, all);

  const online = (await env.DB.prepare(
    'SELECT u.id,u.name,u.role,u.rank,u.age,u.gender,u.country,u.lang,u.created_at,p.room FROM presence p JOIN users u ON u.id=p.user_id WHERE p.ts>? ORDER BY p.ts DESC LIMIT 300'
  ).bind(now - ONLINE_MS).all()).results;
  const pin = await env.DB.prepare('SELECT text FROM pins WHERE room=?').bind(room).first();
  const out = { msgs: msgs.map((r) => msgRow(r, vlv)), upd: upd.map((r) => msgRow(r, vlv)), pin: pin ? pin.text : null, online, now };
  const paRaw = url.searchParams.get('pa');
  if (paRaw !== null) out.pm = await pmFetch(env, u.id, parseInt(paRaw, 10) || 0, url.searchParams.get('pf') === '1', now, parseInt(url.searchParams.get('pu'), 10) || 0, vlv);
  const naRaw = url.searchParams.get('na');
  if (naRaw !== null) out.soc = await socFetch(env, u.id, parseInt(naRaw, 10) || 0, url.searchParams.get('sf') === '1', now);
  return json(out);
}

// ---------- المرحلة 3: الرسائل الخاصة ----------
async function pmFetch(env, me, pa, first, now, pu, vlv) {
  const cols = 'id,from_id,to_id,text,rn,rt,rid,ts,exp,ed,del,orig';
  // يُستثنى: ما مسحتُه من عندي، ورسائل من أتجاهلهم
  const base = 'SELECT ' + cols + ' FROM pms WHERE (from_id=? OR to_id=?) AND ts>? AND (exp IS NULL OR exp>?)' +
    ' AND NOT (from_id=? AND del_from=1) AND NOT (to_id=? AND del_to=1)' +
    ' AND NOT (to_id=? AND from_id IN (' + IGN_SQL + ')) ';
  const bb = [me, me, now - KEEP, now, me, me, me, me];
  let rows, upd = [], unread = null;
  if (first) {
    rows = (await env.DB.prepare(base + 'ORDER BY id DESC LIMIT ' + PM_HISTORY).bind(...bb).all()).results.reverse();
    const un = (await env.DB.prepare(
      'SELECT from_id, COUNT(*) c FROM pms WHERE to_id=? AND read_at IS NULL AND del=0 AND del_to=0 AND ts>? AND (exp IS NULL OR exp>?)' +
      ' AND from_id NOT IN (' + IGN_SQL + ') GROUP BY from_id'
    ).bind(me, now - KEEP, now, me).all()).results;
    unread = {};
    un.forEach((x) => { unread[x.from_id] = x.c; });
  } else {
    rows = (await env.DB.prepare(base + 'AND id>? ORDER BY id LIMIT 100').bind(...bb, pa).all()).results;
    if (pu > 0) {
      upd = (await env.DB.prepare(base + 'AND id<=? AND upd>? ORDER BY upd LIMIT 100').bind(...bb, pa, pu).all()).results;
    }
  }
  const all = rows.concat(upd);
  await attachRx(env, 'p', all);
  const clean = (r) => {
    const o = { id: r.id, from_id: r.from_id, to_id: r.to_id, ts: r.ts, exp: r.exp, rx: r.rx || {} };
    if (r.del) { o.del = 1; o.text = ''; return o; }
    o.text = r.text; o.rn = r.rn; o.rt = r.rt; o.rid = r.rid;
    if (r.ed) o.ed = 1;
    if (r.orig && vlv >= 5) o.o = r.orig;
    return o;
  };
  const ids = new Set();
  rows.forEach((r) => ids.add(r.from_id === me ? r.to_id : r.from_id));
  if (unread) Object.keys(unread).forEach((k) => ids.add(parseInt(k, 10)));
  const list = [...ids].slice(0, 90);
  let peers = [];
  if (list.length) {
    peers = (await env.DB.prepare(
      'SELECT id,name,role,rank,age,gender,country,lang,created_at FROM users WHERE id IN (' + list.map(() => '?').join(',') + ')'
    ).bind(...list).all()).results;
  }
  return { rows: rows.map(clean), upd: upd.map(clean), peers, unread };
}

async function pmSend(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (u.role === 'visitor') return json({ error: 'الزائر لا يستطيع إرسال رسائل خاصة. سجّل كعضو.' }, 403);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const to = parseInt(b.to, 10);
  if (!to || to === u.id) return json({ error: 'مستلم غير صالح' }, 400);
  const text = cleanText(b.text);
  if (!text) return json({ error: 'الرسالة فارغة' }, 400);
  if (text.length > MAX_TEXT) return json({ error: 'الرسالة طويلة (الحد ' + MAX_TEXT + ' حرف)' }, 400);
  const t = await env.DB.prepare('SELECT id,role FROM users WHERE id=?').bind(to).first();
  if (!t) return json({ error: 'المستخدم غير موجود' }, 404);
  if (t.role === 'visitor') return json({ error: 'لا يمكن مراسلة زائر' }, 400);
  if (u.role !== 'owner') {
    const g = await env.DB.prepare(
      'SELECT (SELECT pm FROM user_prefs WHERE user_id=?) p, (SELECT 1 FROM friendships WHERE user_id=? AND friend_id=?) f'
    ).bind(to, to, u.id).first();
    if (g.p === 'none') return json({ error: 'هذا المستخدم لا يستقبل رسائل خاصة' }, 403);
    if (g.p === 'friends' && !g.f) return json({ error: 'هذا المستخدم يستقبل الخاص من أصدقائه فقط' }, 403);
  }

  const now = Date.now();
  const r = await env.DB.prepare('SELECT COUNT(*) c FROM pms WHERE from_id=? AND ts>?').bind(u.id, now - 5000).first();
  if (r.c >= 4) return json({ error: 'أبطئ قليلاً، رسائلك كثيرة' }, 429);

  const ms = parseInt(b.exp, 10);
  const exp = TMP_OK.includes(ms) ? now + ms : null;
  let rn = null, rt = null, rid = null;
  if (b.reply && typeof b.reply === 'object') {
    rn = String(b.reply.n || '').slice(0, 16);
    rt = String(b.reply.t || '').slice(0, 60);
    rid = parseInt(b.reply.id, 10) || null;
    if (!rt) { rn = null; rt = null; rid = null; }
  }
  const ins = await env.DB.prepare('INSERT INTO pms(from_id,to_id,text,rn,rt,rid,ts,exp) VALUES(?,?,?,?,?,?,?,?)')
    .bind(u.id, to, text, rn, rt, rid, now, exp).run();
  await cleanup(env);
  return json({ ok: true, id: ins.meta.last_row_id, ts: now, exp });
}

async function pmRead(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const b = await readBody(req);
  const peer = b ? parseInt(b.peer, 10) : 0;
  if (!peer) return json({ error: 'طلب غير صالح' }, 400);
  await env.DB.prepare('UPDATE pms SET read_at=? WHERE to_id=? AND from_id=? AND read_at IS NULL').bind(Date.now(), u.id, peer).run();
  return json({ ok: true });
}

async function pmClear(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const b = await readBody(req);
  const peer = b ? parseInt(b.peer, 10) : 0;
  if (!peer) return json({ error: 'طلب غير صالح' }, 400);
  const now = Date.now();
  // يُخفي المحادثة من عندي فقط، ويبقى الطرف الآخر محتفظاً بنسخته
  await env.DB.batch([
    env.DB.prepare('UPDATE pms SET del_from=1 WHERE from_id=? AND to_id=?').bind(u.id, peer),
    env.DB.prepare('UPDATE pms SET del_to=1, read_at=COALESCE(read_at,?) WHERE to_id=? AND from_id=?').bind(now, u.id, peer),
  ]);
  return json({ ok: true });
}

// ---------- المرحلة 4: الأصدقاء والإشعارات والتجاهل والتبليغ ----------
async function socFetch(env, me, na, first, now) {
  const fr = (await env.DB.prepare(
    'SELECT u.id,u.name,u.role,u.rank,0 k FROM friendships f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? ' +
    'UNION ALL SELECT to_id,NULL,NULL,NULL,1 FROM friend_requests WHERE from_id=?'
  ).bind(me, me).all()).results;
  const out = {
    friends: fr.filter((x) => x.k === 0).map((x) => ({ id: x.id, name: x.name, role: x.role, rank: x.rank })),
    sent: fr.filter((x) => x.k === 1).map((x) => x.id),
  };
  const nsel = 'SELECT n.id,n.ty,n.text,n.ref,n.ts,n.rd,n.done,u.name rname,u.role rrole,u.rank rrank FROM notifications n LEFT JOIN users u ON u.id=n.ref WHERE n.user_id=? ';
  if (first) {
    out.notifs = (await env.DB.prepare(nsel + 'AND n.ts>? ORDER BY n.id DESC LIMIT 50').bind(me, now - KEEP).all()).results.reverse();
    out.ign = (await env.DB.prepare(
      'SELECT u.id,u.name,u.role,u.rank FROM ignores i JOIN users u ON u.id=i.target_id WHERE i.user_id=? LIMIT ' + MAX_IGNORES
    ).bind(me).all()).results;
    const p = await env.DB.prepare('SELECT pm FROM user_prefs WHERE user_id=?').bind(me).first();
    out.pref = p ? p.pm : null;
  } else {
    out.notifs = (await env.DB.prepare(nsel + 'AND n.id>? ORDER BY n.id LIMIT 50').bind(me, na).all()).results;
  }
  return out;
}

const addNotif = (env, userId, ty, text, ref, now) =>
  env.DB.prepare('INSERT INTO notifications(user_id,ty,text,ref,ts) VALUES(?,?,?,?,?)').bind(userId, ty, text, ref, now);

// دفعة قبول الصداقة: me يقبل طلب from
function acceptBatch(env, me, from, now) {
  return [
    env.DB.prepare('INSERT OR IGNORE INTO friendships(user_id,friend_id,ts) VALUES(?,?,?)').bind(me.id, from, now),
    env.DB.prepare('INSERT OR IGNORE INTO friendships(user_id,friend_id,ts) VALUES(?,?,?)').bind(from, me.id, now),
    env.DB.prepare('DELETE FROM friend_requests WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)').bind(from, me.id, me.id, from),
    env.DB.prepare("UPDATE notifications SET done=1 WHERE ty='req' AND ((user_id=? AND ref=?) OR (user_id=? AND ref=?))").bind(me.id, from, from, me.id),
    addNotif(env, from, 'friend', me.name + ' قَبِل طلب صداقتك', me.id, now),
  ];
}

async function friendRequest(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (u.role === 'visitor') return json({ error: 'الزائر لا يستطيع إضافة أصدقاء. سجّل كعضو.' }, 403);
  const b = await readBody(req);
  const to = b ? parseInt(b.to, 10) : 0;
  if (!to || to === u.id) return json({ error: 'طلب غير صالح' }, 400);
  const t = await env.DB.prepare('SELECT id,role FROM users WHERE id=?').bind(to).first();
  if (!t) return json({ error: 'المستخدم غير موجود' }, 404);
  if (t.role === 'visitor') return json({ error: 'لا يمكن إضافة زائر' }, 400);
  const now = Date.now();
  const s = await env.DB.prepare(
    'SELECT (SELECT 1 FROM friendships WHERE user_id=? AND friend_id=?) fr,' +
    ' (SELECT 1 FROM friend_requests WHERE from_id=? AND to_id=?) mine,' +
    ' (SELECT 1 FROM friend_requests WHERE from_id=? AND to_id=?) theirs,' +
    ' (SELECT 1 FROM ignores WHERE user_id=? AND target_id=?) ig,' +
    ' (SELECT COUNT(*) FROM friend_requests WHERE from_id=? AND ts>?) recent,' +
    ' (SELECT COUNT(*) FROM friendships WHERE user_id=?) cnt'
  ).bind(u.id, to, u.id, to, to, u.id, to, u.id, u.id, now - 6e4, u.id).first();
  if (s.fr) return json({ ok: true, friends: true });
  if (s.theirs) { // طلب متبادل: يصبحان صديقين فوراً
    if (s.cnt >= MAX_FRIENDS) return json({ error: 'وصلت للحد الأقصى من الأصدقاء (' + MAX_FRIENDS + ')' }, 400);
    await env.DB.batch(acceptBatch(env, u, to, now));
    return json({ ok: true, friends: true });
  }
  if (s.mine) return json({ ok: true });
  if (s.recent >= 10) return json({ error: 'أبطئ قليلاً، طلبات كثيرة' }, 429);
  if (s.ig) return json({ ok: true }); // المستلم يتجاهلك: لا يصله شيء ولا نخبرك
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO friend_requests(from_id,to_id,ts) VALUES(?,?,?)').bind(u.id, to, now),
    addNotif(env, to, 'req', u.name + ' يريد إضافتك كصديق', u.id, now),
  ]);
  return json({ ok: true });
}

async function friendAccept(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  const from = b ? parseInt(b.from, 10) : 0;
  if (!from) return json({ error: 'طلب غير صالح' }, 400);
  const s = await env.DB.prepare(
    'SELECT (SELECT 1 FROM friend_requests WHERE from_id=? AND to_id=?) r, (SELECT COUNT(*) FROM friendships WHERE user_id=?) cnt'
  ).bind(from, u.id, u.id).first();
  if (!s.r) return json({ error: 'الطلب غير موجود أو أُلغي' }, 404);
  if (s.cnt >= MAX_FRIENDS) return json({ error: 'وصلت للحد الأقصى من الأصدقاء (' + MAX_FRIENDS + ')' }, 400);
  await env.DB.batch(acceptBatch(env, u, from, Date.now()));
  return json({ ok: true });
}

async function friendDecline(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const b = await readBody(req);
  const from = b ? parseInt(b.from, 10) : 0;
  if (!from) return json({ error: 'طلب غير صالح' }, 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM friend_requests WHERE from_id=? AND to_id=?').bind(from, u.id),
    env.DB.prepare("UPDATE notifications SET done=1 WHERE ty='req' AND user_id=? AND ref=?").bind(u.id, from),
  ]);
  return json({ ok: true });
}

async function friendRemove(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM friendships WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)').bind(u.id, id, id, u.id),
    env.DB.prepare('DELETE FROM friend_requests WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)').bind(u.id, id, id, u.id),
  ]);
  return json({ ok: true });
}

async function notifRead(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  await env.DB.prepare('UPDATE notifications SET rd=1 WHERE user_id=? AND rd=0').bind(u.id).run();
  return json({ ok: true });
}

async function ignoreSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const b = await readBody(req);
  if (!b || !Array.isArray(b.ids)) return json({ error: 'طلب غير صالح' }, 400);
  const ids = [...new Set(b.ids.map((x) => parseInt(x, 10)).filter((x) => x > 0 && x !== u.id))];
  if (ids.length > MAX_IGNORES) return json({ error: 'قائمة التجاهل كبيرة (الحد ' + MAX_IGNORES + ')' }, 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ignores WHERE user_id=?').bind(u.id),
    ...ids.map((x) => env.DB.prepare('INSERT OR IGNORE INTO ignores(user_id,target_id) VALUES(?,?)').bind(u.id, x)),
  ]);
  return json({ ok: true, n: ids.length });
}

async function prefsSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const b = await readBody(req);
  const pm = b ? String(b.pm || '') : '';
  if (!['all', 'friends', 'none'].includes(pm)) return json({ error: 'قيمة غير صالحة' }, 400);
  await env.DB.prepare('INSERT INTO user_prefs(user_id,pm) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET pm=excluded.pm').bind(u.id, pm).run();
  return json({ ok: true });
}

async function reportUser(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const b = await readBody(req);
  const target = b ? parseInt(b.target, 10) : 0;
  const reason = cleanText(b && b.reason).slice(0, 200);
  if (!target || target === u.id) return json({ error: 'طلب غير صالح' }, 400);
  if (!reason) return json({ error: 'اكتب سبب البلاغ' }, 400);
  const t = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(target).first();
  if (!t) return json({ error: 'المستخدم غير موجود' }, 404);
  const now = Date.now();
  const r = await env.DB.prepare('SELECT COUNT(*) c FROM user_reports WHERE reporter_id=? AND ts>?').bind(u.id, now - 6e4).first();
  if (r.c >= 5) return json({ error: 'أبطئ قليلاً، بلاغات كثيرة' }, 429);
  await env.DB.prepare('INSERT INTO user_reports(reporter_id,target_id,reason,ctx,ts) VALUES(?,?,?,?,?)')
    .bind(u.id, target, reason, String((b && b.ctx) || '').slice(0, 20), now).run();
  return json({ ok: true });
}

// ---------- المرحلة 5: التفاعل مع الرسائل ----------
async function postMsg(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const room = String(b.room || '');
  if (!ROOMS.includes(room)) return json({ error: 'غرفة غير موجودة' }, 400);
  let text = cleanText(b.text);
  if (!text) return json({ error: 'الرسالة فارغة' }, 400);
  if (text.length > MAX_TEXT) return json({ error: 'الرسالة طويلة (الحد ' + MAX_TEXT + ' حرف)' }, 400);

  const now = Date.now();
  const r = await env.DB.prepare('SELECT COUNT(*) c FROM messages WHERE user_id=? AND ts>?').bind(u.id, now - 5000).first();
  if (r.c >= 4) return json({ error: 'أبطئ قليلاً، رسائلك كثيرة' }, 429);

  // الأوامر: تُنفَّذ في الخادم (النرد عشوائي حقيقي، والاستطلاع للمشرفين فقط)
  let kind = null, pl = null;
  const cm = text.match(/^\/(dice|me|poll)(?:\s+([\s\S]*))?$/);
  if (cm) {
    const arg = (cm[2] || '').trim();
    if (cm[1] === 'dice') {
      kind = 'sys';
      text = '🎲 ' + u.name + ' رمى النرد: ' + (1 + crypto.getRandomValues(new Uint32Array(1))[0] % 6);
    } else if (cm[1] === 'me') {
      if (!arg) return json({ error: 'اكتب نصاً بعد /me' }, 400);
      kind = 'sys';
      text = '* ' + u.name + ' ' + arg;
    } else {
      if (lvOf(u) < 3) return json({ error: 'أمر الاستطلاع للمشرفين فقط' }, 403);
      const p = arg.split('|').map((x) => x.trim()).filter(Boolean);
      if (p.length < 3) return json({ error: 'الصيغة: /poll السؤال | خيار1 | خيار2' }, 400);
      kind = 'poll';
      text = '📊 ' + p[0].slice(0, 120);
      pl = JSON.stringify(p.slice(1, 6).map((x) => x.slice(0, 40)));
    }
  }

  let rn = null, rt = null, rid = null;
  if (!kind && b.reply && typeof b.reply === 'object') {
    rn = String(b.reply.n || '').slice(0, 16);
    rt = String(b.reply.t || '').slice(0, 60);
    rid = parseInt(b.reply.id, 10) || null;
    if (!rt) { rn = null; rt = null; rid = null; }
  }
  const ins = await env.DB.prepare('INSERT INTO messages(room,user_id,uname,text,rn,rt,rid,ts,kind,pl,upd) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(room, u.id, u.name, text, rn, rt, rid, now, kind, pl, 0).run();
  await env.DB.prepare(
    'INSERT INTO presence(user_id,room,ts) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET room=excluded.room, ts=excluded.ts'
  ).bind(u.id, room, now).run();
  await cleanup(env);
  return json({ ok: true, id: ins.meta.last_row_id, ts: now, kind });
}

// يجلب رسالة غرفة (scope r) أو خاص (scope p) مع بيانات صاحبها
async function loadMsg(env, scope, id) {
  if (scope === 'p') return await env.DB.prepare('SELECT id,from_id user_id,to_id,text,ts,del,NULL kind,NULL role,NULL rank FROM pms WHERE id=?').bind(id).first();
  return await env.DB.prepare('SELECT m.id,m.user_id,m.room,m.text,m.ts,m.del,m.kind,u.role,u.rank FROM messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.id=?').bind(id).first();
}

async function msgEdit(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  const scope = b && b.scope === 'p' ? 'p' : 'r';
  const text = cleanText(b && b.text);
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  if (!text) return json({ error: 'الرسالة فارغة' }, 400);
  if (text.length > MAX_TEXT) return json({ error: 'الرسالة طويلة (الحد ' + MAX_TEXT + ' حرف)' }, 400);
  const m = await loadMsg(env, scope, id);
  if (!m || m.del) return json({ error: 'الرسالة غير موجودة' }, 404);
  if (m.user_id !== u.id) return json({ error: 'لا يمكنك تعديل رسالة غيرك' }, 403);
  if (m.kind) return json({ error: 'لا يمكن تعديل هذه الرسالة' }, 400);
  const now = Date.now();
  if (now - m.ts > EDIT_MS) return json({ error: 'انتهت مهلة التعديل (15 دقيقة)' }, 403);
  if (m.text === text) return json({ ok: true });
  const tb = scope === 'p' ? 'pms' : 'messages';
  await env.DB.prepare('UPDATE ' + tb + ' SET text=?, ed=1, orig=COALESCE(orig,?), upd=? WHERE id=?').bind(text, m.text, now, id).run();
  return json({ ok: true });
}

async function msgDelete(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  const scope = b && b.scope === 'p' ? 'p' : 'r';
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const m = await loadMsg(env, scope, id);
  if (!m) return json({ error: 'الرسالة غير موجودة' }, 404);
  if (m.del) return json({ ok: true });
  if (m.user_id !== u.id) {
    // الخاص: لصاحب الرسالة فقط. الغرف: مشرف أعلى رتبة (المستوى 2 فأعلى)
    if (scope === 'p' || !canMod(u, { id: m.user_id, role: m.role || 'visitor', rank: m.rank || 0 }, 2)) {
      return json({ error: 'غير مسموح لك بحذف هذه الرسالة' }, 403);
    }
  }
  const now = Date.now();
  const st = [];
  if (scope === 'p') {
    st.push(env.DB.prepare("UPDATE pms SET del=1, text='', rn=NULL, rt=NULL, orig=NULL, upd=? WHERE id=?").bind(now, id));
  } else {
    st.push(env.DB.prepare("UPDATE messages SET del=1, text='', rn=NULL, rt=NULL, pl=NULL, orig=NULL, upd=? WHERE id=?").bind(now, id));
    st.push(env.DB.prepare('DELETE FROM poll_votes WHERE mid=?').bind(id));
    st.push(env.DB.prepare('DELETE FROM pins WHERE mid=?').bind(id));
  }
  st.push(env.DB.prepare('DELETE FROM reactions WHERE scope=? AND mid=?').bind(scope, id));
  await env.DB.batch(st);
  return json({ ok: true });
}

async function msgReact(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  const scope = b && b.scope === 'p' ? 'p' : 'r';
  const e = String((b && b.e) || '');
  if (!id || !EMOJI.includes(e)) return json({ error: 'طلب غير صالح' }, 400);
  const m = await loadMsg(env, scope, id);
  if (!m || m.del) return json({ error: 'الرسالة غير موجودة' }, 404);
  if (scope === 'p' && m.user_id !== u.id && m.to_id !== u.id) return json({ error: 'غير مسموح' }, 403);
  if (m.kind === 'sys') return json({ error: 'لا تفاعل على هذه الرسالة' }, 400);
  const now = Date.now();
  const rc = await env.DB.prepare('SELECT COUNT(*) c FROM reactions WHERE user_id=? AND ts>?').bind(u.id, now - 10000).first();
  if (rc.c >= 20) return json({ error: 'أبطئ قليلاً' }, 429);
  const cur = await env.DB.prepare('SELECT emoji FROM reactions WHERE scope=? AND mid=? AND user_id=?').bind(scope, id, u.id).first();
  const tb = scope === 'p' ? 'pms' : 'messages';
  const st = [];
  if (cur && cur.emoji === e) st.push(env.DB.prepare('DELETE FROM reactions WHERE scope=? AND mid=? AND user_id=?').bind(scope, id, u.id));
  else st.push(env.DB.prepare('INSERT INTO reactions(scope,mid,user_id,emoji,ts) VALUES(?,?,?,?,?) ON CONFLICT(scope,mid,user_id) DO UPDATE SET emoji=excluded.emoji, ts=excluded.ts').bind(scope, id, u.id, e, now));
  st.push(env.DB.prepare('UPDATE ' + tb + ' SET upd=? WHERE id=?').bind(now, id));
  await env.DB.batch(st);
  return json({ ok: true });
}

async function msgVote(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  const opt = b ? parseInt(b.opt, 10) : -1;
  if (!id || !(opt >= 0)) return json({ error: 'طلب غير صالح' }, 400);
  const m = await env.DB.prepare('SELECT kind,del,pl FROM messages WHERE id=?').bind(id).first();
  if (!m || m.del || m.kind !== 'poll') return json({ error: 'الاستطلاع غير موجود' }, 404);
  let n = 0;
  try { n = (JSON.parse(m.pl) || []).length; } catch { n = 0; }
  if (opt >= n) return json({ error: 'خيار غير صالح' }, 400);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO poll_votes(mid,user_id,opt) VALUES(?,?,?) ON CONFLICT(mid,user_id) DO UPDATE SET opt=excluded.opt').bind(id, u.id, opt),
    env.DB.prepare('UPDATE messages SET upd=? WHERE id=?').bind(now, id),
  ]);
  return json({ ok: true });
}

async function pinSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (lvOf(u) < 3) return json({ error: 'التثبيت للمشرفين فقط' }, 403);
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  const m = id ? await env.DB.prepare('SELECT id,room,text,del,kind FROM messages WHERE id=?').bind(id).first() : null;
  if (!m || m.del || m.kind === 'sys') return json({ error: 'الرسالة غير موجودة' }, 404);
  await env.DB.prepare('INSERT INTO pins(room,mid,text,by_id,ts) VALUES(?,?,?,?,?) ON CONFLICT(room) DO UPDATE SET mid=excluded.mid, text=excluded.text, by_id=excluded.by_id, ts=excluded.ts')
    .bind(m.room, m.id, m.text.slice(0, 300), u.id, Date.now()).run();
  return json({ ok: true });
}

async function pinClear(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (lvOf(u) < 3) return json({ error: 'التثبيت للمشرفين فقط' }, 403);
  const b = await readBody(req);
  const room = String((b && b.room) || '');
  if (!ROOMS.includes(room)) return json({ error: 'غرفة غير موجودة' }, 400);
  await env.DB.prepare('DELETE FROM pins WHERE room=?').bind(room).run();
  return json({ ok: true });
}

async function logout(req, env) {
  const tok = getCookie(req, 'sid');
  if (tok) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(tok)).run();
  return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (req.method !== 'GET') {
      const o = req.headers.get('origin');
      let bad = false;
      try { bad = !!o && new URL(o).host !== url.host; } catch { bad = true; }
      if (bad) return json({ error: 'مرفوض' }, 403);
    }
    try {
      if (url.pathname === '/api/health') return json({ ok: true });
      if (req.method === 'POST' && url.pathname === '/api/register') return await register(req, env, ip);
      if (req.method === 'POST' && url.pathname === '/api/login') return await login(req, env, ip);
      if (req.method === 'POST' && url.pathname === '/api/guest') return await guest(req, env, ip);
      if (req.method === 'POST' && url.pathname === '/api/logout') return await logout(req, env);
      const SOC_POST = { '/api/friend/request': friendRequest, '/api/friend/accept': friendAccept, '/api/friend/decline': friendDecline,
        '/api/friend/remove': friendRemove, '/api/notif/read': notifRead, '/api/ignore/set': ignoreSet, '/api/prefs/set': prefsSet, '/api/report': reportUser };
      Object.assign(SOC_POST, { '/api/msg/edit': msgEdit, '/api/msg/delete': msgDelete, '/api/msg/react': msgReact, '/api/msg/vote': msgVote,
        '/api/pin/set': pinSet, '/api/pin/clear': pinClear, '/api/pm/clear': pmClear });
      if (['/api/poll', '/api/post', '/api/pm/send', '/api/pm/read'].includes(url.pathname) || SOC_POST[url.pathname]) {
        await ensureSchema(env);
        if (req.method === 'POST' && SOC_POST[url.pathname]) return await SOC_POST[url.pathname](req, env);
        if (req.method === 'POST' && url.pathname === '/api/pm/send') return await pmSend(req, env);
        if (req.method === 'POST' && url.pathname === '/api/pm/read') return await pmRead(req, env);
        if (req.method === 'GET' && url.pathname === '/api/poll') return await poll(req, env, url);
        if (req.method === 'POST' && url.pathname === '/api/post') return await postMsg(req, env);
      }
      if (req.method === 'GET' && url.pathname === '/api/me') {
        const u = await currentUser(req, env);
        return u ? json({ user: u }) : json({ user: null }, 401);
      }
      return json({ error: 'غير موجود' }, 404);
    } catch (e) {
      return serverError(e, url.pathname);
    }
  },
};
