-- 云大星球 · 数据库表结构（账号版）
-- 在 Cloudflare D1 的 Console 里整段粘贴执行。
--
-- ⚠️ 注意：本脚本会先删除并重建 posts / replies 两张表。
--    如果这两张表里已经有大家发的帖子，先别执行，告诉我，我给你无损的迁移脚本。

DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS replies;
DROP TABLE IF EXISTS profiles;   -- 上一版（邮箱验证）的遗留表，已废弃
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS login_fails;
DROP TABLE IF EXISTS users;

-- ---------- 用户 ----------
CREATE TABLE users (
  id            TEXT    PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE,          -- 自选登录账号（3-20 位字母数字下划线）
  salt          TEXT    NOT NULL,                 -- 每个账号独立的派生盐
  pass_hash     TEXT    NOT NULL,                 -- SHA-256(服务端 pepper + 前端派生值)，不存明文密码
  display_name  TEXT,                             -- 帖子里公开显示的昵称（默认 = 账号名）
  real_name     TEXT,                             -- 真实姓名
  major         TEXT,                             -- 所在专业
  verify_status TEXT    NOT NULL DEFAULT 'pending', -- pending 待审核 / verified 已认证
  created_at    INTEGER NOT NULL,
  approved_at   INTEGER
);

-- ---------- 登录态（会话） ----------
CREATE TABLE sessions (
  token      TEXT    PRIMARY KEY,                 -- 随机 32 字节，存在 HttpOnly Cookie 里
  user_id    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

-- ---------- 登录失败计数（防暴力破解） ----------
CREATE TABLE login_fails (
  username     TEXT    PRIMARY KEY,
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

-- ---------- 帖子 ----------
CREATE TABLE posts (
  id           TEXT    PRIMARY KEY,
  board        TEXT    NOT NULL,                  -- discuss 学习讨论 / forum 校内论坛
  category     TEXT    NOT NULL,
  title        TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  author_id    TEXT    NOT NULL,                  -- 所属账号，永不返回给前端
  author_name  TEXT,                              -- 当时的昵称快照（匿名帖也存，便于追溯）
  is_anonymous INTEGER NOT NULL DEFAULT 0,        -- 1 = 对外显示"匿名同学"
  created_at   INTEGER NOT NULL,
  is_deleted   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_posts_board_time ON posts (board, created_at DESC);
CREATE INDEX idx_posts_author     ON posts (author_id);

-- ---------- 回复 ----------
CREATE TABLE replies (
  id           TEXT    PRIMARY KEY,
  post_id      TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  author_id    TEXT    NOT NULL,
  author_name  TEXT,
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  is_deleted   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_replies_post ON replies (post_id, created_at ASC);
