(function () {
  "use strict";

  /* ---------- 基础数据 ---------- */
  const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  const PERIODS = [
    { no: 1, start: "08:30", end: "09:15" },
    { no: 2, start: "09:25", end: "10:10" },
    { no: 3, start: "10:30", end: "11:15" },
    { no: 4, start: "11:25", end: "12:10" },
    { no: 5, start: "14:00", end: "14:45" },
    { no: 6, start: "14:55", end: "15:40" },
    { no: 7, start: "16:00", end: "16:45" },
    { no: 8, start: "16:55", end: "17:40" },
    { no: 9, start: "19:00", end: "19:45" },
    { no: 10, start: "19:55", end: "20:40" },
    { no: 11, start: "20:50", end: "21:35" },
    { no: 12, start: "21:45", end: "22:30" }
  ];

  const COURSE_COLORS = [
    { name: "蜜桃", bg: "#ffe2ec", border: "#ffb7cd", dot: "#ff8fb1" },
    { name: "蜜橘", bg: "#ffe8d4", border: "#ffc39d", dot: "#ffb36b" },
    { name: "柠黄", bg: "#fff3c6", border: "#efd576", dot: "#ffd35c" },
    { name: "薄荷", bg: "#ddf8ec", border: "#9fe6c9", dot: "#65d8b8" },
    { name: "晴空", bg: "#def1fd", border: "#a6d9f6", dot: "#63c7ef" },
    { name: "香芋", bg: "#ebe5ff", border: "#c4b6f7", dot: "#9b8cf5" }
  ];

  const COURSE_KEY = "yunda-planet-courses";
  const REMINDER_KEY = "yunda-planet-reminder";

  /* ---------- 状态 ---------- */
  let courses = loadCourses();
  let reminderOn = loadReminder();
  let editingId = null;
  let selectedColor = 0;
  let reminderTimer = null;
  let toastTimer = null;
  let photoObjectUrl = "";
  let notifiedToday = {};

  const $ = (selector) => document.querySelector(selector);

  function fmtTime(value) {
    return String(value).replace(/^0/, "");
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);
  }

  function periodTime(p) {
    return fmtTime(p.start) + "-" + fmtTime(p.end);
  }

  function loadCourses() {
    try {
      const raw = localStorage.getItem(COURSE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function saveCourses() {
    try {
      localStorage.setItem(COURSE_KEY, JSON.stringify(courses));
    } catch (error) {
      showToast("保存失败，浏览器存储不可用");
    }
  }

  function loadReminder() {
    try {
      return localStorage.getItem(REMINDER_KEY) === "on";
    } catch (error) {
      return false;
    }
  }

  function saveReminder() {
    try {
      localStorage.setItem(REMINDER_KEY, reminderOn ? "on" : "off");
    } catch (error) {
      /* ignore */
    }
  }

  function findCourse(day, period) {
    return courses.find((c) => c.day === day && c.period === period);
  }

  /* ---------- 课表渲染 ---------- */
  function renderSchedule() {
    const table = $("#scheduleTable");
    const now = new Date();
    const nowHm = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
    const dayHeaders = DAYS.map(
      (name, i) => `<th class="week-head day-${i}">${name}</th>`
    ).join("");

    let html = `<thead><tr><th class="time-head" aria-hidden="true"></th>${dayHeaders}</tr></thead><tbody>`;

    PERIODS.forEach((period) => {
      const isCurrent =
        period.start <= nowHm && nowHm < period.end ? ' class="is-current"' : "";
      html += `<tr${isCurrent}>`;
      html +=
        `<th class="time-cell" scope="row">` +
        `<span class="period-no">第${period.no}节</span>` +
        `<span class="period-time">${periodTime(period)}</span>` +
        `</th>`;

      DAYS.forEach((_, day) => {
        const course = findCourse(day, period.no);
        if (!course) {
          html +=
            `<td class="slot">` +
            `<button class="slot-add" type="button" data-action="add" ` +
            `data-day="${day}" data-period="${period.no}" ` +
            `aria-label="添加${DAYS[day]}第${period.no}节课程">＋</button>` +
            `</td>`;
          return;
        }

        const metaLines = [];
        if (course.location) metaLines.push(escapeHtml(course.location));
        if (course.teacher) metaLines.push(escapeHtml(course.teacher));

        html +=
          `<td class="slot">` +
          `<button class="course-card color-${Number(course.color) || 0}" type="button" ` +
          `data-action="edit" data-id="${escapeHtml(course.id)}">` +
          `<span class="course-name">${escapeHtml(course.name)}</span>` +
          (metaLines.length
            ? `<span class="course-meta">${metaLines.join(" · ")}</span>`
            : "") +
          `<span class="course-edit-tip">点击编辑</span>` +
          `</button>` +
          `</td>`;
      });

      html += "</tr>";
    });

    html += "</tbody>";
    table.innerHTML = html;
  }

  /* ---------- 弹窗通用 ---------- */
  function showModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }

  function hideModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }

  function updateCourseMapLink() {
    const raw = ($("#courseLocation").value || "").trim();
    const query = raw ? raw + " 云南大学" : "云南大学呈贡校区";
    $("#courseMapLink").href =
      "https://api.map.baidu.com/place/search?query=" +
      encodeURIComponent(query) +
      "&region=" +
      encodeURIComponent("昆明") +
      "&output=html&src=webapp.yundaxingqiu.schedule";
  }

  function openManualModal(options) {
    const opts = options || {};
    const course = opts.course || null;
    editingId = course ? course.id : null;

    $("#manualTitle").textContent = course ? "编辑课程" : "录入课程";
    $("#courseDay").value = String(opts.day != null ? opts.day : 0);
    $("#coursePeriod").value = String(opts.period != null ? opts.period : 1);
    $("#courseName").value = course ? course.name : "";
    $("#courseLocation").value = course && course.location ? course.location : "";
    $("#courseTeacher").value = course && course.teacher ? course.teacher : "";
    updateCourseMapLink();
    selectedColor = course ? Number(course.color) || 0 : 0;
    updateColorUI();
    $("#deleteCourseBtn").style.display = course ? "" : "none";
    showModal("manualModal");
    setTimeout(() => $("#courseName").focus(), 80);
  }

  function openPhotoModal() {
    $("#photoPlaceholder").hidden = false;
    $("#photoImg").hidden = true;
    $("#photoImg").removeAttribute("src");
    $("#ocrOutput").value = "";
    setOcrStatus("尚未选择照片", "");
    showModal("photoModal");
  }

  /* ---------- 手动录入表单 ---------- */
  function buildSelects() {
    const daySel = $("#courseDay");
    const periodSel = $("#coursePeriod");

    DAYS.forEach((name, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = name;
      daySel.appendChild(option);
    });

    PERIODS.forEach((period) => {
      const option = document.createElement("option");
      option.value = String(period.no);
      option.textContent = `第${period.no}节 ${periodTime(period)}`;
      periodSel.appendChild(option);
    });
  }

  function buildColorPicker() {
    const row = $("#colorRow");
    COURSE_COLORS.forEach((color, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "color-dot";
      dot.dataset.color = String(i);
      dot.style.background = color.dot;
      dot.title = color.name;
      dot.setAttribute("aria-label", color.name);
      dot.setAttribute("role", "radio");
      row.appendChild(dot);
    });
    updateColorUI();
  }

  function updateColorUI() {
    document.querySelectorAll("#colorRow .color-dot").forEach((dot) => {
      const isSelected = Number(dot.dataset.color) === selectedColor;
      dot.classList.toggle("selected", isSelected);
      dot.setAttribute("aria-checked", String(isSelected));
    });
  }

  $("#colorRow").addEventListener("click", (event) => {
    const dot = event.target.closest(".color-dot");
    if (!dot) return;
    selectedColor = Number(dot.dataset.color);
    updateColorUI();
  });

  $("#manualForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#courseName").value.trim();
    if (!name) {
      $("#courseName").focus();
      showToast("请先填写课程名称");
      return;
    }

    const day = Number($("#courseDay").value);
    const period = Number($("#coursePeriod").value);
    const duplicate = courses.find(
      (c) => c.id !== editingId && c.day === day && c.period === period
    );

    if (duplicate) {
      showToast(`${DAYS[day]}第${period}节已有课程，点它即可编辑`);
      return;
    }

    const location = $("#courseLocation").value.trim();
    const teacher = $("#courseTeacher").value.trim();

    if (editingId) {
      const course = courses.find((c) => c.id === editingId);
      if (course) {
        Object.assign(course, { day, period, name, location, teacher, color: selectedColor });
      }
    } else {
      courses.push({
        id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        day,
        period,
        name,
        location,
        teacher,
        color: selectedColor
      });
    }

    saveCourses();
    renderSchedule();
    hideModal("manualModal");
    showToast(`已保存：${DAYS[day]}第${period}节 ${name}`);
  });

  $("#deleteCourseBtn").addEventListener("click", () => {
    if (!editingId) return;
    const course = courses.find((c) => c.id === editingId);
    if (!course) return;
    const ok = window.confirm(`确定删除“${course.name}”这节课吗？`);
    if (!ok) return;
    courses = courses.filter((c) => c.id !== editingId);
    editingId = null;
    saveCourses();
    renderSchedule();
    hideModal("manualModal");
    showToast("课程已删除");
  });

  $("#scheduleTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "add") {
      openManualModal({ day: Number(button.dataset.day), period: Number(button.dataset.period) });
      return;
    }
    if (button.dataset.action === "edit") {
      const course = courses.find((c) => c.id === button.dataset.id);
      if (course) openManualModal({ course });
    }
  });

  $("#openManualBtn").addEventListener("click", () => openManualModal());

  /* ---------- 拍照识别 ---------- */
  $("#openPhotoBtn").addEventListener("click", openPhotoModal);

  function triggerPhotoInput(capture) {
    const input = $("#photoInput");
    if (capture) {
      input.setAttribute("capture", "environment");
    } else {
      input.removeAttribute("capture");
    }
    input.value = "";
    input.click();
  }

  $("#cameraBtn").addEventListener("click", () => triggerPhotoInput(true));
  $("#albumBtn").addEventListener("click", () => triggerPhotoInput(false));

  $("#photoInput").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    photoObjectUrl = URL.createObjectURL(file);
    const img = $("#photoImg");
    img.src = photoObjectUrl;
    img.hidden = false;
    $("#photoPlaceholder").hidden = true;
    $("#ocrOutput").value = "";
    setOcrStatus("图片已载入，正在加载识别引擎…", "busy");
    runPhotoOcr(file);
  });

  function setOcrStatus(message, state) {
    const status = $("#ocrStatus");
    status.textContent = message;
    status.classList.toggle("busy", state === "busy");
    status.classList.toggle("done", state === "done");
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        reject(new Error("加载失败"));
      };
      document.head.appendChild(script);
    });
  }

  async function ensureTesseract() {
    if (window.Tesseract) return true;
    const sources = [
      "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
      "https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js"
    ];
    for (const src of sources) {
      try {
        await loadScript(src);
        if (window.Tesseract) return true;
      } catch (error) {
        /* try next source */
      }
    }
    return false;
  }

  async function runPhotoOcr() {
    const available = await ensureTesseract();
    if (!available) {
      setOcrStatus(
        "识别引擎加载失败：需要联网才能首次下载。可重试，或对照照片手动录入。",
        ""
      );
      return;
    }

    setOcrStatus(
      "识别引擎已加载，正在下载中文语言包并识别（首次较慢）…",
      "busy"
    );

    let worker = null;
    try {
      worker = await window.Tesseract.createWorker("chi_sim+eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            const percent = Math.round((message.progress || 0) * 100);
            if (percent % 5 === 0) {
              setOcrStatus(`正在识别文字… ${percent}%`, "busy");
            }
          }
        }
      });
      const result = await worker.recognize(photoObjectUrl);
      const text = String(result.data && result.data.text ? result.data.text : "")
        .replace(/\s+/g, " ")
        .trim();
      $("#ocrOutput").value = text;
      setOcrStatus(
        text
          ? `识别完成，已提取 ${text.length} 个字符，请在下框校对。`
          : "没有识别到文字，可能是图片不够清晰，或网络语言包下载失败。",
        text ? "done" : ""
      );
    } catch (error) {
      setOcrStatus("识别失败：可检查网络后重试，也可以对照照片手动录入。", "");
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (error) {
          /* ignore */
        }
      }
    }
  }

  $("#copyOcrBtn").addEventListener("click", async () => {
    const output = $("#ocrOutput");
    if (!output.value.trim()) {
      showToast("还没有可复制的识别结果");
      return;
    }
    output.focus();
    output.select();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(output.value);
      } else {
        document.execCommand("copy");
      }
      showToast("识别结果已复制");
    } catch (error) {
      document.execCommand("copy");
      showToast("已选中识别结果，可按 Ctrl/Cmd + C 复制");
    }
  });

  /* ---------- 上课提醒 ---------- */
  function toggleReminderUi() {
    const wrap = $("#reminderWrap");
    const toggle = $("#reminderToggle");
    wrap.classList.toggle("on", reminderOn);
    toggle.setAttribute("aria-checked", String(reminderOn));

    const status = $("#reminderStatus");
    if (reminderOn) {
      const permission =
        "Notification" in window ? Notification.permission : "unsupported";
      status.textContent =
        permission === "granted"
          ? "已开启：到点会发送浏览器提醒"
          : "已开启：到点会在页面内提醒";
    } else {
      status.textContent = "点击开启后，到上课时间会提醒你";
    }
  }

  function startReminderWatcher() {
    if (reminderTimer) clearInterval(reminderTimer);
    checkReminders();
    reminderTimer = setInterval(checkReminders, 20000);
  }

  function stopReminderWatcher() {
    if (reminderTimer) {
      clearInterval(reminderTimer);
      reminderTimer = null;
    }
  }

  function setReminder(on) {
    reminderOn = on;
    saveReminder();
    toggleReminderUi();
    if (on) {
      startReminderWatcher();
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission()
          .then(() => toggleReminderUi())
          .catch(() => toggleReminderUi());
      }
    } else {
      stopReminderWatcher();
    }
  }

  $("#reminderToggle").addEventListener("click", () => {
    setReminder(!reminderOn);
  });

  function checkReminders() {
    if (!reminderOn || !courses.length) return;
    const now = new Date();
    const nowHm = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
    const dateKey = [
      now.getFullYear(),
      pad2(now.getMonth() + 1),
      pad2(now.getDate())
    ].join("-");

    courses.forEach((course) => {
      const period = PERIODS.find((p) => p.no === course.period);
      if (!period || period.start !== nowHm) return;
      const key = dateKey + "|" + course.id;
      if (notifiedToday[key]) return;
      notifiedToday[key] = true;
      notifyCourse(course, period);
    });

    const keys = Object.keys(notifiedToday);
    if (keys.length > 200) {
      keys.slice(0, 100).forEach((key) => delete notifiedToday[key]);
    }
  }

  function notifyCourse(course, period) {
    const place = course.location ? " · " + course.location : "";
    const when =
      `${DAYS[course.day]}第${period.no}节 ` +
      `${fmtTime(period.start)}-${fmtTime(period.end)}` +
      place;
    const title = `⏰ ${course.name} 要上课啦`;

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, {
          body: when,
          icon: "favicon.svg"
        });
      } catch (error) {
        /* 部分环境不支持构造通知 */
      }
    }
    showToast(title + "\n" + when);
  }

  /* ---------- Toast ---------- */
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
  }

  /* ---------- 弹窗关闭事件 ---------- */
  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => hideModal(button.dataset.close));
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) hideModal(backdrop.id);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideModal("manualModal");
      hideModal("photoModal");
    }
  });

  /* ---------- 初始化 ---------- */
  $("#courseLocation").addEventListener("input", updateCourseMapLink);
  buildSelects();
  buildColorPicker();
  renderSchedule();
  toggleReminderUi();
  if (reminderOn) startReminderWatcher();
})();
