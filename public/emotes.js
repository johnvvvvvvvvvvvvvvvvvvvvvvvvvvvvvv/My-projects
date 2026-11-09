/* المرحلة 2: محرك الإيماءات (الواجهة).
   إيماءات محلية تُعرض تلقائياً عند أحداث الموقع، ولا تمر بالخادم (بخلاف gestures.js التي تُرسَل للشريك).
   كل شيء يُقرأ من ملف بيانات واحد: /emotes/manifest.json
   إضافة حزمة جديدة = نسخ ملفاتها تحت /emotes/ وإضافة كتلة في manifest.json، دون تعديل هذا الملف.

   الاستعمال من أي صفحة:
     EMO.fire('partner_message');
     document.dispatchEvent(new CustomEvent('emo', { detail: { event: 'partner_message' } }));

   أنواع الملفات (بحسب الامتداد): webm/mp4/mov = فيديو، json = Lottie، gif/png/webp/apng/svg = صورة.
   حقول اختيارية في عنصر الحزمة:
     "alt":  ملف أو قائمة ملفات بديلة لمتصفح لا يدعم الصيغة الأولى (فيديو فقط)
     "ms":   مدة العرض بالمللي ثانية إن أردت تغيير الافتراضي
   أماكن الظهور في المشغّل: corner | center | top | random */
var EMO = (function () {
  'use strict';

  var BASE = '/emotes/';
  var KEY = 'emo_prefs_v1';
  var WHERE = ['corner', 'center', 'top', 'random'];
  var SPOTS = ['corner', 'center', 'top', 'side']; // مواضع «random» (side للعشوائي فقط)
  var MIME = { webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime' };
  var QUEUE_MAX = 3;

  var POS = {
    corner: { size: 96,  css: 'align-items:flex-end;justify-content:flex-start;padding:0 12px calc(90px + env(safe-area-inset-bottom,0px))' },
    center: { size: 220, css: 'align-items:center;justify-content:center' },
    top:    { size: 120, css: 'align-items:flex-start;justify-content:center;padding-top:calc(64px + env(safe-area-inset-top,0px))' },
    side:   { size: 110, css: 'align-items:center;justify-content:flex-end;padding:0 12px' }
  };

  var S = {
    state: 'idle',            // idle | loading | ok | fail
    ready: null,
    items: {}, packs: [], triggers: [], byEvent: {},
    last: {}, lastItem: {},   // آخر وقت عرض لكل مشغّل، وآخر عنصر لتجنب التكرار المباشر
    queue: [], playing: false,
    prefs: { off: false, t: {} }
  };

  /* ---------- أدوات ---------- */
  function el(t, css, txt) {
    var e = document.createElement(t);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function ext(f) { return String(f).split('.').pop().toLowerCase(); }
  // مسارات نسبية بسيطة فقط: لا مجلدات أعلى ولا روابط خارجية
  function okPath(f) {
    return typeof f === 'string' && /^[A-Za-z0-9_\-\/.]+$/.test(f) && f.indexOf('..') < 0 && f.charAt(0) !== '/';
  }
  function kindOf(f) {
    var e = ext(f);
    if (e === 'webm' || e === 'mp4' || e === 'mov') return 'video';
    if (e === 'json') return 'lottie';
    if (/^(gif|png|webp|apng|svg)$/.test(e)) return 'img';
    return 'none';
  }
  function reduce() {
    var p = (typeof REL !== 'undefined' && REL && REL.prefs) ? REL.prefs : {};
    return !!p.reduce_motion || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function pickSrc(it) {
    if (kindOf(it.file) !== 'video') return it.file;
    var all = [it.file].concat(it.alt), v = document.createElement('video');
    for (var i = 0; i < all.length; i++) {
      var m = MIME[ext(all[i])];
      if (m && v.canPlayType && v.canPlayType(m)) return all[i];
    }
    return all[0];
  }

  /* ---------- التفضيلات (محلية في هذا المتصفح) ---------- */
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (p && typeof p === 'object') return { off: !!p.off, t: (p.t && typeof p.t === 'object') ? p.t : {} };
    } catch (e) {}
    return { off: false, t: {} };
  }
  function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify(S.prefs)); } catch (e) {} }
  function trigOn(tr) {
    var p = S.prefs.t[tr.id];
    if (p && typeof p.on === 'boolean') return p.on;
    return tr['default'] !== false;
  }
  function trigWhere(tr) {
    var p = S.prefs.t[tr.id];
    return (p && WHERE.indexOf(p.where) >= 0) ? p.where : tr.where;
  }
  function trigById(id) {
    for (var i = 0; i < S.triggers.length; i++) if (S.triggers[i].id === id) return S.triggers[i];
    return null;
  }
  function patch(id, k, v) {
    if (!trigById(id)) return false;
    var p = S.prefs.t[id] || (S.prefs.t[id] = {});
    p[k] = v; savePrefs();
    return true;
  }

  /* ---------- قراءة ملف البيانات ---------- */
  function parse(m) {
    S.items = {}; S.packs = []; S.triggers = []; S.byEvent = {};
    if (!m || m.v !== 1) return false;
    (m.packs || []).forEach(function (p) {
      if (!p || !p.id) return;
      var n = 0;
      (p.items || []).forEach(function (it) {
        if (!it || !it.id || !okPath(it.file) || S.items[it.id]) return;
        var alt = typeof it.alt === 'string' ? [it.alt] : (Array.isArray(it.alt) ? it.alt : []);
        S.items[it.id] = {
          id: String(it.id), pack: String(p.id), file: it.file,
          alt: alt.filter(okPath),
          emoji: it.emoji ? String(it.emoji) : '💞',
          label: it.label ? String(it.label) : String(it.id),
          ms: (+it.ms > 0) ? Math.min(+it.ms, 8000) : 0
        };
        n++;
      });
      S.packs.push({ id: String(p.id), name: p.name ? String(p.name) : String(p.id), credit: p.credit ? String(p.credit) : '', count: n });
    });
    (m.triggers || []).forEach(function (t) {
      if (!t || !t.id || !t.event) return;
      var its = (t.items || []).filter(function (i) { return S.items[i]; });
      if (!its.length) return; // مشغّل بلا عناصر صالحة يُتجاهل
      var tr = {
        id: String(t.id), event: String(t.event),
        label: t.label ? String(t.label) : String(t.id),
        items: its,
        where: WHERE.indexOf(t.where) >= 0 ? t.where : 'corner',
        cooldown: Math.max(0, +t.cooldown || 0),
        'default': t['default'] !== false
      };
      S.triggers.push(tr);
      (S.byEvent[tr.event] = S.byEvent[tr.event] || []).push(tr);
    });
    return true;
  }

  /* ---------- العرض ---------- */
  function show(it, where) {
    return new Promise(function (done) {
      var z = POS[where] || POS.corner;
      var sz = Math.min(z.size, Math.round(window.innerWidth * 0.6));
      var host = el('div', 'position:fixed;inset:0;z-index:44;display:flex;pointer-events:none;' + z.css);
      host.className = 'emo-host';
      var box = el('div', 'width:' + sz + 'px;height:' + sz + 'px;display:flex;align-items:center;justify-content:center;font-size:' + Math.round(sz * 0.6) + 'px;opacity:0;transform:scale(.7);transition:opacity .3s,transform .35s cubic-bezier(.2,1.3,.4,1)');
      host.appendChild(box);
      document.body.appendChild(host);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { box.style.opacity = '1'; box.style.transform = 'scale(1)'; });
      });

      var finished = false, timer = 0, anim = null;
      function end() {
        if (finished) return;
        finished = true; clearTimeout(timer);
        box.style.opacity = '0'; box.style.transform = 'scale(.9)';
        setTimeout(function () {
          try { if (anim) anim.destroy(); } catch (e) {}
          host.remove(); done();
        }, 350);
      }
      // احتياط: صورة ثابتة (الإيموجي) عند «تقليل الحركة» أو إن تعذر تحميل الملف
      function still() {
        if (finished) return;
        clearTimeout(timer);
        box.innerHTML = '';
        box.textContent = it.emoji;
        timer = setTimeout(end, 2200);
      }

      if (reduce()) { still(); return; }

      var k = kindOf(it.file);
      if (k === 'video') {
        var v = document.createElement('video');
        v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'auto';
        v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
        v.style.cssText = 'width:100%;height:100%;object-fit:contain;background:transparent';
        v.onended = end;
        v.onerror = still;
        v.src = BASE + pickSrc(it);
        box.appendChild(v);
        timer = setTimeout(end, it.ms || 4500);
        var pr = v.play();
        if (pr && pr.catch) pr.catch(still);
      } else if (k === 'img') {
        var im = document.createElement('img');
        im.style.cssText = 'width:100%;height:100%;object-fit:contain';
        im.onerror = still;
        im.src = BASE + it.file;
        box.appendChild(im);
        timer = setTimeout(end, it.ms || 3000);
      } else if (k === 'lottie') {
        fetch(BASE + it.file, { credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (finished) return;
            if (!data || typeof lottie === 'undefined') return still();
            try {
              anim = lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: true, animationData: data });
              anim.addEventListener('complete', end);
              timer = setTimeout(end, it.ms || 5000);
            } catch (e) { still(); }
          })
          .catch(still);
      } else {
        still();
      }
    });
  }

  function pump() {
    if (S.playing || !S.queue.length) return;
    S.playing = true;
    var q = S.queue.shift();
    var next = function () { S.playing = false; pump(); };
    try { show(q.it, q.where).then(next, next); } catch (e) { next(); }
  }
  function enqueue(it, where) {
    if (S.queue.length >= QUEUE_MAX) return false; // سقف الطابور: لا إغراق
    for (var i = 0; i < S.queue.length; i++) if (S.queue[i].it.id === it.id) return false;
    S.queue.push({ it: it, where: where });
    pump();
    return true;
  }

  /* ---------- الإطلاق ---------- */
  function pickItem(tr) {
    var ids = tr.items;
    if (ids.length > 1) { // لا تكرر العنصر نفسه مرتين متتاليتين
      ids = ids.filter(function (i) { return i !== S.lastItem[tr.id]; });
    }
    var id = ids[Math.floor(Math.random() * ids.length)];
    S.lastItem[tr.id] = id;
    return S.items[id];
  }
  function resolveWhere(w) {
    if (w === 'random') return SPOTS[Math.floor(Math.random() * SPOTS.length)];
    return w;
  }

  function fireNow(event, ctx) {
    var trs = S.byEvent[event];
    if (!trs) return false;
    var now = Date.now(), shown = false;
    trs.forEach(function (tr) {
      if (!trigOn(tr)) return;
      if (tr.cooldown && S.last[tr.id] && now - S.last[tr.id] < tr.cooldown * 1000) return;
      var it = (ctx.item && S.items[ctx.item]) ? S.items[ctx.item] : pickItem(tr);
      var w = (ctx.where && WHERE.indexOf(ctx.where) >= 0) ? ctx.where : trigWhere(tr);
      if (enqueue(it, resolveWhere(w))) { S.last[tr.id] = now; shown = true; }
    });
    return shown;
  }

  function fire(event, ctx) {
    ctx = ctx || {};
    if (S.prefs.off || document.hidden) return false; // لا تعرض والتبويب مخفي
    if (S.state === 'loading') { S.ready.then(function () { if (S.state === 'ok') fireNow(event, ctx); }); return false; }
    if (S.state !== 'ok') return false;
    return fireNow(event, ctx);
  }

  // معاينة مشغّل من شاشة الإعدادات: تتجاهل الإيقاف ومهلة التبريد
  function test(triggerId) {
    var tr = trigById(triggerId);
    if (!tr) return false;
    return enqueue(pickItem(tr), resolveWhere(trigWhere(tr)));
  }

  /* ---------- تسخين الملفات (اختياري وخفيف) ---------- */
  function warm() {
    try {
      var c = navigator.connection;
      if (c && (c.saveData || (c.effectiveType && c.effectiveType !== '4g'))) return;
    } catch (e) {}
    var files = [], seen = {};
    S.triggers.forEach(function (tr) {
      if (!trigOn(tr)) return;
      tr.items.forEach(function (id) {
        var it = S.items[id];
        if (!it || seen[id] || kindOf(it.file) === 'none') return;
        seen[id] = 1; files.push(BASE + pickSrc(it));
      });
    });
    files = files.slice(0, 8);
    (function next() {
      var f = files.shift();
      if (!f) return;
      fetch(f, { credentials: 'same-origin' }).then(function (r) { return r.blob(); }).then(next, next);
    })();
  }

  /* ---------- التحميل ---------- */
  function init() {
    if (S.state !== 'idle') return S.ready;
    S.state = 'loading';
    S.prefs = loadPrefs();
    S.ready = fetch(BASE + 'manifest.json', { credentials: 'same-origin', cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        S.state = parse(m) ? 'ok' : 'fail';
        if (S.state === 'ok') setTimeout(warm, 3000);
      })
      .catch(function () { S.state = 'fail'; });
    return S.ready;
  }
  function reload() { S.state = 'idle'; return init(); }

  /* ---------- واجهة لشاشة الإعدادات (المرحلة 3) ---------- */
  function list() {
    return S.triggers.map(function (tr) {
      return {
        id: tr.id, event: tr.event, label: tr.label, on: trigOn(tr), where: trigWhere(tr), cooldown: tr.cooldown,
        items: tr.items.map(function (i) { var x = S.items[i]; return { id: x.id, label: x.label, emoji: x.emoji }; })
      };
    });
  }

  window.addEventListener('storage', function (e) { if (e.key === KEY) S.prefs = loadPrefs(); });
  document.addEventListener('emo', function (e) {
    var d = (e && e.detail) || {};
    if (d.event) fire(String(d.event), { item: d.item, where: d.where });
  });

  init();

  return {
    fire: fire,
    test: test,
    reload: reload,
    ready: function () { return init(); },
    list: list,
    packs: function () { return S.packs.slice(); },
    isOff: function () { return !!S.prefs.off; },
    setOff: function (b) { S.prefs.off = !!b; savePrefs(); },
    setOn: function (id, b) { return patch(id, 'on', !!b); },
    setWhere: function (id, w) { return WHERE.indexOf(w) >= 0 ? patch(id, 'where', w) : false; },
    reset: function () { S.prefs = { off: false, t: {} }; savePrefs(); }
  };
})();
