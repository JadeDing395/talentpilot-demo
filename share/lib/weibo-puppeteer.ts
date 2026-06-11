/**
 * 微博 puppeteer 爬虫
 *
 * 关键点：
 * - 独立 chrome profile (.chrome-profile-weibo) 存登录态 cookie
 * - 搜索 / 主页 / 微博列表全部优先走 ajax JSON 接口（登录态下可用），失败再 fallback DOM
 * - 首次登录走 passport.weibo.com 扫码，二维码截图返给前端展示
 */

import type { Page } from "puppeteer";
import { createSession, delay, elementScreenshotBase64, gotoWithRetries, profilePath, type Session } from "./puppeteer-shared";
import type { WBUser, WBPost, NormalizedCandidate, LoginStatus, NormalizedPost } from "./social-types";

const PROFILE_DIR = profilePath("chrome-profile-weibo");

// 扫描用 headless session(默认会拦图片省带宽)。
const session = createSession({ profileDir: PROFILE_DIR, label: "[WB]" });

const WEIBO_HOST = "https://weibo.com";
const SEARCH_HOST = "https://s.weibo.com";
// 微博真正的登录页(weibo.com/login 会跳回首页,没有二维码)
const LOGIN_URL = "https://passport.weibo.com/sso/signin";

export type LoginMode = "qr" | "window";

// 登录进行中时,用这个独立 session 持有登录浏览器(QR 模式 forceHeadless,window 模式可见)。
// 同一时刻只有 session(扫描)或 loginSession(登录)之一持有 profile,避免两个 Chrome 抢 userDataDir。
let loginSession: Session | null = null;

// ------------------- 登录态检查 -------------------
//
// 关键:微博给匿名访客也发 SUB/SUBP cookie,所以"有没有 cookie"判断会永远误报已登录。
// 改成真验证 —— 导航到搜索页,看是否被重定向到 passport.weibo.com 登录墙。

/** 稳态检测:导航搜索页,被踢到 passport = 未登录。 */
async function verifyBySearchRedirect(): Promise<LoginStatus> {
  const page = await session.getPage();
  await page.goto(`${SEARCH_HOST}/weibo?q=a&Refer=g`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await delay(400, 900);
  const url = page.url();
  const loggedIn = !/passport\.weibo|sso\/signin/i.test(url);
  console.log(`[WB] verifyBySearchRedirect landed=${url} loggedIn=${loggedIn}`);
  return loggedIn
    ? { loggedIn: true, message: "微博登录态正常" }
    : { loggedIn: false, loginUrl: LOGIN_URL, message: "未登录或登录态已失效" };
}

export async function checkLoginStatus(): Promise<LoginStatus> {
  try {
    // 登录进行中:复用登录浏览器检测(扫码后 passport 页会自动跳走),
    // 不另开 headless 浏览器,避免抢 profile 锁。
    if (loginSession && loginSession.isActive()) {
      const lp = await loginSession.getPage();
      const url = lp.url();
      const stillOnLogin = /passport\.weibo|sso\/signin/i.test(url);
      if (!stillOnLogin) {
        // 已离开登录页 → 登录成功。关登录浏览器 flush cookie,扫描 session 接管。
        console.log(`[WB] login detected (left login page → ${url}), closing login browser`);
        await loginSession.closeBrowser().catch(() => {});
        loginSession = null;
        return { loggedIn: true, message: "微博登录成功" };
      }
      return { loggedIn: false, loginUrl: LOGIN_URL, message: "等待扫码登录中..." };
    }
    return await verifyBySearchRedirect();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[WB] checkLoginStatus error: ${msg}`);
    // 安全方向:出错一律当未登录,宁可让用户重扫,也不误报已登录导致 0 召回。
    return { loggedIn: false, loginUrl: LOGIN_URL, message: `检查登录失败：${msg}` };
  }
}

/**
 * 启动登录流程。
 * - mode="qr"(默认):后台 headless 打开 passport 登录页,截二维码 base64 返前端,用户网页扫码。
 *   用 forceHeadless:true 的独立 session —— 既是真 headless,又不拦图片(微博二维码是网络图片,
 *   被默认 session 的图片拦截 abort 掉就会截图空白)。
 * - mode="window":弹出可见 Chrome 窗口,用户直接在窗口里登录(仅本机有效,远程看不到窗口)。
 * 两种模式都先关掉扫描浏览器,确保同一时刻只有一个 Chrome 持有 profile。
 */
export async function startLoginFlow(mode: LoginMode = "qr"): Promise<LoginStatus> {
  // 关掉扫描浏览器,释放 profile 独占
  await session.closeBrowser().catch(() => {});
  // 关掉可能残留的上一个登录浏览器
  if (loginSession) {
    await loginSession.closeBrowser().catch(() => {});
    loginSession = null;
  }

  loginSession = createSession({
    profileDir: PROFILE_DIR,
    label: mode === "window" ? "[WB-window]" : "[WB-login]",
    forceHeadless: mode === "window" ? false : true,
  });

  const page = await loginSession.getPage();
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await delay(1500, 2500);

  if (mode === "window") {
    return {
      loggedIn: false,
      loginUrl: LOGIN_URL,
      message: "已弹出 Chrome 窗口,请在窗口里完成登录,完成后会自动检测(仅本机可用)",
    };
  }

  // QR 模式:等二维码出现并截图
  const qrSelector =
    "img[src*='qr.weibo.cn'], img[src*='/inf/gen'], img[src*='qrcode'], [class*='qrcode'] img, canvas";
  try {
    await page.waitForSelector(qrSelector, { timeout: 10000 });
  } catch {
    // 没等到,继续,截图会返回 null
  }
  await delay(800, 1500);

  const qr = await elementScreenshotBase64(page, qrSelector);
  console.log(`[WB] startLoginFlow(qr) qrDataUrl=${qr ? `(base64 ${qr.length}B)` : "null"}`);
  return {
    loggedIn: false,
    loginUrl: LOGIN_URL,
    qrDataUrl: qr ?? undefined,
    message: qr
      ? "请用微博 App 扫描二维码登录,完成后会自动检测"
      : "二维码截取失败 — 请稍后重试,或改用「本机浏览器登录」",
  };
}

// ------------------- AJAX 工具 -------------------

interface AjaxOptions {
  url: string;
  expectJson?: boolean;
}

async function ajaxGet<T>(opts: AjaxOptions): Promise<T> {
  const page = await session.getPage();
  // 用 page.evaluate 直接 fetch，可携带当前登录态 cookie
  const result = await page.evaluate(async (url) => {
    // 加超时:微博 ajax 偶发 hang,无超时会拖死整轮扫描
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        credentials: "include",
        signal: ctrl.signal,
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json, text/plain, */*",
        },
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    } catch (e) {
      return { ok: false, status: 0, text: `fetch aborted/failed: ${String(e)}` };
    } finally {
      clearTimeout(timer);
    }
  }, opts.url);
  if (!result.ok) {
    session.recordPostError({ status: result.status, body: result.text.slice(0, 500), url: opts.url });
    throw new Error(`微博接口 ${opts.url} 返回 ${result.status}`);
  }
  try {
    return JSON.parse(result.text) as T;
  } catch {
    session.recordPostError({ status: result.status, body: result.text.slice(0, 500), url: opts.url });
    throw new Error(`微博接口 ${opts.url} 返回非 JSON`);
  }
}

// ------------------- 搜索 -------------------

export interface SearchOpts {
  page?: number;
  /** sort=hot 按粉丝排，sort=time 按时间，默认 hot */
  sort?: "hot" | "time";
}

/**
 * 搜索用户。返回结果由 s.weibo.com 用户标签页 DOM 解析。
 * 微博搜索 API 没有公开稳定接口，DOM 是最稳定的方式。
 */
export async function searchUsers(query: string, opts: SearchOpts = {}): Promise<WBUser[]> {
  const page = await session.getPage();
  // 关键策略：搜【实时微博】从微博正文里找作者，避免搜用户昵称召回空号。
  // 注意：去掉 query 里的 "#"——带 # 的话题搜索会进入话题页，
  // 话题页的 DOM 结构完全不同（无 .card-wrap），导致 0 召回。
  // 关键策略:用微博「找人」搜索(搜账号,而非搜正文反推)。
  // 搜正文召回的是"聊该话题的路人玩家";找人直接召回画师账号(昵称/认证含"插画师/画师"等)。
  const cleanQuery = query.replace(/#/g, "").trim();
  const url = `${SEARCH_HOST}/user?q=${encodeURIComponent(cleanQuery)}&Refer=weibo_user`;
  console.log(`[WB] searchUsers(找人) query="${cleanQuery}" → ${url}`);
  await gotoWithRetries(page, url, {
    attempts: 3,
    timeout: 20000,
    waitUntil: "domcontentloaded",
    label: "[WB]",
  });
  await delay(2000, 3500);

  const users = await page.evaluate(() => {
    // 找人页:每个用户卡片含 /u/uid 链接 + 昵称;遍历用户链接去重
    const acc = new Map<string, { uid: string; screenName: string; avatarUrl: string; snippet: string }>();
    document.querySelectorAll("a[href*='weibo.com/u/']").forEach((el) => {
      const a = el as HTMLAnchorElement;
      const m = (a.href || "").match(/weibo\.com\/u\/(\d+)/);
      if (!m) return;
      const uid = m[1];
      const name = (a.innerText || a.textContent || "").trim();
      if (!name || name.length > 30) return; // 头像等无文字链接跳过
      if (acc.has(uid)) return;
      // 向上找卡片容器,取头像 + 认证/简介文案
      let card: Element = a;
      for (let i = 0; i < 5 && card.parentElement; i += 1) {
        card = card.parentElement;
        if (card.querySelector("img")) break;
      }
      const avatar = (card.querySelector("img") as HTMLImageElement | null)?.src ?? "";
      const snippet = ((card as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      acc.set(uid, {
        uid,
        screenName: name,
        avatarUrl: avatar.startsWith("//") ? `https:${avatar}` : avatar,
        snippet,
      });
    });
    return Array.from(acc.values());
  });

  console.log(`[WB] searchUsers parsed ${users.length} accounts for "${query}" (top: ${users.slice(0, 4).map((u) => u.screenName).join(", ")})`);

  return users.map((u) => ({
    uid: u.uid,
    screenName: u.screenName,
    avatarUrl: u.avatarUrl,
    description: u.snippet,
    followersCount: 0,
    friendsCount: 0,
    statusesCount: 0,
    verified: false,
    profileUrl: `https://weibo.com/u/${u.uid}`,
  })) as WBUser[];
}

// ------------------- 主页 + 微博列表 -------------------

interface WBProfileApiResp {
  ok: number;
  data?: {
    user: {
      id: number;
      idstr: string;
      screen_name: string;
      avatar_large: string;
      description: string;
      location: string;
      gender: string;
      followers_count: number;
      friends_count: number;
      statuses_count: number;
      verified: boolean;
      verified_reason?: string;
    };
  };
}

export async function fetchProfile(uid: string): Promise<WBUser | null> {
  try {
    const r = await ajaxGet<WBProfileApiResp>({ url: `${WEIBO_HOST}/ajax/profile/info?uid=${uid}` });
    if (r.ok !== 1 || !r.data) return null;
    const u = r.data.user;
    return {
      uid: u.idstr,
      screenName: u.screen_name,
      avatarUrl: u.avatar_large,
      gender: u.gender === "m" ? "男" : u.gender === "f" ? "女" : undefined,
      location: u.location,
      description: u.description,
      followersCount: u.followers_count,
      friendsCount: u.friends_count,
      statusesCount: u.statuses_count,
      verified: u.verified,
      verifiedReason: u.verified_reason,
      profileUrl: `${WEIBO_HOST}/u/${u.idstr}`,
    };
  } catch (err) {
    console.warn("[WB] fetchProfile failed", uid, err);
    return null;
  }
}

interface WBMyMblogResp {
  ok: number;
  data?: {
    list: Array<{
      idstr: string;
      created_at: string;
      text_raw?: string;
      text?: string;
      pic_ids?: string[];
      pic_infos?: { [id: string]: { large?: { url?: string }; original?: { url?: string }; bmiddle?: { url?: string } } };
      topic_struct?: Array<{ topic_title?: string }>;
      reposts_count: number;
      comments_count: number;
      attitudes_count: number;
    }>;
  };
}

export async function fetchRecentPosts(uid: string, limit = 20): Promise<WBPost[]> {
  const out: WBPost[] = [];
  let page = 1;
  while (out.length < limit && page <= 3) {
    try {
      const r = await ajaxGet<WBMyMblogResp>({
        url: `${WEIBO_HOST}/ajax/statuses/mymblog?uid=${uid}&page=${page}&feature=0`,
      });
      const list = r.data?.list ?? [];
      if (list.length === 0) break;
      for (const m of list) {
        const text = (m.text_raw ?? m.text ?? "").replace(/<[^>]+>/g, "").trim();
        const picUrls: string[] = [];
        if (m.pic_infos) {
          for (const id of m.pic_ids ?? []) {
            const info = m.pic_infos[id];
            const url = info?.large?.url ?? info?.original?.url ?? info?.bmiddle?.url;
            if (url) picUrls.push(url);
          }
        }
        out.push({
          mid: m.idstr,
          text,
          createdAt: m.created_at,
          picUrls,
          topics: (m.topic_struct ?? []).map((t) => t.topic_title ?? "").filter(Boolean),
          repostsCount: m.reposts_count ?? 0,
          commentsCount: m.comments_count ?? 0,
          attitudesCount: m.attitudes_count ?? 0,
        });
        if (out.length >= limit) break;
      }
      page++;
      await delay(800, 1500);
    } catch (err) {
      console.warn("[WB] fetchRecentPosts page failed", uid, page, err);
      break;
    }
  }
  return out;
}

// ------------------- 归一 -------------------

export function toNormalizedCandidate(user: WBUser, posts: WBPost[]): NormalizedCandidate {
  const np: NormalizedPost[] = posts.map((p) => ({
    text: p.text,
    topics: p.topics,
    imageUrls: p.picUrls,
    engagement: (p.attitudesCount ?? 0) + (p.commentsCount ?? 0) + (p.repostsCount ?? 0),
    publishTime: p.createdAt,
  }));
  return {
    platform: "weibo",
    platformUserId: user.uid,
    name: user.screenName,
    avatarUrl: user.avatarUrl || null,
    profileUrl: user.profileUrl,
    bio: user.description || null,
    location: user.location || null,
    ipLocation: null, // 微博的 IP 属地在每条微博 source 字段里，主页接口不直接给
    followers: user.followersCount ?? null,
    following: user.friendsCount ?? null,
    postsCount: user.statusesCount ?? null,
    verified: user.verified,
    verifiedReason: user.verifiedReason ?? null,
    posts: np,
    rawGender: user.gender ?? null,
  };
}

// ------------------- 导出 -------------------

export { delay };
export const getLastPostError = () => session.getLastPostError();
export const clearPostError = () => session.clearPostError();
