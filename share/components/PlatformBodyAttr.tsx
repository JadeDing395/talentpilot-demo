"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getPlatformByPathname } from "@/lib/platforms";

/**
 * 客户端组件 —— 监听 pathname 变化，把当前平台写到 <body data-platform>，
 * 让 CSS [data-platform="..."] 的主色变量自动生效。
 *
 * Server side render 阶段 body 没有 data-platform 也 OK（默认 root 变量 = slate 中性色），
 * client hydration 后立即设置；切平台 nav 链接时也会同步切色（200ms 过渡）。
 */
export default function PlatformBodyAttr() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const platform = getPlatformByPathname(pathname ?? "");
    if (platform) {
      document.body.dataset.platform = platform;
    } else {
      delete document.body.dataset.platform;
    }
  }, [pathname]);

  return null;
}
