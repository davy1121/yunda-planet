(function () {
  "use strict";

  var CONFIG = window.YUNQIU_FORUM_CONFIG || {};
  var STORAGE_KEY = CONFIG.storageKey || "yunqiu_discussion_v1";
  var CATEGORY_META =
    CONFIG.categories || {
      course: { label: "课程讨论", emoji: "🎓", className: "cat-course" },
      cet: { label: "四六级", emoji: "📘", className: "cat-cet" },
      contest: { label: "比赛竞技", emoji: "🏆", className: "cat-contest" },
      other: { label: "学习闲聊", emoji: "💬", className: "cat-other" },
    };

  var posts = loadPosts();
  var currentFilter = "all";
  var activeThreadId = null;

  var postList = document.getElementById("postList");
  var postStat = document.getElementById("postStat");
  var categoryBar = document.getElementById("categoryBar");
  var composeBtn = document.getElementById("composeBtn");
  var composeModal = document.getElementById("composeModal");
  var composeForm = document.getElementById("composeForm");
  var threadModal = document.getElementById("threadModal");
  var threadBody = document.getElementById("threadBody");
  var toastEl = document.getElementById("discussToast");

  /* ---------- 数据存取 ---------- */
  function loadPosts() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed)) return parsed;
    } catch (error) {
      /* file:// 下 localStorage 不可用时退化为内存数据 */
    }
    return [];
  }

  function savePosts() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    } catch (error) {
      /* 内存模式：刷新后数据会丢失 */
    }
  }

  function makeId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function nowText() {
    var d = new Date();
    function pad(n) {
      return String(n).padStart(2, "0");
    }
    return (
      d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[ch];
    });
  }

  function nickname(value) {
    var name = String(value || "").trim();
    return name || "云大学子";
  }

  function excerpt(content) {
    var text = String(content || "").replace(/\s+/g, " ").trim();
    return text.length > 120 ? text.slice(0, 120) + "…" : text;
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2200);
  }

  /* ---------- 弹窗开关 ---------- */
  function openModal(modal) {
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    if (!composeModal.classList.contains("show") && !threadModal.classList.contains("show")) {
      document.body.style.overflow = "";
    }
  }

  document.addEventListener("click", function (event) {
    var closer = event.target.closest("[data-close]");
    if (!closer) return;
    var modal = document.getElementById(closer.getAttribute("data-close"));
    if (modal) closeModal(modal);
  });

  /* ---------- 分类切换 ---------- */
  categoryBar.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-filter]");
    if (!btn) return;
    currentFilter = btn.getAttribute("data-filter");
    Array.prototype.forEach.call(categoryBar.querySelectorAll(".cat-btn"), function (node) {
      node.classList.toggle("is-active", node === btn);
    });
    renderPosts();
  });

  /* ---------- 渲染帖子列表 ---------- */
  function filteredPosts() {
    if (currentFilter === "all") return posts.slice();
    return posts.filter(function (post) {
      return post.category === currentFilter;
    });
  }

  function categoryMeta(category) {
    if (CATEGORY_META[category]) return CATEGORY_META[category];
    var firstKey = Object.keys(CATEGORY_META)[0];
    return CATEGORY_META[firstKey] || {
      label: "讨论",
      emoji: "💬",
      className: "cat-other",
    };
  }

  function renderPosts() {
    var visible = filteredPosts().slice().sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });

    if (posts.length === 0) {
      postStat.textContent = "还没有帖子，来发布第一篇吧";
    } else if (visible.length === 0) {
      postStat.textContent = "这个板块还没有帖子";
    } else {
      postStat.textContent = "共 " + posts.length + " 个帖子";
    }

    if (visible.length === 0) {
      postList.innerHTML =
        '<div class="empty-state">' +
        '<div class="empty-emoji">🌱</div>' +
        "<p>" +
        (posts.length === 0
          ? "还没有帖子，点击右上角“发布新帖”开始第一个讨论吧！"
          : "这个板块暂时还没有帖子，去别的板块逛逛吧。") +
        "</p></div>";
      return;
    }

    postList.innerHTML = visible
      .map(function (post) {
        var meta = categoryMeta(post.category);
        var replies = Array.isArray(post.replies) ? post.replies : [];
        return (
          '<article class="post-card" data-post-id="' + post.id + '">' +
          '<div class="post-card-top">' +
          '<span class="cat-badge ' + meta.className + '">' + meta.emoji + " " +
          escapeHtml(meta.label) + "</span>" +
          '<span class="post-time">' + escapeHtml(post.createdAtText || "") + "</span>" +
          "</div>" +
          '<h3 class="post-title">' + escapeHtml(post.title) + "</h3>" +
          '<p class="post-excerpt">' + escapeHtml(excerpt(post.content)) + "</p>" +
          '<div class="post-card-meta">' +
          '<span class="post-author">👤 ' + escapeHtml(post.author) + "</span>" +
          '<span class="post-meta-right">' +
          '<span class="reply-count">💬 ' + replies.length + " 条回复</span>" +
          '<button class="delete-link" type="button" data-delete-post="' + post.id + '">删除帖子</button>' +
          "</span></div></article>"
        );
      })
      .join("");
  }

  postList.addEventListener("click", function (event) {
    var deleteBtn = event.target.closest("[data-delete-post]");
    if (deleteBtn) {
      var id = deleteBtn.getAttribute("data-delete-post");
      var post = posts.find(function (item) {
        return item.id === id;
      });
      if (!post) return;
      if (window.confirm("确定删除帖子《" + (post.title || "") + "》吗？删除后无法恢复。")) {
        posts = posts.filter(function (item) {
          return item.id !== id;
        });
        savePosts();
        renderPosts();
        showToast("帖子已删除");
      }
      return;
    }

    var card = event.target.closest("[data-post-id]");
    if (card) openThread(card.getAttribute("data-post-id"));
  });

  /* ---------- 发布帖子 ---------- */
  composeBtn.addEventListener("click", function () {
    document.getElementById("postTitle").value = "";
    document.getElementById("postContent").value = "";
    openModal(composeModal);
  });

  composeForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var category = document.getElementById("postCategory").value;
    var author = nickname(document.getElementById("postAuthor").value);
    var title = document.getElementById("postTitle").value.trim();
    var content = document.getElementById("postContent").value.trim();

    if (!title) {
      showToast("请先填写帖子标题");
      return;
    }
    if (!content) {
      showToast("请先填写帖子内容");
      return;
    }

    posts.unshift({
      id: makeId(),
      category: category,
      author: author,
      title: title,
      content: content,
      createdAt: Date.now(),
      createdAtText: nowText(),
      replies: [],
    });

    savePosts();
    closeModal(composeModal);
    renderPosts();
    showToast("帖子发布成功，大家都能看到啦 ✨");
  });

  /* ---------- 帖子详情与回复 ---------- */
  function findPost(id) {
    return posts.find(function (post) {
      return post.id === id;
    });
  }

  function openThread(id) {
    var post = findPost(id);
    if (!post) return;
    activeThreadId = id;
    renderThread();
    openModal(threadModal);
    threadBody.scrollTop = 0;
  }

  function renderThread() {
    var post = findPost(activeThreadId);
    if (!post) {
      closeModal(threadModal);
      return;
    }

    var meta = categoryMeta(post.category);
    var replies = Array.isArray(post.replies) ? post.replies : [];

    var repliesHtml =
      replies.length === 0
        ? '<div class="empty-replies">还没有回复，来抢沙发聊聊吧～</div>'
        : replies
            .map(function (reply) {
              return (
                '<div class="reply-item">' +
                '<div class="reply-item-head">' +
                '<span class="reply-name">👤 ' + escapeHtml(reply.author) + "</span>" +
                '<span class="reply-time">' + escapeHtml(reply.createdAtText || "") +
                '<button class="reply-delete" type="button" data-delete-reply="' +
                reply.id + '">删除</button></span>' +
                "</div>" +
                '<div class="reply-content">' + escapeHtml(reply.content) + "</div>" +
                "</div>"
              );
            })
            .join("");

    threadBody.innerHTML =
      '<div class="thread-main">' +
      '<div class="post-card-top">' +
      '<span class="cat-badge ' + meta.className + '">' + meta.emoji + " " +
      escapeHtml(meta.label) + "</span>" +
      '<span class="post-time">' + escapeHtml(post.createdAtText || "") + "</span>" +
      "</div>" +
      '<h2 class="post-title">' + escapeHtml(post.title) + "</h2>" +
      '<div class="thread-content">' + escapeHtml(post.content) + "</div>" +
      '<div class="thread-author">👤 ' + escapeHtml(post.author) + " 发布于 " +
      escapeHtml(post.createdAtText || "") + "</div>" +
      '<div class="thread-tools">' +
      '<button class="delete-link" type="button" data-delete-thread-post="' +
      post.id + '">删除帖子</button>' +
      "</div>" +
      "</div>" +
      '<section class="reply-section">' +
      '<h3 class="reply-section-title">💬 回复讨论（' + replies.length + "）</h3>" +
      '<div class="reply-list">' + repliesHtml + "</div>" +
      '<form class="reply-form" id="replyForm">' +
      '<div class="reply-author-row">' +
      '<label class="d-field" style="flex:1;min-width:150px">' +
      '<span>昵称（可选）</span>' +
      '<input id="replyAuthor" type="text" maxlength="16" placeholder="默认：云大学子">' +
      "</label>" +
      "</div>" +
      '<textarea id="replyContent" class="d-field-textarea" rows="3" maxlength="1000" ' +
      'placeholder="友善讨论，写下你的想法或补充…"></textarea>' +
      '<div class="d-modal-actions">' +
      '<button class="d-btn solid reply-submit" type="submit">发表回复</button>' +
      "</div>" +
      "</form></section>";

    threadBody.querySelector("#replyForm").addEventListener("submit", function (event) {
      event.preventDefault();
      submitReply();
    });
  }

  function submitReply() {
    var post = findPost(activeThreadId);
    if (!post) return;

    var author = nickname(threadBody.querySelector("#replyAuthor").value);
    var content = threadBody.querySelector("#replyContent").value.trim();
    if (!content) {
      showToast("回复内容不能为空哦");
      return;
    }

    post.replies = post.replies || [];
    post.replies.push({
      id: makeId(),
      author: author,
      content: content,
      createdAt: Date.now(),
      createdAtText: nowText(),
    });

    savePosts();
    renderThread();
    renderPosts();
    showToast("回复成功，已同步到帖子下方 💬");
  }

  threadBody.addEventListener("click", function (event) {
    var deletePost = event.target.closest("[data-delete-thread-post]");
    if (deletePost) {
      var postId = deletePost.getAttribute("data-delete-thread-post");
      var targetPost = findPost(postId);
      if (!targetPost) return;
      if (window.confirm("确定删除帖子《" + (targetPost.title || "") + "》吗？")) {
        posts = posts.filter(function (item) {
          return item.id !== postId;
        });
        savePosts();
        closeModal(threadModal);
        renderPosts();
        showToast("帖子已删除");
      }
      return;
    }

    var deleteReply = event.target.closest("[data-delete-reply]");
    if (!deleteReply) return;
    var post = findPost(activeThreadId);
    if (!post) return;
    var replyId = deleteReply.getAttribute("data-delete-reply");

    if (window.confirm("确定删除这条回复吗？")) {
      post.replies = (post.replies || []).filter(function (reply) {
        return reply.id !== replyId;
      });
      savePosts();
      renderThread();
      renderPosts();
      showToast("回复已删除");
    }
  });

  [composeModal, threadModal].forEach(function (modal) {
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

  renderPosts();
})();
