-- ============================================================
-- TikTok Profiles Relational Schema
-- ============================================================
PRAGMA foreign_keys = ON;

-- Owner table (app user who uploaded the JSON)
CREATE TABLE IF NOT EXISTS userJson (
    userName TEXT PRIMARY KEY,
    accountRegion TEXT,
    birthDate TEXT,
    displayName TEXT,
    emailAddress TEXT,
    profilePhoto TEXT,
    telephoneNumber TEXT,
    followerCount INTEGER,
    followingCount INTEGER,
    likesReceived INTEGER,
    rawFollowingJson INTEGER,
    cleanFollowingJson INTEGER,
    rawFollowerJson INTEGER,
    cleanFollowersJson INTEGER,
    friendsJson INTEGER
);

-- Owner's own profile data fetched from API
CREATE TABLE IF NOT EXISTS userApi (
    username TEXT PRIMARY KEY REFERENCES userJson(userName) ON DELETE CASCADE,
    displayName TEXT,
    avatarUrl TEXT,
    bio TEXT,
    verified INTEGER,
    privateAccount INTEGER,
    secUid TEXT,
    followerCount INTEGER,
    followingCount INTEGER,
    heartCount INTEGER,
    videoCount INTEGER,
    status TEXT,
    error TEXT,
    avatar BLOB,
    fetched_at TEXT
);

-- Unified profiles table (following, followers, blocked, etc.)
CREATE TABLE IF NOT EXISTS profiles (
    owner_username TEXT NOT NULL REFERENCES userJson(userName) ON DELETE CASCADE,
    username TEXT NOT NULL,
    is_following INTEGER NOT NULL DEFAULT 0,
    is_follower  INTEGER NOT NULL DEFAULT 0,
    is_blocked   INTEGER NOT NULL DEFAULT 0,
    friendship TEXT NOT NULL DEFAULT 'none',
    following_date TEXT,
    follower_date  TEXT,
    blocked_date   TEXT,
    displayName TEXT,
    avatarUrl TEXT,
    bio TEXT,
    verified INTEGER,
    privateAccount INTEGER,
    secUid TEXT,
    followerCount INTEGER,
    followingCount INTEGER,
    heartCount INTEGER,
    videoCount INTEGER,
    status TEXT,
    error TEXT,
    avatar BLOB,
    PRIMARY KEY (owner_username, username)
);

-- Fetch metadata per owner
CREATE TABLE IF NOT EXISTS fetch_meta (
    owner_username TEXT PRIMARY KEY REFERENCES userJson(userName) ON DELETE CASCADE,
    completed_at TEXT
);

-- Saved queries (global – not tied to a specific owner)
CREATE TABLE IF NOT EXISTS saved_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_username TEXT,
    name TEXT NOT NULL,
    sql_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Convenience Views
-- ============================================================
CREATE VIEW IF NOT EXISTS vw_following AS
SELECT *
FROM profiles
WHERE is_following = 1;

CREATE VIEW IF NOT EXISTS vw_followers AS
SELECT *
FROM profiles
WHERE is_follower = 1;

CREATE VIEW IF NOT EXISTS vw_friends AS
SELECT *
FROM profiles
WHERE is_following = 1 AND is_follower = 1;

CREATE VIEW IF NOT EXISTS vw_blocked AS
SELECT *
FROM profiles
WHERE is_blocked = 1;

CREATE VIEW IF NOT EXISTS vw_following_only AS
SELECT *
FROM profiles
WHERE is_following = 1 AND is_follower = 0;

CREATE VIEW IF NOT EXISTS vw_followers_only AS
SELECT *
FROM profiles
WHERE is_follower = 1 AND is_following = 0;

CREATE VIEW IF NOT EXISTS vw_blocked_with_follow AS
SELECT *
FROM profiles
WHERE is_blocked = 1 AND is_following = 1;

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
GROUP BY owner_username;

CREATE VIEW IF NOT EXISTS vw_verified_profiles AS
SELECT *
FROM profiles
WHERE verified = 1;

CREATE VIEW IF NOT EXISTS vw_full_user_data AS
SELECT
    p.owner_username,
    p.username,
    p.displayName,
    p.avatarUrl,
    p.bio,
    p.verified,
    p.privateAccount,
    p.secUid,
    p.followerCount AS profile_followerCount,
    p.followingCount AS profile_followingCount,
    p.heartCount,
    p.videoCount,
    p.friendship,
    p.is_following,
    p.is_follower,
    p.is_blocked,
    p.following_date,
    p.follower_date,
    p.blocked_date,
    p.status,
    p.error,
    uj.userName AS owner_userName,
    uj.displayName AS owner_displayName,
    uj.followerCount AS owner_followerCount,
    uj.followingCount AS owner_followingCount,
    uj.likesReceived AS owner_likesReceived,
    uj.rawFollowingJson,
    uj.cleanFollowingJson,
    uj.rawFollowerJson,
    uj.cleanFollowersJson,
    uj.friendsJson,
    ua.bio AS owner_bio,
    ua.avatarUrl AS owner_avatarUrl,
    ua.fetched_at
FROM profiles p
JOIN userJson uj ON p.owner_username = uj.userName
LEFT JOIN userApi ua ON uj.userName = ua.username;

CREATE VIEW IF NOT EXISTS vw_saved_queries AS
SELECT
    id,
    owner_username,
    name,
    sql_text,
    created_at
FROM saved_queries
ORDER BY created_at DESC;

-- ============================================================
-- Seed Important Queries
-- ============================================================
INSERT INTO saved_queries (owner_username, name, sql_text)
VALUES
(NULL, 'All Following (current owner)', 
 'SELECT * FROM profiles WHERE owner_username = ? AND is_following = 1 ORDER BY username;'),

(NULL, 'All Followers (mutual + imported)', 
 'SELECT * FROM profiles WHERE owner_username = ? AND is_follower = 1 ORDER BY username;'),

(NULL, 'Mutual Friends', 
 'SELECT * FROM profiles WHERE owner_username = ? AND is_following = 1 AND is_follower = 1;'),

(NULL, 'Blocked Users', 
 'SELECT * FROM profiles WHERE owner_username = ? AND is_blocked = 1;'),

(NULL, 'Verified Accounts I Follow', 
 'SELECT * FROM profiles WHERE owner_username = ? AND is_following = 1 AND verified = 1;'),

(NULL, 'Most Followed Profiles (Top 50)', 
 'SELECT username, displayName, followerCount FROM profiles WHERE owner_username = ? ORDER BY followerCount DESC LIMIT 50;'),

(NULL, 'Profiles with Zero or Low Following', 
 'SELECT username, displayName, followingCount FROM profiles WHERE owner_username = ? AND followingCount <= 10 ORDER BY followingCount ASC;'),

(NULL, 'Recently Followed (Last 30 Days)', 
 'SELECT * FROM profiles WHERE owner_username = ? AND following_date >= date(''now'', ''-30 days'') ORDER BY following_date DESC;'),

(NULL, 'Follower Growth Opportunity (Following me but I don''t follow back)', 
 'SELECT username, displayName, followerCount FROM profiles WHERE owner_username = ? AND is_follower = 1 AND is_following = 0;'),

(NULL, 'Failed Fetches', 
 'SELECT username, error FROM profiles WHERE owner_username = ? AND status = ''failed'';'),

(NULL, 'Owner Overview', 
 'SELECT * FROM userJson WHERE userName = ?;'),

(NULL, 'Owner API Data', 
 'SELECT * FROM userApi WHERE username = ?;'),

(NULL, 'Fetch Completion History', 
 'SELECT * FROM fetch_meta WHERE owner_username = ? ORDER BY completed_at DESC;');