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
    'SELECT u.id,u.name,u.role,u.rank,u.room_mod_room,u.age,u.gender,u.country,u.lang,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?'
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
  const first = count === 0;
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

      // مسارات إدارة الصلاحيات وكلمات المراقبة والسجل السري
      const meUser = await currentUser(req, env);
      if (!meUser) return json({ error: 'غير مسجل الدخول' }, 401);

      if (url.pathname === '/api/admin/users' && req.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT id,name,role,rank,room_mod_room FROM users').all();
        return json({ ok: true, users: results });
      }

      if (url.pathname === '/api/admin/watch-words') {
        if (req.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT word FROM watch_words').all();
          return json({ ok: true, words: results.map(r => r.word) });
        }
        if (req.method === 'POST' && meUser.role === 'owner') {
          const b = await readBody(req);
          if (b && b.word) {
            await env.DB.prepare('INSERT OR IGNORE INTO watch_words(word) VALUES(?)').bind(b.word.trim()).run();
          }
          return json({ ok: true });
        }
      }

      if (url.pathname === '/api/admin/logs' && req.method === 'GET' && meUser.role === 'owner') {
        const { results } = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50').all();
        return json({ ok: true, logs: results });
      }

      return json({ error: 'غير موجود' }, 404);
    } catch (e) {
      return json({ error: 'خطأ في الخادم' }, 500);
    }
  },
};
