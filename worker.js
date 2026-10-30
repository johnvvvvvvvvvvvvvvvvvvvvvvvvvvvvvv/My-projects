// المرحلة 1: تسجيل الدخول الحقيقي (تسجيل، دخول، زائر، خروج، من أنا)
// المرحلة 2: الغرف العامة المحفوظة في D1 (حفظ 30 يوماً) + المتصلون الحقيقيون
// المرحلة 3: الرسائل الخاصة المحفوظة في D1 (30 يوماً) + غير المقروء + الرسائل المؤقتة
// المرحلة 4: الأصدقاء + الإشعارات + التجاهل + التبليغ + خصوصية الخاص (كلها على الخادم)
// المرحلة 5: تعديل وحذف الرسائل + التفاعلات + التثبيت + الاستطلاعات + الأوامر (/dice /me /poll) + حذف الخاص + فلترة المتجاهَلين في الخادم
// المرحلة 6أ: أساس الإدارة (جدول العقوبات + سجل الإجراءات + فحص الصلاحية في الخادم)
// المرحلة 6ب: الكتم والطرد والحظر (تُفرض عند الإرسال والدخول للغرفة وتسجيل الدخول)
// المرحلة 6هـ: شاشة البلاغات + سجل الإجراءات + العقوبات الفعّالة + سجل عقوبات المستخدم + الملاحظات السرية + الإحصائيات (كلها من الخادم)
// المرحلة 6د: مشرف الغرفة (room_mods) + أوضاع الغرفة (room_modes: عادي/بطيء/قراءة فقط) تُفرض في الخادم
// المرحلة 6و: حظر الجهاز/IP (بمدة إلزامية وبلا سقف) + اقتراح الحظر + التظلّمات + الحسابات المرتبطة بالعنوان
// المرحلة 6ج: التحذير + الرتب + سحب الصلاحيات + حذف رسائل مستخدم + إجبار تغيير الاسم + نقل لغرفة (لا حظر دائم: كل حظر بمدة)
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
  const b = lvBase(u);
  return u.lvx && !u.rv && u.lvx > b ? u.lvx : b; // lvx = رفع مؤقت لمشرف الغرفة داخل غرفته فقط
}
function lvBase(u) {
  if (u.rv && u.role !== 'owner') return u.role === 'visitor' ? 0 : 1; // سُحبت صلاحياته مؤقتاً
  if (u.role === 'member') { const r = u.rank || 0; return r >= 98 ? 5 : r >= 91 ? 4 : r >= 90 ? 2 : 1; }
  return LVN[u.role] || 0;
}
const pwOf = (u) => u.rv && u.role !== 'owner' ? lvOf(u) * 100 : lvOf(u) * 100 + (u.role === 'member' ? (u.rank || 0) : 0);
// سقف الرتبة التي يحق للمستخدم منحها (كما في الواجهة)
const capOf = (u) => u.role === 'owner' ? 100 : u.role === 'programmer' ? 90 : lvOf(u) >= 5 ? 40 : lvOf(u) === 4 ? 20 : 0;
function canMod(a, t, min) {
  if (a.id === t.id) return false;
  if (a.role === 'owner') return true;
  if (t.role === 'owner') return false;
  return lvOf(a) >= min && pwOf(a) > pwOf(t);
}
const DEBUG = true;       // true يُظهر سبب خطأ الخادم للتشخيص فقط

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
    "SELECT u.id,u.name,u.role,u.rank,u.age,u.gender,u.country,u.lang,u.created_at,(SELECT 1 FROM sanctions x WHERE x.user_id=u.id AND x.kind='revoke' AND x.active=1 AND (x.until IS NULL OR x.until>?) LIMIT 1) rv FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?"
  ).bind(Date.now(), th, Date.now()).first();
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
  await ensureSchema(env);
  const ibr = await ipBanned(env, ip, Date.now());
  if (ibr) return json({ error: ipMsg(ibr, Date.now()) }, 403);
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
  await ensureSchema(env);
  const bn = await activeSanction(env, u.id, 'ban', null, Date.now());
  if (bn) return json({ error: sancMsg('ban', bn, Date.now()), appeal: true }, 403);
  // حظر الجهاز لا يسري على الإشراف (حتى لا يُقفل مشرف على شبكة مشتركة)
  const ibl = await ipBanned(env, ip, Date.now());
  if (ibl && u.role !== 'owner' && lvBase(u) < 2) return json({ error: ipMsg(ibl, Date.now()), appeal: true }, 403);
  await env.DB.prepare('UPDATE users SET last_ip=? WHERE id=?').bind(ip, u.id).run();
  const cookie = await startSession(env, u.id);
  return json({ ok: true }, 200, { 'set-cookie': cookie });
}

async function guest(req, env, ip) {
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  await ensureSchema(env);
  const ibg = await ipBanned(env, ip, Date.now());
  if (ibg) return json({ error: ipMsg(ibg, Date.now()) }, 403);
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
      env.DB.prepare('CREATE TABLE IF NOT EXISTS sanctions(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, room TEXT, reason TEXT, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, ts INTEGER NOT NULL, until INTEGER, active INTEGER NOT NULL DEFAULT 1, lifted_by INTEGER, lifted_ts INTEGER)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sanc_user ON sanctions(user_id,kind,active)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS mod_log(id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, target_id INTEGER, target_name TEXT, detail TEXT, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_modlog_ts ON mod_log(ts)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sanc_act ON sanctions(active,kind)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS mod_notes(id INTEGER PRIMARY KEY AUTOINCREMENT, target_id INTEGER NOT NULL, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_notes_target ON mod_notes(target_id,id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS room_mods(user_id INTEGER PRIMARY KEY, room TEXT NOT NULL, by_id INTEGER NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS room_modes(room TEXT PRIMARY KEY, mode TEXT NOT NULL, by_id INTEGER NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS profiles(user_id INTEGER PRIMARY KEY, img TEXT, cover TEXT, bio TEXT NOT NULL DEFAULT '', st TEXT NOT NULL DEFAULT 'متاح', iv INTEGER NOT NULL DEFAULT 0, cv INTEGER NOT NULL DEFAULT 0, upd INTEGER NOT NULL DEFAULT 0)"),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS likes(user_id INTEGER NOT NULL, target_id INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(user_id,target_id))'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS gifts(id INTEGER PRIMARY KEY AUTOINCREMENT, to_id INTEGER NOT NULL, from_id INTEGER NOT NULL, gid INTEGER NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_gifts_to ON gifts(to_id,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_gifts_from ON gifts(from_id,ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS visits(target_id INTEGER NOT NULL, visitor_id INTEGER NOT NULL, ts INTEGER NOT NULL, nts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(target_id,visitor_id))'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_visits_target ON visits(target_id,ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY AUTOINCREMENT, by_id INTEGER NOT NULL, text TEXT NOT NULL, dur INTEGER NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS visit_prefs(user_id INTEGER PRIMARY KEY, hv INTEGER NOT NULL DEFAULT 0, gh INTEGER NOT NULL DEFAULT 0)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS ip_bans(id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT NOT NULL, target_id INTEGER, target_name TEXT, reason TEXT, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, ts INTEGER NOT NULL, until INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, lifted_by INTEGER, lifted_ts INTEGER)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ipban_h ON ip_bans(ip_hash,active)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS ban_props(id INTEGER PRIMARY KEY AUTOINCREMENT, target_id INTEGER NOT NULL, target_name TEXT NOT NULL, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, reason TEXT NOT NULL, minutes INTEGER NOT NULL, kind TEXT NOT NULL, ts INTEGER NOT NULL, state INTEGER NOT NULL DEFAULT 0, rev_id INTEGER, rev_name TEXT, rev_ts INTEGER, rev_note TEXT)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_props_state ON ban_props(state,id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS appeals(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, user_name TEXT NOT NULL, sanc_id INTEGER NOT NULL, sanc_kind TEXT NOT NULL, sanc_by TEXT, sanc_reason TEXT, sanc_until INTEGER, text TEXT NOT NULL, ts INTEGER NOT NULL, state INTEGER NOT NULL DEFAULT 0, rev_id INTEGER, rev_name TEXT, rev_ts INTEGER, rev_note TEXT)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_appeals_state ON appeals(state,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id,ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS watch_words(id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL UNIQUE, act TEXT NOT NULL, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS site_flags(k TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0, by_id INTEGER, ts INTEGER)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS emergency(id INTEGER PRIMARY KEY CHECK(id=1), by_id INTEGER NOT NULL, by_name TEXT NOT NULL, ts INTEGER NOT NULL)'),
    ]).then(() => migrate(env)).then(() => verifySchema(env)).then(() => wwSeed(env)).catch((e) => { schemaP = null; throw e; });
  }
  return schemaP;
}

// المرحلة 5: أعمدة جديدة تُضاف للجداول الموجودة (دون حذف أي بيانات)
const MIG = {
  messages: [
    ['ed', 'INTEGER'],
    ['del', 'INTEGER NOT NULL DEFAULT 0'],
    ['kind', 'TEXT'],
    ['pl', 'TEXT'],
    ['orig', 'TEXT'],
    ['upd', 'INTEGER NOT NULL DEFAULT 0']
  ],

  visits: [
    ['nts', 'INTEGER NOT NULL DEFAULT 0']
  ],

  ip_bans: [
    ['target_id', 'INTEGER'],
    ['target_name', 'TEXT']
  ],

  watch_words: [
    ['act', "TEXT NOT NULL DEFAULT 'delete'"],
    ['by_id', 'INTEGER NOT NULL DEFAULT 0'],
    ['by_name', "TEXT NOT NULL DEFAULT 'قديم'"],
    ['ts', 'INTEGER NOT NULL DEFAULT 0']
  ],

  mod_log: [
    ['hidden', 'INTEGER NOT NULL DEFAULT 0']
  ],

  user_reports: [
    ['hidden', 'INTEGER NOT NULL DEFAULT 0']
  ],

  pms: [
    ['ed', 'INTEGER'],
    ['del', 'INTEGER NOT NULL DEFAULT 0'],
    ['orig', 'TEXT'],
    ['upd', 'INTEGER NOT NULL DEFAULT 0'],
    ['del_from', 'INTEGER NOT NULL DEFAULT 0'],
    ['del_to', 'INTEGER NOT NULL DEFAULT 0']
  ]
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
  user_reports: ['id', 'reporter_id', 'target_id', 'reason', 'ctx', 'ts', 'done', 'hidden'],
  reactions: ['scope', 'mid', 'user_id', 'emoji', 'ts'],
  poll_votes: ['mid', 'user_id', 'opt'],
  pins: ['room', 'mid', 'text', 'by_id', 'ts'],
  sanctions: ['id', 'user_id', 'kind', 'room', 'reason', 'by_id', 'by_name', 'ts', 'until', 'active', 'lifted_by', 'lifted_ts'],
  mod_notes: ['id', 'target_id', 'by_id', 'by_name', 'text', 'ts'],
  room_mods: ['user_id', 'room', 'by_id', 'ts'],
  room_modes: ['room', 'mode', 'by_id', 'ts'],
  profiles: ['user_id', 'img', 'cover', 'bio', 'st', 'iv', 'cv', 'upd'],
  likes: ['user_id', 'target_id', 'ts'],
  gifts: ['id', 'to_id', 'from_id', 'gid', 'ts'],
  visits: ['target_id', 'visitor_id', 'ts', 'nts'],
  announcements: ['id', 'by_id', 'text', 'dur', 'ts'],
  visit_prefs: ['user_id', 'hv', 'gh'],
  ip_bans: ['id', 'ip_hash', 'target_id', 'target_name', 'reason', 'by_id', 'by_name', 'ts', 'until', 'active', 'lifted_by', 'lifted_ts'],
  ban_props: ['id', 'target_id', 'target_name', 'by_id', 'by_name', 'reason', 'minutes', 'kind', 'ts', 'state', 'rev_id', 'rev_name', 'rev_ts', 'rev_note'],
  appeals: ['id', 'user_id', 'user_name', 'sanc_id', 'sanc_kind', 'sanc_by', 'sanc_reason', 'sanc_until', 'text', 'ts', 'state', 'rev_id', 'rev_name', 'rev_ts', 'rev_note'],
  mod_log: ['id', 'actor_id', 'actor_name', 'action', 'target_id', 'target_name', 'detail', 'ts', 'hidden'],
  emergency: ['id', 'by_id', 'by_name', 'ts'],
  watch_words: ['id', 'word', 'act', 'by_id', 'by_name', 'ts'],
  site_flags: ['k', 'v', 'by_id', 'ts'],
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
    env.DB.prepare('DELETE FROM mod_log WHERE ts<?').bind(now - 3 * KEEP),
    env.DB.prepare('DELETE FROM visits WHERE ts<?').bind(now - KEEP),
    env.DB.prepare('DELETE FROM announcements WHERE ts<?').bind(now - DAY),
    env.DB.prepare('DELETE FROM ip_bans WHERE (active=0 OR until<?) AND ts<?').bind(now, now - 3 * KEEP),
    env.DB.prepare('DELETE FROM ban_props WHERE ts<?').bind(now - 3 * KEEP),
    env.DB.prepare('DELETE FROM appeals WHERE ts<?').bind(now - 3 * KEEP),
    env.DB.prepare('DELETE FROM sanctions WHERE (active=0 OR (until IS NOT NULL AND until<?)) AND ts<?').bind(now, now - 3 * KEEP),
  ]);
}

// ---------- المرحلة 6أ: أساس الإدارة ----------
// أدنى مستوى (lvOf) لكل إجراء. تُفحص كلها في الخادم، ولا قيمة لما يظهر في المتصفح.
const MOD_MIN = { warn: 2, mute: 2, kick: 3, ban: 5, tempban: 4, revoke: 4, rank: 4, delmsg: 2, wipe: 4, rename: 4, move: 4, roommod: 5, roommode: 3, emergency: 4, reports: 2, log: 3, note: 2, history: 2, stats: 4, shadow: 4, nopm: 4, slow: 4, delimg: 4, ipban: 5, propose: 2, propreview: 5, appeals: 4, linked: 5 };
const SLOW_MS = 10000;        // الوضع البطيء: رسالة كل 10 ثوانٍ
const ROOM_MODES = ['normal', 'slow', 'ro'];
const WN = 3;                 // عدد التحذيرات قبل الكتم التلقائي
const WARN_KEEP = 30 * DAY;   // مدة بقاء التحذير
const AUTO_MUTE = 30 * 6e4;   // مدة الكتم التلقائي
const SANC_KINDS = ['mute', 'kick', 'ban', 'revoke'];
const MAX_SANC_MS = 365 * DAY;
const MAX_REASON = 200;

// يحوّل مدة بالدقائق إلى وقت انتهاء. 0 أو فارغ = دائم (للكتم والحظر وسحب الصلاحيات فقط)
function untilFrom(minutes, kind, now) {
  const m = Math.floor(Number(minutes) || 0);
  if (m <= 0) return kind === 'kick' ? { err: 'الطرد يحتاج مدة' } : kind === 'ban' ? { err: 'الحظر يحتاج مدة (لا يوجد حظر دائم)' } : { until: null };
  return { until: now + Math.min(m * 6e4, MAX_SANC_MS) };
}

// يتحقق أن المنفِّذ يملك صلاحية الإجراء على الهدف. يرجع { t } عند النجاح أو { res } برد الخطأ الجاهز.
async function modGuard(env, actor, targetId, action) {
  const min = MOD_MIN[action];
  if (min === undefined) return { res: json({ error: 'إجراء غير معروف' }, 400) };
  if (!targetId) return { res: json({ error: 'طلب غير صالح' }, 400) };
  if (targetId === actor.id) return { res: json({ error: 'لا يمكنك تطبيق هذا على نفسك' }, 400) };
  const t = await env.DB.prepare('SELECT id,name,role,rank FROM users WHERE id=?').bind(targetId).first();
  if (!t) return { res: json({ error: 'المستخدم غير موجود' }, 404) };
  actor = await roomModAs(env, actor, t);
  if (lvOf(actor) < min) return { res: json({ error: 'لا تملك صلاحية هذا الإجراء' }, 403) };
  if (!canMod(actor, t, min)) return { res: json({ error: 'لا يمكنك تطبيق هذا على من رتبته مساوية لك أو أعلى' }, 403) };
  return { t };
}

// عقوبة فعّالة الآن من نوع معيّن (kick تُفحص بالغرفة). ترجع الصف أو null
async function activeSanction(env, userId, kind, room, now) {
  const q = 'SELECT id,kind,room,reason,by_name,ts,until FROM sanctions WHERE user_id=? AND kind=? AND active=1 AND (until IS NULL OR until>?)'
    + (room ? ' AND room=?' : '') + ' ORDER BY id DESC LIMIT 1';
  const st = env.DB.prepare(q);
  return await (room ? st.bind(userId, kind, now, room) : st.bind(userId, kind, now)).first();
}

// عبارات جاهزة للدفعة: إضافة عقوبة (وتعطيل السابقة من نفس النوع) + سطر في السجل
function sanctionStmts(env, actor, t, kind, room, reason, until, now) {
  return [
    env.DB.prepare('UPDATE sanctions SET active=0, lifted_by=?, lifted_ts=? WHERE user_id=? AND kind=? AND active=1' + (room ? ' AND room=?' : ''))
      .bind(...(room ? [actor.id, now, t.id, kind, room] : [actor.id, now, t.id, kind])),
    env.DB.prepare('INSERT INTO sanctions(user_id,kind,room,reason,by_id,by_name,ts,until) VALUES(?,?,?,?,?,?,?,?)')
      .bind(t.id, kind, room || null, reason, actor.id, actor.name, now, until),
    logStmt(env, actor, kind, t, (room ? room + ' | ' : '') + (until ? 'حتى ' + new Date(until).toISOString() : 'دائم') + (reason ? ' | ' + reason : ''), now),
  ];
}

// عبارة إضافة سطر لسجل الإجراءات (تُضاف لنفس الدفعة ليبقى السجل متسقاً مع الإجراء)
function logStmt(env, actor, action, t, detail, now) {
  return env.DB.prepare('INSERT INTO mod_log(actor_id,actor_name,action,target_id,target_name,detail,ts) VALUES(?,?,?,?,?,?,?)')
    .bind(actor.id, actor.name, action, t ? t.id : null, t ? t.name : null, String(detail || '').slice(0, 300), now);
}

// عبارة إشعار حقيقي لصاحب العلاقة (تحذير، تغيير رتبة، عقوبة...)
function notifStmt(env, userId, ty, text, ref, now) {
  return env.DB.prepare('INSERT INTO notifications(user_id,ty,text,ref,ts) VALUES(?,?,?,?,?)').bind(userId, ty, text, ref || null, now);
}

// ---------- المرحلة 6ب: الكتم والطرد والحظر ----------
const SANC_AR = { mute: 'كتم', kick: 'طرد', ban: 'حظر', nopm: 'منع الخاص', slow: 'الوضع البطيء', shadow: 'إخفاء الرسائل' };
const MISC_KINDS = ['shadow', 'nopm', 'slow'];   // إخفاء الرسائل | منع الخاص | وضع بطيء للمستخدم
const SELF_VISIBLE = ['nopm', 'slow'];           // يراها صاحبها أيضاً (الإخفاء سري عنه)
const USER_SLOW_MS = 30000;                      // الوضع البطيء للمستخدم: رسالة كل 30 ثانية
// نص الرسالة التي تصل المعاقَب: المدة المتبقية والسبب
function sancMsg(kind, s, now) {
  const left = s.until ? Math.max(1, Math.ceil((s.until - now) / 6e4)) : 0;
  const base = kind === 'mute' ? 'أنت مكتوم' : kind === 'kick' ? 'تم طردك من هذه الغرفة' : 'حسابك محظور';
  return base + (left ? ' لمدة ' + left + ' دقيقة متبقية' : ' بشكل دائم') + (s.reason ? ' — السبب: ' + s.reason : '');
}

// تطبيق عقوبة: mute | kick | ban
async function modApply(req, env, kind, action = kind) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, action);
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  const reason = cleanText(b.reason).slice(0, MAX_REASON);
  const d = untilFrom(b.minutes, kind, now);
  if (d.err) return json({ error: d.err }, 400);
  let room = null;
  if (kind === 'kick') {
    // الغرفة تُؤخذ من حضور الهدف الفعلي في الخادم، ولا يُوثق بما يرسله المتصفح إلا إن كان غير متصل
    const p = await env.DB.prepare('SELECT room FROM presence WHERE user_id=? AND ts>?').bind(t.id, now - ONLINE_MS).first();
    room = p ? p.room : String(b.room || '');
    if (!ROOMS.includes(room)) return json({ error: 'غرفة غير صالحة' }, 400);
  }
  const st = sanctionStmts(env, u, t, kind, room, reason, d.until, now);
  if (kind === 'ban') {
    // الحظر يقطع كل جلساته الحالية فوراً ويُخرجه من المتصلين
    st.push(env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.id));
    st.push(env.DB.prepare('DELETE FROM presence WHERE user_id=?').bind(t.id));
  } else {
    st.push(notifStmt(env, t.id, 'warn', sancMsg(kind, { until: d.until, reason }, now) + ' (بواسطة ' + u.name + ')', null, now));
  }
  await env.DB.batch(st);
  return json({ ok: true, until: d.until });
}

// رفع عقوبة قبل وقتها: unmute | unkick | unban (تحتاج صلاحية العقوبة نفسها)
async function modLift(req, env, kind) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, kind === 'ban' ? 'tempban' : kind);
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  const cur = await env.DB.prepare('SELECT s.by_id,b.role,b.rank FROM sanctions s LEFT JOIN users b ON b.id=s.by_id WHERE s.user_id=? AND s.kind=? AND s.active=1 AND (s.until IS NULL OR s.until>?) ORDER BY s.id DESC LIMIT 1')
    .bind(t.id, kind, now).first();
  if (!cur) return json({ error: 'لا توجد عقوبة فعّالة من هذا النوع' }, 404);
  // لا يرفعها من هو أدنى ممن وضعها (إلا المالك أو صاحبها نفسه)
  if (u.role !== 'owner' && cur.by_id !== u.id && cur.role && pwOf(u) < pwOf({ role: cur.role, rank: cur.rank || 0 })) return json({ error: 'وضعها من هو أعلى منك، ولا تستطيع رفعها' }, 403);
  const r = await env.DB.prepare('UPDATE sanctions SET active=0, lifted_by=?, lifted_ts=? WHERE user_id=? AND kind=? AND active=1 AND (until IS NULL OR until>?)')
    .bind(u.id, now, t.id, kind, now).run();
  if (!r.meta || !r.meta.changes) return json({ error: 'لا توجد عقوبة فعّالة من هذا النوع' }, 404);
  const st = [logStmt(env, u, 'un' + kind, t, '', now)];
  if (kind !== 'ban' && kind !== 'shadow') st.push(notifStmt(env, t.id, 'info', 'تم رفع ' + SANC_AR[kind] + ' عنك بواسطة ' + u.name, null, now));
  await env.DB.batch(st);
  return json({ ok: true });
}

// ---------- المرحلة 6ج (تتمة): إخفاء الرسائل | منع الخاص | وضع بطيء للمستخدم ----------
async function modApplyMisc(req, env, kind) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, kind);
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  const reason = cleanText(b.reason).slice(0, MAX_REASON);
  const d = untilFrom(b.minutes, kind, now);
  if (d.err) return json({ error: d.err }, 400);
  const st = sanctionStmts(env, u, t, kind, null, reason, d.until, now);
  if (kind === 'shadow') {
    // آخر رسائله تصل الحاضرين كـ«ممسوحة» في أول استطلاع لهم، فتختفي من شاشاتهم فوراً (يبقى هو يراها)
    st.push(env.DB.prepare('UPDATE messages SET upd=? WHERE id IN (SELECT id FROM messages WHERE user_id=? AND del=0 ORDER BY id DESC LIMIT 50)').bind(now, t.id));
  } else {
    const left = d.until ? Math.max(1, Math.ceil((d.until - now) / 6e4)) : 0;
    const base = kind === 'nopm' ? 'تم منعك من الرسائل الخاصة' : 'تم تفعيل الوضع البطيء عليك: رسالة كل ' + USER_SLOW_MS / 1000 + ' ثانية';
    st.push(notifStmt(env, t.id, 'warn', base + (left ? ' لمدة ' + left + ' دقيقة' : ' بشكل دائم') + (reason ? ' — السبب: ' + reason : '') + ' (بواسطة ' + u.name + ')', null, now));
  }
  await env.DB.batch(st);
  return json({ ok: true, until: d.until });
}

// ---------- المرحلة 6ج ----------
// تحذير مع سبب (إشعار حقيقي). عند بلوغ WN تحذيرات: كتم تلقائي 30 دقيقة وتصفير التحذيرات
async function modWarn(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'warn');
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  const reason = cleanText(b.reason).slice(0, MAX_REASON);
  if (!reason) return json({ error: 'اكتب سبب التحذير' }, 400);
  const c = await env.DB.prepare("SELECT COUNT(*) c FROM sanctions WHERE user_id=? AND kind='warn' AND active=1 AND until>?").bind(t.id, now).first();
  const n = c.c + 1, auto = n >= WN;
  const st = [
    env.DB.prepare("INSERT INTO sanctions(user_id,kind,room,reason,by_id,by_name,ts,until) VALUES(?,'warn',NULL,?,?,?,?,?)").bind(t.id, reason, u.id, u.name, now, now + WARN_KEEP),
    logStmt(env, u, 'warn', t, n + '/' + WN + ' | ' + reason, now),
  ];
  if (auto) {
    st.push(env.DB.prepare("UPDATE sanctions SET active=0, lifted_by=?, lifted_ts=? WHERE user_id=? AND kind='warn' AND active=1").bind(u.id, now, t.id));
    st.push(...sanctionStmts(env, u, t, 'mute', null, 'تحذيرات متكررة', now + AUTO_MUTE, now));
  }
  st.push(notifStmt(env, t.id, 'warn', 'تحذير من ' + u.name + ': ' + reason + ' (' + n + '/' + WN + ')' + (auto ? ' — تم كتمك 30 دقيقة' : ''), null, now));
  await env.DB.batch(st);
  return json({ ok: true, warns: auto ? 0 : n, muted: auto });
}

// تغيير الرتبة: لا يرفع أحد فوق سقفه، ولا يُغيَّر إلا رتب الأعضاء
async function modRank(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const v = parseInt(b.rank, 10), cap = capOf(u);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'rank');
  if (g.res) return g.res;
  const t = g.t;
  if (cap <= 0) return json({ error: 'لا تملك صلاحية تغيير الرتب' }, 403);
  if (t.role !== 'member') return json({ error: 'تُغيَّر رتب الأعضاء فقط' }, 400);
  if ((t.rank || 0) > cap) return json({ error: 'رتبة هذا العضو أعلى من سقفك' }, 403);
  if (!(v >= 0 && v <= cap)) return json({ error: 'الرتبة المسموح لك بها من 0 إلى ' + cap }, 400);
  if (v === (t.rank || 0)) return json({ ok: true, rank: v });
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET rank=? WHERE id=?').bind(v, t.id),
    logStmt(env, u, 'rank', t, (t.rank || 0) + ' ← ' + v, now),
    notifStmt(env, t.id, 'rank', 'تغيّرت رتبتك من ' + (t.rank || 0) + ' إلى ' + v + ' (بواسطة ' + u.name + ')', null, now),
  ]);
  return json({ ok: true, rank: v });
}

// سحب الصلاحيات (بمدة أو حتى الإعادة يدوياً) وإعادتها
async function modRevoke(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'revoke');
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  if (lvOf(t) < 2) return json({ error: 'هذا المستخدم ليس لديه صلاحيات لتُسحب' }, 400);
  const reason = cleanText(b.reason).slice(0, MAX_REASON);
  if (!reason) return json({ error: 'اكتب سبب سحب الصلاحيات' }, 400);
  const d = untilFrom(b.minutes, 'revoke', now);
  const st = sanctionStmts(env, u, t, 'revoke', null, reason, d.until, now);
  st.push(notifStmt(env, t.id, 'warn', 'سُحبت صلاحياتك' + (d.until ? ' لمدة ' + Math.ceil((d.until - now) / 6e4) + ' دقيقة' : ' حتى الإعادة يدوياً') + ' — السبب: ' + reason, null, now));
  await env.DB.batch(st);
  return json({ ok: true, until: d.until });
}

async function modRestore(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'revoke');
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  const s = await env.DB.prepare("SELECT id,by_id FROM sanctions WHERE user_id=? AND kind='revoke' AND active=1 AND (until IS NULL OR until>?) ORDER BY id DESC LIMIT 1").bind(t.id, now).first();
  if (!s) return json({ error: 'لا توجد صلاحيات مسحوبة عن هذا المستخدم' }, 404);
  // لا يعيدها من هو أدنى ممن سحبها
  const by = await env.DB.prepare('SELECT id,role,rank FROM users WHERE id=?').bind(s.by_id).first();
  if (u.role !== 'owner' && by && pwOf(u) < pwOf(by)) return json({ error: 'سحبها من هو أعلى منك، ولا تستطيع إعادتها' }, 403);
  await env.DB.batch([
    env.DB.prepare("UPDATE sanctions SET active=0, lifted_by=?, lifted_ts=? WHERE user_id=? AND kind='revoke' AND active=1").bind(u.id, now, t.id),
    logStmt(env, u, 'restore', t, '', now),
    notifStmt(env, t.id, 'info', 'أُعيدت صلاحياتك بواسطة ' + u.name, null, now),
  ]);
  return json({ ok: true });
}

// حذف آخر 5 رسائل لمستخدم (delmsg) أو كل رسائله المحفوظة (wipe)، في كل الغرف
async function modDelMsgs(req, env, action) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, action);
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  const sub = action === 'delmsg'
    ? 'SELECT id FROM messages WHERE user_id=? AND del=0 ORDER BY id DESC LIMIT 5'
    : 'SELECT id FROM messages WHERE user_id=? AND del<2 AND ts>?';
  const args = action === 'delmsg' ? [t.id] : [t.id, now - KEEP];
  const res = await env.DB.batch([
    // del=2 = مسح كامل: لا تُرسَل للمتصفحات أبداً، وتُزال فوراً من شاشات من هم في الغرفة
    env.DB.prepare("UPDATE messages SET del=2, uname='', text='', rn=NULL, rt=NULL, rid=NULL, pl=NULL, orig=NULL, upd=? WHERE id IN (" + sub + ')').bind(now, ...args),
    env.DB.prepare("DELETE FROM reactions WHERE scope='r' AND mid IN (SELECT id FROM messages WHERE user_id=? AND del=2)").bind(t.id),
    env.DB.prepare('DELETE FROM poll_votes WHERE mid IN (SELECT id FROM messages WHERE user_id=? AND del=2)').bind(t.id),
    env.DB.prepare('DELETE FROM pins WHERE mid IN (SELECT id FROM messages WHERE user_id=? AND del=2)').bind(t.id),
    // الردود التي كانت تقتبس رسالة ممسوحة تفقد الاقتباس، فلا يبقى أثر لها
    env.DB.prepare('UPDATE messages SET rn=NULL, rt=NULL, rid=NULL, upd=? WHERE rid IN (SELECT id FROM messages WHERE user_id=? AND del=2 AND upd=?)').bind(now, t.id, now),
  ]);
  const n = (res[0].meta && res[0].meta.changes) || 0;
  await logStmt(env, u, action, t, n + ' رسالة', now).run();
  return json({ ok: true, n });
}

// إجبار تغيير الاسم: يُستبدل باسم عام فريد، ويُحدَّث اسمه في رسائله المحفوظة
const RENAME_RIGHT = 7 * DAY;   // مهلة اختيار المُجبَر على تغيير اسمه لاسم جديد بنفسه
function nameErr(n, allowReserved) {
  if (n.length < 2 || n.length > 16) return 'الاسم من 2 إلى 16 حرفاً';
  if (!NAME_OK.test(n)) return 'الاسم يقبل الحروف والأرقام و _ - . فقط';
  if (!allowReserved && RESERVED.test(n)) return 'هذا الاسم محجوز';
  return null;
}
// إجبار تغيير الاسم: بالاسم الذي يكتبه المشرف، أو (إن تُرك فارغاً) باسم عام عشوائي يحق لصاحبه استبداله مرة واحدة
async function modRename(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'rename');
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  const typed = cleanText(b.name).replace(/\s+/g, ' ');
  let nn = null;
  if (typed) {
    const er = nameErr(typed, u.role === 'owner');
    if (er) return json({ error: er }, 400);
    if (typed === t.name) return json({ error: 'هذا هو اسمه الحالي' }, 400);
    const ex = await env.DB.prepare('SELECT id FROM users WHERE name=?').bind(typed).first();
    if (ex && ex.id !== t.id) return json({ error: 'الاسم مستخدم، اختر اسماً آخر' }, 409);
    nn = typed;
  } else {
    for (let i = 0; i < 8 && !nn; i++) {
      const c = 'مستخدم_' + (100 + crypto.getRandomValues(new Uint32Array(1))[0] % (i < 4 ? 900 : 90000));
      if (!(await env.DB.prepare('SELECT 1 x FROM users WHERE name=?').bind(c).first())) nn = c;
    }
    if (!nn) return json({ error: 'تعذر توليد اسم، حاول مرة أخرى' }, 500);
  }
  const st = [
    env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(nn, t.id),
    env.DB.prepare('UPDATE messages SET uname=? WHERE user_id=?').bind(nn, t.id),
    env.DB.prepare("UPDATE sanctions SET active=0, lifted_by=?, lifted_ts=? WHERE user_id=? AND kind='rename' AND active=1").bind(u.id, now, t.id),
  ];
  if (!typed) st.push(env.DB.prepare("INSERT INTO sanctions(user_id,kind,room,reason,by_id,by_name,ts,until) VALUES(?,'rename',NULL,'اختيار اسم جديد',?,?,?,?)").bind(t.id, u.id, u.name, now, now + RENAME_RIGHT));
  st.push(logStmt(env, u, 'rename', t, t.name + ' ← ' + nn + (typed ? ' (اسم حدّده المشرف)' : ' (اسم عام)'), now));
  st.push(notifStmt(env, t.id, 'warn', 'تم تغيير اسمك إلى ' + nn + ' بواسطة ' + u.name + ' لمخالفته القواعد' + (typed ? '' : ' — يمكنك اختيار اسم جديد من الإعدادات (عقوباتي) خلال 7 أيام'), null, now));
  try { await env.DB.batch(st); }
  catch (e) { if (String(e).includes('UNIQUE')) return json({ error: 'الاسم مستخدم، اختر اسماً آخر' }, 409); throw e; }
  return json({ ok: true, name: nn });
}

// هل يحق لي اختيار اسم جديد الآن؟ (بعد إجبار تغيير عام)
async function nameStatus(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const r = await env.DB.prepare("SELECT until FROM sanctions WHERE user_id=? AND kind='rename' AND active=1 AND until>? ORDER BY id DESC LIMIT 1").bind(u.id, Date.now()).first();
  return json({ ok: true, pending: !!r, until: r ? r.until : null });
}
async function nameChange(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  const nm = cleanText(b && b.name).replace(/\s+/g, ' '), now = Date.now();
  const er = nameErr(nm, false);
  if (er) return json({ error: er }, 400);
  if (nm === u.name) return json({ error: 'هذا هو اسمك الحالي' }, 400);
  const r = await env.DB.prepare("SELECT id FROM sanctions WHERE user_id=? AND kind='rename' AND active=1 AND until>? ORDER BY id DESC LIMIT 1").bind(u.id, now).first();
  if (!r) return json({ error: 'لا يمكنك تغيير اسمك حالياً' }, 403);
  const ex = await env.DB.prepare('SELECT id FROM users WHERE name=?').bind(nm).first();
  if (ex && ex.id !== u.id) return json({ error: 'الاسم مستخدم، اختر اسماً آخر' }, 409);
  const c = await env.DB.prepare('UPDATE sanctions SET active=0, lifted_by=?, lifted_ts=? WHERE id=? AND active=1').bind(u.id, now, r.id).run();
  if (!c.meta || !c.meta.changes) return json({ error: 'لا يمكنك تغيير اسمك حالياً' }, 403);
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(nm, u.id),
      env.DB.prepare('UPDATE messages SET uname=? WHERE user_id=?').bind(nm, u.id),
      logStmt(env, u, 'rename', { id: u.id, name: nm }, u.name + ' ← ' + nm + ' (اختاره بنفسه)', now),
    ]);
  } catch (e) {
    await env.DB.prepare('UPDATE sanctions SET active=1, lifted_by=NULL, lifted_ts=NULL WHERE id=?').bind(r.id).run();
    if (String(e).includes('UNIQUE')) return json({ error: 'الاسم مستخدم، اختر اسماً آخر' }, 409);
    throw e;
  }
  return json({ ok: true, name: nm });
}

// نقل مستخدم متصل لغرفة أخرى (يصله عند أول فحص)
async function modMove(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'move');
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  const p = await env.DB.prepare('SELECT room FROM presence WHERE user_id=? AND ts>?').bind(t.id, now - ONLINE_MS).first();
  if (!p) return json({ error: 'المستخدم غير متصل' }, 400);
  const dest = ROOMS.includes(String(b.room || '')) ? String(b.room) : ROOMS[(ROOMS.indexOf(p.room) + 2) % ROOMS.length];
  const st = sanctionStmts(env, u, t, 'move', dest, cleanText(b.reason).slice(0, MAX_REASON), now + 5 * 6e4, now);
  st.push(notifStmt(env, t.id, 'info', 'تم نقلك إلى غرفة ' + dest + ' بواسطة ' + u.name, null, now));
  await env.DB.batch(st);
  return json({ ok: true, room: dest });
}

// ---------- المرحلة 6د: مشرف الغرفة وأوضاع الغرفة ----------
// مشرف الغرفة يُرفع للمستوى 3 داخل غرفته فقط، وعلى من هو حاضر فيها فقط
async function roomModAs(env, actor, t) {
  if (actor.rv || lvOf(actor) >= 4) return actor;
  const r = await env.DB.prepare('SELECT m.room FROM room_mods m JOIN presence p ON p.room=m.room AND p.user_id=? AND p.ts>? WHERE m.user_id=?')
    .bind(t.id, Date.now() - ONLINE_MS, actor.id).first();
  return r ? { ...actor, lvx: 3 } : actor;
}
// المستخدم كما يُعامَل داخل غرفة معيّنة (مشرف الغرفة = مستوى 3 هناك)
async function uIn(env, u, room) {
  if (u.rv || lvOf(u) >= 3) return u;
  const r = await env.DB.prepare('SELECT 1 x FROM room_mods WHERE user_id=? AND room=?').bind(u.id, room).first();
  return r ? { ...u, lvx: 3 } : u;
}

// تعيين مشرف غرفة (on=true) أو إزالته (on=false): للمستوى 5 فأعلى، ولأعضاء فقط، وغرفة واحدة لكل مشرف
async function roomModSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'roommod');
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  if (t.role !== 'member') return json({ error: 'يُعيَّن مشرف الغرفة من الأعضاء فقط' }, 400);
  if (b.on === false) {
    const cur = await env.DB.prepare('SELECT room FROM room_mods WHERE user_id=?').bind(t.id).first();
    if (!cur) return json({ error: 'ليس مشرف غرفة' }, 404);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM room_mods WHERE user_id=?').bind(t.id),
      logStmt(env, u, 'unroommod', t, cur.room, now),
      notifStmt(env, t.id, 'info', 'أُزيل إشرافك على غرفة ' + cur.room + ' بواسطة ' + u.name, null, now),
    ]);
    return json({ ok: true });
  }
  const room = String(b.room || '');
  if (!ROOMS.includes(room)) return json({ error: 'غرفة غير موجودة' }, 400);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO room_mods(user_id,room,by_id,ts) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET room=excluded.room, by_id=excluded.by_id, ts=excluded.ts').bind(t.id, room, u.id, now),
    logStmt(env, u, 'roommod', t, room, now),
    notifStmt(env, t.id, 'rank', 'تم تعيينك مشرف غرفة ' + room + ' بواسطة ' + u.name, null, now),
  ]);
  return json({ ok: true, room });
}

// وضع الغرفة: normal | slow | ro. للمستوى 3 فأعلى (ومشرف الغرفة في غرفته)
async function roomModeSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  const room = String((b && b.room) || ''), mode = String((b && b.mode) || '');
  if (!ROOMS.includes(room) || !ROOM_MODES.includes(mode)) return json({ error: 'طلب غير صالح' }, 400);
  if (lvOf(await uIn(env, u, room)) < MOD_MIN.roommode) return json({ error: 'لا تملك صلاحية تغيير وضع الغرفة' }, 403);
  const now = Date.now();
  await env.DB.batch([
    mode === 'normal'
      ? env.DB.prepare('DELETE FROM room_modes WHERE room=?').bind(room)
      : env.DB.prepare('INSERT INTO room_modes(room,mode,by_id,ts) VALUES(?,?,?,?) ON CONFLICT(room) DO UPDATE SET mode=excluded.mode, by_id=excluded.by_id, ts=excluded.ts').bind(room, mode, u.id, now),
    logStmt(env, u, 'roommode', null, room + ' ← ' + mode, now),
  ]);
  return json({ ok: true, room, mode });
}

// ---------- أدوات المالك: حذف سجل الإجراءات والبلاغات (صاحب الموقع فقط، ويُفحص هنا في الخادم) ----------
// حذف سطر واحد لا يترك أثراً. الحذف الجماعي (بالمدة أو الكل) يترك سطراً واحداً في السجل يذكر ما حُذف وكم عدده.
async function ownerGate(req, env) {
  const u = await currentUser(req, env);
  if (!u) return { res: json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401) };
  if (u.role !== 'owner') return { res: json({ error: 'غير مسموح' }, 403) };
  return { u };
}

async function ownerLogDel(req, env) {
  const g = await ownerGate(req, env);
  if (g.res) return g.res;
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const now = Date.now();
  if (b.id) {
    const id = parseInt(b.id, 10);
    if (!id) return json({ error: 'طلب غير صالح' }, 400);
    const r = await env.DB.prepare('DELETE FROM mod_log WHERE id=?').bind(id).run();
    return json({ ok: true, n: (r.meta && r.meta.changes) || 0 });
  }
  let r, note;
  if (b.days) {
    const d = parseInt(b.days, 10);
    if (!(d >= 1 && d <= 3650)) return json({ error: 'المدة غير صالحة' }, 400);
    r = await env.DB.prepare('DELETE FROM mod_log WHERE hidden=0 AND ts<?').bind(now - d * DAY).run();
    note = 'أقدم من ' + d + ' يوماً';
  } else if (b.all === true) {
    r = await env.DB.prepare('DELETE FROM mod_log WHERE hidden=?').bind(b.h === true ? 1 : 0).run();
    note = b.h === true ? 'كل المخفي' : 'كل السجل الظاهر';
  } else return json({ error: 'طلب غير صالح' }, 400);
  const n = (r.meta && r.meta.changes) || 0;
  if (n) await logStmt(env, g.u, 'logwipe', null, 'مسح ' + n + ' سطراً (' + note + ')', now).run();
  return json({ ok: true, n });
}

async function ownerReportDel(req, env) {
  const g = await ownerGate(req, env);
  if (g.res) return g.res;
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const now = Date.now();
  if (b.id) {
    const id = parseInt(b.id, 10);
    if (!id) return json({ error: 'طلب غير صالح' }, 400);
    const r = await env.DB.prepare('DELETE FROM user_reports WHERE id=?').bind(id).run();
    return json({ ok: true, n: (r.meta && r.meta.changes) || 0 });
  }
  let r, note;
  if (b.done === true) {
    r = await env.DB.prepare('DELETE FROM user_reports WHERE done=1 AND hidden=0').run();
    note = 'المعالَجة';
  } else if (b.all === true) {
    r = await env.DB.prepare('DELETE FROM user_reports WHERE hidden=?').bind(b.h === true ? 1 : 0).run();
    note = b.h === true ? 'كل المخفي' : 'كل البلاغات الظاهرة';
  } else return json({ error: 'طلب غير صالح' }, 400);
  const n = (r.meta && r.meta.changes) || 0;
  if (n) await logStmt(env, g.u, 'reportwipe', null, 'حذف ' + n + ' بلاغاً (' + note + ')', now).run();
  return json({ ok: true, n });
}

// الإخفاء بدل الحذف: يبقى الصف في القاعدة (hidden=1) ويختفي عن كل المشرفين ومن الإحصاءات، ويراه المالك وحده في «عرض المخفي» ويستطيع إظهاره.
// الحذف الجماعي أعلاه لا يمس المخفي (إلا بطلب صريح h=true)، فالمخفي يُحذف وحده أو بزر «حذف المخفي نهائياً».
async function ownerLogHide(req, env) {
  const g = await ownerGate(req, env);
  if (g.res) return g.res;
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const v = b.on === false ? 0 : 1;
  let r;
  if (b.id) {
    const id = parseInt(b.id, 10);
    if (!id) return json({ error: 'طلب غير صالح' }, 400);
    r = await env.DB.prepare('UPDATE mod_log SET hidden=? WHERE id=?').bind(v, id).run();
  } else if (b.days && v) {
    const d = parseInt(b.days, 10);
    if (!(d >= 1 && d <= 3650)) return json({ error: 'المدة غير صالحة' }, 400);
    r = await env.DB.prepare('UPDATE mod_log SET hidden=1 WHERE hidden=0 AND ts<?').bind(Date.now() - d * DAY).run();
  } else if (b.all === true) {
    r = await env.DB.prepare('UPDATE mod_log SET hidden=? WHERE hidden=?').bind(v, 1 - v).run();
  } else return json({ error: 'طلب غير صالح' }, 400);
  return json({ ok: true, n: (r.meta && r.meta.changes) || 0 });
}

async function ownerReportHide(req, env) {
  const g = await ownerGate(req, env);
  if (g.res) return g.res;
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const v = b.on === false ? 0 : 1;
  let r;
  if (b.id) {
    const id = parseInt(b.id, 10);
    if (!id) return json({ error: 'طلب غير صالح' }, 400);
    r = await env.DB.prepare('UPDATE user_reports SET hidden=? WHERE id=?').bind(v, id).run();
  } else if (b.done === true && v) {
    r = await env.DB.prepare('UPDATE user_reports SET hidden=1 WHERE hidden=0 AND done=1').run();
  } else if (b.all === true) {
    r = await env.DB.prepare('UPDATE user_reports SET hidden=? WHERE hidden=?').bind(v, 1 - v).run();
  } else return json({ error: 'طلب غير صالح' }, 400);
  return json({ ok: true, n: (r.meta && r.meta.changes) || 0 });
}

// ---------- الكلمات الممنوعة: فلترة رسائل الغرف في الخادم ----------
// لكل كلمة إجراء واحد: delete (لا تُنشر الرسالة) | warn (لا تُنشر + تحذير، و3 تحذيرات = كتم) | mute (لا تُنشر + كتم 30 دقيقة).
// المطابقة للكلمة كاملة بعد توحيد الهمزات وحذف التشكيل. المستوى 2 فأعلى مستثنون. التعديل للسوبر فما فوق، ويقفله صاحب الموقع على الجميع.
const WW_ACTS = ['delete', 'warn', 'mute'];          // الترتيب = الشدة (إن طابقت رسالة أكثر من كلمة يُطبَّق الأشد)
const WW_ACT_AR = { delete: 'حذف', warn: 'تحذير', mute: 'كتم' };
const WW_EDIT_MIN = 5;                               // أدنى مستوى لتعديل القائمة
const WW_EXEMPT_LV = 2;                              // من مستواه 2 فأعلى لا تُفحص رسائله
const WW_MAX = 200, WW_MIN_LEN = 2, WW_MAX_LEN = 30;
const WW_SEED = ['سب', 'شتم'];                       // كلمات الحماية التلقائية القديمة (كانت في المتصفح)، تُضاف مرة واحدة
const SYS_ACTOR = { id: 0, name: 'النظام' };
const WW_LET = '\\u0621-\\u064A\\u0660-\\u0669A-Za-z0-9_';
const wwNorm = (s) => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').toLowerCase().replace(/\s+/g, ' ').trim();
const wwRegex = (w) => new RegExp('(^|[^' + WW_LET + '])' + wwNorm(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![' + WW_LET + '])');

async function wwSeed(env) {
  try {
    const now = Date.now();
    const r = await env.DB.prepare("INSERT OR IGNORE INTO site_flags(k,v,by_id,ts) VALUES('ww_seeded',1,0,?)").bind(now).run();
    if (r.meta && r.meta.changes) {
      await env.DB.batch(WW_SEED.map((w) => env.DB.prepare("INSERT OR IGNORE INTO watch_words(word,act,by_id,by_name,ts) VALUES(?,'delete',0,'النظام',?)").bind(wwNorm(w), now)));
    }
  } catch (e) { console.error('ERR wwSeed', (e && e.stack) || e); }
}

// ترجع أشد كلمة مطابقة (أو null). تُستدعى من postMsg قبل حفظ الرسالة
async function wwCheck(env, u, text) {
  if (lvOf(u) >= WW_EXEMPT_LV) return null;
  const rows = (await env.DB.prepare('SELECT word,act FROM watch_words LIMIT 300').all()).results;
  if (!rows.length) return null;
  const n = wwNorm(text);
  let hit = null;
  for (const r of rows) {
    if (!wwRegex(r.word).test(n)) continue;
    if (!hit || WW_ACTS.indexOf(r.act) > WW_ACTS.indexOf(hit.act)) hit = r;
  }
  return hit;
}

// تنفيذ الإجراء. الرسالة لا تُحفظ في الحالات الثلاث. الكلمة نفسها لا تُكشف لصاحب الرسالة (سبب عام) وتُسجَّل في سجل الإدارة
async function wwApply(env, u, h, now) {
  const reason = 'كلمة ممنوعة';
  const hitLog = logStmt(env, SYS_ACTOR, 'ww_hit', u, WW_ACT_AR[h.act] + ' | ' + h.word, now);
  if (h.act === 'mute') {
    await env.DB.batch([
      ...sanctionStmts(env, SYS_ACTOR, u, 'mute', null, reason, now + AUTO_MUTE, now),
      notifStmt(env, u.id, 'warn', 'تم كتمك ' + AUTO_MUTE / 6e4 + ' دقيقة بسبب كلمة ممنوعة', null, now),
      hitLog,
    ]);
    return json({ error: 'رسالتك تحتوي كلمة ممنوعة — تم كتمك ' + AUTO_MUTE / 6e4 + ' دقيقة' }, 403);
  }
  if (h.act === 'warn') {
    const c = await env.DB.prepare("SELECT COUNT(*) c FROM sanctions WHERE user_id=? AND kind='warn' AND active=1 AND until>?").bind(u.id, now).first();
    const n = c.c + 1, auto = n >= WN;
    const st = [
      env.DB.prepare("INSERT INTO sanctions(user_id,kind,room,reason,by_id,by_name,ts,until) VALUES(?,'warn',NULL,?,?,?,?,?)").bind(u.id, reason, SYS_ACTOR.id, SYS_ACTOR.name, now, now + WARN_KEEP),
      logStmt(env, SYS_ACTOR, 'warn', u, n + '/' + WN + ' | ' + reason, now),
      hitLog,
    ];
    if (auto) {
      st.push(env.DB.prepare("UPDATE sanctions SET active=0, lifted_by=?, lifted_ts=? WHERE user_id=? AND kind='warn' AND active=1").bind(SYS_ACTOR.id, now, u.id));
      st.push(...sanctionStmts(env, SYS_ACTOR, u, 'mute', null, 'تحذيرات متكررة', now + AUTO_MUTE, now));
    }
    st.push(notifStmt(env, u.id, 'warn', 'تحذير من ' + SYS_ACTOR.name + ': ' + reason + ' (' + n + '/' + WN + ')' + (auto ? ' — تم كتمك ' + AUTO_MUTE / 6e4 + ' دقيقة' : ''), null, now));
    await env.DB.batch(st);
    return json({ error: 'رسالتك تحتوي كلمة ممنوعة — تحذير ' + (auto ? WN : n) + '/' + WN + (auto ? ' وتم كتمك ' + AUTO_MUTE / 6e4 + ' دقيقة' : '') }, 403);
  }
  await hitLog.run();
  return json({ error: 'رسالتك تحتوي كلمة ممنوعة ولم تُرسل' }, 403);
}

async function wwGate(req, env) {
  const u = await currentUser(req, env);
  if (!u) return { res: json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401) };
  if (lvOf(u) < WW_EDIT_MIN) return { res: json({ error: 'غير مسموح' }, 403) };
  return { u };
}
async function wwLocked(env) {
  const r = await env.DB.prepare("SELECT v FROM site_flags WHERE k='ww_lock'").first();
  return !!(r && r.v);
}
// قفل المالك: عند تفعيله لا يستطيع أحد غير صاحب الموقع إضافة كلمة أو تغيير إجرائها أو حذفها
async function wwEditOk(env, u) {
  return u.role === 'owner' || !(await wwLocked(env));
}

async function wwList(req, env) {
  const g = await wwGate(req, env);
  if (g.res) return g.res;
  const words = (await env.DB.prepare('SELECT id,word,act FROM watch_words ORDER BY id DESC LIMIT 300').all()).results;
  const lock = await wwLocked(env);
  const owner = g.u.role === 'owner';
  return json({ ok: true, words, lock, owner, edit: owner || !lock });
}

// إضافة كلمة أو تغيير إجرائها (الكلمة فريدة)
async function wwSave(req, env) {
  const g = await wwGate(req, env);
  if (g.res) return g.res;
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  if (!(await wwEditOk(env, g.u))) return json({ error: 'تعديل القائمة مغلق من صاحب الموقع' }, 403);
  const word = wwNorm(cleanText(b.word)), act = String(b.act || '');
  if (!WW_ACTS.includes(act)) return json({ error: 'اختر الإجراء' }, 400);
  if (word.length < WW_MIN_LEN || word.length > WW_MAX_LEN) return json({ error: 'الكلمة من ' + WW_MIN_LEN + ' إلى ' + WW_MAX_LEN + ' حرفاً' }, 400);
  const ex = await env.DB.prepare('SELECT act FROM watch_words WHERE word=?').bind(word).first();
  if (!ex) {
    const c = await env.DB.prepare('SELECT COUNT(*) c FROM watch_words').first();
    if (c.c >= WW_MAX) return json({ error: 'وصلت للحد الأقصى (' + WW_MAX + ' كلمة)' }, 400);
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO watch_words(word,act,by_id,by_name,ts) VALUES(?,?,?,?,?) ON CONFLICT(word) DO UPDATE SET act=excluded.act, by_id=excluded.by_id, by_name=excluded.by_name, ts=excluded.ts')
      .bind(word, act, g.u.id, g.u.name, now),
    logStmt(env, g.u, 'ww_save', null, (ex ? 'تعديل' : 'إضافة') + ' | ' + word + ' ← ' + WW_ACT_AR[act], now),
  ]);
  return json({ ok: true });
}

async function wwDel(req, env) {
  const g = await wwGate(req, env);
  if (g.res) return g.res;
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  if (!(await wwEditOk(env, g.u))) return json({ error: 'تعديل القائمة مغلق من صاحب الموقع' }, 403);
  const w = await env.DB.prepare('SELECT word FROM watch_words WHERE id=?').bind(id).first();
  if (!w) return json({ ok: true });
  await env.DB.batch([
    env.DB.prepare('DELETE FROM watch_words WHERE id=?').bind(id),
    logStmt(env, g.u, 'ww_del', null, w.word, Date.now()),
  ]);
  return json({ ok: true });
}

// المنع الجماعي: لصاحب الموقع فقط
async function wwLock(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (u.role !== 'owner') return json({ error: 'غير مسموح' }, 403);
  const b = await readBody(req);
  if (!b || typeof b.on !== 'boolean') return json({ error: 'طلب غير صالح' }, 400);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO site_flags(k,v,by_id,ts) VALUES('ww_lock',?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, by_id=excluded.by_id, ts=excluded.ts").bind(b.on ? 1 : 0, u.id, now),
    logStmt(env, u, 'ww_lock', null, b.on ? 'إغلاق التعديل على الجميع' : 'فتح التعديل', now),
  ]);
  return json({ ok: true, lock: b.on });
}

// وضع الطوارئ: صف واحد في الجدول emergency. وجوده = كل الغرف للقراءة فقط لمن مستواه أقل من MOD_MIN.emergency.
// يملك الصلاحية المستوى 4 فأعلى (مشرف عام وما فوق)، وهم وحدهم يستمرون بالكتابة أثناءه. لا يمس room_modes، فعند الإنهاء تعود أوضاع الغرف كما كانت.
async function emergencySet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (lvOf(u) < MOD_MIN.emergency) return json({ error: 'لا تملك صلاحية وضع الطوارئ' }, 403);
  const b = await readBody(req);
  if (!b || typeof b.on !== 'boolean') return json({ error: 'طلب غير صالح' }, 400);
  const now = Date.now();
  const cur = await env.DB.prepare('SELECT ts FROM emergency WHERE id=1').first();
  if (b.on && !cur) {
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO emergency(id,by_id,by_name,ts) VALUES(1,?,?,?)').bind(u.id, u.name, now),
      logStmt(env, u, 'emergency', null, 'تفعيل وضع الطوارئ', now),
    ]);
    return json({ ok: true, emg: { on: true, ts: now } });
  }
  if (!b.on && cur) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM emergency WHERE id=1'),
      logStmt(env, u, 'emergency', null, 'إنهاء وضع الطوارئ', now),
    ]);
    return json({ ok: true, emg: null });
  }
  return json({ ok: true, emg: cur ? { on: true, ts: cur.ts } : null });
}

// ---------- المرحلة 6هـ: البلاغات والسجل والعقوبات الفعّالة والملاحظات ----------
const likeArg = (q) => '%' + String(q || '').slice(0, 40).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
const LK = " ESCAPE '\\'";

async function staffGate(req, env, action) {
  const u = await currentUser(req, env);
  if (!u) return { res: json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401) };
  if (lvOf(u) < MOD_MIN[action]) return { res: json({ error: 'لا تملك صلاحية عرض هذه البيانات' }, 403) };
  return { u };
}

// البلاغات: state = open | done | all، مع بحث وصفحات (before = آخر رقم وصل)
async function modReports(req, env, url) {
  const g = await staffGate(req, env, 'reports');
  if (g.res) return g.res;
  const st = url.searchParams.get('state') || 'open';
  const q = (url.searchParams.get('q') || '').trim();
  const before = parseInt(url.searchParams.get('before'), 10) || 0;
  const w = [], a = [];
  w.push(g.u.role === 'owner' && url.searchParams.get('h') === '1' ? 'r.hidden=1' : 'r.hidden=0');
  if (st === 'open') w.push('r.done=0'); else if (st === 'done') w.push('r.done=1');
  if (q) { w.push('(r.reason LIKE ?' + LK + ' OR tu.name LIKE ?' + LK + ' OR ru.name LIKE ?' + LK + ')'); const l = likeArg(q); a.push(l, l, l); }
  if (before) { w.push('r.id<?'); a.push(before); }
  const rows = (await env.DB.prepare('SELECT r.id,r.reason,r.ctx,r.ts,r.done,r.reporter_id,r.target_id,ru.name rname,tu.name tname,(SELECT COUNT(*) FROM user_reports x WHERE x.target_id=r.target_id AND x.done=0 AND x.hidden=0) open_n FROM user_reports r LEFT JOIN users ru ON ru.id=r.reporter_id LEFT JOIN users tu ON tu.id=r.target_id'
    + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY r.id DESC LIMIT 51').bind(...a).all()).results;
  return json({ rows: rows.slice(0, 50), more: rows.length > 50 });
}

async function modReportDone(req, env) {
  const g = await staffGate(req, env, 'reports');
  if (g.res) return g.res;
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  const done = b && b.done === false ? 0 : 1;
  const r = id ? await env.DB.prepare('SELECT r.id,r.target_id,tu.name tname FROM user_reports r LEFT JOIN users tu ON tu.id=r.target_id WHERE r.id=?').bind(id).first() : null;
  if (!r) return json({ error: 'البلاغ غير موجود' }, 404);
  await env.DB.batch([
    env.DB.prepare('UPDATE user_reports SET done=? WHERE id=?').bind(done, id),
    logStmt(env, g.u, done ? 'reportdone' : 'reportopen', { id: r.target_id, name: r.tname || '؟' }, '#' + id, Date.now()),
  ]);
  return json({ ok: true });
}

// سجل الإجراءات (بحث + صفحات)
async function modLogList(req, env, url) {
  const g = await staffGate(req, env, 'log');
  if (g.res) return g.res;
  const q = (url.searchParams.get('q') || '').trim();
  const before = parseInt(url.searchParams.get('before'), 10) || 0;
  const w = [], a = [];
  w.push(g.u.role === 'owner' && url.searchParams.get('h') === '1' ? 'hidden=1' : 'hidden=0');
  if (q) { w.push('(actor_name LIKE ?' + LK + ' OR target_name LIKE ?' + LK + ' OR action LIKE ?' + LK + ' OR detail LIKE ?' + LK + ')'); const l = likeArg(q); a.push(l, l, l, l); }
  if (before) { w.push('id<?'); a.push(before); }
  const rows = (await env.DB.prepare('SELECT id,actor_name,action,target_id,target_name,detail,ts FROM mod_log' + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY id DESC LIMIT 51').bind(...a).all()).results;
  return json({ rows: rows.slice(0, 50), more: rows.length > 50 });
}

// العقوبات الفعّالة الآن، وهل يستطيع المشاهد رفع كل واحدة (للأزرار فقط، والخادم يتحقق عند الرفع)
async function modSanctions(req, env, url) {
  const g = await staffGate(req, env, 'reports');
  if (g.res) return g.res;
  const u = g.u, now = Date.now();
  const q = (url.searchParams.get('q') || '').trim();
  const rows = (await env.DB.prepare("SELECT s.id,s.user_id,s.kind,s.room,s.reason,s.by_id,s.by_name,s.ts,s.until,t.name uname,t.role trole,t.rank trank,b.role brole,b.rank brank FROM sanctions s LEFT JOIN users t ON t.id=s.user_id LEFT JOIN users b ON b.id=s.by_id WHERE s.active=1 AND s.kind IN ('mute','kick','ban','revoke','shadow','nopm','slow') AND (s.until IS NULL OR s.until>?)"
    + (q ? ' AND t.name LIKE ?' + LK : '') + ' ORDER BY s.id DESC LIMIT 100').bind(...(q ? [now, likeArg(q)] : [now])).all()).results;
  let ipRows = [];
  if (lvOf(u) >= MOD_MIN.ipban) {
    const ir = (await env.DB.prepare('SELECT i.id,i.target_id,i.target_name,i.reason,i.by_id,i.by_name,i.ts,i.until,b.role brole,b.rank brank FROM ip_bans i LEFT JOIN users b ON b.id=i.by_id WHERE i.active=1 AND i.until>?'
      + (q ? ' AND i.target_name LIKE ?' + LK : '') + ' ORDER BY i.id DESC LIMIT 50').bind(...(q ? [now, likeArg(q)] : [now])).all()).results;
    ipRows = ir.map((x) => ({ id: x.id, uid: x.target_id, uname: x.target_name || '؟', kind: 'ipban', room: null, reason: x.reason || '', by: x.by_name, ts: x.ts, until: x.until >= 8e15 ? null : x.until,
      can: u.role === 'owner' || x.by_id === u.id || !x.brole || pwOf(u) >= pwOf({ role: x.brole, rank: x.brank || 0 }) }));
  }
  return json({
    rows: rows.map((x) => {
      const min = MOD_MIN[x.kind === 'ban' ? 'tempban' : x.kind];
      const can = lvOf(u) >= min && canMod(u, { id: x.user_id, role: x.trole || 'visitor', rank: x.trank || 0 }, min)
        && (u.role === 'owner' || x.by_id === u.id || !x.brole || pwOf(u) >= pwOf({ role: x.brole, rank: x.brank || 0 }));
      return { id: x.id, uid: x.user_id, uname: x.uname || '؟', kind: x.kind, room: x.room, reason: x.reason || '', by: x.by_name, ts: x.ts, until: x.until, can };
    }).concat(ipRows),
  });
}

// ملف المستخدم: سجل عقوباته + بلاغاته + الملاحظات السرية (للمشرفين فقط، ولا يراه صاحبه)
async function modHistory(req, env, url) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const g = await modGuard(env, u, parseInt(url.searchParams.get('target'), 10) || 0, 'history');
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  const r = await env.DB.batch([
    env.DB.prepare('SELECT kind,room,reason,by_name,ts,until,active FROM sanctions WHERE user_id=? ORDER BY id DESC LIMIT 50').bind(t.id),
    env.DB.prepare('SELECT id,by_name,text,ts FROM mod_notes WHERE target_id=? ORDER BY id DESC LIMIT 50').bind(t.id),
    env.DB.prepare('SELECT COUNT(*) total, SUM(CASE WHEN done=0 THEN 1 ELSE 0 END) open_n FROM user_reports WHERE target_id=? AND hidden=0').bind(t.id),
    env.DB.prepare("SELECT COUNT(*) c FROM sanctions WHERE user_id=? AND kind='warn' AND active=1 AND until>?").bind(t.id, now),
  ]);
  const rp = r[2].results[0] || {};
  return json({ name: t.name, sanctions: r[0].results, notes: r[1].results, reports: { total: rp.total || 0, open: rp.open_n || 0 }, warns: r[3].results[0].c, now });
}

async function modNote(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'note');
  if (g.res) return g.res;
  const text = cleanText(b.text).slice(0, 300);
  if (!text) return json({ error: 'اكتب الملاحظة' }, 400);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO mod_notes(target_id,by_id,by_name,text,ts) VALUES(?,?,?,?,?)').bind(g.t.id, u.id, u.name, text, now),
    logStmt(env, u, 'note', g.t, '', now),
  ]);
  return json({ ok: true });
}

async function modStats(req, env) {
  const g = await staffGate(req, env, 'stats');
  if (g.res) return g.res;
  const now = Date.now();
  const r = await env.DB.batch([
    env.DB.prepare('SELECT action,COUNT(*) c FROM mod_log WHERE hidden=0 AND ts>? GROUP BY action ORDER BY c DESC').bind(now - DAY),
    env.DB.prepare('SELECT action,COUNT(*) c FROM mod_log WHERE hidden=0 AND ts>? GROUP BY action ORDER BY c DESC').bind(now - 7 * DAY),
    env.DB.prepare('SELECT actor_name n,COUNT(*) c FROM mod_log WHERE hidden=0 AND ts>? GROUP BY actor_id ORDER BY c DESC LIMIT 5').bind(now - 7 * DAY),
    env.DB.prepare("SELECT kind,COUNT(*) c FROM sanctions WHERE active=1 AND kind IN ('mute','kick','ban','revoke','shadow','nopm','slow') AND (until IS NULL OR until>?) GROUP BY kind").bind(now),
    env.DB.prepare('SELECT COUNT(*) c FROM user_reports WHERE done=0 AND hidden=0'),
    env.DB.prepare('SELECT tu.name n,COUNT(*) c FROM user_reports r LEFT JOIN users tu ON tu.id=r.target_id WHERE r.hidden=0 AND r.ts>? GROUP BY r.target_id ORDER BY c DESC LIMIT 5').bind(now - 7 * DAY),
    env.DB.prepare('SELECT COUNT(*) c FROM ban_props WHERE state=0'),
    env.DB.prepare('SELECT COUNT(*) c FROM appeals WHERE state=0'),
  ]);
  return json({ d1: r[0].results, d7: r[1].results, top: r[2].results, active: r[3].results, openReports: r[4].results[0].c, repTop: r[5].results, openProps: r[6].results[0].c, openAppeals: r[7].results[0].c });
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
  if (r.iv) o.iv = r.iv;
  if (r.del) { o.del = r.del === 2 ? 2 : 1; o.text = ''; return o; }
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
  const an = parseInt(url.searchParams.get('an'), 10) || 0;   // آخر إعلان رآه المتصفح
  const now = Date.now();
  const vlv = lvOf(u);

  // عقوبات فعّالة (استعلام واحد): الطرد من هذه الغرفة يمنع القراءة، والكتم يُرسَل للواجهة
  const sc = (await env.DB.prepare("SELECT id,kind,room,reason,until FROM sanctions WHERE user_id=? AND active=1 AND kind IN ('mute','kick','warn','move') AND (until IS NULL OR until>?)")
    .bind(u.id, now).all()).results;
  const kk = sc.find((x) => x.kind === 'kick' && x.room === room);
  if (kk) return json({ error: sancMsg('kick', kk, now), kicked: true, room, until: kk.until }, 403);
  const mu = sc.find((x) => x.kind === 'mute');
  // نقل من مشرف: يُستهلك مرة واحدة ويُرجَع للمتصفح ليبدّل الغرفة
  const mv = sc.find((x) => x.kind === 'move');
  if (mv) {
    await env.DB.prepare('UPDATE sanctions SET active=0 WHERE id=?').bind(mv.id).run();
    if (mv.room !== room) return json({ move: mv.room });
  }
  const warns = sc.filter((x) => x.kind === 'warn').length;

  if (url.searchParams.get('hb') === '1') {
    await env.DB.prepare(
      'INSERT INTO presence(user_id,room,ts) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET room=excluded.room, ts=excluded.ts'
    ).bind(u.id, room, now).run();
  }

  // المتجاهَلون لا تصل رسائلهم من الخادم أصلاً (يُفلتَر هنا وليس في المتصفح)
  const sel = 'SELECT m.id,m.user_id,m.uname,m.text,m.rn,m.rt,m.rid,m.ts,m.kind,m.ed,m.del,m.pl,m.orig,u.role,u.rank,pf.iv FROM messages m LEFT JOIN users u ON u.id=m.user_id LEFT JOIN profiles pf ON pf.user_id=m.user_id ';
  const ign = ' AND m.user_id NOT IN (' + IGN_SQL + ') ';
  let msgs;
  if (after > 0) {
    msgs = (await env.DB.prepare(sel + 'WHERE m.room=? AND m.id>? AND m.ts>? AND m.del<2' + ign + 'ORDER BY m.id LIMIT 100')
      .bind(room, after, now - KEEP, u.id).all()).results;
  } else {
    msgs = (await env.DB.prepare(sel + 'WHERE m.room=? AND m.ts>? AND m.del<2' + ign + 'ORDER BY m.id DESC LIMIT ' + HISTORY)
      .bind(room, now - KEEP, u.id).all()).results.reverse();
  }
  // رسائل قديمة تغيّرت (تعديل/حذف/تفاعل/تصويت) منذ آخر نبضة
  let upd = [];
  if (after > 0 && ut > 0) {
    upd = (await env.DB.prepare(sel + 'WHERE m.room=? AND m.id<=? AND m.upd>? AND m.ts>?' + ign + 'ORDER BY m.upd LIMIT 100')
      .bind(room, after, ut, now - KEEP, u.id).all()).results;
  }
  if (vlv < 2) {
    const shw = new Set((await env.DB.prepare("SELECT user_id FROM sanctions WHERE kind='shadow' AND active=1 AND (until IS NULL OR until>?)").bind(now).all()).results.map((x) => x.user_id));
    if (shw.size) {
      const hide = (r) => { if (r.user_id !== u.id && shw.has(r.user_id)) { r.del = 2; r.user_id = 0; r.uname = ''; r.text = ''; r.kind = null; r.role = null; r.rank = 0; r.iv = 0; } };
      msgs.forEach(hide); upd.forEach(hide);
    }
  }
  const all = msgs.concat(upd);
  await attachRx(env, 'r', all);
  await attachPolls(env, all);

  const online = (await env.DB.prepare(
    'SELECT u.id,u.name,u.role,u.rank,u.age,u.gender,u.country,u.lang,u.created_at,p.room,rm.room mroom,pf.bio,pf.st,pf.iv,pf.cv FROM presence p JOIN users u ON u.id=p.user_id LEFT JOIN room_mods rm ON rm.user_id=u.id LEFT JOIN profiles pf ON pf.user_id=u.id WHERE p.ts>? ORDER BY p.ts DESC LIMIT 300'
  ).bind(now - ONLINE_MS).all()).results;
  // حالة الكتم وسحب الصلاحيات لكل المستخدمين (الأسباب لصاحب العلاقة وللمشرفين فقط)
  const sx = (await env.DB.prepare("SELECT s.user_id id,s.kind k,s.until,s.reason,s.by_id,s.by_name,b.role brole,b.rank brank FROM sanctions s LEFT JOIN users b ON b.id=s.by_id WHERE s.active=1 AND s.kind IN ('mute','revoke','shadow','nopm','slow') AND (s.until IS NULL OR s.until>?) LIMIT 300")
    .bind(now).all()).results.filter((x) => (x.k === 'shadow' ? vlv >= 2 : SELF_VISIBLE.includes(x.k) ? (x.id === u.id || vlv >= 2) : true)).map((x) => {
      const see = x.id === u.id || vlv >= 2;
      return { id: x.id, k: x.k, until: x.until || 0, reason: see ? x.reason || '' : '', by: see ? x.by_id : 0, byName: see ? x.by_name : '',
        bp: x.k === 'revoke' ? pwOf({ role: x.brole || 'visitor', rank: x.brank || 0 }) : 0 };
    });
  const pm_ = (await env.DB.prepare("SELECT 'p' k, text v FROM pins WHERE room=? UNION ALL SELECT 'm', mode FROM room_modes WHERE room=? "
    + "UNION ALL SELECT 'e', json_object('ts',ts) FROM emergency WHERE id=1 "
    + "UNION ALL SELECT 'a', json_object('id',a.id,'text',a.text,'dur',a.dur,'ts',a.ts,'by',a.by_id,'name',COALESCE(x.name,''),'role',COALESCE(x.role,'visitor'),'rank',COALESCE(x.rank,0),'iv',COALESCE(f.iv,0)) "
    + "FROM announcements a LEFT JOIN users x ON x.id=a.by_id LEFT JOIN profiles f ON f.user_id=a.by_id WHERE a.id=(SELECT MAX(id) FROM announcements) AND a.id>? AND a.ts>?").bind(room, room, an, now - 20000).all()).results;
  const pin = pm_.find((x) => x.k === 'p'), rmd = pm_.find((x) => x.k === 'm'), emr = pm_.find((x) => x.k === 'e'), anr = pm_.find((x) => x.k === 'a');
  let emg = null;
  try { emg = emr ? { on: true, ...JSON.parse(emr.v) } : null; } catch { emg = null; }
  let annv = null;
  try { annv = anr ? JSON.parse(anr.v) : null; } catch { annv = null; }
  const out = { msgs: msgs.map((r) => msgRow(r, vlv)), upd: upd.map((r) => msgRow(r, vlv)), pin: pin ? pin.v : null, rmode: rmd ? rmd.v : 'normal', emg, ann: annv, online, now, mute: mu ? { until: mu.until || 0, reason: mu.reason || '' } : null, warns, sx };
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
  const mt = await activeSanction(env, u.id, 'mute', null, Date.now());
  if (mt) return json({ error: sancMsg('mute', mt, Date.now()) }, 403);
  const text = cleanText(b.text);
  if (!text) return json({ error: 'الرسالة فارغة' }, 400);
  if (text.length > MAX_TEXT) return json({ error: 'الرسالة طويلة (الحد ' + MAX_TEXT + ' حرف)' }, 400);
  const np = await env.DB.prepare("SELECT user_id FROM sanctions WHERE kind='nopm' AND active=1 AND (until IS NULL OR until>?) AND user_id IN (?,?)").bind(Date.now(), u.id, to).first();
  if (np) return json({ error: np.user_id === u.id ? 'تم منعك من الرسائل الخاصة' : 'الخاص ممنوع مع هذا المستخدم' }, 403);
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
    const vp = await env.DB.prepare('SELECT hv,gh FROM visit_prefs WHERE user_id=?').bind(me).first();
    out.vp = { hide: vp ? vp.hv : 0, ghost: vp ? vp.gh : 0 };
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
  const mt = await activeSanction(env, u.id, 'mute', null, now);
  if (mt) return json({ error: sancMsg('mute', mt, now) }, 403);
  const kc = await activeSanction(env, u.id, 'kick', room, now);
  if (kc) return json({ error: sancMsg('kick', kc, now), kicked: true }, 403);
  if (lvOf(u) < 2 && await activeSanction(env, u.id, 'slow', null, now)) {
    const recent = await env.DB.prepare('SELECT 1 x FROM messages WHERE user_id=? AND ts>? LIMIT 1').bind(u.id, now - USER_SLOW_MS).first();
    if (recent) return json({ error: 'وضع بطيء عليك: رسالة كل ' + USER_SLOW_MS / 1000 + ' ثانية' }, 429);
  }
  if (lvOf(u) < MOD_MIN.emergency && await env.DB.prepare('SELECT 1 x FROM emergency WHERE id=1').first()) return json({ error: 'وضع الطوارئ مفعّل: الكتابة متوقفة مؤقتاً' }, 403);
  const md = await env.DB.prepare('SELECT mode FROM room_modes WHERE room=?').bind(room).first();
  if (md && !(lvOf(await uIn(env, u, room)) >= 3)) {
    if (md.mode === 'ro') return json({ error: 'الغرفة للقراءة فقط حالياً' }, 403);
    if (md.mode === 'slow') {
      const lt = await env.DB.prepare('SELECT MAX(ts) t FROM messages WHERE user_id=? AND room=?').bind(u.id, room).first();
      if (lt && lt.t && now - lt.t < SLOW_MS) return json({ error: 'الوضع بطيء: رسالة كل ' + SLOW_MS / 1000 + ' ثوانٍ' }, 429);
    }
  }
  const r = await env.DB.prepare('SELECT COUNT(*) c FROM messages WHERE user_id=? AND ts>?').bind(u.id, now - 5000).first();
  if (r.c >= 4) return json({ error: 'أبطئ قليلاً، رسائلك كثيرة' }, 429);
  const wh = await wwCheck(env, u, text);
  if (wh) return await wwApply(env, u, wh, now);

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
      if (lvOf(await uIn(env, u, room)) < 3) return json({ error: 'أمر الاستطلاع للمشرفين فقط' }, 403);
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
    if (scope === 'p' || !canMod(await uIn(env, u, m.room), { id: m.user_id, role: m.role || 'visitor', rank: m.rank || 0 }, 2)) {
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
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  const m = id ? await env.DB.prepare('SELECT id,room,text,del,kind FROM messages WHERE id=?').bind(id).first() : null;
  if (!m || m.del || m.kind === 'sys') return json({ error: 'الرسالة غير موجودة' }, 404);
  if (lvOf(await uIn(env, u, m.room)) < 3) return json({ error: 'التثبيت للمشرفين فقط' }, 403);
  await env.DB.prepare('INSERT INTO pins(room,mid,text,by_id,ts) VALUES(?,?,?,?,?) ON CONFLICT(room) DO UPDATE SET mid=excluded.mid, text=excluded.text, by_id=excluded.by_id, ts=excluded.ts')
    .bind(m.room, m.id, m.text.slice(0, 300), u.id, Date.now()).run();
  return json({ ok: true });
}

async function pinClear(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  const room = String((b && b.room) || '');
  if (!ROOMS.includes(room)) return json({ error: 'غرفة غير موجودة' }, 400);
  if (lvOf(await uIn(env, u, room)) < 3) return json({ error: 'التثبيت للمشرفين فقط' }, 403);
  await env.DB.prepare('DELETE FROM pins WHERE room=?').bind(room).run();
  return json({ ok: true });
}

// ---------- المرحلة 7أ: الملف الشخصي (الصورة والخلفية والنبذة والحالة) ----------
const PF_ST = ['متاح', 'مشغول', 'بعيد'];
const MAX_BIO = 60;
const PF_MAX = { img: 90000, cover: 260000 };   // أقصى طول للصورة (base64) بعد التصغير في المتصفح
const PF_GAP = 2000;                            // أدنى فاصل بين تعديلين للملف
const JPEG_RE = /^data:image\/jpeg;base64,([A-Za-z0-9+\/]+={0,2})$/;
// يقبل JPEG فقط (المتصفح يحوّل كل صورة إلى JPEG قبل الرفع). يرجع نص base64 أو null
function jpegB64(v, key) {
  if (typeof v !== 'string' || v.length > PF_MAX[key] + 40) return null;
  const m = JPEG_RE.exec(v);
  if (!m || m[1].length > PF_MAX[key] || m[1].length % 4 !== 0 || !m[1].startsWith('/9j/')) return null;
  return m[1];
}

// حفظ ملف المستخدم نفسه. الحقول اختيارية: img / cover (data URL أو null للحذف) و bio و st
async function profileSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (lvOf(u) < 1) return json({ error: 'الملف الشخصي للأعضاء فقط، سجّل كعضو' }, 403);
  const b = await readBody(req);
  if (!b || typeof b !== 'object') return json({ error: 'طلب غير صالح' }, 400);
  const now = Date.now();
  const sets = [], vals = [], out = {};
  for (const k of ['img', 'cover']) {
    if (!(k in b)) continue;
    const ver = k === 'img' ? 'iv' : 'cv';
    if (b[k] === null) { sets.push(k + '=NULL', ver + '=0'); out[ver] = 0; continue; }
    const d = jpegB64(b[k], k);
    if (!d) return json({ error: k === 'img' ? 'الصورة الشخصية غير صالحة أو كبيرة' : 'صورة الخلفية غير صالحة أو كبيرة' }, 400);
    sets.push(k + '=?', ver + '=?'); vals.push(d, now); out[ver] = now;
  }
  if ('bio' in b) {
    const v = cleanText(b.bio).replace(/\s+/g, ' ').slice(0, MAX_BIO);
    sets.push('bio=?'); vals.push(v); out.bio = v;
  }
  if ('st' in b) {
    if (!PF_ST.includes(b.st)) return json({ error: 'حالة غير صالحة' }, 400);
    sets.push('st=?'); vals.push(b.st); out.st = b.st;
  }
  if (!sets.length) return json({ error: 'لا شيء للحفظ' }, 400);
  const cur = await env.DB.prepare('SELECT upd FROM profiles WHERE user_id=?').bind(u.id).first();
  if (cur && now - cur.upd < PF_GAP) return json({ error: 'انتظر لحظة قبل التعديل مرة أخرى' }, 429);
  const st = [];
  if (!cur) st.push(env.DB.prepare('INSERT OR IGNORE INTO profiles(user_id) VALUES(?)').bind(u.id));
  st.push(env.DB.prepare('UPDATE profiles SET ' + sets.join(',') + ',upd=? WHERE user_id=?').bind(...vals, now, u.id));
  await env.DB.batch(st);
  return json({ ok: true, ...out });
}

// قراءة ملف أي مستخدم (النبذة والحالة ونسخ الصور، دون الصور نفسها)
async function profileGet(req, env, url) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const id = parseInt(url.searchParams.get('id'), 10) || 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  if (url.searchParams.get('v') === '1' && id !== u.id && lvOf(u) >= 1) await recordVisit(env, u, id, Date.now());
  const rs = await env.DB.batch([
    env.DB.prepare('SELECT bio,st,iv,cv FROM profiles WHERE user_id=?').bind(id),
    env.DB.prepare('SELECT COUNT(*) n FROM likes WHERE target_id=?').bind(id),
    env.DB.prepare('SELECT 1 x FROM likes WHERE user_id=? AND target_id=?').bind(u.id, id),
    env.DB.prepare('SELECT COUNT(*) n FROM gifts WHERE to_id=?').bind(id),
  ]);
  const r = rs[0].results[0];
  return json({ ok: true, id, bio: r ? r.bio : '', st: r ? r.st : 'متاح', iv: r ? r.iv : 0, cv: r ? r.cv : 0, lkn: rs[1].results[0].n, liked: rs[2].results.length ? 1 : 0, gn: rs[3].results[0].n });
}

// الصورة نفسها: تُجلب برابط يحمل رقم النسخة فيخزّنها المتصفح، ولا تدخل في الاستطلاع الدوري
async function profileImg(req, env, url) {
  const u = await currentUser(req, env);
  if (!u) return new Response('', { status: 401, headers: { 'cache-control': 'no-store' } });
  const id = parseInt(url.searchParams.get('u'), 10) || 0;
  const k = url.searchParams.get('k') === 'cover' ? 'cover' : 'img';
  const r = id ? await env.DB.prepare('SELECT ' + k + ' d FROM profiles WHERE user_id=?').bind(id).first() : null;
  if (!r || !r.d) return new Response('', { status: 404, headers: { 'cache-control': 'no-store' } });
  const bin = atob(r.d), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}

// حذف صورة المستخدم وخلفيته ونبذته: مشرف عام فأعلى، ويُسجَّل ويصل صاحبه إشعار
async function modDelImg(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'delimg');
  if (g.res) return g.res;
  const t = g.t, now = Date.now();
  const reason = cleanText(b.reason).slice(0, MAX_REASON);
  const cur = await env.DB.prepare('SELECT iv,cv,bio FROM profiles WHERE user_id=?').bind(t.id).first();
  if (!cur || (!cur.iv && !cur.cv && !cur.bio)) return json({ error: 'لا توجد صورة ولا نبذة لحذفها' }, 400);
  const what = [cur.iv ? 'الصورة' : '', cur.cv ? 'الخلفية' : '', cur.bio ? 'النبذة' : ''].filter(Boolean).join(' و');
  await env.DB.batch([
    env.DB.prepare("UPDATE profiles SET img=NULL, cover=NULL, bio='', iv=0, cv=0, upd=? WHERE user_id=?").bind(now, t.id),
    logStmt(env, u, 'delimg', t, what + (reason ? ' | ' + reason : ''), now),
    notifStmt(env, t.id, 'warn', 'تم حذف ' + what + ' من ملفك بواسطة ' + u.name + (reason ? ': ' + reason : ''), null, now),
  ]);
  return json({ ok: true });
}

// ---------- المرحلة 7ب: الإعجابات ----------
// إعجاب واحد لكل شخص على كل ملف. on=true يضيف و on=false يلغي. الإشعار مرة واحدة كل 24 ساعة لكل معجَب، ولا يصل إن كان صاحب الملف يتجاهل المعجِب
async function likeSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (lvOf(u) < 1) return json({ error: 'الإعجاب للأعضاء فقط، سجّل كعضو' }, 403);
  const b = await readBody(req);
  const tid = parseInt(b && b.target, 10) || 0;
  if (!tid) return json({ error: 'طلب غير صالح' }, 400);
  if (tid === u.id) return json({ error: 'لا يمكنك الإعجاب بملفك' }, 400);
  const t = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(tid).first();
  if (!t) return json({ error: 'المستخدم غير موجود' }, 404);
  const now = Date.now(), on = !!b.on;
  const ex = await env.DB.prepare('SELECT ts FROM likes WHERE user_id=? AND target_id=?').bind(u.id, tid).first();
  if (on && !ex) {
    const f = await env.DB.prepare("SELECT (SELECT 1 FROM ignores WHERE user_id=? AND target_id=?) ig, (SELECT 1 FROM notifications WHERE user_id=? AND ty='like' AND ref=? AND ts>?) dup")
      .bind(tid, u.id, tid, u.id, now - DAY).first();
    const st = [env.DB.prepare('INSERT OR IGNORE INTO likes(user_id,target_id,ts) VALUES(?,?,?)').bind(u.id, tid, now)];
    if (!f.ig && !f.dup) st.push(notifStmt(env, tid, 'like', u.name + ' أعجب بملفك الشخصي', u.id, now));
    await env.DB.batch(st);
  } else if (!on && ex) {
    if (now - ex.ts < 2000) return json({ error: 'انتظر لحظة قبل إلغاء الإعجاب' }, 429);
    await env.DB.prepare('DELETE FROM likes WHERE user_id=? AND target_id=?').bind(u.id, tid).run();
  }
  const c = await env.DB.prepare('SELECT COUNT(*) n FROM likes WHERE target_id=?').bind(tid).first();
  return json({ ok: true, liked: on ? 1 : 0, n: c.n });
}

// ---------- المرحلة 7ج: الهدايا ----------
// ترتيب القائمة هو رقم الهدية (يرسل المتصفح الرقم فقط، والخادم يحدّد الرمز والاسم). الهدايا مجانية حالياً حتى ينتقل المتجر للخادم
const GIFT_LIST = [['🌹', 'وردة'], ['🏆', 'كأس'], ['💎', 'ألماس'], ['🎂', 'كعكة'], ['☕', 'قهوة'], ['🧸', 'دبدوب'], ['👑', 'تاج'], ['⭐', 'نجمة']];
const GIFT_DAY = 30;      // أقصى عدد هدايا يرسلها المستخدم في اليوم
const GIFT_GAP = 3000;    // أدنى فاصل بين هديتين
const GIFT_SHOW = 100;    // عدد الهدايا المعروضة في الملف (الأحدث)

async function giftSend(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (lvOf(u) < 1) return json({ error: 'الزائر لا يستطيع إرسال هدايا. سجّل كعضو' }, 403);
  const b = await readBody(req);
  const tid = parseInt(b && b.target, 10) || 0;
  const gi = parseInt(b && b.g, 10);
  if (!tid || !(gi >= 0 && gi < GIFT_LIST.length)) return json({ error: 'طلب غير صالح' }, 400);
  if (tid === u.id) return json({ error: 'لا يمكنك إهداء نفسك' }, 400);
  const t = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(tid).first();
  if (!t) return json({ error: 'المستخدم غير موجود' }, 404);
  const now = Date.now();
  const f = await env.DB.prepare('SELECT (SELECT 1 FROM ignores WHERE user_id=? AND target_id=?) ig, (SELECT COUNT(*) FROM gifts WHERE from_id=? AND ts>?) c, (SELECT MAX(ts) FROM gifts WHERE from_id=?) m')
    .bind(tid, u.id, u.id, now - DAY, u.id).first();
  if (f.ig) return json({ error: 'تعذر إرسال الهدية لهذا المستخدم' }, 403);
  if (f.m && now - f.m < GIFT_GAP) return json({ error: 'انتظر لحظة قبل إرسال هدية أخرى' }, 429);
  if (f.c >= GIFT_DAY) return json({ error: 'وصلت للحد اليومي (' + GIFT_DAY + ' هدية)' }, 429);
  const [e, n] = GIFT_LIST[gi];
  const rs = await env.DB.batch([
    env.DB.prepare('INSERT INTO gifts(to_id,from_id,gid,ts) VALUES(?,?,?,?)').bind(tid, u.id, gi, now),
    notifStmt(env, tid, 'gift', u.name + ' أهداك ' + e + ' ' + n, u.id, now),
    env.DB.prepare('SELECT COUNT(*) n FROM gifts WHERE to_id=?').bind(tid),
  ]);
  return json({ ok: true, id: rs[0].meta.last_row_id, n: rs[2].results[0].n });
}

async function giftList(req, env, url) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const id = parseInt(url.searchParams.get('id'), 10) || 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const rs = await env.DB.batch([
    env.DB.prepare('SELECT g.id,g.gid,g.ts,u.name fname FROM gifts g LEFT JOIN users u ON u.id=g.from_id WHERE g.to_id=? ORDER BY g.id DESC LIMIT ' + GIFT_SHOW).bind(id),
    env.DB.prepare('SELECT COUNT(*) n FROM gifts WHERE to_id=?').bind(id),
  ]);
  const list = rs[0].results.map((r) => {
    const g = GIFT_LIST[r.gid] || ['🎁', 'هدية'];
    return { id: r.id, e: g[0], n: g[1], from: r.fname || '؟', ts: r.ts };
  });
  return json({ ok: true, n: rs[1].results[0].n, list });
}

// حذف هدية من ملفي (المستلم فقط)
async function giftDelete(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const r = await env.DB.prepare('DELETE FROM gifts WHERE id=? AND to_id=?').bind(id, u.id).run();
  if (!r.meta || !r.meta.changes) return json({ error: 'الهدية غير موجودة' }, 404);
  const n = await env.DB.prepare('SELECT COUNT(*) n FROM gifts WHERE to_id=?').bind(u.id).first();
  return json({ ok: true, n: n.n });
}

// ---------- المرحلة 7د: الزيارات ----------
// صف واحد لكل زائر على كل ملف (آخر زيارة). يُفرض الإخفاء ووضع الشبح هنا وليس في المتصفح
const VISIT_NOTIF_GAP = DAY;   // إشعار الزيارة: مرة كل 24 ساعة لكل زائر على كل ملف
const VISIT_NOTIF_MAX = 20;    // لا يُضاف إشعار زيارة إن كان عند صاحب الملف 20 غير مقروء
const VISIT_GAP = 60000;   // لا يُحدَّث وقت الزيارة إن كانت السابقة أحدث من دقيقة
const VISIT_SHOW = 30;
async function ghostOk(env, u) {
  if (lvOf(u) >= 2) return true;
  return !!(await env.DB.prepare('SELECT 1 x FROM room_mods WHERE user_id=?').bind(u.id).first());
}
async function recordVisit(env, u, tid, now) {
  const f = await env.DB.prepare('SELECT (SELECT hv FROM visit_prefs WHERE user_id=?) hv, (SELECT gh FROM visit_prefs WHERE user_id=?) gh, (SELECT 1 FROM ignores WHERE user_id=? AND target_id=?) ig, (SELECT 1 FROM users WHERE id=?) ex, (SELECT 1 FROM room_mods WHERE user_id=?) rm')
    .bind(u.id, u.id, tid, u.id, tid, u.id).first();
  if (!f.ex || f.hv || f.ig) return;                    // الهدف غير موجود | الزائر يخفي زياراته | الهدف يتجاهل الزائر
  if (f.gh && (lvOf(u) >= 2 || f.rm)) return;           // وضع الشبح للإشراف فقط
  // الإشعار أولاً (يفحص قبل تحديث الصف)، ثم تسجيل الزيارة وتحديث وقت آخر إشعار
  await env.DB.batch([
    env.DB.prepare("INSERT INTO notifications(user_id,ty,text,ref,ts) SELECT ?,'visit',?,?,? WHERE NOT EXISTS (SELECT 1 FROM visits WHERE target_id=? AND visitor_id=? AND nts>?) AND (SELECT COUNT(*) FROM notifications WHERE user_id=? AND ty='visit' AND rd=0)<?")
      .bind(tid, u.name + ' زار ملفك الشخصي', u.id, now, tid, u.id, now - VISIT_NOTIF_GAP, tid, VISIT_NOTIF_MAX),
    env.DB.prepare('INSERT INTO visits(target_id,visitor_id,ts,nts) VALUES(?,?,?,?) ON CONFLICT(target_id,visitor_id) DO UPDATE SET nts=CASE WHEN visits.nts<excluded.ts-? THEN excluded.ts ELSE visits.nts END, ts=excluded.ts WHERE visits.ts<excluded.ts-? OR visits.nts<excluded.ts-?')
      .bind(tid, u.id, now, now, VISIT_NOTIF_GAP, VISIT_GAP, VISIT_NOTIF_GAP),
  ]);
}

// من زار ملفي (الأحدث 30)، مع حالة الإخفاء ووضع الشبح
async function visitsGet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const rs = await env.DB.batch([
    env.DB.prepare('SELECT v.visitor_id id,x.name,v.ts FROM visits v JOIN users x ON x.id=v.visitor_id WHERE v.target_id=? AND v.ts>? AND v.visitor_id NOT IN (' + IGN_SQL + ') ORDER BY v.ts DESC LIMIT ' + VISIT_SHOW)
      .bind(u.id, Date.now() - KEEP, u.id),
    env.DB.prepare('SELECT hv,gh FROM visit_prefs WHERE user_id=?').bind(u.id),
  ]);
  const p = rs[1].results[0];
  return json({ ok: true, list: rs[0].results.map((r) => ({ id: r.id, n: r.name, ts: r.ts })), hide: p ? p.hv : 0, ghost: p ? p.gh : 0 });
}

// تغيير الإخفاء (للجميع) أو وضع الشبح (للإشراف فقط)
async function visitsPrefs(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b || typeof b !== 'object' || !('hide' in b || 'ghost' in b)) return json({ error: 'طلب غير صالح' }, 400);
  const cur = await env.DB.prepare('SELECT hv,gh FROM visit_prefs WHERE user_id=?').bind(u.id).first();
  const hv = 'hide' in b ? (b.hide ? 1 : 0) : (cur ? cur.hv : 0);
  let gh = 'ghost' in b ? (b.ghost ? 1 : 0) : (cur ? cur.gh : 0);
  if ('ghost' in b && gh && !(await ghostOk(env, u))) return json({ error: 'وضع الشبح للإشراف فقط' }, 403);
  await env.DB.prepare('INSERT INTO visit_prefs(user_id,hv,gh) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET hv=excluded.hv, gh=excluded.gh').bind(u.id, hv, gh).run();
  return json({ ok: true, hide: hv, ghost: gh });
}

// ---------- المرحلة 7هـ: الإعلانات ----------
// من يملك الصلاحية (كما في الواجهة): مشرف عام فأعلى، أو عضو رتبته 90 فأكثر، وليس مسحوب الصلاحيات
const canAnnounce = (u) => !u.rv && (lvBase(u) >= 4 || (u.role === 'member' && (u.rank || 0) >= 90));
const ANN_MAX_TEXT = 200;
const ANN_GAP = 30000;    // أدنى فاصل بين إعلانين من المشرف نفسه
async function announceSend(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (!canAnnounce(u)) return json({ error: 'الإعلانات للمشرفين فقط' }, 403);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const text = cleanText(b.text).replace(/\s+/g, ' ').slice(0, ANN_MAX_TEXT);
  if (!text) return json({ error: 'اكتب نص الإعلان' }, 400);
  const dur = Math.min(20, Math.max(10, parseInt(b.dur, 10) || 15));
  const now = Date.now();
  const f = await env.DB.prepare('SELECT (SELECT MAX(ts) FROM announcements WHERE by_id=?) m, (SELECT iv FROM profiles WHERE user_id=?) iv').bind(u.id, u.id).first();
  if (f.m && now - f.m < ANN_GAP) return json({ error: 'انتظر قليلاً قبل إعلان آخر' }, 429);
  const rs = await env.DB.batch([
    env.DB.prepare('INSERT INTO announcements(by_id,text,dur,ts) VALUES(?,?,?,?)').bind(u.id, text, dur, now),
    logStmt(env, u, 'announce', null, dur + ' ث | ' + text, now),
  ]);
  return json({ ok: true, ann: { id: rs[0].meta.last_row_id, text, dur, ts: now, by: u.id, name: u.name, role: u.role, rank: u.rank || 0, iv: f.iv || 0 } });
}

// ---------- المرحلة 6و: حظر الجهاز / IP + اقتراح الحظر + التظلّمات ----------
// لا يوجد حظر دائم: كل حظر بمدة إلزامية. وحظر الجهاز بلا سقف أقصى للمدة (الحد الوحيد حدّ الوقت التقني).
const MAX_TS = 8.64e15;           // أقصى وقت يقبله Date
const PROP_OPEN_MAX = 3;          // اقتراحات معلّقة لكل مقترِح
const APPEAL_GAP = 6 * 36e5;      // 6 ساعات بين تظلّمين
const APPEAL_KINDS = ['ban', 'mute', 'kick', 'revoke', 'nopm', 'slow'];
const STAFF_Q = "role IN ('owner','programmer','super') OR (role='member' AND rank>=";

// لا يُحفظ العنوان نصاً في جدول الحظر، بل بصمته (يُفضَّل تعيين سرّ IP_SALT في إعدادات Worker)
async function ipHash(env, ip) { return await sha256('ipban:' + (env.IP_SALT || '') + ':' + ip); }
async function ipBanned(env, ip, now) {
  if (!ip || ip === 'unknown') return null;
  return await env.DB.prepare('SELECT id,reason,until FROM ip_bans WHERE ip_hash=? AND active=1 AND until>? ORDER BY until DESC LIMIT 1').bind(await ipHash(env, ip), now).first();
}
function leftTx(m) { return m >= 2880 ? Math.ceil(m / 1440) + ' يوماً' : m >= 120 ? Math.ceil(m / 60) + ' ساعة' : m + ' دقيقة'; }
function ipMsg(b, now) {
  const left = Math.max(1, Math.ceil((b.until - now) / 6e4));
  return 'هذا الجهاز أو الشبكة محظور' + (b.until < 8e15 ? ' لمدة ' + leftTx(left) + ' متبقية' : '') + (b.reason ? ' — السبب: ' + b.reason : '');
}

// يُنفَّذ حظر الجهاز: يحفظ بصمة آخر عنوان للهدف ويقطع جلسات حساباته المشاركة له
async function ipBanRun(env, actor, t, minutes, reason, now) {
  if (lvBase({ role: t.role, rank: t.rank }) >= 2) return { err: 'حظر الجهاز لا يسري على المشرفين، استخدم حظر الحساب' };
  const tu = await env.DB.prepare('SELECT last_ip FROM users WHERE id=?').bind(t.id).first();
  const ip = tu && tu.last_ip;
  if (!ip || ip === 'unknown') return { err: 'لا يوجد عنوان مسجَّل لهذا المستخدم' };
  const au = await env.DB.prepare('SELECT last_ip FROM users WHERE id=?').bind(actor.id).first();
  if (au && au.last_ip === ip) return { err: 'عنوانك مطابق لعنوان الهدف، فحظره سيحظرك أنت أيضاً' };
  const until = Math.min(now + minutes * 6e4, MAX_TS);
  const h = await ipHash(env, ip);
  const same = (await env.DB.prepare('SELECT id,role,rank FROM users WHERE last_ip=?').bind(ip).all()).results;
  const hit = same.filter((x) => x.id === t.id || (lvBase(x) < 2 && canMod(actor, x, MOD_MIN.ipban)));
  const st = [
    env.DB.prepare('UPDATE ip_bans SET active=0, lifted_by=?, lifted_ts=? WHERE ip_hash=? AND active=1').bind(actor.id, now, h),
    env.DB.prepare('INSERT INTO ip_bans(ip_hash,target_id,target_name,reason,by_id,by_name,ts,until) VALUES(?,?,?,?,?,?,?,?)').bind(h, t.id, t.name, reason, actor.id, actor.name, now, until),
    logStmt(env, actor, 'ipban', t, (until >= 8e15 ? 'بلا نهاية قريبة' : 'حتى ' + new Date(until).toISOString()) + ' | ' + hit.length + ' حساب | ' + reason, now),
  ];
  for (const x of hit) {
    st.push(env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(x.id));
    st.push(env.DB.prepare('DELETE FROM presence WHERE user_id=?').bind(x.id));
  }
  await env.DB.batch(st);
  return { until, n: hit.length };
}

async function modIpBan(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'ipban');
  if (g.res) return g.res;
  const m = Math.floor(Number(b.minutes) || 0);
  if (m <= 0) return json({ error: 'حظر الجهاز يحتاج مدة (لا يوجد حظر دائم)' }, 400);
  const reason = cleanText(b.reason).slice(0, MAX_REASON);
  if (!reason) return json({ error: 'اكتب سبب الحظر' }, 400);
  const r = await ipBanRun(env, u, g.t, m, reason, Date.now());
  return r.err ? json({ error: r.err }, 400) : json({ ok: true, until: r.until, n: r.n });
}

// رفع حظر جهاز بالرقم (يظهر في تبويب العقوبات). لا يرفعه من هو أدنى ممن وضعه إلا المالك أو صاحبه
async function modIpLift(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (lvOf(u) < MOD_MIN.ipban) return json({ error: 'لا تملك صلاحية هذا الإجراء' }, 403);
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0, now = Date.now();
  const r = id ? await env.DB.prepare('SELECT i.id,i.target_id,i.target_name,i.by_id,p.role prole,p.rank prank FROM ip_bans i LEFT JOIN users p ON p.id=i.by_id WHERE i.id=? AND i.active=1 AND i.until>?').bind(id, now).first() : null;
  if (!r) return json({ error: 'لا يوجد حظر جهاز فعّال بهذا الرقم' }, 404);
  if (u.role !== 'owner' && r.by_id !== u.id && r.prole && pwOf(u) < pwOf({ role: r.prole, rank: r.prank || 0 })) return json({ error: 'وضعه من هو أعلى منك، ولا تستطيع رفعه' }, 403);
  await env.DB.batch([
    env.DB.prepare('UPDATE ip_bans SET active=0, lifted_by=?, lifted_ts=? WHERE id=? AND active=1').bind(u.id, now, id),
    logStmt(env, u, 'unipban', { id: r.target_id, name: r.target_name || '؟' }, '#' + id, now),
  ]);
  return json({ ok: true });
}

// الحسابات المرتبطة بنفس العنوان (حقيقية). رقم العنوان نفسه للمبرمج وصاحب الموقع فقط
async function modLinked(req, env, url) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const g = await modGuard(env, u, parseInt(url.searchParams.get('target'), 10) || 0, 'linked');
  if (g.res) return g.res;
  const now = Date.now();
  const tu = await env.DB.prepare('SELECT last_ip FROM users WHERE id=?').bind(g.t.id).first();
  const ip = tu && tu.last_ip;
  if (!ip || ip === 'unknown') return json({ ok: true, list: [], ip: null, banned: false });
  const list = (await env.DB.prepare('SELECT id,name,role FROM users WHERE last_ip=? AND id<>? ORDER BY id DESC LIMIT 30').bind(ip, g.t.id).all()).results;
  return json({ ok: true, list, ip: lvOf(u) >= 6 ? ip : null, banned: !!(await ipBanned(env, ip, now)) });
}

// ---------- اقتراح الحظر ----------
// يقترحه من لا يملك التنفيذ المباشر، ويعتمده المستوى 5 فأعلى. والحظر الناتج بمدة دائماً
async function modPropose(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const kind = b.kind === 'ipban' ? 'ipban' : 'ban';
  const g = await modGuard(env, u, parseInt(b.target, 10) || 0, 'propose');
  if (g.res) return g.res;
  if (lvOf(u) >= MOD_MIN[kind === 'ipban' ? 'ipban' : 'tempban']) return json({ error: 'تملك صلاحية التنفيذ مباشرة، لا حاجة للاقتراح' }, 400);
  const minutes = Math.floor(Number(b.minutes) || 0);
  if (minutes <= 0) return json({ error: 'اكتب مدة الحظر المقترحة (لا يوجد حظر دائم)' }, 400);
  const reason = cleanText(b.reason).slice(0, MAX_REASON);
  if (!reason) return json({ error: 'اكتب سبب الاقتراح' }, 400);
  const now = Date.now(), t = g.t;
  const c = await env.DB.prepare('SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN target_id=? THEN 1 ELSE 0 END),0) same FROM ban_props WHERE by_id=? AND state=0').bind(t.id, u.id).first();
  if (c.same) return json({ error: 'لديك اقتراح معلّق على هذا المستخدم' }, 409);
  if (c.n >= PROP_OPEN_MAX) return json({ error: 'لديك ' + PROP_OPEN_MAX + ' اقتراحات معلّقة، انتظر مراجعتها' }, 429);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ban_props(target_id,target_name,by_id,by_name,reason,minutes,kind,ts) VALUES(?,?,?,?,?,?,?,?)').bind(t.id, t.name, u.id, u.name, reason, Math.min(minutes, 5256000), kind, now),
    env.DB.prepare('INSERT INTO notifications(user_id,ty,text,ref,ts) SELECT id,\'info\',?,NULL,? FROM users WHERE ' + STAFF_Q + '98)').bind('📨 اقتراح ' + (kind === 'ipban' ? 'حظر جهاز' : 'حظر') + ' جديد على ' + t.name + ' من ' + u.name, now),
    logStmt(env, u, 'propose', t, (kind === 'ipban' ? 'جهاز' : 'حساب') + ' | ' + minutes + ' د | ' + reason, now),
  ]);
  return json({ ok: true });
}

async function modProps(req, env, url) {
  const g = await staffGate(req, env, 'propreview');
  if (g.res) return g.res;
  const all = url.searchParams.get('state') === 'all';
  const rows = (await env.DB.prepare('SELECT id,target_id,target_name,by_id,by_name,reason,minutes,kind,ts,state,rev_name,rev_ts,rev_note FROM ban_props' + (all ? '' : ' WHERE state=0') + ' ORDER BY id DESC LIMIT 50').all()).results;
  return json({ rows });
}

async function modPropReview(req, env) {
  const g = await staffGate(req, env, 'propreview');
  if (g.res) return g.res;
  const u = g.u;
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0, now = Date.now();
  const p = id ? await env.DB.prepare('SELECT * FROM ban_props WHERE id=? AND state=0').bind(id).first() : null;
  if (!p) return json({ error: 'الاقتراح غير موجود أو تمت مراجعته' }, 404);
  const note = cleanText(b.note).slice(0, 200);
  const done = (state) => env.DB.prepare('UPDATE ban_props SET state=?, rev_id=?, rev_name=?, rev_ts=?, rev_note=? WHERE id=? AND state=0').bind(state, u.id, u.name, now, note, id);
  const tg = { id: p.target_id, name: p.target_name };
  if (!b.ok) {
    await env.DB.batch([done(2), logStmt(env, u, 'proprej', tg, '#' + id + (note ? ' | ' + note : ''), now),
      notifStmt(env, p.by_id, 'info', 'رُفض اقتراحك حظر ' + p.target_name + (note ? ' — ' + note : ''), null, now)]);
    return json({ ok: true });
  }
  const t = await env.DB.prepare('SELECT id,name,role,rank FROM users WHERE id=?').bind(p.target_id).first();
  if (!t) { await done(2).run(); return json({ error: 'المستخدم لم يعد موجوداً، أُغلق الاقتراح' }, 404); }
  const act = p.kind === 'ipban' ? 'ipban' : 'tempban';
  if (lvOf(u) < MOD_MIN[act] || !canMod(u, t, MOD_MIN[act])) return json({ error: 'لا تملك صلاحية تنفيذ هذا الحظر على هذا المستخدم' }, 403);
  const m = Math.floor(Number(b.minutes) || 0) > 0 ? Math.floor(Number(b.minutes)) : p.minutes;
  const why = p.reason + ' (اقتراح ' + p.by_name + ')';
  if (p.kind === 'ipban') {
    const r = await ipBanRun(env, u, t, m, why, now);
    if (r.err) return json({ error: r.err }, 400);
  } else {
    const d = untilFrom(m, 'ban', now);
    const st = sanctionStmts(env, u, t, 'ban', null, why, d.until, now);
    st.push(env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.id), env.DB.prepare('DELETE FROM presence WHERE user_id=?').bind(t.id));
    await env.DB.batch(st);
  }
  await env.DB.batch([done(1), logStmt(env, u, 'propok', tg, '#' + id, now),
    notifStmt(env, p.by_id, 'info', 'اعتُمد اقتراحك حظر ' + p.target_name, null, now)]);
  return json({ ok: true });
}

// ---------- التظلّمات ----------
// المحظور لا جلسة له، فيُعرَّف باسمه وكلمة مروره (وتُحسب المحاولات الخاطئة). أما المكتوم فبجلسته
async function appealWho(req, env, ip, b) {
  const cu = await currentUser(req, env);
  if (cu) return { u: await env.DB.prepare('SELECT id,name,role,rank,last_ip FROM users WHERE id=?').bind(cu.id).first() };
  if (!b || !b.name) return { res: json({ error: 'اكتب الاسم وكلمة المرور' }, 401) };
  if (await tooManyAttempts(env, ip)) return { res: json({ error: 'محاولات كثيرة، انتظر 15 دقيقة' }, 429) };
  const u = await env.DB.prepare('SELECT id,name,role,rank,last_ip,pass_hash,salt FROM users WHERE name=?').bind(String(b.name || '').trim()).first();
  const ph = u ? await hashPass(String(b.password || ''), u.salt) : null;
  if (!u || ph !== u.pass_hash) { await noteAttempt(env, ip); return { res: json({ error: 'الاسم أو كلمة المرور غير صحيحة' }, 401) }; }
  return { u };
}
// العقوبات الفعّالة التي يحق لصاحبها التظلّم منها (لا إخفاء الرسائل: سرّي عن صاحبه)
async function appealables(env, u, now) {
  const rows = (await env.DB.prepare('SELECT id,kind,room,reason,by_name,until FROM sanctions WHERE user_id=? AND active=1 AND kind IN (\'' + APPEAL_KINDS.join("','") + '\') AND (until IS NULL OR until>?) ORDER BY id DESC').bind(u.id, now).all()).results;
  const ib = await ipBanned(env, u.last_ip, now);
  if (ib && u.role !== 'owner' && lvBase(u) < 2) rows.push({ id: ib.id, kind: 'ipban', room: null, reason: ib.reason, by_name: '', until: ib.until >= 8e15 ? null : ib.until });
  return rows;
}

async function appealStatus(req, env, ip) {
  const b = await readBody(req);
  const w = await appealWho(req, env, ip, b);
  if (w.res) return w.res;
  const now = Date.now();
  const [sanc, ap] = await Promise.all([
    appealables(env, w.u, now),
    env.DB.prepare('SELECT id,text,ts,state,rev_name,rev_note,sanc_kind FROM appeals WHERE user_id=? ORDER BY id DESC LIMIT 5').bind(w.u.id).all(),
  ]);
  return json({ ok: true, name: w.u.name, sanctions: sanc.map((x) => ({ id: x.id, kind: x.kind, room: x.room, reason: x.reason || '', until: x.until })), appeals: ap.results });
}

async function appealSend(req, env, ip) {
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const w = await appealWho(req, env, ip, b);
  if (w.res) return w.res;
  const u = w.u, now = Date.now();
  const text = cleanText(b.text).slice(0, 500);
  if (text.length < 10) return json({ error: 'اشرح سبب التظلّم بـ 10 أحرف على الأقل' }, 400);
  const list = await appealables(env, u, now);
  if (!list.length) return json({ error: 'لا توجد عقوبة فعّالة يمكن التظلّم منها' }, 400);
  const pick = list.find((x) => x.kind + ':' + x.id === String(b.sid || '')) || list[0];
  const f = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM appeals WHERE user_id=? AND state=0) pend, (SELECT MAX(ts) FROM appeals WHERE user_id=?) last').bind(u.id, u.id).first();
  if (f.pend) return json({ error: 'لديك تظلّم قيد المراجعة' }, 409);
  if (f.last && now - f.last < APPEAL_GAP) return json({ error: 'يمكنك تقديم تظلّم جديد بعد ' + leftTx(Math.ceil((APPEAL_GAP - (now - f.last)) / 6e4)) }, 429);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO appeals(user_id,user_name,sanc_id,sanc_kind,sanc_by,sanc_reason,sanc_until,text,ts) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(u.id, u.name, pick.id, pick.kind, pick.by_name || '', pick.reason || '', pick.until || null, text, now),
    env.DB.prepare('INSERT INTO notifications(user_id,ty,text,ref,ts) SELECT id,\'info\',?,NULL,? FROM users WHERE ' + STAFF_Q + '91)').bind('⚖️ تظلّم جديد من ' + u.name, now),
  ]);
  return json({ ok: true });
}

async function modAppeals(req, env, url) {
  const g = await staffGate(req, env, 'appeals');
  if (g.res) return g.res;
  const all = url.searchParams.get('state') === 'all', now = Date.now();
  const rows = (await env.DB.prepare('SELECT a.id,a.user_id,a.user_name,a.sanc_id,a.sanc_kind,a.sanc_by,a.sanc_reason,a.sanc_until,a.text,a.ts,a.state,a.rev_name,a.rev_note,'
    + "CASE WHEN a.sanc_kind='ipban' THEN (SELECT 1 FROM ip_bans i WHERE i.id=a.sanc_id AND i.active=1 AND i.until>?) ELSE (SELECT 1 FROM sanctions s WHERE s.id=a.sanc_id AND s.active=1 AND (s.until IS NULL OR s.until>?)) END live "
    + 'FROM appeals a' + (all ? '' : ' WHERE a.state=0') + ' ORDER BY a.id DESC LIMIT 50').bind(now, now).all()).results;
  return json({ rows });
}

// state: 1 = قُبل ورُفعت العقوبة | 2 = رُفض | 3 = أُغلق لأن العقوبة لم تعد فعّالة
async function modAppealReview(req, env) {
  const g = await staffGate(req, env, 'appeals');
  if (g.res) return g.res;
  const u = g.u;
  const b = await readBody(req);
  const id = b ? parseInt(b.id, 10) : 0, now = Date.now();
  const a = id ? await env.DB.prepare('SELECT * FROM appeals WHERE id=? AND state=0').bind(id).first() : null;
  if (!a) return json({ error: 'التظلّم غير موجود أو تمت مراجعته' }, 404);
  const note = cleanText(b.note).slice(0, 200);
  const done = (state) => env.DB.prepare('UPDATE appeals SET state=?, rev_id=?, rev_name=?, rev_ts=?, rev_note=? WHERE id=? AND state=0').bind(state, u.id, u.name, now, note, id);
  const tg = { id: a.user_id, name: a.user_name };
  if (!b.ok) {
    await env.DB.batch([done(2), logStmt(env, u, 'appealrej', tg, '#' + id + (note ? ' | ' + note : ''), now),
      notifStmt(env, a.user_id, 'info', 'رُفض تظلّمك' + (note ? ' — ' + note : ''), null, now)]);
    return json({ ok: true });
  }
  const t = await env.DB.prepare('SELECT id,name,role,rank FROM users WHERE id=?').bind(a.user_id).first();
  if (!t) { await done(3).run(); return json({ error: 'المستخدم لم يعد موجوداً، أُغلق التظلّم' }, 404); }
  let lift;
  if (a.sanc_kind === 'ipban') {
    const cur = await env.DB.prepare('SELECT i.by_id,p.role,p.rank FROM ip_bans i LEFT JOIN users p ON p.id=i.by_id WHERE i.id=? AND i.active=1 AND i.until>?').bind(a.sanc_id, now).first();
    if (cur) {
      if (lvOf(u) < MOD_MIN.ipban) return json({ error: 'رفع حظر الجهاز يحتاج مستوى أعلى' }, 403);
      if (u.role !== 'owner' && cur.by_id !== u.id && cur.role && pwOf(u) < pwOf({ role: cur.role, rank: cur.rank || 0 })) return json({ error: 'وضعه من هو أعلى منك، ولا تستطيع رفعه' }, 403);
      lift = env.DB.prepare('UPDATE ip_bans SET active=0, lifted_by=?, lifted_ts=? WHERE id=? AND active=1').bind(u.id, now, a.sanc_id);
    }
  } else {
    const cur = await env.DB.prepare('SELECT s.by_id,p.role,p.rank FROM sanctions s LEFT JOIN users p ON p.id=s.by_id WHERE s.id=? AND s.user_id=? AND s.active=1 AND (s.until IS NULL OR s.until>?)').bind(a.sanc_id, a.user_id, now).first();
    if (cur) {
      const min = MOD_MIN[a.sanc_kind === 'ban' ? 'tempban' : a.sanc_kind];
      if (min === undefined || lvOf(u) < min || !canMod(u, t, min)) return json({ error: 'لا تملك صلاحية رفع هذه العقوبة' }, 403);
      if (u.role !== 'owner' && cur.by_id !== u.id && cur.role && pwOf(u) < pwOf({ role: cur.role, rank: cur.rank || 0 })) return json({ error: 'وضعها من هو أعلى منك، ولا تستطيع رفعها' }, 403);
      lift = env.DB.prepare('UPDATE sanctions SET active=0, lifted_by=?, lifted_ts=? WHERE id=? AND active=1').bind(u.id, now, a.sanc_id);
    }
  }
  if (!lift) {
    await env.DB.batch([done(3), logStmt(env, u, 'appealend', tg, '#' + id + ' | انتهت العقوبة', now)]);
    return json({ ok: true, closed: true });
  }
  await env.DB.batch([lift, done(1), logStmt(env, u, 'appealok', tg, '#' + id + ' | ' + a.sanc_kind + (note ? ' | ' + note : ''), now),
    notifStmt(env, a.user_id, 'info', 'قُبل تظلّمك ورُفعت العقوبة عنك' + (note ? ' — ' + note : ''), null, now)]);
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
      if (req.method === 'POST' && (url.pathname === '/api/appeal' || url.pathname === '/api/appeal/status')) {
        await ensureSchema(env);
        return url.pathname === '/api/appeal' ? await appealSend(req, env, ip) : await appealStatus(req, env, ip);
      }
      const SOC_POST = { '/api/friend/request': friendRequest, '/api/friend/accept': friendAccept, '/api/friend/decline': friendDecline,
        '/api/friend/remove': friendRemove, '/api/notif/read': notifRead, '/api/ignore/set': ignoreSet, '/api/prefs/set': prefsSet, '/api/report': reportUser };
      Object.assign(SOC_POST, { '/api/msg/edit': msgEdit, '/api/msg/delete': msgDelete, '/api/msg/react': msgReact, '/api/msg/vote': msgVote,
        '/api/pin/set': pinSet, '/api/pin/clear': pinClear, '/api/pm/clear': pmClear });
      for (const k of ['mute', 'kick', 'ban']) {
        SOC_POST['/api/mod/' + k] = (rq, ev) => modApply(rq, ev, k);
        SOC_POST['/api/mod/un' + k] = (rq, ev) => modLift(rq, ev, k);
      }
      for (const k of MISC_KINDS) {
        SOC_POST['/api/mod/' + k] = (rq, ev) => modApplyMisc(rq, ev, k);
        SOC_POST['/api/mod/un' + k] = (rq, ev) => modLift(rq, ev, k);
      }
      Object.assign(SOC_POST, { '/api/mod/warn': modWarn, '/api/mod/rank': modRank, '/api/mod/revoke': modRevoke, '/api/mod/restore': modRestore,
        '/api/mod/rename': modRename, '/api/mod/move': modMove, '/api/room/mod': roomModSet, '/api/room/mode': roomModeSet, '/api/mod/emergency': emergencySet, '/api/ww/list': wwList, '/api/ww/save': wwSave, '/api/ww/del': wwDel, '/api/ww/lock': wwLock, '/api/owner/log/del': ownerLogDel, '/api/owner/report/del': ownerReportDel, '/api/owner/log/hide': ownerLogHide, '/api/owner/report/hide': ownerReportHide, '/api/mod/report/done': modReportDone, '/api/mod/note': modNote,
        '/api/mod/delmsg': (rq, ev) => modDelMsgs(rq, ev, 'delmsg'), '/api/mod/wipe': (rq, ev) => modDelMsgs(rq, ev, 'wipe'),
        '/api/mod/tempban': (rq, ev) => modApply(rq, ev, 'ban', 'tempban'),
        '/api/profile/set': profileSet, '/api/mod/delimg': modDelImg, '/api/mod/ipban': modIpBan, '/api/mod/unipban': modIpLift, '/api/mod/propose': modPropose, '/api/mod/prop/review': modPropReview, '/api/mod/appeal/review': modAppealReview, '/api/like': likeSet, '/api/gift/send': giftSend, '/api/gift/delete': giftDelete, '/api/name/change': nameChange, '/api/visits/prefs': visitsPrefs, '/api/announce': announceSend });
      const MOD_GET = { '/api/mod/reports': modReports, '/api/mod/log': modLogList, '/api/mod/sanctions': modSanctions, '/api/mod/history': modHistory, '/api/mod/stats': modStats, '/api/mod/props': modProps, '/api/mod/appeals': modAppeals, '/api/mod/linked': modLinked };
      const PF_GET = { '/api/profile': profileGet, '/api/img': profileImg, '/api/gifts': giftList, '/api/name/status': nameStatus, '/api/visits': visitsGet };
      if (['/api/poll', '/api/post', '/api/pm/send', '/api/pm/read'].includes(url.pathname) || SOC_POST[url.pathname] || (req.method === 'GET' && (MOD_GET[url.pathname] || PF_GET[url.pathname]))) {
        await ensureSchema(env);
        if (req.method === 'GET' && PF_GET[url.pathname]) return await PF_GET[url.pathname](req, env, url);
        if (req.method === 'GET' && MOD_GET[url.pathname]) return await MOD_GET[url.pathname](req, env, url);
        if (req.method === 'POST' && SOC_POST[url.pathname]) return await SOC_POST[url.pathname](req, env);
        if (req.method === 'POST' && url.pathname === '/api/pm/send') return await pmSend(req, env);
        if (req.method === 'POST' && url.pathname === '/api/pm/read') return await pmRead(req, env);
        if (req.method === 'GET' && url.pathname === '/api/poll') return await poll(req, env, url);
        if (req.method === 'POST' && url.pathname === '/api/post') return await postMsg(req, env);
      }
      if (req.method === 'GET' && url.pathname === '/api/me') {
        await ensureSchema(env);
        const u = await currentUser(req, env);
        return u ? json({ user: u }) : json({ user: null }, 401);
      }
      return json({ error: 'غير موجود' }, 404);
    } catch (e) {
      return serverError(e, url.pathname);
    }
  },
};
