// المرحلة 1: تسجيل الدخول الحقيقي (تسجيل، دخول، زائر، خروج، من أنا)
// المرحلة 2: الغرف العامة المحفوظة في D1 (حفظ 30 يوماً) + المتصلون الحقيقيون
// المرحلة 3: الرسائل الخاصة المحفوظة في D1 (30 يوماً) + غير المقروء + الرسائل المؤقتة
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
const DEBUG = true;        // مؤقت: يُظهر سبب خطأ الخادم. اجعله false بعد حل المشكلة

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
    ]).catch((e) => { schemaP = null; throw e; });
  }
  return schemaP;
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
  ]);
}

const cleanText = (v) =>
  String(v || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim();

const msgRow = (r) => ({
  id: r.id, user_id: r.user_id, uname: r.uname, role: r.role || 'visitor', rank: r.rank || 0,
  text: r.text, rn: r.rn, rt: r.rt, rid: r.rid, ts: r.ts,
});

async function poll(req, env, url) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const room = url.searchParams.get('room') || '';
  if (!ROOMS.includes(room)) return json({ error: 'غرفة غير موجودة' }, 400);
  const after = parseInt(url.searchParams.get('after'), 10) || 0;
  const now = Date.now();

  if (url.searchParams.get('hb') === '1') {
    await env.DB.prepare(
      'INSERT INTO presence(user_id,room,ts) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET room=excluded.room, ts=excluded.ts'
    ).bind(u.id, room, now).run();
  }

  const sel = 'SELECT m.id,m.user_id,m.uname,m.text,m.rn,m.rt,m.rid,m.ts,u.role,u.rank FROM messages m LEFT JOIN users u ON u.id=m.user_id ';
  let msgs;
  if (after > 0) {
    msgs = (await env.DB.prepare(sel + 'WHERE m.room=? AND m.id>? AND m.ts>? ORDER BY m.id LIMIT 100')
      .bind(room, after, now - KEEP).all()).results;
  } else {
    msgs = (await env.DB.prepare(sel + 'WHERE m.room=? AND m.ts>? ORDER BY m.id DESC LIMIT ' + HISTORY)
      .bind(room, now - KEEP).all()).results.reverse();
  }
  const online = (await env.DB.prepare(
    'SELECT u.id,u.name,u.role,u.rank,u.age,u.gender,u.country,u.lang,u.created_at,p.room FROM presence p JOIN users u ON u.id=p.user_id WHERE p.ts>? ORDER BY p.ts DESC LIMIT 300'
  ).bind(now - ONLINE_MS).all()).results;
  const out = { msgs: msgs.map(msgRow), online, now };
  const paRaw = url.searchParams.get('pa');
  if (paRaw !== null) out.pm = await pmFetch(env, u.id, parseInt(paRaw, 10) || 0, url.searchParams.get('pf') === '1', now);
  return json(out);
}

// ---------- المرحلة 3: الرسائل الخاصة ----------
async function pmFetch(env, me, pa, first, now) {
  const base = 'SELECT id,from_id,to_id,text,rn,rt,rid,ts,exp FROM pms WHERE (from_id=? OR to_id=?) AND ts>? AND (exp IS NULL OR exp>?) ';
  let rows, unread = null;
  if (first) {
    rows = (await env.DB.prepare(base + 'ORDER BY id DESC LIMIT ' + PM_HISTORY)
      .bind(me, me, now - KEEP, now).all()).results.reverse();
    const un = (await env.DB.prepare(
      'SELECT from_id, COUNT(*) c FROM pms WHERE to_id=? AND read_at IS NULL AND ts>? AND (exp IS NULL OR exp>?) GROUP BY from_id'
    ).bind(me, now - KEEP, now).all()).results;
    unread = {};
    un.forEach((x) => { unread[x.from_id] = x.c; });
  } else {
    rows = (await env.DB.prepare(base + 'AND id>? ORDER BY id LIMIT 100')
      .bind(me, me, now - KEEP, now, pa).all()).results;
  }
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
  return { rows, peers, unread };
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

  let rn = null, rt = null, rid = null;
  if (b.reply && typeof b.reply === 'object') {
    rn = String(b.reply.n || '').slice(0, 16);
    rt = String(b.reply.t || '').slice(0, 60);
    rid = parseInt(b.reply.id, 10) || null;
    if (!rt) { rn = null; rt = null; rid = null; }
  }
  const ins = await env.DB.prepare('INSERT INTO messages(room,user_id,uname,text,rn,rt,rid,ts) VALUES(?,?,?,?,?,?,?,?)')
    .bind(room, u.id, u.name, text, rn, rt, rid, now).run();
  await env.DB.prepare(
    'INSERT INTO presence(user_id,room,ts) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET room=excluded.room, ts=excluded.ts'
  ).bind(u.id, room, now).run();
  await cleanup(env);
  return json({ ok: true, id: ins.meta.last_row_id, ts: now });
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
      if (['/api/poll', '/api/post', '/api/pm/send', '/api/pm/read'].includes(url.pathname)) {
        await ensureSchema(env);
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
