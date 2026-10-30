// ثوابت وإعدادات وصلاحيات مشتركة.
export const NAME_OK = /^[\p{L}\p{M}\p{N}_\-. ]+$/u;
export const RESERVED = /(admin|owner|moderator|operator|ادمن|أدمن|مشرف|صاحب|مبرمج|سوبر)/i;
export const DAY = 864e5;
export const enc = new TextEncoder();
export const ROOMS = ['العامة', 'الخليج', 'مصر', 'المغرب العربي', 'الشباب', 'الثقافة والمنوعات'];
export const KEEP = 30 * DAY;      // مدة حفظ الرسائل
export const ONLINE_MS = 45000;    // يُعدّ المستخدم متصلاً إن كان آخر نبض خلال 45 ثانية
export const MAX_TEXT = 500;
export const HISTORY = 15;        // عدد الرسائل القديمة عند دخول الغرفة
export const TMP_OK = [30000, 3600000, 86400000]; // مدد الرسائل المؤقتة المسموحة: 30 ث، ساعة، يوم
export const PM_HISTORY = 200;    // عدد رسائل الخاص المحمّلة عند الدخول
export const MAX_FRIENDS = 200;
export const MAX_IGNORES = 300;
export const EDIT_MS = 15 * 6e4;   // مهلة تعديل الرسالة
export const EMOJI = ['👍', '❤️', '😂', '😮', '😢'];
export const LVN = { visitor: 0, member: 1, rankmod: 2, roommod: 3, genmod: 4, super: 5, programmer: 6, owner: 7 };
export function lvOf(u) {
  const b = lvBase(u);
  return u.lvx && !u.rv && u.lvx > b ? u.lvx : b; // lvx = رفع مؤقت لمشرف الغرفة داخل غرفته فقط
}
export function lvBase(u) {
  if (u.rv && u.role !== 'owner') return u.role === 'visitor' ? 0 : 1; // سُحبت صلاحياته مؤقتاً
  if (u.role === 'member') { const r = u.rank || 0; return r >= 98 ? 5 : r >= 91 ? 4 : r >= 90 ? 2 : 1; }
  return LVN[u.role] || 0;
}
export const pwOf = (u) => u.rv && u.role !== 'owner' ? lvOf(u) * 100 : lvOf(u) * 100 + (u.role === 'member' ? (u.rank || 0) : 0);
// سقف الرتبة التي يحق للمستخدم منحها (كما في الواجهة)
export const capOf = (u) => u.role === 'owner' ? 100 : u.role === 'programmer' ? 90 : lvOf(u) >= 5 ? 40 : lvOf(u) === 4 ? 20 : 0;
export function canMod(a, t, min) {
  if (a.id === t.id) return false;
  if (a.role === 'owner') return true;
  if (t.role === 'owner') return false;
  return lvOf(a) >= min && pwOf(a) > pwOf(t);
}
export const DEBUG = true;       // true يُظهر سبب خطأ الخادم للتشخيص فقط
