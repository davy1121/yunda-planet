(function () {
  "use strict";

  // 新页面加载后先保持“放大”状态，再缩小到正常尺寸
  var hasFlag = /(?:^|[?&])pf=1(?:&|$)/.test(window.location.search);
  if (!hasFlag) return;

  document.documentElement.classList.add("pf-zoom-in");

  // 去掉地址栏里的临时参数，避免刷新后重复播放
  try {
    if (window.history && window.history.replaceState) {
      var cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState(null, "", cleanUrl);
    }
  } catch (error) {
    /* 部分 file:// 环境不允许改写地址，忽略即可 */
  }
})();
