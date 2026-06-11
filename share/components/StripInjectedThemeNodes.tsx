"use client";

/**
 * 清理浏览器主题扩展（Phoenix Theme 等）往 head / body 注入的占位节点，
 * 避免 Next dev mode 的 hydration-mismatch 红框。
 *
 * 工作原理:
 *  - "use client" 模块顶层代码会在客户端 bundle 加载时立即同步执行,
 *    早于 React hydrate, 所以这里直接 kill() 一次能在 hydration 之前清掉。
 *  - MutationObserver 再守 6 秒兜底扩展延迟注入的情况。
 *  - 组件本身不渲染任何 DOM, 只是承载模块副作用。
 */

const IDS = ["__PHOENIX_THEMED_EMPTY_SYMBOL_DEFS_ID__"];
const ID_RE = /^__[A-Z_]+_(?:THEMED|INJECTED|EMPTY)_/;

function kill() {
  if (typeof document === "undefined") return;
  for (const id of IDS) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
  document.querySelectorAll("[id]").forEach((el) => {
    if (ID_RE.test(el.id)) el.remove();
  });
}

if (typeof window !== "undefined") {
  kill();
  if (typeof MutationObserver !== "undefined") {
    const obs = new MutationObserver(kill);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 6000);
  }
}

export default function StripInjectedThemeNodes() {
  return null;
}
