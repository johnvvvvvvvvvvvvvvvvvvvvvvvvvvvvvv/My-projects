CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  rank INTEGER NOT NULL DEFAULT 1,
  age INTEGER NOT NULL,
  gender TEXT,
  country TEXT,
  lang TEXT,
  last_ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_ip ON attempts(ip, ts);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- المرحلة 2 و3: تُنشأ تلقائياً من worker.js أيضاً (ensureSchema)، وهذه نسخة مرجعية كاملة
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  uname TEXT NOT NULL,
  text TEXT NOT NULL,
  rn TEXT, rt TEXT, rid INTEGER,
  ts INTEGER NOT NULL,
  ed INTEGER,                         -- معدّلة
  del INTEGER NOT NULL DEFAULT 0,     -- محذوفة (يبقى الصف ويُفرَّغ النص)
  kind TEXT,                          -- فارغ = عادية | sys = أمر (/dice /me) | poll = استطلاع
  pl TEXT,                            -- خيارات الاستطلاع JSON
  orig TEXT,                          -- النص الأصلي قبل أول تعديل
  upd INTEGER NOT NULL DEFAULT 0      -- وقت آخر تغيير (تعديل/حذف/تفاعل/تصويت)
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, id);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
CREATE TABLE IF NOT EXISTS presence (
  user_id INTEGER PRIMARY KEY,
  room TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  rn TEXT, rt TEXT, rid INTEGER,
  ts INTEGER NOT NULL,
  exp INTEGER,      -- نهاية الرسالة المؤقتة (فارغ = عادية)
  read_at INTEGER,  -- وقت القراءة (فارغ = غير مقروءة)
  ed INTEGER,
  del INTEGER NOT NULL DEFAULT 0,
  orig TEXT,
  upd INTEGER NOT NULL DEFAULT 0,
  del_from INTEGER NOT NULL DEFAULT 0,  -- مسحها المُرسِل من عنده
  del_to INTEGER NOT NULL DEFAULT 0     -- مسحها المستلم من عنده
);
CREATE INDEX IF NOT EXISTS idx_pms_to ON pms(to_id, id);
CREATE INDEX IF NOT EXISTS idx_pms_from ON pms(from_id, id);
CREATE INDEX IF NOT EXISTS idx_pms_ts ON pms(ts);

-- المرحلة 4: الأصدقاء والإشعارات والتجاهل والتبليغ والتفضيلات
CREATE TABLE IF NOT EXISTS friendships (
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)      -- صف لكل اتجاه
);
CREATE TABLE IF NOT EXISTS friend_requests (
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_freq_to ON friend_requests(to_id);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ty TEXT NOT NULL,                     -- req | friend | ...
  text TEXT NOT NULL,
  ref INTEGER,                          -- المستخدم المرتبط بالإشعار
  ts INTEGER NOT NULL,
  rd INTEGER NOT NULL DEFAULT 0,        -- مقروء
  done INTEGER NOT NULL DEFAULT 0       -- تم التعامل معه (قبول/رفض)
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id);
CREATE TABLE IF NOT EXISTS ignores (
  user_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_id)
);
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id INTEGER PRIMARY KEY,
  pm TEXT NOT NULL DEFAULT 'all'        -- all | friends | none : من يراسلني
);
CREATE TABLE IF NOT EXISTS user_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ctx TEXT,
  ts INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0     -- 1 = أخفاه المالك عن المشرفين (يراه المالك وحده)
);

-- المرحلة 5: التفاعلات والاستطلاعات والتثبيت
CREATE TABLE IF NOT EXISTS reactions (
  scope TEXT NOT NULL,                  -- r = غرفة | p = خاص
  mid INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (scope, mid, user_id)     -- تفاعل واحد لكل مستخدم على كل رسالة
);
CREATE TABLE IF NOT EXISTS poll_votes (
  mid INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  opt INTEGER NOT NULL,
  PRIMARY KEY (mid, user_id)
);
CREATE TABLE IF NOT EXISTS pins (
  room TEXT PRIMARY KEY,
  mid INTEGER NOT NULL,
  text TEXT NOT NULL,
  by_id INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_upd ON messages(room, upd);
CREATE INDEX IF NOT EXISTS idx_pms_upd ON pms(upd);
CREATE INDEX IF NOT EXISTS idx_react_mid ON reactions(scope, mid);
CREATE INDEX IF NOT EXISTS idx_votes_mid ON poll_votes(mid);

-- المرحلة 6أ: أساس الإدارة
CREATE TABLE IF NOT EXISTS sanctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,             -- المعاقَب
  kind TEXT NOT NULL,                   -- mute | kick | ban | revoke
  room TEXT,                            -- للطرد فقط: الغرفة
  reason TEXT,
  by_id INTEGER NOT NULL,
  by_name TEXT NOT NULL,
  ts INTEGER NOT NULL,
  until INTEGER,                        -- فارغ = دائم
  active INTEGER NOT NULL DEFAULT 1,    -- 0 = رُفعت قبل وقتها أو استُبدلت
  lifted_by INTEGER,
  lifted_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sanc_user ON sanctions(user_id, kind, active);
CREATE TABLE IF NOT EXISTS mod_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id INTEGER,
  target_name TEXT,
  detail TEXT,
  ts INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0     -- 1 = أخفاه المالك عن المشرفين (يراه المالك وحده)
);
CREATE INDEX IF NOT EXISTS idx_modlog_ts ON mod_log(ts);

-- 6ج: فهرس لاستعلام العقوبات الفعّالة (الكتم وسحب الصلاحيات) لكل المستخدمين
CREATE INDEX IF NOT EXISTS idx_sanc_act ON sanctions(active, kind);
-- kind في sanctions: mute | kick | ban | revoke | warn | move  (الحظر دائماً بمدة، ولا يوجد حظر دائم)

-- المرحلة 6د: مشرف الغرفة وأوضاع الغرفة
CREATE TABLE IF NOT EXISTS room_mods (
  user_id INTEGER PRIMARY KEY,          -- غرفة واحدة لكل مشرف
  room TEXT NOT NULL,
  by_id INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS room_modes (
  room TEXT PRIMARY KEY,                -- غياب الصف = عادي
  mode TEXT NOT NULL,                   -- slow | ro
  by_id INTEGER NOT NULL,
  ts INTEGER NOT NULL
);

-- المرحلة 6هـ: الملاحظات الإدارية السرية (للمشرفين فقط، لا تصل لصاحبها)
CREATE TABLE IF NOT EXISTS mod_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER NOT NULL,
  by_id INTEGER NOT NULL,
  by_name TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_target ON mod_notes(target_id, id);

-- المرحلة 7أ: الملف الشخصي (الصورة والخلفية والنبذة والحالة)
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY,
  img TEXT,                             -- الصورة الشخصية JPEG بصيغة base64 (مصغّرة 256px)
  cover TEXT,                           -- صورة الخلفية JPEG بصيغة base64 (مصغّرة 960x360)
  bio TEXT NOT NULL DEFAULT '',         -- النبذة (حتى 60 حرفاً)
  st TEXT NOT NULL DEFAULT 'متاح',      -- متاح | مشغول | بعيد
  iv INTEGER NOT NULL DEFAULT 0,        -- نسخة الصورة الشخصية (وقت رفعها، 0 = لا صورة)
  cv INTEGER NOT NULL DEFAULT 0,        -- نسخة الخلفية (0 = لا خلفية)
  upd INTEGER NOT NULL DEFAULT 0        -- وقت آخر تعديل
);

-- المرحلة 7ب: الإعجابات (إعجاب واحد لكل شخص على كل ملف)
CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL,             -- المعجِب
  target_id INTEGER NOT NULL,           -- صاحب الملف
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_id);

-- المرحلة 7ج: الهدايا (الرمز والاسم يحدّدهما الخادم من رقم الهدية)
CREATE TABLE IF NOT EXISTS gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_id INTEGER NOT NULL,               -- المستلم
  from_id INTEGER NOT NULL,             -- المُهدي (يُعرض اسمه الحالي)
  gid INTEGER NOT NULL,                 -- رقم الهدية في قائمة GIFT_LIST بـ worker.js
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gifts_to ON gifts(to_id, id);
CREATE INDEX IF NOT EXISTS idx_gifts_from ON gifts(from_id, ts);

-- المرحلة 7د: الزيارات (صف لكل زائر على كل ملف، آخر زيارة) وتفضيلاتها
CREATE TABLE IF NOT EXISTS visits (
  target_id INTEGER NOT NULL,           -- صاحب الملف
  visitor_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,                  -- آخر زيارة
  nts INTEGER NOT NULL DEFAULT 0,       -- آخر إشعار زيارة أُرسل لصاحب الملف (مرة كل 24 ساعة)
  PRIMARY KEY (target_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_visits_target ON visits(target_id, ts);
CREATE TABLE IF NOT EXISTS visit_prefs (
  user_id INTEGER PRIMARY KEY,
  hv INTEGER NOT NULL DEFAULT 0,        -- 1 = يخفي زياراته
  gh INTEGER NOT NULL DEFAULT 0         -- 1 = وضع الشبح (للإشراف فقط)
);

-- المرحلة 7هـ: الإعلانات (تصل كل المتصلين خلال مدة ظهورها، وتُحذف بعد يوم)
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  by_id INTEGER NOT NULL,               -- المعلِن
  text TEXT NOT NULL,                   -- حتى 200 حرف
  dur INTEGER NOT NULL,                 -- مدة الظهور بالثواني (10 إلى 20)
  ts INTEGER NOT NULL
);

-- المرحلة 6و: حظر الجهاز/IP (بصمة العنوان فقط، بمدة إلزامية وبلا سقف) + اقتراحات الحظر + التظلّمات
CREATE TABLE IF NOT EXISTS ip_bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,                -- بصمة SHA-256 للعنوان (لا يُحفظ العنوان نفسه هنا)
  target_id INTEGER,                    -- الحساب الذي بُني عليه الحظر
  target_name TEXT,
  reason TEXT,
  by_id INTEGER NOT NULL,
  by_name TEXT NOT NULL,
  ts INTEGER NOT NULL,
  until INTEGER NOT NULL,               -- إلزامي: لا حظر جهاز دائم
  active INTEGER NOT NULL DEFAULT 1,
  lifted_by INTEGER,
  lifted_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ipban_h ON ip_bans(ip_hash, active);
CREATE TABLE IF NOT EXISTS ban_props (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER NOT NULL,
  target_name TEXT NOT NULL,
  by_id INTEGER NOT NULL,               -- المقترِح
  by_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  minutes INTEGER NOT NULL,             -- المدة المقترحة
  kind TEXT NOT NULL,                   -- ban | ipban
  ts INTEGER NOT NULL,
  state INTEGER NOT NULL DEFAULT 0,     -- 0 معلّق | 1 معتمد | 2 مرفوض
  rev_id INTEGER, rev_name TEXT, rev_ts INTEGER, rev_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_props_state ON ban_props(state, id);
CREATE TABLE IF NOT EXISTS appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  sanc_id INTEGER NOT NULL,             -- رقم العقوبة (في sanctions أو ip_bans حسب النوع)
  sanc_kind TEXT NOT NULL,              -- ban | mute | kick | revoke | nopm | slow | ipban
  sanc_by TEXT, sanc_reason TEXT, sanc_until INTEGER,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL,
  state INTEGER NOT NULL DEFAULT 0,     -- 0 معلّق | 1 مقبول (رُفعت العقوبة) | 2 مرفوض | 3 أُغلق (انتهت العقوبة)
  rev_id INTEGER, rev_name TEXT, rev_ts INTEGER, rev_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_appeals_state ON appeals(state, id);
CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id, ts);

-- تغيير الاسم: بعد إجبار تغيير عام يُسجَّل صف في sanctions بنوع rename (مهلة 7 أيام) يتيح لصاحبه اختيار اسم جديد مرة واحدة

-- وضع الطوارئ: صف واحد فقط (id=1). وجوده = كل الغرف للقراءة فقط لمن مستواه أقل من 4. حذفه = إنهاء الوضع
CREATE TABLE IF NOT EXISTS emergency (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  by_id INTEGER NOT NULL,               -- من فعّله
  by_name TEXT NOT NULL,
  ts INTEGER NOT NULL
);

-- الكلمات الممنوعة: تُفحص بها رسائل الغرف في الخادم (act: delete | warn | mute)
CREATE TABLE IF NOT EXISTS watch_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL UNIQUE,            -- بعد توحيد الهمزات وحذف التشكيل
  act TEXT NOT NULL,                    -- delete = لا تُنشر | warn = لا تُنشر + تحذير | mute = لا تُنشر + كتم
  by_id INTEGER NOT NULL,               -- آخر من أضافها أو عدّلها (0 = النظام)
  by_name TEXT NOT NULL,
  ts INTEGER NOT NULL
);
-- أعلام عامة للموقع: ww_lock = 1 يمنع كل من عدا صاحب الموقع من تعديل الكلمات الممنوعة | ww_seeded = أُضيفت الكلمات الأولية
CREATE TABLE IF NOT EXISTS site_flags (
  k TEXT PRIMARY KEY,
  v INTEGER NOT NULL DEFAULT 0,
  by_id INTEGER,
  ts INTEGER
);
