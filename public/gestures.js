/* المرحلة 4: محرك الحركات (الواجهة).
   يعتمد على rel.js (REL, relIsLove) وux.js (UX.play) ودالة api() في chat.html.
   الإرسال: POST /api/gesture/send ثم إشارة WS {"t":"g"} للشريك، فيجلب /api/gesture/pending ويعرض. */
var GST = { list: null, playing: false, queue: [], timer: 0, cd: 0, cdT: 0 };

function gstPrefs() { return (typeof REL !== 'undefined' && REL && REL.prefs) ? REL.prefs : {}; }
function gstReduce() {
  var p = gstPrefs();
  return !!p.reduce_motion || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function gstEl(t, css, txt) {
  var e = document.createElement(t);
  if (css) e.style.cssText = css;
  if (txt != null) e.textContent = txt;
  return e;
}

function gstLoad() {
  if (GST.list) return Promise.resolve(GST.list);
  return fetch('/api/gesture/list', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.ok) GST.list = j.items; return GST.list; })
    .catch(function () { return null; });
}

/* ---------- صوت قصير مُولَّد (بلا ملفات) ---------- */
function gstSound() {
  if (gstPrefs().sound === 0) return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var c = GST.ac || (GST.ac = new AC());
    if (c.state === 'suspended') c.resume();
    [660, 880].forEach(function (f, i) {
      var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.13;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.5);
    });
  } catch (e) {}
}

/* ---------- جسيمات على Canvas بسقف عدد ---------- */
function gstParticles(host, emoji) {
  var low = (navigator.hardwareConcurrency || 4) <= 4;
  var N = low ? 14 : 28;
  var cv = document.createElement('canvas');
  var W = cv.width = host.clientWidth, H = cv.height = host.clientHeight;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  host.appendChild(cv);
  var x = cv.getContext('2d');
  var ps = [], t0 = performance.now();
  for (var i = 0; i < N; i++) {
    ps.push({
      x: Math.random() * W, y: H + Math.random() * H * 0.5,
      v: 0.6 + Math.random() * 1.4, s: 16 + Math.random() * 20,
      w: Math.random() * 6, a: 0.5 + Math.random() * 0.5
    });
  }
  (function frame(now) {
    if (!cv.isConnected) return;
    var el = now - t0;
    x.clearRect(0, 0, W, H);
    for (var k = 0; k < ps.length; k++) {
      var p = ps[k];
      p.y -= p.v * 2.2;
      var fade = el > 2400 ? Math.max(0, 1 - (el - 2400) / 800) : 1;
      x.globalAlpha = p.a * fade;
      x.font = p.s + 'px serif';
      x.fillText(emoji, p.x + Math.sin(p.w + el / 400) * 18, p.y);
    }
    if (el < 3300) requestAnimationFrame(frame);
  })(t0);
}

/* ---------- عرض حركة واحدة ---------- */
function gstShow(g, who) {
  return new Promise(function (done) {
    var full = gstPrefs().full_screen !== 0;
    var reduce = gstReduce();
    var ov = gstEl('div', full
      ? 'position:fixed;inset:0;z-index:45;background:rgba(10,6,20,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;opacity:0;transition:opacity .35s'
      : 'position:fixed;bottom:90px;inset-inline-start:12px;z-index:45;background:var(--sf);border:1px solid var(--ac);border-radius:16px;padding:10px 14px;display:flex;align-items:center;gap:10px;opacity:0;transition:opacity .35s;box-shadow:0 8px 28px #0004');
    ov.id = 'gstov';
    var box = gstEl('div', 'width:' + (full ? '230px;height:230px' : '64px;height:64px') + ';display:flex;align-items:center;justify-content:center;position:relative;z-index:1;font-size:' + (full ? '120px' : '44px'));
    var cap = gstEl('div', full ? 'color:#fff;font-size:20px;font-weight:700;text-align:center;max-width:80%;position:relative;z-index:1;text-shadow:0 2px 12px #0008' : 'font-size:14px', (who ? who + ' ' : '') + g.caption);
    ov.appendChild(box); ov.appendChild(cap);
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.style.opacity = '1'; });
    if (reduce) {
      box.textContent = g.emoji; // «تقليل الحركة»: صورة ثابتة بدل التحريك
    } else {
      if (window.UX && UX.play) UX.play(box, g.lottie);
      if (full) gstParticles(ov, g.fx);
      try { if (navigator.vibrate) navigator.vibrate([30, 50, 30]); } catch (e) {}
    }
    gstSound();
    var close = function () {
      ov.style.opacity = '0';
      setTimeout(function () { ov.remove(); done(); }, 380);
    };
    var t = setTimeout(close, reduce ? 2500 : 3300);
    ov.onclick = function () { clearTimeout(t); close(); };
  });
}

function gstPump() {
  if (GST.playing || !GST.queue.length) return;
  GST.playing = true;
  var it = GST.queue.shift();
  gstShow(it.g, it.who).then(function () { GST.playing = false; gstPump(); });
}
function gstEnqueue(g, who) {
  if (gstPrefs().paused) return;
  if (GST.queue.length >= 3) return; // سقف الطابور: لا إغراق
  GST.queue.push({ g: g, who: who });
  gstPump();
}

/* ---------- الاستقبال ---------- */
function gstFetchPending() {
  if (typeof REL === 'undefined' || !REL || !REL.active) return;
  fetch('/api/gesture/pending', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || !j.ok) return;
      j.items.forEach(function (it) {
        gstEnqueue({ emoji: it.emoji, lottie: it.lottie, caption: it.caption, fx: it.fx }, it.fname);
      });
    }).catch(function () {});
}
// إشارة WS «g»: تجميع الإشارات المتقاربة
function gstOnSignal() {
  clearTimeout(GST.timer);
  GST.timer = setTimeout(gstFetchPending, 300);
}

/* ---------- الإرسال ---------- */
function gstCooldown(sec) {
  GST.cd = Date.now() + sec * 1000;
  clearInterval(GST.cdT);
  GST.cdT = setInterval(function () {
    var left = Math.ceil((GST.cd - Date.now()) / 1000);
    document.querySelectorAll('#gstsheet button[data-g]').forEach(function (b) { b.disabled = left > 0; });
    var h = document.getElementById('gsthint');
    if (h) h.textContent = left > 0 ? 'يمكنك إرسال حركة أخرى بعد ' + left + ' ث' : 'اختر حركة لشريكك';
    if (left <= 0) clearInterval(GST.cdT);
  }, 500);
}

function gstSend(g) {
  if (Date.now() < GST.cd) return;
  api('gesture/send', { gid: g.id }).then(function (r) {
    var j = r.j || {};
    if (j.ok) {
      gstCooldown(30);
      gstClose();
      gstEnqueue(g, '');                 // المرسِل يرى حركته أيضاً
    } else {
      if (j.wait) gstCooldown(j.wait);
      toast('⚠️ ' + (j.error || 'تعذر إرسال الحركة'));
    }
  }, function () { toast('⚠️ تعذر الاتصال بالخادم'); });
}

function gstClose() { var s = document.getElementById('gstsheet'); if (s) s.remove(); }

function gstOpen() {
  if (document.getElementById('gstsheet')) return gstClose();
  gstLoad().then(function (list) {
    if (!list || !list.length) { toast('⚠️ تعذر تحميل الحركات'); return; }
    var s = gstEl('div', 'position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--sf);border-top:1px solid var(--bd);border-radius:18px 18px 0 0;padding:12px 12px calc(12px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 30px #0004;max-height:60%;overflow:auto');
    s.id = 'gstsheet';
    var head = gstEl('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px');
    head.appendChild(gstEl('b', 'color:var(--ac)', '💞 حركات'));
    var hint = gstEl('span', 'font-size:12px;color:var(--mu)', 'اختر حركة لشريكك'); hint.id = 'gsthint';
    var x = gstEl('button', '', '✕'); x.className = 'g'; x.onclick = gstClose;
    head.appendChild(hint); head.appendChild(x);
    var grid = gstEl('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px');
    list.forEach(function (g) {
      var b = gstEl('button', 'display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:12px');
      b.className = 'g'; b.setAttribute('data-g', g.id);
      b.appendChild(gstEl('span', 'font-size:28px', g.emoji));
      b.appendChild(gstEl('span', 'font-size:12px', g.name));
      b.onclick = function () { gstSend(g); };
      grid.appendChild(b);
    });
    s.appendChild(head); s.appendChild(grid);
    document.body.appendChild(s);
    if (Date.now() < GST.cd) gstCooldown((GST.cd - Date.now()) / 1000);
  });
}

/* ---------- الزر داخل شريط الكتابة: يظهر في غرفة الحب فقط ---------- */
function gstSyncBtn() {
  var bar = document.getElementById('bar');
  if (!bar) return;
  var inLove = false, active = false;
  try { inLove = relIsLove(room); active = !!(REL && REL.active); } catch (e) {}
  var b = document.getElementById('gstbtn');
  if (inLove && active) {
    if (!b) {
      b = document.createElement('button');
      b.className = 'g'; b.id = 'gstbtn'; b.title = 'حركات'; b.textContent = '💞';
      b.onclick = gstOpen;
      var at = document.getElementById('at');
      bar.insertBefore(b, at ? at.nextSibling : bar.firstChild);
    }
  } else {
    if (b) b.remove();
    gstClose();
  }
}

(function () {
  window.gstOnSignal = gstOnSignal;
  setInterval(gstSyncBtn, 1000);
  // احتياط إن لم يتصل WebSocket: فحص كل 20 ثانية للمرتبطين فقط والتبويب ظاهر
  setInterval(function () {
    try {
      var ws = typeof WSC !== 'undefined' && WSC.ws && WSC.ws.readyState === 1;
      if (!document.hidden && !ws) gstFetchPending();
    } catch (e) {}
  }, 20000);
})();
