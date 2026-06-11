"use client";

import { useEffect } from "react";
import { getOrCreateUserId, USER_ID_HEADER } from "@/lib/userIdentity";

/**
 * 在客户端启动时：
 * 1. 确保 localStorage 里有 UUID
 * 2. monkey-patch window.fetch，给所有同源请求自动加 X-Radar-User-Id header
 *
 * 这样所有 API 请求都会带上当前浏览器的 UUID，
 * 服务端按 UUID 读取/写入独立的 db-{uuid}.json，
 * 不同浏览器的人才库自然隔离。
 */
export default function UserIdInitializer() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as unknown as { __radarFetchPatched?: boolean }).__radarFetchPatched) return;

    const userId = getOrCreateUserId();
    const originalFetch = window.fetch.bind(window);

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      // 只对相对路径或同源请求加 header（防误改第三方请求）
      let isInternal = false;
      try {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.toString()
            : input.url;
        if (url.startsWith("/")) {
          isInternal = true;
        } else {
          const u = new URL(url, window.location.origin);
          if (u.origin === window.location.origin) isInternal = true;
        }
      } catch {
        // ignore
      }

      if (!isInternal) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init?.headers ?? {});
      if (!headers.has(USER_ID_HEADER)) {
        headers.set(USER_ID_HEADER, userId);
      }
      return originalFetch(input, { ...init, headers });
    }) as typeof fetch;

    (window as unknown as { __radarFetchPatched?: boolean }).__radarFetchPatched = true;
  }, []);

  return null;
}
