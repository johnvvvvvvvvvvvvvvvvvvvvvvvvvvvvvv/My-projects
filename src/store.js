// المتجر وإعدادات المستخدم: كل الحالة على الخادم (D1)، والمتصفح لا يملك إلا نسخة للعرض.
// الرصيد والمشتريات والمهام تُحسب وتُتحقق هنا فقط، ولا يثق الخادم بأي رقم يرسله المتصفح.
import { DAY, lvOf } from './config.js';
import { json, readBody } from './http.js';
import { currentUser, rand } from './security.js';

const START_COINS = 200;          // رصيد البداية لكل عضو جديد في المتجر
const GIFT_COINS_DAY = 50;        // أقصى عملات يهديها العضو في اليوم
const TZ = 4 * 36e5;              // حدود اليوم بتوقيت الإمارات (UTC+4)
const MAX_WISH = 60;
const MAX_EXTRA = 500;            // أقصى عدد أغراض يضيفها المشرفون (يشمل البنرات المرفوعة)
const MAX_BANNERS = 300;          // أقصى عدد بنرات مرفوعة من الجهاز
const BANNER_MAX = 260000;        // أقصى طول لنص base64 للبنر (نحو 190KB)
const JPEG_B64 = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_ST = 120000;            // أقصى حجم لإعدادات المستخدم (حرف)
const SET_GAP = 1000;             // أدنى فاصل بين حفظين للإعدادات (مللي ثانية)

// ---------- صندوق الهدية اليومي (كل الأرقام هنا، عدّلها كما تشاء) ----------
// مكافأة متغيرة: w وزن الاحتمال (المجموع 100)، والعملات عدد عشوائي بين lo و hi
const BOX_TIERS = [
  { id: 'c', w: 72, lo: 10,  hi: 25 },    // عادي
  { id: 'r', w: 20, lo: 30,  hi: 50 },    // جيد
  { id: 'e', w: 7,  lo: 70,  hi: 100 },   // نادر
  { id: 'j', w: 1,  lo: 200, hi: 200 },   // الجائزة الكبرى
];
const BOX_STREAK_BONUS = 2;       // عملتان إضافيتان لكل يوم من السلسلة
const BOX_STREAK_BONUS_MAX = 7;   // سقف أيام السلسلة المحسوبة في الإضافة
const BOX_ITEM_BASE = 2;          // فرصة ظهور غرض من المتجر (%) في أي فتح
const BOX_ITEM_PER_DAY = 0.1;     // تزيد 0.1% لكل يوم من السلسلة
const BOX_ITEM_MAX = 5;           // وسقفها 5%
const BOX_ITEM_MAX_PRICE = 150;   // لا تُمنح أغراض أغلى من هذا السعر
const BOX_ITEM_RARITY = ['common', 'rare'];   // أنواع الندرة المسموح بمنحها (لا epic ولا ltd)
const BOX_MILESTONES = { 7: 50, 14: 100, 30: 200 };   // مكافأة مضمونة عند بلوغ هذه السلسلة
const BOX_SAVE_GAP = 2;           // الحماية تنقذ السلسلة إن غاب يوماً واحداً فقط (فجوة 2 بين الاستلامين)

// ---------- الرتب المعروضة للبيع (كل الأسعار هنا، عدّلها كما تشاء) ----------
// rank: رتبة العضو التي تُمنح (90 أوبريتور، 91 مودريتور، 98 سوبر أدمن كما في RK في الواجهة)
// role: للمبرمج يتغير الدور نفسه. لا تُباع رتبة صاحب الموقع أبداً.
// الترتيب من الأدنى إلى الأعلى، ولا يشتري العضو رتبة أدنى مما يملكه أو مساوية لها.
const RANKS = [
  { id: 'op',  n: 'أوبريتور',  ic: '🛡️', p: 10000,  rank: 90, d: 'مشرف رتبي: تحذير وكتم وحذف الرسائل ومراجعة البلاغات.' },
  { id: 'mod', n: 'مودريتور',  ic: '🛡️', p: 25000,  rank: 91, d: 'مشرف عام: صلاحيات أوسع، منها الطرد والحظر المؤقت وسحب الصلاحيات.' },
  { id: 'adm', n: 'أدمن',      ic: '⚔️', p: 50000,  rank: 94, d: 'مشرف عام بقوة أعلى: يعلو على أصحاب الرتب الأدنى منه.' },
  { id: 'sa',  n: 'سوبر أدمن', ic: '🛡✓', p: 100000, rank: 98, d: 'يضيف الحظر وتعيين مشرفي الغرف ورفع البنرات للمتجر.' },
  { id: 'prg', n: 'مبرمج',     ic: '</>', p: 250000, role: 'programmer', d: 'أعلى رتبة قابلة للشراء، وصلاحياتها قريبة من صاحب الموقع.' },
];

// عشوائية من crypto وليست Math.random، والخادم وحده من يقرر
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const TYPES = ['name', 'frame', 'theme', 'bg', 'bubble', 'title', 'namefx', 'banner', 'icon'];
const RARITY = ['common', 'rare', 'epic', 'ltd'];
const THEME_KEYS = ['royal', 'neon', 'space', 'rose', 'emerald', 'dusk'];   // الثيمات المعرّفة في الواجهة
const BG_KEYS = ['stars', 'arab'];               // الخلفيات المعرّفة في الواجهة
const RSV = /(admin|owner|moderator|operator|ادمن|أدمن|مشرف|صاحب|مبرمج|سوبر)/i;
const RESERVED_COLORS = ['#dc2626', '#7c3aed', '#be123c', '#0f766e', '#1d4ed8', '#4d7c0f']; // ألوان الرتب الإدارية

const ITEMS = [
  { id: 'nc1', t: 'name', n: 'اسم ذهبي', v: '#d4af37', p: 60, r: 'rare' },
  { id: 'nc2', t: 'name', n: 'اسم نيون', v: '#22d3ee', p: 50, r: 'rare' },
  { id: 'nc3', t: 'name', n: 'اسم وردي', v: '#f472b6', p: 30, r: 'common' },
  { id: 'nc4', t: 'name', n: 'اسم ليموني', v: '#84cc16', p: 30, r: 'common' },
  { id: 'fr1', t: 'frame', n: 'إطار ذهبي', v: '#d4af37', p: 80, r: 'rare' },
  { id: 'fr2', t: 'frame', n: 'إطار نيون', v: '#22d3ee', p: 80, r: 'rare' },
  { id: 'fr3', t: 'frame', n: 'إطار أخضر', v: '#22c55e', p: 40, r: 'common' },
  { id: 'th1', t: 'theme', n: 'ثيم ملكي', v: 'royal', p: 150, r: 'epic' },
  { id: 'th2', t: 'theme', n: 'ثيم نيون', v: 'neon', p: 150, r: 'epic' },
  { id: 'th3', t: 'theme', n: 'ثيم فضاء', v: 'space', p: 120, r: 'epic' },
  { id: 'bg1', t: 'bg', n: 'خلفية نجوم', v: 'stars', p: 70, r: 'rare' },
  { id: 'bg2', t: 'bg', n: 'خلفية زخرفة', v: 'arab', p: 70, r: 'rare' },
  { id: 'bb1', t: 'bubble', n: 'فقاعة بحرية', v: '#0e6a8f', p: 40, r: 'common' },
  { id: 'bb2', t: 'bubble', n: 'فقاعة زيتونية', v: '#4d6b1f', p: 40, r: 'common' },
  { id: 'tt1', t: 'title', n: 'لقب النجم', v: '⭐ النجم', p: 50, r: 'common' },
  { id: 'tt2', t: 'title', n: 'لقب الفارس', v: '🛡️ الفارس', p: 50, r: 'common' },
  { id: 'tt3', t: 'title', n: 'لقب الملك', v: '👑 الملك', p: 200, r: 'ltd' },
  { id: 'th4', t: 'theme', n: 'ثيم وردي', v: 'rose', p: 120, r: 'epic' },
  { id: 'th5', t: 'theme', n: 'ثيم زمردي', v: 'emerald', p: 120, r: 'epic' },
  { id: 'th6', t: 'theme', n: 'ثيم الشفق', v: 'dusk', p: 130, r: 'epic' },
];
// حزمة الأصول المبنية بـ CSS (المفتاح v يقابل صنفاً في الواجهة: nfx-* للأسماء، frm-* للإطارات، bnr-* للبنرات)
const NFX = [['gold', 'ذهبي لامع'], ['neon', 'نيون متوهج'], ['fire', 'لهب'], ['ice', 'جليد'], ['rainbow', 'قوس قزح'], ['sunset', 'غروب'],
  ['aurora', 'شفق'], ['candy', 'حلوى'], ['steel', 'فولاذ'], ['lava', 'حمم'], ['ocean', 'محيط'], ['royal', 'ملكي']];
const FRM = [['gold', 'ذهبي'], ['neon', 'نيون'], ['pulse', 'نبض'], ['rainbow', 'ألوان متحركة'], ['fire', 'نار'], ['ice', 'ثلج'],
  ['rose', 'وردي'], ['emerald', 'زمردي'], ['royal', 'ملكي'], ['dots', 'نقاط'], ['double', 'مزدوج'], ['glow', 'توهج']];
const BNR = [['sunset', 'غروب'], ['ocean', 'محيط'], ['aurora', 'شفق'], ['desert', 'صحراء'], ['night', 'ليل'], ['forest', 'غابة'], ['candy', 'حلوى'], ['gold', 'ذهب']];
const rar = (i) => (i < 4 ? 'common' : i < 8 ? 'rare' : 'epic');
NFX.forEach((x, i) => ITEMS.push({ id: 'nx_' + x[0], t: 'namefx', n: 'اسم ' + x[1], v: x[0], p: 50 + i * 10, r: rar(i) }));
FRM.forEach((x, i) => ITEMS.push({ id: 'fx_' + x[0], t: 'frame', n: 'إطار ' + x[1], v: x[0], p: 60 + i * 10, r: rar(i) }));
BNR.forEach((x, i) => ITEMS.push({ id: 'bn_' + x[0], t: 'banner', n: 'بنر ' + x[1], v: x[0], p: 70 + i * 15, r: rar(i) }));
[['😎', 'أيقونة النظارة', 40], ['🔥', 'أيقونة النار', 60], ['💎', 'أيقونة الألماس', 120], ['🌙', 'أيقونة الهلال', 50]]
  .forEach((x, i) => ITEMS.push({ id: 'ic' + (i + 1), t: 'icon', n: x[1], v: x[0], p: x[2], r: x[2] >= 100 ? 'epic' : 'common' }));
const keyOf = (L, v) => L.some((x) => x[0] === v);
// k: نوع العداد، g: الهدف، c: المكافأة
const TASKS = [
  { id: 't1', n: 'أرسل 5 رسائل', k: 'msg', g: 5, c: 20 },
  { id: 't2', n: 'أضف صديقاً', k: 'fr', g: 1, c: 30 },
  { id: 't3', n: 'تفاعل مع 3 رسائل', k: 'rx', g: 3, c: 15 },
];

class ShopErr extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}
const wrap = (fn) => async (req, env, url) => {
  try { return await fn(req, env, url); }
  catch (e) {
    if (e instanceof ShopErr) return json({ error: e.message }, e.status);
    throw e;
  }
};

const dayKey = (t) => new Date(t + TZ).toISOString().slice(0, 10);
const dayStart = (t) => Math.floor((t + TZ) / DAY) * DAY - TZ;
const dayIdx = (t) => Math.floor((t + TZ) / DAY);                       // رقم اليوم (بتوقيت الإمارات)
const dayIdxOf = (k) => (k ? Math.floor(Date.parse(k + 'T00:00:00Z') / DAY) : -1e9);   // من مفتاح "YYYY-MM-DD"
const weekKey = (t) => Math.floor((dayIdx(t) + 3) / 7);                 // الأسبوع يبدأ الاثنين (اليوم 0 كان خميساً)
// هل السلسلة ما زالت حية، وهل الحماية متاحة هذا الأسبوع؟
function streakInfo(d, now) {
  const gap = dayIdx(now) - dayIdxOf(d.last);
  const prot = d.fzw !== weekKey(now);          // لم تُستهلك حماية هذا الأسبوع
  const alive = d.last && (gap <= 1 || (gap === BOX_SAVE_GAP && prot));
  return { gap, prot, alive: !!alive };
}
const isAdmin = (u) => lvOf(u) >= 6;              // مبرمج أو صاحب الموقع

function parse(s, d) {
  try {
    const v = JSON.parse(s, (k, x) => (k === '__proto__' || k === 'constructor' || k === 'prototype') ? undefined : x);
    return v === null || v === undefined ? d : v;
  } catch { return d; }
}

async function member(req, env) {
  const u = await currentUser(req, env);
  if (!u) throw new ShopErr('انتهت الجلسة، أعد تحميل الصفحة', 401);
  if (lvOf(u) < 1) throw new ShopErr('المتجر للأعضاء فقط، سجّل كعضو', 403);
  return u;
}

// ---------- حالة المتجر لكل مستخدم ----------
const fresh = () => ({ inv: [], eq: {}, wish: [], day: '', last: '', streak: 0, best: 0, fzw: '', done: {}, gd: 0, tx: [] });

async function loadState(env, uid) {
  let r = await env.DB.prepare('SELECT coins,ver,data FROM shop_state WHERE user_id=?').bind(uid).first();
  if (!r) {
    await env.DB.prepare('INSERT OR IGNORE INTO shop_state(user_id,coins,ver,data,upd) VALUES(?,?,0,?,?)')
      .bind(uid, START_COINS, JSON.stringify(fresh()), Date.now()).run();
    r = await env.DB.prepare('SELECT coins,ver,data FROM shop_state WHERE user_id=?').bind(uid).first();
  }
  const d = Object.assign(fresh(), parse(r.data, {}));
  if (!Array.isArray(d.inv)) d.inv = [];
  if (!Array.isArray(d.wish)) d.wish = [];
  if (!Array.isArray(d.tx)) d.tx = [];
  if (!d.eq || typeof d.eq !== 'object' || Array.isArray(d.eq)) d.eq = {};
  if (!d.done || typeof d.done !== 'object' || Array.isArray(d.done)) d.done = {};
  return { coins: r.coins, ver: r.ver, d };
}

// يبدأ يوماً جديداً: تصفير المهام المنجزة وحد إهداء العملات
function roll(d, now) {
  const k = dayKey(now);
  if (d.day !== k) { d.day = k; d.done = {}; d.gd = 0; }
}

// تعديل آمن ضد التزامن: نقرأ النسخة (ver) ثم نكتب بشرط أنها لم تتغيّر، وإلا نعيد المحاولة.
// fn(s, now) تعدّل s.d وتُرجع { delta } (التغيّر في الرصيد) أو ترمي ShopErr.
async function mutate(env, uid, fn) {
  for (let i = 0; i < 4; i++) {
    const now = Date.now();
    const s = await loadState(env, uid);
    roll(s.d, now);
    const out = (await fn(s, now)) || {};
    const delta = out.delta || 0;
    s.d.tx = s.d.tx.slice(0, 30);
    const r = await env.DB.prepare('UPDATE shop_state SET coins=coins+?, data=?, ver=ver+1, upd=? WHERE user_id=? AND ver=? AND coins+?>=0')
      .bind(delta, JSON.stringify(s.d), now, uid, s.ver, delta).run();
    if (r.meta.changes === 1) return out;
  }
  throw new ShopErr('الخادم مشغول، حاول مرة أخرى', 503);
}

// عدّادات المهام اليومية تُحسب من جداول الموقع نفسها، فلا يمكن تزويرها من المتصفح
async function counts(env, uid, now) {
  const a = dayStart(now);
  const rs = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) n FROM messages WHERE user_id=? AND ts>=? AND del=0').bind(uid, a),
    env.DB.prepare('SELECT COUNT(*) n FROM pms WHERE from_id=? AND ts>=?').bind(uid, a),
    env.DB.prepare('SELECT COUNT(*) n FROM friendships WHERE user_id=? AND ts>=?').bind(uid, a),
    env.DB.prepare('SELECT COUNT(*) n FROM reactions WHERE user_id=? AND ts>=?').bind(uid, a),
  ]);
  const n = (i) => rs[i].results[0].n || 0;
  return { msg: n(0) + n(1), fr: n(2), rx: n(3) };
}

async function catalog(env) {
  const rs = await env.DB.batch([
    env.DB.prepare('SELECT id,t,n,v,p,r FROM shop_extra ORDER BY ts'),
    env.DB.prepare('SELECT item_id FROM shop_hidden'),
  ]);
  return { items: ITEMS.concat(rs[0].results), hid: rs[1].results.map((x) => x.item_id) };
}

async function view(env, u, opt = {}) {
  const now = Date.now();
  const s = await loadState(env, u.id);
  roll(s.d, now);
  const cat = await catalog(env);
  const si = streakInfo(s.d, now);
  const shop = {
    coins: s.coins, inv: s.d.inv, eq: s.d.eq, wish: s.d.wish, streak: si.alive ? s.d.streak : 0, best: s.d.best || 0, fz: si.prot ? 1 : 0,
    claimed: s.d.last === dayKey(now) ? 1 : 0, done: s.d.done, tx: s.d.tx.slice(0, 10),
    gleft: Math.max(0, GIFT_COINS_DAY - (s.d.gd || 0)),
    items: cat.items, hid: cat.hid, tasks: TASKS,
  };
  const rk = await rankList(env, u);
  shop.rk = rk.cur;
  shop.ranks = rk.list;
  if (opt.counts) shop.cnt = await counts(env, u.id, now);
  if (opt.adm && isAdmin(u)) {
    const rs = await env.DB.prepare('SELECT item_id,n FROM shop_sales').all();
    shop.sales = {};
    for (const r of rs.results) shop.sales[r.item_id] = r.n;
  }
  return shop;
}

// الرتبة الحالية على سلّم الرتب المعروضة ('' = لا شيء، و owner/staff = خارج السلّم فلا شراء)
function rankNow(f) {
  if (f.role === 'owner') return 'owner';
  if (f.role === 'programmer') return 'prg';
  if (f.role !== 'member') return 'staff';
  let id = '';
  for (const r of RANKS) if (r.rank && (f.rank || 0) >= r.rank) id = r.id;
  return id;
}
async function rankList(env, u) {
  const f = (await env.DB.prepare('SELECT role,rank FROM users WHERE id=?').bind(u.id).first()) || { role: u.role, rank: u.rank };
  const cur = rankNow(f);
  const ci = RANKS.findIndex((r) => r.id === cur);
  const blocked = cur === 'owner' || cur === 'staff' || cur === 'prg' || !!u.rv;
  return {
    cur,
    list: RANKS.map((r, i) => ({
      id: r.id, n: r.n, ic: r.ic, p: r.p, d: r.d,
      st: r.id === cur ? 'cur' : (blocked ? 'no' : (i < ci ? 'low' : 'buy')),
    })),
  };
}

const findItem = (cat, id) => cat.items.find((x) => x.id === id);
const addTx = (s, now, t) => { s.d.tx.unshift({ t, ts: now }); };

// ---------- المسارات ----------
export const shopState = wrap(async (req, env, url) => {
  const u = await member(req, env);
  const shop = await view(env, u, {
    counts: url.searchParams.get('counts') === '1',
    adm: url.searchParams.get('adm') === '1',
  });
  return json({ ok: true, shop });
});

const shopBuy = wrap(async (req, env) => {
  const u = await member(req, env);
  const b = (await readBody(req)) || {};
  const id = String(b.id || '');
  const cat = await catalog(env);
  const it = findItem(cat, id);
  if (!it) throw new ShopErr('الغرض غير موجود', 404);
  if (cat.hid.includes(id)) throw new ShopErr('هذا الغرض غير متاح حالياً', 403);
  await mutate(env, u.id, (s, now) => {
    if (s.d.inv.includes(id)) throw new ShopErr('تملك هذا الغرض بالفعل');
    if (s.coins < it.p) throw new ShopErr('🪙 رصيدك لا يكفي');
    s.d.inv.push(id);
    addTx(s, now, 'شراء ' + it.n + ' (-' + it.p + ')');
    return { delta: -it.p };
  });
  await env.DB.prepare('INSERT INTO shop_sales(item_id,n) VALUES(?,1) ON CONFLICT(item_id) DO UPDATE SET n=n+1').bind(id).run();
  return json({ ok: true, shop: await view(env, u) });
});

// شراء رتبة: الخادم وحده يقرر. تُخصم العملات أولاً ثم تُطبَّق الرتبة بشرط أنها أعلى مما يملكه،
// وإن فشل التطبيق (سباق طلبين مثلاً) تُرد العملات تلقائياً. كل شراء يُسجَّل في سجل الإجراءات.
const shopRank = wrap(async (req, env) => {
  const u = await member(req, env);
  const b = (await readBody(req)) || {};
  const R = RANKS.find((x) => x.id === String(b.id || ''));
  if (!R) throw new ShopErr('الرتبة غير موجودة', 404);
  if (u.rv) throw new ShopErr('لا يمكن شراء رتبة أثناء سحب الصلاحيات', 403);
  if (u.role !== 'member') throw new ShopErr('رتبتك الحالية لا تحتاج إلى شراء', 403);
  const out = await mutate(env, u.id, async (s, now) => {
    const f = await env.DB.prepare('SELECT role,rank FROM users WHERE id=?').bind(u.id).first();
    if (!f || f.role !== 'member') throw new ShopErr('رتبتك الحالية لا تحتاج إلى شراء', 403);
    if (R.rank && (f.rank || 0) >= R.rank) throw new ShopErr('رتبتك الحالية مساوية لهذه الرتبة أو أعلى منها');
    if (s.coins < R.p) throw new ShopErr('🪙 رصيدك لا يكفي');
    s.d.rk = { id: R.id, ts: now, pr: f.rank || 0 };
    addTx(s, now, 'شراء رتبة ' + R.n + ' (-' + R.p + ')');
    return { delta: -R.p, prev: f.rank || 0 };
  });
  const now = Date.now();
  const up = R.role
    ? env.DB.prepare("UPDATE users SET role=? WHERE id=? AND role='member'").bind(R.role, u.id)
    : env.DB.prepare("UPDATE users SET rank=? WHERE id=? AND role='member' AND rank<?").bind(R.rank, u.id, R.rank);
  const r = await up.run();
  if (!r.meta.changes) {
    await mutate(env, u.id, (s, t) => { delete s.d.rk; addTx(s, t, 'استرجاع ثمن رتبة ' + R.n + ' (+' + R.p + ')'); return { delta: R.p }; });
    throw new ShopErr('تعذر تطبيق الرتبة وأُعيدت عملاتك، حاول مرة أخرى');
  }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO mod_log(actor_id,actor_name,action,target_id,target_name,detail,ts) VALUES(?,?,?,?,?,?,?)')
      .bind(u.id, u.name, 'rank', u.id, u.name, ('شراء من المتجر: ' + R.n + ' (' + out.prev + ' ← ' + (R.rank || R.role) + ') بسعر ' + R.p).slice(0, 300), now),
    env.DB.prepare('INSERT INTO notifications(user_id,ty,text,ref,ts) VALUES(?,?,?,?,?)')
      .bind(u.id, 'rank', 'مبروك! حصلت على رتبة ' + R.n + ' من المتجر', null, now),
  ]);
  return json({ ok: true, shop: await view(env, u) });
});

const shopEquip = wrap(async (req, env) => {
  const u = await member(req, env);
  const b = (await readBody(req)) || {};
  const id = String(b.id || '');
  const on = b.on === 1 || b.on === true;
  const it = findItem(await catalog(env), id);
  if (!it) throw new ShopErr('الغرض غير موجود', 404);
  await mutate(env, u.id, (s) => {
    if (!s.d.inv.includes(id)) throw new ShopErr('لا تملك هذا الغرض');
    if (on) s.d.eq[it.t] = it.v; else delete s.d.eq[it.t];
    return { delta: 0 };
  });
  return json({ ok: true, shop: await view(env, u) });
});

const shopWish = wrap(async (req, env) => {
  const u = await member(req, env);
  const b = (await readBody(req)) || {};
  const id = String(b.id || '');
  if (!findItem(await catalog(env), id)) throw new ShopErr('الغرض غير موجود', 404);
  await mutate(env, u.id, (s) => {
    const i = s.d.wish.indexOf(id);
    if (i > -1) s.d.wish.splice(i, 1);
    else {
      if (s.d.wish.length >= MAX_WISH) throw new ShopErr('قائمة الأمنيات ممتلئة');
      s.d.wish.push(id);
    }
    return { delta: 0 };
  });
  return json({ ok: true, shop: await view(env, u) });
});

const shopClaim = wrap(async (req, env) => {
  const u = await member(req, env);
  const b = (await readBody(req)) || {};
  const k = String(b.k || '');
  let gift = null;
  if (k === 'daily') {
    const cat = await catalog(env);
    const out = await mutate(env, u.id, (s, now) => {
      const today = dayKey(now);
      if (s.d.last === today) throw new ShopErr('تم الاستلام اليوم');
      // السلسلة: يوم متتابع يزيدها، وغياب يوم واحد تنقذه الحماية الأسبوعية، وما عدا ذلك تبدأ من جديد
      const si = streakInfo(s.d, now);
      let saved = false;
      if (si.alive && si.gap <= 1) s.d.streak += 1;
      else if (si.alive) { s.d.streak += 1; s.d.fzw = weekKey(now); saved = true; }
      else s.d.streak = 1;
      s.d.last = today;
      s.d.best = Math.max(s.d.best || 0, s.d.streak);
      // المكافأة المتغيرة
      let x = rnd() * 100, tier = BOX_TIERS[0];
      for (const t of BOX_TIERS) { if (x < t.w) { tier = t; break; } x -= t.w; }
      let coins = rint(tier.lo, tier.hi) + Math.min(s.d.streak, BOX_STREAK_BONUS_MAX) * BOX_STREAK_BONUS;
      const ms = BOX_MILESTONES[s.d.streak] || 0;
      coins += ms;
      // غرض نادر من المتجر (يُتخطى إن كان يملك كل المتاح فلا تضيع المكافأة)
      let item = null;
      if (rnd() * 100 < Math.min(BOX_ITEM_MAX, BOX_ITEM_BASE + s.d.streak * BOX_ITEM_PER_DAY)) {
        const pool = cat.items.filter((i) => !cat.hid.includes(i.id) && !s.d.inv.includes(i.id)
          && BOX_ITEM_RARITY.includes(i.r) && i.p <= BOX_ITEM_MAX_PRICE);
        if (pool.length) {
          const it = pool[Math.floor(rnd() * pool.length)];
          s.d.inv.push(it.id);
          item = { id: it.id, n: it.n, r: it.r };
        }
      }
      addTx(s, now, 'صندوق يومي +' + coins + (item ? ' + ' + item.n : '') + (saved ? ' (حماية السلسلة)' : ''));
      return { delta: coins, gift: { c: coins, tier: tier.id, item, ms, saved, streak: s.d.streak } };
    });
    gift = out.gift;
  } else {
    const t = TASKS.find((x) => x.id === k);
    if (!t) throw new ShopErr('مهمة غير معروفة', 404);
    await mutate(env, u.id, async (s, now) => {
      if (s.d.done[t.id]) throw new ShopErr('استلمت مكافأة هذه المهمة');
      const c = await counts(env, u.id, now);
      if ((c[t.k] || 0) < t.g) throw new ShopErr('المهمة غير مكتملة بعد');
      s.d.done[t.id] = 1;
      addTx(s, now, 'مهمة: ' + t.n + ' +' + t.c);
      return { delta: t.c };
    });
  }
  return json({ ok: true, gift, shop: await view(env, u, { counts: true }) });
});

const shopGift = wrap(async (req, env) => {
  const u = await member(req, env);
  const b = (await readBody(req)) || {};
  const tid = parseInt(b.target, 10) || 0;
  const a = parseInt(b.a, 10) || 0;
  if (!tid || tid === u.id) throw new ShopErr('طلب غير صالح');
  if (!(a >= 1 && a <= GIFT_COINS_DAY)) throw new ShopErr('الكمية غير صالحة');
  const t = await env.DB.prepare('SELECT u.id,u.name,u.role,(SELECT 1 FROM ignores x WHERE x.user_id=u.id AND x.target_id=?) ig FROM users u WHERE u.id=?')
    .bind(u.id, tid).first();
  if (!t) throw new ShopErr('المستخدم غير موجود', 404);
  if (t.role === 'visitor') throw new ShopErr('لا يمكن الإهداء للزوار');
  if (t.ig) throw new ShopErr('تعذر الإهداء لهذا المستخدم', 403);
  await loadState(env, tid); // ينشئ محفظة المستلم إن لم تكن موجودة
  await mutate(env, u.id, (s, now) => {
    const left = GIFT_COINS_DAY - (s.d.gd || 0);
    if (left <= 0) throw new ShopErr('وصلت للحد اليومي (' + GIFT_COINS_DAY + ' 🪙)');
    if (a > left) throw new ShopErr('المتبقي لك اليوم ' + left + ' 🪙 فقط');
    if (a > s.coins) throw new ShopErr('رصيدك لا يكفي');
    s.d.gd = (s.d.gd || 0) + a;
    addTx(s, now, 'هدية ' + a + ' إلى ' + t.name);
    return { delta: -a };
  });
  try {
    await mutate(env, tid, (s, now) => { addTx(s, now, 'هدية +' + a + ' من ' + u.name); return { delta: a }; });
  } catch (e) {
    // فشل الإيداع عند المستلم: نعيد العملات للمرسل بدل أن تضيع
    await mutate(env, u.id, (s, now) => { s.d.gd = Math.max(0, (s.d.gd || 0) - a); addTx(s, now, 'استرجاع ' + a); return { delta: a }; });
    throw e;
  }
  return json({ ok: true, shop: await view(env, u) });
});

// إدارة المتجر (مبرمج أو صاحب الموقع): إضافة غرض، إخفاء، إظهار
const shopAdmin = wrap(async (req, env) => {
  const u = await member(req, env);
  if (!isAdmin(u)) throw new ShopErr('غير مصرّح', 403);
  const b = (await readBody(req)) || {};
  const op = String(b.op || '');
  if (op === 'add') {
    const n = String(b.n || '').trim().slice(0, 24);
    const v = String(b.v || '').trim().slice(0, 24);
    const p = parseInt(b.p, 10);
    const t = String(b.t || '');
    const r = String(b.r || '');
    if (!n || !(p >= 1 && p <= 100000) || !TYPES.includes(t) || !RARITY.includes(r)) throw new ShopErr('بيانات الغرض غير صالحة');
    if (t === 'frame' && keyOf(FRM, v)) { /* إطار جاهز بمفتاح */ }
    else if (t === 'namefx') { if (!keyOf(NFX, v)) throw new ShopErr('مفتاح ستايل الاسم: ' + NFX.map((x) => x[0]).join(' / ')); }
    else if (t === 'banner') { if (!keyOf(BNR, v)) throw new ShopErr('مفتاح البنر: ' + BNR.map((x) => x[0]).join(' / ') + ' (أو ارفع صورة من تبويب البنرات)'); }
    else if (t === 'icon') { if (!v || v.length > 8) throw new ShopErr('الأيقونة: رمز إيموجي واحد'); }
    else if (t === 'name' || t === 'frame' || t === 'bubble') { if (!/^#[0-9a-f]{6}$/i.test(v)) throw new ShopErr('اللون غير صحيح'); }
    else if (t === 'theme') { if (!THEME_KEYS.includes(v)) throw new ShopErr('مفتاح الثيم: ' + THEME_KEYS.join(' / ')); }
    else if (t === 'bg') { if (!BG_KEYS.includes(v)) throw new ShopErr('مفتاح الخلفية: ' + BG_KEYS.join(' / ')); }
    else if (!v) throw new ShopErr('اكتب نص اللقب');
    if (RESERVED_COLORS.includes(v.toLowerCase())) throw new ShopErr('⛔ لا تُباع ألوان الرتب الإدارية');
    if (RSV.test(n + v)) throw new ShopErr('⛔ الاسم يشبه رتبة إدارية');
    const c = await env.DB.prepare('SELECT COUNT(*) n FROM shop_extra').first();
    if (c.n >= MAX_EXTRA) throw new ShopErr('وصلت للحد الأقصى من الأغراض المضافة');
    await env.DB.prepare('INSERT INTO shop_extra(id,t,n,v,p,r,ts) VALUES(?,?,?,?,?,?,?)')
      .bind('x' + rand(5), t, n, v, p, r, Date.now()).run();
  } else if (op === 'hide' || op === 'show') {
    const id = String(b.id || '');
    if (!findItem(await catalog(env), id)) throw new ShopErr('الغرض غير موجود', 404);
    if (op === 'hide') await env.DB.prepare('INSERT OR IGNORE INTO shop_hidden(item_id) VALUES(?)').bind(id).run();
    else await env.DB.prepare('DELETE FROM shop_hidden WHERE item_id=?').bind(id).run();
  } else throw new ShopErr('عملية غير معروفة');
  return json({ ok: true, shop: await view(env, u, { adm: true }) });
});

// رفع بنرات للمتجر من جهاز المشرف: سوبر أدمن فما فوق. الصورة تُخزَّن في D1 والسعر يحدده الرافع
const canBanner = (u) => lvOf(u) >= 5;
const shopBanner = wrap(async (req, env) => {
  const u = await member(req, env);
  if (!canBanner(u)) throw new ShopErr('رفع البنرات للسوبر أدمن وما فوق', 403);
  const b = (await readBody(req)) || {};
  const op = String(b.op || '');
  if (op === 'add') {
    const n = String(b.n || '').trim().slice(0, 24);
    const p = parseInt(b.p, 10);
    const r = String(b.r || '');
    const m = JPEG_B64.exec(String(b.img || ''));
    if (!n || !(p >= 1 && p <= 100000) || !RARITY.includes(r)) throw new ShopErr('اكتب الاسم والسعر واختر الندرة');
    if (RSV.test(n)) throw new ShopErr('⛔ الاسم يشبه رتبة إدارية');
    if (!m || m[1].length > BANNER_MAX || m[1].length % 4 !== 0 || !m[1].startsWith('/9j/')) throw new ShopErr('الصورة غير صالحة أو كبيرة');
    const c = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) n FROM shop_banners'),
      env.DB.prepare('SELECT COUNT(*) n FROM shop_extra'),
    ]);
    if (c[0].results[0].n >= MAX_BANNERS) throw new ShopErr('وصلت للحد الأقصى من البنرات المرفوعة');
    if (c[1].results[0].n >= MAX_EXTRA) throw new ShopErr('وصلت للحد الأقصى من الأغراض المضافة');
    const bid = 'b' + rand(6), now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO shop_banners(id,d,ts) VALUES(?,?,?)').bind(bid, m[1], now),
      env.DB.prepare('INSERT INTO shop_extra(id,t,n,v,p,r,ts) VALUES(?,?,?,?,?,?,?)').bind('x' + rand(5), 'banner', n, 'img:' + bid, p, r, now),
    ]);
  } else if (op === 'price' || op === 'hide' || op === 'show') {
    const id = String(b.id || '');
    const it = findItem(await catalog(env), id);
    if (!it || it.t !== 'banner') throw new ShopErr('البنر غير موجود', 404);
    if (op === 'price') {
      const p = parseInt(b.p, 10);
      if (!(p >= 1 && p <= 100000)) throw new ShopErr('السعر غير صالح');
      const r = await env.DB.prepare("UPDATE shop_extra SET p=? WHERE id=? AND t='banner'").bind(p, id).run();
      if (!r.meta.changes) throw new ShopErr('لا يمكن تغيير سعر البنرات الجاهزة من هنا', 400);
    } else if (op === 'hide') await env.DB.prepare('INSERT OR IGNORE INTO shop_hidden(item_id) VALUES(?)').bind(id).run();
    else await env.DB.prepare('DELETE FROM shop_hidden WHERE item_id=?').bind(id).run();
  } else throw new ShopErr('عملية غير معروفة');
  return json({ ok: true, shop: await view(env, u, { adm: true }) });
});

// الصورة نفسها: رابط يحمل معرّف البنر ويخزّنه المتصفح
export async function bannerImg(req, env, url) {
  const u = await currentUser(req, env);
  if (!u) return new Response('', { status: 401, headers: { 'cache-control': 'no-store' } });
  const id = String(url.searchParams.get('id') || '');
  const r = /^b[0-9a-f]{12}$/.test(id) ? await env.DB.prepare('SELECT d FROM shop_banners WHERE id=?').bind(id).first() : null;
  if (!r || !r.d) return new Response('', { status: 404, headers: { 'cache-control': 'no-store' } });
  const bin = atob(r.d), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}

// منح عملات لعضو (صاحب الموقع فقط): للتعويض أو المسابقات
const shopGrant = wrap(async (req, env) => {
  const u = await member(req, env);
  if (u.role !== 'owner') throw new ShopErr('غير مصرّح', 403);
  const b = (await readBody(req)) || {};
  const tid = parseInt(b.target, 10) || 0;
  const a = parseInt(b.a, 10) || 0;
  if (!tid || !(a >= 1 && a <= 100000)) throw new ShopErr('طلب غير صالح');
  const t = await env.DB.prepare('SELECT id,role FROM users WHERE id=?').bind(tid).first();
  if (!t || t.role === 'visitor') throw new ShopErr('المستخدم غير موجود أو زائر', 404);
  await loadState(env, tid);
  await mutate(env, tid, (s, now) => { addTx(s, now, 'منحة من الإدارة +' + a); return { delta: a }; });
  return json({ ok: true });
});

// ---------- إعدادات المستخدم (المظهر والتفضيلات والملاحظات...) ----------
export async function settingsGet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const r = await env.DB.prepare('SELECT st,pf FROM user_settings WHERE user_id=?').bind(u.id).first();
  return json({ ok: true, st: r && r.st ? parse(r.st, null) : null, pf: r && r.pf ? parse(r.pf, null) : null });
}

function cleanPf(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const o = {};
  if (typeof p.th === 'string' && /^[a-z]{2,12}$/.test(p.th)) o.th = p.th;
  if (typeof p.bg === 'string' && /^[a-z]{2,12}$/.test(p.bg)) o.bg = p.bg;
  if (p.alt === 0 || p.alt === 1 || p.alt === true || p.alt === false) o.alt = p.alt ? 1 : 0;
  const fs = parseInt(p.fs, 10);
  if (fs >= 10 && fs <= 30) o.fs = fs;
  return o;
}

export async function settingsSet(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401);
  const b = await readBody(req);
  if (!b || typeof b !== 'object') return json({ error: 'طلب غير صالح' }, 400);
  let st = null, pf = null;
  if ('st' in b) {
    if (!b.st || typeof b.st !== 'object' || Array.isArray(b.st)) return json({ error: 'إعدادات غير صالحة' }, 400);
    st = JSON.stringify(b.st);
    if (st.length > MAX_ST) return json({ error: 'الإعدادات كبيرة جداً' }, 413);
  }
  if ('pf' in b) {
    const c = cleanPf(b.pf);
    if (!c) return json({ error: 'إعدادات المظهر غير صالحة' }, 400);
    pf = JSON.stringify(c);
  }
  if (st === null && pf === null) return json({ error: 'لا شيء للحفظ' }, 400);
  const now = Date.now();
  const r = await env.DB.prepare(
    'INSERT INTO user_settings(user_id,st,pf,upd) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET st=COALESCE(excluded.st,user_settings.st), pf=COALESCE(excluded.pf,user_settings.pf), upd=excluded.upd WHERE excluded.upd-user_settings.upd>=?'
  ).bind(u.id, st, pf, now, SET_GAP).run();
  if (!r.meta.changes) return json({ error: 'انتظر لحظة قبل الحفظ مرة أخرى' }, 429);
  return json({ ok: true });
}

// تُدمج في جدول مسارات POST في worker.js
export const SHOP_POST = {
  '/api/shop/buy': shopBuy,
  '/api/shop/equip': shopEquip,
  '/api/shop/rank': shopRank,
  '/api/shop/wish': shopWish,
  '/api/shop/claim': shopClaim,
  '/api/shop/gift': shopGift,
  '/api/shop/admin': shopAdmin,
  '/api/shop/grant': shopGrant,
  '/api/shop/banner': shopBanner,
  '/api/settings/set': settingsSet,
};

// يخصم عملات (أو يردّها إن كانت الكمية سالبة) لخدمة خارج المتجر مثل تلوين الاسم. يُسجَّل في سجل العمليات.
// يُرجع { ok:true } أو { ok:false, error, status } إن لم يكفِ الرصيد.
export async function spendCoins(env, uid, amount, label) {
  try {
    await mutate(env, uid, (s, now) => {
      if (amount > 0 && s.coins < amount) throw new ShopErr('🪙 رصيدك لا يكفي (المطلوب ' + amount + ' 🪙)', 402);
      addTx(s, now, label + ' (' + (amount > 0 ? '-' : '+') + Math.abs(amount) + ')');
      return { delta: -amount };
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof ShopErr) return { ok: false, error: e.message, status: e.status };
    throw e;
  }
}
