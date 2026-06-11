/**
 * 用户身份隔离 - 让每个浏览器有自己的候选人库
 *
 * 客户端：getOrCreateUserId() 在浏览器 localStorage 生成/读取 UUID
 * 服务端：getUserIdFromRequest() 从 X-Radar-User-Id header 提取
 *
 * 服务器按 UUID 存独立 db 文件 (data/db-{userId}.json)，
 * 不同 HR 的浏览器拿到的是各自隔离的候选人库。
 */

const HEADER_NAME = "X-Radar-User-Id";
const STORAGE_KEY = "radar-user-id";
// 默认 fallback - 老数据 / header 缺失时用
const DEFAULT_USER_ID = "default";

/** 客户端：返回 UUID（不存就生成并存入 localStorage） */
export function getOrCreateUserId(): string {
  if (typeof window === "undefined") return DEFAULT_USER_ID;
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = generateUuid();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/** 服务端：从请求 header 拿 UUID（缺失就用 default，但记录） */
export function getUserIdFromRequest(req: Request): string {
  const id = req.headers.get(HEADER_NAME);
  if (!id) return DEFAULT_USER_ID;
  // 安全过滤：只允许字母数字-_，防止 path traversal
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return DEFAULT_USER_ID;
  return id;
}

export const USER_ID_HEADER = HEADER_NAME;

/** 简单的 UUID v4 生成（无依赖） */
function generateUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
