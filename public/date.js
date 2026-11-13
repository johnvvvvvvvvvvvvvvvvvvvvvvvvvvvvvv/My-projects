#!/usr/bin/env node
/* حركة أحيّ: ركبة في المشي + زنبرك للرأس (يتأخر عن الجسم عند البدء ويتجاوز قليلاً عند التوقف ويميل عكس الحركة).
   الاستعمال:  node patch-motion.js public/date.js
   جزء الرأس يتطلب أن يكون patch-head.js مطبّقاً (يعتمد على dtHeadXf). يحفظ نسخة date.js.motion.bak. */
const fs = require('fs');
const path = process.argv[2] || 'public/date.js';
let s = fs.readFileSync(path, 'utf8');
const orig = s;

function rep(oldS, newS) {
  const n = s.split(oldS).length - 1;
  if (n !== 1) { console.error('تعذر العثور على موضع فريد (' + n + ') للمقطع:\n' + oldS.slice(0, 120)); process.exit(1); }
  s = s.split(oldS).join(newS);
}

/* ===== 1) ركبة: الساق قطعتان (فخذ وساق) والركبة ترتفع عند رفع القدم ===== */
if (s.includes('var lf = q > 0')) {
  console.log('الركبة مطبّقة مسبقاً، تخطي');
} else {
  rep(`    g.beginPath(); g.moveTo(hx, hipY); g.lineTo(ex, ey); g.stroke();`,
      `    var lf = q > 0 ? q : 0, kx = hx + q * s * 0.11, ky = (hipY + ey) / 2 - lf * s * 0.05;     // الركبة ترتفع وتتقدم مع رفع القدم
    g.beginPath(); g.moveTo(hx, hipY); g.lineTo(kx, ky); g.stroke();
    g.lineWidth = s * 0.17; g.beginPath(); g.moveTo(kx, ky); g.lineTo(ex, ey); g.stroke();`);
  console.log('الركبة طُبّقت');
}

/* ===== 2) زنبرك الرأس ===== */
if (s.includes('dtHeadXf0')) {
  console.log('زنبرك الرأس مطبّق مسبقاً، تخطي');
} else if (!s.includes('function dtHeadXf(role, ts) {')) {
  console.warn('تحذير: dtHeadXf غير موجودة. شغّل patch-head.js أولاً ثم أعد تشغيل هذا السكربت (تخطيت زنبرك الرأس).');
} else {
  rep(`function dtHeadXf(role, ts) {`, `function dtHeadXf0(role, ts) {`);
  rep(`function dtLoop(ts) {`, `/* زنبرك الرأس: الرأس يتأخر عن الجسم عند التحرك (يُحقن جزء من إزاحة الجسم كل إطار ثم يعيده الزنبرك)،
   فيميل عكس اتجاه المشي، ويتجاوز موضعه قليلاً عند التوقف. المعاملات: K صلابة، D تخميد (≈0.5 فيتجاوز قليلاً) */
function dtHeadXf(role, ts) {
  var T = dtHeadXf0(role, ts);
  if (DT.still) return T;
  var c = DT.ch[role], q = c.hsp || (c.hsp = { x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0, px: null, py: null });
  var dt = Math.min(0.033, DT.dt || 0.0167), s = DT.s, W = DT.sw, H = DT.sh;
  var cx0 = c.x == null ? 0.5 : c.x, cy0 = c.y == null ? 0.7 : c.y, K = 170, D = 13, i, h = dt / 2;
  if (q.px != null) {
    var dxb = dtClamp((cx0 - q.px) * W, -s * 0.2, s * 0.2), dyb = dtClamp((cy0 - q.py) * H, -s * 0.2, s * 0.2);
    q.x -= dxb * 0.5; q.y -= dyb * 0.3; q.r -= dxb / s * 14;
  }
  q.px = cx0; q.py = cy0;
  for (i = 0; i < 2; i++) {
    q.vx += (-K * q.x - D * q.vx) * h; q.x += q.vx * h;
    q.vy += (-K * q.y - D * q.vy) * h; q.y += q.vy * h;
    q.vr += (-K * q.r - D * q.vr) * h; q.r += q.vr * h;
  }
  q.x = dtClamp(q.x, -s * 0.12, s * 0.12); q.y = dtClamp(q.y, -s * 0.08, s * 0.08); q.r = dtClamp(q.r, -8, 8);
  return [T[0] + q.x, T[1] + q.y, T[2] + q.r];
}

function dtLoop(ts) {`);
  console.log('زنبرك الرأس طُبّق');
}

if (s !== orig) {
  fs.writeFileSync(path + '.motion.bak', orig);
  fs.writeFileSync(path, s);
  console.log('تم. النسخة الاحتياطية:', path + '.motion.bak');
}
