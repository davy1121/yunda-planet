(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function cleanZoomInSoon() {
    var html = document.documentElement;
    if (!html.classList.contains("pf-zoom-in")) return;

    var removed = false;
    function removeClass() {
      if (removed) return;
      removed = true;
      window.clearTimeout(timer);
      html.classList.remove("pf-zoom-in");
      html.removeEventListener("animationend", onEnd);
    }

    function onEnd(event) {
      if (event.target === document.body && event.animationName === "pf-screen-settle") {
        removeClass();
      }
    }

    html.addEventListener("animationend", onEnd);
    var timer = window.setTimeout(removeClass, 800);
  }

  function zoomTo(href) {
    var html = document.documentElement;

    if (reduceMotion) {
      window.location.href = href;
      return;
    }

    html.classList.add("pf-zoom-out");

    var navigated = false;
    function go() {
      if (navigated) return;
      navigated = true;
      window.location.href = href;
    }

    function onEnd(event) {
      if (event.target === document.body && event.animationName === "pf-screen-grow") {
        go();
      }
    }

    html.addEventListener("animationend", onEnd);
    window.setTimeout(go, 520);
  }

  function addFlag(href) {
    var clean = String(href).replace(/[?#].*$/, "");
    return clean + "?pf=1";
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest
      ? event.target.closest("a[href]")
      : null;
    if (!link || event.defaultPrevented) return;

    var href = link.getAttribute("href") || "";
    if (!/\.html($|[?#])/.test(href)) return;

    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();

    var rect = link.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2 + (window.scrollY || 0);
    document.body.style.transformOrigin = x + "px " + y + "px";

    zoomTo(addFlag(href));
  });

  cleanZoomInSoon();
})();
