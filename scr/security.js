// أدوات التشفير والجلسات والتحقق من المستخدم.
import { DAY, enc } from './config.js';

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const rand = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

export async function sha256(s) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export async function hashPass(pass, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 },
    key,
    256
  );
  return hex(bits);
}

export function getCookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

export async function currentUser(req, env) {
  const tok = getCookie(req, 'sid');
  if (!tok) return null;
  const th = await sha256(tok);
  return await env.DB.prepare(
    "SELECT u.id,u.name,u.role,u.rank,u.age,u.gender,u.country,u.lang,u.created_at,(SELECT 1 FROM sanctions x WHERE x.user_id=u.id AND x.kind='revoke' AND x.active=1 AND (x.until IS NULL OR x.until>?) LIMIT 1) rv FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?"
  ).bind(Date.now(), th, Date.now()).first();
}

export async function startSession(env, userId, days = 30) {
  const tok = rand(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .bind(await sha256(tok), userId, now, now + days * DAY).run();
  return 'sid=' + tok + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + days * 86400;
}

export async function tooManyAttempts(env, ip) {
  const since = Date.now() - 15 * 6e4;
  await env.DB.prepare('DELETE FROM attempts WHERE ts<?').bind(since).run();
  const r = await env.DB.prepare('SELECT COUNT(*) c FROM attempts WHERE ip=? AND ts>?').bind(ip, since).first();
  return r.c >= 10;
}
export const noteAttempt = (env, ip) =>
  env.DB.prepare('INSERT INTO attempts(ip,ts) VALUES(?,?)').bind(ip, Date.now()).run();
