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
  ts INTEGER NOT NULL
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
  read_at INTEGER   -- وقت القراءة (فارغ = غير مقروءة)
);
CREATE INDEX IF NOT EXISTS idx_pms_to ON pms(to_id, id);
CREATE INDEX IF NOT EXISTS idx_pms_from ON pms(from_id, id);
CREATE INDEX IF NOT EXISTS idx_pms_ts ON pms(ts);
