#!/usr/bin/env node
/* استيفاء مستقل عن معدل الإطارات: الشاشات 90/120Hz تعطي نفس السرعة والنعومة كشاشات 60Hz.
   الاستعمال:  node patch-fps.js public/date.js
   يحفظ نسخة date.js.fps.bak ويتوقف بخطأ إن لم يجد موضعاً مطابقاً. يعمل قبل patch-head.js أو بعده. */
const fs = require('fs');
const path = process.argv[2] || 'public/date.js';
let s = fs.readFileSync(path, 'utf8');
const orig = s;
if (s.includes('function dtK(')) { console.log('مطبّق مسبقاً'); process.exit(0); }

function rep(oldS, newS) {
  const n = s.split(oldS).length - 1;
  if (n !== 1) { console.error('تعذر العثور على موضع فريد (' + n + ') للمقطع:\n' + oldS.slice(0, 120)); process.exit(1); }
  s = s.split(oldS).join(newS);
}

// دالة المساعدة: نسبة الاقتراب في إطار مدته t ثانية بمعدل r (تعطي نفس النتيجة مهما كان معدل الإطارات)
rep(`function dtClamp(v, a, b) { return v < a ? a : v > b ? b : v; }`,
    `function dtClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dtK(r, t) { return 1 - Math.exp(-r * t); }`);

// التفات الرأس: كان 0.14 لكل إطار (≈ معدل 9 عند 60Hz)
rep(`c.lk = still ? lt : (c.lk || 0) + (lt - (c.lk || 0)) * 0.14;`,
    `c.lk = still ? lt : (c.lk || 0) + (lt - (c.lk || 0)) * dtK(9, DT.dt || 0.0167);`);
rep(`DT.lt = ts; DT.ts = ts;`, `DT.lt = ts; DT.ts = ts; DT.dt = dt;`);

// حركة الـ bokeh: كانت تتحرك بخطوة ثابتة لكل إطار
rep(`var c = DT.root.querySelector('canvas'), x = c.getContext('2d'), P = [], w = 0, h = 0, still = dtReduce();`,
    `var c = DT.root.querySelector('canvas'), x = c.getContext('2d'), P = [], w = 0, h = 0, still = dtReduce(), lt = 0;`);
rep(`  function frame() {
    x.clearRect(0, 0, w, h);`, `  function frame(ts) {
    var fk = ts && lt ? Math.min(3, (ts - lt) / 16.667) : 1; lt = ts || lt;      // 1 = إطار 60Hz
    x.clearRect(0, 0, w, h);`);
rep(`if (!still) { p.x += p.vx; p.y += p.vy;`, `if (!still) { p.x += p.vx * fk; p.y += p.vy * fk;`);

// بقية الاستيفاءات كانت خطية بـ dt: تحويلها إلى أسيّة (ثابتة عند أي dt)
rep(`var k = Math.min(1, dt * 10);`, `var k = dtK(10, dt);`);
rep(`b.x += (b.tx - b.x) * Math.min(1, dt * 12); b.y += (b.ty - b.y) * Math.min(1, dt * 12);`,
    `b.x += (b.tx - b.x) * dtK(12, dt); b.y += (b.ty - b.y) * dtK(12, dt);`);
rep(`Math.min(1, kw * 9)`, `dtK(9, kw)`);
rep(`Math.min(1, kd * 6)`, `dtK(6, kd)`);
rep(`Math.min(1, kd * 7)`, `dtK(7, kd)`);
rep(`Math.min(1, kd * 4)`, `dtK(4, kd)`);
rep(`Math.min(1, kd * 5)`, `dtK(5, kd)`);
rep(`var k = Math.min(1, dt * 2.5);`, `var k = dtK(2.5, dt);`);
rep(`var k = still ? 1 : Math.min(1, dt * 2.2);`, `var k = still ? 1 : dtK(2.2, dt);`);
rep(`(still ? 1 : Math.min(1, dt * 3))`, `(still ? 1 : dtK(3, dt))`);

fs.writeFileSync(path + '.fps.bak', orig);
fs.writeFileSync(path, s);
console.log('تم. النسخة الاحتياطية:', path + '.fps.bak');
