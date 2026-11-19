// src/style.js
// تلوين الأسماء: رمز صحيح واحد (32 بت) لكل عضو في جدول مستقل user_style، فلا حاجة لـ MIG.
// تخطيط البتات (يجب أن يطابق public/style.js):
//   0-5  اللوحة اللونية (0..63)     6-8  الحركة (0..7)     9-10 السرعة (0..2)
//   11-12 التوهج (0..3)             13 عريض               14 حدّ خارجي
// كل شيء يُتحقق هنا: أي بت خارج النطاق يرفض الطلب كله.
import { json, readBody } from './http.js';
import { currentUser } from './security.js';

const STYLE_GAP = 1500;   // أقل فاصل بين حفظين (مللي ثانية)
const GET_MAX = 80;       // أكثر عدد أعضاء في طلب واحد

export function cleanStyle(n) {
  if (!Number.isInteger(n) || n < 0 || n >= 32768) return null;   // 15 بتاً فقط
  if (((n >> 9) & 3) > 2) return null;                            // السرعة 0..2
  return n;
}

export function styleTables(env) {
  return [env.DB.prepare('CREATE TABLE IF NOT EXISTS user_style(user_id INTEGER PRIMARY KEY, code INTEGER NOT NULL DEFAULT 0, upd INTEGER NOT NULL DEFAULT 0)')];
}
export const STYLE_WANT = { user_style: ['user_id', 'code', 'upd'] };

export async function loadStyles(env, ids) {
  const out = {};
  const list = ids.filter((x) => Number.isInteger(x) && x > 0).slice(0, GET_MAX);
  if (!list.length) return out;
  const rs = await env.DB.prepare('SELECT user_id,code FROM user_style WHERE code>0 AND user_id IN (' + list.map(() => '?').join(',') + ')').bind(...list).all();
  for (const r of rs.results) { const c = cleanStyle(r.code); if (c) out[r.user_id] = c; }
  return out;
}

export async function styleSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (u.role === 'visitor') return json({ error: 'الزائر لا يستطيع تلوين اسمه. سجّل كعضو.' }, 403);
  const b = await readBody(req);
  const code = cleanStyle(b && b.code);
  if (code === null) return json({ error: 'تنسيق غير صالح' }, 400);
  const now = Date.now();
  const r = await env.DB.prepare(
    'INSERT INTO user_style(user_id,code,upd) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET code=excluded.code, upd=excluded.upd WHERE excluded.upd-user_style.upd>=?'
  ).bind(u.id, code, now, STYLE_GAP).run();
  if (!r.meta.changes) return json({ error: 'انتظر لحظة قبل الحفظ مرة أخرى' }, 429);
  return json({ ok: true, code });
}

// GET /api/style/get?ids=1,2,3  ← { s: { id: code } } لمن لوّن اسمه فقط
export async function styleGet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const ids = (new URL(req.url).searchParams.get('ids') || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean);
  return json({ s: await loadStyles(env, ids) });
}
