/**
 * ArtStation 抓取层 —— 纯 fetch（ArtStation API 公开、无需登录）。
 * ArtStation 数据源适配，加上 toNormalizedCandidate 适配
 * 我们统一的 PlatformAdapter 协议。
 */

import type { NormalizedCandidate, NormalizedPost } from "./social-types";
import { createSession, profilePath } from "./puppeteer-shared";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: "https://www.artstation.com/",
};

const ARTSTATION = "https://www.artstation.com";

// 艺术家搜索端点 /api/v2/search/users.json 有 Cloudflare 防护,纯 fetch 会被 403。
// 用 puppeteer(真实指纹 + CF clearance,profile 复用)在页面上下文里 fetch 即可正常返回。
const asSession = createSession({ profileDir: profilePath("chrome-profile-artstation"), label: "[AS]" });

// 跟踪最后一次 HTTP 错误，让前端能拿到接口级错误信息
let lastPostError: { status: number; body?: string; url?: string } | null = null;
export const getLastPostError = () => lastPostError;
export const clearPostError = () => { lastPostError = null; };

export interface ASSocialLink {
  type: string;
  url: string;
}

export interface ASUser {
  username: string;
  full_name: string;
  headline: string | null;
  location: string | null;
  country: string | null;
  avatar_url: string | null;
  artstation_url: string;
  bio: string | null;
  social_links: ASSocialLink[];
  available_for_work: boolean | null;
  followers_count: number | null;
}

export interface ASProject {
  title: string;
  tags: string[];
  description: string | null;
  cover_url: string | null;
}

// ---------- 搜索 ----------

// 先搜【艺术家档案】(而非搜作品反推作者)——召回的是"主业就是干这个的人",
// 相关性高、且直接带 followers / location / 可雇佣状态等信号。
export async function searchUsers(query: string, opts: { maxUsers?: number } = {}): Promise<ASUser[]> {
  const maxUsers = opts.maxUsers ?? 30;
  const endpoint = `${ARTSTATION}/api/v2/search/users.json`;
  try {
    const page = await asSession.getPage();
    // 首次访问站点拿 Cloudflare clearance(profile 复用,后续免跳)
    if (!page.url().includes("artstation.com")) {
      await page.goto(`${ARTSTATION}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await delay(2500);
    }

    const seen = new Set<string>();
    const users: ASUser[] = [];

    for (let pg = 1; pg <= 3 && users.length < maxUsers; pg += 1) {
      const result = await page.evaluate(async (q: string, p: number) => {
        const r = await fetch(
          `/api/v2/search/users.json?query=${encodeURIComponent(q)}&page=${p}&per_page=30`,
          { headers: { Accept: "application/json" }, credentials: "include" },
        );
        if (!r.ok) return { ok: false, status: r.status, body: (await r.text()).slice(0, 300) };
        return { ok: true, data: (await r.json()) as { data?: Record<string, unknown>[] } };
      }, query, pg);

      if (!result.ok) {
        lastPostError = { status: result.status ?? 0, body: result.body ?? "", url: endpoint };
        break;
      }
      const arr = result.data?.data ?? [];
      if (arr.length === 0) break;

      for (const u of arr) {
        const username = u.username as string | undefined;
        if (!username || seen.has(username)) continue;
        seen.add(username);
        const available =
          (u.available_full_time as boolean) ||
          (u.available_contract as boolean) ||
          (u.available_freelance as boolean) ||
          false;
        users.push({
          username,
          full_name: (u.full_name as string) ?? username,
          headline: (u.headline as string | null) ?? null,
          location: (u.location as string | null) ?? null,
          country: (u.country as string | null) ?? null,
          avatar_url:
            (u.small_avatar_url as string | null) ??
            (u.medium_avatar_url as string | null) ??
            (u.large_avatar_url as string | null) ?? null,
          artstation_url: (u.artstation_profile_url as string) ?? `${ARTSTATION}/${username}`,
          bio: null,
          social_links: [],
          available_for_work: available,
          followers_count: typeof u.followers_count === "number" ? u.followers_count : null,
        });
        if (users.length >= maxUsers) break;
      }
    }
    return users;
  } catch (err) {
    lastPostError = { status: 0, body: String(err), url: endpoint };
    return [];
  }
}

function parseSocialLinks(raw: unknown): ASSocialLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ASSocialLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const type = (obj.social_network as string) ?? (obj.type as string) ?? "link";
    const url = (obj.url as string) ?? "";
    if (url) out.push({ type, url });
  }
  return out;
}

export async function fetchProfile(username: string): Promise<Partial<ASUser>> {
  const url = `${ARTSTATION}/${username}.json`;
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      lastPostError = { status: res.status, body: await res.text().catch(() => ""), url };
      return {};
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      bio: (data.bio as string | null) ?? null,
      location: (data.location as string | null) ?? null,
      country: (data.country as string | null) ?? null,
      headline: (data.headline as string | null) ?? null,
      full_name: (data.full_name as string | null) ?? undefined,
      avatar_url:
        (data.medium_avatar_url as string | null) ??
        (data.small_avatar_url as string | null) ?? null,
      social_links: parseSocialLinks(data.social_profiles),
      available_for_work: (data.available_for_work as boolean | null) ?? null,
      followers_count: typeof data.followers_count === "number" ? data.followers_count : null,
    };
  } catch (err) {
    lastPostError = { status: 0, body: String(err), url };
    return {};
  }
}

export async function fetchProjects(username: string, limit = 10): Promise<ASProject[]> {
  const url = `${ARTSTATION}/users/${username}/projects.json?per_page=${limit}&page=1`;
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      lastPostError = { status: res.status, body: await res.text().catch(() => ""), url };
      return [];
    }
    const data = (await res.json()) as { data?: unknown[] };
    if (!Array.isArray(data?.data)) return [];
    return (data.data as Record<string, unknown>[]).map((p) => ({
      title: (p.title as string) ?? "Untitled",
      tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
      description: (p.description as string | null) ?? null,
      cover_url: ((p.cover as Record<string, unknown> | undefined)?.small_square_url as string | null) ??
                 ((p.cover as Record<string, unknown> | undefined)?.medium_square_url as string | null) ??
                 (p.cover_url as string | null) ?? null,
    }));
  } catch (err) {
    lastPostError = { status: 0, body: String(err), url };
    return [];
  }
}

// ---------- 归一化为 NormalizedCandidate（统一评分入口） ----------

export function toNormalizedCandidate(user: ASUser, projects: ASProject[]): NormalizedCandidate {
  const np: NormalizedPost[] = projects.map((p) => ({
    text: [p.title, p.description?.slice(0, 200)].filter(Boolean).join(" — "),
    topics: p.tags,
    imageUrls: p.cover_url ? [p.cover_url] : [],
    engagement: 0,
    publishTime: "",
  }));
  return {
    platform: "artstation",
    platformUserId: user.username,
    name: user.full_name,
    avatarUrl: user.avatar_url,
    profileUrl: user.artstation_url,
    bio: user.bio,
    location: user.location ?? user.country,
    ipLocation: null,
    followers: user.followers_count,
    following: null,
    postsCount: projects.length || null,
    verified: false, // ArtStation 无平台认证概念
    verifiedReason: user.headline ?? null, // 用 headline 当"认证理由"展示
    posts: np,
    rawGender: null,
  };
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
