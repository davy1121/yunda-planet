(function () {
  "use strict";

  var STORAGE_KEY = "yunqiu_canteens_v1";
  var UID_KEY = "yunqiu_food_uid";
  var WEEK = 7 * 24 * 60 * 60 * 1000;

  var defaultData = {
    canteens: [
      {
        id: "zhiweitang",
        campus: "呈贡校区",
        name: "知味堂（楠苑食堂）",
        mapQuery: "云南大学呈贡校区知味堂",
        position: "呈贡校区南门一侧，靠近楠苑园区",
        intro:
          "云大呈贡主要食堂之一，有多个楼层与风味区域，设清真窗口；每年春季常推出校园人气“玫瑰宴”。（信息来自学校后勤与校媒公开报道）",
        tags: ["玫瑰宴", "清真窗口", "南门附近"],
      },
      {
        id: "yuweitang",
        campus: "呈贡校区",
        name: "余味堂（梓苑食堂，亦写作馀味堂）",
        mapQuery: "云南大学呈贡校区余味堂",
        position: "呈贡校区梓苑/桦苑一侧",
        intro:
          "云大呈贡主要食堂之一，同学评价口碑较好，设有多个风味窗口与清真区域。",
        tags: ["梓苑", "风味窗口", "清真"],
      },
      {
        id: "pinweitang",
        campus: "呈贡校区",
        name: "品味堂（楸苑食堂）",
        mapQuery: "云南大学呈贡校区品味堂",
        position: "呈贡校区楸苑园区旁",
        intro:
          "近年来开放的楸苑食堂，与知味堂、余味堂一样设有“想吃什么食堂就做什么”的交流板，菜品更新更灵活。",
        tags: ["楸苑", "许愿式点菜", "较新"],
      },
      {
        id: "donglu-yi",
        campus: "东陆校区",
        name: "一食堂（东陆校区）",
        mapQuery: "云南大学东陆校区一食堂",
        position: "东陆校区校内",
        intro:
          "东陆主要供餐餐厅之一，提供小份菜、特色面食与官渡小锅米线等。",
        tags: ["小份菜", "官渡小锅米线", "面食"],
      },
      {
        id: "dongeryuan",
        campus: "东陆校区",
        name: "东二院餐厅",
        mapQuery: "云南大学东二院餐厅",
        position: "东陆校区东二院",
        intro: "东陆校区的供餐餐厅之一，提供特色面食、涮菜等。",
        tags: ["面食", "涮菜"],
      },
      {
        id: "beiyuan",
        campus: "东陆校区",
        name: "北院餐厅",
        mapQuery: "云南大学北院餐厅",
        position: "东陆校区北院",
        intro: "东陆校区的供餐餐厅之一，主要提供大众餐饮。",
        tags: ["大众餐饮"],
      },
      {
        id: "donglu-qingzhen",
        campus: "东陆校区",
        name: "清真餐厅（东陆）",
        mapQuery: "云南大学东陆校区清真餐厅",
        position: "东陆校区校内",
        intro: "面向东陆校区的清真餐厅，曾推出煎饼果子等特色美食。",
        tags: ["清真", "煎饼果子"],
      },
    ],
    stalls: [
      { id: "s-zwt-1", canteenId: "zhiweitang", name: "大众自选菜档", desc: "自选菜、米饭套餐" },
      { id: "s-zwt-2", canteenId: "zhiweitang", name: "清真窗口", desc: "清真快餐与面点" },
      { id: "s-zwt-3", canteenId: "zhiweitang", name: "特色面食档", desc: "米线、面条等主食" },
      { id: "s-zwt-4", canteenId: "zhiweitang", name: "时令·玫瑰宴档", desc: "每年 4 月前后供应的玫瑰系列美食" },
      { id: "s-ywt-1", canteenId: "yuweitang", name: "大众快餐档", desc: "套餐与自选菜" },
      { id: "s-ywt-2", canteenId: "yuweitang", name: "清真窗口", desc: "清真餐食" },
      { id: "s-ywt-3", canteenId: "yuweitang", name: "风味小吃档", desc: "各地风味小吃" },
      { id: "s-pwt-1", canteenId: "pinweitang", name: "自选餐档", desc: "自选菜品" },
      { id: "s-pwt-2", canteenId: "pinweitang", name: "心愿菜窗口", desc: "同学们在交流板许愿后安排的菜品" },
      { id: "s-dy-1", canteenId: "donglu-yi", name: "小份菜窗口", desc: "量小价低，适合想多尝几样的同学" },
      { id: "s-dy-2", canteenId: "donglu-yi", name: "官渡小锅米线", desc: "昆明风味小锅米线" },
      { id: "s-dy-3", canteenId: "donglu-yi", name: "特色面食", desc: "面条与面点" },
      { id: "s-dey-1", canteenId: "dongeryuan", name: "特色面食档", desc: "面食煮品" },
      { id: "s-dey-2", canteenId: "dongeryuan", name: "涮菜档", desc: "涮煮小锅菜" },
      { id: "s-byp-1", canteenId: "beiyuan", name: "大众餐饮档", desc: "家常菜与套餐" },
      { id: "s-qz-1", canteenId: "donglu-qingzhen", name: "清真套餐档", desc: "清真套餐" },
      { id: "s-qz-2", canteenId: "donglu-qingzhen", name: "煎饼果子档", desc: "煎饼果子等特色" },
    ],
    ratings: [],
  };

  var data = loadData();
  var currentFilter = "all";
  var activeCanteenId = null;

  var canteenGrid = document.getElementById("canteenGrid");
  var rankList = document.getElementById("rankList");
  var campusFilter = document.getElementById("campusFilter");
  var listView = document.getElementById("listView");
  var detailView = document.getElementById("detailView");
  var stallList = document.getElementById("stallList");
  var canteenModal = document.getElementById("canteenModal");
  var canteenForm = document.getElementById("canteenForm");
  var stallModal = document.getElementById("stallModal");
  var stallForm = document.getElementById("stallForm");
  var toastEl = document.getElementById("foodToast");

  /* ---------- 数据存取 ---------- */
  function getUid() {
    try {
      var uid = window.localStorage.getItem(UID_KEY);
      if (!uid) {
        uid = "u-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
        window.localStorage.setItem(UID_KEY, uid);
      }
      return uid;
    } catch (error) {
      return "u-local";
    }
  }

  function loadData() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.canteens)) return parsed;
      }
    } catch (error) {
      /* file:// 下无 localStorage 时退化为内存数据 */
    }
    return JSON.parse(JSON.stringify(defaultData));
  }

  function saveData() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      /* 内存模式 */
    }
  }

  function makeId(prefix) {
    return (
      prefix +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
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

  function baiduSearchHref(query) {
    return (
      "https://api.map.baidu.com/place/search?query=" +
      encodeURIComponent(query) +
      "&region=" +
      encodeURIComponent("昆明") +
      "&output=html&src=webapp.yundaxingqiu.canteen"
    );
  }

  function mapQueryFor(canteen) {
    if (canteen.mapQuery) return canteen.mapQuery;
    var zone =
      canteen.campus === "东陆校区"
        ? "云南大学东陆校区"
        : "云南大学呈贡校区";
    return zone + (canteen.name || "").replace(/（.*?）|\(.*?\)/g, "");
  }

  function mapLinkHtml(canteen) {
    return (
      '<a class="loc-chip canteen-map-link" target="_blank" rel="noopener noreferrer" href="' +
      baiduSearchHref(mapQueryFor(canteen)) +
      '">🗺️ 百度地图</a>'
    );
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2200);
  }

  function canteenById(id) {
    return data.canteens.find(function (item) {
      return item.id === id;
    });
  }

  function stallsOfCanteen(id) {
    return data.stalls.filter(function (stall) {
      return stall.canteenId === id;
    });
  }

  function stallById(id) {
    return data.stalls.find(function (item) {
      return item.id === id;
    });
  }

  /* ---------- 评分统计 ---------- */
  function statsFor(stallId, since) {
    var uid = getUid();
    var total = 0;
    var count = 0;
    var mine = null;

    data.ratings.forEach(function (rating) {
      if (rating.stallId !== stallId) return;
      if (since && rating.ts < since) return;
      total += rating.score;
      count += 1;
      if (rating.uid === uid) mine = rating.score;
    });

    return {
      avg: count ? total / count : 0,
      count: count,
      mine: mine,
    };
  }

  /* ---------- 弹窗 ---------- */
  function openModal(modal) {
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    if (!canteenModal.classList.contains("show") && !stallModal.classList.contains("show")) {
      document.body.style.overflow = "";
    }
  }

  document.addEventListener("click", function (event) {
    var closer = event.target.closest("[data-close]");
    if (closer) {
      var modal = document.getElementById(closer.getAttribute("data-close"));
      if (modal) closeModal(modal);
    }
  });

  [canteenModal, stallModal].forEach(function (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeModal(canteenModal);
      closeModal(stallModal);
    }
  });

  /* ---------- 渲染总览 ---------- */
  function renderCanteens() {
    var visible = data.canteens.filter(function (canteen) {
      return currentFilter === "all" || canteen.campus === currentFilter;
    });

    if (visible.length === 0) {
      canteenGrid.innerHTML =
        '<div class="empty-grid">这个校区还没有食堂记录，点击右上角“补充食堂”添加吧 🍚</div>';
      return;
    }

    canteenGrid.innerHTML = visible
      .map(function (canteen) {
        var count = stallsOfCanteen(canteen.id).length;
        var tags = (canteen.tags || [])
          .map(function (tag) {
            return '<span class="mini-tag">' + escapeHtml(tag) + "</span>";
          })
          .join("");
        return (
          '<article class="canteen-card" data-canteen-id="' + canteen.id + '">' +
          '<div class="canteen-card-top">' +
          '<span class="canteen-emoji" aria-hidden="true">🍜</span>' +
          '<span class="campus-badge">' + escapeHtml(canteen.campus) + "</span>" +
          "</div>" +
          "<h3>" + escapeHtml(canteen.name) + "</h3>" +
          '<p class="position">📍 ' + escapeHtml(canteen.position || "位置待补充") + "</p>" +
          '<p class="intro">' + escapeHtml(canteen.intro || "暂无介绍，欢迎补充。") + "</p>" +
          mapLinkHtml(canteen) +
          (tags ? '<div class="tag-row">' + tags + "</div>" : "") +
          '<div class="canteen-card-foot">' +
          "<span>共 " + count + " 个档口</span>" +
          '<button class="delete-btn" type="button" data-delete-canteen="' +
          canteen.id + '">删除食堂</button>' +
          "</div></article>"
        );
      })
      .join("");
  }

  function renderRank() {
    var now = Date.now();
    var weekRatings = data.ratings.filter(function (rating) {
      return rating.ts >= now - WEEK;
    });

    if (weekRatings.length === 0) {
      rankList.innerHTML =
        '<div class="rank-empty">本周还没有评分，去给喜欢的档口点亮星星吧 🌟</div>';
      return;
    }

    var map = {};
    weekRatings.forEach(function (rating) {
      map[rating.stallId] = map[rating.stallId] || { total: 0, count: 0 };
      map[rating.stallId].total += rating.score;
      map[rating.stallId].count += 1;
    });

    var entries = Object.keys(map)
      .map(function (stallId) {
        var stall = stallById(stallId);
        if (!stall) return null;
        var canteen = canteenById(stall.canteenId);
        return {
          stallId: stallId,
          canteenId: stall.canteenId,
          stallName: stall.name,
          canteenName: canteen ? canteen.name : "未知食堂",
          score: map[stallId].total / map[stallId].count,
          count: map[stallId].count,
        };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.score - a.score || b.count - a.count;
      })
      .slice(0, 5);

    if (entries.length === 0) {
      rankList.innerHTML =
        '<div class="rank-empty">本周还没有评分，去给喜欢的档口点亮星星吧 🌟</div>';
      return;
    }

    var medals = ["🥇", "🥈", "🥉", "4", "5"];
    rankList.innerHTML = entries
      .map(function (entry, index) {
        return (
          '<div class="rank-item" data-rank-canteen="' + entry.canteenId + '">' +
          '<span class="rank-medal">' + medals[index] + "</span>" +
          '<span class="rank-info">' +
          '<span class="rank-name">' + escapeHtml(entry.stallName) + "</span>" +
          '<span class="rank-meta">' + escapeHtml(entry.canteenName) + " · " +
          entry.count + " 人评分</span></span>" +
          '<span class="rank-score">' + entry.score.toFixed(1) + "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  campusFilter.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-campus]");
    if (!btn) return;
    currentFilter = btn.getAttribute("data-campus");
    Array.prototype.forEach.call(campusFilter.querySelectorAll(".cat-btn"), function (node) {
      node.classList.toggle("is-active", node === btn);
    });
    renderCanteens();
  });

  /* ---------- 进入 / 返回食堂详情 ---------- */
  function openCanteen(id) {
    var canteen = canteenById(id);
    if (!canteen) return;
    activeCanteenId = id;
    listView.hidden = true;
    detailView.hidden = false;
    window.scrollTo(0, 0);
    renderDetail();
  }

  function backToList() {
    activeCanteenId = null;
    detailView.hidden = true;
    listView.hidden = false;
    renderCanteens();
    renderRank();
    window.scrollTo(0, 0);
  }

  document.getElementById("backToList").addEventListener("click", backToList);

  canteenGrid.addEventListener("click", function (event) {
    if (event.target.closest("a")) return;
    var deleteBtn = event.target.closest("[data-delete-canteen]");
    if (deleteBtn) {
      var id = deleteBtn.getAttribute("data-delete-canteen");
      var canteen = canteenById(id);
      if (!canteen) return;
      if (window.confirm("确定删除食堂“" + canteen.name + "”及其档口吗？")) {
        data.canteens = data.canteens.filter(function (item) {
          return item.id !== id;
        });
        var stallIds = stallsOfCanteen(id).map(function (stall) {
          return stall.id;
        });
        data.stalls = data.stalls.filter(function (stall) {
          return stall.canteenId !== id;
        });
        data.ratings = data.ratings.filter(function (rating) {
          return stallIds.indexOf(rating.stallId) === -1;
        });
        saveData();
        renderCanteens();
        renderRank();
        showToast("食堂已删除");
      }
      return;
    }

    var card = event.target.closest("[data-canteen-id]");
    if (card) openCanteen(card.getAttribute("data-canteen-id"));
  });

  rankList.addEventListener("click", function (event) {
    var item = event.target.closest("[data-rank-canteen]");
    if (item) openCanteen(item.getAttribute("data-rank-canteen"));
  });

  /* ---------- 食堂详情 ---------- */
  function renderDetail() {
    var canteen = canteenById(activeCanteenId);
    if (!canteen) {
      backToList();
      return;
    }

    document.getElementById("detailName").textContent = canteen.name;
    document.getElementById("detailSub").textContent =
      canteen.campus + " · 点击星星为每个档口打分";
    document.getElementById("detailPosition").textContent =
      "📍 " + (canteen.position || "位置待补充");
    document.getElementById("detailMap").innerHTML = mapLinkHtml(canteen);
    document.getElementById("detailIntro").textContent =
      canteen.intro || "暂无介绍，欢迎补充。";
    document.getElementById("detailTags").innerHTML = (canteen.tags || [])
      .map(function (tag) {
        return '<span class="mini-tag">' + escapeHtml(tag) + "</span>";
      })
      .join("");

    renderStalls();
  }

  function renderStalls() {
    var stalls = stallsOfCanteen(activeCanteenId);
    if (stalls.length === 0) {
      stallList.innerHTML =
        '<div class="stall-empty">还没有档口记录，点击上方“补充这个食堂的档口”添加第一家吧 🍳</div>';
      return;
    }

    stallList.innerHTML = stalls
      .map(function (stall) {
        var stats = statsFor(stall.id);
        return (
          '<div class="stall-card">' +
          '<div class="stall-head">' +
          "<h3>" + escapeHtml(stall.name) + "</h3>" +
          '<button class="delete-btn" type="button" data-delete-stall="' +
          stall.id + '">删除</button>' +
          "</div>" +
          '<p class="stall-desc">' + escapeHtml(stall.desc || "暂无介绍") + "</p>" +
          '<div class="stall-score">' +
          '<span class="avg-score"><strong>' +
          (stats.count ? stats.avg.toFixed(1) : "—") +
          "</strong> / 5 · " + stats.count + " 人评</span>" +
          '<div class="stars" data-stall-id="' + stall.id + '">' +
          starButtons(stats.mine) +
          "</div>" +
          "</div>" +
          '<p class="my-score">' +
          (stats.mine
            ? "你的评分：" + "★".repeat(stats.mine)
            : "点星星给出你的评分") +
          "</p>" +
          "</div>"
        );
      })
      .join("");
  }

  function starButtons(mine) {
    var html = "";
    for (var i = 1; i <= 5; i += 1) {
      html +=
        '<button class="star-btn' + (mine && i <= mine ? " is-on" : "") +
        '" type="button" data-score="' + i + '" aria-label="评 ' + i + " 星" +
        '">★</button>';
    }
    return html;
  }

  stallList.addEventListener("click", function (event) {
    var deleteBtn = event.target.closest("[data-delete-stall]");
    if (deleteBtn) {
      var stallId = deleteBtn.getAttribute("data-delete-stall");
      var stall = stallById(stallId);
      if (!stall) return;
      if (window.confirm("确定删除档口“" + stall.name + "”吗？")) {
        data.stalls = data.stalls.filter(function (item) {
          return item.id !== stallId;
        });
        data.ratings = data.ratings.filter(function (rating) {
          return rating.stallId !== stallId;
        });
        saveData();
        renderDetail();
        renderCanteens();
        showToast("档口已删除");
      }
      return;
    }

    var star = event.target.closest(".star-btn");
    if (!star) return;
    var starsWrap = star.closest("[data-stall-id]");
    if (!starsWrap) return;
    var stallId = starsWrap.getAttribute("data-stall-id");
    var score = Number(star.getAttribute("data-score"));
    var uid = getUid();

    var existing = data.ratings.find(function (rating) {
      return rating.stallId === stallId && rating.uid === uid;
    });

    if (existing) {
      existing.score = score;
      existing.ts = Date.now();
    } else {
      data.ratings.push({
        id: makeId("r"),
        stallId: stallId,
        uid: uid,
        score: score,
        ts: Date.now(),
      });
    }

    saveData();
    renderDetail();
    showToast("已给这个档口评 " + score + " 星 ⭐");
  });

  /* ---------- 学生自由补充 ---------- */
  document.getElementById("addCanteenBtn").addEventListener("click", function () {
    document.getElementById("newCanteenName").value = "";
    document.getElementById("newCanteenPosition").value = "";
    document.getElementById("newCanteenIntro").value = "";
    document.getElementById("newCanteenTags").value = "";
    openModal(canteenModal);
  });

  document.getElementById("addStallBtn").addEventListener("click", function () {
    var canteen = canteenById(activeCanteenId);
    if (!canteen) return;
    document.getElementById("stallCanteenName").value = canteen.name;
    document.getElementById("newStallName").value = "";
    document.getElementById("newStallDesc").value = "";
    openModal(stallModal);
  });

  function splitTags(text) {
    return String(text || "")
      .split(/[、，,;\s]+/)
      .map(function (tag) {
        return tag.trim();
      })
      .filter(Boolean)
      .slice(0, 8);
  }

  canteenForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = document.getElementById("newCanteenName").value.trim();
    if (!name) {
      showToast("请填写食堂名称");
      return;
    }

    data.canteens.push({
      id: makeId("c"),
      campus: document.getElementById("newCanteenCampus").value,
      name: name,
      position: document.getElementById("newCanteenPosition").value.trim(),
      intro: document.getElementById("newCanteenIntro").value.trim(),
      tags: splitTags(document.getElementById("newCanteenTags").value),
    });

    saveData();
    closeModal(canteenModal);
    renderCanteens();
    showToast("食堂已补充 🎉");
  });

  stallForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = document.getElementById("newStallName").value.trim();
    if (!name) {
      showToast("请填写档口名称");
      return;
    }
    var canteen = canteenById(activeCanteenId);
    if (!canteen) return;

    data.stalls.push({
      id: makeId("s"),
      canteenId: canteen.id,
      name: name,
      desc: document.getElementById("newStallDesc").value.trim(),
    });

    saveData();
    closeModal(stallModal);
    renderDetail();
    renderCanteens();
    showToast("档口已补充 🍜");
  });

  /* ---------- 初始化 ---------- */
  renderCanteens();
  renderRank();
})();
