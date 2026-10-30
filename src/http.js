// أدوات HTTP والاستجابات ومعالجة الأخطاء.
import { DEBUG } from './config.js';

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export function serverError(e, where) {
  console.error('ERR ' + where, (e && e.stack) || e);
  const d = String((e && e.message) || e).slice(0, 200);
  return json({ error: DEBUG ? 'خطأ في الخادم [' + where + ': ' + d + ']' : 'خطأ في الخادم' }, 500);
}

export async function readBody(req) {
  try { return await req.json(); } catch { return null; }
}
