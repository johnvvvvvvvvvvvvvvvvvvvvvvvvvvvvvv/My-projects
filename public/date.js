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
var DT_REACH = { touch: 0.14, give: 0.20, candle: 0.20 };
var DT_OFFER_MS = 20000;

function dtDist(a, b) { return Math.hypot(a.x - b.x, (a.y - b.y) * 0.75); }
function dtClamp(v, a, b) { return v < a ? a : v > b ? b : v; }

var DT_SVG = {
  rose: '<svg viewBox="0 0 40 64" width="100%" height="100%"><path d="M20 28C20 42 18 54 18 62" stroke="#16a34a" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M18 48C9 46 7 40 7 40C14 40 18 44 18 48Z" fill="#22c55e"/><circle cx="20" cy="18" r="12" fill="#e11d48"/><path d="M12 17C15 7 25 7 28 17C25 13 15 13 12 17Z" fill="#fb7185"/><path d="M20 11C25 11 28 16 23 20C19 23 14 20 16 16" stroke="#9f1239" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  ball: '<svg viewBox="0 0 40 40" width="100%" height="100%"><defs><radialGradient id="dtbg" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fef3c7"/><stop offset="1" stop-color="#f59e0b"/></radialGradient></defs><circle cx="20" cy="20" r="18" fill="url(#dtbg)" stroke="#b45309" stroke-width="1.5"/><path d="M4 18C14 24 26 24 36 18M20 2C14 12 14 28 20 38" stroke="#b45309" stroke-width="1.5" fill="none" opacity=".55"/></svg>',
  candle: '<svg viewBox="0 0 60 90" width="100%" height="100%"><ellipse cx="30" cy="80" rx="28" ry="8" fill="#3b1d12"/><ellipse cx="30" cy="77" rx="28" ry="8" fill="#6b3a1e"/><rect x="24" y="38" width="12" height="38" rx="3" fill="#fef3c7"/><rect x="24" y="38" width="12" height="6" rx="3" fill="#fde68a"/><rect x="29" y="32" width="2" height="7" fill="#444"/></svg>'
};

function dtImgUrl(w) { return w && w.id && w.iv ? '/api/img?u=' + w.id + '&k=img&v=' + w.iv : ''; }

function dtChar(letter, grad, glow, bubId, url) {
  var c = dtNode('div', 'position:absolute;left:0;top:0;width:calc(var(--s)*.64);height:calc(var(--s)*.64);margin:calc(var(--s)*-1.94) 0 0 calc(var(--s)*-.32);pointer-events:none;transition:opacity .4s');
  var bub = dtNode('div', 'position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);width:max-content;max-width:calc(var(--s)*2.6);min-height:30px;padding:7px 11px;border-radius:16px;background:#ffffffee;color:#1d2330;opacity:0;transition:opacity .5s;word-break:break-word;text-align:center;font-size:14px;line-height:1.4');
  bub.id = bubId;
  var av = dtNode('div', 'position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:calc(var(--s)*.26);font-weight:700;border:3px solid #fff9;box-shadow:0 0 22px ' + glow + ',0 6px 12px #0006;background:' + grad, letter);
  av.className = 'dtav';
  if (url) {
    var im = document.createElement('img');
    im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
    im.alt = ''; im.draggable = false;
    im.onerror = function () { im.remove(); };
    im.src = url;
    av.appendChild(im);
  }
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
function dtFigure(g, c, pal, ts, here, link) {
  var W = DT.sw, H = DT.sh, s = DT.s;
  var fx = (c.x == null ? 0.5 : c.x) * W, fy = (c.y == null ? 0.7 : c.y) * H;
  var mv = c.moving && !DT.still;
  var sw = mv ? Math.sin(ts / 110 + (c === DT.ch.p ? 1.3 : 0)) : 0;
  var bob = mv ? Math.abs(Math.sin(ts / 110)) * H * 0.018 : 0;
  var hipY = fy - s * 0.66 - bob * 0.5, shY = fy - s * 1.16 - bob;
  g.globalAlpha = here ? 1 : 0.38;
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
  g.fillStyle = DT_SKIN; g.fillRect(fx - s * 0.07, fy - s * 1.36 - bob, s * 0.14, s * 0.26);
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
    if (link && link.hug) { t = dtReach(sx, sy, link.x + d * s * 0.16, link.y, s * 0.62); hx = t[0]; hy = t[1]; }
    else if (link && link.side === d) { t = dtReach(sx, sy, link.x, link.y, s * 0.62); hx = t[0]; hy = t[1]; }
    else { hx = sx + d * s * 0.07 - sw * d * s * 0.05; hy = sy + s * 0.52 - Math.abs(sw) * s * 0.02; }
    dtArm(g, sx, sy, hx, hy, pal, s);
  });
  g.globalAlpha = 1;
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
  var a = [m, DT_PAL.m, 1, lm], b = [p, DT_PAL.p, p.here, lp];
  var order = py < my ? [b, a] : [a, b];   // الأبعد أولاً
  order.forEach(function (z) { dtFigure(g, z[0], z[1], ts, z[2], z[3]); });
}

function dtPlace(el, x, y, z) {
  el.style.left = (x * 100) + '%'; el.style.top = (y * 100) + '%';
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
  if (DT.walk) a.push(['⏹ توقف عن المشي معاً', 'walk0', 1, 0]);
  else if (DT.near.k >= 1 && DT.near.fx && p.here) a.push(['🚶 امشِ معي', 'walk1', 1, 1]);
  if (DT.near.k === 2 && DT.near.fx && p.here) a.push(['🤗 عناق', 'hug', 1, 0], ['🤝 مسك اليد', 'hands', 1, 0]);
  return a;
}

function dtDoAct(k) {
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
}

function dtLoop(ts) {
  DT.raf2 = requestAnimationFrame(dtLoop);
  if (!DT.root) return;
  var dt = Math.min(0.05, (ts - (DT.lt || ts)) / 1000); DT.lt = ts;
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

  // رسم الشخصيتين
  var cm = DT.els.m, cp = DT.els.p;
  dtPlace(cm, m.x, m.y, Math.round(m.y * 100));
  dtPlace(cp, p.x == null ? 0.5 : p.x, p.y == null ? 0.7 : p.y, Math.round((p.y || 0.7) * 100));
  cp.style.opacity = p.here ? '1' : '0.38';
  [[cm, m], [cp, p]].forEach(function (z) {
    var av = z[0].firstChild.nextSibling;
    av.style.transform = z[1].moving && !DT.still ? 'translateY(' + (-Math.abs(Math.sin(ts / 110)) * DT.sh * 0.018).toFixed(1) + 'px)' : '';
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
  dtBodyDraw(ts);
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
  DT.ob = {}; DT.near = { k: 0, fx: 1 }; DT.hearts = []; DT.glow = 0; DT.hz = 0; DT.sent = 0; DT.sig = '';
  DT.simple = 0; DT.sm = null; DT.modeBtn = null;
  DT.dark = 0.34; DT.dTarget = 0.34; DT.wsN = 0; DT.wsIdle = 0; DT.drag = false; DT.fxNote = 0;

  var root = dtNode('div', 'position:fixed;inset:0;z-index:36;display:flex;overflow:hidden;color:#fff;padding-top:env(safe-area-inset-top,0px);overscroll-behavior:none;background:linear-gradient(180deg,' + th[0] + ',' + th[1] + ')');
  root.id = 'dtsc';
  root.setAttribute('dir', 'rtl');
  var sty = document.createElement('style');
  sty.textContent = '@keyframes dtfl{0%,100%{transform:translate(-50%,0) scale(1,1)}50%{transform:translate(-50%,0) scale(.9,1.12)}}';
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
  DT.els.m = dtChar(mn.charAt(0), 'linear-gradient(135deg,#2dd4bf,#0f766e)', '#2dd4bf99', 'dbm', dtImgUrl(mine));
  DT.els.p = dtChar(pn.charAt(0), 'linear-gradient(135deg,#fb7185,#be123c)', '#fb718599', 'dbh', dtImgUrl(part));
  [DT.els.candle, DT.els.ball, DT.els.rose, DT.els.m, DT.els.p].forEach(function (e) { st.appendChild(e); });
  st.appendChild(fxc);
  area.appendChild(st);
  root.appendChild(area);
  DT.st = st; DT.fx = fxc;

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
  DT.onKey = function (e) { if (e.key === 'Escape' && !document.getElementById('gstsheet')) dtClose(); };
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
