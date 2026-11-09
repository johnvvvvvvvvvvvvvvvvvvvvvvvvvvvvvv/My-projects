/* المرحلة 2: زر الارتباط داخل الشات. الواجهة الكاملة في love.html (تُفتح في إطار فوق الشات). */
var REL = null;
var REL_TIMER = 0;

function relDraw() {
  var b = document.getElementById('relbtn'); // الزر بجانب صندوق الكتابة مخفي دائماً (الدخول من البروفايل)
  if (b) b.style.display = 'none';
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

// أزرار الارتباط داخل بروفايل العضو: تتغيّر حسب الحالة (مثل الصداقة)
function relDo(path, id, okMsg) {
  api('rel/' + path, { id: id }).then(function (r) {
    var o = r.j || {};
    if (o.ok) { relToast(okMsg); relSync(1); }
    else relToast('⚠️ ' + (o.error || 'تعذر التنفيذ'));
  }, function () { relToast('⚠️ تعذر الاتصال بالخادم'); });
}

function relMenu(t, add) {
  try {
    if (typeof me === 'undefined' || !me || me.role === 'visitor' || !t || t.id === me.id || t.role === 'visitor') return;
    var R = REL || {}, a = R.active;
    if (a) { // أنا مرتبط: الأزرار تظهر في بروفايل شريكي فقط
      if (a.partner.id !== t.id) return;
      add('💔 إنهاء الارتباط', function () { if (confirm('إنهاء الارتباط مع ' + t.name + '؟')) relDo('end', a.id, 'تم إنهاء الارتباط'); });
      add('💞 غرفة الحب', function () { relGoRoom(); });
      add('📋 نافذة الارتباط', function () { relOpen(); });
      return;
    }
    var pick = function (l) { return (l || []).filter(function (x) { return x.partner.id === t.id; })[0]; };
    var inc = pick(R.incoming), out = pick(R.outgoing);
    if (inc) {
      add('💞 قبول طلب الارتباط', function () { relDo('accept', inc.id, '💞 أصبحتما مرتبطين'); });
      add('✖️ رفض طلب الارتباط', function () { relDo('decline', inc.id, 'تم الرفض'); });
    } else if (out) {
      add('⏳ إلغاء طلب الارتباط', function () { relDo('decline', out.id, 'تم إلغاء الطلب'); });
    } else {
      add('💞 طلب ارتباط', function () { relAsk(t); });
    }
  } catch (e) {}
}

function relToast(msg, key) {
  if (window.UX && UX.toast) UX.toast(msg, key);
  else if (typeof toast === 'function') toast(msg);
}

// «ذكرياتنا»: حفظ رسالة من غرفة الحب (تُنسخ نصاً، فتبقى بعد حذف رسائل الغرفة القديمة)
function relMemSave(m) {
  if (!m || !m.sid) { relToast('⏳ انتظر اكتمال الإرسال'); return; }
  api('mem/save', { id: m.sid }).then(function (r) {
    var j = r.j || {};
    if (j.ok) relToast(j.dup ? 'هذه الرسالة محفوظة من قبل' : '💞 حُفظت في ذكرياتنا (يراها شريكك أيضاً)', j.dup ? null : 'hearts');
    else relToast('⚠️ ' + (j.error || 'تعذر الحفظ'));
  }, function () { relToast('⚠️ تعذر الاتصال بالخادم'); });
}

// الإيماءات الجديدة (emotes.js): تتجاهل بصمت إن لم يكن المحرك محمّلاً
function relEmo(ev) { try { if (window.EMO) EMO.fire(ev); } catch (e) {} }

function relNotify(p, n) {
  if (!p.active && n.active) { relToast('💞 أصبحتما مرتبطين مع ' + n.active.partner.name, 'hearts'); relEmo('relationship_started'); }
  else if (p.active && !n.active) relToast('انتهى الارتباط');
  else if (n.incoming.length > p.incoming.length) { relToast('💞 وصلك طلب ارتباط من ' + n.incoming[0].partner.name, 'heart-face'); relEmo('request_received'); }
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

function relOpen(tab) {
  if (document.getElementById('relov')) return;
  var d = document.createElement('div');
  d.id = 'relov';
  d.style.cssText = 'position:fixed;inset:0;z-index:35;background:#0008;display:flex;align-items:center;justify-content:center';
  var f = document.createElement('iframe');
  f.src = '/love.html' + (tab === 'date' ? '#date' : tab === 'mem' ? '#mem' : '');
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
    try { if (typeof me !== 'undefined' && me) { clearInterval(first); relDraw(); relSync(1); } } catch (e) {}
  }, 1000);
  window.relAsk = relAsk; window.relOnSignal = relOnSignal; window.relClose = relClose; window.relGoRoom = relGoRoom; window.relMenu = relMenu; window.relMemSave = relMemSave;

  // ---- غرفة الحب: الشكل والتنقل ----
  var st = document.createElement('style');
  st.textContent = 'body.lovemode #msgs{background:radial-gradient(circle at 15% 10%,#fb718533,transparent 55%),radial-gradient(circle at 85% 90%,#7c3aed26,transparent 55%)}body.lovemode #rb{color:#f472b6}#lvstrip{display:none;gap:6px;overflow-x:auto;padding:6px 8px;background:var(--sf);border-top:1px solid var(--bd)}#lvstrip button{white-space:nowrap;padding:5px 10px;font-size:13px}';
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
        relEmo('enter_love_room');
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


  // ---- شريط أزرار غرفة الحب (فوق شريط الكتابة، داخل الغرفة فقط) ----
  var HQ = ['ما أكثر شيء أعجبك فيّ أول مرة؟', 'ما الذي يزعجك ولا تقوله لي؟', 'ما حلمك الذي لم تخبر به أحداً؟', 'متى شعرت أنك تحبني فعلاً؟', 'ما أجمل ذكرى بيننا؟', 'ما الذي تتمنى أن نفعله معاً؟'];
  var bar0 = document.getElementById('bar');
  if (bar0 && bar0.parentNode) {
    var strip = document.createElement('div');
    strip.id = 'lvstrip';
    [['q', '🎲 سؤال صراحة'], ['h', '💭 صراحة'], ['m', '❤️ ذكرى'], ['g', '💞 حركات'], ['s', '📌 احفظ آخر رسالة'], ['d', '📅 موعد'], ['b', '📖 ذكرياتنا']].forEach(function (x) {
      var b = document.createElement('button');
      b.className = 'g'; b.dataset.a = x[0]; b.textContent = x[1];
      strip.appendChild(b);
    });
    bar0.parentNode.insertBefore(strip, bar0);
    strip.onclick = function (e) {
      var a = e.target.dataset && e.target.dataset.a, t = document.getElementById('txt');
      if (!a || !t) return;
      if (a === 'q') { t.value = '💭 ' + HQ[Math.floor(Math.random() * HQ.length)]; t.focus(); }
      else if (a === 'h' || a === 'm') { t.value = (a === 'h' ? '💭 ' : '❤️ ') + t.value.replace(/^(💭|❤️)\s*/, ''); t.focus(); }
      else if (a === 'g') { if (typeof gstOpen === 'function') gstOpen(); }
      else if (a === 's') {
        var l = (typeof hist !== 'undefined' && hist[room] || []).filter(function (m) { return !m.s && m.sid && !m.poll; });
        if (!l.length) { relToast('لا توجد رسالة لحفظها'); return; }
        relMemSave(l[l.length - 1]);
      }
      else if (a === 'd') relOpen('date');
      else if (a === 'b') relOpen('mem');
    };
    setInterval(function () {
      try { strip.style.display = relIsLove(room) && REL && REL.active ? 'flex' : 'none'; } catch (e) {}
    }, 500);
  }

  // داخل غرفة الحب: فحص أسرع (10 ثوانٍ) لاكتشاف إنهاء الشريك للارتباط
  setInterval(function () { try { if (!document.hidden && relIsLove(room)) relSync(); } catch (e) {} }, 10000);
})();
