/* نافذة «البلاغ الآمن» داخل الارتباط. تعمل في الشات (rel.js وdate.js) وفي نافذة الارتباط (love.html).
   relReport(kind, id, opts): kind = msg | date | memory | partner
   opts.relId: رقم العلاقة لعرض «إنهاء الارتباط» بعد البلاغ، opts.onEnd: يُنفَّذ بعد إنهاء الارتباط.
   الخادم يلتقط الدليل بنفسه (src/lovereport.js)، فلا يُرسل من هنا إلا النوع والرقم والسبب وملاحظة قصيرة. */
(function () {
  var FALLBACK = [
    { k: 'abuse', l: 'إساءة أو شتم' }, { k: 'harass', l: 'تحرش أو ضغط' }, { k: 'threat', l: 'تهديد أو ابتزاز' },
    { k: 'sexual', l: 'محتوى جنسي غير مرغوب' }, { k: 'fake', l: 'انتحال أو معلومات كاذبة' }, { k: 'other', l: 'سبب آخر' }
  ];
  var WHAT = { msg: 'هذه الرسالة', date: 'هذا الموعد', memory: 'هذه الملاحظة', partner: 'شريكك' };
  var open = false;

  function post(path, body) {
    return fetch('/api/' + path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }, function () { return { s: r.status, j: {} }; }); });
  }
  function get(path) {
    return fetch('/api/' + path, { credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }, function () { return { s: r.status, j: {} }; }); });
  }
  function say(m, k) {
    try { if (window.UX && UX.toast) { UX.toast(m, k || null); return; } } catch (e) {}
    try { if (typeof toast === 'function') { toast(m); return; } } catch (e) {}
    alert(m);
  }
  function node(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function relReport(kind, id, opts) {
    if (open) return;
    opts = opts || {};
    open = true;

    var ov = node('div', 'position:fixed;inset:0;z-index:70;background:#000a;display:flex;align-items:center;justify-content:center;padding:12px');
    ov.setAttribute('dir', 'rtl');
    var box = node('div', 'width:min(420px,100%);max-height:100%;overflow:auto;background:var(--sf,#fff);color:var(--tx,#1d2330);border:1px solid var(--bd,#ddd);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;font:inherit');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    box.appendChild(node('b', 'font-size:17px', '🚩 إبلاغ عن ' + (WHAT[kind] || 'شريكك')));
    box.appendChild(node('div', 'font-size:13px;color:var(--mu,#566070);line-height:1.6',
      'سيصل البلاغ إلى الإدارة. نص ' + (kind === 'partner' ? 'آخر رسائل شريكك في غرفة الحب' : kind === 'date' ? 'ما كتبه شريكك في هذا الموعد' : 'المحتوى المبلَّغ عنه') +
      ' لا يراه إلا المشرفون الكبار، ولا يراه شريكك. لا نبلغ عن شخص لمجرد الخلاف: اختر السبب الأقرب.'));

    var list = node('div', 'display:flex;flex-direction:column;gap:4px');
    var chosen = '';
    var noteLab = node('small', 'color:var(--mu,#566070)', 'ملاحظة (اختيارية، حتى 100 حرف)');
    var note = node('input', 'font:inherit;width:100%;border:1px solid var(--bd,#ddd);border-radius:10px;padding:9px;background:var(--bg,#f4f1ec);color:var(--tx,#1d2330)');
    note.type = 'text'; note.maxLength = 100;
    var err = node('small', 'color:#dc2626;min-height:1em');

    function fill(reasons) {
      list.textContent = '';
      reasons.forEach(function (r, i) {
        var lab = node('label', 'display:flex;align-items:center;gap:8px;padding:7px 4px;cursor:pointer');
        var rd = document.createElement('input');
        rd.type = 'radio'; rd.name = 'lrwhy'; rd.value = r.k; rd.style.cssText = 'width:20px;height:20px;accent-color:var(--ac,#0f766e)';
        rd.onchange = function () { chosen = r.k; err.textContent = ''; note.placeholder = r.k === 'other' ? 'اكتب السبب باختصار (مطلوب)' : ''; };
        lab.appendChild(rd); lab.appendChild(node('span', '', r.l));
        list.appendChild(lab);
        if (i === 0) setTimeout(function () { try { rd.focus(); } catch (e) {} }, 50);
      });
    }
    fill(FALLBACK);
    get('rel/report/options').then(function (r) { // النصوص من الخادم إن توفرت
      if (open && r.j && r.j.ok && r.j.reasons && r.j.reasons.length && !chosen) fill(r.j.reasons);
    }, function () {});

    var row = node('div', 'display:flex;gap:8px;margin-top:4px');
    var btnCss = 'font:inherit;cursor:pointer;border-radius:10px;padding:9px 14px;min-height:40px;';
    var ok = node('button', btnCss + 'flex:1;border:0;background:#dc2626;color:#fff', 'إرسال البلاغ');
    var no = node('button', btnCss + 'border:1px solid var(--bd,#ddd);background:transparent;color:var(--tx,#1d2330)', 'إلغاء');

    function close() { open = false; document.removeEventListener('keydown', onKey); ov.remove(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    no.onclick = close;
    ov.onclick = function (e) { if (e.target === ov) close(); };

    ok.onclick = function () {
      if (!chosen) { err.textContent = 'اختر سبب البلاغ'; return; }
      if (chosen === 'other' && !note.value.trim()) { err.textContent = 'اكتب السبب باختصار'; note.focus(); return; }
      ok.disabled = true; no.disabled = true; ok.style.opacity = '.6';
      post('rel/report', { kind: kind, id: id || 0, why: chosen, note: note.value.trim() }).then(function (r) {
        var j = r.j || {};
        if (!j.ok) {
          ok.disabled = false; no.disabled = false; ok.style.opacity = '1';
          err.textContent = j.error || 'تعذر إرسال البلاغ';
          return;
        }
        close();
        say(j.dup ? 'بلاغك عن هذا وصل للإدارة سابقاً' : '🚩 وصل بلاغك للإدارة');
        var relId = opts.relId || (window.REL && window.REL.active && window.REL.active.id) || 0;
        if (!j.dup && relId && confirm('هل تريد أيضاً إنهاء الارتباط الآن؟')) {
          post('rel/end', { id: relId }).then(function (x) {
            if (x.j && x.j.ok) {
              say('تم إنهاء الارتباط');
              try { if (opts.onEnd) opts.onEnd(); else if (typeof window.relSync === 'function') window.relSync(1); } catch (e) {}
            } else say('⚠️ ' + ((x.j && x.j.error) || 'تعذر إنهاء الارتباط'));
          }, function () { say('⚠️ تعذر الاتصال بالخادم'); });
        }
      }, function () {
        ok.disabled = false; no.disabled = false; ok.style.opacity = '1';
        err.textContent = 'تعذر الاتصال بالخادم';
      });
    };

    row.appendChild(ok); row.appendChild(no);
    [list, noteLab, note, err, row].forEach(function (x) { box.appendChild(x); });
    ov.appendChild(box);
    document.body.appendChild(ov);
  }

  window.relReport = relReport;
})();
