/**
 * 云大星球 · 站点 Worker
 *
 * 一个 Worker 同时干两件事：
 *   1. 路径以 /api 开头   → 走帖子接口（读写 D1 数据库）
 *   2. 其它所有路径       → 直接返回仓库里的静态文件（env.ASSETS）
 *
 * 部署后网址：https://yunda-planet.<你的账号子域>.workers.dev
 *
 * 身份来源：Cloudflare Access 注入的 Cf-Access-Authenticated-User-Email
 *   —— 该头由边缘节点写入，客户端伪造会被 Cloudflare 剥离，因此可信；
 *      未通过 Access 验证的请求拿不到该头 → 一律 401（安全地失败）。
 *
 * 匿名机制：匿名只是"不向其他同学显示身份"。author_email 始终入库，
 *   管理员可在 Cloudflare 后台追溯，用于处置违规内容（建议在页面公告中明示）。
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    if (!env.ASSETS) {
      return new Response("静态资源绑定缺失（wrangler.toml 里的 [assets] 未生效）", { status: 500 });
    }
    return env.ASSETS.fetch(request);
  }
};

/* ================= 帖子接口 ================= */

const LIMITS = { title: 60, content: 3000, reply: 1000, nickname: 16 };

async function handleApi(request, env, url) {
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);

  try {
    if (!env.DB) {
      return json({ error: "服务端未绑定数据库（wrangler.toml 里的 D1 绑定 DB 未生效）" }, 500);
    }
    if (parts[0] === "health") {
      return json({ ok: true, board: url.searchParams.get("board") || null });
    }

    const user = getUser(request, env);

    if (parts[0] === "me") {
      if (!user) return json({ error: "未登录" }, 401);
      return handleMe(request, env, user);
    }

    if (parts[0] !== "posts") return json({ error: "接口不存在" }, 404);
    if (!user) return json({ error: "未登录" }, 401);

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
      if (parts.length === 4 && request.method === "DELETE") return deleteReply(request, env, user, parts[3]);
      return json({ error: "方法不支持" }, 405);
    }

    return json({ error: "接口不存在" }, 404);
  } catch (err) {
    return json({ error: "服务器错误：" + (err && err.message ? err.message : "未知") }, 500);
  }
}

/* ---------------- 身份 ---------------- */

function getUser(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (accessEmail) return { email: accessEmail.trim().toLowerCase() };

  if (env.DEV_AUTH === "1") {
    const dev = request.headers.get("X-Dev-User");
    if (dev) return { email: dev.trim().toLowerCase() };
  }
  return null;
}

function defaultName(email) {
  return String(email || "").split("@")[0].slice(0, LIMITS.nickname) || "云大学子";
}

async function handleMe(request, env, user) {
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT display_name FROM profiles WHERE email = ?")
      .bind(user.email)
      .first();
    return json({
      email: user.email,
      displayName: (row && row.display_name) || defaultName(user.email)
    });
  }
  if (request.method === "PUT") {
    const body = await readJson(request);
    const name = str(body.displayName, LIMITS.nickname).trim();
    if (!name) return json({ error: "昵称不能为空" }, 400);
    await env.DB.prepare(
      "INSERT INTO profiles (email, display_name, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at"
    )
      .bind(user.email, name, Date.now())
      .run();
    return json({ ok: true, displayName: name });
  }
  return json({ error: "方法不支持" }, 405);
}

/* ---------------- 帖子 ---------------- */

async function listPosts(url, env, user) {
  const board = str(url.searchParams.get("board"), 24) || "forum";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  const { results } = await env.DB.prepare(
    "SELECT p.*, " +
      "(SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.is_deleted = 0) AS reply_count " +
      "FROM posts p WHERE p.board = ? AND p.is_deleted = 0 " +
      "ORDER BY p.created_at DESC LIMIT ? OFFSET ?"
  )
    .bind(board, limit, offset)
    .all();

  return json({
    board,
    posts: (results || []).map(function (row) {
      return toPost(row, user, row.reply_count);
    })
  });
}

async function getThread(postId, env, user) {
  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ? AND is_deleted = 0")
    .bind(postId)
    .first();
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
  const board = body.board === "discuss" ? "discuss" : "forum";
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
    "INSERT INTO posts (id, board, category, title, content, author_email, author_name, is_anonymous, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, board, category, title, content, user.email, name, anonymous ? 1 : 0, Date.now())
    .run();

  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  return json({ post: toPost(row, user, 0) }, 201);
}

async function deletePost(postId, env, user) {
  const row = await env.DB.prepare("SELECT author_email FROM posts WHERE id = ?").bind(postId).first();
  if (!row) return json({ error: "帖子不存在" }, 404);
  if (row.author_email !== user.email) return json({ error: "只能删除自己发布的帖子" }, 403);
  await env.DB.prepare("UPDATE posts SET is_deleted = 1 WHERE id = ?").bind(postId).run();
  return json({ ok: true });
}

/* ---------------- 回复 ---------------- */

async function createReply(request, env, user, postId) {
  const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND is_deleted = 0")
    .bind(postId)
    .first();
  if (!post) return json({ error: "帖子不存在或已删除" }, 404);

  const body = await readJson(request);
  const content = str(body.content, LIMITS.reply).trim();
  const anonymous = body.anonymous === true || body.anonymous === 1 || body.anonymous === "1";
  if (!content) return json({ error: "回复内容不能为空" }, 400);

  const name = await resolveName(env, user, body.nickname, anonymous);
  const id = newId();

  await env.DB.prepare(
    "INSERT INTO replies (id, post_id, content, author_email, author_name, is_anonymous, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, postId, content, user.email, name, anonymous ? 1 : 0, Date.now())
    .run();

  const row = await env.DB.prepare("SELECT * FROM replies WHERE id = ?").bind(id).first();
  return json({ reply: toReply(row, user) }, 201);
}

async function deleteReply(request, env, user, replyId) {
  const row = await env.DB.prepare("SELECT author_email FROM replies WHERE id = ?").bind(replyId).first();
  if (!row) return json({ error: "回复不存在" }, 404);
  if (row.author_email !== user.email) return json({ error: "只能删除自己的回复" }, 403);
  await env.DB.prepare("UPDATE replies SET is_deleted = 1 WHERE id = ?").bind(replyId).run();
  return json({ ok: true });
}

/* ---------------- 输出整形（关键：绝不下发作者邮箱） ---------------- */

function toPost(row, user, replyCount) {
  return {
    id: row.id,
    board: row.board,
    category: row.category,
    title: row.title,
    content: row.content,
    author: maskName(row),
    isAnonymous: !!row.is_anonymous,
    mine: row.author_email === user.email,
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
    mine: row.author_email === user.email,
    createdAt: row.created_at,
    createdAtText: fmtTime(row.created_at)
  };
}

function maskName(row) {
  if (row.is_anonymous) return "匿名同学";
  return row.author_name || defaultName(row.author_email);
}

/* ---------------- 工具 ---------------- */

async function resolveName(env, user, rawNickname, anonymous) {
  const typed = str(rawNickname, LIMITS.nickname).trim();
  if (typed) {
    if (!anonymous) {
      await env.DB.prepare(
        "INSERT INTO profiles (email, display_name, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at"
      )
        .bind(user.email, typed, Date.now())
        .run();
    }
    return typed;
  }
  const row = await env.DB.prepare("SELECT display_name FROM profiles WHERE email = ?")
    .bind(user.email)
    .first();
  return (row && row.display_name) || defaultName(user.email);
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
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

async function readJson(request) {
  try {
    const data = await request.json();
    return data && typeof data === "object" ? data : {};
  } catch (e) {
    return {};
  }
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
