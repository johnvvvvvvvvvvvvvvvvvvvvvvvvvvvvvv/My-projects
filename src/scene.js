// src/scene.js
// مسرح الموعد الحي: كائن Durable Object واحد لكل موعد (DateScene) يحمل مواضع الشخصيتين والأشياء
// (وردة، كرة، شمعة) ويبثّها بين الطرفين عبر WebSocket.
// القاعدة نفسها كما في Room: التحقق من الجلسة والعلاقة وحالة الموعد يتم في Worker (sceneConnect)
// قبل تمرير الاتصال، والكائن لا يثق إلا بالترويسات الداخلية التي يضعها Worker.
// قاعدة البيانات لا تُلمس أثناء الحركة: الحالة في ذاكرة الكائن، وتُحفظ في storage عند الأحداث المتقطعة فقط.
import { DurableObject } from 'cloudflare:workers';
import { json } from './http.js';
import { currentUser } from './security.js';

// الإحداثيات نسبية (0..1) على مسرح بنسبة 4:3. المسافات تُحسب بعرض المسرح (محور y × 0.75).
const MINX = 0.05, MAXX = 0.95, MINY = 0.16, MAXY = 0.95;   // حدود الشخصية
const BX0 = 0.03, BX1 = 0.97, BY0 = 0.16, BY1 = 0.97;       // حدود الكرة
const MAXV = 1.6;            // أقصى سرعة للشخصية (عرض المسرح في الثانية)، والعميل يمشي أبطأ من ذلك
const NEAR = 0.30;           // قلوب وتوهج
const CLOSE = 0.16;          // يظهر زرا العناق ومسك اليد
const HYST = 0.03;           // هامش يمنع الوميض عند الحدّ
const TOUCH = 0.14;          // أقصى مسافة لالتقاط الوردة
const GIVE = 0.20;           // أقصى مسافة لتسليم الوردة
const CANDLE = 0.20;         // أقصى مسافة لإشعال الشمعة
const BALL_HIT = 0.075;      // ملامسة الكرة أثناء المشي
const WALK_GAP = 0.11;        // المسافة الجانبية بين القائد والتابع أثناء «امشِ معي»
const OFFER_MS = 20000;      // مهلة قبول الوردة
const IDLE_MS = 5 * 60e3;    // الاتصال الخامل يُغلق
const MAX_MSG = 200;         // أقصى حجم لرسالة من العميل

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const r3 = (v) => Math.round(v * 1000) / 1000;
const dist = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 0.75);

const freshObjs = () => ({
  rose: { x: 0.5, y: 0.82, by: 0, offer: 0, ot: 0 },
  ball: { x: 0.33, y: 0.84, vx: 0, vy: 0 },
  candle: { x: 0.5, y: 0.36, on: 0 },
});

export class DateScene extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.rl = new WeakMap();   // حد المعدل لكل اتصال (في الذاكرة فقط)
    this.objs = freshObjs();
    this.pair = null;          // [id1,id2] الطرفان المسموح لهما فقط
    this.fx = '0:0';           // آخر حالة قرب بُثّت (k:fx)
    this.walk = null;          // «امشِ معي»: { lead, fol, dx } في الذاكرة فقط
    this.simple = 0;           // نمط المشهد: 0 متحرك، 1 بسيط (فقاعتان)؛ مشترك بين الطرفين
    this.tick = 0;             // مؤقت فيزياء الكرة (يعمل فقط أثناء حركتها)
    this.lastKick = 0;
    this.lastCd = 0;
    this.ctx.blockConcurrencyWhile(async () => {
      const [o, p, sm] = await Promise.all([this.ctx.storage.get('o'), this.ctx.storage.get('pair'), this.ctx.storage.get('simple')]);
      if (sm) this.simple = 1;
      if (o && o.rose && o.ball && o.candle) this.objs = o;
      if (Array.isArray(p)) this.pair = p;
    });
  }

  // ---------- أدوات ----------
  live() {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) if (ws.readyState === 1) out.push(ws);
    return out;
  }
  bcast(msg, except) {
    const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const ws of this.live()) if (ws !== except) { try { ws.send(s); } catch (e) {} }
  }
  save() { return this.ctx.storage.put('o', this.objs).catch(() => {}); }
  snap(id) {
    const o = this.objs[id];
    return { t: 'o', id, ...o, x: r3(o.x), y: r3(o.y) };
  }
  other(a) {
    for (const ws of this.live()) {
      const b = ws.deserializeAttachment();
      if (b && b.id && b.id !== a.id) return b;
    }
    return null;
  }

  // ---------- اتصال جديد (يأتي من sceneConnect بعد التحقق) ----------
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const id = parseInt(request.headers.get('x-uid') || '0', 10) || 0;
    const pid = parseInt(request.headers.get('x-pid') || '0', 10) || 0;
    const ps = request.headers.get('x-ps') === '1' ? 1 : 0;
    let n = '';
    try { n = decodeURIComponent(request.headers.get('x-uname') || ''); } catch (e) {}
    if (!id || !pid || id === pid) return new Response('bad', { status: 400 });
    if (!this.pair) {
      this.pair = [Math.min(id, pid), Math.max(id, pid)];
      await this.ctx.storage.put('pair', this.pair);
    } else if (!this.pair.includes(id) || !this.pair.includes(pid)) {
      return new Response('forbidden', { status: 403 });
    }
    // اتصال سابق لنفس العضو (تبويب آخر) يُستبدل ويرث موضعه
    let prev = null;
    for (const o of this.ctx.getWebSockets('u' + id)) {
      const a = o.deserializeAttachment();
      if (a && !prev) prev = a;
      try { o.close(1000, 'replaced'); } catch (e) {}
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, ['u' + id]);
    const now = Date.now();
    const me = {
      id, n: n.slice(0, 16), ps,
      x: prev ? prev.x : id === this.pair[0] ? 0.3 : 0.7,
      y: prev ? prev.y : 0.72,
      mt: 0, la: now,
    };
    server.serializeAttachment(me);
    this.tidy(now);
    const players = {};
    for (const ws of this.live()) {
      const a = ws.deserializeAttachment();
      if (a && a.id) players[a.id] = { x: r3(a.x), y: r3(a.y), n: a.n };
    }
    players[id] = { x: r3(me.x), y: r3(me.y), n: me.n };
    server.send(JSON.stringify({
      t: 'hello', you: id, now, players, simple: this.simple,
      walk: this.walk ? { lead: this.walk.lead, fol: this.walk.fol } : null,
      objs: { rose: this.snap('rose'), ball: this.snap('ball'), candle: this.snap('candle') },
      near: this.nearState(),
    }));
    this.bcast({ t: 'j', id, x: r3(me.x), y: r3(me.y), n: me.n }, server);
    this.nearCheck(true);
    this.ctx.storage.getAlarm().then((al) => { if (!al) this.ctx.storage.setAlarm(Date.now() + 120000); }).catch(() => {});
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- رسائل العميل ----------
  webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MSG) return;
    const now = Date.now();
    let s = this.rl.get(ws);
    if (!s || now - s.w > 1000) { s = { w: now, c: 0 }; this.rl.set(ws, s); }
    if (++s.c > 40) { try { ws.close(1008, 'rate'); } catch (e) {} return; }   // إغراق
    let j;
    try { j = JSON.parse(message); } catch (e) { return; }
    if (!j || typeof j.t !== 'string') return;
    const a = ws.deserializeAttachment();
    if (!a || !a.id) return;
    a.la = now;
    this.tidy(now);
    const R = this.objs.rose, C = this.objs.candle;

    if (j.t === 'a') { ws.serializeAttachment(a); return; }   // نشاط فقط: يمنع إغلاق الاتصال كخامل

    // تبديل نمط المشهد (متحرك/بسيط): يُخزَّن ويُبثّ للطرفين معاً
    if (j.t === 'mode') {
      this.simple = j.simple ? 1 : 0;
      this.ctx.storage.put('simple', this.simple).catch(() => {});
      this.bcast({ t: 'mode', simple: this.simple });
      return;
    }

    // «امشِ معي»: القائد يتحكم، والخادم يضع التابع بجانبه ويتجاهل حركة التابع نفسه
    if (j.t === 'walk') {
      if (!j.on) { if (this.walk && (this.walk.lead === a.id || this.walk.fol === a.id)) this.stopWalk(); return; }
      if (this.walk) return;
      const o = this.live().map((w) => w.deserializeAttachment()).filter((q) => q && q.id && q.id !== a.id)[0];
      if (!o) { this.tell(ws, 'شريكك غير موجود في المسرح الآن'); return; }
      if (!this.nearState().fx) { this.tell(ws, 'المشي معاً متوقف بسبب إعداد «المساحة الشخصية»'); return; }
      if (dist(a, o) > NEAR) { this.tell(ws, 'اقترب من شريكك أولاً'); return; }
      this.walk = { lead: a.id, fol: o.id, dx: o.x >= a.x ? WALK_GAP : -WALK_GAP };
      this.bcast({ t: 'w', on: 1, lead: a.id, fol: o.id });
      this.moveFollower(a);
      this.nearCheck(false);
      return;
    }

    // العناق ومسك اليد: لا يُقبلان إلا والطرفان متقاربان (k=2) وبلا «مساحة شخصية»
    if (j.t === 'hug' || j.t === 'hands') {
      if (!this.canTouch(a.id)) { this.tell(ws, 'اقترب من شريكك أكثر'); return; }
      if (a.tg && now - a.tg < 4000) return;
      a.tg = now; ws.serializeAttachment(a);
      this.bcast({ t: 'g', k: j.t, by: a.id });
      return;
    }

    if (j.t === 'm') {
      if (this.walk && this.walk.fol === a.id) return;          // التابع لا يتحكم بموضعه أثناء المشي
      const x = num(j.x), y = num(j.y);
      if (x === null || y === null) return;
      if (a.mt && now - a.mt < 45) return;                    // أسرع من اللازم: تجاهل
      const dt = clamp(now - (a.mt || now - 100), 30, 500);
      let nx = clamp(x, MINX, MAXX), ny = clamp(y, MINY, MAXY);
      const d = dist(a, { x: nx, y: ny });
      const lim = (MAXV * dt) / 1000 + 0.015;
      let fixed = false;
      if (d > lim) { const f = lim / d; nx = a.x + (nx - a.x) * f; ny = a.y + (ny - a.y) * f; fixed = true; }   // لا قفز
      const px = a.x, py = a.y;
      a.x = nx; a.y = ny; a.mt = now;
      ws.serializeAttachment(a);
      this.bcast({ t: 'p', id: a.id, x: r3(nx), y: r3(ny) }, ws);
      if (fixed) { try { ws.send(JSON.stringify({ t: 'f', x: r3(nx), y: r3(ny) })); } catch (e) {} }
      if (this.walk && this.walk.lead === a.id) this.moveFollower(a);
      this.touchBall(a, px, py, now);
      this.nearCheck(false);
      return;
    }

    if (j.t === 'pick') {
      if (j.o !== 'rose' || R.by || R.offer) return;
      for (const k of ['rose']) if (this.objs[k].by === a.id) return;   // يحمل شيئاً بالفعل
      if (dist(a, R) > TOUCH) return;
      R.by = a.id;
      this.save(); this.bcast(this.snap('rose'));
    } else if (j.t === 'drop') {
      if (R.by !== a.id) return;
      R.by = 0; R.offer = 0; R.x = a.x; R.y = clamp(a.y + 0.05, MINY, MAXY);
      this.save(); this.bcast(this.snap('rose'));
    } else if (j.t === 'give') {
      if (R.by !== a.id || R.offer) return;
      const p = this.other(a);
      if (!p || dist(a, p) > GIVE) return;
      R.offer = p.id; R.ot = now;
      this.save(); this.bcast(this.snap('rose'));
    } else if (j.t === 'accept') {
      if (R.offer !== a.id) return;
      if (now - R.ot <= OFFER_MS) R.by = a.id;                 // انتهت المهلة: تبقى مع المُهدي
      R.offer = 0;
      this.save(); this.bcast(this.snap('rose'));
    } else if (j.t === 'decline') {
      if (R.offer !== a.id) return;
      R.offer = 0;
      this.save(); this.bcast(this.snap('rose'));
    } else if (j.t === 'cd') {
      if (now - this.lastCd < 500 || dist(a, C) > CANDLE) return;
      this.lastCd = now;
      C.on = C.on ? 0 : 1;
      this.save(); this.bcast(this.snap('candle'));
    }
    ws.serializeAttachment(a);
  }

  // الكرة تتحرك عند ملامسة الشخصية لها وهي تمشي نحوها
  touchBall(a, px, py, now) {
    const b = this.objs.ball;
    if (now - this.lastKick < 250 || dist(a, b) > BALL_HIT) return;
    const dx = a.x - px, dy = a.y - py;
    const n = Math.hypot(dx, dy * 0.75);
    if (n < 0.004) return;
    if (dx * (b.x - px) + dy * (b.y - py) <= 0) return;        // لا تتحرك إن كانت الشخصية تبتعد عنها
    const sp = clamp(0.45 + n * 6, 0.45, 1.1);
    b.vx = (dx / n) * sp; b.vy = (dy / n) * sp;
    this.lastKick = now;
    this.startTick();
  }
  startTick() {
    if (this.tick) return;
    this.tick = setInterval(() => this.step(), 100);
  }
  stopTick() { if (this.tick) { clearInterval(this.tick); this.tick = 0; } }
  step() {
    const b = this.objs.ball, dt = 0.1;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < BX0) { b.x = BX0; b.vx = -b.vx * 0.6; } else if (b.x > BX1) { b.x = BX1; b.vx = -b.vx * 0.6; }
    if (b.y < BY0) { b.y = BY0; b.vy = -b.vy * 0.6; } else if (b.y > BY1) { b.y = BY1; b.vy = -b.vy * 0.6; }
    const f = Math.exp(-2.4 * dt);
    b.vx *= f; b.vy *= f;
    const settled = Math.hypot(b.vx, b.vy * 0.75) < 0.03;
    if (settled) { b.vx = 0; b.vy = 0; }
    this.bcast({ t: 'o', id: 'ball', x: r3(b.x), y: r3(b.y), vx: r3(b.vx), vy: r3(b.vy) });
    if (settled || !this.live().length) { this.stopTick(); this.save(); }
  }

  // ---------- امشِ معي / العناق / مسك اليد ----------
  playerWs(id) {
    for (const ws of this.live()) { const a = ws.deserializeAttachment(); if (a && a.id === id) return ws; }
    return null;
  }
  tell(ws, m) { try { ws.send(JSON.stringify({ t: 'e', m })); } catch (e) {} }
  moveFollower(lead) {
    const W = this.walk; if (!W) return;
    const fws = this.playerWs(W.fol);
    if (!fws) { this.stopWalk(); return; }
    const fa = fws.deserializeAttachment();
    const x = clamp(lead.x + W.dx, MINX, MAXX), y = clamp(lead.y, MINY, MAXY);
    fa.x = x; fa.y = y; fa.mt = Date.now();
    fws.serializeAttachment(fa);
    this.bcast({ t: 'p', id: fa.id, x: r3(x), y: r3(y) }, fws);
    try { fws.send(JSON.stringify({ t: 'f', x: r3(x), y: r3(y), s: 1 })); } catch (e) {}   // s: يمشي بنعومة لا يقفز
  }
  stopWalk() {
    if (!this.walk) return;
    this.walk = null;
    this.bcast({ t: 'w', on: 0 });
  }
  // RPC: يُستدعى من gestures.js قبل قبول عناق/مسك يد أثناء موعد جارٍ
  canTouch(uid) {
    const st = this.nearState();
    return st.k === 2 && !!st.fx && !!this.playerWs(uid);
  }

  // ---------- القرب ----------
  // التأثيرات (قلوب، توهج، زرا العناق ومسك اليد) تعمل فقط إن كان الطرفان متصلين وكلاهما لم يفعّل «المساحة الشخصية».
  nearState() {
    const k = parseInt(this.fx.split(':')[0], 10) || 0;
    const fx = this.fx.split(':')[1] === '1' ? 1 : 0;
    return { k, fx };
  }
  nearCheck(force) {
    const ps = [];
    for (const ws of this.live()) { const a = ws.deserializeAttachment(); if (a && a.id) ps.push(a); }
    let k = 0, fx = 1;
    if (ps.length >= 2) {
      if (ps.some((p) => p.ps)) fx = 0;
      else {
        const d = dist(ps[0], ps[1]);
        const cur = this.nearState().k;
        if (d < CLOSE || (cur === 2 && d < CLOSE + HYST)) k = 2;
        else if (d < NEAR || (cur >= 1 && d < NEAR + HYST)) k = 1;
      }
    }
    if (this.walk && (fx === 0 || ps.length < 2)) this.stopWalk();
    const key = k + ':' + fx;
    if (key === this.fx && !force) return;
    this.fx = key;
    this.bcast({ t: 'n', k, fx });
  }

  // عرض الوردة المنتهية مهلتها، وإسقاط وردة من غادر
  tidy(now) {
    const R = this.objs.rose;
    let ch = false;
    if (R.offer && now - R.ot > OFFER_MS) { R.offer = 0; ch = true; }
    if (R.by && !this.live().some((ws) => { const a = ws.deserializeAttachment(); return a && a.id === R.by; })) {
      R.by = 0; R.offer = 0; ch = true;
    }
    if (ch) { this.save(); this.bcast(this.snap('rose')); }
  }

  // ---------- إغلاق ----------
  leave(ws) {
    const a = ws.deserializeAttachment();
    if (!a || !a.id) return;
    // إن بقي للعضو اتصال آخر (استبدال تبويب) فلا نعدّه مغادراً
    if (this.live().some((o) => o !== ws && (o.deserializeAttachment() || {}).id === a.id)) return;
    if (this.walk && (this.walk.lead === a.id || this.walk.fol === a.id)) this.stopWalk();
    const R = this.objs.rose;
    if (R.by === a.id) { R.by = 0; R.offer = 0; R.x = a.x; R.y = clamp(a.y + 0.05, MINY, MAXY); this.save(); this.bcast(this.snap('rose'), ws); }
    else if (R.offer === a.id) { R.offer = 0; this.save(); this.bcast(this.snap('rose'), ws); }
    this.bcast({ t: 'l', id: a.id }, ws);
    this.nearCheck(false);
  }
  webSocketClose(ws) {
    try { ws.close(1000, 'closed'); } catch (e) {}
    this.leave(ws);
  }
  webSocketError(ws) {
    try { ws.close(1011, 'error'); } catch (e) {}
    this.leave(ws);
  }

  // إغلاق الاتصالات الخاملة حتى لا تبقى الكائنات مستيقظة بلا حاجة
  async alarm() {
    const now = Date.now();
    let left = 0;
    for (const ws of this.live()) {
      const a = ws.deserializeAttachment();
      if (!a || now - (a.la || 0) > IDLE_MS) { try { ws.close(1000, 'idle'); } catch (e) {} } else left++;
    }
    if (left) await this.ctx.storage.setAlarm(now + 120000);
  }

  // RPC: يُستدعى من dEnd عند انتهاء الموعد
  async end() {
    this.stopTick();
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, 'end'); } catch (e) {} }
    try { await this.ctx.storage.deleteAlarm(); } catch (e) {}
    try { await this.ctx.storage.deleteAll(); } catch (e) {}
    this.objs = freshObjs(); this.pair = null; this.fx = '0:0'; this.simple = 0; this.walk = null;
  }
}

// ---------- بوابة Worker: GET /api/date/scene?id=<الموعد> (WebSocket) ----------
// لا يمرَّر الاتصال إلا لطرف في علاقة نشطة وموعده جارٍ (live).
export async function sceneConnect(req, env, url) {
  if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'مطلوب اتصال WebSocket' }, 426);
  let okOrigin = false;
  try { okOrigin = new URL(req.headers.get('origin') || '').host === url.host; } catch { okOrigin = false; }
  if (!okOrigin) return json({ error: 'مرفوض' }, 403);
  if (!env.DATE_SCENE) return json({ error: 'غير متاح' }, 503);
  const id = parseInt(url.searchParams.get('id'), 10) || 0;
  if (!id) return json({ error: 'طلب غير صالح' }, 400);
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'انتهت الجلسة' }, 401);
  if (u.role === 'visitor') return json({ error: 'غير مسموح' }, 403);
  const r = await env.DB.prepare(
    "SELECT r.user_a,r.user_b FROM rel_dates d JOIN relationships r ON r.id=d.rel_id " +
    "WHERE d.id=? AND d.status='live' AND r.status='active' AND (r.user_a=? OR r.user_b=?)"
  ).bind(id, u.id, u.id).first();
  if (!r) return json({ error: 'الموعد غير جارٍ' }, 409);
  const pid = r.user_a === u.id ? r.user_b : r.user_a;
  const sp = await env.DB.prepare('SELECT personal_space ps FROM scene_prefs WHERE user_id=?').bind(u.id).first();
  // الهوية تُمرَّر بترويسات داخلية تُستبدل دائماً، فلا يستطيع العميل تزويرها
  const r2 = new Request(req);
  r2.headers.set('x-uid', String(u.id));
  r2.headers.set('x-pid', String(pid));
  r2.headers.set('x-uname', encodeURIComponent(u.name || ''));
  r2.headers.set('x-ps', sp && sp.ps ? '1' : '0');
  return env.DATE_SCENE.get(env.DATE_SCENE.idFromName('d' + id)).fetch(r2);
}
