/**
 * 平台元数据中枢 —— 所有 UI / 路由 / API 引用都从这里读，避免硬编码。
 */

import type { Platform } from "./types";

export interface PlatformMeta {
  id: Platform;
  label: string;        // "ArtStation" / "微博" / "小红书"
  shortLabel: string;   // "AS" / "WB" / "XHS"，徽章用
  route: string;        // "/artstation" / "/weibo" / "/xiaohongshu"
  apiPrefix: string;    // "/api/artstation" 等
  color: {
    brand: string;
    brandDark: string;
    brandSoft: string;  // 极浅背景（按钮 hover / chip 底色）
    ring: string;       // focus ring 用的 rgba（10% 透明度）
  };
  requiresLogin: "qr" | "none";
  badge: { bg: string; fg: string; label: string };
  tagline: string;      // 扫描页副标题用
}

export const PLATFORMS: Record<Platform, PlatformMeta> = {
  artstation: {
    id: "artstation",
    label: "ArtStation",
    shortLabel: "AS",
    route: "/artstation",
    apiPrefix: "/api/artstation",
    color: {
      brand: "#0d4f3c",
      brandDark: "#083828",
      brandSoft: "#ecf3ef",
      ring: "rgba(13, 79, 60, 0.35)",
    },
    requiresLogin: "none",
    badge: { bg: "#dceee5", fg: "#0d4f3c", label: "AS" },
    tagline: "全球画师社区 · 公开 API · 无需登录",
  },
  weibo: {
    id: "weibo",
    label: "微博",
    shortLabel: "WB",
    route: "/weibo",
    apiPrefix: "/api/weibo",
    color: {
      brand: "#FF8200",
      brandDark: "#cc6800",
      brandSoft: "#fff4e6",
      ring: "rgba(255, 130, 0, 0.35)",
    },
    requiresLogin: "qr",
    badge: { bg: "#fff0e0", fg: "#cc6800", label: "微博" },
    tagline: "微博 · 中文创作者 · 扫码登录",
  },
  xiaohongshu: {
    id: "xiaohongshu",
    label: "小红书",
    shortLabel: "XHS",
    route: "/xiaohongshu",
    apiPrefix: "/api/xhs",
    color: {
      brand: "#FF2442",
      brandDark: "#cc1c35",
      brandSoft: "#ffe6ec",
      ring: "rgba(255, 36, 66, 0.35)",
    },
    requiresLogin: "qr",
    badge: { bg: "#ffe1e6", fg: "#cc1c35", label: "小红书" },
    tagline: "小红书 · 笔记反推作者 · 扫码登录",
  },
};

export const PLATFORM_LIST: PlatformMeta[] = [
  PLATFORMS.artstation,
  PLATFORMS.weibo,
  PLATFORMS.xiaohongshu,
];

/** 候选人库（聚合页）的中性主题 —— 不属于任何单一平台 */
export const NEUTRAL_THEME = {
  brand: "#0f172a",      // slate-900
  brandDark: "#020617",  // slate-950
  brandSoft: "#f1f5f9",  // slate-100
  ring: "rgba(15, 23, 42, 0.25)",
};

/** 根据 pathname 判断当前在哪个平台页（用于 layout 注入 data-platform） */
export function getPlatformByPathname(pathname: string): Platform | null {
  if (pathname.startsWith("/artstation") || pathname === "/radar") return "artstation";
  if (pathname.startsWith("/weibo")) return "weibo";
  if (pathname.startsWith("/xiaohongshu")) return "xiaohongshu";
  return null;
}

export function getPlatformMeta(id: Platform): PlatformMeta {
  return PLATFORMS[id];
}
