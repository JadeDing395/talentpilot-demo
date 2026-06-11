/**
 * 小红书 puppeteer 爬虫
 *
 * 小红书的 web API（如 /api/sns/web/v1/user_posted）需要 X-s 等签名头，
 * 直接 fetch 容易被风控。v1 策略：
 * - 搜索 / 主页全部走 SSR 后的 DOM/window.__INITIAL_STATE__
 * - 严格节流 delay(4000, 9000)、并发 1
 * - 检测到滑块页立刻终止并提示用户
 */

import type { Page } from "puppeteer";
import {
  createSession,
  delay,
  disableServiceWorkers,
  elementScreenshotBase64,
  gotoWithRetries,
  DEFAULT_HEADLESS,
  profilePath,
  type Session,
} from "./puppeteer-shared";
import type { XHSUser, XHSNote, NormalizedCandidate, LoginStatus, NormalizedPost } from "./social-types";

const PROFILE_DIR = profilePath("chrome-profile-xhs");
const HOST = "https://www.xiaohongshu.com";
// 小红书官方区分访客/登录的接口:匿名返回 data.guest=true,登录返回 guest=false + 真实 user_id
const USER_ME_URL = "https://edith.xiaohongshu.com/api/sns/web/v2/user/me";
const LOGIN_EXPIRED_MESSAGE = "小红书登录态已失效，请重新登录后再扫描";

export type LoginMode = "qr" | "window";

// 扫描用 headless session。
const session = createSession({ profileDir: PROFILE_DIR, label: "[XHS]" });

// 登录进行中时持有登录浏览器(同一时刻只有 session 或 loginSession 之一持有 profile)。
let loginSession: Session | null = null;

// 缓存当前登录用户的 userId（搜索时把"自己"从结果里剔除）
let myUserIdCache: string | null = null;

/** 从 /user/profile/me 重定向后的 URL 抓出当前登录用户的 userId。失败返回 null。 */
async function detectMyUserId(): Promise<string | null> {
  if (myUserIdCache) return myUserIdCache;
  try {
    const page = await session.getPage();
    await page.goto(`${HOST}/user/profile/me`, { waitUntil: "domcontentloaded", timeout: 15000 });
    const finalUrl = page.url();
    const m = finalUrl.match(/\/user\/profile\/([0-9a-zA-Z]+)/);
    if (m && m[1] !== "me") {
      myUserIdCache = m[1];
      console.log(`[XHS] detected myUserId=${myUserIdCache}`);
      return myUserIdCache;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getMyUserId(): string | null {
  return myUserIdCache;
}

// ------------------- 登录态检查 -------------------

/**
 * 调小红书 user/me 接口判断真实登录态。
 * 匿名:{ success:true, data:{ guest:true } };登录:{ success:true, data:{ guest:false, user_id } }。
 * 这是官方区分访客/登录的同一接口,比"有没有 a1 cookie"(设备指纹,匿名也有)可靠。
 */
async function fetchGuestStatus(s: Session): Promise<{ loggedIn: boolean; userId: string | null; message?: string }> {
  const page = await s.getPage();
  if (!page.url().includes("xiaohongshu.com")) {
    await page.goto(`${HOST}/`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await delay(600, 1200);
  }
  if (/\/website-login|\/login|signin|captcha/i.test(page.url())) {
    return { loggedIn: false, userId: null, message: LOGIN_EXPIRED_MESSAGE };
  }
  const res = await page.evaluate(async (url) => {
    try {
      const r = await fetch(url, { credentials: "include" });
      return { ok: r.ok, status: r.status, body: await r.text() };
    } catch (e) {
      return { ok: false, status: 0, body: String(e) };
    }
  }, USER_ME_URL);

  let loggedIn = false;
  let userId: string | null = null;
  let message: string | undefined;
  if (res.status === 401 || /captcha|verify|安全验证/i.test(res.body)) {
    message = LOGIN_EXPIRED_MESSAGE;
  }
  try {
    const j = JSON.parse(res.body) as { success?: boolean; data?: { guest?: boolean; user_id?: string } };
    if (j?.success && j.data && j.data.guest === false) {
      loggedIn = true;
      userId = j.data.user_id ?? null;
    }
  } catch {
    // 非 JSON(网络异常等)→ 当未登录
  }
  console.log(`[XHS] user/me → loggedIn=${loggedIn} userId=${userId ?? "-"}`);
  return { loggedIn, userId, message };
}

export async function checkLoginStatus(): Promise<LoginStatus> {
  try {
    // 登录进行中:复用登录浏览器检测(user/me 是 fetch,不会打断二维码 modal),
    // 不另开 headless 浏览器,避免抢 profile 锁。
    const s = loginSession && loginSession.isActive() ? loginSession : session;
    const { loggedIn, userId, message } = await fetchGuestStatus(s);

    if (loggedIn) {
      if (userId) myUserIdCache = userId; // 顺手缓存,省掉 detectMyUserId 的额外导航
      if (loginSession) {
        // 登录成功 → 关登录浏览器 flush cookie,扫描 session 接管
        console.log(`[XHS] login detected, closing login browser`);
        await loginSession.closeBrowser().catch(() => {});
        loginSession = null;
      }
      return { loggedIn: true, message: "小红书登录态正常" };
    }
    return { loggedIn: false, loginUrl: HOST, message: message ?? "未登录或登录态已失效" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[XHS] checkLoginStatus error: ${msg}`);
    // 安全方向:出错一律当未登录
    return { loggedIn: false, loginUrl: HOST, message: `检查登录失败：${msg}` };
  }
}

/**
 * 启动登录流程。
 * - mode="qr"(默认):后台 headless 打开 explore 页触发登录弹窗,截二维码 base64 返前端。
 *   小红书二维码是本地生成的 data URL(`<img class="qrcode-img">`),不走网络,不受图片拦截影响。
 * - mode="window":弹出可见 Chrome 窗口,用户直接登录(仅本机有效)。
 * 两种模式都先关掉扫描浏览器,确保同一时刻只有一个 Chrome 持有 profile。
 */
export async function startLoginFlow(mode: LoginMode = "qr"): Promise<LoginStatus> {
  await session.closeBrowser().catch(() => {});
  if (loginSession) {
    await loginSession.closeBrowser().catch(() => {});
    loginSession = null;
  }

  loginSession = createSession({
    profileDir: PROFILE_DIR,
    label: mode === "window" ? "[XHS-window]" : "[XHS-login]",
    forceHeadless: mode === "window" ? false : true,
  });

  const page = await loginSession.getPage();
  await page.goto(`${HOST}/explore`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await delay(1500, 2500);

  // 触发登录弹窗:点击"登录"按钮
  try {
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("a, button, span, div"));
      for (const el of els) {
        const text = (el as HTMLElement).innerText?.trim();
        if (text === "登录" || text === "Log in") {
          (el as HTMLElement).click();
          return;
        }
      }
    });
  } catch {
    // ignore
  }

  if (mode === "window") {
    return {
      loggedIn: false,
      loginUrl: HOST,
      message: "已弹出 Chrome 窗口,请在窗口里完成登录,完成后会自动检测(仅本机可用)",
    };
  }

  // QR 模式:等二维码渲染并截图。小红书二维码当前是 <img class="qrcode-img" src="data:...">。
  const qrSelector =
    "img.qrcode-img, .qrcode img, img[class*='qrcode'], img[class*='qr'], [class*='qrcode'] canvas, [class*='qrcode'] img, [class*='login-container'] canvas";
  try {
    await page.waitForSelector(qrSelector, { timeout: 10000 });
  } catch {
    // 没等到,继续,截图会返回 null
  }
  await delay(800, 1500);

  const qr = await elementScreenshotBase64(page, qrSelector);
  console.log(`[XHS] startLoginFlow(qr) qrDataUrl=${qr ? `(base64 ${qr.length}B)` : "null"}`);
  return {
    loggedIn: false,
    loginUrl: HOST,
    qrDataUrl: qr ?? undefined,
    message: qr
      ? "请用小红书 App 扫描二维码登录,完成后会自动检测"
      : "二维码截取失败 — 请稍后重试,或改用「本机浏览器登录」",
  };
}

// ------------------- 风控检测 -------------------

async function detectAntiBot(page: Page): Promise<string | null> {
  const sig = await page.evaluate(() => {
    const t = document.body?.innerText?.slice(0, 500) ?? "";
    if (/the website encountered a problem/i.test(t)) return "encountered_problem";
    if (/verify/i.test(t) && /slide/i.test(t)) return "slide_captcha";
    if (document.querySelector(".captcha-mask, .verify-wrap")) return "captcha_dom";
    return null;
  });
  return sig;
}

// ------------------- 搜索用户 -------------------

export interface SearchOpts {
  page?: number;
}

export async function searchUsers(query: string, opts: SearchOpts = {}): Promise<XHSUser[]> {
  const page = await session.getPage();
  const url = `${HOST}/search_result?keyword=${encodeURIComponent(query)}&source=web_explore_feed`;
  console.log(`[XHS] searchNotes → ${url}`);
  await disableServiceWorkers(page);
  try {
    await gotoWithRetries(page, url, {
      attempts: 3,
      timeout: 20000,
      waitUntil: "domcontentloaded",
      label: "[XHS]",
      acceptUrlIncludes: "/search_result/",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[XHS] search_result blocked, fallback to explore shell: ${msg}`);
    await gotoWithRetries(page, `${HOST}/explore`, {
      attempts: 2,
      timeout: 20000,
      waitUntil: "domcontentloaded",
      label: "[XHS]",
      acceptUrlIncludes: "xiaohongshu.com/explore",
    });
  }
  await delay(3000, 5000);

  // 0) URL-level 诊断:有没有被重定向到登录/captcha
  const landedUrl = page.url();
  if (/\/website-login|\/login|signin|captcha/i.test(landedUrl)) {
    session.recordPostError({ status: 401, body: LOGIN_EXPIRED_MESSAGE, url });
    throw new Error(LOGIN_EXPIRED_MESSAGE);
  }

  // 1) DOM-level anti-bot 检测(captcha mask / verify wrap)
  const anti = await detectAntiBot(page);
  if (anti) {
    const status = /captcha/i.test(anti) ? 401 : 403;
    const message = status === 401 ? LOGIN_EXPIRED_MESSAGE : `小红书风控触发（${anti}），请稍后再试或更换网络`;
    session.recordPostError({ status, body: message, url });
    throw new Error(message);
  }

  // 2) 提前看登录态 cookie 是否还在 page context(防止 cookie 被 server 清掉但 disk 还有)
  const cookies = await page.cookies(HOST);
  const hasSession = cookies.some((c) => c.name === "web_session" || c.name === "a1");
  if (!hasSession) {
    session.recordPostError({ status: 401, body: LOGIN_EXPIRED_MESSAGE, url });
    throw new Error(LOGIN_EXPIRED_MESSAGE);
  }
  const debugScript = String.raw`
    return (async () => {
      const state = window.__INITIAL_STATE__ || {};
      const search = (state.search && (state.search._value || state.search._rawValue || state.search)) || {};
      const html = document.documentElement.outerHTML;
      const bodyPreview = (document.body && document.body.innerText ? document.body.innerText.slice(0, 200) : "");
      const hasLoginPrompt = /请登录|登录后查看|登录后可|sign in to/i.test(bodyPreview);
      const rawUserLinks = Array.from(document.querySelectorAll("a[href*='/user/profile/']")).slice(0, 6).map((a) => a.href);

      const toNumber = (value) => {
        if (typeof value === "number") return value;
        if (!value) return 0;
        const text = String(value);
        if (text.includes("万")) return Math.round(parseFloat(text) * 10000);
        if (text.includes("亿")) return Math.round(parseFloat(text) * 100000000);
        const num = parseInt(text, 10);
        return Number.isNaN(num) ? 0 : num;
      };

      const aggregate = (items, source) => {
        const acc = new Map();
        items.forEach((item) => {
          const card = item && item.noteCard;
          const user = card && card.user;
          const userId = user && user.userId ? String(user.userId).trim() : "";
          if (!userId) return;
          const nickname = ((user.nickname || user.nickName || "") + "").trim();
          const title = ((card.displayTitle || "") + "").trim();
          const interactInfo = card.interactInfo || {};
          const engagement =
            toNumber(interactInfo.likedCount) +
            toNumber(interactInfo.collectedCount) +
            toNumber(interactInfo.commentCount);

          if (acc.has(userId)) {
            const existing = acc.get(userId);
            existing.noteHits += 1;
            existing.totalEngagement += engagement;
            if (title && !existing.desc.includes(title)) {
              existing.desc = [existing.desc, title].filter(Boolean).slice(0, 2).join(" / ");
            }
            return;
          }

          acc.set(userId, {
            userId,
            nickname,
            avatarUrl: user.avatar || "",
            desc: title,
            noteHits: 1,
            totalEngagement: engagement,
            source,
          });
        });

        return Array.from(acc.values()).sort((a, b) => {
          if (b.noteHits !== a.noteHits) return b.noteHits - a.noteHits;
          return b.totalEngagement - a.totalEngagement;
        });
      };

      const stateFeeds = Array.isArray(search.feeds) ? search.feeds : [];
      if (stateFeeds.length > 0) {
        return {
          title: document.title,
          url: location.href,
          htmlLen: html.length,
          bodyPreview,
          hasLoginPrompt,
          rawUserLinks,
          source: "initial_state",
          stateFeedCount: stateFeeds.length,
          authors: aggregate(stateFeeds, "initial_state"),
        };
      }

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let i = 0; i < 20 && !(window.webpackChunkxhs_pc_web && window.webpackChunkxhs_pc_web.push); i += 1) {
        await sleep(250);
      }

      const chunk = window.webpackChunkxhs_pc_web;
      if (chunk && chunk.push) {
        let req;
        chunk.push([[Symbol("xhs-search")], {}, (r) => { req = r; }]);
        const apiModule = (req && req(25717)) || {};
        const notesApi = Object.values(apiModule).find(
          (value) => typeof value === "function" && String(value).includes("/api/sns/web/v1/search/notes"),
        );

        if (notesApi) {
          const makeId = () => Date.now() + "_" + Math.random().toString(16).slice(2, 10);
          const collected = [];

          for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
            const result = await notesApi({
              keyword,
              searchId: makeId(),
              requestId: makeId(),
              page: pageNo,
              pageSize: 20,
              sort: "general",
              noteType: 0,
              extFlags: [],
              geo: "",
              imageFormats: ["jpg", "webp", "avif"],
            });
            if (Array.isArray(result && result.items)) collected.push(...result.items);
            if (!Array.isArray(result && result.items) || result.items.length === 0) break;
          }

          return {
            title: document.title,
            url: location.href,
            htmlLen: html.length,
            bodyPreview,
            hasLoginPrompt,
            rawUserLinks,
            source: "webpack_notes_api",
            stateFeedCount: stateFeeds.length,
            authors: aggregate(collected, "webpack_notes_api"),
          };
        }
      }

      const domItems = Array.from(document.querySelectorAll("section, div"))
        .slice(0, 120)
        .map((card) => {
          const profileLink = card.querySelector("a[href*='/user/profile/']");
          const noteLink = card.querySelector("a[href*='/explore/']");
          const match = profileLink && profileLink.href ? profileLink.href.match(/\/user\/profile\/([0-9a-zA-Z]+)/) : null;
          if (!match) return null;
          return {
            noteCard: {
              displayTitle: noteLink && noteLink.textContent ? noteLink.textContent.trim() : "",
              user: {
                userId: match[1],
                nickname: profileLink.textContent ? profileLink.textContent.trim() : "",
                avatar: (card.querySelector("img") && card.querySelector("img").src) || "",
              },
            },
          };
        })
        .filter(Boolean);

      return {
        title: document.title,
        url: location.href,
        htmlLen: html.length,
        bodyPreview,
        hasLoginPrompt,
        rawUserLinks,
        source: "dom_fallback",
        stateFeedCount: stateFeeds.length,
        authors: aggregate(domItems, "dom_fallback"),
      };
    })();
  `;

  const collectDebug = () =>
    page.evaluate(
      async ({ keyword, maxPages, script }) => {
        const run = new Function("keyword", "maxPages", script);
        return run(keyword, maxPages);
      },
      { keyword: query, maxPages: Math.max(1, Math.min(2, opts.page ?? 2)), script: debugScript },
    );

  let debug = await collectDebug();
  if (!debug.hasLoginPrompt && debug.source !== "webpack_notes_api" && (debug.authors?.length ?? 0) <= 1) {
    console.log(`[XHS] ${debug.source} only parsed ${(debug.authors?.length ?? 0)} author(s), retry via explore shell`);
    await gotoWithRetries(page, `${HOST}/explore`, {
      attempts: 2,
      timeout: 20000,
      waitUntil: "domcontentloaded",
      label: "[XHS]",
      acceptUrlIncludes: "xiaohongshu.com/explore",
    });
    await delay(2500, 4000);
    debug = await collectDebug();
  }

  console.log(
    `[XHS] page debug: title="${debug.title}" url=${debug.url} html=${debug.htmlLen}B source=${debug.source} stateFeeds=${debug.stateFeedCount} rawUserLinks=${debug.rawUserLinks.length} loginPrompt=${debug.hasLoginPrompt} samples=${JSON.stringify(debug.rawUserLinks)}`,
  );

  if (debug.hasLoginPrompt) {
    session.recordPostError({ status: 401, body: LOGIN_EXPIRED_MESSAGE, url });
    throw new Error(LOGIN_EXPIRED_MESSAGE);
  }
  if (!debug.authors?.length && debug.htmlLen < 3000) {
    session.recordPostError({ status: 500, body: `XHS 页面异常空 (${debug.htmlLen}B): ${debug.bodyPreview}`, url });
    throw new Error(`小红书搜索结果页异常 — 可能被风控限流(页面只有 ${debug.htmlLen} 字节)`);
  }
  if (!debug.authors?.length) {
    console.log(`[XHS] WARN: parsed 0 authors via ${debug.source}. bodyPreview: ${debug.bodyPreview}`);
  }

  const users = (debug.authors ?? []) as Array<{
    userId: string;
    nickname: string;
    avatarUrl: string;
    desc: string;
    noteHits: number;
  }>;

  const myId = await detectMyUserId();
  const filtered = myId ? users.filter((u) => u.userId !== myId) : users;
  if (myId && filtered.length !== users.length) {
    console.log(`[XHS] excluded self (userId=${myId}) from search results`);
  }

  console.log(`[XHS] searchNotes parsed ${filtered.length} unique authors for "${query}" via ${debug.source} (top: ${filtered.slice(0, 3).map((u) => `${u.nickname}×${u.noteHits}`).join(", ")})`);

  return filtered.map((u) => ({
    userId: u.userId,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    desc: u.desc,
    fansCount: 0,
    notesCount: 0,
    profileUrl: `${HOST}/user/profile/${u.userId}`,
  })) as XHSUser[];
}

// ------------------- 主页 + 笔记 -------------------

interface XHSInitialState {
  user?: {
    userPageData?: {
      basicInfo?: {
        nickname?: string;
        desc?: string;
        imageb?: string;
        gender?: number;
        ipLocation?: string;
        redOfficialVerifyType?: number;
        redOfficialVerifyContent?: string;
      };
      interactions?: Array<{ type: string; name?: string; count?: number | string }>;
    };
    notes?: Array<Array<{
      id: string;
      noteCard?: {
        displayTitle?: string;
        cover?: { urlDefault?: string };
        imageList?: Array<{ urlDefault?: string }>;
        type?: string;
        interactInfo?: { likedCount?: number | string; collectedCount?: number | string; commentCount?: number | string };
      };
    }>>;
  };
}

export async function fetchProfileWithNotes(userId: string, _noteLimit = 20): Promise<{ user: XHSUser | null; notes: XHSNote[] }> {
  void _noteLimit;
  const page = await session.getPage();
  const url = `${HOST}/user/profile/${userId}`;
  console.log(`[XHS] fetchProfile → ${userId}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await delay(2000, 4000);

  const anti = await detectAntiBot(page);
  if (anti) {
    session.recordPostError({ status: 403, body: `XHS 风控触发: ${anti}`, url });
    throw new Error(`小红书风控触发（${anti}）`);
  }

  // 读 window.__INITIAL_STATE__
  const state = await page.evaluate(() => {
    const w = window as unknown as { __INITIAL_STATE__?: unknown };
    return w.__INITIAL_STATE__ ?? null;
  }) as XHSInitialState | null;

  if (!state?.user?.userPageData?.basicInfo) {
    console.log(`[XHS] fetchProfile ${userId}: __INITIAL_STATE__.user.userPageData.basicInfo not found (state keys: ${state ? Object.keys(state).join(",") : "null"})`);
    return { user: null, notes: [] };
  }

  const info = state.user.userPageData.basicInfo;
  const interactions = state.user.userPageData.interactions ?? [];
  const fansItem = interactions.find((i) => /fans|粉丝/i.test(i.type) || /粉丝/.test(i.name ?? ""));
  const followsItem = interactions.find((i) => /follows|关注/i.test(i.type) || /关注/.test(i.name ?? ""));

  const parseCount = (v: number | string | undefined): number | null => {
    if (v === undefined || v === null) return null;
    if (typeof v === "number") return v;
    const s = v.toString();
    if (s.includes("万")) return Math.round(parseFloat(s) * 10000);
    if (s.includes("亿")) return Math.round(parseFloat(s) * 100000000);
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  };

  const user: XHSUser = {
    userId,
    nickname: info.nickname ?? "",
    avatarUrl: info.imageb ?? "",
    desc: info.desc ?? "",
    ipLocation: info.ipLocation,
    gender: info.gender === 1 ? "男" : info.gender === 2 ? "女" : undefined,
    fansCount: parseCount(fansItem?.count) ?? 0,
    followsCount: parseCount(followsItem?.count) ?? 0,
    notesCount: parseCount(interactions.find((i) => /note|笔记/i.test(i.type) || /笔记/.test(i.name ?? ""))?.count) ?? 0,
    redOfficial: !!info.redOfficialVerifyType,
    redOfficialVerifyContent: info.redOfficialVerifyContent,
    profileUrl: `${HOST}/user/profile/${userId}`,
  };

  // 笔记数据 — __INITIAL_STATE__.user.notes 是一个二维数组，平铺
  const flatNotes: Array<{ id: string; noteCard?: NonNullable<NonNullable<XHSInitialState["user"]>["notes"]>[number][number]["noteCard"] }> = [];
  for (const arr of state.user?.notes ?? []) {
    for (const n of arr) flatNotes.push(n);
  }
  const notes: XHSNote[] = flatNotes.map((n) => {
    const c = n.noteCard ?? {};
    return {
      noteId: n.id,
      title: c.displayTitle ?? "",
      desc: "",
      coverUrl: c.cover?.urlDefault ?? "",
      imageList: (c.imageList ?? []).map((i) => i.urlDefault ?? "").filter(Boolean),
      type: c.type === "video" ? "video" : "normal",
      topics: [],
      likedCount: parseCount(c.interactInfo?.likedCount) ?? 0,
      collectedCount: parseCount(c.interactInfo?.collectedCount) ?? 0,
      commentCount: parseCount(c.interactInfo?.commentCount) ?? 0,
      publishTime: "",
      url: `${HOST}/explore/${n.id}`,
    };
  });

  console.log(`[XHS] fetchProfile ${userId} ok: name="${user.nickname}" fans=${user.fansCount} notes=${notes.length} ip=${user.ipLocation ?? "?"}`);
  return { user, notes };
}

// ------------------- 归一 -------------------

export function toNormalizedCandidate(user: XHSUser, notes: XHSNote[]): NormalizedCandidate {
  const np: NormalizedPost[] = notes.map((n) => ({
    text: [n.title, n.desc].filter(Boolean).join(" — "),
    topics: n.topics,
    imageUrls: n.imageList.length > 0 ? n.imageList : (n.coverUrl ? [n.coverUrl] : []),
    engagement: (n.likedCount ?? 0) + (n.collectedCount ?? 0) + (n.commentCount ?? 0),
    publishTime: n.publishTime,
    url: n.url,
  }));
  return {
    platform: "xiaohongshu",
    platformUserId: user.userId,
    name: user.nickname,
    avatarUrl: user.avatarUrl || null,
    profileUrl: user.profileUrl,
    bio: user.desc || null,
    location: null,
    ipLocation: user.ipLocation ?? null,
    followers: user.fansCount ?? null,
    following: user.followsCount ?? null,
    postsCount: user.notesCount ?? null,
    verified: !!user.redOfficial,
    verifiedReason: user.redOfficialVerifyContent ?? null,
    posts: np,
    rawGender: user.gender ?? null,
  };
}

export { delay };
export const getLastPostError = () => session.getLastPostError();
export const clearPostError = () => session.clearPostError();
