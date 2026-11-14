/* مشهد الموعد الغرامي: شاشة كاملة بخلفية حسب نوع الموعد وإضاءة ناعمة متحركة.
   أنت على اليمين وشريكك على اليسار، ولكل منكما فقاعة واحدة فقط: تظهر ثم تختفي بعد ثوانٍ،
   وعندما يكتب الآخر تختفي فقاعتك فوراً وتحل فقاعته. الرسائل لا تُسرد كقائمة.
   يُفتح من نافذة الارتباط (love.html ← مواعيد) عبر dateOpen(id). الخادم: src/dates.js */
var DT = { id: 0, ty: '', after: 0, off: 0, started: 0, tm: 0, poll: 0, raf: 0, raf2: 0, bt: {}, mt: 0, root: null, onResize: null, onResize2: null, onVis: null, onKey: null, ws: null, wsOk: 0, wsN: 0, wsIdle: 0, wsT: 0, hideT: 0, pingT: 0, actT: 0, ch: null, ob: {}, els: {}, near: { k: 0, fx: 1 }, hearts: [], myId: 0, soff: 0 };

var DT_TH = {
  'عشاء رومانسي': ['#1a0612', '#7a1f3d'],
  'سينما': ['#050816', '#1e1b4b'],
  'مشي على الشاطئ': ['#1e3a5f', '#c2410c'],
  'قهوة وحديث': ['#2b1a10', '#8b5a2b'],
  'أمسية ألعاب': ['#1a0b3b', '#6d28d9']
};

function dtToast(m, k) { try { if (typeof relToast === 'function') relToast(m, k); else if (typeof toast === 'function') toast(m); } catch (e) {} }

function dtNode(tag, css, txt) {
  var e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (txt != null) e.textContent = txt;
  return e;
}

function dtReduce() {
  try {
    if (typeof gstReduce === 'function') return !!gstReduce();
    return !!(REL && REL.prefs && REL.prefs.reduce_motion) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { return false; }
}

function dtBub(side, text, ms) {
  var e = DT.root && DT.root.querySelector(side === 'm' ? '#dbm' : '#dbh');
  var e2 = DT.root && DT.root.querySelector(side === 'm' ? '#sbm' : '#sbh');   // فقاعة النمط البسيط
  if (!e && !e2) return;
  clearTimeout(DT.bt[side]);
  if (e) { e.textContent = text; e.style.opacity = '1'; }
  if (e2) { e2.textContent = text; e2.style.opacity = '1'; }
  DT.bt[side] = setTimeout(function () { if (e) e.style.opacity = '0'; if (e2) e2.style.opacity = '0'; }, ms || 6500);
}
function dtBubX(side) {
  clearTimeout(DT.bt[side]);
  var e = DT.root && DT.root.querySelector(side === 'm' ? '#dbm' : '#dbh');
  var e2 = DT.root && DT.root.querySelector(side === 'm' ? '#sbm' : '#sbh');
  if (e) e.style.opacity = '0';
  if (e2) e2.style.opacity = '0';
}
function dtFlash(text) {
  var e = DT.root && DT.root.querySelector('#dmid');
  if (!e) return;
  e.textContent = text;
  e.style.opacity = '1';
  clearTimeout(DT.mt);
  DT.mt = setTimeout(function () { e.style.opacity = '0'; }, 5000);
}

/* إضاءة ناعمة عائمة (bokeh) على canvas. مع «تقليل الحركة» تُرسم مرة واحدة ثابتة. */
function dtBokeh() {
  var c = DT.root.querySelector('canvas'), x = c.getContext('2d'), P = [], w = 0, h = 0, still = dtReduce();
  function size() { w = c.width = innerWidth; h = c.height = innerHeight; }
  size();
  for (var i = 0; i < 26; i++) {
    P.push({ x: Math.random() * w, y: Math.random() * h, r: 12 + Math.random() * 40, vx: (Math.random() - 0.5) * 0.3, vy: -0.15 - Math.random() * 0.3, a: 0.1 + Math.random() * 0.18, h: Math.random() < 0.5 ? '#fb7185' : '#fde68a' });
  }
  function frame() {
    x.clearRect(0, 0, w, h);
    P.forEach(function (p) {
      if (!still) { p.x += p.vx; p.y += p.vy; if (p.y < -60) { p.y = h + 60; p.x = Math.random() * w; } }
      var g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, p.h + ('0' + Math.round(p.a * 255).toString(16)).slice(-2));
      g.addColorStop(1, p.h + '00');
      x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill();
    });
    if (!still) DT.raf = requestAnimationFrame(frame);
  }
  DT.onResize = function () { size(); if (still) frame(); };
  window.addEventListener('resize', DT.onResize);
  frame();
}

function dtClock() {
  var e = DT.root && DT.root.querySelector('#dtm2');
  if (!e || !DT.started) return;
  var t = Math.max(0, Math.floor((Date.now() + DT.off - DT.started) / 1000));
  e.textContent = ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + (t % 60)).slice(-2);
}

function dtClose(msg) {
  clearTimeout(DT.poll); clearInterval(DT.tm); cancelAnimationFrame(DT.raf); cancelAnimationFrame(DT.raf2);
  clearTimeout(DT.bt.m); clearTimeout(DT.bt.h); clearTimeout(DT.mt);
  clearTimeout(DT.wsT); clearTimeout(DT.hideT); clearInterval(DT.pingT); clearInterval(DT.actT);
  if (DT.onResize) window.removeEventListener('resize', DT.onResize);
  if (DT.onResize2) window.removeEventListener('resize', DT.onResize2);
  if (DT.onVis) document.removeEventListener('visibilitychange', DT.onVis);
  if (DT.onKey) document.removeEventListener('keydown', DT.onKey);
  var w = DT.ws; DT.ws = null; DT.wsOk = 0;       // قبل تصفير id كي لا تُعاد المحاولة
  DT.id = 0;
  if (w) { try { w.close(1000, 'bye'); } catch (e) {} }
  if (DT.root) DT.root.remove();
  DT.root = null; DT.onResize = null; DT.onResize2 = null; DT.onVis = null; DT.onKey = null;
  DT.els = {}; DT.ob = {}; DT.ch = null; DT.drag = false;
  if (msg) dtToast(msg);
}

function dtPoll() {
  var id = DT.id;
  if (!id) return;
  api('date/poll?id=' + id + '&after=' + DT.after).then(function (r) {
    if (DT.id !== id) return;                       // أُغلق المشهد أثناء الطلب
    var j = r.j || {};
    if (j.ok) {
      DT.off = j.now - Date.now();
      if (j.started) DT.started = j.started;
      if (j.status !== 'live') { dtClose(j.status === 'done' ? '🎬 انتهى الموعد وحُفظ في ذكرياتنا' : 'انتهى الموعد'); return; }
      (j.msgs || []).forEach(function (m) {
        if (m.id > DT.after) DT.after = m.id;
        if (m.kind === 'q') { dtFlash('🎲 ' + m.text); return; }
        if (m.mine) return;                         // رسالتي عُرضت فور إرسالها
        dtBubX('m'); dtBub('h', m.text);
      });
    } else if (r.s === 404 || r.s === 403 || r.s === 409) { dtClose('تعذر متابعة الموعد'); return; }
    DT.poll = setTimeout(dtPoll, 1500);
  }, function () { if (DT.id === id) DT.poll = setTimeout(dtPoll, 3000); });
}

function dtSend() {
  var i = DT.root.querySelector('#dtx'), v = i.value.trim();
  if (!v) return;
  i.value = '';
  api('date/say', { id: DT.id, text: v }).then(function (r) {
    if (!(r.j && r.j.ok)) dtToast('⚠️ ' + ((r.j && r.j.error) || 'تعذر الإرسال'));
  }, function () { dtToast('⚠️ تعذر الاتصال بالخادم'); });
  dtBubX('h'); dtBub('m', v);
}

function dateOpen(id) {
  if (DT.root || !id) return;
  api('date/start', { id: id }).then(function (r) {
    if (!(r.j && r.j.ok)) { dtToast('⚠️ ' + ((r.j && r.j.error) || 'تعذر بدء الموعد')); return; }
    return api('date/poll?id=' + id + '&after=0').then(function (p) {
      var j = p.j || {};
      if (!j.ok || j.status !== 'live') { dtToast('⚠️ ' + (j.error || 'الموعد غير جارٍ')); return; }
      dtBuild(id, j);
    });
  }, function () { dtToast('⚠️ تعذر الاتصال بالخادم'); });
}

/* ===== المرحلة 1: المسرح والحركة اللحظية =====
   الخادم: src/scene.js (DateScene). الإحداثيات نسبية 0..1 على مسرح 4:3، والمسافة بعرض المسرح (y × 0.75).
   السحب أو النقر للمشي، والقرب يفتح العناق ومسك اليد، والأشياء: وردة تُسلَّم، كرة تُدفع، شمعة تُضيء. */
var DT_LIM = { x0: 0.05, x1: 0.95, y0: 0.16, y1: 0.95 };   // نفس حدود الخادم
var DT_REACH = { touch: 0.14, give: 0.20, candle: 0.20, table: 0.26, pour: 0.26, toast: 0.22, chair: 0.16, feed: 0.15, side: 0.20 };   // الأخيرة الثلاث لمشهد العشاء (نفس قيم الخادم)
var DT_TBL = { x: 0.5, y: 0.46 };
var DT_SIDE = { x: 0.84, y: 0.80 };            // الطاولة الصغيرة في الزاوية الأمامية اليمنى (نفس SIDE في الخادم)
var DT_OFFER_MS = 20000;

function dtDist(a, b) { return Math.hypot(a.x - b.x, (a.y - b.y) * 0.75); }
function dtClamp(v, a, b) { return v < a ? a : v > b ? b : v; }

var DT_SVG = {
  rose: '<svg viewBox="0 0 40 64" width="100%" height="100%"><path d="M20 28C20 42 18 54 18 62" stroke="#16a34a" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M18 48C9 46 7 40 7 40C14 40 18 44 18 48Z" fill="#22c55e"/><circle cx="20" cy="18" r="12" fill="#e11d48"/><path d="M12 17C15 7 25 7 28 17C25 13 15 13 12 17Z" fill="#fb7185"/><path d="M20 11C25 11 28 16 23 20C19 23 14 20 16 16" stroke="#9f1239" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  ball: '<svg viewBox="0 0 40 40" width="100%" height="100%"><defs><radialGradient id="dtbg" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fef3c7"/><stop offset="1" stop-color="#f59e0b"/></radialGradient></defs><circle cx="20" cy="20" r="18" fill="url(#dtbg)" stroke="#b45309" stroke-width="1.5"/><path d="M4 18C14 24 26 24 36 18M20 2C14 12 14 28 20 38" stroke="#b45309" stroke-width="1.5" fill="none" opacity=".55"/></svg>',
  candle: '<svg viewBox="0 0 60 90" width="100%" height="100%"><ellipse cx="30" cy="80" rx="28" ry="8" fill="#3b1d12"/><ellipse cx="30" cy="77" rx="28" ry="8" fill="#6b3a1e"/><rect x="24" y="38" width="12" height="38" rx="3" fill="#fef3c7"/><rect x="24" y="38" width="12" height="6" rx="3" fill="#fde68a"/><rect x="29" y="32" width="2" height="7" fill="#444"/></svg>'
};

function dtImgUrl(w) { return w && w.id && w.iv ? '/api/img?u=' + w.id + '&k=img&v=' + w.iv : ''; }


/* ---------- وجوه مرسومة بدل صور الملف الشخصي: البشرة والشعر والتسريحة من معرّف الشخص ---------- */
var DT_SKIN = ['#f6d3b8', '#eebd9a', '#d9a07a', '#b97a56', '#8d5a3b'];
var DT_HAIR = ['#2b1a16', '#4a2c1a', '#7a4a22', '#1f2937', '#a0522d'];
var DT_EYE = ['#4a2c1a', '#1f2937', '#6b4a1f', '#2f6b4f', '#3b6fb6'], DT_FID = 0;
function dtShade(hex, k) {                      // k < 0 أغمق، k > 0 أفتح
  var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  function f(v) { return Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); }
  return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
}
function dtFaceSvg(seed) {
  var h = (Math.imul((+seed || 7) + 13, 2654435761) >>> 0), sk = DT_SKIN[h % 5], hc = DT_HAIR[(h >>> 4) % 5], st = (h >>> 8) % 3;
  var bd = ((h >>> 12) % 4) * 0.7, ec = DT_EYE[(h >>> 16) % 5], fr = ((h >>> 20) % 3) === 0;
  var id = 'df' + (++DT_FID) + '_', skD = dtShade(sk, -0.2), skL = dtShade(sk, 0.35), hcD = dtShade(hc, -0.4), hcL = dtShade(hc, 0.4);
  var defs = '<defs>' +
    '<radialGradient id="' + id + 's" cx="38%" cy="30%" r="88%"><stop offset="0" stop-color="' + skL + '"/><stop offset=".5" stop-color="' + sk + '"/><stop offset="1" stop-color="' + skD + '"/></radialGradient>' +
    '<linearGradient id="' + id + 'h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + hcL + '"/><stop offset=".45" stop-color="' + hc + '"/><stop offset="1" stop-color="' + hcD + '"/></linearGradient>' +
    '<radialGradient id="' + id + 'i" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="' + dtShade(ec, 0.5) + '"/><stop offset="1" stop-color="' + dtShade(ec, -0.35) + '"/></radialGradient>' +
    '<radialGradient id="' + id + 'b"><stop offset="0" stop-color="#fb7185" stop-opacity=".55"/><stop offset="1" stop-color="#fb7185" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="' + id + 'l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0566f"/><stop offset="1" stop-color="#b8334f"/></linearGradient></defs>';
  function eye(cx, dir) {                       // dir: +1 للعين اليمنى (طرفها الخارجي يميناً)، -1 لليسرى
    var cy = 55, L = cx - 7.6, R = cx + 7.6;
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="7.4" ry="5.7" fill="#fff"/>' +
      '<circle cx="' + cx + '" cy="' + (cy + 0.4) + '" r="4.4" fill="url(#' + id + 'i)"/><circle cx="' + cx + '" cy="' + (cy + 0.4) + '" r="2.1" fill="#120a08"/>' +
      '<circle cx="' + (cx - 1.7) + '" cy="' + (cy - 1.5) + '" r="1.6" fill="#fff"/><circle cx="' + (cx + 1.7) + '" cy="' + (cy + 2) + '" r=".75" fill="#fff" opacity=".85"/>' +
      '<ellipse cx="' + cx + '" cy="' + cy + '" rx="8.2" ry="0" fill="' + sk + '"><animate attributeName="ry" values="0;0;6.6;0;0" keyTimes="0;0.92;0.96;0.99;1" dur="4.5s" begin="' + bd + 's" repeatCount="indefinite"/></ellipse>' +
      '<path d="M' + L + ' ' + (cy - 0.4) + ' Q' + cx + ' ' + (cy - 8.6) + ' ' + R + ' ' + (cy - 0.4) + '" stroke="#1a0f0c" stroke-width="2.3" fill="none" stroke-linecap="round"/>' +
      '<path d="M' + (cx + dir * 7.3) + ' ' + (cy - 1.6) + ' l' + (dir * 2.8) + ' -2.4" stroke="#1a0f0c" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M' + (cx - 5) + ' ' + (cy + 5) + ' Q' + cx + ' ' + (cy + 7) + ' ' + (cx + 5) + ' ' + (cy + 5) + '" stroke="' + skD + '" stroke-width=".9" fill="none" opacity=".7" stroke-linecap="round"/>';
  }
  var back = st === 1 ? '<path d="M3 100V46Q1 1 50 1Q99 1 97 46V100Q86 92 84 70L16 70Q14 92 3 100Z" fill="url(#' + id + 'h)"/>' : '';
  var bun = st === 2 ? '<circle cx="50" cy="5" r="13" fill="url(#' + id + 'h)"/><path d="M42 3Q50 -2 58 3" stroke="' + hcL + '" stroke-width="1.6" fill="none" opacity=".6" stroke-linecap="round"/>' : '';
  var front = st === 0
    ? '<path d="M9 54Q3 6 50 3Q97 6 91 54Q85 32 64 27Q42 40 21 33Q13 40 9 54Z" fill="url(#' + id + 'h)"/><path d="M28 13Q46 6 68 13" stroke="' + hcL + '" stroke-width="2.4" fill="none" opacity=".55" stroke-linecap="round"/><path d="M22 33Q42 36 62 25" stroke="' + hcD + '" stroke-width="1.2" fill="none" opacity=".5"/>'
    : st === 1
      ? '<path d="M7 58Q1 4 50 2Q99 4 93 58Q89 34 75 28Q61 25 50 31Q39 25 25 28Q11 34 7 58Z" fill="url(#' + id + 'h)"/><path d="M50 2Q50 18 50 31" stroke="' + hcD + '" stroke-width="1.1" opacity=".5" fill="none"/><path d="M24 14Q36 7 46 9M76 14Q64 7 54 9" stroke="' + hcL + '" stroke-width="2.2" fill="none" opacity=".5" stroke-linecap="round"/>'
      : '<path d="M9 54Q4 9 50 7Q96 9 91 54Q82 31 50 27Q18 31 9 54Z" fill="url(#' + id + 'h)"/><path d="M30 14Q50 8 70 14" stroke="' + hcL + '" stroke-width="2.2" fill="none" opacity=".55" stroke-linecap="round"/>';
  var frk = fr ? '<g fill="' + skD + '" opacity=".55"><circle cx="30" cy="66" r=".8"/><circle cx="35" cy="69" r=".8"/><circle cx="27" cy="71" r=".8"/><circle cx="70" cy="66" r=".8"/><circle cx="65" cy="69" r=".8"/><circle cx="73" cy="71" r=".8"/></g>' : '';
  return '<svg viewBox="0 0 100 100" width="100%" height="100%" style="display:block">' + defs +
    '<rect width="100" height="100" fill="' + skD + '"/>' + back +
    '<ellipse cx="14.5" cy="59" rx="4.6" ry="7.2" fill="' + sk + '"/><ellipse cx="14.5" cy="59.5" rx="2" ry="4.2" fill="' + skD + '" opacity=".4"/>' +
    '<ellipse cx="85.5" cy="59" rx="4.6" ry="7.2" fill="' + sk + '"/><ellipse cx="85.5" cy="59.5" rx="2" ry="4.2" fill="' + skD + '" opacity=".4"/>' +
    '<ellipse cx="50" cy="58" rx="35" ry="38" fill="url(#' + id + 's)"/>' + bun + front +
    '<path d="M22 44Q32 38.5 42 42.5M58 42.5Q68 38.5 78 44" stroke="' + hc + '" stroke-width="2.9" fill="none" stroke-linecap="round"/>' +
    eye(33, -1) + eye(67, 1) +
    '<ellipse cx="24" cy="70" rx="9" ry="6" fill="url(#' + id + 'b)"/><ellipse cx="76" cy="70" rx="9" ry="6" fill="url(#' + id + 'b)"/>' + frk +
    '<ellipse cx="50" cy="62" rx="1.7" ry="2.8" fill="' + skL + '" opacity=".55"/><path d="M47.3 66.6Q50 69.4 52.7 66.6" stroke="' + skD + '" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
    '<g class="fm1"><path d="M39 75Q45 72.4 50 74Q55 72.4 61 75Q50 78.6 39 75Z" fill="#c2415c"/><path d="M40.5 75.6Q50 85 59.5 75.6Q50 78.4 40.5 75.6Z" fill="url(#' + id + 'l)"/><ellipse cx="50" cy="79.8" rx="3.4" ry="1" fill="#fff" opacity=".35"/></g>' +
    '<g class="fm2" style="display:none"><path d="M38.5 75Q50 71.5 61.5 75Q59 88 50 88.5Q41 88 38.5 75Z" fill="#5b0f1d"/><path d="M41 75.4Q50 73.2 59 75.4L58.2 79Q50 77.6 41.8 79Z" fill="#fff"/><ellipse cx="50" cy="84.5" rx="5.5" ry="3" fill="#f0627a"/></g>' +
    '</svg>';
}
function dtFaceMouth(el, open) {                // الفم يُفتح عند الأكل والشرب
  var f = el._fc; if (!f || f.o === open) return;
  f.o = open; f.a.style.display = open ? 'none' : ''; f.b.style.display = open ? '' : 'none';
}

function dtChar(letter, grad, glow, bubId, url, seed) {
  var c = dtNode('div', 'position:absolute;left:0;top:0;width:calc(var(--s)*.64);height:calc(var(--s)*.64);margin:calc(var(--s)*-1.94) 0 0 calc(var(--s)*-.32);pointer-events:none;will-change:transform;transition:opacity .4s');
  var bub = dtNode('div', 'position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);width:max-content;max-width:calc(var(--s)*2.6);min-height:30px;padding:7px 11px;border-radius:16px;background:#ffffffee;color:#1d2330;opacity:0;transition:opacity .5s;word-break:break-word;text-align:center;font-size:14px;line-height:1.4');
  bub.id = bubId;
  var av = dtNode('div', 'position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:calc(var(--s)*.26);font-weight:700;border:3px solid #fff9;box-shadow:0 0 22px ' + glow + ',0 6px 12px #0006;background:' + grad, '');
  av.className = 'dtav';
  av.innerHTML = dtFaceSvg(seed);                 // وجه مرسوم (رسم ثابت من الكود فقط)
  c._fc = { a: av.querySelector('.fm1'), b: av.querySelector('.fm2'), o: 0 };
  c.appendChild(bub); c.appendChild(av);
  return c;
}

function dtObjEl(svg, w, css) {
  var e = dtNode('div', 'position:absolute;left:0;top:0;width:calc(var(--s)*' + w + ');pointer-events:none;' + css);
  e.innerHTML = svg;      // رسوم ثابتة مكتوبة في الكود فقط
  return e;
}

/* ---------- النمط البسيط: فقاعتان للطرفين فقط (بدون مسرح ولا حركة) ---------- */
function dtSmCard(side, name, letter, grad, glow, url) {
  var c = dtNode('div', 'display:flex;flex-direction:column;align-items:center;gap:8px;width:42%;max-width:220px');
  var bub = dtNode('div', 'min-height:44px;max-width:100%;padding:8px 12px;border-radius:16px;background:#ffffffee;color:#1d2330;opacity:0;transition:opacity .5s;word-break:break-word;text-align:center;font-size:15px;line-height:1.4');
  bub.id = side === 'm' ? 'sbm' : 'sbh';
  var av = dtNode('div', 'position:relative;width:96px;height:96px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:700;border:3px solid #fff9;box-shadow:0 0 22px ' + glow + ',0 6px 12px #0006;background:' + grad, letter);
  if (url) {
    var im = document.createElement('img');
    im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
    im.alt = ''; im.draggable = false;
    im.onerror = function () { im.remove(); };
    im.src = url;
    av.appendChild(im);
  }
  var nm = dtNode('b', 'font-size:14px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', name);
  var sd = dtNode('span', 'font-size:12px;opacity:.85', side === 'm' ? '🟢 أنت' : '⚪ غير متصل');
  sd.id = side === 'm' ? 'sdm' : 'sdh';
  c.appendChild(bub); c.appendChild(av); c.appendChild(nm); c.appendChild(sd);
  return c;
}
function dtSmHere() {
  var e = DT.root && DT.root.querySelector('#sdh');
  if (e) e.textContent = DT.ch && DT.ch.p.here ? '🟢 متصل' : '⚪ غير متصل';
}
function dtApplyMode() {
  if (!DT.root) return;
  var area = DT.root.querySelector('#dtarea');
  if (area) area.style.display = DT.simple ? 'none' : 'flex';
  if (DT.sm) DT.sm.style.display = DT.simple ? 'flex' : 'none';
  if (DT.modeBtn) DT.modeBtn.textContent = DT.simple ? '🎭 مشهد متحرك' : '🫧 نمط بسيط';
  DT.sig = '';
  dtSmHere();
  if (!DT.simple) dtStageSize();
}
function dtToggleMode() {
  var want = DT.simple ? 0 : 1;
  if (DT.wsOk) dtWsSend({ t: 'mode', simple: want });   // الخادم يبثّه للطرفين فيصل الرد في dtOnMsg
  else { DT.simple = want; dtApplyMode(); }
}

function dtStageSize() {
  if (!DT.root) return;
  var top = DT.root.querySelector('#dttop'), bar = DT.root.querySelector('#dtbar'), ar = DT.root.querySelector('#dtarea');
  var t = top ? top.offsetHeight : 48, b = bar ? bar.offsetHeight : 60;
  var safe = parseFloat(getComputedStyle(DT.root).paddingTop) || 0;   // منطقة الأمان العلوية (الجوال)
  ar.style.top = (safe + t) + 'px'; ar.style.bottom = b + 'px';
  if (DT.sm) { DT.sm.style.top = ar.style.top; DT.sm.style.bottom = ar.style.bottom; }
  var aw = innerWidth - 8, ah = innerHeight - safe - t - b - 8;
  var w = Math.max(200, Math.min(aw, ah * 4 / 3)), h = w * 3 / 4;
  var st = DT.st;
  st.style.width = w + 'px'; st.style.height = h + 'px';
  DT.s = dtClamp(w * 0.11, 44, 92); st.style.setProperty('--s', DT.s + 'px');
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  DT.fx.width = Math.round(w * dpr); DT.fx.height = Math.round(h * dpr);
  DT.fx.style.width = w + 'px'; DT.fx.style.height = h + 'px';
  DT.sw = w; DT.sh = h; DT.dpr = dpr;
  if (DT.bd) { DT.bd.width = Math.round(w * dpr); DT.bd.height = Math.round(h * dpr); DT.bd.style.width = w + 'px'; DT.bd.style.height = h + 'px'; DT.bdx = null; }
  dtBgBuild();
}

/* ---------- المرحلة 2: الخلفيات والشخصيات بالكانفاس ---------- */
var DT_SKIN = '#edbf9d';
var DT_PAL = {
  m: { top: '#0f766e', top2: '#2dd4bf', leg: '#1f2937', shoe: '#0b1220' },
  p: { top: '#be123c', top2: '#fb7185', leg: '#3b2f63', shoe: '#150f2b' }
};

// خلفية كل نوع موعد: تُرسم مرة واحدة على لوحة خفية وتُنسخ كل إطار
function dtBgBuild() {
  var W = DT.sw, H = DT.sh, k = DT.dpr || 1;
  if (!W || !H) return;
  var c = document.createElement('canvas');
  c.width = Math.round(W * k); c.height = Math.round(H * k);
  var g = c.getContext('2d'); g.scale(k, k);
  var ty = DT.ty, hz = H * 0.16, th = DT_TH[ty] || DT_TH['عشاء رومانسي'], i;
  function lin(y0, y1, a, b) { var q = g.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; }
  g.fillStyle = lin(0, hz, th[0], th[1]); g.fillRect(0, 0, W, hz);
  g.fillStyle = lin(hz, H, th[1], th[0]); g.fillRect(0, hz, W, H - hz);
  if (ty === 'مشي على الشاطئ') {
    g.fillStyle = lin(0, H * 0.1, '#fb923c', '#f472b6'); g.fillRect(0, 0, W, H * 0.1);
    g.fillStyle = '#fde68a'; g.beginPath(); g.arc(W * 0.5, H * 0.1, W * 0.06, Math.PI, 0); g.fill();
    g.fillStyle = lin(H * 0.1, H * 0.22, '#0ea5e9', '#0369a1'); g.fillRect(0, H * 0.1, W, H * 0.12);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5;
    for (i = 0; i < 4; i++) { g.beginPath(); for (var x = 0; x <= W; x += 12) g.lineTo(x, H * (0.125 + i * 0.027) + Math.sin(x / 22 + i) * 2); g.stroke(); }
    g.fillStyle = lin(H * 0.22, H, '#fde68a', '#c99a54'); g.fillRect(0, H * 0.22, W, H * 0.78);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, H * 0.22, W, 3);
    g.fillStyle = 'rgba(120,80,30,.25)'; for (i = 0; i < 40; i++) { g.beginPath(); g.arc(((i * 137) % 100) / 100 * W, H * (0.3 + ((i * 53) % 65) / 100), 1.6, 0, 7); g.fill(); }
  } else if (ty === 'سينما') {
    g.fillStyle = '#c7d2fe'; g.shadowColor = '#818cf8'; g.shadowBlur = 24; g.fillRect(W * 0.2, H * 0.02, W * 0.6, H * 0.11); g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,.04)'; for (i = 0; i < 6; i++) g.fillRect(0, hz + (H - hz) * i / 6, W, 2);
    g.fillStyle = '#4c0519'; for (i = 0; i < 9; i++) { var sx = W * (0.04 + i * 0.105); g.beginPath(); g.roundRect ? g.roundRect(sx, H * 0.9, W * 0.085, H * 0.12, 8) : g.rect(sx, H * 0.9, W * 0.085, H * 0.12); g.fill(); }
  } else if (ty === 'قهوة وحديث') {
    g.fillStyle = 'rgba(253,224,71,.30)'; g.fillRect(W * 0.62, H * 0.02, W * 0.3, H * 0.11);
    g.strokeStyle = '#3b2412'; g.lineWidth = 3; g.strokeRect(W * 0.62, H * 0.02, W * 0.3, H * 0.11);
    g.beginPath(); g.moveTo(W * 0.77, H * 0.02); g.lineTo(W * 0.77, H * 0.13); g.stroke();
    g.fillStyle = '#5a3418'; g.fillRect(W * 0.05, H * 0.07, W * 0.45, H * 0.07);
    g.fillStyle = '#f5e6d3'; for (i = 0; i < 5; i++) { g.beginPath(); g.arc(W * (0.1 + i * 0.08), H * 0.065, 5, 0, 7); g.fill(); }
    var q = H * 0.08; g.fillStyle = 'rgba(255,255,255,.045)';
    for (var r = 0; r * q < H - hz; r++) for (var cc = 0; cc * q < W; cc++) if ((r + cc) % 2) g.fillRect(cc * q, hz + r * q, q, q);
  } else if (ty === 'أمسية ألعاب') {
    g.fillStyle = '#f0abfc'; g.shadowColor = '#e879f9'; g.shadowBlur = 14; g.fillRect(W * 0.06, H * 0.035, W * 0.88, H * 0.012); g.shadowBlur = 0;
    g.fillStyle = 'rgba(76,29,149,.65)'; g.beginPath(); g.ellipse(W * 0.5, H * 0.62, W * 0.42, H * 0.3, 0, 0, 7); g.fill();
    g.strokeStyle = '#a78bfa'; g.lineWidth = 3; g.stroke();
    var cols = ['#fb7185', '#fbbf24', '#34d399', '#60a5fa'];
    for (i = 0; i < 30; i++) { g.fillStyle = cols[i % 4]; g.globalAlpha = 0.5; g.beginPath(); g.arc(W * (0.12 + ((i * 71) % 77) / 100), H * (0.35 + ((i * 37) % 55) / 100), 4, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  } else {   // عشاء رومانسي
    g.fillStyle = 'rgba(255,255,255,.05)'; for (i = 1; i < 12; i++) g.fillRect(0, hz + (H - hz) * i / 12, W, 1);
    var cg = lin(0, H * 0.3, '#7f1d1d', '#450a0a'); g.fillStyle = cg; g.fillRect(0, 0, W * 0.07, H * 0.3); g.fillRect(W * 0.93, 0, W * 0.07, H * 0.3);
    g.fillStyle = '#fde68a'; for (i = 0; i < 15; i++) { g.beginPath(); g.arc(W * i / 14, H * 0.04 + Math.sin(i * 1.3) * 4, 2.6, 0, 7); g.fill(); }
    g.fillStyle = '#f3dfe4'; g.beginPath(); g.ellipse(W * 0.5, H * 0.40, W * 0.17, H * 0.055, 0, 0, 7); g.fill();
    g.fillStyle = '#e7c4cd'; g.beginPath(); g.moveTo(W * 0.33, H * 0.40); g.lineTo(W * 0.33, H * 0.50); g.quadraticCurveTo(W * 0.5, H * 0.56, W * 0.67, H * 0.50); g.lineTo(W * 0.67, H * 0.40); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(W * 0.43, H * 0.395, W * 0.035, H * 0.014, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(W * 0.57, H * 0.395, W * 0.035, H * 0.014, 0, 0, 7); g.fill();
  }
  var vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.28, W / 2, H * 0.55, W * 0.75);   // إضاءة: أطراف أغمق
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  DT.bgc = c;
}

function dtReach(sx, sy, tx, ty, R) {
  var dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  return [sx + dx, sy + dy];
}
function dtArm(g, sx, sy, hx, hy, pal, s) {
  var mx = sx + (hx - sx) * 0.55, my = sy + (hy - sy) * 0.55 + s * 0.03;   // مرفق منخفض قليلاً
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = pal.top; g.lineWidth = s * 0.16;
  g.beginPath(); g.moveTo(sx, sy); g.lineTo(mx, my); g.stroke();
  g.strokeStyle = DT_SKIN; g.lineWidth = s * 0.12;
  g.beginPath(); g.moveTo(mx, my); g.lineTo(hx, hy); g.stroke();
  g.fillStyle = DT_SKIN; g.beginPath(); g.arc(hx, hy, s * 0.075, 0, 7); g.fill();
}
// جسم الشخصية: الموضع (x,y) عند القدمين، والرأس (صورة الملف) عنصر DOM فوقه
function dtFigureFront(g, c, pal, ts, here, link, fa) {
  var W = DT.sw, H = DT.sh, s = DT.s;
  var fx = (c.x == null ? 0.5 : c.x) * W, fy = (c.y == null ? 0.7 : c.y) * H;
  var sit = c.sit || 0, sdy = sit * s * 0.36;      // جلوس: ينزل الجسم نحو المقعد
  var mv = c.moving && !DT.still && sit < 0.02;
  var sw = mv ? Math.sin(ts / 110 + (c === DT.ch.p ? 1.3 : 0)) : 0;
  var bob = mv ? Math.abs(Math.sin(ts / 110)) * H * 0.018 : 0;
  var hipY = fy - s * 0.66 - bob * 0.5 + sdy, shY = fy - s * 1.16 - bob + sdy;
  g.globalAlpha = (here ? 1 : 0.38) * (fa == null ? 1 : fa);
  g.fillStyle = 'rgba(0,0,0,.30)';
  g.beginPath(); g.ellipse(fx, fy + s * 0.03, s * 0.42, s * 0.11, 0, 0, 7); g.fill();
  g.lineCap = 'round'; g.lineJoin = 'round';
  [-1, 1].forEach(function (d) {
    var hx = fx + d * s * 0.12, q = sw * d;
    var ex = hx + q * s * 0.2, ey = fy - (q > 0 ? q * s * 0.07 : 0);
    g.strokeStyle = pal.leg; g.lineWidth = s * 0.2;
    g.beginPath(); g.moveTo(hx, hipY); g.lineTo(ex, ey); g.stroke();
    g.fillStyle = pal.shoe;
    g.beginPath(); g.ellipse(ex + d * s * 0.02, ey + s * 0.01, s * 0.12, s * 0.06, 0, 0, 7); g.fill();
  });
  g.fillStyle = DT_SKIN; g.fillRect(fx - s * 0.07, fy - s * 1.36 - bob + sdy, s * 0.14, s * 0.26);
  var gr = g.createLinearGradient(0, shY, 0, hipY); gr.addColorStop(0, pal.top2); gr.addColorStop(1, pal.top);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(fx - s * 0.31, shY + s * 0.05);
  g.quadraticCurveTo(fx - s * 0.33, shY - s * 0.02, fx - s * 0.2, shY - s * 0.02);
  g.lineTo(fx + s * 0.2, shY - s * 0.02);
  g.quadraticCurveTo(fx + s * 0.33, shY - s * 0.02, fx + s * 0.31, shY + s * 0.05);
  g.quadraticCurveTo(fx + s * 0.27, hipY - s * 0.2, fx + s * 0.25, hipY + s * 0.03);
  g.lineTo(fx - s * 0.25, hipY + s * 0.03);
  g.quadraticCurveTo(fx - s * 0.27, hipY - s * 0.2, fx - s * 0.31, shY + s * 0.05);
  g.closePath(); g.fill();
  [-1, 1].forEach(function (d) {
    var sx = fx + d * s * 0.31, sy = shY + s * 0.06, hx, hy, t;
    var nx = sx + d * s * 0.07 - sw * d * s * 0.05, ny = sy + s * 0.52 - Math.abs(sw) * s * 0.02, lw;
    if (link && link.hug) { t = dtReach(sx, sy, link.x + d * s * 0.16, link.y, s * 0.62); hx = t[0]; hy = t[1]; }
    else if (link && link.side === d) { t = dtReach(sx, sy, link.x, link.y, s * (link.R || 0.62)); lw = link.w == null ? 1 : link.w; hx = nx + (t[0] - nx) * lw; hy = ny + (t[1] - ny) * lw; }
    else { hx = nx; hy = ny; }
    (c.hd || (c.hd = {}))[d] = [hx, hy];      // موضع اليد: يستخدمه رسم الكأس
    dtArm(g, sx, sy, hx, hy, pal, s);
  });
  g.globalAlpha = 1;
}
// جلوس جانبي: جذع نحيف ومقعد وفخذ أفقي نحو الطاولة وساق عمودية وذراع واحدة ظاهرة (الرأس صورة الملف كما هي)
function dtFigureSide(g, c, pal, ts, here, link, ta) {
  var W = DT.sw, H = DT.sh, s = DT.s, dir = c.sdir || 1;
  var fx = (c.x == null ? 0.5 : c.x) * W, fy = (c.y == null ? 0.7 : c.y) * H;
  var hipY = fy - s * 0.30, shY = fy - s * 0.80, kx = fx + dir * s * 0.42;
  var fu = fx + (c.lean || 0) * s * 0.2 * dir;                  // الجذع العلوي ينحني نحو الطاولة عند الأكل
  g.globalAlpha = (here ? 1 : 0.38) * ta;
  g.fillStyle = 'rgba(0,0,0,.30)';
  g.beginPath(); g.ellipse(fx + dir * s * 0.1, fy + s * 0.03, s * 0.5, s * 0.11, 0, 0, 7); g.fill();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = pal.leg; g.lineWidth = s * 0.2;
  g.beginPath(); g.moveTo(fx - dir * s * 0.04, hipY); g.lineTo(kx, hipY); g.stroke();            // الفخذ
  g.lineWidth = s * 0.17;
  g.beginPath(); g.moveTo(kx, hipY); g.lineTo(kx, fy - s * 0.05); g.stroke();                     // الساق
  g.fillStyle = pal.shoe; g.beginPath(); g.ellipse(kx + dir * s * 0.06, fy - s * 0.02, s * 0.13, s * 0.06, 0, 0, 7); g.fill();
  g.fillStyle = DT_SKIN; g.fillRect(fu + dir * s * 0.04 - s * 0.06, shY - s * 0.22, s * 0.12, s * 0.26);   // الرقبة
  var gr = g.createLinearGradient(0, shY, 0, hipY); gr.addColorStop(0, pal.top2); gr.addColorStop(1, pal.top);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(fu - dir * s * 0.15, shY + s * 0.04);
  g.quadraticCurveTo(fu - dir * s * 0.16, shY - s * 0.02, fu - dir * s * 0.06, shY - s * 0.02);
  g.lineTo(fu + dir * s * 0.07, shY - s * 0.02);
  g.quadraticCurveTo(fu + dir * s * 0.16, shY - s * 0.02, fu + dir * s * 0.15, shY + s * 0.06);
  g.lineTo(fx + dir * s * 0.14, hipY + s * 0.04); g.lineTo(fx - dir * s * 0.16, hipY + s * 0.04);
  g.quadraticCurveTo(fx - dir * s * 0.17, hipY - s * 0.2, fu - dir * s * 0.15, shY + s * 0.04);
  g.closePath(); g.fill();
  var sx = fu, sy = shY + s * 0.06, hx = fx + dir * s * 0.30, hy = hipY - s * 0.04, t, lw;       // الذراع القريبة من الطاولة (اليد على الفخذ افتراضياً)
  if (link && link.side === dir) { t = dtReach(sx, sy, link.x, link.y, s * (link.R || 0.62)); lw = link.w == null ? 1 : link.w; hx += (t[0] - hx) * lw; hy += (t[1] - hy) * lw; }                                       // اليد على الفخذ
  c.hd = c.hd || {}; c.hd[1] = c.hd[-1] = [hx, hy];
  dtArm(g, sx, sy, hx, hy, pal, s);
  g.globalAlpha = 1;
}
function dtFigure(g, c, pal, ts, here, link) {  // يمزج بين الأمامي والجانبي أثناء الجلوس
  var sit = c.sit || 0;
  if (sit < 0.4) { dtFigureFront(g, c, pal, ts, here, link, 1); return; }
  var ta = Math.min(1, (sit - 0.4) / 0.4);
  if (ta < 1) dtFigureFront(g, c, pal, ts, here, link, 1 - ta);
  dtFigureSide(g, c, pal, ts, here, link, ta);
}
function dtPose() {
  var m = DT.ch.m, p = DT.ch.p;
  if (!p.here || !DT.near.fx || dtDist(m, p) > 0.30) return '';
  if (DT.walk) return 'hands';
  var q = DT.pose; if (q && Date.now() < q.until) return q.k;
  return '';
}
function dtBodyDraw(ts) {
  var c = DT.bd; if (!c || !DT.sw || DT.simple) return;
  var g = DT.bdx || (DT.bdx = c.getContext('2d'));
  var W = DT.sw, H = DT.sh, s = DT.s;
  g.setTransform(DT.dpr, 0, 0, DT.dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (DT.bgc) g.drawImage(DT.bgc, 0, 0, W, H);
  var m = DT.ch.m, p = DT.ch.p, pose = dtPose();
  var mx = m.x * W, my = m.y * H, px = (p.x == null ? 0.5 : p.x) * W, py = (p.y == null ? 0.7 : p.y) * H;
  var lm = null, lp = null;
  if (pose === 'hands') {
    var M = { x: (mx + px) / 2, y: (my + py) / 2 - s * 0.6 };
    lm = { side: px >= mx ? 1 : -1, x: M.x, y: M.y }; lp = { side: mx >= px ? 1 : -1, x: M.x, y: M.y };
  } else if (pose === 'hug') {
    lm = { hug: 1, x: px, y: py - s * 0.95 }; lp = { hug: 1, x: mx, y: my - s * 0.95 };
  }
  if (dtDinner()) {
    var kd = Math.min(0.1, (ts - (DT.lbt || ts)) / 1000); DT.lbt = ts;
    dtDinnerTable(g, W, H, s, kd);
    dtSideTable(g, W, H, s);
    if (DT.sp) dtFoodPlate(g, W, H, s, 'S', { fp: [DT.sp] }, kd);
    ['m', 'p'].forEach(function (r) {
      var SG = DT.gl[dtGlId(r)], sc = DT.ch[r], tg = SG && SG.s ? 1 : 0;
      sc.sit = DT.still ? tg : (sc.sit || 0) + (tg - (sc.sit || 0)) * Math.min(1, kd * 6);
      sc.sdir = dtChairIdx(dtGlId(r)) === 0 ? 1 : -1;      // يواجه الطاولة
    });
    var hm = dtHoldLink('m', m, p, W, H, s, pose, lm), hp = dtHoldLink('p', p, m, W, H, s, pose, lp);
    if (hm) lm = hm;
    if (hp) lp = hp;
  }
  var a = [m, DT_PAL.m, 1, lm], b = [p, DT_PAL.p, p.here, lp];
  var order = py < my ? [b, a] : [a, b];   // الأبعد أولاً
  order.forEach(function (z) { dtFigure(g, z[0], z[1], ts, z[2], z[3]); });
}

/* ---------- المرحلة 3: مشهد العشاء (كأس لكل شخص، الملء، الرشفة، النخب) ---------- */
function dtDinner() { return DT.ty === 'عشاء رومانسي'; }
function dtGlId(role) {                       // معرّف صاحب الكأس: 'm' أنا، 'p' شريكي
  if (role === 'm') return DT.myId;
  var k, id = 0; for (k in DT.gl) if (+k !== DT.myId) id = +k;
  return id;
}
function dtGlTx(id) {                         // موضع الكأس على الطاولة: صاحب المعرّف الأصغر على اليسار
  var k, lo = 1e15; for (k in DT.gl) if (+k < lo) lo = +k;
  return id === lo ? 0.385 : 0.615;
}
/* المشروبات: الاسم n، الرمز e، لون السطح c والقاع c2، شكل الكأس gl (goblet|tall|mug|cup)، التأثير fx (steam بخار | fizz فقاعات)، ice مثلج، foam رغوة */
var DT_DR = {
  water:      { n: 'ماء بارد', e: '💧', c: '#e0f2fe', c2: '#7dd3fc', gl: 'tall', ice: 1, a: 0.6 },
  iced_tea:   { n: 'شاي مثلج', e: '🧊', c: '#d97706', c2: '#92400e', gl: 'tall', ice: 1 },
  lemonmint:  { n: 'ليمون بالنعناع', e: '🍋', c: '#d9f99d', c2: '#65a30d', gl: 'tall', ice: 1 },
  coffee:     { n: 'قهوة', e: '☕', c: '#78350f', c2: '#3b1d0a', gl: 'mug', fx: 'steam' },
  tea:        { n: 'شاي', e: '🍵', c: '#f59e0b', c2: '#b45309', gl: 'mug', fx: 'steam' },
  cocoa:      { n: 'شوكولاتة ساخنة', e: '🍫', c: '#6b3a1e', c2: '#3b1d0a', gl: 'mug', fx: 'steam', foam: '#fef3c7' },
  qahwa:      { n: 'قهوة عربية', e: '🫖', c: '#d4a24c', c2: '#a16207', gl: 'cup', fx: 'steam' },
  cola:       { n: 'كولا', e: '🥤', c: '#4a1d0a', c2: '#1c0a04', gl: 'tall', fx: 'fizz', ice: 1 },
  lemonade:   { n: 'ليموناضة فوّارة', e: '🍋', c: '#fef08a', c2: '#facc15', gl: 'tall', fx: 'fizz', ice: 1 },
  soda:       { n: 'صودا', e: '🫧', c: '#e5f4ff', c2: '#bae6fd', gl: 'tall', fx: 'fizz', a: 0.5 },
  berry:      { n: 'توت فوّار', e: '🍓', c: '#fb7185', c2: '#be123c', gl: 'tall', fx: 'fizz' },
  grape:      { n: 'عصير العنب', e: '🍇', c: '#be123c', c2: '#7f1d1d', gl: 'goblet' },
  orange:     { n: 'برتقال', e: '🍊', c: '#fdba74', c2: '#f97316', gl: 'tall' },
  mango:      { n: 'مانجو', e: '🥭', c: '#fcd34d', c2: '#f59e0b', gl: 'tall' },
  strawberry: { n: 'فراولة', e: '🍓', c: '#fda4af', c2: '#e11d48', gl: 'tall' },
  milkshake:  { n: 'ميلك شيك', e: '🥛', c: '#fbcfe8', c2: '#f472b6', gl: 'tall', foam: '#ffffff' }
};
var DT_CATS = [
  ['🧊 باردة', ['water', 'iced_tea', 'lemonmint']],
  ['🔥 ساخنة', ['coffee', 'tea', 'cocoa', 'qahwa']],
  ['🫧 غازية', ['cola', 'lemonade', 'soda', 'berry']],
  ['🧃 عصائر ومخفوقات', ['grape', 'orange', 'mango', 'strawberry', 'milkshake']]
];
function dtGlass(g, x, y, h, lv, tilt, dk) {  // كأس: القاعدة عند (x,y) والارتفاع h، ومستوى الشراب lv من 0 إلى 3، والنوع من DT_DR
  var D = DT_DR[dk] || DT_DR.grape, kind = D.gl, ts = DT.ts || 0, anim = !DT.still, i;
  if (kind === 'cup') { h *= 0.66; kind = 'mug'; }
  var yT, yB, wB, wT;                           // أعلى الوعاء وأسفله ونصف عرضه عند القاع والفوهة
  if (kind === 'goblet') { yT = -h; yB = -h * 0.42; wB = 0; wT = h * 0.25; }
  else if (kind === 'tall') { yT = -h; yB = 0; wB = h * 0.16; wT = h * 0.21; }
  else { yT = -h * 0.78; yB = 0; wB = h * 0.27; wT = h * 0.27; }
  function body() {
    g.beginPath();
    if (kind === 'goblet') { g.moveTo(-wT, yT); g.quadraticCurveTo(-wT * 1.1, yB - (yB - yT) * 0.12, 0, yB); g.quadraticCurveTo(wT * 1.1, yB - (yB - yT) * 0.12, wT, yT); }
    else { g.moveTo(-wT, yT); g.lineTo(-wB, yB); g.lineTo(wB, yB); g.lineTo(wT, yT); }
    g.closePath();
  }
  g.save(); g.translate(x, y); if (tilt) g.rotate(tilt);
  g.lineCap = 'round';
  if (kind === 'goblet') {
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(0, 0, h * 0.25, h * 0.05, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(1.2, h * 0.04);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, yB); g.stroke();
  }
  if (kind === 'mug') {                          // كوب سيراميك أبيض بمقبض
    body(); g.fillStyle = '#f1f5f9'; g.fill();
    g.strokeStyle = '#cbd5e1'; g.lineWidth = Math.max(1, h * 0.03); g.stroke();
    g.strokeStyle = '#e2e8f0'; g.lineWidth = Math.max(2, h * 0.07);
    g.beginPath(); g.arc(wT, yT * 0.5, h * 0.16, -Math.PI / 2, Math.PI / 2); g.stroke();
    if (lv > 0.03) {
      var mc = g.createLinearGradient(0, yT, 0, yT + h * 0.1); mc.addColorStop(0, D.c); mc.addColorStop(1, D.c2);
      g.fillStyle = mc; g.beginPath(); g.ellipse(0, yT + h * 0.02, wT * 0.9, h * 0.07, 0, 0, 7); g.fill();
      if (D.foam) { g.fillStyle = D.foam; g.beginPath(); g.ellipse(0, yT + h * 0.015, wT * 0.62, h * 0.045, 0, 0, 7); g.fill(); }
    }
  } else {
    body(); g.fillStyle = 'rgba(255,255,255,.14)'; g.fill();
    var f = Math.min(1, lv / 3), yL = yB - (yB - yT) * 0.84 * f;
    if (lv > 0.03) {
      g.save(); body(); g.clip();
      var wg = g.createLinearGradient(0, yL, 0, yB); wg.addColorStop(0, D.c); wg.addColorStop(1, D.c2);
      g.globalAlpha = D.a || 0.93; g.fillStyle = wg; g.fillRect(-h, yL, h * 2, yB - yL + 1); g.globalAlpha = 1;
      if (D.foam && lv > 0.5) { g.fillStyle = D.foam; g.fillRect(-h, yL - h * 0.01, h * 2, h * 0.07); }
      if (D.ice && lv > 0.5) {
        g.fillStyle = 'rgba(255,255,255,.5)';
        [[-0.45, 0.05, 0.2], [0.25, 0.1, -0.3], [-0.05, 0.2, 0.5]].forEach(function (q) {
          var qs = h * 0.085; g.save(); g.translate(wT * q[0] * 1.6, yL + h * q[1]); g.rotate(q[2]); g.fillRect(-qs / 2, -qs / 2, qs, qs); g.restore();
        });
      }
      if (D.fx === 'fizz' && lv > 0.5 && anim) {   // فقاعات تصعد داخل المشروب
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = Math.max(1, h * 0.012);
        for (i = 0; i < 7; i++) {
          var ph = (ts / 1500 + i * 0.173) % 1, bx = (((i * 53) % 17) / 17 - 0.5) * wB * 1.9, by = yB - ph * (yB - yL), br = h * (0.014 + (i % 3) * 0.007);
          g.globalAlpha = 0.85 * (1 - ph * 0.5); g.beginPath(); g.arc(bx, by, br, 0, 7); g.stroke();
        }
        g.globalAlpha = 1;
      }
      g.restore();
    }
    if (D.fx === 'fizz' && lv > 0.5 && anim) {     // فقاعات صغيرة تتطاير فوق الفوهة
      g.fillStyle = 'rgba(255,255,255,.8)';
      for (i = 0; i < 3; i++) {
        var p2 = (ts / 900 + i * 0.37) % 1;
        g.globalAlpha = (1 - p2) * 0.7; g.beginPath(); g.arc((i - 1) * wT * 0.6 + Math.sin(p2 * 6 + i) * h * 0.02, yT - p2 * h * 0.18, h * 0.014, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    body(); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(1, h * 0.03); g.stroke();
  }
  if (D.fx === 'steam' && lv > 0.03 && anim) {     // بخار خفيف يصعد ويتلوّى
    g.lineWidth = Math.max(1.5, h * 0.05);
    for (i = 0; i < 3; i++) {
      var sp = (ts / 2600 + i / 3) % 1, sx = (i - 1) * wT * 0.55, k;
      g.strokeStyle = 'rgba(255,255,255,' + (0.3 * Math.sin(Math.PI * sp)).toFixed(3) + ')';
      g.beginPath(); g.moveTo(sx, yT - h * 0.04);
      for (k = 1; k <= 6; k++) g.lineTo(sx + Math.sin(sp * 6.3 + k * 0.9 + i * 2) * h * 0.035 * (k / 3), yT - h * 0.04 - k * h * 0.1);
      g.stroke();
    }
  }
  g.restore();
}
function dtChairIdx(id) { var k, lo = 1e15; for (k in DT.gl) if (+k < lo) lo = +k; return id === lo ? 0 : 1; }
function dtChX(id, out) { return (out ? [0.23, 0.77] : [0.30, 0.70])[dtChairIdx(id)]; }
function dtChair(g, x, y, s, dir) {           // كرسي جانبي: (x,y) عند الأرض تحت وسط المقعد، وdir اتجاه مواجهة الطاولة
  var w = s * 0.56, bx = x - dir * w * 0.5, fr = x + dir * w * 0.5;
  function R(x0, x1, y0, y1) { g.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0); }
  g.fillStyle = '#3b1a0b'; R(bx, bx + dir * s * 0.07, y - s * 0.28, y); R(fr - dir * s * 0.07, fr, y - s * 0.28, y);   // الساقان
  g.fillStyle = '#4a2110'; R(bx - dir * s * 0.03, bx + dir * s * 0.08, y - s * 1.0, y - s * 0.28);                    // ظهر الكرسي
  g.fillStyle = '#6b3319'; R(bx - dir * s * 0.01, bx + dir * s * 0.05, y - s * 0.94, y - s * 0.4);
  g.fillStyle = '#7a3b1d'; R(bx - dir * s * 0.02, fr + dir * s * 0.03, y - s * 0.30, y - s * 0.22);                    // المقعد
  g.fillStyle = '#b4233f'; R(bx + dir * s * 0.06, fr, y - s * 0.37, y - s * 0.30);                                     // الوسادة
}
function dtSideTable(g, W, H, s) {            // طاولة صغيرة مستديرة بمفرش: يقف الطرفان بجانبها فيتقاربان دون كراسي
  var x = DT_SIDE.x * W, y = H * DT_SIDE.y, ty = y - s * 0.72, r = s * 0.36;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y + 2, r * 0.95, r * 0.24, 0, 0, 7); g.fill();
  g.fillStyle = '#3b1a0b'; g.beginPath(); g.ellipse(x, y - s * 0.02, r * 0.5, r * 0.13, 0, 0, 7); g.fill();
  g.fillRect(x - s * 0.03, ty, s * 0.06, y - s * 0.02 - ty);
  g.fillStyle = '#7f1d1d'; g.beginPath(); g.ellipse(x, ty + s * 0.045, r, r * 0.3, 0, 0, 7); g.fill();     // حافة المفرش
  g.fillStyle = '#b4233f'; g.beginPath(); g.ellipse(x, ty, r, r * 0.3, 0, 0, 7); g.fill();                // سطح الطاولة
  g.fillStyle = '#f3dfe4'; g.beginPath(); g.ellipse(x, ty, r * 0.5, r * 0.15, 0, 0, 7); g.fill();         // الصحن
}
function dtBottle(g, x, y, h, a) {            // زجاجة تدور حول قاعدتها عند الصبّ
  var w = h * 0.26;
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = '#14532d';
  g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -h * 0.55);
  g.quadraticCurveTo(-w / 2, -h * 0.68, -w * 0.2, -h * 0.74); g.lineTo(-w * 0.2, -h); g.lineTo(w * 0.2, -h); g.lineTo(w * 0.2, -h * 0.74);
  g.quadraticCurveTo(w / 2, -h * 0.68, w / 2, -h * 0.55); g.lineTo(w / 2, 0); g.closePath(); g.fill();
  g.fillStyle = '#f3dfe4'; g.fillRect(-w / 2, -h * 0.38, w, h * 0.18);
  g.fillStyle = '#7f1d1d'; g.fillRect(-w * 0.2, -h, w * 0.4, h * 0.05);
  g.restore();
}
function dtGlassPos(id, W, H, s) {            // فتحة الكأس الآن: في يد صاحبه أو على الطاولة
  var G = DT.gl[id]; if (!G) return null;
  var c = DT.ch[id === DT.myId ? 'm' : 'p'];
  if (G.h && c.gk && c.hd && c.hd[c.gk.side]) { var hd = c.hd[c.gk.side]; return { x: hd[0], y: hd[1] - s * 0.30 }; }
  return { x: dtGlTx(id) * W, y: H * 0.415 - s * 0.32 };
}
function dtDinnerTable(g, W, H, s, kd) {      // الزجاجة والكؤوس غير الممسوكة على الطاولة (تحت الشخصيتين)
  var id, G, d, bx = W * 0.5, by = H * 0.445, bh = s * 0.62, a = 0, P = DT.pour, now = Date.now();
  if (P && !DT.still && now < P.until) {
    var tp = dtGlassPos(P.to, W, H, s), u = (now - P.t0) / (P.until - P.t0);
    if (tp) a = (tp.x >= bx ? 1 : -1) * 0.85 * Math.min(1, Math.sin(Math.PI * u) * 2.2);
  }
  for (id in DT.gl) {                           // الكراسي: تنزلق عند سحبها أو دفعها
    G = DT.gl[id];
    var tx = dtChX(+id, G.o), cxp = DT.cx[id];
    if (cxp == null || DT.still) cxp = tx;
    cxp += (tx - cxp) * Math.min(1, kd * 7); DT.cx[id] = cxp;
    dtChair(g, cxp * W, H * 0.5, s, dtChairIdx(+id) === 0 ? 1 : -1);
  }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(bx, by + 2, bh * 0.2, bh * 0.06, 0, 0, 7); g.fill();
  dtBottle(g, bx, by, bh, a);
  DT.bn = { x: bx + bh * Math.sin(a), y: by - bh * Math.cos(a) };      // فوهة الزجاجة: منها يبدأ خيط الصبّ
  for (id in DT.gl) {
    G = DT.gl[id];
    d = DT.gd[id]; if (d == null) d = G.lv;
    d += (G.lv - d) * Math.min(1, kd * 4); DT.gd[id] = d;
    dtFoodPlate(g, W, H, s, +id, G, kd);
    if (!G.h) {
      var gx = dtGlTx(+id) * W;
      g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(gx, H * 0.415 + 1, s * 0.1, s * 0.03, 0, 0, 7); g.fill();
      dtGlass(g, gx, H * 0.415, s * 0.34, d, 0, G.dk);
    }
  }
}
// وضع الإمساك بالكأس: يعيد رابطاً يحرّك الذراع (اليد الأقرب للشريك)، أو null إن لم يمسك كأساً أو كان في وضعية عناق/مسك يد
function dtHoldLink(role, c, o, W, H, s, pose, pl) {
  var id = dtGlId(role), G = DT.gl && DT.gl[id];
  c.gk = null;
  dtMouthPose(role, c, o, s);
  if (!G || !G.h || (role === 'p' && !c.here)) return dtEatLink(role, c, o, W, H, s, pose, G);   // لا كأس بيده: يده حرة للأكل
  if (pose) { c.gk = { side: pl && pl.side ? -pl.side : -1, tilt: 0 }; return null; }   // الكأس في اليد الحرة
  var fx = c.x * W, fy = c.y * H, ox = (o.x == null ? 0.5 : o.x) * W, oy = (o.y == null ? 0.7 : o.y) * H;
  var sd = ox >= fx ? 1 : -1, hx = fx + sd * s * 0.34, hy = fy - s * 0.84, tilt = 0;
  var now = Date.now(), f = DT.gfx[id];
  if (f && !DT.still && now < f.until) {
    var u = (now - f.t0) / (f.until - f.t0), e = Math.min(1, Math.sin(Math.PI * u) * 1.6);
    if (f.k === 'sip') { hx += (fx + sd * s * 0.17 - hx) * e; hy += (fy - s * 1.36 - hy) * e; tilt = -sd * e * 0.8; }
    else if (f.k === 'toast') { hx += ((fx + ox) / 2 - hx) * e; hy += ((fy + oy) / 2 - s * 0.9 - hy) * e; tilt = sd * e * 0.25; }
  }
  var lk = { side: sd, x: hx, y: hy, tilt: tilt };
  c.gk = lk; return lk;
}
function dtDinnerFx(cx, W, H) {               // الكؤوس الممسوكة وخيط الصبّ وشرارة النخب فوق كل شيء
  var s = DT.s, now = Date.now(), P = DT.pour, f = DT.gfx[DT.myId];
  ['m', 'p'].forEach(function (role) {
    var c = DT.ch[role], k = c.gk;
    if (!k || !c.hd || !c.hd[k.side]) return;
    var hd = c.hd[k.side], gid = dtGlId(role), dl = DT.gd[gid], gk = DT.gl[gid];
    cx.globalAlpha = role === 'p' && !c.here ? 0.38 : 1;
    dtGlass(cx, hd[0], hd[1] + s * 0.04, s * 0.36, dl == null ? 0 : dl, k.tilt || 0, gk && gk.dk);
  });
  cx.globalAlpha = 1;
  dtEatFx(cx, W, H, s);
  if (P && !DT.still && now < P.until && DT.bn) {
    var u = (now - P.t0) / (P.until - P.t0), tp = dtGlassPos(P.to, W, H, s);
    if (tp && u > 0.2 && u < 0.95) {
      cx.strokeStyle = '#be123c'; cx.lineWidth = Math.max(1.5, s * 0.03); cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(DT.bn.x, DT.bn.y);
      cx.quadraticCurveTo((DT.bn.x + tp.x) / 2 + (tp.x >= DT.bn.x ? 1 : -1) * s * 0.05, DT.bn.y + s * 0.05, tp.x, tp.y);
      cx.stroke();
    }
  }
  if (f && f.k === 'toast' && !DT.still && now < f.until) {
    var q = (now - f.t0) / (f.until - f.t0), m = DT.ch.m, p = DT.ch.p;
    if (q > 0.4 && q < 0.75 && m.gk && p.gk && m.hd && p.hd && m.hd[m.gk.side] && p.hd[p.gk.side]) {
      var A = m.hd[m.gk.side], B = p.hd[p.gk.side], X = (A[0] + B[0]) / 2, Y = (A[1] + B[1]) / 2 - s * 0.3, i, r0 = s * 0.08, r1 = s * 0.2;
      cx.globalAlpha = Math.max(0, 1 - Math.abs(q - 0.55) / 0.2);
      cx.strokeStyle = '#fde68a'; cx.lineWidth = 2; cx.lineCap = 'round';
      for (i = 0; i < 8; i++) {
        var an = i * Math.PI / 4;
        cx.beginPath(); cx.moveTo(X + Math.cos(an) * r0, Y + Math.sin(an) * r0); cx.lineTo(X + Math.cos(an) * r1, Y + Math.sin(an) * r1); cx.stroke();
      }
      cx.globalAlpha = 1;
    }
  }
}
function dtGlEv(j) {                          // حدث من الخادم: رشفة أو صبّ أو نخب
  var now = Date.now();
  if (j.ev === 'sip') DT.gfx[j.by] = { k: 'sip', t0: now, until: now + 2000 };
  else if (j.ev === 'toast') { DT.gfx[j.by] = DT.gfx[j.to] = { k: 'toast', t0: now, until: now + 2200 }; dtFlash('🥂 نخب!'); }
  else if (j.ev === 'serve') { DT.sv = DT.sv || {}; DT.sv[j.to] = now; if (DT_FOOD[j.fd]) dtFlash(DT_FOOD[j.fd].e + ' ' + DT_FOOD[j.fd].n + (j.z && DT_SZ[j.z] ? ' (' + DT_SZ[j.z].n + ')' : '')); }
  else if (j.ev === 'bite') { DT.ef = DT.ef || {}; DT.ef[j.by] = { k: 'bite', d: j.d, t0: now, until: now + DT_EAT_MS, src: j.src }; if (j.src === 's') DT.ef.S = DT.ef[j.by]; }
  else if (j.ev === 'feed') { DT.ef = DT.ef || {}; DT.ef[j.by] = { k: 'feed', d: j.d, to: j.to, t0: now, until: now + DT_FEED_MS, src: j.src }; if (j.src === 's') DT.ef.S = DT.ef[j.by]; dtFlash('🤲 لقمة بحب'); }
  else if (j.ev === 'pour') { DT.pour = { to: j.to, t0: now, until: now + 1300 }; if (DT_DR[j.dk]) dtFlash(DT_DR[j.dk].e + ' ' + DT_DR[j.dk].n); }
}

/* ---------- المرحلة 3d: الطعام (طبق لكل شخص، الأكل بحركة، إطعام الشريك) ---------- */
/* الاسم n، الرمز e، الوصف d، hot يخرج منه بخار، cd عليه شمعة صغيرة */
var DT_FOOD = {
  lentil:   { n: 'شوربة عدس', e: '🍲', d: 'كريمية بالليمون والكمون', hot: 1 },
  salad:    { n: 'سلطة سيزر', e: '🥗', d: 'خس مقرمش وجبن وصلصة خفيفة' },
  hummus:   { n: 'حمص بالطحينة', e: '🥙', d: 'بزيت الزيتون والخبز' },
  garlic:   { n: 'خبز بالثوم', e: '🥖', d: 'ساخن بالزبدة والثوم', hot: 1 },
  samosa:   { n: 'سمبوسة مقرمشة', e: '🥟', d: 'محشوة بالجبن والخضار', hot: 1 },
  steak:    { n: 'ستيك مشوي', e: '🥩', d: 'مع صلصة الفلفل والبطاطس', hot: 1 },
  pasta:    { n: 'باستا بالكريمة', e: '🍝', d: 'بالدجاج والفطر', hot: 1 },
  chicken:  { n: 'دجاج مشوي', e: '🍗', d: 'متبّل بالأعشاب والليمون', hot: 1 },
  fish:     { n: 'سمك مشوي', e: '🐟', d: 'مع الأرز والخضار', hot: 1 },
  kabsa:    { n: 'كبسة لحم', e: '🍛', d: 'أرز بالبهارات وصلصة الدقوس', hot: 1 },
  cake:     { n: 'كيكة الفراولة', e: '🍰', d: 'بالكريمة وشمعة صغيرة', cd: 1 },
  icecream: { n: 'آيس كريم', e: '🍨', d: 'ثلاث كرات بنكهات مختلفة' },
  fondant:  { n: 'فوندان شوكولاتة', e: '🍫', d: 'دافئ بقلب سائل', hot: 1, cd: 1 },
  flan:     { n: 'كريم كراميل', e: '🍮', d: 'ناعم بصلصة الكراميل' },
  berries:  { n: 'فراولة بالشوكولاتة', e: '🍓', d: 'مغمّسة بالشوكولاتة الذائبة' }
};
var DT_FCATS = [
  ['🥗 المقبلات', ['lentil', 'salad', 'hummus', 'garlic', 'samosa']],
  ['🍽️ الأطباق الرئيسية', ['steak', 'pasta', 'chicken', 'fish', 'kabsa']],
  ['🍰 الحلويات', ['cake', 'icecream', 'fondant', 'flan', 'berries']]
];
var DT_EAT_MS = 2600, DT_FEED_MS = 2800;       // مدة حركة اللقمة (نفس BITE_MS و FEED_MS في scene.js)
var DT_BITES = { lentil: 4, salad: 5, hummus: 4, garlic: 3, samosa: 3, steak: 7, pasta: 6, chicken: 6, fish: 6, kabsa: 8,
  cake: 5, icecream: 4, fondant: 4, flan: 4, berries: 3 };   // لقمات الطبق المتوسط (للعرض فقط: المرجع FOOD_BITES في الخادم)
var DT_SZ = { s: { n: 'صغير', a: 'ص', k: 0.6, f: 0.85 }, m: { n: 'وسط', a: 'م', k: 1, f: 1 }, l: { n: 'كبير', a: 'ك', k: 1.5, f: 1.2 } };
function dtBites(id, z) { return Math.max(2, Math.round((DT_BITES[id] || 3) * (DT_SZ[z] || DT_SZ.m).k)); }
function dtSm(k) { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); }
function dtBump(u, a, b, c, d) { return u <= a || u >= d ? 0 : u < b ? dtSm((u - a) / (b - a)) : u <= c ? 1 : dtSm(1 - (u - c) / (d - c)); }
function dtPlateXY(id, W, H) {                 // مكان الطبق: فوق الصحن الأبيض المرسوم في الخلفية
  if (id === 'S') return { x: DT_SIDE.x * W, y: H * DT_SIDE.y - DT.s * 0.75 };   // الطبق المشترك على الطاولة الصغيرة
  return { x: (dtChairIdx(id) === 0 ? 0.43 : 0.57) * W, y: H * 0.395 };
}
function dtMouth(id, W, H, s) {                // فم صاحب المعرّف: على الوجه (أسفل الصورة) ويتبع ميل الرأس
  var role = dtRole(id), c = DT.ch[role], o = DT.ch[role === 'm' ? 'p' : 'm'];
  if (!c || c.x == null || (role === 'p' && !c.here)) return null;
  var sit = c.sit || 0, sd = sit > 0.5 ? (c.sdir || 1) : ((o.x == null ? 0.5 : o.x) >= c.x ? 1 : -1);
  return { x: c.x * W + sit * (c.sdir || 0) * s * 0.10 + (c.hlx || 0) + sd * s * 0.02, y: c.y * H - s * 1.46 + sit * s * 0.36 + (c.hly || 0) };
}
// وضعية الرأس والجذع أثناء الأكل والشرب: ينحني نحو الطبق ثم نحو اللقمة، ويمضغ بعدها؛ ويميل للخلف قليلاً عند الرشفة
function dtMouthPose(role, c, o, s) {
  var now = Date.now(), id = dtGlId(role), sit = c.sit || 0, E = DT.ef, k, e, u, L = 0, S = 0, chew = 0;
  var fd = sit > 0.5 ? (c.sdir || 1) : ((o.x == null ? 0.5 : o.x) >= c.x ? 1 : -1);
  c.hlx = c.hly = c.hrot = 0; c.lean = 0;
  if (DT.still) return;
  if (E) for (k in E) {
    e = E[k]; if (now >= e.until) continue;
    u = (now - e.t0) / (e.until - e.t0);
    if (+k === id) L = Math.max(L, dtBump(u, 0.04, 0.22, 0.36, 0.52) * 0.8);            // ينحني ليصل إلى الطبق
    if ((e.k === 'feed' ? +e.to : +k) === id) {                                          // صاحب الفم: يتقدّم نحو اللقمة
      L = Math.max(L, dtBump(u, 0.34, 0.58, 0.72, 0.9) * (e.k === 'feed' ? 1.5 : 1));
      if (u > 0.72) chew = Math.max(chew, 1 - (u - 0.72) / 0.28);
    }
  }
  var f = DT.gfx[id];
  if (f && f.k === 'sip' && now < f.until) { u = (now - f.t0) / (f.until - f.t0); S = Math.min(1, Math.sin(Math.PI * u) * 1.6); }
  c.lean = L;
  c.hlx = fd * s * ((0.07 + 0.13 * sit) * L + 0.03 * S);
  c.hly = s * (0.06 * L - 0.02 * S) + (chew ? Math.sin(now / 65) * s * 0.012 * chew : 0);
  c.hrot = fd * (9 * L - 7 * S);
}
// اليد تأكل: من وضعها الطبيعي إلى حافة الطبق، ثم تحمل اللقمة إلى الفم، وتبقى لحظة، ثم ترجع (w وزن المزج مع الوضع الطبيعي)
function dtEatLink(role, c, o, W, H, s, pose, G) {
  c.eside = 0;
  if (pose || DT.still || !G || (role === 'p' && !c.here)) return null;
  var id = dtGlId(role), e = DT.ef && DT.ef[id], now = Date.now();
  if (!e || now >= e.until) return null;
  var u = (now - e.t0) / (e.until - e.t0), sit = c.sit || 0;
  var sd = sit > 0.5 ? (c.sdir || 1) : ((o.x == null ? 0.5 : o.x) >= c.x ? 1 : -1);
  var pl = dtPlateXY(e.src === 's' ? 'S' : id, W, H), dp = pl.x >= c.x * W ? 1 : -1;
  var gr = { x: pl.x - dp * W * 0.02, y: pl.y - s * 0.02 };                          // حافة الطبق الأقرب
  var mt = dtMouth(e.k === 'feed' ? +e.to : id, W, H, s);
  if (!mt) return null;
  var tg, w, k;
  if (u < 0.3) { tg = gr; w = dtSm(u / 0.3); }
  else if (u < 0.62) { k = dtSm((u - 0.3) / 0.32); tg = { x: gr.x + (mt.x - gr.x) * k, y: gr.y + (mt.y - gr.y) * k - Math.sin(Math.PI * k) * s * 0.06 }; w = 1; }
  else if (u < 0.72) { tg = mt; w = 1; }
  else { tg = mt; w = 1 - dtSm((u - 0.72) / 0.28); }
  c.eside = sd;
  return { side: sit > 0.5 ? (c.sdir || 1) : sd, x: tg.x, y: tg.y, w: w, R: e.k === 'feed' ? 1.2 : 0.95 };
}
function dtFoodPlate(g, W, H, s, id, G, kd) {  // الطعام على الطبق: يصغر مع كل لقمة، بخار للساخن، شمعة للحلوى، وأطباق أخرى بانتظار الدور
  var P = G.fp; if (!P || !P.length) return;
  var cur = null, q = [], i, now = Date.now();
  for (i = 0; i < P.length; i++) if (P[i].n > 0) { if (!cur) cur = P[i]; else q.push(P[i]); }
  var pp = dtPlateXY(id, W, H), fs0 = Math.min(W * 0.055, s * 0.34), e = DT.ef && DT.ef[id];
  DT.fa = DT.fa || {}; DT.sv = DT.sv || {};
  var last = cur || P[P.length - 1], F = DT_FOOD[last.d]; if (!F) return;
  var hold = e && now < e.until && (now - e.t0) / (e.until - e.t0) < 0.3 && (!cur || cur.d === e.d) ? 1 : 0;   // لا ينقص الطبق قبل أن تلتقط اليد اللقمة
  var tg = ((cur ? cur.n : 0) + hold) / last.m, key = P.indexOf(last) + ':' + last.d + ':' + last.m, A = DT.fa[id];
  if (!A || A.k !== key) A = DT.fa[id] = { k: key, v: tg };
  A.v += (tg - A.v) * Math.min(1, kd * 5);
  var v = A.v, fs = fs0 * (DT_SZ[last.z] || DT_SZ.m).f, pop = 1, t0 = DT.sv[id];
  if (t0 && !DT.still) { var u = (now - t0) / 600; if (u < 1) pop = u < 0.6 ? u / 0.6 * 1.2 : 1.2 - (u - 0.6) / 0.4 * 0.2; }
  if (v > 0.03) {
    g.save();
    g.globalAlpha = Math.min(1, v * 3 + 0.3);
    g.font = Math.round(fs * (0.5 + 0.5 * v) * pop) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(F.e, pp.x, pp.y - fs * 0.28);
    g.restore();
    if (F.hot && v > 0.17 && !DT.still) {
      g.save();
      for (i = 0; i < 2; i++) {
        var qq = (now / 1100 + i * 0.5) % 1;
        g.globalAlpha = (1 - qq) * 0.45; g.fillStyle = '#fff';
        g.beginPath(); g.arc(pp.x + (i ? 1 : -1) * fs * 0.2 + Math.sin(qq * 6.3) * fs * 0.1, pp.y - fs * 0.6 - qq * fs * 0.9, fs * (0.06 + qq * 0.07), 0, 7); g.fill();
      }
      g.restore();
    }
    if (F.cd && cur && cur.n === cur.m) {      // شمعة صغيرة على الحلوى الجديدة
      var cx0 = pp.x + fs * 0.12, cy0 = pp.y - fs * 0.78;
      g.fillStyle = '#fef3c7'; g.fillRect(cx0 - 1.5, cy0 - fs * 0.22, 3, fs * 0.26);
      g.fillStyle = '#fbbf24'; g.beginPath(); g.ellipse(cx0, cy0 - fs * 0.27 + (DT.still ? 0 : Math.sin(now / 90) * 0.8), 2.2, 3.6, 0, 0, 7); g.fill();
    }
  } else {                                     // طبق فرغ: فتات صغيرة
    g.fillStyle = 'rgba(160,110,50,.55)';
    for (var k2 = 0; k2 < 4; k2++) { g.beginPath(); g.arc(pp.x + (k2 - 1.5) * fs * 0.16, pp.y - fs * 0.02 + (k2 % 2) * fs * 0.05, Math.max(1, fs * 0.04), 0, 7); g.fill(); }
  }
  if (q.length) {                              // الأطباق التالية: صغيرة خلف الطبق الحالي
    g.save(); g.globalAlpha = 0.9; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = Math.round(fs0 * 0.4) + 'px sans-serif';
    for (i = 0; i < q.length && i < 3; i++) { var qf = DT_FOOD[q[i].d]; if (qf) g.fillText(qf.e, pp.x + (i - (Math.min(q.length, 3) - 1) / 2) * fs0 * 0.5, pp.y - fs0 * 0.95); }
    g.restore();
  }
}
function dtEatFx(cx, W, H, s) {                // فوق الرؤوس: فمٌ يُفتح، واللقمة بين الأصابع تدخل الفم وتختفي، واليد فوق الوجه
  var E = DT.ef, now = Date.now(), id, i;
  if (!E) return;
  for (id in E) {
    var e = E[id];
    if (now >= e.until) { delete E[id]; continue; }
    if (DT.still) continue;
    var c = DT.ch[dtRole(+id)], hand = c && c.eside && c.hd ? c.hd[c.eside] : null;
    if (!hand) continue;
    var u = (now - e.t0) / (e.until - e.t0), rid = e.k === 'feed' ? +e.to : +id, mt = dtMouth(rid, W, H, s);
    if (!mt) continue;
    var op = dtBump(u, 0.46, 0.56, 0.64, 0.74);                       // فتحة الفم
    if (op > 0.02) {
      cx.fillStyle = 'rgba(70,12,24,.88)';
      cx.beginPath(); cx.ellipse(mt.x, mt.y, s * 0.055, s * 0.04 * op, 0, 0, 7); cx.fill();
    }
    var F = DT_FOOD[e.d];
    if (F && u >= 0.3 && u < 0.69) {                                  // اللقمة: بين الأصابع، ثم تدخل الفم وتصغر حتى تختفي
      var m = u < 0.55 ? 0 : dtSm((u - 0.55) / 0.13), bx = hand[0] + (mt.x - hand[0]) * m, by = hand[1] - s * 0.04 + (mt.y - hand[1] + s * 0.04) * m;
      var sc = u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.09);
      cx.font = Math.round(s * 0.13 * sc) + 'px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      if (sc > 0.02) cx.fillText(F.e, bx, by);
    }
    if (Math.hypot(hand[0] - mt.x, hand[1] - mt.y) < s * 0.6 && u > 0.3 && u < 0.85) {   // اليد فوق الوجه (الرأس عنصر فوق الكانفاس)
      cx.fillStyle = DT_SKIN; cx.beginPath(); cx.arc(hand[0], hand[1], s * 0.075, 0, 7); cx.fill();
    }
    if (e.k === 'feed' && u >= 0.6 && !e.h) {                         // وصلت اللقمة: قلوب
      e.h = 1;
      for (i = 0; i < 6; i++) DT.hearts.push({ x: mt.x + (Math.random() - 0.5) * s * 0.3, y: mt.y - s * 0.1, vy: 0.06 + Math.random() * 0.06, vx: (Math.random() - 0.5) * 0.04, s: 12 + Math.random() * 12, a: 1 });
    }
  }
}

/* ---------- قائمة العشاء: كتيّب ورقي في منتصف الشاشة بقلب صفحات حقيقي ---------- */
/* الصفحات (الأوجه) 0..8: 0 ترحيب، 1 مقبلات، 2 رئيسي، 3 حلويات، 4 باردة، 5 ساخنة، 6 غازية، 7 عصائر، 8 ختام.
   الكتيّب يُفتح من اليمين لليسار: الورقة k وجهها الأمامي 2k+1 وظهرها 2k+2، والوجه 0 ثابت على اليسار.
   قلب الصفحة: بالسحب أفقياً، أو بلمس زاوية الصفحة، أو بالأسهم/المفاتيح، أو بعلامات الأقسام. */
function dtBkCss() {
  if (document.getElementById('dtbkcss')) return;
  var st = document.createElement('style'); st.id = 'dtbkcss';
  st.textContent = '@keyframes dtbksh{0%,100%{opacity:0}50%{opacity:.45}}@keyframes dtbkin{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}';
  document.head.appendChild(st);
}
function dtMenu(side) {                        // side = 's': طلب طبق مشترك للطاولة الصغيرة
  var old = DT.root.querySelector('#dtbook');
  if (old) { old.remove(); return; }
  dtBkCss();
  var TOT = 4, sp = 0, tgt = 'm', sel = { foods: [], drink: null }, rowsEl = {};   // foods: [{ id, z }] حتى 4 أطباق، لكل طبق حجمه
  var BW = Math.min(innerWidth - 24, 700), BH = Math.max(250, Math.min(440, innerHeight - 190)), PW = BW / 2;
  var narrow = PW < 250, tiny = BH < 330;
  var FONT = '"Amiri","Scheherazade New","Noto Naskh Arabic","Traditional Arabic",Georgia,serif';
  var PAPER = 'background-color:#f6ecd5;background-image:repeating-linear-gradient(0deg,rgba(120,80,20,.035) 0 1px,transparent 1px 3px),radial-gradient(circle at 25% 12%,#fffaf0 0,rgba(255,250,240,0) 55%),radial-gradient(circle at 80% 95%,rgba(190,150,80,.28) 0,rgba(190,150,80,0) 60%);';
  var TR = 'transform .85s cubic-bezier(.4,.1,.25,1)';
  var shades = [];

  var ov = dtNode('div', 'position:absolute;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(12,4,10,.74);backdrop-filter:blur(4px);padding:8px;box-sizing:border-box');
  ov.id = 'dtbook';
  ov.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
  function chip(txt, on, fn, css) {
    var b = dtNode('button', 'border:1px solid #ffffff44;border-radius:14px;padding:5px 12px;font:inherit;font-size:13px;color:#fff;cursor:pointer;background:' + (on ? '#e11d48' : 'rgba(255,255,255,.1)') + ';' + (css || ''), txt);
    b.onclick = fn; return b;
  }

  function orn() { return dtNode('div', 'text-align:center;color:#a67c3d;font-size:' + (tiny ? 12 : 15) + 'px;letter-spacing:5px;margin:' + (tiny ? '2px' : '4px') + ' 0', '— ❦ —'); }
  function foodIdx(id) { for (var i = 0; i < sel.foods.length; i++) if (sel.foods[i].id === id) return i; return -1; }
  function paintSz(id) {                           // لون حجم الطبق المحدد
    var r = rowsEl['food:' + id], i = foodIdx(id); if (!r || !r.z) return;
    Array.prototype.forEach.call(r.z.children, function (ch) {
      var on = i >= 0 && sel.foods[i].z === ch.dataset.z;
      ch.style.background = on ? '#b91c1c' : 'transparent'; ch.style.color = on ? '#fff' : '#7a1f3d';
    });
  }
  function mark(kind, id, on) {
    var r = rowsEl[kind + ':' + id]; if (!r) return;
    r.p.style.strokeDashoffset = on ? '0' : '1';
    r.t.style.opacity = on ? '1' : '0';
    if (r.z) { r.z.style.display = on ? 'flex' : 'none'; if (on) paintSz(id); }
  }
  function pick(kind, id) {
    if (kind === 'food') {                         // الأطباق: يمكن اختيار أكثر من طبق
      var fi = foodIdx(id);
      if (fi >= 0) { sel.foods.splice(fi, 1); mark('food', id, false); }
      else {
        if (sel.foods.length >= 4) { dtFlash('حتى 4 أطباق في الوجبة'); return; }
        sel.foods.push({ id: id, z: 'm' }); mark('food', id, true);
      }
      summ(); return;
    }
    var prev = sel[kind];
    if (prev) mark(kind, prev, false);
    if (prev === id) sel[kind] = null; else { sel[kind] = id; mark(kind, id, true); }
    summ();
  }
  function row(kind, id, e, n, d, tags) {
    var r = dtNode('button', 'position:relative;display:flex;align-items:center;gap:7px;width:100%;text-align:right;background:transparent;border:0;border-bottom:1px dotted rgba(140,100,40,.45);padding:' + (tiny ? '3px 4px' : '6px 4px') + ';font:inherit;color:inherit;cursor:pointer;direction:rtl');
    r.appendChild(dtNode('span', 'font-size:' + (tiny ? 18 : 22) + 'px;line-height:1', e));
    var col = dtNode('span', 'display:flex;flex-direction:column;flex:1;min-width:0');
    col.appendChild(dtNode('span', 'font-weight:700;font-size:' + (narrow ? 13 : 15) + 'px;line-height:1.25', n));
    if (!narrow && !tiny && d) col.appendChild(dtNode('span', 'font-size:12px;opacity:.75;line-height:1.25', d));
    if (tags) col.appendChild(dtNode('span', 'font-size:10.5px;color:#8a5a1c;line-height:1.2', tags));
    r.appendChild(col);
    var szs = null;
    if (kind === 'food') {                         // حجم الطبق (يظهر بعد التحديد): ص صغير · م وسط · ك كبير
      szs = dtNode('span', 'display:none;gap:3px;align-items:center;flex:none');
      ['s', 'm', 'l'].forEach(function (zk) {
        var ch = dtNode('span', 'min-width:21px;height:21px;line-height:19px;border-radius:11px;border:1px solid #a67c3d;text-align:center;font-size:12px;font-weight:700;color:#7a1f3d;background:transparent;box-sizing:border-box', DT_SZ[zk].a);
        ch.dataset.z = zk; ch.title = DT_SZ[zk].n + ' · ' + dtBites(id, zk) + ' لقمات';
        ch.onclick = function (ev) { ev.stopPropagation(); var i = foodIdx(id); if (i >= 0) { sel.foods[i].z = zk; paintSz(id); summ(); } };
        szs.appendChild(ch);
      });
      r.appendChild(szs);
    }
    var tick = dtNode('span', 'color:#b91c1c;font-weight:700;font-size:16px;opacity:0;transition:opacity .25s', '✔');
    r.appendChild(tick);
    var pen = dtNode('span', 'position:absolute;inset:-1px;pointer-events:none');
    pen.innerHTML = '<svg viewBox="0 0 100 40" preserveAspectRatio="none" width="100%" height="100%"><path d="M95 9C88-2 22-4 7 13C-2 27 30 40 60 38C92 36 102 22 93 8" fill="none" stroke="#b91c1c" stroke-width="2" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" style="transition:stroke-dashoffset .5s ease"/></svg>';
    r.appendChild(pen);
    rowsEl[kind + ':' + id] = { p: pen.firstChild.firstChild, t: tick, z: szs };
    r.onclick = function () { pick(kind, id); };
    return r;
  }
  function page(title, rows, num) {
    var wr = dtNode('div', 'display:flex;flex-direction:column;height:100%');
    wr.appendChild(dtNode('div', 'text-align:center;font-weight:700;font-size:' + (narrow ? 16 : 19) + 'px;color:#7a1f3d;line-height:1.3', title));
    wr.appendChild(orn());
    var list = dtNode('div', 'display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden');
    rows.forEach(function (r) { list.appendChild(r); });
    wr.appendChild(list);
    if (num) wr.appendChild(dtNode('div', 'text-align:center;font-size:11px;color:#a67c3d;opacity:.8', '· ' + num + ' ·'));
    return wr;
  }
  function drinkRows(ci) {
    return DT_CATS[ci][1].map(function (id) {
      var D = DT_DR[id], tg = (D.fx === 'steam' ? '♨️ ساخن ' : '') + (D.fx === 'fizz' ? '🫧 فوّار ' : '') + (D.ice ? '🧊 مثلج ' : '') + (D.foam ? '☁️ رغوة' : '');
      return row('drink', id, D.e, D.n, '', tg);
    });
  }
  function foodRows(ci) {
    return DT_FCATS[ci][1].map(function (id) {
      var F = DT_FOOD[id];
      return row('food', id, F.e, F.n, F.d, (F.hot ? '♨️ ساخن ' : '') + (F.cd ? '🕯️ بشمعة ' : '') + '🥄 ' + dtBites(id, 's') + '–' + dtBites(id, 'l') + ' لقمات');
    });
  }
  function content(i) {
    if (i === 0) {
      var w0 = dtNode('div', 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:' + (tiny ? 4 : 8) + 'px');
      w0.appendChild(dtNode('div', 'font-size:' + (tiny ? 28 : 40) + 'px', '🕯️'));
      w0.appendChild(dtNode('div', 'font-weight:700;font-size:' + (narrow ? 19 : 24) + 'px;color:#7a1f3d', 'عشاء الليلة'));
      w0.appendChild(orn());
      w0.appendChild(dtNode('div', 'font-size:' + (narrow ? 12 : 14) + 'px;line-height:1.6;opacity:.85;padding:0 6px', 'اقلبا الصفحة وانتقيا ما يطيب لكما. ضع علامة ✔ على ما تشتهي (حتى 4 أطباق، ولكل طبق حجمه: ص صغير · م وسط · ك كبير) ثم اضغط «اطلب».'));
      return w0;
    }
    if (i >= 1 && i <= 3) return page(DT_FCATS[i - 1][0], foodRows(i - 1), i);
    if (i >= 4 && i <= 7) return page(DT_CATS[i - 4][0], drinkRows(i - 4), i);
    if (i === 8) {
      var w8 = dtNode('div', 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:' + (tiny ? 4 : 8) + 'px');
      w8.appendChild(dtNode('div', 'font-size:' + (tiny ? 28 : 40) + 'px', '🤍'));
      w8.appendChild(dtNode('div', 'font-weight:700;font-size:' + (narrow ? 18 : 22) + 'px;color:#7a1f3d', 'بالهناء والشفاء'));
      w8.appendChild(orn());
      w8.appendChild(dtNode('div', 'font-size:' + (narrow ? 12 : 14) + 'px;opacity:.85', 'أمسية جميلة لكما'));
      return w8;
    }
    return dtNode('div');
  }
  function face(i, extra) {                      // وجه ورقة: ورق + ظل عند الكعب + طبقة ظل أثناء القلب
    var f = dtNode('div', 'position:absolute;inset:0;overflow:hidden;box-sizing:border-box;direction:rtl;color:#4a2f12;font-family:' + FONT + ';' + PAPER + 'padding:' + (tiny ? '8px 10px' : '14px 14px') + ';-webkit-backface-visibility:hidden;backface-visibility:hidden;' + (extra || ''));
    f.appendChild(content(i));
    var odd = i % 2 === 1;
    f.appendChild(dtNode('div', 'position:absolute;inset:0;pointer-events:none;background:linear-gradient(' + (odd ? '90deg' : '270deg') + ',rgba(60,30,0,.30),rgba(60,30,0,0) 16%)'));
    var sh = dtNode('div', 'position:absolute;inset:0;pointer-events:none;background:#2a1204;opacity:0');
    f.appendChild(sh); shades.push(sh);
    return f;
  }

  // ---- العلامات (تنقل بين الأقسام)
  var tabs = dtNode('div', 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center');
  var TABS = [['🥗 مقبلات', 1], ['🍽️ رئيسي', 2], ['🍰 حلويات', 3], ['🍹 مشروبات', 4]], tabEl = [];
  TABS.forEach(function (t) {
    var b = dtNode('button', 'border:1px solid #c9a56a;border-bottom:0;border-radius:10px 10px 0 0;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer;color:#5b3a12;background:#f3e3c3', t[0]);
    b.onclick = function () { go(Math.floor(t[1] / 2)); };
    tabEl.push(b); tabs.appendChild(b);
  });
  ov.appendChild(tabs);

  // ---- الكتيّب
  var shell = dtNode('div', 'position:relative;width:' + BW + 'px;height:' + BH + 'px;animation:dtbkin .45s ease both');
  shell.appendChild(dtNode('div', 'position:absolute;inset:-8px -10px;border-radius:9px;background:linear-gradient(135deg,#6b1d2f,#3d0f1b);box-shadow:0 18px 50px rgba(0,0,0,.65),inset 0 0 0 2px rgba(253,230,138,.25)'));
  var book = dtNode('div', 'position:absolute;inset:0;direction:ltr;perspective:1700px;touch-action:pan-y;user-select:none;-webkit-user-select:none');
  var bl = dtNode('div', 'position:absolute;left:0;top:0;width:50%;height:100%;box-shadow:-2px 0 0 #e8dbbc,-4px 0 0 #d6c6a1');
  bl.appendChild(face(0));
  var br = dtNode('div', 'position:absolute;left:50%;top:0;width:50%;height:100%;box-shadow:2px 0 0 #e8dbbc,4px 0 0 #d6c6a1,6px 0 0 #cbb98f');
  br.appendChild(face(9));
  book.appendChild(bl); book.appendChild(br);
  var leaves = [];
  for (var k = 0; k < TOT; k++) {
    var lf = dtNode('div', 'position:absolute;left:50%;top:0;width:50%;height:100%;transform-origin:left center;transform-style:preserve-3d;transition:' + TR + ';z-index:' + (20 - k));
    lf.appendChild(face(2 * k + 1));
    lf.appendChild(face(2 * k + 2, 'transform:rotateY(180deg);'));
    leaves.push(lf); book.appendChild(lf);
  }
  book.appendChild(dtNode('div', 'position:absolute;top:0;bottom:0;left:calc(50% - 14px);width:28px;z-index:500;pointer-events:none;background:linear-gradient(90deg,rgba(40,20,0,0),rgba(40,20,0,.22) 42%,rgba(40,20,0,.38) 50%,rgba(40,20,0,.22) 58%,rgba(40,20,0,0))'));
  var cr = dtNode('div', 'position:absolute;right:0;bottom:0;width:36px;height:36px;z-index:600;cursor:pointer;background:linear-gradient(135deg,transparent 50%,#cdb98a 50%,#fbf1d6 100%);border-top-left-radius:100%;box-shadow:-2px -2px 5px rgba(0,0,0,.28)');
  var cl = dtNode('div', 'position:absolute;left:0;bottom:0;width:36px;height:36px;z-index:600;cursor:pointer;background:linear-gradient(225deg,transparent 50%,#cdb98a 50%,#fbf1d6 100%);border-top-right-radius:100%;box-shadow:2px -2px 5px rgba(0,0,0,.28)');
  cr.onclick = function () { go(sp + 1); }; cl.onclick = function () { go(sp - 1); };
  book.appendChild(cr); book.appendChild(cl);
  shell.appendChild(book); ov.appendChild(shell);

  // ---- الشريط السفلي
  var nav = dtNode('div', 'display:flex;gap:8px;align-items:center;justify-content:center');
  var bPrev = chip('→ السابق', 0, function () { go(sp - 1); });
  var ind = dtNode('span', 'color:#fff;font-size:12px;opacity:.8;min-width:48px;text-align:center');
  var bNext = chip('التالي ←', 0, function () { go(sp + 1); });
  nav.appendChild(bPrev); nav.appendChild(ind); nav.appendChild(bNext); ov.appendChild(nav);
  var bar = dtNode('div', 'display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;max-width:' + BW + 'px');
  var summEl = dtNode('div', 'color:#fde68a;font-size:13px;text-align:center;min-height:18px;width:100%');
  var chM = chip('لي', 1, function () { tgt = 'm'; sty(); }), chP = chip('لشريكي', 0, function () { tgt = 'p'; sty(); });
  var bGo = chip('🛎️ اطلب', 1, order, 'padding:7px 18px;font-weight:700');
  var bX = chip('✕', 0, close);
  bar.appendChild(summEl); if (!side) { bar.appendChild(chM); bar.appendChild(chP); } bar.appendChild(bGo); bar.appendChild(bX);
  ov.appendChild(bar);

  function sty() { chM.style.background = tgt === 'm' ? '#e11d48' : 'rgba(255,255,255,.1)'; chP.style.background = tgt === 'p' ? '#e11d48' : 'rgba(255,255,255,.1)'; }
  function summ() {
    var p = [];
    sel.foods.forEach(function (f) { p.push(DT_FOOD[f.id].e + ' ' + DT_FOOD[f.id].n + ' (' + DT_SZ[f.z].n + ' · ' + dtBites(f.id, f.z) + ' لقمات)'); });
    if (sel.drink) p.push(DT_DR[sel.drink].e + ' ' + DT_DR[sel.drink].n);
    summEl.textContent = p.length ? p.join('  +  ') : 'ضع علامة ✔ على ما تشتهي';
    bGo.style.opacity = p.length ? '1' : '.45';
  }
  function order() {
    if (!sel.foods.length && !sel.drink) { dtFlash('اختر شيئاً من القائمة أولاً'); return; }
    if (!DT.wsOk) { dtFlash('غير متصل بالمسرح'); return; }
    if (side) {
      if (dtDist(DT.ch.m, DT_SIDE) > DT_REACH.side) { dtFlash('اقترب من الطاولة الصغيرة'); return; }
      if (!sel.foods.length) { dtFlash('اختر طبقاً للطاولة الصغيرة'); return; }
      if (sel.drink || sel.foods.length > 1) dtFlash('الطاولة الصغيرة تتسع لطبق مشترك واحد فقط');
      dtWsSend({ t: 'sserve', d: sel.foods[0].id, z: sel.foods[0].z });
      close(); return;
    }
    if (dtDist(DT.ch.m, DT_TBL) > DT_REACH.table) { dtFlash('اقترب من الطاولة لتطلب'); return; }
    if (tgt === 'p' && !DT.ch.p.here) { dtFlash('شريكك غير موجود في المسرح الآن'); return; }
    var q = [];
    if (sel.drink) q.push({ t: tgt === 'm' ? 'gfill' : 'gfillp', d: sel.drink });
    sel.foods.forEach(function (f) { q.push({ t: tgt === 'm' ? 'fserve' : 'fservep', d: f.id, z: f.z }); });
    q.forEach(function (o, i) { setTimeout(function () { dtWsSend(o); }, i * 480); });
    close();
  }

  // ---- قلب الصفحات
  function zFix(lf, kk) { lf.style.zIndex = kk < sp ? 10 + kk : 20 - kk; }
  function apply() {
    leaves.forEach(function (lf, kk) {
      lf.style.transform = 'rotateY(' + (kk < sp ? -180 : 0) + 'deg)';
      zFix(lf, kk);
    });
    cr.style.display = sp < TOT ? 'block' : 'none';
    cl.style.display = sp > 0 ? 'block' : 'none';
    bPrev.style.opacity = sp > 0 ? '1' : '.4'; bNext.style.opacity = sp < TOT ? '1' : '.4';
    ind.textContent = (sp + 1) + ' / ' + (TOT + 1);
    tabEl.forEach(function (b, i) {
      var t = TABS[i][1], on = i === 3 ? (sp === 2 || sp === 3) : Math.floor(t / 2) === sp;
      b.style.background = on ? '#fff4d6' : '#f3e3c3'; b.style.fontWeight = on ? '700' : '400'; b.style.color = on ? '#7a1f3d' : '#5b3a12';
    });
  }
  function flashShade(lf) {                       // ظل يمرّ على الورقة وهي تنقلب
    if (DT.still) return;
    for (var c = 0; c < lf.children.length; c++) {
      var sh = lf.children[c].lastChild;
      sh.style.animation = 'none'; void sh.offsetWidth; sh.style.animation = 'dtbksh .85s ease';
    }
  }
  function go(n) {
    n = Math.max(0, Math.min(TOT, n));
    if (n === sp) return;
    (function step() {
      if (sp === n) return;
      var dir = n > sp ? 1 : -1, kk = dir > 0 ? sp : sp - 1, lf = leaves[kk];
      lf.style.zIndex = 100;
      sp += dir;
      lf.style.transform = 'rotateY(' + (dir > 0 ? -180 : 0) + 'deg)';
      flashShade(lf);
      setTimeout(function () { zFix(lf, kk); }, 880);
      cr.style.display = sp < TOT ? 'block' : 'none'; cl.style.display = sp > 0 ? 'block' : 'none';
      bPrev.style.opacity = sp > 0 ? '1' : '.4'; bNext.style.opacity = sp < TOT ? '1' : '.4';
      ind.textContent = (sp + 1) + ' / ' + (TOT + 1);
      if (sp !== n) setTimeout(step, 240); else apply();
    })();
  }
  var drag = null, swallow = 0;
  book.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    var rc = book.getBoundingClientRect(), right = e.clientX >= rc.left + rc.width / 2;
    if (right && sp < TOT) drag = { k: sp, dir: 1 }; else if (!right && sp > 0) drag = { k: sp - 1, dir: -1 }; else { drag = null; return; }
    drag.x0 = e.clientX; drag.on = 0; drag.p = 0; drag.id = e.pointerId;
  });
  book.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0, v = -drag.dir * dx;
    if (!drag.on) {
      if (Math.abs(dx) < 9 || v <= 0) return;
      drag.on = 1; drag.lf = leaves[drag.k];
      try { book.setPointerCapture(e.pointerId); } catch (x) {}
      drag.lf.style.transition = 'none'; drag.lf.style.zIndex = 100;
    }
    drag.p = Math.max(0, Math.min(1, v / (PW * 0.9)));
    drag.lf.style.transform = 'rotateY(' + (drag.dir > 0 ? -180 * drag.p : -180 + 180 * drag.p) + 'deg)';
    for (var c = 0; c < drag.lf.children.length; c++) drag.lf.children[c].lastChild.style.opacity = String(Math.sin(Math.PI * drag.p) * 0.45);
  });
  function endDrag() {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.on) return;
    swallow = Date.now() + 120;
    for (var c = 0; c < d.lf.children.length; c++) d.lf.children[c].lastChild.style.opacity = '0';
    d.lf.style.transition = TR;
    if (d.p > 0.3) sp += d.dir;
    apply();
    d.lf.style.zIndex = 100;
    setTimeout(function () { zFix(d.lf, d.k); }, 880);
  }
  book.addEventListener('pointerup', endDrag);
  book.addEventListener('pointercancel', endDrag);
  book.addEventListener('click', function (e) { if (Date.now() < swallow) { e.stopPropagation(); e.preventDefault(); } }, true);

  function onKey(e) {
    if (!document.body.contains(ov)) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'ArrowLeft') go(sp + 1); else if (e.key === 'ArrowRight') go(sp - 1);
  }
  document.addEventListener('keydown', onKey);

  apply(); sty(); summ();
  DT.root.appendChild(ov);
}

// الكاميرا: كلما اقترب الطرفان زاد التقريب نحو منتصفهما، وتبتعد بنعومة إذا افترقا
function dtCamera(dt) {
  var st = DT.st; if (!st || !DT.sw) return;
  var W = DT.sw, H = DT.sh, s = DT.s, m = DT.ch.m, p = DT.ch.p, z = 1, mx = W / 2, my = H / 2;
  if (DT.zoomOn && !DT.still && !DT.simple && p.here && p.x != null) {
    z = 1 + dtClamp((0.42 - dtDist(m, p)) / 0.30, 0, 1) * 0.55;
    mx = (m.x + p.x) / 2 * W; my = (m.y + p.y) / 2 * H - s * 0.7;
  }
  if (DT.zx == null) { DT.zx = W / 2; DT.zy = H / 2; }
  var k = Math.min(1, dt * 2.5);
  DT.zz += (z - DT.zz) * k; DT.zx += (mx - DT.zx) * k; DT.zy += (my - DT.zy) * k;
  if (DT.zz < 1.003) { if (st.style.transform) st.style.transform = ''; return; }
  var ex = dtClamp(DT.zx, W / (2 * DT.zz), W - W / (2 * DT.zz)), ey = dtClamp(DT.zy, H / (2 * DT.zz), H - H / (2 * DT.zz));   // لا يظهر خارج حدود المسرح
  st.style.transform = 'translate(' + (W / 2).toFixed(1) + 'px,' + (H / 2).toFixed(1) + 'px) scale(' + DT.zz.toFixed(4) + ') translate(' + (-ex).toFixed(1) + 'px,' + (-ey).toFixed(1) + 'px)';
}

function dtPlace(el, x, y, z) {
  el.style.left = (x * 100) + '%'; el.style.top = (y * 100) + '%';
  if (z != null) el.style.zIndex = z;
}
// الرأس: نفس بكسلات الجسم المرسوم تماماً، بـ transform (بلا إعادة تخطيط) فلا يتأخر عن الكانفاس
function dtPlaceHead(el, x, y, z) {
  if (!DT.sw) { dtPlace(el, x, y, z); return; }
  el.style.transform = 'translate3d(' + (x * DT.sw).toFixed(1) + 'px,' + (y * DT.sh).toFixed(1) + 'px,0)';
  if (z != null) el.style.zIndex = z;
}

/* ---------- الشبكة ---------- */
function dtWsSend(o) {
  if (DT.ws && DT.wsOk) { try { DT.ws.send(JSON.stringify(o)); } catch (e) {} }
}

function dtWsOpen() {
  if (!DT.id || DT.ws || !window.WebSocket) return;
  var w;
  try { w = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/date/scene?id=' + DT.id); } catch (e) { return; }
  DT.ws = w; DT.wsOk = 0; DT.wsIdle = 0;
  w.onopen = function () { if (DT.ws !== w) return; DT.wsOk = 1; DT.wsN = 0; dtWsDot(); };
  w.onmessage = function (ev) {
    if (DT.ws !== w || typeof ev.data !== 'string' || ev.data.charAt(0) !== '{') return;
    try { dtOnMsg(JSON.parse(ev.data)); } catch (e) {}
  };
  w.onclose = function (ev) {
    if (DT.ws !== w) return;
    DT.ws = null; DT.wsOk = 0; DT.ch.p.here = 0; DT.walk = null; dtWsDot(); DT.sig = ''; dtSmHere();
    if (!DT.id) return;
    var why = ev && ev.reason;
    if (why === 'idle' || why === 'hidden') { DT.wsIdle = 1; return; }   // يعود عند أول لمسة
    if (why === 'end' || why === 'rate') return;
    DT.wsN = (DT.wsN || 0) + 1;
    if (DT.wsN > 6) return;
    clearTimeout(DT.wsT);
    DT.wsT = setTimeout(dtWsOpen, Math.min(15000, 1000 * Math.pow(2, DT.wsN)));
  };
  w.onerror = function () {};
}

function dtWsDot() {
  var e = DT.root && DT.root.querySelector('#dtws');
  if (e) { e.textContent = DT.wsOk ? '🟢' : '⚪'; e.title = DT.wsOk ? 'متصل بالمسرح' : 'غير متصل بالمسرح'; }
}

function dtRole(id) { return id === DT.myId ? 'm' : 'p'; }

function dtSetPos(c, x, y, snap) {
  c.tx = x; c.ty = y;
  if (snap || c.x == null) { c.x = x; c.y = y; }
}

function dtObjSet(j) {
  var o = DT.ob[j.id] || (DT.ob[j.id] = {});
  for (var k in j) if (k !== 't') o[k] = j[k];
  if (j.id === 'ball') { o.tx = j.x; o.ty = j.y; if (o.x == null) { o.x = j.x; o.y = j.y; } }
  if (j.id === 'candle') DT.dTarget = o.on ? 0 : 0.34;
  DT.sig = '';
}

function dtOnMsg(j) {
  if (j.t === 'hello') {
    DT.myId = j.you; DT.soff = j.now - Date.now();
    for (var id in j.players) {
      var c = DT.ch[dtRole(+id)], p = j.players[id];
      dtSetPos(c, p.x, p.y, true); c.here = 1;
    }
    for (var k in j.objs) dtObjSet(j.objs[k]);
    DT.near = j.near || { k: 0, fx: 1 };
    DT.sig = '';
    DT.simple = j.simple ? 1 : 0; dtApplyMode();
    DT.walk = j.walk ? { lead: j.walk.lead, fol: j.walk.fol } : null;
    DT.gl = j.gl || {}; DT.gd = {}; DT.ef = {}; DT.sv = {}; DT.fa = {}; DT.sp = j.sp || null;
    if (dtDinner()) dtFlash('📖 المس قائمة العشاء لتطلب مشروباً وطعاماً، وللإطعام واقفين اقصدا الطاولة الصغيرة على اليمين');
  } else if (j.t === 'mode') {
    DT.simple = j.simple ? 1 : 0; dtApplyMode();
    dtFlash(DT.simple ? '🫧 النمط البسيط: فقاعتان للطرفين' : '🎭 عاد المشهد المتحرك');
  } else if (j.t === 'j') {
    if (j.id !== DT.myId) { dtSetPos(DT.ch.p, j.x, j.y, true); DT.ch.p.here = 1; DT.sig = ''; dtSmHere(); }
  } else if (j.t === 'l') {
    if (j.id !== DT.myId) { DT.ch.p.here = 0; DT.sig = ''; dtSmHere(); }
  } else if (j.t === 'p') {
    if (j.id !== DT.myId) { DT.ch.p.here = 1; dtSetPos(DT.ch.p, j.x, j.y, false); }
  } else if (j.t === 'f') {                    // تصحيح من الخادم (قفز أو تجاوز سرعة)
    if (j.s) { DT.ch.m.tx = j.x; DT.ch.m.ty = j.y; }           // مرافقة: يمشي نحو الموضع بنعومة
    else { DT.ch.m.x = DT.ch.m.tx = j.x; DT.ch.m.y = DT.ch.m.ty = j.y; }
  } else if (j.t === 'n') {
    DT.near = { k: j.k, fx: j.fx };
    if (!j.fx && DT.ch.p.here && !DT.fxNote) { DT.fxNote = 1; dtFlash('تأثيرات القرب متوقفة (إعداد المساحة الشخصية)'); }
    DT.sig = '';
  } else if (j.t === 'o') {
    dtObjSet(j);
  } else if (j.t === 'w') {
    DT.walk = j.on ? { lead: j.lead, fol: j.fol } : null; DT.sig = '';
    dtFlash(j.on ? (j.lead === DT.myId ? '🚶 تمشيان معاً، وأنت من يقود' : '🚶 تمشيان معاً، شريكك يقودك') : '⏹ توقف المشي المشترك');
  } else if (j.t === 'g') {
    DT.pose = { k: j.k, until: Date.now() + 7000 };
  } else if (j.t === 'gl') {
    DT.gl = j.gl || {}; DT.sig = '';
  } else if (j.t === 'sp') {
    DT.sp = j.sp || null; DT.sig = '';
  } else if (j.t === 'gs') {
    dtGlEv(j);
  } else if (j.t === 'e') {
    dtFlash('⚠️ ' + String(j.m || '').slice(0, 80));
  }
}

/* ---------- الإجراءات حسب الموقف ---------- */
function dtGest(id) {
  if (typeof gstLoad !== 'function' || typeof gstSend !== 'function') { dtToast('⚠️ الحركات غير متاحة الآن'); return; }
  gstLoad().then(function (list) {
    var g = (list || []).filter(function (x) { return x.id === id; })[0];
    if (g) gstSend(g); else dtToast('⚠️ هذه الحركة غير متاحة بعد');
  });
}

function dtActions() {
  var m = DT.ch.m, p = DT.ch.p, R = DT.ob.rose, C = DT.ob.candle, me = DT.myId, a = [];
  if (!DT.wsOk || !me || DT.simple) return a;
  var now = Date.now() + (DT.soff || 0);
  if (R) {
    var off = R.offer && now - R.ot <= DT_OFFER_MS ? R.offer : 0;
    if (off === me) { a.push(['🌹 قبول الوردة', 'accept', 1, 1], ['رفض', 'decline', 1, 0]); }
    else if (R.by === me) {
      if (off) a.push(['⏳ بانتظار شريكك…', '', 0, 0]);
      else { a.push(['🌹 أعطها لشريكي', 'give', p.here && dtDist(m, p) <= DT_REACH.give ? 1 : 0, 1]); a.push(['أسقطها', 'drop', 1, 0]); }
    } else if (!R.by && !off && dtDist(m, R) <= DT_REACH.touch) a.push(['🌹 التقط الوردة', 'pick', 1, 1]);
  }
  if (C && dtDist(m, C) <= DT_REACH.candle) a.push([C.on ? '🕯️ أطفئ الشمعة' : '🕯️ أشعل الشمعة', 'cd', 1, 0]);
  if (dtDinner() && DT.gl && DT.gl[me]) {
    var mg = DT.gl[me], pg = DT.gl[dtGlId('p')], nt = dtDist(m, DT_TBL) <= DT_REACH.table;
    if (!mg.h) { if (nt) a.push(['🥂 خذ كأسك', 'gtake', 1, 0]); }
    else {
      if (mg.lv > 0) a.push(['🍷 ارتشف', 'gsip', 1, 0]);
      if (mg.lv > 0 && p.here && pg && pg.h && pg.lv > 0) a.push(['🥂 نخب', 'gtoast', DT.near.fx && (dtDist(m, p) <= DT_REACH.toast || (mg.s && pg.s)) ? 1 : 0, 1]);
      if (nt) a.push(['↩️ ضع الكأس', 'gput', 1, 0]);
    }
    if (nt && mg.lv > 0) a.push(['🚰 أفرغ كأسي', 'gempty', 1, 0]);
    var mfp = mg.fp || [], hasBite = mfp.some(function (q) { return q.n > 0; });
    if (nt && hasBite) {
      a.push([mg.h ? '🍴 كُل (ضع الكأس أولاً)' : '🍴 كُل', 'fbite', mg.h ? 0 : 1, 0]);
      if (p.here && pg) { var fclose = dtDist(m, p) <= DT_REACH.feed; a.push([fclose || mg.h ? '🤲 أطعم شريكي' : '🤲 أطعم شريكي (اقترب منه)', 'ffeed', !mg.h && DT.near.fx && fclose ? 1 : 0, 1]); }
    }
    if (nt && mfp.length) a.push(['🧹 ارفع الأطباق', 'fclear', 1, 0]);
    if (dtDist(m, DT_SIDE) <= DT_REACH.side) {              // الطاولة الصغيرة: طبق مشترك يُؤكل ويُطعَم منه واقفين
      var sps = DT.sp, spOk = sps && sps.n > 0;
      if (!spOk) a.push(['🍽️ اطلب طبقاً للطاولة الصغيرة', 'smenu', 1, 1]);
      else {
        a.push([mg.h ? '🍴 كُل (ضع الكأس أولاً)' : '🍴 كُل من الطبق المشترك', 'sbite', mg.h ? 0 : 1, 0]);
        if (p.here && pg) { var sclose = dtDist(m, p) <= DT_REACH.feed; a.push([sclose || mg.h ? '🤲 أطعم شريكي' : '🤲 أطعم شريكي (اقترب منه)', 'sfeed', !mg.h && DT.near.fx && sclose ? 1 : 0, 1]); }
      }
      if (sps) a.push(['🧹 ارفع الطبق المشترك', 'sclear', 1, 0]);
    }
    if (mg.s) a.push(['🧍 قم من الكرسي', 'cstand', 1, 0]);
    else {
      var chp = { x: dtChX(me, mg.o), y: 0.5 };
      if (dtDist(m, chp) <= DT_REACH.chair) {
        if (!mg.o) a.push(['🪑 اسحب الكرسي', 'cpull', 1, 0]);
        else a.push(['🪑 اجلس', 'csit', 1, 1], ['↩️ ادفع الكرسي', 'cpush', 1, 0]);
      }
    }
  }
  if (DT.walk) a.push(['⏹ توقف عن المشي معاً', 'walk0', 1, 0]);
  else if (DT.near.k >= 1 && DT.near.fx && p.here && !(DT.gl && DT.gl[me] && DT.gl[me].s)) a.push(['🚶 امشِ معي', 'walk1', 1, 1]);
  if (DT.near.k === 2 && DT.near.fx && p.here) a.push(['🤗 عناق', 'hug', 1, 0], ['🤝 مسك اليد', 'hands', 1, 0]);
  return a;
}

function dtDoAct(k) {
  if (k === 'menu') { dtMenu(); return; }
  if (k === 'smenu') { dtMenu('s'); return; }
  if (k === 'walk1') { dtWsSend({ t: 'walk', on: 1 }); return; }
  if (k === 'walk0') { dtWsSend({ t: 'walk', on: 0 }); return; }
  if (k === 'hug' || k === 'hands') { dtWsSend({ t: k }); dtGest(k); return; }
  var o = { t: k };
  if (k === 'pick') o.o = 'rose';
  dtWsSend(o);
}

function dtRenderActs() {
  var a = dtActions(), sig = a.map(function (x) { return x[0] + x[2]; }).join('|');
  if (sig === DT.sig) return;
  DT.sig = sig;
  var box = DT.root.querySelector('#dtacts');
  box.textContent = '';
  a.forEach(function (x) {
    var b = dtNode('button', 'border:0;border-radius:20px;padding:8px 14px;font:inherit;font-size:14px;color:#fff;cursor:' + (x[2] ? 'pointer' : 'default') + ';background:' + (x[3] ? '#e11d48' : '#ffffff33') + ';backdrop-filter:blur(4px);opacity:' + (x[2] ? 1 : 0.55) + ';box-shadow:0 2px 10px #0005;pointer-events:auto', x[0]);
    if (x[1] && x[2]) b.onclick = function () { dtDoAct(x[1]); };
    else if (x[1]) b.title = 'اقترب من شريكك أكثر';
    box.appendChild(b);
  });
}

/* ---------- الحلقة: الحركة والرسم ---------- */
function dtFxDraw(ts, dt) {
  var cx = DT.fx.getContext('2d'), w = DT.sw, h = DT.sh;
  cx.setTransform(DT.dpr, 0, 0, DT.dpr, 0, 0);
  cx.clearRect(0, 0, w, h);
  var m = DT.ch.m, p = DT.ch.p, C = DT.ob.candle, still = DT.still;
  // ضوء الغرفة: يعتم عند إطفاء الشمعة ويدفأ عند إشعالها
  var k = still ? 1 : Math.min(1, dt * 2.2);
  DT.dark += (DT.dTarget - DT.dark) * k;
  if (DT.dark > 0.01) { cx.fillStyle = 'rgba(8,4,16,' + DT.dark.toFixed(3) + ')'; cx.fillRect(0, 0, w, h); }
  if (C && C.on) {
    var fl = still ? 1 : 1 + Math.sin(ts / 90) * 0.03 + Math.sin(ts / 37) * 0.02;
    var gx = C.x * w, gy = (C.y - 0.04) * h, r = w * 0.42 * fl;
    var g = cx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, 'rgba(253,186,116,.50)'); g.addColorStop(0.45, 'rgba(251,146,60,.16)'); g.addColorStop(1, 'rgba(251,146,60,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, w, h);
  }
  // القرب: توهج ناعم بين الشخصيتين وقلوب صاعدة (تُلغى مع «تقليل الحركة»)
  var near = DT.near.fx && p.here ? DT.near.k : 0;
  var mx = (m.x + p.x) / 2 * w, my = (m.y + p.y) / 2 * h;
  DT.glow += ((near ? (near === 2 ? 1 : 0.55) : 0) - DT.glow) * (still ? 1 : Math.min(1, dt * 3));
  if (DT.glow > 0.02) {
    var gr = w * 0.22, g2 = cx.createRadialGradient(mx, my, 0, mx, my, gr);
    g2.addColorStop(0, 'rgba(251,113,133,' + (0.38 * DT.glow).toFixed(3) + ')'); g2.addColorStop(1, 'rgba(251,113,133,0)');
    cx.fillStyle = g2; cx.fillRect(0, 0, w, h);
  }
  if (!still) {
    if (near && ts - DT.hz > (near === 2 ? 260 : 520)) {
      DT.hz = ts;
      if (DT.hearts.length < 40) DT.hearts.push({ x: mx + (Math.random() - 0.5) * w * 0.08, y: my - h * 0.04, vy: 0.05 + Math.random() * 0.06, vx: (Math.random() - 0.5) * 0.03, s: 12 + Math.random() * 12, a: 1 });
    }
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    DT.hearts = DT.hearts.filter(function (q) {
      q.y -= q.vy * dt * h; q.x += q.vx * dt * w; q.a -= dt * 0.45;
      if (q.a <= 0) return false;
      cx.globalAlpha = q.a * 0.9; cx.fillStyle = '#fb7185'; cx.font = q.s + 'px sans-serif';
      cx.fillText('♥', q.x, q.y);
      return true;
    });
    cx.globalAlpha = 1;
  }
  if (dtDinner() && !DT.simple) dtDinnerFx(cx, w, h);
}

function dtLoop(ts) {
  DT.raf2 = requestAnimationFrame(dtLoop);
  if (!DT.root) return;
  var dt = Math.min(0.05, (ts - (DT.lt || ts)) / 1000); DT.lt = ts; DT.ts = ts;
  var m = DT.ch.m, p = DT.ch.p, b = DT.ob.ball, R = DT.ob.rose, C = DT.ob.candle;

  // حركتي: أمشي نحو الهدف بسرعة محدودة (أبطأ من حد الخادم)
  var dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy * 0.75);
  m.moving = d > 0.002;
  if (m.moving) {
    var f = Math.min(1, ((((DT.walk && DT.walk.fol === DT.myId) ? 2.2 : DT.drag ? 1.1 : 0.5)) * dt) / d);
    m.x += dx * f; m.y += dy * f;
  }
  if (DT.wsOk && ts - DT.sent >= 100 && (Math.abs(m.x - m.sx) > 0.002 || Math.abs(m.y - m.sy) > 0.002)) {
    DT.sent = ts; m.sx = m.x; m.sy = m.y;
    dtWsSend({ t: 'm', x: +m.x.toFixed(3), y: +m.y.toFixed(3) });
  }
  // الشريك والكرة: استيفاء ناعم نحو آخر موضع وصل
  var k = Math.min(1, dt * 10);
  p.moving = p.x != null && Math.hypot(p.tx - p.x, (p.ty - p.y) * 0.75) > 0.004;
  if (p.x != null) { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
  if (b && b.x != null) { b.x += (b.tx - b.x) * Math.min(1, dt * 12); b.y += (b.ty - b.y) * Math.min(1, dt * 12); }

  // رسم الشخصيتين: الجسم أولاً (يحدّث حالة الجلوس) ثم الرأس بالموضع نفسه في الإطار نفسه
  dtBodyDraw(ts);
  var cm = DT.els.m, cp = DT.els.p;
  dtPlaceHead(cm, m.x, m.y, Math.round(m.y * 100));
  dtPlaceHead(cp, p.x == null ? 0.5 : p.x, p.y == null ? 0.7 : p.y, Math.round((p.y || 0.7) * 100));
  cp.style.opacity = p.here ? '1' : '0.38';
  [[cm, m], [cp, p]].forEach(function (z) {
    var av = z[0].firstChild.nextSibling;
    var by2 = z[1].moving && !DT.still && !(z[1].sit > 0.02) ? -Math.abs(Math.sin(ts / 110)) * DT.sh * 0.018 : 0, sd2 = (z[1].sit || 0) * DT.s * 0.36;   // قفزة المشي + نزول الرأس عند الجلوس
    var sx2 = (z[1].sit || 0) * (z[1].sdir || 0) * DT.s * 0.10, rt = (z[1].sit || 0) * (z[1].sdir || 0) * 5;   // يميل الرأس نحو الطاولة عند الجلوس
    var hx3 = sx2 + (z[1].hlx || 0), hy3 = by2 + sd2 + (z[1].hly || 0), hr3 = rt + (z[1].hrot || 0);   // + ميل الرأس عند الأكل والشرب
    dtFaceMouth(z[0], (z[1].lean || 0) > 0.5);
    av.style.transform = hx3 || hy3 || hr3 ? 'translate(' + hx3.toFixed(1) + 'px,' + hy3.toFixed(1) + 'px) rotate(' + hr3.toFixed(1) + 'deg)' : '';
  });
  // الأشياء
  if (b) dtPlace(DT.els.ball, b.x, b.y, Math.round(b.y * 100) - 1);
  if (C) { dtPlace(DT.els.candle, C.x, C.y, Math.round(C.y * 100)); DT.els.flame.style.opacity = C.on ? '1' : '0'; }
  if (R) {
    var now = Date.now() + (DT.soff || 0), pos = null, holder = null;
    var off = R.offer && now - R.ot <= DT_OFFER_MS;
    if (R.by) {
      holder = R.by === DT.myId ? m : p;
      var hy = DT.sh ? (DT.s * 0.62) / DT.sh : 0.1;            // ارتفاع اليد فوق القدمين
      pos = { x: holder.x + 0.045, y: holder.y - hy };
      if (off) { var rc = R.offer === DT.myId ? m : p; pos = { x: (holder.x + rc.x) / 2, y: (holder.y + rc.y) / 2 - hy - 0.04 }; }
    } else pos = { x: R.x, y: R.y };
    dtPlace(DT.els.rose, pos.x, pos.y, Math.round(pos.y * 100) + 2);
    DT.els.rose.style.transform = 'translate(-50%,-70%)' + (off && !DT.still ? ' scale(' + (1 + Math.sin(ts / 160) * 0.08).toFixed(3) + ')' : '');
  }
  dtCamera(dt);
  dtFxDraw(ts, dt);
  dtRenderActs();
}

/* ---------- مدخلات السحب والنقر ---------- */
function dtPt(e) {
  var r = DT.st.getBoundingClientRect();
  return {
    x: dtClamp((e.clientX - r.left) / r.width, DT_LIM.x0, DT_LIM.x1),
    y: dtClamp((e.clientY - r.top) / r.height, DT_LIM.y0, DT_LIM.y1)
  };
}

function dtBindStage(st) {
  st.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    if (DT.walk && DT.walk.fol === DT.myId) { dtFlash('أنت تمشي مع شريكك، اضغط «توقف» لتتحكم بنفسك'); return; }
    var sg = DT.gl && DT.gl[DT.myId]; if (sg && sg.s) { dtFlash('أنت جالس، اضغط «قم من الكرسي» لتتحرك'); return; }
    if (!DT.ws && DT.wsIdle) { DT.wsN = 0; dtWsOpen(); }     // عودة بعد إغلاق الخمول
    var p = dtPt(e), m = DT.ch.m;
    DT.drag = dtDist(p, m) < 0.09;                           // أمسكت شخصيتي: تتبع إصبعي بسرعة أعلى
    m.tx = p.x; m.ty = p.y;
    try { st.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
  });
  st.addEventListener('pointermove', function (e) {
    if (!DT.drag) return;
    var p = dtPt(e); DT.ch.m.tx = p.x; DT.ch.m.ty = p.y;
    e.preventDefault();
  });
  var up = function () { DT.drag = false; };
  st.addEventListener('pointerup', up);
  st.addEventListener('pointercancel', up);
}

function dtVis() {
  if (!DT.id) return;
  if (document.hidden) {
    clearTimeout(DT.hideT);
    DT.hideT = setTimeout(function () { if (DT.ws) { try { DT.ws.close(1000, 'hidden'); } catch (e) {} } }, 60000);
  } else {
    clearTimeout(DT.hideT);
    if (!DT.ws) { DT.wsN = 0; dtWsOpen(); }
  }
}

function dtBuild(id, j) {
  var th = DT_TH[j.ty] || DT_TH['عشاء رومانسي'];
  var who = j.who || {};
  var mine = who.me || { id: (typeof me !== 'undefined' && me && me.id) || 0, iv: 0 };
  var part = who.partner || { id: (typeof REL !== 'undefined' && REL && REL.active && REL.active.partner.id) || 0, iv: 0 };
  var mn = (typeof me !== 'undefined' && me && me.name) || 'أنا';
  var pn = (typeof REL !== 'undefined' && REL && REL.active && REL.active.partner.name) || 'شريكي';
  DT.id = id; DT.ty = j.ty; DT.after = 0; DT.off = j.now - Date.now(); DT.started = j.started || j.now;
  DT.myId = mine.id; DT.soff = DT.off; DT.still = dtReduce();
  var lowMine = mine.id && part.id ? mine.id < part.id : false;
  DT.ch = { m: { x: null, y: null, tx: 0.7, ty: 0.72, sx: -1, sy: -1, here: 1, moving: 0 }, p: { x: null, y: null, tx: 0.3, ty: 0.72, here: 0, moving: 0 } };
  dtSetPos(DT.ch.m, lowMine ? 0.3 : 0.7, 0.72, true);       // نفس مواضع البداية في الخادم
  dtSetPos(DT.ch.p, lowMine ? 0.7 : 0.3, 0.72, true);
  DT.ob = {}; DT.gl = {}; DT.gd = {}; DT.cx = {}; DT.zoomOn = 1; DT.zz = 1; DT.zx = null; DT.zy = null; DT.gfx = {}; DT.pour = null; DT.bn = null; DT.lbt = 0; DT.near = { k: 0, fx: 1 }; DT.hearts = []; DT.glow = 0; DT.hz = 0; DT.sent = 0; DT.sig = '';
  DT.simple = 0; DT.sm = null; DT.modeBtn = null;
  DT.dark = 0.34; DT.dTarget = 0.34; DT.wsN = 0; DT.wsIdle = 0; DT.drag = false; DT.fxNote = 0;

  var root = dtNode('div', 'position:fixed;inset:0;z-index:36;display:flex;overflow:hidden;color:#fff;padding-top:env(safe-area-inset-top,0px);overscroll-behavior:none;background:linear-gradient(180deg,' + th[0] + ',' + th[1] + ')');
  root.id = 'dtsc';
  root.setAttribute('dir', 'rtl');
  var sty = document.createElement('style');
  sty.textContent = '@keyframes dtfl{0%,100%{transform:translate(-50%,0) scale(1,1)}50%{transform:translate(-50%,0) scale(.9,1.12)}}@keyframes dtcard{0%,100%{box-shadow:0 3px 8px #0007,0 0 6px #fde68a55}50%{box-shadow:0 3px 8px #0007,0 0 18px #fde68acc}}';
  root.appendChild(sty);
  var cv = dtNode('canvas', 'position:absolute;inset:0;width:100%;height:100%');
  root.appendChild(cv);

  var btn = 'background:transparent;border:1px solid #fff7;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit';
  var top = dtNode('div', 'position:absolute;top:env(safe-area-inset-top,0px);inset-inline:0;display:flex;gap:6px;align-items:center;padding:10px;z-index:3;flex-wrap:wrap');
  top.id = 'dttop';
  top.appendChild(dtNode('b', '', '🕯️ ' + j.ty + (j.place ? ' · ' + j.place : '')));
  var clk = dtNode('span', 'font-variant-numeric:tabular-nums', '00:00'); clk.id = 'dtm2'; top.appendChild(clk);
  var dot = dtNode('span', 'font-size:11px', '⚪'); dot.id = 'dtws'; top.appendChild(dot);
  top.appendChild(dtNode('span', 'flex:1'));
  [['🎲 سؤال', function () { api('date/ask', { id: DT.id }).then(function (r) { if (!(r.j && r.j.ok)) dtToast('⚠️ ' + ((r.j && r.j.error) || 'تعذر السؤال')); }); }],
   ['🫧 نمط بسيط', function () { dtToggleMode(); }],
   ['💞 حركات', function () { if (typeof gstOpen === 'function') gstOpen(); }],
   ['🔍 تقريب', function () { DT.zoomOn = DT.zoomOn ? 0 : 1; this.style.opacity = DT.zoomOn ? '1' : '0.5'; }],
   ['🚩 بلاغ', function () { if (window.relReport) relReport('date', DT.id); }],
   ['⤴️ خروج', function () { dtClose('خرجت من الموعد، يمكنك العودة إليه من نافذة الارتباط'); }],
   ['🏁 إنهاء', function () {
     if (!confirm('إنهاء الموعد للطرفين وحفظه في ذكرياتنا؟')) return;
     api('date/end', { id: DT.id }).then(function (r) {
       if (r.j && r.j.ok) dtClose('🎬 انتهى الموعد وحُفظ في ذكرياتنا');
       else dtToast('⚠️ ' + ((r.j && r.j.error) || 'تعذر الإنهاء'));
     }, function () { dtToast('⚠️ تعذر الاتصال بالخادم'); });
   }]].forEach(function (a) { var b = dtNode('button', btn, a[0]); b.onclick = a[1]; top.appendChild(b); if (a[0] === '🫧 نمط بسيط') DT.modeBtn = b; });
  root.appendChild(top);

  // المسرح: منطقة لعب بنسبة 4:3 ثابتة في وسط الشاشة (الإحداثيات تتطابق بين الجوال والحاسوب)
  var area = dtNode('div', 'position:absolute;inset-inline:0;display:flex;align-items:center;justify-content:center;z-index:1');
  area.id = 'dtarea';
  var st = dtNode('div', 'position:relative;border-radius:18px;background:linear-gradient(180deg,#ffffff0a 0%,#ffffff14 55%,#00000030 100%);border:1px solid #ffffff22;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:pointer');
  var fxc = dtNode('canvas', 'position:absolute;left:0;top:0;border-radius:18px;pointer-events:none;z-index:900');
  var floor = dtNode('div', 'position:absolute;left:0;right:0;top:16%;height:1px;background:#ffffff1c;pointer-events:none');
  var bdc = dtNode('canvas', 'position:absolute;left:0;top:0;border-radius:18px;pointer-events:none;z-index:0');
  st.appendChild(bdc); st.appendChild(floor);
  DT.bd = bdc; DT.bdx = null; DT.bgc = null; DT.walk = null; DT.pose = null;
  DT.els = {};
  DT.els.candle = dtObjEl(DT_SVG.candle, 0.9, 'margin:calc(var(--s)*-1.1) 0 0 calc(var(--s)*-.45)');
  var fl = dtNode('div', 'position:absolute;left:50%;top:6%;width:22%;height:30%;border-radius:50% 50% 50% 50%/65% 65% 35% 35%;background:radial-gradient(ellipse at 50% 70%,#fff7c2,#fbbf24 55%,#f97316);box-shadow:0 0 14px 4px #fbbf2499;opacity:0;transition:opacity .35s;transform-origin:50% 100%;' + (DT.still ? 'transform:translate(-50%,0)' : 'animation:dtfl .5s ease-in-out infinite'));
  DT.els.candle.appendChild(fl); DT.els.flame = fl;
  DT.els.rose = dtObjEl(DT_SVG.rose, 0.55, 'transform:translate(-50%,-70%)');
  DT.els.ball = dtObjEl(DT_SVG.ball, 0.5, 'margin:calc(var(--s)*-.25) 0 0 calc(var(--s)*-.25)');
  DT.els.m = dtChar(mn.charAt(0), 'linear-gradient(135deg,#2dd4bf,#0f766e)', '#2dd4bf99', 'dbm', '', mine && mine.id);
  DT.els.p = dtChar(pn.charAt(0), 'linear-gradient(135deg,#fb7185,#be123c)', '#fb718599', 'dbh', '', part && part.id);
  [DT.els.candle, DT.els.ball, DT.els.rose, DT.els.m, DT.els.p].forEach(function (e) { st.appendChild(e); });
  if (j.ty === 'عشاء رومانسي') {                // ورقة قائمة قائمة على المائدة: المسها لتفتح نافذة المشروبات
    var card = dtNode('div', 'position:absolute;left:45.5%;top:47.5%;width:calc(var(--s)*.55);height:calc(var(--s)*.7);transform:translate(-50%,-50%) rotate(-6deg);z-index:880;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-radius:5px;background:linear-gradient(180deg,#fffaf0,#f3e3c3);border:1px solid #c9a56a;box-shadow:0 3px 8px #0007,0 0 14px #fde68a88;color:#5b3a12;font-size:calc(var(--s)*.18);line-height:1;animation:dtcard 2.4s ease-in-out infinite');
    card.appendChild(dtNode('span', '', '📖'));
    card.appendChild(dtNode('span', 'font-size:calc(var(--s)*.1);font-weight:700', 'قائمة'));
    card.title = 'قائمة العشاء';
    card.addEventListener('pointerdown', function (e) {
      e.stopPropagation(); e.preventDefault();          // لا تتحرك الشخصية عند لمس الورقة
      if (!DT.wsOk) { dtFlash('غير متصل بالمسرح'); return; }
      if (dtDist(DT.ch.m, DT_TBL) > DT_REACH.table) { dtFlash('اقترب من الطاولة لتفتح القائمة'); return; }
      dtMenu();
    });
    st.appendChild(card);
  }
  st.appendChild(fxc);
  area.appendChild(st);
  root.appendChild(area);
  DT.st = st; DT.fx = fxc;
  st.style.transformOrigin = '0 0'; area.style.overflow = 'hidden';      // الكاميرا: التقريب داخل حدود منطقة المسرح فقط

  // النمط البسيط: فقاعتان فقط (مخفي افتراضياً، يُبدَّل من زر الأعلى ويُزامَن بين الطرفين)
  var sm = dtNode('div', 'position:absolute;inset-inline:0;display:none;align-items:center;justify-content:center;gap:6%;z-index:1;padding:0 10px');
  sm.id = 'dtsimple';
  sm.appendChild(dtSmCard('p', pn, pn.charAt(0), 'linear-gradient(135deg,#fb7185,#be123c)', '#fb718599', dtImgUrl(part)));
  sm.appendChild(dtSmCard('m', mn, mn.charAt(0), 'linear-gradient(135deg,#2dd4bf,#0f766e)', '#2dd4bf99', dtImgUrl(mine)));
  root.appendChild(sm);
  DT.sm = sm;

  var mid = dtNode('div', 'position:absolute;top:24%;inset-inline:8%;text-align:center;font-size:20px;opacity:0;transition:opacity .6s;text-shadow:0 2px 14px #000;z-index:4;pointer-events:none');
  mid.id = 'dmid'; root.appendChild(mid);

  var acts = dtNode('div', 'position:absolute;inset-inline:0;bottom:calc(var(--bh,64px) + 6px);display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:0 10px;z-index:4;pointer-events:none');
  acts.id = 'dtacts';
  acts.style.pointerEvents = 'none';
  root.appendChild(acts);

  var bar = dtNode('div', 'position:absolute;bottom:0;inset-inline:0;display:flex;gap:6px;padding:10px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));background:#0006;z-index:3');
  bar.id = 'dtbar';
  var inp = dtNode('input', 'flex:1;min-width:0;background:#fff2;color:#fff;border:1px solid #fff4;border-radius:8px;padding:9px;font-size:16px');
  inp.id = 'dtx'; inp.type = 'text'; inp.maxLength = 120; inp.placeholder = 'اكتب... تظهر رسالتك كفقاعة ثم تختفي';
  inp.onkeydown = function (e) { if (e.key === 'Enter' && !e.isComposing) dtSend(); };
  var sn = dtNode('button', 'background:#fb7185;border:0;color:#fff;border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit', 'إرسال');
  sn.onclick = dtSend;
  bar.appendChild(inp); bar.appendChild(sn);
  root.appendChild(bar);

  document.body.appendChild(root);
  DT.root = root;
  acts.style.setProperty('--bh', bar.offsetHeight + 'px');
  dtStageSize();
  dtBindStage(st);
  DT.onResize2 = function () { dtStageSize(); var a2 = DT.root && DT.root.querySelector('#dtacts'); if (a2) a2.style.setProperty('--bh', DT.root.querySelector('#dtbar').offsetHeight + 'px'); };
  window.addEventListener('resize', DT.onResize2);
  DT.onVis = dtVis;
  document.addEventListener('visibilitychange', DT.onVis);
  DT.onKey = function (e) {
    if (e.key === 'Escape' && DT.root) { var bk = DT.root.querySelector('#dtbook'); if (bk) { bk.remove(); return; } }
    if (e.key === 'Escape' && !document.getElementById('gstsheet')) dtClose();
  };
  document.addEventListener('keydown', DT.onKey);
  dtBokeh();
  DT.tm = setInterval(dtClock, 1000); dtClock();
  DT.pingT = setInterval(function () { if (DT.ws && DT.wsOk) { try { DT.ws.send('ping'); } catch (e) {} } }, 25000);
  DT.actT = setInterval(function () { if (!document.hidden) dtWsSend({ t: 'a' }); }, 60000);
  DT.poll = setTimeout(dtPoll, 1500);
  DT.lt = 0;
  DT.raf2 = requestAnimationFrame(dtLoop);
  dtWsOpen();
  setTimeout(function () { if (DT.root) dtFlash('🕯️ بدأ موعدكما 💕'); }, 700);
}

window.dateOpen = dateOpen;
