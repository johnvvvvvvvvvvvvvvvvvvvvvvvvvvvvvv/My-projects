// src/style.js
// تلوين الأسماء: رمز صحيح واحد لكل عضو في جدول مستقل user_style (بلا MIG).
// تخطيط البتات (يطابق public/style.js):
//   0-5 اللوحة (0..63) | 6-8 الحركة (0..7) | 9-10 السرعة+1 (1..3، فلا يكون الرمز المُلوَّن صفراً) | 11-12 التوهج | 13 عريض | 14 حدّ
//   الرمز 0 = بلا تلوين.
// المجاني: الصفر (إزالة) والستايلات الجاهزة الأربعون في PRESET_CODES (تطابق PRESETS في public/style.js).
// ما سواها «تخصيص كامل» ويكلّف STYLE_COST عملة عند كل حفظ يغيّر الرمز.
import { json, readBody } from './http.js';
import { currentUser } from './security.js';
import { spendCoins } from './store.js';

export const STYLE_COST = 100;
const STYLE_GAP = 1500;   // أقل فاصل بين حفظين (مللي ثانية)
const GET_MAX = 80;       // أكثر عدد أعضاء في طلب واحد

const PRESET_CODES = [5201, 5248, 13904, 2680, 3016, 1922, 15682, 9472, 3840, 2661, 2653, 601, 16200, 16206, 16197, 16204, 1150, 688, 12800, 13126, 13130, 10892, 2682, 1225, 1249, 3790, 3529, 3550, 16000, 2700, 6020, 5505, 10762, 2673, 1110, 2645, 13660, 3215, 27136, 3170];
const PRESET_SET = new Set(PRESET_CODES);

export function cleanStyle(n) {
  if (!Number.isInteger(n) || n < 0 || n >= 32768) return null;   // 15 بتاً فقط
  if (n === 0) return 0;
  if (((n >> 9) & 3) === 0) return null;                          // حقل السرعة 1..3
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
  const cur = await env.DB.prepare('SELECT code,upd FROM user_style WHERE user_id=?').bind(u.id).first();
  if (cur && now - cur.upd < STYLE_GAP) return json({ error: 'انتظر لحظة قبل الحفظ مرة أخرى' }, 429);
  if ((cur ? cur.code : 0) === code) return json({ ok: true, code, cost: 0 });      // لا تغيير ولا خصم

  const cost = (code === 0 || PRESET_SET.has(code)) ? 0 : STYLE_COST;
  if (cost) {
    const pay = await spendCoins(env, u.id, cost, 'تخصيص كامل لستايل الاسم');
    if (!pay.ok) return json({ error: pay.error }, pay.status || 402);
  }
  try {
    await env.DB.prepare('INSERT INTO user_style(user_id,code,upd) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET code=excluded.code, upd=excluded.upd')
      .bind(u.id, code, now).run();
  } catch (e) {
    if (cost) await spendCoins(env, u.id, -cost, 'استرجاع: تعذّر حفظ الستايل');   // فشل الحفظ بعد الخصم: نردّ العملات
    throw e;
  }
  return json({ ok: true, code, cost });
}

// GET /api/style/get?ids=1,2,3  ← { s: { id: code } } لمن لوّن اسمه فقط
export async function styleGet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  const ids = (new URL(req.url).searchParams.get('ids') || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean);
  return json({ s: await loadStyles(env, ids) });
}
