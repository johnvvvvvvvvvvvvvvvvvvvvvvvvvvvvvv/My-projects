// src/outfit.js
// ملابس الشخصية في مشهد الموعد: مصفوفة outfit من 8 أرقام صحيحة (تُقبل 6 إلى 8 وتُتمَّم بأصفار، فلا ينكسر المحفوظ القديم) تُحفظ لكل عضو في جدول مستقل user_outfit.
// ترتيب الخانات: [علوي(6), لون العلوي(10), سفلي(4), لون السفلي(10), حذاء(3), لون الحذاء(8), نقش العلوي(5), لون النقش(10)].
// OUTFIT_MAX يجب أن يطابق DT_OTMAX في public/date.js.
// العمود body محجوز لمنزلقات الجسم لاحقاً (طول، عرض...)، ولا يُكتب ولا يُقرأ في هذه المرحلة، فلا يلزم MIG حين نفعّله.
// القيمة null تعني «بلا ملابس مخصصة»: يبقى لباس الشخصية الافتراضي في المتصفح.
import { json, readBody } from './http.js';
import { currentUser } from './security.js';

export const OUTFIT_MAX = [6, 10, 4, 10, 3, 8, 5, 10];
const OUTFIT_MIN = 6;                // الطول الأدنى المقبول (النسخة الأولى بلا نقوش)
const OUTFIT_GAP = 1000;   // أقل فاصل بين حفظين (مللي ثانية)

export function cleanOutfit(a) {
  if (!Array.isArray(a) || a.length < OUTFIT_MIN || a.length > OUTFIT_MAX.length) return null;
  const o = [];
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isInteger(v) || v < 0 || v >= OUTFIT_MAX[i]) return null;
    o.push(v);
  }
  while (o.length < OUTFIT_MAX.length) o.push(0);   // خانات النقش الناقصة = بلا نقش
  return o;
}

export function outfitTables(env) {
  return [env.DB.prepare('CREATE TABLE IF NOT EXISTS user_outfit(user_id INTEGER PRIMARY KEY, outfit TEXT, body TEXT, upd INTEGER NOT NULL DEFAULT 0)')];
}
export const OUTFIT_WANT = { user_outfit: ['user_id', 'outfit', 'body', 'upd'] };

// ملابس مجموعة أعضاء: { id: [..] } لمن اختار فقط
export async function loadOutfits(env, ids) {
  const out = {};
  const list = ids.filter((x) => Number.isInteger(x) && x > 0);
  if (!list.length) return out;
  const rs = await env.DB.prepare('SELECT user_id,outfit FROM user_outfit WHERE user_id IN (' + list.map(() => '?').join(',') + ') AND outfit IS NOT NULL').bind(...list).all();
  for (const r of rs.results) {
    let o = null;
    try { o = cleanOutfit(JSON.parse(r.outfit)); } catch (e) { o = null; }
    if (o) out[r.user_id] = o;
  }
  return out;
}

// POST /api/date/outfit  { outfit: [..6 إلى 8 أرقام..] }  أو { outfit: null } للعودة إلى الافتراضي
export async function outfitSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (u.role === 'visitor') return json({ error: 'الزائر لا يستطيع تخصيص الملابس. سجّل كعضو.' }, 403);
  const b = await readBody(req);
  const clear = b && b.outfit === null;
  const outfit = clear ? null : cleanOutfit(b && b.outfit);
  if (!clear && !outfit) return json({ error: 'ملابس غير صالحة' }, 400);
  const now = Date.now();
  const r = await env.DB.prepare(
    'INSERT INTO user_outfit(user_id,outfit,upd) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET outfit=excluded.outfit, upd=excluded.upd WHERE excluded.upd-user_outfit.upd>=?'
  ).bind(u.id, outfit ? JSON.stringify(outfit) : null, now, OUTFIT_GAP).run();
  if (!r.meta.changes) return json({ error: 'انتظر لحظة قبل الحفظ مرة أخرى' }, 429);
  return json({ ok: true, outfit });
}
