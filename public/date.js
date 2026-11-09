/* مشهد الموعد الغرامي: شاشة كاملة بخلفية حسب نوع الموعد وإضاءة ناعمة متحركة.
   أنت على اليمين وشريكك على اليسار، ولكل منكما فقاعة واحدة فقط: تظهر ثم تختفي بعد ثوانٍ،
   وعندما يكتب الآخر تختفي فقاعتك فوراً وتحل فقاعته. الرسائل لا تُسرد كقائمة.
   يُفتح من نافذة الارتباط (love.html ← مواعيد) عبر dateOpen(id). الخادم: src/dates.js */
var DT = { id: 0, ty: '', after: 0, off: 0, started: 0, tm: 0, poll: 0, raf: 0, bt: {}, mt: 0, root: null, onResize: null, onKey: null };

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
  if (!e) return;
  clearTimeout(DT.bt[side]);
  e.textContent = text;
  e.style.opacity = '1';
  DT.bt[side] = setTimeout(function () { e.style.opacity = '0'; }, ms || 6500);
}
function dtBubX(side) {
  clearTimeout(DT.bt[side]);
  var e = DT.root && DT.root.querySelector(side === 'm' ? '#dbm' : '#dbh');
  if (e) e.style.opacity = '0';
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
  clearTimeout(DT.poll); clearInterval(DT.tm); cancelAnimationFrame(DT.raf);
  clearTimeout(DT.bt.m); clearTimeout(DT.bt.h); clearTimeout(DT.mt);
  if (DT.onResize) window.removeEventListener('resize', DT.onResize);
  if (DT.onKey) document.removeEventListener('keydown', DT.onKey);
  if (DT.root) DT.root.remove();
  DT.id = 0; DT.root = null; DT.onResize = null; DT.onKey = null;
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

function dtBuild(id, j) {
  var th = DT_TH[j.ty] || DT_TH['عشاء رومانسي'];
  var mn = (typeof me !== 'undefined' && me && me.name) || 'أنا';
  var pn = (typeof REL !== 'undefined' && REL && REL.active && REL.active.partner.name) || 'شريكي';
  DT.id = id; DT.ty = j.ty; DT.after = 0; DT.off = j.now - Date.now(); DT.started = j.started || j.now;

  var root = dtNode('div', 'position:fixed;inset:0;z-index:36;display:flex;overflow:hidden;color:#fff;padding-top:env(safe-area-inset-top,0px);background:linear-gradient(180deg,' + th[0] + ',' + th[1] + ')');
  root.id = 'dtsc';
  root.setAttribute('dir', 'rtl');
  var cv = dtNode('canvas', 'position:absolute;inset:0;width:100%;height:100%');
  root.appendChild(cv);

  var btn = 'background:transparent;border:1px solid #fff7;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit';
  var top = dtNode('div', 'position:absolute;top:env(safe-area-inset-top,0px);inset-inline:0;display:flex;gap:6px;align-items:center;padding:10px;z-index:2;flex-wrap:wrap');
  top.appendChild(dtNode('b', '', '🕯️ ' + j.ty + (j.place ? ' · ' + j.place : '')));
  var clk = dtNode('span', 'font-variant-numeric:tabular-nums', '00:00'); clk.id = 'dtm2'; top.appendChild(clk);
  top.appendChild(dtNode('span', 'flex:1'));
  [['🎲 سؤال', function () { api('date/ask', { id: DT.id }).then(function (r) { if (!(r.j && r.j.ok)) dtToast('⚠️ ' + ((r.j && r.j.error) || 'تعذر السؤال')); }); }],
   ['💞 حركات', function () { if (typeof gstOpen === 'function') gstOpen(); }],
   ['🚩 بلاغ', function () { if (window.relReport) relReport('date', DT.id); }],
   ['⤴️ خروج', function () { dtClose('خرجت من الموعد، يمكنك العودة إليه من نافذة الارتباط'); }],
   ['🏁 إنهاء', function () {
     if (!confirm('إنهاء الموعد للطرفين وحفظه في ذكرياتنا؟')) return;
     api('date/end', { id: DT.id }).then(function (r) {
       if (r.j && r.j.ok) dtClose('🎬 انتهى الموعد وحُفظ في ذكرياتنا');
       else dtToast('⚠️ ' + ((r.j && r.j.error) || 'تعذر الإنهاء'));
     }, function () { dtToast('⚠️ تعذر الاتصال بالخادم'); });
   }]].forEach(function (a) { var b = dtNode('button', btn, a[0]); b.onclick = a[1]; top.appendChild(b); });
  root.appendChild(top);

  var mid = dtNode('div', 'position:absolute;top:22%;inset-inline:8%;text-align:center;font-size:20px;opacity:0;transition:opacity .6s;text-shadow:0 2px 14px #000;z-index:2');
  mid.id = 'dmid'; root.appendChild(mid);

  function side(css, grad, label, bubId) {
    var s = dtNode('div', 'position:absolute;bottom:20%;width:44%;display:flex;flex-direction:column;align-items:center;gap:10px;z-index:2;' + css);
    var bub = dtNode('div', 'order:-1;min-height:44px;max-width:100%;padding:10px 14px;border-radius:18px;background:#ffffffee;color:#1d2330;opacity:0;transition:opacity .5s;word-break:break-word;text-align:center;font-size:15px');
    bub.id = bubId;
    var av = dtNode('div', 'width:78px;height:78px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;border:3px solid #fff8;box-shadow:0 0 24px #fb718599;background:' + grad, label);
    s.appendChild(bub); s.appendChild(av);
    return s;
  }
  root.appendChild(side('right:3%', 'linear-gradient(135deg,#2dd4bf,#0f766e)', mn.charAt(0), 'dbm'));
  root.appendChild(side('left:3%', 'linear-gradient(135deg,#fb7185,#be123c)', pn.charAt(0), 'dbh'));

  var bar = dtNode('div', 'position:absolute;bottom:0;inset-inline:0;display:flex;gap:6px;padding:10px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));background:#0006;z-index:2');
  var inp = dtNode('input', 'flex:1;min-width:0;background:#fff2;color:#fff;border:1px solid #fff4;border-radius:8px;padding:9px;font-size:16px');
  inp.id = 'dtx'; inp.type = 'text'; inp.maxLength = 120; inp.placeholder = 'اكتب... تظهر رسالتك كفقاعة ثم تختفي';
  inp.onkeydown = function (e) { if (e.key === 'Enter' && !e.isComposing) dtSend(); };
  var sn = dtNode('button', 'background:#fb7185;border:0;color:#fff;border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit', 'إرسال');
  sn.onclick = dtSend;
  bar.appendChild(inp); bar.appendChild(sn);
  root.appendChild(bar);

  document.body.appendChild(root);
  DT.root = root;
  DT.onKey = function (e) { if (e.key === 'Escape' && !document.getElementById('gstsheet')) dtClose(); };
  document.addEventListener('keydown', DT.onKey);
  dtBokeh();
  DT.tm = setInterval(dtClock, 1000); dtClock();
  DT.poll = setTimeout(dtPoll, 1500);
  setTimeout(function () { if (DT.root) dtFlash('🕯️ بدأ موعدكما 💕'); }, 700);
}

window.dateOpen = dateOpen;
