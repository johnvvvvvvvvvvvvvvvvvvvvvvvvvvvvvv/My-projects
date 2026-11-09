// src/lovereport.js
// البلاغ الآمن داخل الارتباط: غرفة الحب، المواعيد، ذكرياتنا.
// لا يوجد نظام بلاغات جديد: البلاغ يُكتب في user_reports نفسه فيصل إلى شاشة الإشراف الحالية (ctx = 'love').
// الأدلة (نص الرسالة وآخر رسائل الطرف الآخر) يلتقطها الخادم من قاعدة البيانات، ولا يثق بأي نص يرسله العميل،
// وتبقى مع البلاغ حتى لو حُذفت الرسائل الأصلية بعد 30 يوماً.
// القاعدة: لا يبلّغ إلا طرف في علاقة نشطة، والهدف دائماً هو الشريك نفسه.
import { json, readBody } from './http.js';
import { currentUser } from './security.js';
import { DAY } from './config.js';

const ROOM_PREFIX = 'love:';          // نفس بادئة LOVE_ROOM_PREFIX في love.js (لا استيراد لتفادي الدوران)
const REASONS = {
  abuse: 'إساءة أو شتم',
  harass: 'تحرش أو ضغط',
  threat: 'تهديد أو ابتزاز',
  sexual: 'محتوى جنسي غير مرغوب',
  fake: 'انتحال أو معلومات كاذبة',
  other: 'سبب آخر',
};
const KINDS = ['msg', 'date', 'memory', 'partner'];
const NOTE_MAX = 100;                 // ملاحظة المبلّغ
const EVID_MAX = 260;                 // أقصى طول للدليل داخل البلاغ
const REASON_MAX = 480;               // أقصى طول لنص البلاغ المخزّن
const PER_MIN = 5;                    // نفس حد البلاغات العام في الخادم
const PER_DAY = 20;                   // أقصى بلاغات ارتباط في اليوم لكل عضو
const PARTNER_GAP = 3600e3;           // بلاغ «الشريك عموماً» مرة كل ساعة

export function lrTables(env) {
  return [
    // يمنع تكرار البلاغ عن المصدر نفسه من المبلّغ نفسه (src_id = 0 لبلاغ الشريك العام)
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rel_reports(id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL, rel_id INTEGER NOT NULL, kind TEXT NOT NULL, src_id INTEGER NOT NULL DEFAULT 0, report_id INTEGER, ts INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_relrep_user ON rel_reports(reporter_id,ts)'),
  ];
}

export const LR_WANT = {
  rel_reports: ['id', 'reporter_id', 'rel_id', 'kind', 'src_id', 'report_id', 'ts'],
};

async function ctx(req, env) {
  const u = await currentUser(req, env);
  if (!u) return { err: json({ error: 'انتهت الجلسة، أعد تحميل الصفحة' }, 401) };
  if (u.role === 'visitor') return { err: json({ error: 'الزائر لا يستطيع الارتباط. سجّل كعضو.' }, 403) };
  const r = await env.DB.prepare(
    "SELECT id,user_a,user_b FROM relationships WHERE status='active' AND (user_a=? OR user_b=?) LIMIT 1"
  ).bind(u.id, u.id).first();
  if (!r) return { err: json({ error: 'البلاغ متاح داخل الارتباط النشط. للإبلاغ عن عضو آخر استخدم قائمته في الشات.' }, 403) };
  return { u, r, partner: r.user_a === u.id ? r.user_b : r.user_a };
}

// تنظيف نص قبل تخزينه: إزالة المحارف غير المرئية وتوحيد المسافات
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, ' ').replace(/\s+/g, ' ').trim();
const pint = (v) => { const n = parseInt(v, 10); return n > 0 ? n : 0; };

// ---------- أدلة كل نوع (يُقرأ كلها من قاعدة البيانات) ----------
async function evidenceMsg(env, c, id) {
  const m = await env.DB.prepare('SELECT id,user_id,text,del,kind FROM messages WHERE id=? AND room=?').bind(id, ROOM_PREFIX + c.r.id).first();
  if (!m || m.del || m.kind || !clean(m.text)) return { err: 'الرسالة غير متاحة للإبلاغ' };
  if (m.user_id !== c.partner) return { err: 'يمكنك الإبلاغ عن رسائل شريكك فقط' };
  return { where: 'غرفة الحب', ev: clean(m.text) };
}

async function evidenceMemory(env, c, id) {
  const m = await env.DB.prepare('SELECT id,by_id,kind,text FROM rel_memories WHERE id=? AND rel_id=?').bind(id, c.r.id).first();
  if (!m) return { err: 'الذكرى غير موجودة' };
  // رسالة محفوظة كتبها غيره أو نص نظام: لا تُنسب إليه. المقصود هنا الملاحظات التي كتبها بنفسه فقط.
  if (m.kind !== 'note' || m.by_id !== c.partner) return { err: 'يمكنك الإبلاغ عن ملاحظات شريكك فقط' };
  return { where: 'ذكرياتنا', ev: clean(m.text) };
}

// الموعد: المكان إن كتبه الشريك + آخر 3 رسائل له (إن بقيت، فهي تُحذف عند إنهاء الموعد)
async function evidenceDate(env, c, id) {
  const d = await env.DB.prepare('SELECT id,from_id,ty,place FROM rel_dates WHERE id=? AND rel_id=?').bind(id, c.r.id).first();
  if (!d) return { err: 'الموعد غير موجود' };
  const rs = await env.DB.prepare(
    "SELECT text FROM date_msgs WHERE date_id=? AND user_id=? AND kind='m' ORDER BY id DESC LIMIT 3"
  ).bind(id, c.partner).all();
  const parts = [];
  if (d.from_id === c.partner && clean(d.place)) parts.push('المكان: ' + clean(d.place));
  rs.results.reverse().forEach((x) => { const t = clean(x.text); if (t) parts.push(t); });
  return { where: 'موعد «' + d.ty + '»', ev: parts.join(' | ') };
}

// الشريك عموماً: آخر 3 رسائل له في غرفة الحب كسياق
async function evidencePartner(env, c) {
  const rs = await env.DB.prepare(
    "SELECT text FROM messages WHERE room=? AND user_id=? AND del=0 AND (kind IS NULL OR kind='') ORDER BY id DESC LIMIT 3"
  ).bind(ROOM_PREFIX + c.r.id, c.partner).all();
  const parts = rs.results.reverse().map((x) => clean(x.text)).filter(Boolean);
  return { where: 'غرفة الحب', ev: parts.join(' | ') };
}

// ---------- POST /api/rel/report {kind, id, why, note} ----------
async function lrReport(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  const b = await readBody(req);
  if (!b) return json({ error: 'طلب غير صالح' }, 400);
  const kind = String(b.kind || '');
  const why = String(b.why || '');
  if (!KINDS.includes(kind)) return json({ error: 'طلب غير صالح' }, 400);
  if (!Object.prototype.hasOwnProperty.call(REASONS, why)) return json({ error: 'اختر سبب البلاغ' }, 400);
  const note = clean(b.note).slice(0, NOTE_MAX);
  if (why === 'other' && !note) return json({ error: 'اكتب سبب البلاغ باختصار' }, 400);
  const id = kind === 'partner' ? 0 : pint(b.id);
  if (kind !== 'partner' && !id) return json({ error: 'طلب غير صالح' }, 400);

  const now = Date.now();
  // حدود الاستعمال: دقيقة (مع بقية البلاغات)، ويوم (بلاغات الارتباط)، وعدم التكرار لنفس المصدر
  const s = await env.DB.prepare(
    'SELECT (SELECT COUNT(*) FROM user_reports WHERE reporter_id=? AND ts>?) minute,' +
    ' (SELECT COUNT(*) FROM rel_reports WHERE reporter_id=? AND ts>?) day,' +
    ' (SELECT id FROM rel_reports WHERE reporter_id=? AND kind=? AND src_id=? ORDER BY id DESC LIMIT 1) dup,' +
    ' (SELECT MAX(ts) FROM rel_reports WHERE reporter_id=? AND kind=? AND src_id=?) lastp'
  ).bind(c.u.id, now - 6e4, c.u.id, now - DAY, c.u.id, kind, id, c.u.id, kind, id).first();
  // التكرار أولاً: من أعاد الضغط على بلاغ وصل سابقاً يسمع «وصل» لا «أبطئ»، ولا يُحسب عليه
  if (kind === 'partner') {
    if (s.lastp && now - s.lastp < PARTNER_GAP) return json({ ok: true, dup: true });
  } else if (s.dup) {
    return json({ ok: true, dup: true });
  }
  if (s.minute >= PER_MIN) return json({ error: 'أبطئ قليلاً، بلاغات كثيرة' }, 429);
  if (s.day >= PER_DAY) return json({ error: 'بلغتَ حد البلاغات اليومي. إن كنت في خطر فاترك الارتباط وتواصل مع الإدارة.' }, 429);

  const e = kind === 'msg' ? await evidenceMsg(env, c, id)
    : kind === 'memory' ? await evidenceMemory(env, c, id)
    : kind === 'date' ? await evidenceDate(env, c, id)
    : await evidencePartner(env, c);
  if (e.err) return json({ error: e.err }, 404);

  // نص البلاغ: «💞 المكان · السبب · ملاحظة المبلّغ · الدليل». الدليل يُقصّ أولاً إن طال.
  const head = '💞 ' + e.where + ' · ' + REASONS[why] + (note ? ' · «' + note + '»' : '');
  const room = Math.max(0, REASON_MAX - head.length - 12);
  const ev = e.ev ? ' · الدليل: «' + e.ev.slice(0, Math.min(EVID_MAX, room)) + (e.ev.length > Math.min(EVID_MAX, room) ? '…' : '') + '»' : ' · بلا نص محفوظ';
  const reason = (head + ev).slice(0, REASON_MAX);

  const ins = await env.DB.prepare('INSERT INTO user_reports(reporter_id,target_id,reason,ctx,ts) VALUES(?,?,?,?,?)')
    .bind(c.u.id, c.partner, reason, 'love', now).run();
  await env.DB.prepare('INSERT INTO rel_reports(reporter_id,rel_id,kind,src_id,report_id,ts) VALUES(?,?,?,?,?,?)')
    .bind(c.u.id, c.r.id, kind, id, ins.meta && ins.meta.last_row_id, now).run();
  return json({ ok: true });
}

// ---------- GET /api/rel/report/options ----------
// قائمة الأسباب من الخادم (مصدر واحد للنصوص، فلا تتفرق بين الصفحات)
async function lrOptions(req, env) {
  const c = await ctx(req, env);
  if (c.err) return c.err;
  return json({ ok: true, reasons: Object.keys(REASONS).map((k) => ({ k, l: REASONS[k] })), noteMax: NOTE_MAX });
}

export const LR_POST = { '/api/rel/report': lrReport };
export const LR_GET = { '/api/rel/report/options': lrOptions };
