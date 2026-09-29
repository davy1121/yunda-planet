/* 云大星球 · 帖子模块（云端共享版）
 *
 * 与旧版的区别：
 *   1. 帖子/回复不再存在浏览器 localStorage，而是存到云端数据库（所有人共享、都能看到）；
 *   2. 发帖与回复时可以选择「公开（显示昵称）」或「匿名（只显示"匿名同学"）」；
 *   3. 只有自己发的帖子/回复才显示删除按钮，服务端也会再校验一次；
 *   4. 每 20 秒静默刷新列表，别人刚发的帖子会自动出现（弹窗打开时不打扰）。
 *
 * 依赖：与 discuss.html / forum.html 里原有的 DOM 结构完全一致，无需改样式。
 */
(function () {
  "use strict";

  var CONFIG = window.YUNQIU_FORUM_CONFIG || {};
  /* 讨论板标识：discuss.html 未配置时默认 discuss；forum.html 会显式指定 board:"forum" */
  var BOARD =
    CONFIG.board ||
    (CONFIG.storageKey && CONFIG.storageKey.indexOf("campus_forum") > -1 ? "forum" : "discuss");
  var API_BASE = "/api";
  var POLL_MS = 20000;

  var CATEGORY_META =
    CONFIG.categories || {
      course: { label: "课程讨论", emoji: "🎓", className: "cat-course" },
      cet: { label: "四六级", emoji: "📘", className: "cat-cet" },
      contest: { label: "比赛竞技", emoji: "🏆", className: "cat-contest" },
      other: { label: "学习闲聊", emoji: "💬", className: "cat-other" }
    };

  var posts = [];
  var currentFilter = "all";
  var activeThreadId = null;
  var activeThread = null; /* { post, replies } */
  var pollTimer = null;

  var postList = document.getElementById("postList");
  var postStat = document.getElementById("postStat");
  var categoryBar = document.getElementById("categoryBar");
  var composeBtn = document.getElementById("composeBtn");
  var composeModal = document.getElementById("composeModal");
  var composeForm = document.getElementById("composeForm");
  var threadModal = document.getElementById("threadModal");
  var threadBody = document.getElementById("threadBody");
  var toastEl = document.getElementById("discussToast");

  /* ---------- 接口请求 ---------- */
  function api(path, options) {
    options = options || {};
    var init = {
      method: options.method || "GET",
      headers: {},
      credentials: "same-origin"
    };
    if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    return fetch(API_BASE + path, init).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok) {
            var error = new Error((data && data.error) || "请求失败（" + res.status + "）");
            error.status = res.status;
            throw error;
          }
          return data;
        });
    });
  }

  function loadPosts() {
    return api("/posts?board=" + encodeURIComponent(BOARD))
      .then(function (data) {
        posts = Array.isArray(data.posts) ? data.posts : [];
        renderPosts();
      })
      .catch(function (error) {
        postStat.textContent = "加载失败";
        postList.innerHTML = emptyState(
          "⚠️",
          "帖子加载失败：" + escapeHtml(error.message) + "。请检查网络后刷新页面。"
        );
      });
  }

  /* ---------- 通用工具 ---------- */
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch
      );
    });
  }

  function cleanNickname(value) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, 16);
  }

  function excerpt(content) {
    var text = String(content == null ? "" : content).replace(/\s+/g, " ").trim();
    return text.length > 96 ? text.slice(0, 96) + "…" : text;
  }

  function authorHtml(isAnonymous, author) {
    return (isAnonymous ? "🕶 " : "👤 ") + escapeHtml(author);
  }

  function emptyState(emoji, text) {
    return (
      '<div class="empty-state"><div class="empty-emoji">' +
      emoji +
      "</div><p>" +
      text +
      "</p></div>"
    );
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2400);
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }

  function isModalOpen() {
    return (
      (composeModal && composeModal.classList.contains("show")) ||
      (threadModal && threadModal.classList.contains("show"))
    );
  }

  /* ---------- 分类 ---------- */
  function categoryMeta(category) {
    return (
      CATEGORY_META[category] || { label: "讨论", emoji: "💬", className: "cat-other" }
    );
  }

  function filteredPosts() {
    if (currentFilter === "all") return posts;
    return posts.filter(function (post) {
      return post.category === currentFilter;
    });
  }

  /* ---------- 列表渲染 ---------- */
  function renderPosts() {
    if (!postList) return;

    var visible = filteredPosts()
      .slice()
      .sort(function (a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

    if (posts.length === 0) {
      postStat.textContent = "还没有帖子，来发布第一篇吧";
    } else if (visible.length === 0) {
      postStat.textContent = "这个板块还没有帖子";
    } else {
      postStat.textContent = "共 " + posts.length + " 个帖子 · 全站可见";
    }

    if (visible.length === 0) {
      postList.innerHTML = emptyState(
        "🌱",
        posts.length === 0
          ? "还没有帖子，点击右上角“发布新帖”开始第一个讨论吧！"
          : "这个板块暂时还没有帖子，去别的板块逛逛吧。"
      );
      return;
    }

    postList.innerHTML = visible
      .map(function (post) {
        var meta = categoryMeta(post.category);
        var replyCount = Number(post.replyCount) || 0;
        return (
          '<article class="post-card" data-post-id="' +
          escapeHtml(post.id) +
          '">' +
          '<div class="post-card-top">' +
          '<span class="cat-badge ' +
          meta.className +
          '">' +
          meta.emoji +
          " " +
          escapeHtml(meta.label) +
          "</span>" +
          '<span class="post-time">' +
          escapeHtml(post.createdAtText || "") +
          "</span>" +
          "</div>" +
          '<h3 class="post-title">' +
          escapeHtml(post.title) +
          "</h3>" +
          '<p class="post-excerpt">' +
          escapeHtml(excerpt(post.content)) +
          "</p>" +
          '<div class="post-card-meta">' +
          '<span class="post-author">' +
          authorHtml(post.isAnonymous, post.author) +
          "</span>" +
          '<span class="post-meta-right">' +
          '<span class="reply-count">💬 ' +
          replyCount +
          " 条回复</span>" +
          (post.mine
            ? '<button class="delete-link" type="button" data-delete-post="' +
              escapeHtml(post.id) +
              '">删除帖子</button>'
            : "") +
          "</span></div></article>"
        );
      })
      .join("");
  }

  function findPost(id) {
    return posts.find(function (post) {
      return post.id === id;
    });
  }

  /* ---------- 列表交互 ---------- */
  if (postList) {
    postList.addEventListener("click", function (event) {
      var deleteBtn = event.target.closest("[data-delete-post]");
      if (deleteBtn) {
        var id = deleteBtn.getAttribute("data-delete-post");
        var post = findPost(id);
        if (!post) return;
        if (!window.confirm("确定删除帖子《" + (post.title || "") + "》吗？删除后无法恢复。")) return;
        deleteBtn.disabled = true;
        api("/posts/" + encodeURIComponent(id), { method: "DELETE" })
          .then(function () {
            showToast("帖子已删除");
            return loadPosts();
          })
          .catch(function (error) {
            deleteBtn.disabled = false;
            showToast("删除失败：" + error.message);
          });
        return;
      }

      var card = event.target.closest("[data-post-id]");
      if (card) openThread(card.getAttribute("data-post-id"));
    });
  }

  if (categoryBar) {
    categoryBar.addEventListener("click", function (event) {
      var btn = event.target.closest(".cat-btn");
      if (!btn) return;
      currentFilter = btn.getAttribute("data-filter") || "all";
      Array.prototype.forEach.call(categoryBar.querySelectorAll(".cat-btn"), function (node) {
        node.classList.toggle("is-active", node === btn);
      });
      renderPosts();
    });
  }

  /* ---------- 发布帖子 ---------- */
  function selectedIdentity() {
    var select = document.getElementById("postIdentity");
    return select && select.value === "anonymous" ? "anonymous" : "public";
  }

  if (composeBtn && composeModal) {
    composeBtn.addEventListener("click", function () {
      var titleEl = document.getElementById("postTitle");
      var contentEl = document.getElementById("postContent");
      var authorEl = document.getElementById("postAuthor");
      if (titleEl) titleEl.value = "";
      if (contentEl) contentEl.value = "";
      if (authorEl) authorEl.value = "";
      var identityEl = document.getElementById("postIdentity");
      if (identityEl) identityEl.value = "public";
      openModal(composeModal);
    });
  }

  if (composeForm) {
    composeForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var categoryEl = document.getElementById("postCategory");
      var titleEl = document.getElementById("postTitle");
      var contentEl = document.getElementById("postContent");
      var authorEl = document.getElementById("postAuthor");

      var category = categoryEl ? categoryEl.value : "";
      var title = titleEl ? titleEl.value.trim() : "";
      var content = contentEl ? contentEl.value.trim() : "";
      var anonymous = selectedIdentity() === "anonymous";

      if (!title) {
        showToast("请先填写帖子标题");
        return;
      }
      if (!content) {
        showToast("请先填写帖子内容");
        return;
      }

      var submitBtn = composeForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "发布中…";
      }

      api("/posts", {
        method: "POST",
        body: {
          board: BOARD,
          category: category,
          title: title,
          content: content,
          anonymous: anonymous,
          nickname: authorEl ? cleanNickname(authorEl.value) : ""
        }
      })
        .then(function () {
          closeModal(composeModal);
          showToast(anonymous ? "已匿名发布，同学们都能看到啦 🕶" : "帖子发布成功，大家都能看到啦 ✨");
          return loadPosts();
        })
        .catch(function (error) {
          showToast("发布失败：" + error.message);
        })
        .then(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "发布帖子";
          }
        });
    });
  }

  /* ---------- 帖子详情与回复 ---------- */
  function openThread(id) {
    activeThreadId = id;
    activeThread = null;
    if (threadBody) threadBody.innerHTML = emptyState("⏳", "正在加载帖子…");
    openModal(threadModal);

    api("/posts/" + encodeURIComponent(id))
      .then(function (data) {
        if (activeThreadId !== id) return; /* 用户已切换，丢弃过期响应 */
        activeThread = { post: data.post, replies: Array.isArray(data.replies) ? data.replies : [] };
        var cached = findPost(id);
        if (cached && data.post) cached.replyCount = activeThread.replies.length;
        renderThread();
        renderPosts();
      })
      .catch(function (error) {
        if (threadBody) {
          threadBody.innerHTML = emptyState("⚠️", "加载失败：" + escapeHtml(error.message));
        }
      });
  }

  function renderThread() {
    if (!activeThread) return;
    var post = activeThread.post;
    var replies = activeThread.replies || [];
    var meta = categoryMeta(post.category);

    var repliesHtml =
      replies.length === 0
        ? '<div class="empty-replies">还没有回复，来抢沙发聊聊吧～</div>'
        : replies
            .map(function (reply) {
              return (
                '<div class="reply-item">' +
                '<div class="reply-item-head">' +
                '<span class="reply-name">' +
                authorHtml(reply.isAnonymous, reply.author) +
                "</span>" +
                '<span class="reply-time">' +
                escapeHtml(reply.createdAtText || "") +
                (reply.mine
                  ? '<button class="reply-delete" type="button" data-delete-reply="' +
                    escapeHtml(reply.id) +
                    '">删除</button>'
                  : "") +
                "</span>" +
                "</div>" +
                '<div class="reply-content">' +
                escapeHtml(reply.content) +
                "</div>" +
                "</div>"
              );
            })
            .join("");

    threadBody.innerHTML =
      '<div class="thread-main">' +
      '<div class="post-card-top">' +
      '<span class="cat-badge ' +
      meta.className +
      '">' +
      meta.emoji +
      " " +
      escapeHtml(meta.label) +
      "</span>" +
      '<span class="post-time">' +
      escapeHtml(post.createdAtText || "") +
      "</span>" +
      "</div>" +
      '<h2 class="post-title">' +
      escapeHtml(post.title) +
      "</h2>" +
      '<div class="thread-content">' +
      escapeHtml(post.content) +
      "</div>" +
      '<div class="thread-author">' +
      authorHtml(post.isAnonymous, post.author) +
      " 发布于 " +
      escapeHtml(post.createdAtText || "") +
      "</div>" +
      (post.mine
        ? '<div class="thread-tools"><button class="delete-link" type="button" data-delete-thread-post="' +
          escapeHtml(post.id) +
          '">删除帖子</button></div>'
        : "") +
      "</div>" +
      '<section class="reply-section">' +
      '<h3 class="reply-section-title">💬 回复讨论（' +
      replies.length +
      "）</h3>" +
      '<div class="reply-list">' +
      repliesHtml +
      "</div>" +
      '<form class="reply-form" id="replyForm">' +
      '<div class="reply-author-row">' +
      '<label class="d-field" style="flex:1;min-width:150px">' +
      "<span>昵称（可选）</span>" +
      '<input id="replyAuthor" type="text" maxlength="16" placeholder="留空则用你的昵称">' +
      "</label>" +
      '<label class="d-field" style="flex:1;min-width:150px">' +
      "<span>发布身份</span>" +
      '<select id="replyIdentity">' +
      '<option value="public">公开</option>' +
      '<option value="anonymous">匿名</option>' +
      "</select>" +
      "</label>" +
      "</div>" +
      '<textarea id="replyContent" class="d-field-textarea" rows="3" maxlength="1000" ' +
      'placeholder="友善讨论，写下你的想法或补充…"></textarea>' +
      '<div class="d-modal-actions">' +
      '<button class="d-btn solid reply-submit" type="submit">发表回复</button>' +
      "</div>" +
      "</form></section>";

    var replyForm = threadBody.querySelector("#replyForm");
    if (replyForm) {
      replyForm.addEventListener("submit", function (event) {
        event.preventDefault();
        submitReply();
      });
    }
  }

  function submitReply() {
    if (!activeThread || !activeThread.post) return;
    var postId = activeThread.post.id;

    var authorEl = threadBody.querySelector("#replyAuthor");
    var identityEl = threadBody.querySelector("#replyIdentity");
    var contentEl = threadBody.querySelector("#replyContent");
    var anonymous = identityEl ? identityEl.value === "anonymous" : false;
    var content = contentEl ? contentEl.value.trim() : "";

    if (!content) {
      showToast("回复内容不能为空哦");
      return;
    }

    var submitBtn = threadBody.querySelector(".reply-submit");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "发送中…";
    }

    api("/posts/" + encodeURIComponent(postId) + "/replies", {
      method: "POST",
      body: {
        content: content,
        anonymous: anonymous,
        nickname: authorEl ? cleanNickname(authorEl.value) : ""
      }
    })
      .then(function () {
        showToast(anonymous ? "回复成功（匿名）🕶" : "回复成功，已同步到帖子下方 💬");
        return api("/posts/" + encodeURIComponent(postId)).then(function (data) {
          activeThread = {
            post: data.post,
            replies: Array.isArray(data.replies) ? data.replies : []
          };
          renderThread();
          var cached = findPost(postId);
          if (cached && data.post) cached.replyCount = activeThread.replies.length;
          renderPosts();
        });
      })
      .catch(function (error) {
        showToast("回复失败：" + error.message);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "发表回复";
        }
      });
  }

  if (threadBody) {
    threadBody.addEventListener("click", function (event) {
      var deletePostBtn = event.target.closest("[data-delete-thread-post]");
      if (deletePostBtn) {
        var postId = deletePostBtn.getAttribute("data-delete-thread-post");
        var target = findPost(postId);
        if (!target) return;
        if (!window.confirm("确定删除帖子《" + (target.title || "") + "》吗？")) return;
        deletePostBtn.disabled = true;
        api("/posts/" + encodeURIComponent(postId), { method: "DELETE" })
          .then(function () {
            closeModal(threadModal);
            activeThreadId = null;
            activeThread = null;
            showToast("帖子已删除");
            return loadPosts();
          })
          .catch(function (error) {
            deletePostBtn.disabled = false;
            showToast("删除失败：" + error.message);
          });
        return;
      }

      var deleteReplyBtn = event.target.closest("[data-delete-reply]");
      if (!deleteReplyBtn || !activeThread) return;
      var replyId = deleteReplyBtn.getAttribute("data-delete-reply");
      if (!window.confirm("确定删除这条回复吗？")) return;

      deleteReplyBtn.disabled = true;
      api("/posts/" + encodeURIComponent(activeThread.post.id) + "/replies/" + encodeURIComponent(replyId), {
        method: "DELETE"
      })
        .then(function () {
          showToast("回复已删除");
          return api("/posts/" + encodeURIComponent(activeThread.post.id)).then(function (data) {
            activeThread = {
              post: data.post,
              replies: Array.isArray(data.replies) ? data.replies : []
            };
            renderThread();
            var cached = findPost(activeThread.post.id);
            if (cached && data.post) cached.replyCount = activeThread.replies.length;
            renderPosts();
          });
        })
        .catch(function (error) {
          deleteReplyBtn.disabled = false;
          showToast("删除失败：" + error.message);
        });
    });
  }

  /* ---------- 弹窗与轮询 ---------- */
  [composeModal, threadModal].forEach(function (modal) {
    if (!modal) return;
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeModal(composeModal);
      closeModal(threadModal);
    }
  });

  function startPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(function () {
      if (document.hidden || isModalOpen()) return; /* 正在写帖/看帖时不打扰 */
      loadPosts();
    }, POLL_MS);
  }

  /* ---------- 启动 ---------- */
  loadPosts();
  startPolling();
})();
