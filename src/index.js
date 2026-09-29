/**
 * 云大星球 · 站点 Worker（账号版）
 *
 * 职责：
 *   1. /api/*            接口：注册 / 登录 / 退出 / 完善资料 / 帖子 / 回复
 *   2. 登录页等公开资源    /login.html、/favicon.*
 *   3. 其余所有路径       整站门禁：没登录 → 跳登录页；资料没填完 → 跳去填资料
 *   4. 页面注入账号小条   显示当前账号 + 我的账号 + 退出
 *
 * 密码方案（重要）：
 *   浏览器端 PBKDF2-SHA256(盐, 密码, 100000 次) 得到 A，只把 A 发上来；
 *   服务器端存 SHA-256(pepper + 账号 + A)，pepper 是只有服务器知道的密钥。
 *   好处：① 服务器从不接触明文密码；② 单次请求 CPU 极低（免费版 10ms 上限内）；
 *        ③ 数据库即使泄露，没有 pepper 也无法伪造 A 登录。
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api" || path.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    if (isPublicPath(path)) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response("缺少静态资源绑定", { status: 500 });
    }

    if (!flag(env.REQUIRE_LOGIN, true)) {
      return serveAsset(request, env, null);
    }

    const user = await currentUser(request, env);
    if (!user) {
      return redirect("/login.html?next=" + encodeURIComponent(path + url.search));
    }
    if (flag(env.REQUIRE_PROFILE, true) && (!user.real_name || !user.major)) {
      return redirect("/login.html?next=" + encodeURIComponent(path + url.search) + "#profile");
    }
    return serveAsset(request, env, user);
  }
};

/* ================= 静态资源 ================= */

function isPublicPath(path) {
  return (
    path === "/login.html" ||
    path === "/login" ||
    path === "/admin.html" ||
    path === "/favicon.svg" ||
    path === "/favicon.ico" ||
    path === "/robots.txt"
  );
}

async function serveAsset(request, env, user) {
  if (!env.ASSETS) return new Response("缺少静态资源绑定", { status: 500 });
  const res = await env.ASSETS.fetch(request);
  const type = res.headers.get("content-type") || "";
  if (!user || type.indexOf("text/html") === -1) return res;
  return injectAccountBar(res, user);
}

function injectAccountBar(res, user) {
  const name = escapeHtml(user.display_name || user.username || "");
  const html =
    '<div id="yzAccountBar" style="position:fixed;left:14px;bottom:14px;z-index:2147483000;' +
    "display:flex;align-items:center;gap:7px;padding:7px 12px;border-radius:999px;" +
    "background:rgba(255,255,255,.93);border:1px solid rgba(40,40,80,.10);" +
    'box-shadow:0 4px 14px rgba(40,40,80,.10);font:13px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#3a3f52">' +
    "<span>👤 " +
    name +
    "</span>" +
    '<span style="opacity:.3">|</span>' +
    '<a href="/login.html" style="color:#4f6ef7;text-decoration:none">我的账号</a>' +
    '<span style="opacity:.3">|</span>' +
    '<a href="/api/auth/logout" style="color:#8a90a2;text-decoration:none">退出</a>' +
    "</div>";
  return new HTMLRewriter()
    .on("body", {
      element(el) {
        el.append(html, { html: true });
      }
    })
    .transform(res);
}

/* ================= 接口总入口 ================= */

const LIMITS = {
  username: 20,
  nickname: 16,
  realName: 20,
  major: 40,
  title: 60,
  content: 3000,
  reply: 1000
};

async function handleApi(request, env, url) {
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);

  try {
    if (!env.DB) return json({ error: "服务端未绑定数据库（D1 绑定 DB 未生效）" }, 500);

    if (parts[0] === "health") return json({ ok: true });

    if (parts[0] === "auth") return handleAuth(request, env, parts, url);

    if (parts[0] === "admin") return handleAdmin(request, env, parts);

    const user = await currentUser(request, env);
    if (!user) return json({ error: "未登录", needLogin: true }, 401);

    if (parts[0] !== "posts") return json({ error: "接口不存在" }, 404);

    if (parts.length === 1) {
      if (request.method === "GET") return listPosts(url, env, user);
      if (request.method === "POST") return createPost(request, env, user);
      return json({ error: "方法不支持" }, 405);
    }

    const postId = parts[1];

    if (parts.length === 2) {
      if (request.method === "GET") return getThread(postId, env, user);
      if (request.method === "DELETE") return deletePost(postId, env, user);
      return json({ error: "方法不支持" }, 405);
    }

    if (parts[2] === "replies") {
      if (parts.length === 3 && request.method === "POST") return createReply(request, env, user, postId);
      if (parts.length === 4 && request.method === "DELETE") return deleteReply(env, user, parts[3]);
      return json({ error: "方法不支持" }, 405);
    }

    return json({ error: "接口不存在" }, 404);
  } catch (err) {
    return json({ error: "服务器错误：" + (err && err.message ? err.message : "未知") }, 500);
  }
}

/* ================= 账号：注册 / 登录 / 会话 ================= */

const SESSION_COOKIE = "yz_session";
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

async function handleAuth(request, env, parts, url) {
  const action = parts[1];

  if (action === "salt") {
    const username = normUsername(url.searchParams.get("username"));
    if (!username) return json({ error: "账号格式不正确" }, 400);
    const row = await env.DB.prepare("SELECT salt FROM users WHERE username = ?").bind(username).first();
    return json({ salt: row ? row.salt : await fakeSalt(env, username) });
  }

  if (action === "register" && request.method === "POST") {
    const body = await readJson(request);
    const username = normUsername(body.username);
    const salt = str(body.salt, 64).trim();
    const passHash = normaliseHash(body.passHash);

    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      return json({ error: "账号需 3-20 位，只能用字母、数字、下划线" }, 400);
    }
    if (!/^[a-f0-9]{16,64}$/.test(salt)) return json({ error: "注册参数不完整，请重试" }, 400);
    if (!passHash) return json({ error: "注册参数不完整，请重试" }, 400);

    const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (exists) return json({ error: "这个账号名已经被使用了，换一个吧" }, 409);

    const id = newId();
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO users (id, username, salt, pass_hash, display_name, real_name, major, verify_status, created_at) " +
        "VALUES (?, ?, ?, ?, ?, NULL, NULL, 'pending', ?)"
    )
      .bind(id, username, salt, await serverHash(env, username, passHash), username, now)
      .run();

    return await issueSession(env, { id: id, username: username, display_name: username, real_name: null, major: null, verify_status: "pending" }, 201);
  }

  if (action === "login" && request.method === "POST") {
    const body = await readJson(request);
    const username = normUsername(body.username);
    const passHash = normaliseHash(body.passHash);
    if (!username || !passHash) return json({ error: "请输入账号和密码" }, 400);

    const throttle = await env.DB.prepare("SELECT fails, locked_until FROM login_fails WHERE username = ?")
      .bind(username)
      .first();
    if (throttle && Number(throttle.locked_until) > Date.now()) {
      const left = Math.ceil((Number(throttle.locked_until) - Date.now()) / 1000);
      return json({ error: "尝试次数过多，请 " + left + " 秒后再试" }, 429);
    }

    const row = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    const target = await serverHash(env, username, passHash);
    const ok = !!(row && row.pass_hash === target);

    if (!ok) {
      const fails = (throttle ? Number(throttle.fails) : 0) + 1;
      const lock = fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0;
      await env.DB.prepare(
        "INSERT INTO login_fails (username, fails, locked_until) VALUES (?, ?, ?) " +
          "ON CONFLICT(username) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until"
      )
        .bind(username, fails >= MAX_FAILS ? 0 : fails, lock)
        .run();
      return json(
        { error: lock ? "连续错误 5 次，请 5 分钟后再试" : "账号或密码不正确（已错 " + fails + "/" + MAX_FAILS + " 次）" },
        401
      );
    }

    await env.DB.prepare("DELETE FROM login_fails WHERE username = ?").bind(username).run();
    return await issueSession(env, row, 200);
  }

  if (action === "logout") {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/login.html",
        "Set-Cookie": SESSION_COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
      }
    });
  }

  if (action === "me") {
    const user = await currentUser(request, env);
    if (!user) return json({ loggedIn: false }, 200);
    return json({ loggedIn: true, profile: publicProfile(user) });
  }

  if (action === "profile" && request.method === "PUT") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "未登录", needLogin: true }, 401);

    const body = await readJson(request);
    const realName = str(body.realName, LIMITS.realName).trim();
    const major = str(body.major, LIMITS.major).trim();
    const nickname = str(body.displayName, LIMITS.nickname).trim();

    if (!realName || realName.length < 2) return json({ error: "请填写真实姓名（至少 2 个字）" }, 400);
    if (!major || major.length < 2) return json({ error: "请填写所在专业" }, 400);

    await env.DB.prepare(
      "UPDATE users SET real_name = ?, major = ?, display_name = COALESCE(NULLIF(?, ''), display_name) WHERE id = ?"
    )
      .bind(realName, major, nickname, user.id)
      .run();

    const fresh = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
    return json({ ok: true, profile: publicProfile(fresh) });
  }

  if (action === "password" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "未登录", needLogin: true }, 401);

    const body = await readJson(request);
    const oldHash = normaliseHash(body.oldPassHash);
    const newHash = normaliseHash(body.newPassHash);
    const newSalt = str(body.newSalt, 64).trim();
    if (!oldHash || !newHash || !/^[a-f0-9]{16,64}$/.test(newSalt)) {
      return json({ error: "参数不完整，请重试" }, 400);
    }
    const target = await serverHash(env, user.username, oldHash);
    if (target !== user.pass_hash) return json({ error: "当前密码不正确" }, 403);

    await env.DB.prepare("UPDATE users SET salt = ?, pass_hash = ? WHERE id = ?")
      .bind(newSalt, await serverHash(env, user.username, newHash), user.id)
      .run();
    return json({ ok: true });
  }

  return json({ error: "接口不存在" }, 404);
}

async function issueSession(env, user, status) {
  const token = randomHex(32);
  const days = Math.max(Number(env.SESSION_DAYS) || 30, 1);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(token, user.id, now, now + days * 86400000)
    .run();
  return new Response(JSON.stringify({ ok: true, profile: publicProfile(user) }), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie":
        SESSION_COOKIE + "=" + token + "; Path=/; Max-Age=" + days * 86400 + "; HttpOnly; Secure; SameSite=Lax"
    }
  });
}

async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const session = await env.DB.prepare("SELECT * FROM sessions WHERE token = ?").bind(token).first();
  if (!session) return null;
  if (Number(session.expires_at) < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(session.user_id).first();
}

function publicProfile(user) {
  return {
    username: user.username,
    displayName: user.display_name || user.username,
    realName: user.real_name || "",
    major: user.major || "",
    verifyStatus: user.verify_status || "pending",
    profileComplete: !!(user.real_name && user.major)
  };
}

/* 服务器端再掺一层只有服务器知道的密钥 */
async function serverHash(env, username, passHash) {
  const pepper = env.AUTH_PEPPER || "yunda-planet-default-pepper";
  return await sha256Hex(pepper + ":" + username + ":" + passHash);
}

/* 账号不存在时返回一个固定假盐，避免通过响应差异猜出哪些账号已被注册 */
async function fakeSalt(env, username) {
  const pepper = env.AUTH_PEPPER || "yunda-planet-default-pepper";
  return (await sha256Hex("salt:" + pepper + ":" + username)).slice(0, 32);
}

function normaliseHash(value) {
  const s = str(value, 128).trim().toLowerCase();
  return /^[a-f0-9]{32,128}$/.test(s) ? s : "";
}

function normUsername(value) {
  return str(value, LIMITS.username).trim();
}

/* ================= 帖子 ================= */

async function listPosts(url, env, user) {
  const board = str(url.searchParams.get("board"), 24) || "forum";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  const { results } = await env.DB.prepare(
    "SELECT p.*, (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.is_deleted = 0) AS reply_count " +
      "FROM posts p WHERE p.board = ? AND p.is_deleted = 0 ORDER BY p.created_at DESC LIMIT ? OFFSET ?"
  )
    .bind(board, limit, offset)
    .all();

  return json({
    board: board,
    posts: (results || []).map(function (row) {
      return toPost(row, user, row.reply_count);
    })
  });
}

async function getThread(postId, env, user) {
  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ? AND is_deleted = 0").bind(postId).first();
  if (!row) return json({ error: "帖子不存在或已删除" }, 404);

  const { results } = await env.DB.prepare(
    "SELECT * FROM replies WHERE post_id = ? AND is_deleted = 0 ORDER BY created_at ASC"
  )
    .bind(postId)
    .all();

  return json({
    post: toPost(row, user, (results || []).length),
    replies: (results || []).map(function (r) {
      return toReply(r, user);
    })
  });
}

async function createPost(request, env, user) {
  const body = await readJson(request);
  const category = str(body.category, 24).trim();
  const title = str(body.title, LIMITS.title).trim();
  const content = str(body.content, LIMITS.content).trim();
  const anonymous = body.anonymous === true || body.anonymous === 1 || body.anonymous === "1";

  if (!category) return json({ error: "请选择板块" }, 400);
  if (!title) return json({ error: "请填写帖子标题" }, 400);
  if (!content) return json({ error: "请填写帖子内容" }, 400);

  const name = await resolveName(env, user, body.nickname, anonymous);
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO posts (id, board, category, title, content, author_id, author_name, is_anonymous, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, body.board === "discuss" ? "discuss" : "forum", category, title, content, user.id, name, anonymous ? 1 : 0, Date.now())
    .run();

  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  return json({ post: toPost(row, user, 0) }, 201);
}

async function deletePost(postId, env, user) {
  const row = await env.DB.prepare("SELECT author_id FROM posts WHERE id = ?").bind(postId).first();
  if (!row) return json({ error: "帖子不存在" }, 404);
  if (row.author_id !== user.id) return json({ error: "只能删除自己发布的帖子" }, 403);
  await env.DB.prepare("UPDATE posts SET is_deleted = 1 WHERE id = ?").bind(postId).run();
  return json({ ok: true });
}

async function createReply(request, env, user, postId) {
  const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND is_deleted = 0").bind(postId).first();
  if (!post) return json({ error: "帖子不存在或已删除" }, 404);

  const body = await readJson(request);
  const content = str(body.content, LIMITS.reply).trim();
  const anonymous = body.anonymous === true || body.anonymous === 1 || body.anonymous === "1";
  if (!content) return json({ error: "回复内容不能为空" }, 400);

  const name = await resolveName(env, user, body.nickname, anonymous);
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO replies (id, post_id, content, author_id, author_name, is_anonymous, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, postId, content, user.id, name, anonymous ? 1 : 0, Date.now())
    .run();

  const row = await env.DB.prepare("SELECT * FROM replies WHERE id = ?").bind(id).first();
  return json({ reply: toReply(row, user) }, 201);
}

async function deleteReply(env, user, replyId) {
  const row = await env.DB.prepare("SELECT author_id FROM replies WHERE id = ?").bind(replyId).first();
  if (!row) return json({ error: "回复不存在" }, 404);
  if (row.author_id !== user.id) return json({ error: "只能删除自己的回复" }, 403);
  await env.DB.prepare("UPDATE replies SET is_deleted = 1 WHERE id = ?").bind(replyId).run();
  return json({ ok: true });
}

/* ---------------- 输出整形（绝不返回账号、姓名、专业、密码） ---------------- */

function toPost(row, user, replyCount) {
  return {
    id: row.id,
    board: row.board,
    category: row.category,
    title: row.title,
    content: row.content,
    author: maskName(row),
    isAnonymous: !!row.is_anonymous,
    mine: row.author_id === user.id,
    createdAt: row.created_at,
    createdAtText: fmtTime(row.created_at),
    replyCount: Number(replyCount) || 0
  };
}

function toReply(row, user) {
  return {
    id: row.id,
    author: maskName(row),
    content: row.content,
    isAnonymous: !!row.is_anonymous,
    mine: row.author_id === user.id,
    createdAt: row.created_at,
    createdAtText: fmtTime(row.created_at)
  };
}

function maskName(row) {
  if (row.is_anonymous) return "匿名同学";
  return row.author_name || "云大学子";
}

async function resolveName(env, user, rawNickname, anonymous) {
  const typed = str(rawNickname, LIMITS.nickname).trim();
  if (typed) {
    if (!anonymous) {
      await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(typed, user.id).run();
    }
    return typed;
  }
  return user.display_name || user.username || "云大学子";
}

/* ================= 工具 ================= */

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map(function (b) {
      return b.toString(16).padStart(2, "0");
    })
    .join("");
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map(function (b) {
      return b.toString(16).padStart(2, "0");
    })
    .join("");
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const parts = raw.split(";");
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].trim();
    const eq = seg.indexOf("=");
    if (eq > 0 && seg.slice(0, eq) === name) return seg.slice(eq + 1);
  }
  return null;
}

function flag(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return fallback;
}

const TIME_FMT = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function fmtTime(ms) {
  const parts = TIME_FMT.formatToParts(new Date(Number(ms) || Date.now()));
  const pick = function (type) {
    const found = parts.find(function (p) {
      return p.type === type;
    });
    return found ? found.value : "";
  };
  return pick("year") + "/" + pick("month") + "/" + pick("day") + " " + pick("hour") + ":" + pick("minute");
}

function str(value, max) {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch;
  });
}

async function readJson(request) {
  try {
    const data = await request.json();
    return data && typeof data === "object" ? data : {};
  } catch (e) {
    return {};
  }
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

/* ================= 管理员工具 =================
 * 入口：/admin.html ，所有接口都要带请求头 x-admin-key
 * 密钥来自控制台 Secret：ADMIN_KEY（没配置时一律拒绝，不会放行）
 * 功能：查看账号名单 / 标记实名认证 / 重置他人密码
 */

const ADMIN_LOCK_KEY = "__admin__";
const ADMIN_MAX_FAILS = 10;
const ADMIN_LOCK_MS = 10 * 60 * 1000;

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_KEY) {
    return {
      error: json(
        { error: "服务端未配置管理员密钥。请在 Cloudflare 控制台为本项目添加加密变量 ADMIN_KEY 后再试。" },
        503
      )
    };
  }

  const throttle = await env.DB.prepare("SELECT fails, locked_until FROM login_fails WHERE username = ?")
    .bind(ADMIN_LOCK_KEY)
    .first();
  if (throttle && Number(throttle.locked_until) > Date.now()) {
    const left = Math.ceil((Number(throttle.locked_until) - Date.now()) / 60000);
    return { error: json({ error: "密钥错误次数过多，请 " + left + " 分钟后再试" }, 429) };
  }

  const given = request.headers.get("x-admin-key") || "";
  if (!safeEqual(given, env.ADMIN_KEY)) {
    const fails = (throttle ? Number(throttle.fails) : 0) + 1;
    const lock = fails >= ADMIN_MAX_FAILS ? Date.now() + ADMIN_LOCK_MS : 0;
    await env.DB.prepare(
      "INSERT INTO login_fails (username, fails, locked_until) VALUES (?, ?, ?) " +
        "ON CONFLICT(username) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until"
    )
      .bind(ADMIN_LOCK_KEY, fails >= ADMIN_MAX_FAILS ? 0 : fails, lock)
      .run();
    return { error: json({ error: lock ? "密钥错误次数过多，已锁定 10 分钟" : "管理员密钥不正确" }, 401) };
  }

  await env.DB.prepare("DELETE FROM login_fails WHERE username = ?").bind(ADMIN_LOCK_KEY).run();
  return { ok: true };
}

async function handleAdmin(request, env, parts) {
  const action = parts[1];
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;

  if (action === "users") {
    const { results } = await env.DB.prepare(
      "SELECT u.username, u.display_name, u.real_name, u.major, u.verify_status, u.created_at, " +
        "(SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.is_deleted = 0) AS post_count, " +
        "(SELECT COUNT(*) FROM replies r WHERE r.author_id = u.id AND r.is_deleted = 0) AS reply_count " +
        "FROM users u ORDER BY u.created_at DESC"
    ).all();

    return json({
      users: (results || []).map(function (r) {
        return {
          username: r.username,
          displayName: r.display_name || r.username,
          realName: r.real_name || "",
          major: r.major || "",
          verifyStatus: r.verify_status || "pending",
          createdAtText: fmtTime(r.created_at),
          postCount: Number(r.post_count) || 0,
          replyCount: Number(r.reply_count) || 0,
          profileComplete: !!(r.real_name && r.major)
        };
      })
    });
  }

  if (action === "verify" && request.method === "POST") {
    const body = await readJson(request);
    const username = normUsername(body.username);
    const verified = body.verified === true || body.verified === "1" || body.verified === 1;
    if (!username) return json({ error: "请指定账号" }, 400);
    const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (!row) return json({ error: "账号不存在" }, 404);
    await env.DB.prepare("UPDATE users SET verify_status = ?, approved_at = ? WHERE id = ?")
      .bind(verified ? "verified" : "pending", verified ? Date.now() : null, row.id)
      .run();
    return json({ ok: true, verifyStatus: verified ? "verified" : "pending" });
  }

  if (action === "reset-password" && request.method === "POST") {
    const body = await readJson(request);
    const username = normUsername(body.username);
    const newSalt = str(body.newSalt, 64).trim();
    const newPassHash = normaliseHash(body.newPassHash);

    if (!username) return json({ error: "请指定账号" }, 400);
    if (!/^[a-f0-9]{16,64}$/.test(newSalt) || !newPassHash) {
      return json({ error: "参数不完整，请重试" }, 400);
    }

    const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (!row) return json({ error: "账号不存在" }, 404);

    await env.DB.prepare("UPDATE users SET salt = ?, pass_hash = ? WHERE id = ?")
      .bind(newSalt, await serverHash(env, username, newPassHash), row.id)
      .run();
    /* 顺手踢掉这个账号所有已登录的会话，避免别人拿着旧登录态继续用 */
    const kicked = await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.id).run();

    return json({ ok: true, sessionsCleared: true, kicked: !!(kicked && kicked.meta) });
  }

  return json({ error: "接口不存在" }, 404);
}
