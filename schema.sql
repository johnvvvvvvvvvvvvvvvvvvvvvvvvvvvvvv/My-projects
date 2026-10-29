
-- ============================================================
-- شات عربي — مخطط قاعدة البيانات الكامل
-- يشمل: المراحل 1-7 + الاطلاع على الخاص + حظر IP + المتجر
-- ============================================================

-- ===== المرحلة 1: المستخدمون والجلسات =====
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

-- ===== المرحلة 2: رسائل الغرف =====
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  uname TEXT NOT NULL,
  text TEXT NOT NULL,
  rn TEXT, rt TEXT, rid INTEGER,
  ts INTEGER NOT NULL,
  ed INTEGER,
  del INTEGER NOT NULL DEFAULT 0,
  kind TEXT,
  pl TEXT,
  orig TEXT,
  upd INTEGER NOT NULL DEFAULT 0,
  del_text TEXT,                        -- النص الأصلي محفوظ للمشرف قبل الحذف
  del_ts INTEGER                        -- وقت الحذف
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, id);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
CREATE INDEX IF NOT EXISTS idx_messages_upd ON messages(room, upd);

CREATE TABLE IF NOT EXISTS presence (
  user_id INTEGER PRIMARY KEY,
  room TEXT NOT NULL,
  ts INTEGER NOT NULL
);

-- ===== المرحلة 3: الرسائل الخاصة =====
CREATE TABLE IF NOT EXISTS pms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  rn TEXT, rt TEXT, rid INTEGER,
  ts INTEGER NOT NULL,
  exp INTEGER,
  read_at INTEGER,
  ed INTEGER,
  del INTEGER NOT NULL DEFAULT 0,
  orig TEXT,
  upd INTEGER NOT NULL DEFAULT 0,
  del_from INTEGER NOT NULL DEFAULT 0,
  del_to INTEGER NOT NULL DEFAULT 0,
  del_text TEXT,                        -- النص الأصلي محفوظ قبل الحذف (للمالك)
  del_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pms_to ON pms(to_id, id);
CREATE INDEX IF NOT EXISTS idx_pms_from ON pms(from_id, id);
CREATE INDEX IF NOT EXISTS idx_pms_ts ON pms(ts);
CREATE INDEX IF NOT EXISTS idx_pms_upd ON pms(upd);

-- ===== المرحلة 4: الأصدقاء والخصوصية =====
CREATE TABLE IF NOT EXISTS friendships (
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
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
  ty TEXT NOT NULL,
  text TEXT NOT NULL,
  ref INTEGER,
  ts INTEGER NOT NULL,
  rd INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id);
CREATE TABLE IF NOT EXISTS ignores (
  user_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_id)
);
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id INTEGER PRIMARY KEY,
  pm TEXT NOT NULL DEFAULT 'all'
);
CREATE TABLE IF NOT EXISTS user_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ctx TEXT,
  ts INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);

-- ===== المرحلة 5: التفاعلات والاستطلاعات =====
CREATE TABLE IF NOT EXISTS reactions (
  scope TEXT NOT NULL,
  mid INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (scope, mid, user_id)
);
CREATE INDEX IF NOT EXISTS idx_react_mid ON reactions(scope, mid);
CREATE TABLE IF NOT EXISTS poll_votes (
  mid INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  opt INTEGER NOT NULL,
  PRIMARY KEY (mid, user_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_mid ON poll_votes(mid);
CREATE TABLE IF NOT EXISTS pins (
  room TEXT PRIMARY KEY,
  mid INTEGER NOT NULL,
  text TEXT NOT NULL,
  by_id INTEGER NOT NULL,
  ts INTEGER NOT NULL
);

-- ===== المرحلة 6: الإدارة =====
CREATE TABLE IF NOT EXISTS sanctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  room TEXT,
  reason TEXT,
  by_id INTEGER NOT NULL,
  by_name TEXT NOT NULL,
  ts INTEGER NOT NULL,
  until INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  lifted_by INTEGER,
  lifted_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sanc_user ON sanctions(user_id, kind, active);
CREATE INDEX IF NOT EXISTS idx_sanc_act ON sanctions(active, kind);
CREATE TABLE IF NOT EXISTS mod_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id INTEGER,
  target_name TEXT,
  detail TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modlog_ts ON mod_log(ts);
CREATE TABLE IF NOT EXISTS mod_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER NOT NULL,
  by_id INTEGER NOT NULL,
  by_name TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_target ON mod_notes(target_id, id);
CREATE TABLE IF NOT EXISTS room_mods (
  user_id INTEGER PRIMARY KEY,
  room TEXT NOT NULL,
  by_id INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS room_modes (
  room TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  by_id INTEGER NOT NULL,
  ts INTEGER NOT NULL
);

-- ===== المرحلة 7: الملف الشخصي والتفاعل =====
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY,
  img TEXT,
  cover TEXT,
  bio TEXT NOT NULL DEFAULT '',
  st TEXT NOT NULL DEFAULT 'متاح',
  iv INTEGER NOT NULL DEFAULT 0,
  cv INTEGER NOT NULL DEFAULT 0,
  upd INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_id);
CREATE TABLE IF NOT EXISTS gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_id INTEGER NOT NULL,
  from_id INTEGER NOT NULL,
  gid INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gifts_to ON gifts(to_id, id);
CREATE INDEX IF NOT EXISTS idx_gifts_from ON gifts(from_id, ts);
CREATE TABLE IF NOT EXISTS visits (
  target_id INTEGER NOT NULL,
  visitor_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (target_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_visits_target ON visits(target_id, ts);
CREATE TABLE IF NOT EXISTS visit_prefs (
  user_id INTEGER PRIMARY KEY,
  hv INTEGER NOT NULL DEFAULT 0,
  gh INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  by_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  dur INTEGER NOT NULL,
  ts INTEGER NOT NULL
);

-- ============================================================
-- جديد (المرحلة 6و): الاطلاع على الخاص الحقيقي
-- صاحب الموقع (owner) يرى كل شيء بما فيه المحذوف
-- ============================================================
CREATE TABLE IF NOT EXISTS spy_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL,
  actor_name TEXT NOT NULL,
  peer_a INTEGER NOT NULL,
  peer_b INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spy_access_ts ON spy_access(ts);
CREATE INDEX IF NOT EXISTS idx_spy_access_actor ON spy_access(actor_id, id);

CREATE TABLE IF NOT EXISTS spy_flags (
  peer_a INTEGER NOT NULL,
  peer_b INTEGER NOT NULL,
  by_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (peer_a, peer_b)
);

CREATE TABLE IF NOT EXISTS spy_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  peer_a INTEGER NOT NULL,
  peer_b INTEGER NOT NULL,
  by_id INTEGER NOT NULL,
  by_name TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spy_notes_pair ON spy_notes(peer_a, peer_b, id);

-- ============================================================
-- جديد: حظر IP
-- مدة إلزامية (لا يوجد حظر دائم). لا يُخزَّن IP نصاً بل تجزئته SHA-256
-- ============================================================
CREATE TABLE IF NOT EXISTS ip_bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  reason TEXT,
  by_id INTEGER NOT NULL,
  by_name TEXT NOT NULL,
  ts INTEGER NOT NULL,
  until INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  lifted_by INTEGER,
  lifted_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ipb_hash ON ip_bans(ip_hash, active);
CREATE INDEX IF NOT EXISTS idx_ipb_until ON ip_bans(active, until);

-- ============================================================
-- جديد: المتجر على الخادم
-- ============================================================
CREATE TABLE IF NOT EXISTS user_wallet (
  user_id INTEGER PRIMARY KEY,
  coins INTEGER NOT NULL DEFAULT 200,
  last_daily INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  gd TEXT,
  ga INTEGER NOT NULL DEFAULT 0,
  upd INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shop_items (
  id TEXT PRIMARY KEY,
  t TEXT NOT NULL,
  n TEXT NOT NULL,
  v TEXT NOT NULL,
  p INTEGER NOT NULL,
  r TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  sales INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopitems_t ON shop_items(t, hidden);

CREATE TABLE IF NOT EXISTS shop_inv (
  user_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS shop_eq (
  user_id INTEGER NOT NULL,
  t TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (user_id, t)
);

CREATE TABLE IF NOT EXISTS shop_wish (
  user_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS shop_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shoptx_user ON shop_tx(user_id, id);

CREATE TABLE IF NOT EXISTS shop_tasks (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  task_id TEXT NOT NULL,
  claimed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, task_id)
);
