import { state } from './state.js';
import { DOM } from './DOM.js';
import { CONFIG, DEFAULT_DB_FILE_PATH } from './config.js';

export async function loadExistingDB() {
  try {
    const response = await fetch(DEFAULT_DB_FILE_PATH);
    if (!response.ok) throw new Error('File not found');
    const buffer = await response.arrayBuffer();
    state.sqliteDB = await JaferSQL.jaferInit(new Uint8Array(buffer));
    state.sqliteReady = true;
  } catch (err) {
    console.warn('Could not load existing DB, starting new:', err);
    state.sqliteDB = await JaferSQL.jaferInit();
    state.sqliteReady = true;
  }
  
  // Enable foreign keys
  state.sqliteDB.jaferExec('PRAGMA foreign_keys = ON');
  
  // Create tables
  state.sqliteDB.jaferExec(`
    CREATE TABLE IF NOT EXISTS userJson (
      userName TEXT PRIMARY KEY,
      accountRegion TEXT, birthDate TEXT, displayName TEXT,
      emailAddress TEXT, profilePhoto TEXT, telephoneNumber TEXT,
      followerCount INTEGER, followingCount INTEGER, likesReceived INTEGER,
      rawFollowingJson INTEGER, cleanFollowingJson INTEGER,
      rawFollowerJson INTEGER, cleanFollowersJson INTEGER, friendsJson INTEGER
    )
  `);
  state.sqliteDB.jaferExec(`
    CREATE TABLE IF NOT EXISTS userApi (
      username TEXT PRIMARY KEY REFERENCES userJson(userName) ON DELETE CASCADE,
      displayName TEXT, avatarUrl TEXT, bio TEXT,
      verified INTEGER, privateAccount INTEGER, secUid TEXT,
      followerCount INTEGER, followingCount INTEGER, heartCount INTEGER,
      videoCount INTEGER,
      status TEXT, error TEXT, avatar BLOB, fetched_at TEXT
    )
  `);
  state.sqliteDB.jaferExec(`
    CREATE TABLE IF NOT EXISTS profiles (
      owner_username TEXT NOT NULL REFERENCES userJson(userName) ON DELETE CASCADE,
      username TEXT NOT NULL,
      is_following INTEGER NOT NULL DEFAULT 0,
      is_follower INTEGER NOT NULL DEFAULT 0,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      friendship TEXT NOT NULL DEFAULT 'none',
      following_date TEXT,
      follower_date TEXT,
      blocked_date TEXT,
      displayName TEXT, avatarUrl TEXT, bio TEXT,
      verified INTEGER, privateAccount INTEGER, secUid TEXT,
      followerCount INTEGER, followingCount INTEGER, heartCount INTEGER,
      videoCount INTEGER,
      status TEXT, error TEXT, avatar BLOB,
      PRIMARY KEY (owner_username, username)
    )
  `);
  state.sqliteDB.jaferExec(`
    CREATE TABLE IF NOT EXISTS fetch_meta (
      owner_username TEXT PRIMARY KEY REFERENCES userJson(userName) ON DELETE CASCADE,
      completed_at TEXT
    )
  `);
  state.sqliteDB.jaferExec(`
    CREATE TABLE IF NOT EXISTS saved_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_username TEXT,
      name TEXT NOT NULL,
      sql_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  
  // Create views
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_following AS
    SELECT * FROM profiles WHERE is_following = 1
  `);
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_followers AS
    SELECT * FROM profiles WHERE is_follower = 1
  `);
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_friends AS
    SELECT * FROM profiles WHERE is_following = 1 AND is_follower = 1
  `);
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_blocked AS
    SELECT * FROM profiles WHERE is_blocked = 1
  `);
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_following_only AS
    SELECT * FROM profiles WHERE is_following = 1 AND is_follower = 0
  `);
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_followers_only AS
    SELECT * FROM profiles WHERE is_follower = 1 AND is_following = 0
  `);
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_blocked_with_follow AS
    SELECT * FROM profiles WHERE is_blocked = 1 AND is_following = 1
  `);
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_owner_stats AS
    SELECT
      owner_username,
      COUNT(*) AS total_profiles,
      SUM(is_following) AS following_count,
      SUM(is_follower) AS follower_count,
      SUM(CASE WHEN is_following AND is_follower THEN 1 ELSE 0 END) AS friend_count,
      SUM(is_blocked) AS blocked_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_fetches
    FROM profiles
    GROUP BY owner_username
  `);
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_verified_profiles AS
    SELECT * FROM profiles WHERE verified = 1
  `);
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_full_user_data AS
    SELECT
      p.owner_username, p.username, p.displayName, p.avatarUrl, p.bio,
      p.verified, p.privateAccount, p.secUid,
      p.followerCount AS profile_followerCount,
      p.followingCount AS profile_followingCount,
      p.heartCount, p.videoCount,
      p.friendship, p.is_following, p.is_follower, p.is_blocked,
      p.following_date, p.follower_date, p.blocked_date,
      p.status, p.error,
      uj.userName AS owner_userName,
      uj.displayName AS owner_displayName,
      uj.followerCount AS owner_followerCount,
      uj.followingCount AS owner_followingCount,
      uj.likesReceived AS owner_likesReceived,
      uj.rawFollowingJson, uj.cleanFollowingJson,
      uj.rawFollowerJson, uj.cleanFollowersJson,
      uj.friendsJson,
      ua.bio AS owner_bio,
      ua.avatarUrl AS owner_avatarUrl,
      ua.fetched_at
    FROM profiles p
    JOIN userJson uj ON p.owner_username = uj.userName
    LEFT JOIN userApi ua ON uj.userName = ua.username
  `);
  state.sqliteDB.jaferExec(`
    CREATE VIEW IF NOT EXISTS vw_saved_queries AS
    SELECT id, owner_username, name, sql_text, created_at
    FROM saved_queries
    ORDER BY created_at DESC
  `);
  
  // Seed important queries if table is empty
  const existing = state.sqliteDB.jaferAll('SELECT COUNT(*) as cnt FROM saved_queries');
  if (existing[0].cnt === 0) {
    const stmt = state.sqliteDB._db.prepare(
      'INSERT INTO saved_queries (owner_username, name, sql_text) VALUES (?, ?, ?)'
    );
    const queries = [
      [null, 'All Following (current owner)', 'SELECT * FROM profiles WHERE owner_username = ? AND is_following = 1;'],
      [null, 'All Followers (mutual + imported)', 'SELECT * FROM profiles WHERE owner_username = ? AND is_follower = 1;'],
      [null, 'Mutual Friends', 'SELECT * FROM profiles WHERE owner_username = ? AND is_following = 1 AND is_follower = 1;'],
      [null, 'Blocked Users', 'SELECT * FROM profiles WHERE owner_username = ? AND is_blocked = 1;'],
      [null, 'Verified Accounts I Follow', 'SELECT * FROM profiles WHERE owner_username = ? AND is_following = 1 AND verified = 1;'],
      [null, 'Most Followed Profiles (Top 50)', 'SELECT username, displayName, followerCount FROM profiles WHERE owner_username = ? ORDER BY followerCount DESC LIMIT 50;'],
      [null, 'Profiles with Zero or Low Following', 'SELECT username, displayName, followingCount FROM profiles WHERE owner_username = ? AND followingCount <= 10 ORDER BY followingCount ASC;'],
      [null, 'Recently Followed (Last 30 Days)', 'SELECT * FROM profiles WHERE owner_username = ? AND following_date >= date(\'now\', \'-30 days\') ORDER BY following_date DESC;'],
      [null, 'Follower Growth Opportunity (Following me but I dont follow back)', 'SELECT username, displayName, followerCount FROM profiles WHERE owner_username = ? AND is_follower = 1 AND is_following = 0;'],
      [null, 'Failed Fetches', 'SELECT username, error FROM profiles WHERE owner_username = ? AND status = \'failed\';'],
      [null, 'Owner Overview', 'SELECT * FROM userJson WHERE userName = ?;'],
      [null, 'Owner API Data', 'SELECT * FROM userApi WHERE username = ?;'],
      [null, 'Fetch Completion History', 'SELECT * FROM fetch_meta WHERE owner_username = ? ORDER BY completed_at DESC;']
    ];
    for (const [owner, name, sql] of queries) {
      stmt.bind([owner, name, sql]);
      stmt.step();
      stmt.reset();
    }
    stmt.free();
  }
}

// --- Insert / Upsert functions unchanged ---

export function insertUserJson(meObj) {
  if (!state.sqliteReady || !state.sqliteDB) return;
  const db = state.sqliteDB;
  db.jaferExec('PRAGMA foreign_keys = ON');
  const stmt = db._db.prepare(
    `INSERT OR REPLACE INTO userJson VALUES (
      :userName, :accountRegion, :birthDate, :displayName,
      :emailAddress, :profilePhoto, :telephoneNumber,
      :followerCount, :followingCount, :likesReceived,
      :rawFollowingJson, :cleanFollowingJson,
      :rawFollowerJson, :cleanFollowersJson, :friendsJson
    )`
  );
  stmt.bind({
    ':userName': meObj.userName || '',
    ':accountRegion': meObj.accountRegion || null,
    ':birthDate': meObj.birthDate || null,
    ':displayName': meObj.displayName || null,
    ':emailAddress': meObj.emailAddress || null,
    ':profilePhoto': meObj.profilePhoto || null,
    ':telephoneNumber': meObj.telephoneNumber || null,
    ':followerCount': meObj.followerCount || 0,
    ':followingCount': meObj.followingCount || 0,
    ':likesReceived': meObj.likesReceived || 0,
    ':rawFollowingJson': meObj.rawFollowingJson || 0,
    ':cleanFollowingJson': meObj.cleanFollowingJson || 0,
    ':rawFollowerJson': meObj.rawFollowerJson || 0,
    ':cleanFollowersJson': meObj.cleanFollowersJson || 0,
    ':friendsJson': meObj.friendsJson || 0,
  });
  stmt.step();
  stmt.free();
}

export async function insertUserApi(flat) {
  if (!state.sqliteReady || !state.sqliteDB) return;
  const db = state.sqliteDB;
  db.jaferExec('PRAGMA foreign_keys = ON');
  let avatarBinary = null;
  if (flat.avatar instanceof Blob) {
    const buf = await flat.avatar.arrayBuffer();
    avatarBinary = new Uint8Array(buf);
  }
  const stmt = db._db.prepare(
    `INSERT OR REPLACE INTO userApi VALUES (
      :username, :displayName, :avatarUrl, :bio,
      :verified, :privateAccount, :secUid,
      :followerCount, :followingCount, :heartCount, :videoCount,
      :status, :error, :avatar, :fetched_at
    )`
  );
  stmt.bind({
    ':username': flat.username,
    ':displayName': flat.displayName || null,
    ':avatarUrl': flat.avatarUrl || null,
    ':bio': flat.bio || null,
    ':verified': flat.verified ? 1 : 0,
    ':privateAccount': flat.privateAccount ? 1 : 0,
    ':secUid': flat.secUid || null,
    ':followerCount': flat.followerCount || 0,
    ':followingCount': flat.followingCount || 0,
    ':heartCount': flat.heartCount || 0,
    ':videoCount': flat.videoCount || 0,
    ':status': flat.status || 'success',
    ':error': flat.error || null,
    ':avatar': avatarBinary,
    ':fetched_at': new Date().toISOString(),
  });
  stmt.step();
  stmt.free();
}

export async function upsertProfile(flat, ownerUsername, relationship = {}) {
  if (!state.sqliteReady || !state.sqliteDB) return;
  const db = state.sqliteDB;
  db.jaferExec('PRAGMA foreign_keys = ON');
  
  let friendship = 'none';
  const isFollowing = relationship.isFollowing || false;
  const isFollower = relationship.isFollower || false;
  const isBlocked = relationship.isBlocked || false;
  
  if (isBlocked) friendship = 'blocked';
  else if (isFollowing && isFollower) friendship = 'friend';
  else if (isFollowing) friendship = 'following';
  else if (isFollower) friendship = 'follower';
  
  let avatarBinary = null;
  if (flat.avatar instanceof Blob) {
    const buf = await flat.avatar.arrayBuffer();
    avatarBinary = new Uint8Array(buf);
  }
  
  const stmt = db._db.prepare(
    `INSERT OR REPLACE INTO profiles VALUES (
      :owner_username, :username,
      :is_following, :is_follower, :is_blocked,
      :friendship,
      :following_date, :follower_date, :blocked_date,
      :displayName, :avatarUrl, :bio,
      :verified, :privateAccount, :secUid,
      :followerCount, :followingCount, :heartCount, :videoCount,
      :status, :error, :avatar
    )`
  );
  stmt.bind({
    ':owner_username': ownerUsername,
    ':username': flat.username,
    ':is_following': isFollowing ? 1 : 0,
    ':is_follower': isFollower ? 1 : 0,
    ':is_blocked': isBlocked ? 1 : 0,
    ':friendship': friendship,
    ':following_date': relationship.following_date || null,
    ':follower_date': relationship.follower_date || null,
    ':blocked_date': relationship.blocked_date || null,
    ':displayName': flat.displayName || null,
    ':avatarUrl': flat.avatarUrl || null,
    ':bio': flat.bio || null,
    ':verified': flat.verified ? 1 : 0,
    ':privateAccount': flat.privateAccount ? 1 : 0,
    ':secUid': flat.secUid || null,
    ':followerCount': flat.followerCount || 0,
    ':followingCount': flat.followingCount || 0,
    ':heartCount': flat.heartCount || 0,
    ':videoCount': flat.videoCount || 0,
    ':status': flat.status || 'success',
    ':error': flat.error || null,
    ':avatar': avatarBinary,
  });
  stmt.step();
  stmt.free();
}

export function recordFetchCompletion(completedAt, ownerUsername) {
  if (!state.sqliteReady || !state.sqliteDB) return;
  const db = state.sqliteDB;
  db.jaferExec('PRAGMA foreign_keys = ON');
  db.jaferRun(
    `INSERT OR REPLACE INTO fetch_meta (owner_username, completed_at) VALUES (?, ?)`,
    [ownerUsername, completedAt]
  );
}

export function updateStatusDisplay() {
  if (!DOM.dbStatusEl) return;
  if (!state.sqliteReady) {
    DOM.dbStatusEl.textContent = 'DB not ready';
    return;
  }
  try {
    const rows = state.sqliteDB.jaferAll('SELECT COUNT(*) as cnt FROM profiles');
    const cnt = rows?.[0]?.cnt || 0;
    DOM.dbStatusEl.textContent = `DB loaded: ${cnt} profiles in 'profiles'`;
  } catch (e) {
    DOM.dbStatusEl.textContent = 'DB error';
  }
}