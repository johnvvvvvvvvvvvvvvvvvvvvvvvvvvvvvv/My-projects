/* المرحلة 3: تبويب «الإيماءات» داخل الإعدادات.
   يعتمد على emotes.js (يجب تحميله قبله) وعلى setView وعنصر #side في chat.html.
   لا يعدّل chat.html: يغلّف setView بالنمط نفسه الذي يستعمله chat.html (var _sv=setView; setView=function...)
   ويضيف زراً في شريط تبويبات الإعدادات، وعند الضغط عليه يرسم القسم قبل زر تسجيل الخروج.
   الأزرار: بلا class = مفعّل، وبـ class="g" = غير مفعّل (كبقية الإعدادات). */
(function () {
  'use strict';

  var TAB = 'emo';
  var WHERE = [['corner', 'زاوية'], ['center', 'وسط'], ['top', 'أعلى'], ['random', 'عشوائي']];

  function h(t, cls, txt) {
    var e = document.createElement(t);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function btn(label, active, fn) {
    var b = h('button', active ? '' : 'g', label);
    b.onclick = fn;
    return b;
  }
  function card(root, title) {
    var c = h('div', 'nw');
    if (title) c.appendChild(h('b', '', title));
    root.appendChild(c);
    return c;
  }

  function draw(root) {
    var again = function () { draw(root); };
    root.textContent = '';

    var c = card(root, '💞 الإيماءات');
    var off = EMO.isOff();
    c.appendChild(btn('الإيماءات: ' + (off ? 'متوقفة' : 'مفعّلة'), !off, function () { EMO.setOff(!off); again(); }));
    c.appendChild(h('small', 'mu', 'تظهر تلقائياً عند أحداث معينة. إعداداتك هنا محفوظة في هذا المتصفح فقط.'));

    var list = EMO.list();
    if (!list.length) {
      c.appendChild(h('small', 'mu', 'لا توجد إيماءات متاحة الآن (تعذّر قراءة ملف الحزم).'));
      return;
    }

    list.forEach(function (t) {
      var k = card(root, t.label);

      var row = h('div', 'pk');
      row.appendChild(btn(t.on ? 'مفعّلة' : 'متوقفة', t.on, function () { EMO.setOn(t.id, !t.on); again(); }));
      row.appendChild(btn('▶ معاينة', false, function () { EMO.test(t.id); }));
      k.appendChild(row);

      k.appendChild(h('small', 'mu', 'مكان الظهور'));
      var wr = h('div', 'pk');
      WHERE.forEach(function (w) {
        wr.appendChild(btn(w[1], t.where === w[0], function () { EMO.setWhere(t.id, w[0]); again(); }));
      });
      k.appendChild(wr);

      var emo = t.items.map(function (x) { return x.emoji; }).join(' ');
      var cd = t.cooldown ? ('مهلة بين مرة وأخرى: ' + t.cooldown + ' ث') : 'بلا مهلة';
      k.appendChild(h('small', 'mu', emo + ' · ' + cd));
    });

    var f = card(root, 'الحزم');
    EMO.packs().forEach(function (p) {
      f.appendChild(h('small', 'mu', p.name + ' · ' + p.count + ' إيماءة'));
    });
    var rs = h('button', 'g', '↩️ إعادة الإعدادات الافتراضية');
    rs.onclick = function () {
      if (confirm('إعادة إعدادات الإيماءات إلى الافتراضي؟')) { EMO.reset(); again(); }
    };
    f.appendChild(rs);
  }

  function render(root) {
    root.textContent = '';
    if (typeof EMO === 'undefined') {
      root.appendChild(h('small', 'mu', 'تعذّر تحميل محرك الإيماءات.'));
      return;
    }
    root.appendChild(h('small', 'mu', 'جارٍ التحميل...'));
    EMO.ready().then(function () { if (root.isConnected) draw(root); });
  }

  function decorate(sc) {
    var s = document.getElementById('side');
    var tb = s && s.querySelector('.tbs');
    if (!tb) return;
    var on = sc === TAB;
    var b = h('button', on ? '' : 'g', '💞 الإيماءات');
    b.onclick = function () { setView(TAB); };
    tb.appendChild(b);
    if (!on) return;
    // setView لا يعرف هذا التبويب فلا يرسم له قسماً؛ نضع قسمنا قبل زر تسجيل الخروج (آخر عنصر)
    var root = h('div');
    root.id = 'emoSet';
    var last = s.lastElementChild;
    if (last && last.tagName === 'BUTTON') s.insertBefore(root, last); else s.appendChild(root);
    render(root);
  }

  if (typeof setView === 'function') {
    var prev = setView;
    setView = function (sc) {
      prev(sc);
      try { decorate(sc); } catch (e) {}
    };
  }

  window.EMO_UI = { render: render };
})();
