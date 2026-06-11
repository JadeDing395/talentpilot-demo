/**
 * 在 React hydrate 之前清掉某些浏览器主题扩展（Phoenix Theme 等）
 * 往 head / body 里注入的占位节点，避免 Next dev mode 的 hydration-mismatch
 * 红色 overlay。这些扩展节点不影响功能，纯粹是污染 DOM。
 *
 * 通过 next/script strategy="beforeInteractive" 在 head 里同步加载，
 * 会在 React 解析 SSR HTML 之前执行 + MutationObserver 持续监听 6 秒。
 */
(function () {
  var IDS = ["__PHOENIX_THEMED_EMPTY_SYMBOL_DEFS_ID__"];
  var ID_RE = /^__[A-Z_]+_(?:THEMED|INJECTED|EMPTY)_/;
  function kill() {
    IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
    document.querySelectorAll("[id]").forEach(function (el) {
      if (ID_RE.test(el.id)) el.remove();
    });
  }
  kill();
  if (typeof MutationObserver !== "undefined") {
    var obs = new MutationObserver(kill);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () {
      obs.disconnect();
    }, 6000);
  }
})();
