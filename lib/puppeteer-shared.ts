/**
 * 共享 puppeteer 基础设施：单例 browser/page、stale lock 清理、headless 切换、错误透传。
 *
 * 调用方式：const session = createSession({ profileDir, label }); await session.getPage();
 * 每个平台（微博/小红书）各自创建一个 session 实例，独立 profile 目录。
 */

import vanillaPuppeteer, { Browser, Page } from "puppeteer";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "path";
import os from "os";
import fs from "fs";

/**
 * 把 chrome profile 放到项目目录【外】(用户主目录下),而不是 process.cwd()。
 * 原因:dev 模式下 Next/Turbopack 会扫描项目目录,Chrome 在 profile 里建的
 * SingletonSocket 等 socket 文件会让 Turbopack 读文件时 panic(os error 102)。
 * 放到项目外可彻底避免,且登录态仍持久化、跨重启复用。
 */
export function profilePath(name: string): string {
  const legacyProfileRoot = [".social", "talent", "radar"].join("-");
  return path.join(os.homedir(), legacyProfileRoot, name);
}

// Stealth plugin —— 自动修补 30+ 处 headless Chrome fingerprint 泄漏
// (navigator.webdriver / chrome.runtime / permissions / plugins / WebGL vendor 等),
// 让 XHS 等强反爬平台识别不出 puppeteer。
// 注册一次,所有 launch 调用都会自动应用。
puppeteerExtra.use(StealthPlugin());

// puppeteer-extra 不直接暴露 puppeteer 类型,但内部就是 wrapper,launch 签名兼容。
// 这里把它做成跟原 puppeteer 同 shape 的实例。
const puppeteer = puppeteerExtra as unknown as typeof vanillaPuppeteer;

export const DEFAULT_HEADLESS = process.env.PUPPETEER_HEADLESS !== "false";

export interface SessionOptions {
  /** profile 目录名，例如 ".chrome-profile-weibo" */
  profileDir: string;
  /** 日志前缀，例如 "[WB]" */
  label: string;
  /** 强制 headless 模式覆盖（首次登录页强制可见） */
  forceHeadless?: boolean;
}

export interface PostError {
  status: number;
  body?: string;
  url?: string;
}

export interface Session {
  getPage(): Promise<Page>;
  closePage(): Promise<void>;
  closeBrowser(): Promise<void>;
  /** browser 进程是否还在运行（用来判断是否需要切 headful/headless） */
  isActive(): boolean;
  getLastPostError(): PostError | null;
  recordPostError(err: PostError): void;
  clearPostError(): void;
  profileDir: string;
  label: string;
}

export interface GotoWithRetriesOptions {
  attempts?: number;
  delayMin?: number;
  delayMax?: number;
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
  label?: string;
  acceptUrlIncludes?: string;
}

interface SessionState {
  browser?: Browser;
  page?: Page;
  lastPostError: PostError | null;
}

const SESSION_REGISTRY = new Map<string, SessionState>();

function clearStaleSingletonLocks(profileDir: string) {
  const locks = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
  for (const f of locks) {
    const p = path.join(profileDir, f);
    try {
      fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }
}

function markPreviousExitAsClean(profileDir: string) {
  const defaultDir = path.join(profileDir, "Default");
  const prefsPath = path.join(defaultDir, "Preferences");
  try {
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
    let prefs: { profile?: { exit_type?: string; exited_cleanly?: boolean } } = {};
    if (fs.existsSync(prefsPath)) {
      try {
        prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
      } catch {
        prefs = {};
      }
    }
    if (!prefs.profile) prefs.profile = {};
    prefs.profile.exit_type = "Normal";
    prefs.profile.exited_cleanly = true;
    fs.writeFileSync(prefsPath, JSON.stringify(prefs), "utf-8");
  } catch {
    // ignore
  }
}

/**
 * 给 profile 写一份"已经看过欢迎页"的 First Run 标记，
 * 避免每次启动都弹 macOS 的 default-browser 询问 / 隐私首屏。
 */
function markFirstRunDone(profileDir: string) {
  try {
    fs.writeFileSync(path.join(profileDir, "First Run"), "", "utf-8");
  } catch {
    // ignore
  }
}

async function launchBrowser(profileDir: string, headless: boolean, label: string): Promise<Browser> {
  const fullProfileDir = path.isAbsolute(profileDir)
    ? profileDir
    : path.join(process.cwd(), profileDir);
  if (!fs.existsSync(fullProfileDir)) fs.mkdirSync(fullProfileDir, { recursive: true });
  markPreviousExitAsClean(fullProfileDir);
  markFirstRunDone(fullProfileDir);
  clearStaleSingletonLocks(fullProfileDir);

  const opts = {
    headless,
    userDataDir: fullProfileDir,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-session-crashed-bubble",
      "--disable-infobars",
      "--disable-features=Translate,InfobarBubble",
      "--disable-popup-blocking",
      "--restore-last-session=false",
      "--hide-crash-restore-bubble",
      // 抑制崩溃恢复对话框 + Profile 错误对话框
      "--disable-crash-reporter",
      "--noerrdialogs",
      "--disable-features=ChromeWhatsNewUI,SigninInterceptBubble,ProfilePicker",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  };

  try {
    return await puppeteer.launch(opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already running/i.test(msg) || /SingletonLock/i.test(msg)) {
      console.warn(`${label} 检测到 stale chrome profile 锁，清理后重试...`);
      clearStaleSingletonLocks(fullProfileDir);
      try {
        return await puppeteer.launch(opts);
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        throw new Error(
          `无法启动 Chrome（已尝试清理锁文件）：${msg2}\n` +
            `若仍失败请在终端执行：\n` +
            `  pkill -f "Chrome.*${path.basename(fullProfileDir)}" && rm -f ${fullProfileDir}/Singleton*\n` +
            `然后重启服务`,
        );
      }
    }
    throw err;
  }
}

export function createSession(opts: SessionOptions): Session {
  // 同一个 profileDir 但不同 headless 模式必须算独立 session，
  // 否则登录态 session（headful）会复用扫描 session（headless）的 browser，
  // 导致用户看不到登录窗口。
  const key = `${opts.profileDir}::${opts.forceHeadless === undefined ? "default" : opts.forceHeadless ? "head" : "headful"}`;
  if (!SESSION_REGISTRY.has(key)) {
    SESSION_REGISTRY.set(key, { lastPostError: null });
  }
  const state = SESSION_REGISTRY.get(key)!;

  const session: Session = {
    profileDir: opts.profileDir,
    label: opts.label,

    async getPage(): Promise<Page> {
      // 即使 isClosed()=false, page 也可能是 detached frame (browser 被外部杀掉过、
      // 旧 forceHeadless: false 进程遗留等场景)。试探一次 url() 调用,若 throw 就丢弃。
      if (state.page && !state.page.isClosed()) {
        try {
          state.page.url();
          return state.page;
        } catch {
          state.page = undefined;
        }
      }
      if (!state.browser || !state.browser.connected) {
        state.browser = await launchBrowser(opts.profileDir, opts.forceHeadless ?? DEFAULT_HEADLESS, opts.label);
      }

      // 新建干净标签前,先关掉所有遗留旧标签,保证始终只有一个 tab。
      // (尤其 headful 登录窗口:前端每 4 秒检测一次登录,旧逻辑在 page 失效时反复 newPage,
      //  几十个标签堆积后把浏览器卡死。)
      for (const p of await state.browser.pages()) {
        await p.close().catch(() => {});
      }
      state.page = await state.browser.newPage();

      // headless 模式下拦截图片/字体节省带宽；headful 模式下保留全部以便登录交互
      if (DEFAULT_HEADLESS && !opts.forceHeadless) {
        await state.page.setRequestInterception(true);
        state.page.on("request", (req) => {
          const type = req.resourceType();
          if (type === "image" || type === "font" || type === "media") {
            req.abort().catch(() => {});
          } else {
            req.continue().catch(() => {});
          }
        });
      }

      await state.page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      );
      await state.page.setViewport({ width: 1440, height: 900 });
      return state.page;
    },

    async closePage() {
      if (state.page && !state.page.isClosed()) {
        await state.page.close().catch(() => {});
      }
      state.page = undefined;
    },

    async closeBrowser() {
      if (state.browser) {
        await state.browser.close().catch(() => {});
        state.browser = undefined;
        state.page = undefined;
      }
    },

    isActive() {
      return !!(state.browser && state.browser.connected);
    },

    getLastPostError() {
      return state.lastPostError;
    },
    recordPostError(err) {
      state.lastPostError = err;
    },
    clearPostError() {
      state.lastPostError = null;
    },
  };

  return session;
}

/** 随机等待，避免请求过于规律 */
export function delay(min: number, max?: number): Promise<void> {
  const ms = max ? Math.floor(Math.random() * (max - min)) + min : min;
  return new Promise((r) => setTimeout(r, ms));
}

export async function disableServiceWorkers(page: Page): Promise<void> {
  try {
    const client = await page.target().createCDPSession();
    await client.send("ServiceWorker.disable");
  } catch {
    // ignore
  }
}

export async function gotoWithRetries(page: Page, url: string, opts: GotoWithRetriesOptions = {}): Promise<void> {
  const attempts = opts.attempts ?? 3;
  const acceptUrlIncludes = opts.acceptUrlIncludes ?? "";
  let lastError: unknown = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      await page.goto(url, {
        waitUntil: opts.waitUntil ?? "domcontentloaded",
        timeout: opts.timeout ?? 30000,
      });
      return;
    } catch (err) {
      lastError = err;
      const landedUrl = page.url();
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${opts.label ?? "[PUP]"} goto attempt ${i}/${attempts} failed: ${msg} landed=${landedUrl}`);
      if (acceptUrlIncludes && landedUrl.includes(acceptUrlIncludes)) return;
      if (i < attempts) await delay(opts.delayMin ?? 1200, opts.delayMax ?? 2200);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** 把 page 当前可见区域截屏成 base64 data URL */
export async function pageScreenshotBase64(page: Page, fullPage = false): Promise<string> {
  const buf = await page.screenshot({ encoding: "base64", fullPage, type: "png" });
  return `data:image/png;base64,${buf}`;
}

/** 把 DOM 节点截屏成 base64 data URL（如二维码） */
export async function elementScreenshotBase64(page: Page, selector: string): Promise<string | null> {
  try {
    const el = await page.$(selector);
    if (!el) return null;
    const buf = await el.screenshot({ encoding: "base64", type: "png" });
    return `data:image/png;base64,${buf}`;
  } catch {
    return null;
  }
}
