/* المرحلة 2: زر الارتباط داخل الشات. الواجهة الكاملة في love.html (تُفتح في إطار فوق الشات). */
var REL = null;
var REL_TIMER = 0;

function relDraw() {
  var b = document.getElementById('relbtn');
  if (!b) return;
  var n = REL && REL.incoming ? REL.incoming.length : 0;
  b.style.display = REL && (REL.active || n) ? '' : 'none'; // يظهر لمن لديه علاقة أو طلب وارد
  b.textContent = '💞' + (n ? ' ' + n : '');
  relRoomSync();
}

/* المرحلة 3: غرفة الحب */
function relIsLove(r) { return typeof r === 'string' && r.indexOf('love:') === 0; }

function relLeave(msg) {
  var s = document.getElementById('room');
  if (!s) return;
  s.value = ROOMS[0];
  if (s.onchange) s.onchange();
  if (msg) relToast(msg);
}

// يضيف خيار «غرفة الحب» لمن لديه علاقة نشطة ويزيله بعد الانتهاء (ويُخرج من كان داخلها)
function relRoomSync() {
  var s = document.getElementById('room');
  if (!s) return;
  var want = REL && REL.active ? REL.active.room : null;
  var found = null;
  for (var i = s.options.length - 1; i >= 0; i--) {
    var o = s.options[i];
    if (relIsLove(o.value)) { if (o.value === want) found = o; else s.remove(i); }
  }
  if (want && !found) {
    var op = document.createElement('option');
    op.value = want;
    op.textContent = '💞 غرفة الحب';
    s.appendChild(op);
  }
  var cur = typeof room !== 'undefined' ? room : '';
  if (relIsLove(cur) && cur !== want) relLeave('انتهى الارتباط، عدت إلى الغرفة العامة');
}

function relGoRoom() {
  if (!REL || !REL.active || !REL.active.room) return;
  relClose();
  var s = document.getElementById('room');
  if (!s) return;
  relRoomSync();
  s.value = REL.active.room;
  if (s.onchange) s.onchange();
}

function relToast(msg, key) {
  if (window.UX && UX.toast) UX.toast(msg, key);
  else if (typeof toast === 'function') toast(msg);
}

function relNotify(p, n) {
  if (!p.active && n.active) relToast('💞 أصبحتما مرتبطين مع ' + n.active.partner.name, 'hearts');
  else if (p.active && !n.active) relToast('انتهى الارتباط');
  else if (n.incoming.length > p.incoming.length) relToast('💞 وصلك طلب ارتباط من ' + n.incoming[0].partner.name, 'heart-face');
}

// quiet=1: بلا إشعارات انتقال (التحميل الأول، أو بعد إجراء قام به المستخدم نفسه)
function relSync(quiet) {
  try { if (typeof me === 'undefined' || !me || me.role === 'visitor') return; } catch (e) { return; }
  return fetch('/api/rel/status', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || !j.ok) return;
      var p = REL;
      REL = j;
      relDraw();
      if (p && !quiet) relNotify(p, j);
    })
    .catch(function () {});
}

// إشارة WebSocket «r»: تجميع الإشارات المتقاربة في طلب واحد
function relOnSignal() {
  clearTimeout(REL_TIMER);
  REL_TIMER = setTimeout(function () { relSync(); }, 400);
}

function relOpen() {
  if (document.getElementById('relov')) return;
  var d = document.createElement('div');
  d.id = 'relov';
  d.style.cssText = 'position:fixed;inset:0;z-index:35;background:#0008;display:flex;align-items:center;justify-content:center';
  var f = document.createElement('iframe');
  f.src = '/love.html';
  f.style.cssText = 'width:min(480px,100%);height:min(640px,100%);border:0;border-radius:14px;background:var(--bg)';
  d.appendChild(f);
  d.onclick = function (e) { if (e.target === d) relClose(); };
  document.body.appendChild(d);
}

function relClose() {
  var d = document.getElementById('relov');
  if (d) d.remove();
  relSync(1);
}

// من قائمة العضو: إرسال طلب ارتباط
function relAsk(t) {
  if (!t || !confirm('إرسال طلب ارتباط إلى ' + t.name + '؟')) return;
  api('rel/request', { to: t.id }).then(function (r) {
    var j = r.j || {};
    if (j.ok) {
      toast(j.status === 'accepted' ? '💞 أصبحتما مرتبطين' : '💞 تم إرسال طلب الارتباط');
      relSync(1);
    } else toast('⚠️ ' + (j.error || 'تعذر إرسال الطلب'));
  }, function () { toast('⚠️ تعذر الاتصال بالخادم'); });
}

(function () {
  var b = document.getElementById('relbtn');
  if (b) b.onclick = relOpen;
  // احتياط إن لم يتصل WebSocket: مزامنة هادئة كل دقيقة والتبويب ظاهر
  setInterval(function () { if (!document.hidden) relSync(); }, 60000);
  // أول مزامنة هادئة بمجرد دخول المستخدم
  var first = setInterval(function () {
    try { if (typeof me !== 'undefined' && me) { clearInterval(first); relSync(1); } } catch (e) {}
  }, 1000);
  window.relAsk = relAsk; window.relOnSignal = relOnSignal; window.relClose = relClose; window.relGoRoom = relGoRoom;

  // ---- غرفة الحب: الشكل والتنقل ----
  var st = document.createElement('style');
  st.textContent = 'body.lovemode #msgs{background:linear-gradient(160deg,rgba(236,72,153,.14),rgba(139,92,246,.16))}body.lovemode #rb{color:#f472b6}';
  document.head.appendChild(st);

  var sel = document.getElementById('room');
  if (sel && sel.onchange) {
    var oc = sel.onchange;
    sel.onchange = function () {
      var out = oc.apply(this, arguments);
      var lv = relIsLove(this.value);
      document.body.classList.toggle('lovemode', lv);
      if (lv) {
        var rb = document.getElementById('rb');
        if (rb) rb.textContent = '💞 غرفة الحب ▾';
        try { if (NET && NET.sys) NET.sys = '💞 دخلت غرفة الحب'; } catch (e) {}
      }
      return out;
    };
  }

  if (typeof openWheel === 'function') {
    var ow = openWheel;
    openWheel = function () {
      ow.apply(this, arguments);
      try {
        if (!REL || !REL.active) return;
        var l = document.getElementById('wl'), w = document.getElementById('wh');
        if (!l || !w) return;
        var d = document.createElement('div');
        d.className = 'wi' + (relIsLove(room) ? ' on' : '');
        d.textContent = '💞 غرفة الحب';
        d.onclick = function () { w.classList.remove('open'); if (!relIsLove(room)) relGoRoom(); };
        l.appendChild(d);
      } catch (e) {}
    };
  }

  // داخل غرفة الحب: فحص أسرع (10 ثوانٍ) لاكتشاف إنهاء الشريك للارتباط
  setInterval(function () { try { if (!document.hidden && relIsLove(room)) relSync(); } catch (e) {} }, 10000);
})();
