// src/faces.js
// شكل وجه الشخصية في مشهد الموعد: مصفوفة look من 13 رقماً صحيحاً تُحفظ لكل عضو في جدول مستقل user_faces.
// كل شيء يُتحقق هنا في الخادم: لا يُقبل إلا رقم صحيح داخل حدود LOOK_MAX، وإلا رُفض الطلب كله.
// LOOK_MAX يجب أن يطابق DT_LOOKMAX في public/date.js. ترتيب الخانات مشروح هناك.
import { json, readBody } from './http.js';
import { currentUser } from './security.js';

export const LOOK_MAX = [8, 8, 4, 7, 4, 4, 3, 3, 3, 2, 3, 2, 4];
const FACE_GAP = 1000;   // أقل فاصل بين حفظين (مللي ثانية)

export function cleanLook(a) {
  if (!Array.isArray(a) || a.length !== LOOK_MAX.length) return null;
  const o = [];
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isInteger(v) || v < 0 || v >= LOOK_MAX[i]) return null;
    o.push(v);
  }
  return o;
}

export function faceTables(env) {
  return [env.DB.prepare('CREATE TABLE IF NOT EXISTS user_faces(user_id INTEGER PRIMARY KEY, look TEXT NOT NULL, upd INTEGER NOT NULL DEFAULT 0)')];
}
export const FACE_WANT = { user_faces: ['user_id', 'look', 'upd'] };

// أشكال مجموعة أعضاء: { id: [..] } لمن اختار فقط، ومن لم يختر يُشتق له الوجه في المتصفح من رقم حسابه
export async function loadLooks(env, ids) {
  const out = {};
  const list = ids.filter((x) => Number.isInteger(x) && x > 0);
  if (!list.length) return out;
  const rs = await env.DB.prepare('SELECT user_id,look FROM user_faces WHERE user_id IN (' + list.map(() => '?').join(',') + ')').bind(...list).all();
  for (const r of rs.results) {
    let l = null;
    try { l = cleanLook(JSON.parse(r.look)); } catch (e) { l = null; }
    if (l) out[r.user_id] = l;
  }
  return out;
}

export async function faceSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  if (u.role === 'visitor') return json({ error: 'الزائر لا يستطيع تخصيص الشكل. سجّل كعضو.' }, 403);
  const b = await readBody(req);
  const look = cleanLook(b && b.look);
  if (!look) return json({ error: 'شكل غير صالح' }, 400);
  const now = Date.now();
  const r = await env.DB.prepare(
    'INSERT INTO user_faces(user_id,look,upd) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET look=excluded.look, upd=excluded.upd WHERE excluded.upd-user_faces.upd>=?'
  ).bind(u.id, JSON.stringify(look), now, FACE_GAP).run();
  if (!r.meta.changes) return json({ error: 'انتظر لحظة قبل الحفظ مرة أخرى' }, 429);
  return json({ ok: true, look });
}
