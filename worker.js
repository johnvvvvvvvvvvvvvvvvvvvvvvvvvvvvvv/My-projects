// المرحلة 1: تسجيل الدخول الحقيقي (تسجيل، دخول، خروج، من أنا)
const RESERVED = /(admin|owner|moderator|operator|ادمن|أدمن|مشرف|صاحب|مبرمج|سوبر)/i;
const DAY = 864e5;
const enc = new TextEncoder();

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

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

async function startSession(env, userId) {
  const tok = rand(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .bind(await sha256(tok), userId, now, now + 30 * DAY).run();
  return 'sid=' + tok + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + 30 * 86400;
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
    return json({ error: 'خطأ في الخادم' }, 500);
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

async function logout(req, env) {
  const tok = getCookie(req, 'sid');
  if (tok) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(tok)).run();
  return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
}


const ROOMS = ['العامة','الخليج','مصر','المغرب العربي','الشباب','الثقافة والمنوعات','غرفة المشرفين'];
const STATE_KEYS = ['shop', 'st', 'pf'];
const roomOk = (r, u) => ROOMS.includes(r) && (r !== 'غرفة المشرفين' || u.role === 'owner');
const needUser = async (req, env) => (await currentUser(req, env)) || null;

async function postMsg(req, env, u) {
  const b = await readBody(req);
  const text = String((b && b.text) || '').trim().slice(0, 300);
  if (!text || !b || !roomOk(b.room, u)) return json({ error: 'طلب غير صالح' }, 400);
  const l = await env.DB.prepare('SELECT ts FROM messages WHERE user_id=? ORDER BY id DESC LIMIT 1').bind(u.id).first();
  if (l && Date.now() - l.ts < 700) return json({ error: 'أبطئ قليلاً' }, 429);
  const r = await env.DB.prepare('INSERT INTO messages(room,user_id,text,ts) VALUES(?,?,?,?)').bind(b.room, u.id, text, Date.now()).run();
  return json({ ok: true, id: r.meta.last_row_id });
}

async function postPm(req, env, u) {
  const b = await readBody(req);
  const text = String((b && b.text) || '').trim().slice(0, 500);
  const to = parseInt(b && b.to, 10);
  if (!text || !(to > 0) || to === u.id) return json({ error: 'طلب غير صالح' }, 400);
  if (!(await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(to).first())) return json({ error: 'المستخدم غير موجود' }, 404);
  const r = await env.DB.prepare('INSERT INTO pms(from_id,to_id,text,ts) VALUES(?,?,?,?)').bind(u.id, to, text, Date.now()).run();
  return json({ ok: true, id: r.meta.last_row_id });
}

async function poll(url, env, u) {
  const room = url.searchParams.get('room') || '';
  const after = parseInt(url.searchParams.get('after'), 10) || 0;
  const pmafter = parseInt(url.searchParams.get('pmafter'), 10) || 0;
  let msgs = [];
  if (roomOk(room, u)) {
    msgs = (after > 0
      ? await env.DB.prepare('SELECT id,user_id uid,text,ts FROM messages WHERE room=? AND id>? ORDER BY id LIMIT 100').bind(room, after).all()
      : await env.DB.prepare('SELECT * FROM (SELECT id,user_id uid,text,ts FROM messages WHERE room=? ORDER BY id DESC LIMIT 50) ORDER BY id').bind(room).all()
    ).results;
  }
  const pms = (pmafter > 0
    ? await env.DB.prepare('SELECT id,from_id "from",to_id "to",text,ts FROM pms WHERE (to_id=? OR from_id=?) AND id>? ORDER BY id LIMIT 100').bind(u.id, u.id, pmafter).all()
    : await env.DB.prepare('SELECT * FROM (SELECT id,from_id "from",to_id "to",text,ts FROM pms WHERE to_id=? OR from_id=? ORDER BY id DESC LIMIT 200) ORDER BY id').bind(u.id, u.id).all()
  ).results;
  const ids = [...new Set([...msgs.map((m) => m.uid), ...pms.flatMap((p) => [p.from, p.to])])].filter((i) => i !== u.id).slice(0, 90);
  let users = [];
  if (ids.length) {
    users = (await env.DB.prepare('SELECT id,name,role,rank,age,gender,country,lang,created_at FROM users WHERE id IN (' + ids.map(() => '?').join(',') + ')').bind(...ids).all()).results;
  }
  return json({ msgs, pms, users });
}

async function getState(env, u) {
  const rows = (await env.DB.prepare('SELECT k,data FROM user_state WHERE user_id=?').bind(u.id).all()).results;
  const state = {};
  for (const r of rows) { try { state[r.k] = JSON.parse(r.data); } catch {} }
  return json({ state });
}

async function putState(req, env, u) {
  const b = await readBody(req);
  if (!b || !STATE_KEYS.includes(b.k)) return json({ error: 'طلب غير صالح' }, 400);
  const data = JSON.stringify(b.data);
  if (!data || data.length > 100000) return json({ error: 'حجم كبير' }, 413);
  await env.DB.prepare('INSERT INTO user_state(user_id,k,data,updated) VALUES(?,?,?,?) ON CONFLICT(user_id,k) DO UPDATE SET data=excluded.data,updated=excluded.updated')
    .bind(u.id, b.k, data, Date.now()).run();
  return json({ ok: true });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    try {
      if (url.pathname === '/api/health') return json({ ok: true });
      if (req.method === 'POST' && url.pathname === '/api/register') return await register(req, env, ip);
      if (req.method === 'POST' && url.pathname === '/api/login') return await login(req, env, ip);
      if (req.method === 'POST' && url.pathname === '/api/logout') return await logout(req, env);
      if (req.method === 'GET' && url.pathname === '/api/me') {
        const u = await currentUser(req, env);
        return u ? json({ user: u }) : json({ user: null }, 401);
      }
      const protectedPaths = ['/api/msg', '/api/pm', '/api/poll', '/api/state'];
      if (protectedPaths.includes(url.pathname)) {
        const u = await needUser(req, env);
        if (!u) return json({ error: 'سجّل الدخول أولاً' }, 401);
        if (req.method === 'POST' && url.pathname === '/api/msg') return await postMsg(req, env, u);
        if (req.method === 'POST' && url.pathname === '/api/pm') return await postPm(req, env, u);
        if (req.method === 'GET' && url.pathname === '/api/poll') return await poll(url, env, u);
        if (req.method === 'GET' && url.pathname === '/api/state') return await getState(env, u);
        if (req.method === 'PUT' && url.pathname === '/api/state') return await putState(req, env, u);
      }
      return json({ error: 'غير موجود' }, 404);
    } catch (e) {
      return json({ error: 'خطأ في الخادم' }, 500);
    }
  },
};
