import { DAY, KEEP } from './config.js';

let schemaP = null;
function ensureDatabase(env, seedWatchWords) {
  if (!schemaP) {
    schemaP = env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, user_id INTEGER NOT NULL, uname TEXT NOT NULL, text TEXT NOT NULL, rn TEXT, rt TEXT, rid INTEGER, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS presence(user_id INTEGER PRIMARY KEY, room TEXT NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS pms(id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, text TEXT NOT NULL, rn TEXT, rt TEXT, rid INTEGER, ts INTEGER NOT NULL, exp INTEGER, read_at INTEGER)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pms_to ON pms(to_id,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pms_from ON pms(from_id,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pms_ts ON pms(ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS friendships(user_id INTEGER NOT NULL, friend_id INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(user_id,friend_id))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS friend_requests(from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(from_id,to_id))'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_freq_to ON friend_requests(to_id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, ty TEXT NOT NULL, text TEXT NOT NULL, ref INTEGER, ts INTEGER NOT NULL, rd INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id,id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS ignores(user_id INTEGER NOT NULL, target_id INTEGER NOT NULL, PRIMARY KEY(user_id,target_id))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS user_prefs(user_id INTEGER PRIMARY KEY, pm TEXT NOT NULL DEFAULT \'all\')'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS user_reports(id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL, target_id INTEGER NOT NULL, reason TEXT NOT NULL, ctx TEXT, ts INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS reactions(scope TEXT NOT NULL, mid INTEGER NOT NULL, user_id INTEGER NOT NULL, emoji TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(scope,mid,user_id))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS poll_votes(mid INTEGER NOT NULL, user_id INTEGER NOT NULL, opt INTEGER NOT NULL, PRIMARY KEY(mid,user_id))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS pins(room TEXT PRIMARY KEY, mid INTEGER NOT NULL, text TEXT NOT NULL, by_id INTEGER NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS sanctions(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, room TEXT, reason TEXT, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, ts INTEGER NOT NULL, until INTEGER, active INTEGER NOT NULL DEFAULT 1, lifted_by INTEGER, lifted_ts INTEGER)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sanc_user ON sanctions(user_id,kind,active)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS mod_log(id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, target_id INTEGER, target_name TEXT, detail TEXT, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_modlog_ts ON mod_log(ts)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sanc_act ON sanctions(active,kind)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS mod_notes(id INTEGER PRIMARY KEY AUTOINCREMENT, target_id INTEGER NOT NULL, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_notes_target ON mod_notes(target_id,id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS room_mods(user_id INTEGER PRIMARY KEY, room TEXT NOT NULL, by_id INTEGER NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS room_modes(room TEXT PRIMARY KEY, mode TEXT NOT NULL, by_id INTEGER NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS profiles(user_id INTEGER PRIMARY KEY, img TEXT, cover TEXT, bio TEXT NOT NULL DEFAULT '', st TEXT NOT NULL DEFAULT 'متاح', iv INTEGER NOT NULL DEFAULT 0, cv INTEGER NOT NULL DEFAULT 0, upd INTEGER NOT NULL DEFAULT 0)"),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS likes(user_id INTEGER NOT NULL, target_id INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(user_id,target_id))'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS gifts(id INTEGER PRIMARY KEY AUTOINCREMENT, to_id INTEGER NOT NULL, from_id INTEGER NOT NULL, gid INTEGER NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_gifts_to ON gifts(to_id,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_gifts_from ON gifts(from_id,ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS visits(target_id INTEGER NOT NULL, visitor_id INTEGER NOT NULL, ts INTEGER NOT NULL, nts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(target_id,visitor_id))'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_visits_target ON visits(target_id,ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY AUTOINCREMENT, by_id INTEGER NOT NULL, text TEXT NOT NULL, dur INTEGER NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS news(id INTEGER PRIMARY KEY AUTOINCREMENT, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_news_id ON news(id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS user_stats(user_id INTEGER PRIMARY KEY, msgs INTEGER NOT NULL DEFAULT 0)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS confs(id INTEGER PRIMARY KEY AUTOINCREMENT, to_id INTEGER NOT NULL, from_id INTEGER NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_confs_to ON confs(to_id,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_confs_from ON confs(from_id,ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS conf_blocks(user_id INTEGER NOT NULL, from_id INTEGER NOT NULL, PRIMARY KEY(user_id,from_id))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS spy_log(id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL, a_id INTEGER NOT NULL, b_id INTEGER NOT NULL, a_name TEXT NOT NULL, b_name TEXT NOT NULL, reason TEXT NOT NULL, ts INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS spy_meta(a_id INTEGER NOT NULL, b_id INTEGER NOT NULL, flag INTEGER NOT NULL DEFAULT 0, seen INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(a_id,b_id))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS spy_notes(id INTEGER PRIMARY KEY AUTOINCREMENT, a_id INTEGER NOT NULL, b_id INTEGER NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_spynotes_ab ON spy_notes(a_id,b_id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS visit_prefs(user_id INTEGER PRIMARY KEY, hv INTEGER NOT NULL DEFAULT 0, gh INTEGER NOT NULL DEFAULT 0)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS ip_bans(id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT NOT NULL, target_id INTEGER, target_name TEXT, reason TEXT, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, ts INTEGER NOT NULL, until INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, lifted_by INTEGER, lifted_ts INTEGER)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ipban_h ON ip_bans(ip_hash,active)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS ban_props(id INTEGER PRIMARY KEY AUTOINCREMENT, target_id INTEGER NOT NULL, target_name TEXT NOT NULL, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, reason TEXT NOT NULL, minutes INTEGER NOT NULL, kind TEXT NOT NULL, ts INTEGER NOT NULL, state INTEGER NOT NULL DEFAULT 0, rev_id INTEGER, rev_name TEXT, rev_ts INTEGER, rev_note TEXT)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_props_state ON ban_props(state,id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS appeals(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, user_name TEXT NOT NULL, sanc_id INTEGER NOT NULL, sanc_kind TEXT NOT NULL, sanc_by TEXT, sanc_reason TEXT, sanc_until INTEGER, text TEXT NOT NULL, ts INTEGER NOT NULL, state INTEGER NOT NULL DEFAULT 0, rev_id INTEGER, rev_name TEXT, rev_ts INTEGER, rev_note TEXT)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_appeals_state ON appeals(state,id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id,ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS watch_words(id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL UNIQUE, act TEXT NOT NULL, by_id INTEGER NOT NULL, by_name TEXT NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS site_flags(k TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0, by_id INTEGER, ts INTEGER)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS emergency(id INTEGER PRIMARY KEY CHECK(id=1), by_id INTEGER NOT NULL, by_name TEXT NOT NULL, ts INTEGER NOT NULL)'),
    ]).then(() => migrate(env)).then(() => verifySchema(env)).then(() => seedWatchWords(env)).catch((e) => { schemaP = null; throw e; });
  }
  return schemaP;
}

// المرحلة 5: أعمدة جديدة تُضاف للجداول الموجودة (دون حذف أي بيانات)
const MIG = {
  messages: [
    ['ed', 'INTEGER'],
    ['del', 'INTEGER NOT NULL DEFAULT 0'],
    ['kind', 'TEXT'],
    ['pl', 'TEXT'],
    ['orig', 'TEXT'],
    ['upd', 'INTEGER NOT NULL DEFAULT 0']
  ],

  visits: [
    ['nts', 'INTEGER NOT NULL DEFAULT 0']
  ],

  ip_bans: [
    ['target_id', 'INTEGER'],
    ['target_name', 'TEXT']
  ],

  watch_words: [
    ['act', "TEXT NOT NULL DEFAULT 'delete'"],
    ['by_id', 'INTEGER NOT NULL DEFAULT 0'],
    ['by_name', "TEXT NOT NULL DEFAULT 'قديم'"],
    ['ts', 'INTEGER NOT NULL DEFAULT 0']
  ],

  mod_log: [
    ['hidden', 'INTEGER NOT NULL DEFAULT 0']
  ],

  user_reports: [
    ['hidden', 'INTEGER NOT NULL DEFAULT 0']
  ],

  pms: [
    ['ed', 'INTEGER'],
    ['del', 'INTEGER NOT NULL DEFAULT 0'],
    ['orig', 'TEXT'],
    ['upd', 'INTEGER NOT NULL DEFAULT 0'],
    ['del_from', 'INTEGER NOT NULL DEFAULT 0'],
    ['del_to', 'INTEGER NOT NULL DEFAULT 0']
  ]
};
async function migrate(env) {
  for (const t of Object.keys(MIG)) {
    const cols = (await env.DB.prepare('PRAGMA table_info(' + t + ')').all()).results.map((c) => c.name);
    for (const [c, ty] of MIG[t]) {
      if (cols.includes(c)) continue;
      try { await env.DB.prepare('ALTER TABLE ' + t + ' ADD COLUMN ' + c + ' ' + ty).run(); }
      catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
    }
  }
  await env.DB.batch([
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_messages_upd ON messages(room,upd)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pms_upd ON pms(upd)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_react_mid ON reactions(scope,mid)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_votes_mid ON poll_votes(mid)'),
  ]);
}

// يتحقق أن الجداول بالبنية المطلوبة (جدول قديم بنفس الاسم لا يُستبدل تلقائياً ويسبب أخطاء غامضة)
const WANT = {
  messages: ['id', 'room', 'user_id', 'uname', 'text', 'rn', 'rt', 'rid', 'ts', 'ed', 'del', 'kind', 'pl', 'orig', 'upd'],
  presence: ['user_id', 'room', 'ts'],
  pms: ['id', 'from_id', 'to_id', 'text', 'rn', 'rt', 'rid', 'ts', 'exp', 'read_at', 'ed', 'del', 'orig', 'upd', 'del_from', 'del_to'],
  friendships: ['user_id', 'friend_id', 'ts'],
  friend_requests: ['from_id', 'to_id', 'ts'],
  notifications: ['id', 'user_id', 'ty', 'text', 'ref', 'ts', 'rd', 'done'],
  ignores: ['user_id', 'target_id'],
  user_prefs: ['user_id', 'pm'],
  user_reports: ['id', 'reporter_id', 'target_id', 'reason', 'ctx', 'ts', 'done', 'hidden'],
  reactions: ['scope', 'mid', 'user_id', 'emoji', 'ts'],
  poll_votes: ['mid', 'user_id', 'opt'],
  pins: ['room', 'mid', 'text', 'by_id', 'ts'],
  sanctions: ['id', 'user_id', 'kind', 'room', 'reason', 'by_id', 'by_name', 'ts', 'until', 'active', 'lifted_by', 'lifted_ts'],
  mod_notes: ['id', 'target_id', 'by_id', 'by_name', 'text', 'ts'],
  room_mods: ['user_id', 'room', 'by_id', 'ts'],
  room_modes: ['room', 'mode', 'by_id', 'ts'],
  profiles: ['user_id', 'img', 'cover', 'bio', 'st', 'iv', 'cv', 'upd'],
  likes: ['user_id', 'target_id', 'ts'],
  gifts: ['id', 'to_id', 'from_id', 'gid', 'ts'],
  visits: ['target_id', 'visitor_id', 'ts', 'nts'],
  announcements: ['id', 'by_id', 'text', 'dur', 'ts'],
  news: ['id', 'by_id', 'by_name', 'title', 'text', 'ts'],
  user_stats: ['user_id', 'msgs'],
  confs: ['id', 'to_id', 'from_id', 'text', 'ts'],
  conf_blocks: ['user_id', 'from_id'],
  spy_log: ['id', 'owner_id', 'a_id', 'b_id', 'a_name', 'b_name', 'reason', 'ts', 'hidden'],
  spy_meta: ['a_id', 'b_id', 'flag', 'seen'],
  spy_notes: ['id', 'a_id', 'b_id', 'text', 'ts'],
  visit_prefs: ['user_id', 'hv', 'gh'],
  ip_bans: ['id', 'ip_hash', 'target_id', 'target_name', 'reason', 'by_id', 'by_name', 'ts', 'until', 'active', 'lifted_by', 'lifted_ts'],
  ban_props: ['id', 'target_id', 'target_name', 'by_id', 'by_name', 'reason', 'minutes', 'kind', 'ts', 'state', 'rev_id', 'rev_name', 'rev_ts', 'rev_note'],
  appeals: ['id', 'user_id', 'user_name', 'sanc_id', 'sanc_kind', 'sanc_by', 'sanc_reason', 'sanc_until', 'text', 'ts', 'state', 'rev_id', 'rev_name', 'rev_ts', 'rev_note'],
  mod_log: ['id', 'actor_id', 'actor_name', 'action', 'target_id', 'target_name', 'detail', 'ts', 'hidden'],
  emergency: ['id', 'by_id', 'by_name', 'ts'],
  watch_words: ['id', 'word', 'act', 'by_id', 'by_name', 'ts'],
  site_flags: ['k', 'v', 'by_id', 'ts'],
};
async function verifySchema(env) {
  for (const t of Object.keys(WANT)) {
    const cols = (await env.DB.prepare('PRAGMA table_info(' + t + ')').all()).results.map((c) => c.name);
    const miss = WANT[t].filter((c) => !cols.includes(c));
    if (miss.length) throw new Error('SCHEMA: الجدول ' + t + ' قديم وينقصه الأعمدة ' + miss.join(',') + ' — نفّذ DROP TABLE ' + t + ' ثم أعد المحاولة');
  }
}

let lastClean = 0;
async function cleanup(env) {
  const now = Date.now();
  if (now - lastClean < 10 * 6e4) return;
  lastClean = now;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM messages WHERE ts<?').bind(now - KEEP),
    env.DB.prepare('DELETE FROM presence WHERE ts<?').bind(now - DAY),
    env.DB.prepare('DELETE FROM pms WHERE ts<? OR (exp IS NOT NULL AND exp<?)').bind(now - KEEP, now),
    env.DB.prepare('DELETE FROM notifications WHERE ts<?').bind(now - KEEP),
    env.DB.prepare('DELETE FROM friend_requests WHERE ts<?').bind(now - KEEP),
    env.DB.prepare('DELETE FROM pms WHERE del_from=1 AND del_to=1'),
    env.DB.prepare("DELETE FROM reactions WHERE (scope='r' AND mid NOT IN (SELECT id FROM messages)) OR (scope='p' AND mid NOT IN (SELECT id FROM pms))"),
    env.DB.prepare('DELETE FROM poll_votes WHERE mid NOT IN (SELECT id FROM messages)'),
    env.DB.prepare('DELETE FROM pins WHERE mid NOT IN (SELECT id FROM messages)'),
    env.DB.prepare('DELETE FROM mod_log WHERE ts<?').bind(now - 3 * KEEP),
    env.DB.prepare('DELETE FROM visits WHERE ts<?').bind(now - KEEP),
    env.DB.prepare('DELETE FROM announcements WHERE ts<?').bind(now - DAY),
    env.DB.prepare('DELETE FROM confs WHERE ts<?').bind(now - 3 * KEEP),
    env.DB.prepare('DELETE FROM spy_log WHERE ts<?').bind(now - 3 * KEEP),
    env.DB.prepare('DELETE FROM spy_notes WHERE ts<?').bind(now - 3 * KEEP),
    env.DB.prepare('DELETE FROM ip_bans WHERE (active=0 OR until<?) AND ts<?').bind(now, now - 3 * KEEP),
    env.DB.prepare('DELETE FROM ban_props WHERE ts<?').bind(now - 3 * KEEP),
    env.DB.prepare('DELETE FROM appeals WHERE ts<?').bind(now - 3 * KEEP),
    env.DB.prepare('DELETE FROM sanctions WHERE (active=0 OR (until IS NOT NULL AND until<?)) AND ts<?').bind(now, now - 3 * KEEP),
  ]);
}


export { ensureDatabase, cleanup };
