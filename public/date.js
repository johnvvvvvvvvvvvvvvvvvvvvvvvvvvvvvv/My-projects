#!/usr/bin/env node
/* ينقل الرأس إلى canvas الجسم ثم يضيف التخزين المؤقت (التعديلان 1 و2 معاً).
   الاستعمال:  node patch-head.js public/date.js
   يحفظ نسخة date.js.bak، ويتخطى أي جزء طُبّق سابقاً، ويتوقف بخطأ إن لم يجد موضعاً مطابقاً. */
const fs = require('fs');
const path = process.argv[2] || 'public/date.js';
let s = fs.readFileSync(path, 'utf8');
const orig = s;

function rep(oldS, newS) {
  const n = s.split(oldS).length - 1;
  if (n !== 1) { console.error('تعذر العثور على موضع فريد (' + n + ') للمقطع:\n' + oldS.slice(0, 120)); process.exit(1); }
  s = s.split(oldS).join(newS);
}

/* ===== الجزء 1: الرأس على canvas الجسم ===== */
if (s.includes('dtHeadXf')) {
  console.log('الجزء 1 مطبّق مسبقاً، تخطي');
} else {
  rep(`  var av = dtNode('div', 'position:relative;width:100%;height:100%;transform-origin:50% 85%;filter:drop-shadow(0 5px 6px #0005)');
  av.className = 'dtav';
  av.appendChild(dtNode('canvas', 'position:absolute;inset:0;width:100%;height:100%'));
  c.appendChild(bub); c.appendChild(av);`, `  c.appendChild(bub);`);

  rep(`  var el = DT.els && DT.els[role], cv = el && el.firstChild.nextSibling.firstChild;
  if (!cv || !cv.getContext || !DT.look) return;`, `  var cv = DT.hc && DT.hc[role];
  if (!cv || !DT.look) return;`);

  const a = s.indexOf("  cp.style.opacity = p.here ? '1' : '0.38';");
  const b = a < 0 ? -1 : s.indexOf('av.style.transform', a);
  const e = b < 0 ? -1 : s.indexOf('\n  });\n', b);
  if (a < 0 || b < 0 || e < 0) { console.error('تعذر العثور على كتلة تحريك الرأس في dtLoop'); process.exit(1); }
  s = s.slice(0, a) + s.slice(e + '\n  });\n'.length);

  rep('function dtLoop(ts) {', `/* إزاحة الرأس وميله: [x, y, درجات] حول نقطة الارتكاز عند الرقبة (نفس حركة التنفس والمشي والجلوس والرشفة) */
function dtHeadXf(role, ts) {
  var c = DT.ch[role], sit = c.sit || 0, ph = role === 'p' ? 2.1 : 0;
  var wa = DT.still || sit > 0.02 ? 0 : (c.wa || 0), ia = DT.still ? 0 : 1 - (c.wa || 0);
  var by2 = -wa * Math.abs(Math.sin(ts / 110)) * DT.sh * 0.018, sd2 = dtSitDy(c, DT.s);
  var sx2 = sit * (c.sdir || 0) * DT.s * 0.10, rt = sit * (c.sdir || 0) * 5;
  if (!DT.still) {
    by2 -= Math.sin(ts / 1500 + ph) * DT.s * 0.012 * ia;
    rt += (Math.sin(ts / 2300 + ph) * 1.6 + Math.sin(ts / 877 + ph) * 0.6) * ia;
    if (dtDinner() && DT.gfx) {
      var gid = dtGlId(role), gf = DT.gfx[gid], now2 = Date.now(), ef = DT.ef && DT.ef[gid], eid;
      if (gf && now2 < gf.until && gf.k === 'sip') {
        var e2 = dtEnv((now2 - gf.t0) / (gf.until - gf.t0), 0.3, 0.62);
        by2 -= e2 * DT.s * 0.025; rt -= (c.gk ? c.gk.side : 1) * e2 * 4;
      }
      if (ef && now2 < ef.until && ef.k === 'bite') by2 += Math.sin(Math.PI * dtEase((now2 - ef.t0) / (ef.until - ef.t0))) * DT.s * 0.025;
      for (eid in DT.ef) {
        var fe = DT.ef[eid];
        if (fe.k === 'feed' && fe.to === gid && now2 < fe.until) by2 += Math.sin(Math.PI * dtEase((now2 - fe.t0) / (fe.until - fe.t0))) * DT.s * 0.02;
      }
    }
  }
  return [sx2, by2 + sd2, rt];
}

function dtLoop(ts) {`);

  rep(`  dtBodyDraw(ts);
  if (!DT.simple) { dtHeadDraw('m', ts); dtHeadDraw('p', ts); }`, `  if (!DT.simple) { dtHeadDraw('m', ts); dtHeadDraw('p', ts); }
  dtBodyDraw(ts);`);

  rep(`  order.forEach(function (z) { dtFigure(g, z[0], z[1], ts, z[2], z[3]); });`, `  order.forEach(function (z) {
    dtFigure(g, z[0], z[1], ts, z[2], z[3]);
    var role = z[0] === m ? 'm' : 'p', hc = DT.hc && DT.hc[role];
    if (!hc || !hc.width) return;
    var HS = s * 0.92, HC = HS * 1.16, c0 = z[0], xf = dtHeadXf(role, ts);
    var hx = (c0.x == null ? 0.5 : c0.x) * W, hy = (c0.y == null ? 0.7 : c0.y) * H;
    g.save();
    g.globalAlpha = z[2] ? 1 : 0.38;
    g.translate(hx - s * 0.46 + HS / 2 + xf[0], hy - s * 2.2 + HC * 0.85 + xf[1]);
    g.rotate(xf[2] * Math.PI / 180);
    g.drawImage(hc, -HS / 2, -HC * 0.85, HS, HC);
    g.restore();
  });`);

  rep(`DT.look = { m: dtLookOf(mine.id), p: dtLookOf(part.id) }; DT.tk = {};`, `DT.look = { m: dtLookOf(mine.id), p: dtLookOf(part.id) }; DT.tk = {};
  DT.hc = { m: document.createElement('canvas'), p: document.createElement('canvas') };`);
  rep(`DT.els = {}; DT.ob = {}; DT.ch = null; DT.drag = false;`, `DT.els = {}; DT.ob = {}; DT.ch = null; DT.drag = false; DT.hc = null;`);
  console.log('الجزء 1 طُبّق');
}

/* ===== الجزء 2: تخزين الرأس مؤقتاً ===== */
if (s.includes('cv._k')) {
  console.log('الجزء 2 مطبّق مسبقاً، تخطي');
} else {
  rep(`var g = cv.getContext('2d'); g.setTransform(pw / S, 0, 0, ph / CH, 0, 0); g.clearRect(0, 0, S, CH);`, `var g = cv.getContext('2d');`);
  rep(`  var E = dtExpr(role, ts), hs = L.hair.s, hc = L.hair.c, skin = L.skin;`, `  var E = dtExpr(role, ts), hs = L.hair.s, hc = L.hair.c, skin = L.skin;
  var key = pw + 'x' + ph + '|' + Math.round(lk * 100) + '|' + bl + '|' + tw + '|' + E.mouth + '|' + Math.round(E.blush * 40) + '|' + Math.round(E.brow * 20) + '|' + (E.mouth === 'talk' ? Math.floor(ts / 40) : 0) + '|' + hs + hc + skin + L.eyes.s + L.eyes.c + L.brow;
  if (cv._k === key) return;                    // لا تغيّر مرئي: أعد استعمال الرسم السابق
  cv._k = key;
  g.setTransform(pw / S, 0, 0, ph / CH, 0, 0); g.clearRect(0, 0, S, CH);`);
  console.log('الجزء 2 طُبّق');
}

if (s !== orig) {
  fs.writeFileSync(path + '.bak', orig);
  fs.writeFileSync(path, s);
  console.log('تم. النسخة الاحتياطية:', path + '.bak');
}
