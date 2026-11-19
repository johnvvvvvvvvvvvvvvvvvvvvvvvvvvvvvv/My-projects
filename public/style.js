/* public/style.js — تلوين الأسماء
 * الرمز: 0 = بلا تلوين، وإلا 15 بتاً تطابق src/style.js
 *   0-5 لوحة (0..63) | 6-8 حركة (0..7) | 9-10 سرعة+1 (1..3) | 11-12 توهج (0..3) | 13 عريض | 14 حدّ
 * الاستعمال في الواجهة:
 *   1) ضع data-nsu="رقم_العضو" على عنصر الاسم (span) فيُلوَّن تلقائياً بعد جلب رمزه.
 *   2) NS.openEditor({name:'اسمي', uid: رقمي}) يفتح نافذة التخصيص.
 * الحماية من التجمد: حدّ أقصى للعناصر المتحركة، تحريك المرئي فقط، إيقاف عند إخفاء التبويب،
 * احترام prefers-reduced-motion، و12 إطاراً/ثانية عبر steps().
 */
(function () {
  'use strict';
  if (window.NS) return;

  var CAP = 40;                                   // أقصى عدد أسماء متحركة معاً
  var SPEEDS = [[3200, 38], [2000, 24], [1000, 12]];   // [المدة مللي ثانية, خطوات] ≈ 12fps
  var ANIMS = ['ثابت', 'تدفّق', 'نبض', 'موجة', 'قوس قزح', 'توهّج', 'وميض', 'طفو'];
  var ACLS = ['', 'ns-a1', 'ns-a2', 'ns-a3', 'ns-a4', 'ns-a5', 'ns-a6', 'ns-a7'];

  /* ---------- اللوحات: 16 درجة × 4 أنماط = 64 ---------- */
  function hsl(h, s, l) { return 'hsl(' + (((h % 360) + 360) % 360).toFixed(0) + ',' + s + '%,' + l + '%)'; }
  function palParts(p) {
    var v = p >> 4, h = (p & 15) * 22.5;
    if (v === 0) return [h, 85, 58, h, 85, 58];            // لون واحد
    if (v === 1) return [h, 85, 58, h + 40, 85, 58];       // تدرّج قريب
    if (v === 2) return [h, 80, 60, h + 180, 80, 60];      // تدرّج متقابل
    return [h, 90, 78, h + 60, 90, 72];                    // باستيل
  }
  function pal(p) { var a = palParts(p & 63); return [hsl(a[0], a[1], a[2]), hsl(a[3], a[4], a[5])]; }
  function mixAt(p, t) {                                   // لون حرف داخل الموجة
    var a = palParts(p & 63);
    return hsl(a[0] + (a[3] - a[0]) * t, a[1] + (a[4] - a[1]) * t, a[2] + (a[5] - a[2]) * t);
  }

  function decode(c) {
    c = c | 0;
    return { p: c & 63, a: (c >> 6) & 7, s: Math.max(0, Math.min(2, ((c >> 9) & 3) - 1)), g: (c >> 11) & 3, b: (c >> 13) & 1, o: (c >> 14) & 1 };
  }
  function encode(o) {                                   // السرعة تُخزَّن +1 فلا يساوي الرمز المُلوَّن صفراً (0 = بلا تلوين)
    return ((o.p & 63) | ((o.a & 7) << 6) | (((Math.min(2, o.s) + 1) & 3) << 9) | ((o.g & 3) << 11) | ((o.b & 1) << 13) | ((o.o & 1) << 14)) >>> 0;
  }

  /* ---------- الستايلات الجاهزة (مجانية). الأرقام تطابق PRESET_CODES في src/style.js ---------- */
  var PRESETS = [["ناري", 5201], ["جمر", 5248], ["لافا", 13904], ["ثلجي", 2680], ["جليد", 3016], ["وميض", 1922], ["ذهبي", 15682], ["قوس قزح", 9472], ["قوس سريع", 3840], ["أورورا", 2661], ["غروب", 2653], ["محيط", 601], ["نيون سماوي", 16200], ["نيون وردي", 16206], ["نيون أخضر", 16197], ["نيون بنفسجي", 16204], ["حلوى", 1150], ["مارشميلو", 688], ["ياقوت", 12800], ["زمرد", 13126], ["زفير", 13130], ["جوهرة", 10892], ["سماء", 2682], ["موجة", 1225], ["موجة ملوّنة", 1249], ["رقصة", 3790], ["غيمة", 3529], ["فراشة", 3550], ["نبض", 16000], ["هدوء", 2700], ["برق", 6020], ["شرارة", 5505], ["ليلي", 10762], ["فجر", 2673], ["ربيع", 1110], ["غابة", 2645], ["ملكي", 13660], ["ورد", 3215], ["كرز", 27136], ["شفق", 3170]];
  var COST = 100;                                        // يطابق STYLE_COST في src/style.js
  var PSET = {}; PRESETS.forEach(function (x) { PSET[x[1]] = 1; });
  function isFree(code) { return !code || !!PSET[code]; }

  /* ---------- CSS ---------- */
  var css = '' +
    '.ns{display:inline-block;background-image:linear-gradient(90deg,var(--c1),var(--c2),var(--c1));background-size:200% 100%;background-repeat:repeat-x;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}' +
    '.ns.ns-b{font-weight:800}' +
    '.ns.ns-o{-webkit-text-stroke:.5px rgba(0,0,0,.45)}' +
    '.ns.ns-g1{filter:drop-shadow(0 0 3px var(--c1))}.ns.ns-g2{filter:drop-shadow(0 0 6px var(--c1))}.ns.ns-g3{filter:drop-shadow(0 0 5px var(--c1)) drop-shadow(0 0 10px var(--c2))}' +
    '.ns.ns-a1{animation:ns-flow var(--p) steps(var(--st)) infinite}' +
    '.ns.ns-a2{animation:ns-pulse var(--p) steps(var(--st)) infinite}' +
    '.ns.ns-a4{animation:ns-hue var(--p) steps(var(--st)) infinite}' +
    '.ns.ns-a5{animation:ns-glow var(--p) steps(var(--st)) infinite}' +
    '.ns.ns-a6{animation:ns-blink var(--p) steps(var(--st)) infinite}' +
    '.ns.ns-a7{animation:ns-float var(--p) steps(var(--st)) infinite}' +
    '.ns.ns-w{background:none;-webkit-text-fill-color:initial;color:inherit}' +
    '.ns-l{display:inline-block;white-space:pre}' +
    '.ns.ns-a3 .ns-l{animation:ns-wave var(--p) steps(var(--st)) infinite}' +
    '.ns.ns-off,.ns.ns-off .ns-l{animation:none!important}' +
    'html.ns-pause .ns,html.ns-pause .ns .ns-l{animation-play-state:paused!important}' +
    '@keyframes ns-flow{to{background-position-x:200%}}' +
    '@keyframes ns-pulse{0%,100%{opacity:1}50%{opacity:.55}}' +
    '@keyframes ns-blink{0%,100%{opacity:1}50%{opacity:.25}}' +
    '@keyframes ns-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}' +
    '@keyframes ns-wave{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}' +
    '@keyframes ns-hue{to{filter:hue-rotate(360deg)}}' +
    '@keyframes ns-glow{0%,100%{filter:drop-shadow(0 0 2px var(--c1))}50%{filter:drop-shadow(0 0 9px var(--c2))}}' +
    '@media (prefers-reduced-motion:reduce){.ns,.ns .ns-l{animation:none!important}}' +
    /* نافذة التخصيص */
    '#nsw{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;direction:rtl;font-family:inherit}' +
    '#nsw .nsc{background:#1c1c24;color:#eee;border-radius:14px;padding:16px;width:min(460px,94vw);max-height:92vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.5)}' +
    '#nsw h3{margin:0 0 10px;font-size:16px}#nsw .nsp{text-align:center;font-size:24px;padding:14px 6px;background:#12121a;border-radius:10px;margin-bottom:12px;min-height:34px;overflow:hidden;text-overflow:ellipsis}' +
    '#nsw .nst{display:flex;gap:6px;margin-bottom:10px}#nsw .nst button{flex:1;padding:8px 4px;border-radius:9px;border:1px solid #3a3a4a;background:#2b2b38;color:#eee;cursor:pointer;font-size:13px}#nsw .nst button.on{background:#5b6cff;border-color:#8a96ff}' +
    '#nsw .nsg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}' +
    '#nsw .nsg button{background:#12121a;border:2px solid #2b2b38;border-radius:9px;padding:8px 4px;cursor:pointer;color:#eee;min-width:0;text-align:center}#nsw .nsg button.on{border-color:#fff}' +
    '#nsw .nsg .nsn{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;vertical-align:top}#nsw .nsg small{display:block;font-size:10px;opacity:.6;margin-top:3px}' +
    '#nsw .nsh{font-size:12px;opacity:.75;margin:0 0 8px;line-height:1.6}' +
    '#nsw .nsr{margin:8px 0 4px;font-size:12px;opacity:.7}#nsw .nsb{display:flex;flex-wrap:wrap;gap:6px}' +
    '#nsw .nsb button{background:#2b2b38;color:#eee;border:1px solid #3a3a4a;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:13px}#nsw .nsb button.on{background:#5b6cff;border-color:#8a96ff}' +
    '#nsw .nsa{display:flex;gap:8px;margin-top:14px}#nsw .nsa button{flex:1;padding:9px;border-radius:9px;border:0;cursor:pointer;font-size:14px}' +
    '#nsw .nsok{background:#3ecf7a;color:#07210f}#nsw .nsno{background:#2b2b38;color:#eee}#nsw .nser{color:#ff8a8a;font-size:12px;min-height:16px;margin-top:6px}';
  var st = document.createElement('style'); st.id = 'ns-css'; st.textContent = css; document.head.appendChild(st);

  /* ---------- طبقات منع التجمد ---------- */
  var vis = new Set(), anim = new Set();                 // anim: كل العناصر المتحركة المسجّلة
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) vis.add(e.target); else { vis.delete(e.target); off(e.target); } });
    recompute();
  }) : null;
  function off(el) { el.classList.add('ns-off'); }
  function syncDelay(el) {                               // تزامن الطور: الطور المطلق = Date.now() % المدة
    var P = el._P, now = Date.now();
    if (el.classList.contains('ns-a3')) {
      var ls = el.querySelectorAll('.ns-l');
      for (var i = 0; i < ls.length; i++) ls[i].style.animationDelay = (-(((now - i * 90) % P) + P) % P) + 'ms';
    } else el.style.animationDelay = (-(now % P)) + 'ms';
  }
  function recompute() {
    var n = 0;
    vis.forEach(function (el) {
      if (!anim.has(el)) return;
      if (n < CAP) { if (el.classList.contains('ns-off')) { syncDelay(el); el.classList.remove('ns-off'); } n++; }
      else off(el);
    });
  }
  document.addEventListener('visibilitychange', function () { document.documentElement.classList.toggle('ns-pause', document.hidden); });
  setInterval(function () {                              // تنظيف العناصر التي أُزيلت من الصفحة
    anim.forEach(function (el) { if (!el.isConnected) { anim.delete(el); vis.delete(el); if (io) io.unobserve(el); } });
  }, 15000);

  /* ---------- التطبيق على عنصر ---------- */
  function clear(el) {
    if (el._nt !== undefined) { el.textContent = el._nt; delete el._nt; }
    el.className = (el.className || '').split(/\s+/).filter(function (c) { return c && !/^ns(-|$)/.test(c); }).join(' ');
    el.style.removeProperty('--c1'); el.style.removeProperty('--c2'); el.style.removeProperty('--p'); el.style.removeProperty('--st'); el.style.animationDelay = '';
    anim.delete(el); vis.delete(el); if (io) io.unobserve(el);
  }
  function apply(el, code) {
    clear(el);
    code = code | 0;
    if (!code) return;
    var o = decode(code), c = pal(o.p), sp = SPEEDS[o.s];
    var cls = ['ns'];
    if (o.b) cls.push('ns-b');
    if (o.o) cls.push('ns-o');
    if (o.g) cls.push('ns-g' + o.g);
    if (o.a === 3) {                                     // موجة: حرف حرف بلون ثابت
      var txt = el.textContent;
      if (txt.length <= 24) {
        el._nt = txt; cls.push('ns-w'); el.textContent = '';
        for (var i = 0; i < txt.length; i++) {
          var s = document.createElement('span'); s.className = 'ns-l'; s.textContent = txt[i];
          s.style.color = mixAt(o.p, txt.length > 1 ? i / (txt.length - 1) : 0); s.style.webkitTextFillColor = s.style.color;
          el.appendChild(s);
        }
        cls.push('ns-a3');
      }
    } else if (o.a) cls.push(ACLS[o.a]);
    el.className = ((el.className || '') + ' ' + cls.join(' ')).trim();
    el.style.setProperty('--c1', c[0]); el.style.setProperty('--c2', c[1]);
    el.style.setProperty('--p', sp[0] + 'ms'); el.style.setProperty('--st', sp[1]);
    el._P = sp[0];
    if (o.a && io) { off(el); anim.add(el); io.observe(el); }
  }

  /* ---------- الجلب والتطبيق التلقائي ---------- */
  var cache = Object.create(null), pending = new Set(), inflight = false, timer = 0;
  function fetchBatch() {
    if (inflight || !pending.size) return;
    var ids = Array.from(pending).slice(0, 80); ids.forEach(function (i) { pending.delete(i); });
    inflight = true;
    fetch('/api/style/get?ids=' + ids.join(','), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var s = (d && d.s) || {};
        ids.forEach(function (i) { cache[i] = s[i] | 0; });
        inflight = false; scan(); if (pending.size) fetchBatch();
      })
      .catch(function () { ids.forEach(function (i) { cache[i] = 0; }); inflight = false; scan(); });
  }
  function scan() {
    var els = document.querySelectorAll('[data-nsu]:not([data-nsd])');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], u = el.getAttribute('data-nsu');
      if (!(u in cache)) { pending.add(u); continue; }
      el.setAttribute('data-nsd', '1');
      apply(el, cache[u]);
    }
    if (pending.size && !inflight) fetchBatch();
  }
  function later() { if (timer) return; timer = setTimeout(function () { timer = 0; scan(); }, 80); }
  new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') later(); else document.addEventListener('DOMContentLoaded', later);

  function setOwn(uid, code) {                           // بعد الحفظ: حدّث كل مواضع اسمي فوراً
    cache[uid] = code | 0;
    var els = document.querySelectorAll('[data-nsu="' + uid + '"]');
    for (var i = 0; i < els.length; i++) { els[i].setAttribute('data-nsd', '1'); apply(els[i], code); }
  }

  /* ---------- نافذة التخصيص: تبويبان، وكل خيار يعرض اسم المستخدم نفسه ---------- */
  var DEF = encode({ p: 5, a: 0, s: 1, g: 0, b: 0, o: 0 });   // نقطة بداية التخصيص إن لم يكن للعضو ستايل
  function openEditor(opt) {
    opt = opt || {};
    var name = String(opt.name || 'اسمك'), uid = opt.uid;
    var start = (opt.code != null ? opt.code : (uid != null ? cache[uid] : 0)) | 0;
    var sel = start, tab = (start && !PSET[start]) ? 2 : 1;
    var old = document.getElementById('nsw'); if (old) old.remove();
    var w = document.createElement('div'); w.id = 'nsw';
    var card = document.createElement('div'); card.className = 'nsc'; w.appendChild(card);
    card.innerHTML = '<h3>🎨 تلوين اسمي</h3><div class="nsp"><span id="nspv"></span></div>' +
      '<div class="nst"><button id="nst1">✨ ستايلات جاهزة (مجاناً)</button><button id="nst2">🛠️ تخصيص كامل (' + COST + ' 🪙)</button></div>' +
      '<div id="nsbody"></div><div class="nser" id="nser"></div>' +
      '<div class="nsa"><button class="nsno" id="nsno">إلغاء</button><button class="nsno" id="nsrs">إزالة التلوين</button><button class="nsok" id="nsok"></button></div>';
    document.body.appendChild(w);
    var pv = card.querySelector('#nspv'), body = card.querySelector('#nsbody'), er = card.querySelector('#nser'), okb = card.querySelector('#nsok');
    pv.textContent = name;

    function cur() { return decode(sel || DEF); }
    function setCur(fn) { var o = cur(); fn(o); sel = encode(o); draw(); }
    function mark() {
      var o = cur();
      body.querySelectorAll('[data-c]').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-c') === sel); });
      body.querySelectorAll('[data-p]').forEach(function (b) { b.classList.toggle('on', !!sel && +b.getAttribute('data-p') === o.p); });
      body.querySelectorAll('[data-k]').forEach(function (b) {
        var k = b.getAttribute('data-k'), v = +b.getAttribute('data-v');
        b.classList.toggle('on', b.getAttribute('data-t') === '1' ? !!(sel && o[k]) : !!sel && o[k] === v);
      });
    }
    function draw() {
      pv.removeAttribute('data-nsd'); apply(pv, sel); mark();
      okb.textContent = isFree(sel) ? 'حفظ (مجاناً)' : 'حفظ (' + COST + ' 🪙)';
    }
    function cell(code, label, attr, val) {                // خلية = اسم المستخدم بذلك الستايل
      var b = document.createElement('button'), sp = document.createElement('span');
      sp.className = 'nsn'; sp.textContent = name; apply(sp, code);
      b.appendChild(sp); if (label) { var l = document.createElement('small'); l.textContent = label; b.appendChild(l); }
      b.setAttribute(attr, val); return b;
    }
    function group(title, labels, key) {
      var t = document.createElement('div'); t.className = 'nsr'; t.textContent = title; body.appendChild(t);
      var box = document.createElement('div'); box.className = 'nsb'; body.appendChild(box);
      labels.forEach(function (lab, i) {
        var b = document.createElement('button'); b.textContent = lab; b.setAttribute('data-k', key); b.setAttribute('data-v', i);
        b.onclick = function () { setCur(function (o) { o[key] = i; }); }; box.appendChild(b);
      });
    }
    function render() {
      card.querySelector('#nst1').classList.toggle('on', tab === 1);
      card.querySelector('#nst2').classList.toggle('on', tab === 2);
      body.innerHTML = '';
      var g = document.createElement('div'); g.className = 'nsg';
      if (tab === 1) {
        PRESETS.forEach(function (x) {
          var b = cell(x[1], x[0], 'data-c', x[1]);
          b.onclick = function () { sel = x[1]; draw(); }; g.appendChild(b);
        });
        body.appendChild(g);
      } else {
        var h = document.createElement('p'); h.className = 'nsh';
        h.textContent = 'اختر اللون من أسمائك أدناه ثم عدّل الحركة والتوهج. يُخصم ' + COST + ' 🪙 عند الحفظ، إلا إذا طابق النتيجة أحد الستايلات الجاهزة.';
        body.appendChild(h);
        for (var i = 0; i < 64; i++) (function (i) {
          var b = cell(encode({ p: i, a: 0, s: 1, g: 0, b: 0, o: 0 }), '', 'data-p', i);
          b.onclick = function () { setCur(function (o) { o.p = i; }); }; g.appendChild(b);
        })(i);
        body.appendChild(g);
        group('الحركة', ANIMS, 'a'); group('السرعة', ['بطيء', 'متوسط', 'سريع'], 's'); group('التوهّج', ['بدون', 'خفيف', 'متوسط', 'قوي'], 'g');
        var t = document.createElement('div'); t.className = 'nsr'; t.textContent = 'خيارات'; body.appendChild(t);
        var bo = document.createElement('div'); bo.className = 'nsb'; body.appendChild(bo);
        [['عريض', 'b'], ['حدّ خارجي', 'o']].forEach(function (x) {
          var b = document.createElement('button'); b.textContent = x[0]; b.setAttribute('data-k', x[1]); b.setAttribute('data-v', 1); b.setAttribute('data-t', '1');
          b.onclick = function () { setCur(function (o) { o[x[1]] = o[x[1]] ? 0 : 1; }); }; bo.appendChild(b);
        });
      }
      mark();
    }
    card.querySelector('#nst1').onclick = function () { tab = 1; render(); };
    card.querySelector('#nst2').onclick = function () { tab = 2; render(); };
    render(); draw();

    function close() { anim.delete(pv); vis.delete(pv); w.remove(); }
    w.onclick = function (e) { if (e.target === w) close(); };
    card.querySelector('#nsno').onclick = close;
    function save(code) {
      er.textContent = '';
      fetch('/api/style/save', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
        .then(function (r) { return r.json().then(function (d) { return [r.ok, d]; }); })
        .then(function (x) {
          if (!x[0]) { er.textContent = (x[1] && x[1].error) || 'تعذّر الحفظ'; return; }
          if (uid != null) setOwn(uid, x[1].code);
          if (typeof opt.onSaved === 'function') opt.onSaved(x[1].code, x[1].cost | 0);
          close();
        })
        .catch(function () { er.textContent = 'خطأ في الاتصال'; });
    }
    okb.onclick = function () { save(sel); };
    card.querySelector('#nsrs').onclick = function () { save(0); };
  }

  window.NS = { PRESETS: PRESETS, COST: COST, decode: decode, encode: encode, apply: apply, pal: pal, set: setOwn, scan: scan, openEditor: openEditor, cache: cache };
})();
