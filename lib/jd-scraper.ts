import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AiClientConfig, AiProtocol } from "./scoring-config";
import { inferProtocol } from "./models";
import { createSession, delay, profilePath } from "./puppeteer-shared";
import { recordUsage, UsageDelta } from "./usage";

export interface JobListing {
  title: string;
  detailUrl?: string;
  snippet: string;
}

interface ListingsArgs {
  url: string;
  position?: string;
  keywords?: string[];
  aiConfig?: AiClientConfig;
}

interface JobListingsDraft {
  jobs: JobListing[];
}

interface JobJDDraft {
  jd: string;
  position?: string;
}

interface PageSnapshot {
  requestedUrl: string;
  finalUrl?: string;
  title?: string;
  visibleText: string;
  htmlExcerpt: string;
  links: Array<{ text: string; href: string }>;
}

interface SnapshotChunk {
  finalUrl?: string;
  title?: string;
  visibleText: string;
  htmlExcerpt: string;
  links: Array<{ text: string; href: string }>;
}

type FetchMode = "listings" | "detail";

const jdSession = createSession({
  profileDir: profilePath("chrome-profile-jd"),
  label: "[JD]",
});
let sessionQueue: Promise<unknown> = Promise.resolve();

const JOB_LISTINGS_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    jobs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          detailUrl: { type: "string" },
          snippet: { type: "string" },
        },
        required: ["title", "snippet"],
      },
    },
  },
  required: ["jobs"],
};

const JOB_LISTINGS_TOOL: Anthropic.Tool = {
  name: "extract_job_listings",
  description: "从招聘页中提取岗位清单",
  input_schema: JOB_LISTINGS_SCHEMA,
};

const JOB_JD_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    jd: { type: "string" },
    position: { type: "string" },
  },
  required: ["jd"],
};

const JOB_JD_TOOL: Anthropic.Tool = {
  name: "fetch_job_jd",
  description: "从岗位详情页中提取真实 JD 文本",
  input_schema: JOB_JD_SCHEMA,
};

function resolveProtocol(cfg?: AiClientConfig, model?: string): AiProtocol {
  return cfg?.protocol ?? inferProtocol(model ?? cfg?.model);
}

function getModel(cfg?: AiClientConfig): string {
  return cfg?.model?.trim() || process.env.MODEL || "claude-sonnet-4-6";
}

function getApiKey(cfg?: AiClientConfig): string {
  const key = cfg?.apiKey?.trim() || process.env.LITELLM_API_KEY || "";
  if (!key) throw new Error("AI 服务未配置：请先在「AI 设置」中填入 API Key");
  return key;
}

function getBaseURL(cfg?: AiClientConfig): string | undefined {
  return cfg?.baseURL?.trim() || process.env.ANTHROPIC_BASE_URL;
}

function getAnthropicClient(cfg?: AiClientConfig): Anthropic {
  return new Anthropic({ baseURL: getBaseURL(cfg), apiKey: getApiKey(cfg) });
}

function getOpenAIClient(cfg?: AiClientConfig): OpenAI {
  let baseURL = getBaseURL(cfg);
  if (baseURL && !baseURL.endsWith("/v1")) {
    baseURL = baseURL.replace(/\/$/, "") + "/v1";
  }
  return new OpenAI({ baseURL, apiKey: getApiKey(cfg) });
}

function recordAnthropic(
  userId: string,
  model: string,
  usage: { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } | undefined,
  customPricing?: AiClientConfig["customPricing"],
): UsageDelta {
  const input =
    (usage?.input_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0) +
    (usage?.cache_read_input_tokens ?? 0);
  const output = usage?.output_tokens ?? 0;
  return recordUsage(userId, model, input, output, customPricing);
}

function recordOpenAI(
  userId: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  customPricing?: AiClientConfig["customPricing"],
): UsageDelta {
  return recordUsage(
    userId,
    model,
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    customPricing,
  );
}

function dedupeTextLines(input: string): string {
  const lines = input
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    merged.push(line);
  }
  return merged.join("\n");
}

async function waitForUsefulText(page: Awaited<ReturnType<typeof jdSession.getPage>>) {
  await delay(1500, 2500);
  await page.waitForFunction(
    () => (document.body?.innerText?.trim().length ?? 0) > 80,
    { timeout: 5000 },
  ).catch(() => {});
}

async function scrollListingPage(page: Awaited<ReturnType<typeof jdSession.getPage>>) {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(window.innerHeight * 0.85, 640);
    let previousHeight = 0;
    for (let pass = 0; pass < 5; pass += 1) {
      const height = document.body.scrollHeight;
      let y = 0;
      while (y < height) {
        window.scrollTo(0, y);
        await sleep(300);
        y += step;
      }
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(800);
      const nextHeight = document.body.scrollHeight;
      if (nextHeight <= previousHeight || nextHeight <= height) break;
      previousHeight = nextHeight;
    }
  }).catch(() => {});
  await delay(400, 800);
}

async function captureSnapshotChunk(page: Awaited<ReturnType<typeof jdSession.getPage>>): Promise<SnapshotChunk> {
  const snapshot = await page.evaluate(() => {
    const rawText = document.body?.innerText || document.documentElement?.innerText || "";
    const visibleText = rawText
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const htmlExcerpt = (document.documentElement?.outerHTML || "").slice(0, 40000);
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((anchor) => ({
        text: (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim(),
        href: anchor.href,
      }))
      .filter((item) => item.href && !item.href.startsWith("javascript:"));

    return {
      title: document.title || undefined,
      visibleText,
      htmlExcerpt,
      links,
    };
  });

  const finalUrl = page.url();
  const links = Array.from(
    new Map(
      snapshot.links
        .filter((item) => item.text || item.href)
        .map((item) => {
          let href = item.href;
          try {
            href = new URL(item.href, finalUrl).toString();
          } catch {
            href = item.href;
          }
          return [`${item.text}::${href}`, { text: item.text, href }];
        }),
    ).values(),
  );

  return {
    finalUrl,
    title: snapshot.title,
    visibleText: snapshot.visibleText,
    htmlExcerpt: snapshot.htmlExcerpt,
    links,
  };
}

function chunkSignature(chunk: SnapshotChunk): string {
  const links = chunk.links
    .filter((item) => /\/position\/.+\/detail/i.test(item.href))
    .slice(0, 12)
    .map((item) => item.href)
    .join("|");
  return `${chunk.finalUrl || ""}::${chunk.visibleText.slice(0, 1200)}::${links}`;
}

async function clickByPatterns(
  page: Awaited<ReturnType<typeof jdSession.getPage>>,
  patterns: string[],
): Promise<boolean> {
  const clicked = await page.evaluate(`(() => {
    const rawPatterns = ${JSON.stringify(patterns)};
    const testers = rawPatterns.map((item) => new RegExp(item, "i"));
    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const candidates = Array.from(
      document.querySelectorAll("button, a[href], [role='button'], [tabindex], li, span, div"),
    ).filter((el) => {
      if (!isVisible(el)) return false;
      const text = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
      const attrs = [text, el.getAttribute("title") || "", el.getAttribute("aria-label") || "", String(el.className || "")].join(" ");
      if (!attrs) return false;
      if (!testers.some((pattern) => pattern.test(attrs))) return false;
      if (el instanceof HTMLAnchorElement && /\\/position\\/.+\\/detail/i.test(el.href)) return false;
      return true;
    });
    const score = (el) => {
      const text = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
      const attrs = [text, el.getAttribute("title") || "", el.getAttribute("aria-label") || "", String(el.className || "")].join(" ");
      let value = 0;
      if (/下一页|下页|next/i.test(attrs)) value += 8;
      if (/加载更多|查看更多|更多职位|更多岗位|show more|load more|view more|see more/i.test(attrs)) value += 6;
      if (/分页|pagination|pager/i.test(attrs)) value += 4;
      if (el.getAttribute("title")) value += 2;
      if (el.getAttribute("aria-label")) value += 2;
      if (text.length <= 8) value += 1;
      value += Math.max(0, Math.floor(el.getBoundingClientRect().y / 400));
      return value;
    };
    const target = candidates
      .sort((a, b) => score(b) - score(a))
      .find((el) => !el.getAttribute("aria-disabled") || el.getAttribute("aria-disabled") === "false");
    if (!target) return false;
    target.click();
    return true;
  })()`);

  if (!clicked) return false;
  await delay(900, 1500);
  return true;
}

async function collectListingSnapshot(url: string): Promise<PageSnapshot> {
  const page = await jdSession.getPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await waitForUsefulText(page);

    const chunks: SnapshotChunk[] = [];
    const seen = new Set<string>();

    for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
      await scrollListingPage(page);

      for (let expandPass = 0; expandPass < 4; expandPass += 1) {
        const expanded = await clickByPatterns(page, [
          "加载更多",
          "查看更多",
          "更多职位",
          "更多岗位",
          "显示更多",
          "展开",
          "show more",
          "load more",
          "view more",
          "see more",
        ]);
        if (!expanded) break;
        await scrollListingPage(page);
      }

      const chunk = await captureSnapshotChunk(page);
      const signature = chunkSignature(chunk);
      if (!seen.has(signature)) {
        seen.add(signature);
        chunks.push(chunk);
      }

      const advanced = await clickByPatterns(page, [
        "下一页",
        "下页",
        "next",
        "next page",
      ]);
      if (!advanced) break;
      await waitForUsefulText(page);
    }

    const mergedText = chunks
      .map((chunk, index) => `【第 ${index + 1} 屏 / 页】\n${dedupeTextLines(chunk.visibleText)}`)
      .join("\n\n");
    const mergedLinks = Array.from(
      new Map(
        chunks
          .flatMap((chunk) => chunk.links)
          .map((item) => [`${item.text}::${item.href}`, item]),
      ).values(),
    );
    const mergedHtml = chunks.map((chunk) => chunk.htmlExcerpt).join("\n<!-- PAGE BREAK -->\n");
    const lastChunk = chunks[chunks.length - 1];

    return {
      requestedUrl: url,
      finalUrl: lastChunk?.finalUrl || page.url(),
      title: lastChunk?.title,
      visibleText: mergedText.slice(0, 60000),
      htmlExcerpt: mergedHtml.slice(0, 60000),
      links: mergedLinks.slice(0, 240),
    };
  } finally {
    await jdSession.closePage().catch(() => {});
  }
}

async function fetchRenderedPage(url: string, mode: FetchMode = "detail"): Promise<PageSnapshot> {
  const run = sessionQueue.then(async () => {
    if (mode === "listings") {
      return collectListingSnapshot(url);
    }

    const page = await jdSession.getPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await waitForUsefulText(page);
      await scrollListingPage(page);
      const snapshot = await captureSnapshotChunk(page);

      return {
        requestedUrl: url,
        finalUrl: snapshot.finalUrl,
        title: snapshot.title,
        visibleText: snapshot.visibleText.slice(0, 24000),
        htmlExcerpt: snapshot.htmlExcerpt,
        links: snapshot.links.slice(0, 120),
      };
    } finally {
      await jdSession.closePage().catch(() => {});
    }
  });

  sessionQueue = run.then(() => undefined, () => undefined);
  return run;
}

function buildListingsPrompt(snapshot: PageSnapshot, args: ListingsArgs): string {
  return `你是一名招聘页解析助手。请从下面这个招聘页快照中提取岗位清单。

## 任务目标
1. 识别这是招聘页上的岗位列表，而不是公司介绍或导航文案。
2. 只列出与"期望岗位 / 招聘画像"【语义相关】的岗位。相关性要【宽松理解，不是字面匹配】：
   - "动画" 与 3D 动作设计师 / 角色动画 / 动作设计 / 特效 相关；
   - "原画" 与 概念设计 / 角色设计 / 插画 / 美术 相关；
   - 同一专业大方向（美术 / 动画 / 设计 / 技术美术）都算相关。
3. 【排除明显不相关的职类】——例如算法工程师、策划、商业化、运营、市场、BD、HR、财务等与该画像无关的岗位，不要硬塞进来。
4. 拿不准是否相关时倾向纳入（宁可多列让用户选），但绝不列入明显无关的职类。
5. 如果页面里没有任何相关岗位，返回空数组，不要编造。
6. detailUrl 优先使用岗位详情页链接；没有可信链接时留空字符串。
7. 链接文字和链接标题里的岗位名优先级很高；只要页面链接里出现了相关岗位，不要因为描述较短而漏掉。
8. 如果同页同时出现多个相关美术 / 动画 / 创意岗位，要尽量都列出，不要只挑一个最接近的。

## 招聘画像（用于判断岗位是否相关）
- 期望岗位：${args.position?.trim() || "（未提供）"}
- 关键词提示：${args.keywords?.filter(Boolean).join("、") || "（未提供）"}

## 页面快照
- 请求 URL：${snapshot.requestedUrl}
- 最终 URL：${snapshot.finalUrl || "（未知）"}
- 标题：${snapshot.title || "（无）"}
- 可见文本：
${snapshot.visibleText || "（无）"}

## 链接摘录
${snapshot.links.slice(0, 80).map((item) => `- ${item.text || "（无标题）"} => ${item.href}`).join("\n") || "（无）"}

## 输出要求
- jobs 最多返回 20 个(宁多勿漏，让用户自己选)
- title 要保留岗位原名
- snippet 用 1 句话概括该岗位的页面摘要
- detailUrl 必须来自页面现有链接，不要拼接或猜测

只返回结构化结果，不要加额外说明。`;
}

function buildJobJDPrompt(snapshot: PageSnapshot): string {
  return `你是一名招聘岗位详情页解析助手。请把下面页面中的真实岗位信息清洗成结构化 JD。

## 任务目标
1. 这是岗位详情页，不要把公司介绍、福利口号、页脚导航混进 JD。
2. 提炼成可直接放入搜索表单的中文 JD 文本。
3. 优先保留“岗位职责 / 任职要求”两部分；如果原文是英文，可翻译成简洁中文。
4. 如果页面根本不是岗位详情页，返回尽量短的 jd，并在 position 留空。

## 页面快照
- 请求 URL：${snapshot.requestedUrl}
- 最终 URL：${snapshot.finalUrl || "（未知）"}
- 标题：${snapshot.title || "（无）"}
- 可见文本：
${snapshot.visibleText || "（无）"}

## HTML 摘录
${snapshot.htmlExcerpt || "（无）"}

## 输出要求
- position：尽量提取岗位名；不确定可留空字符串
- jd：输出为 2 段或多行文本，包含职责与任职要求；不要加“以下是整理结果”这类套话

只返回结构化结果，不要加额外说明。`;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeJobs(jobs: unknown): JobListing[] {
  if (!Array.isArray(jobs)) return [];
  const result: JobListing[] = [];
  for (const job of jobs) {
    if (!job || typeof job !== "object") continue;
    const record = job as Record<string, unknown>;
    const title = normalizeText(record.title);
    const snippet = normalizeText(record.snippet);
    if (!title || !snippet) continue;
    result.push({
      title,
      snippet,
      detailUrl: normalizeText(record.detailUrl),
    });
    if (result.length >= 12) break;
  }
  return result;
}

async function callListingsModel(
  userId: string,
  args: ListingsArgs,
  snapshot: PageSnapshot,
): Promise<JobListing[]> {
  const model = getModel(args.aiConfig);
  const protocol = resolveProtocol(args.aiConfig, model);
  const prompt = buildListingsPrompt(snapshot, args);

  if (protocol === "anthropic") {
    const client = getAnthropicClient(args.aiConfig);
    const response = await client.messages.create({
      model,
      max_tokens: 1200,
      tools: [JOB_LISTINGS_TOOL],
      tool_choice: { type: "tool", name: "extract_job_listings" },
      messages: [{ role: "user", content: prompt }],
    });
    recordAnthropic(userId, model, response.usage, args.aiConfig?.customPricing);
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("AI 未返回工具调用结果 (extractJobListings)");
    }
    return normalizeJobs((toolUse.input as JobListingsDraft).jobs);
  }

  const client = getOpenAIClient(args.aiConfig);
  const response = await client.chat.completions.create({
    model,
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
    tools: [{
      type: "function",
      function: {
        name: "extract_job_listings",
        description: JOB_LISTINGS_TOOL.description,
        parameters: JOB_LISTINGS_SCHEMA,
      },
    }],
    tool_choice: { type: "function", function: { name: "extract_job_listings" } },
  });
  recordOpenAI(userId, model, response.usage, args.aiConfig?.customPricing);
  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("AI 未返回工具调用结果 (extractJobListings)");
  }
  const parsed = JSON.parse(toolCall.function.arguments) as JobListingsDraft;
  return normalizeJobs(parsed.jobs);
}

async function callJobJDModel(
  userId: string,
  url: string,
  snapshot: PageSnapshot,
  aiConfig?: AiClientConfig,
): Promise<{ jd: string; position?: string }> {
  const model = getModel(aiConfig);
  const protocol = resolveProtocol(aiConfig, model);
  const prompt = buildJobJDPrompt(snapshot);

  if (protocol === "anthropic") {
    const client = getAnthropicClient(aiConfig);
    const response = await client.messages.create({
      model,
      max_tokens: 1200,
      tools: [JOB_JD_TOOL],
      tool_choice: { type: "tool", name: "fetch_job_jd" },
      messages: [{ role: "user", content: prompt }],
    });
    recordAnthropic(userId, model, response.usage, aiConfig?.customPricing);
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("AI 未返回工具调用结果 (fetchJobJD)");
    }
    const draft = toolUse.input as JobJDDraft;
    const jd = normalizeText(draft.jd);
    if (!jd) {
      throw new Error(`未能从岗位详情页提取有效 JD：${url}`);
    }
    return { jd, position: normalizeText(draft.position) };
  }

  const client = getOpenAIClient(aiConfig);
  const response = await client.chat.completions.create({
    model,
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
    tools: [{
      type: "function",
      function: {
        name: "fetch_job_jd",
        description: JOB_JD_TOOL.description,
        parameters: JOB_JD_SCHEMA,
      },
    }],
    tool_choice: { type: "function", function: { name: "fetch_job_jd" } },
  });
  recordOpenAI(userId, model, response.usage, aiConfig?.customPricing);
  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("AI 未返回工具调用结果 (fetchJobJD)");
  }
  const parsed = JSON.parse(toolCall.function.arguments) as JobJDDraft;
  const jd = normalizeText(parsed.jd);
  if (!jd) {
    throw new Error(`未能从岗位详情页提取有效 JD：${url}`);
  }
  return { jd, position: normalizeText(parsed.position) };
}

export async function extractJobListings(
  userId: string,
  args: ListingsArgs,
): Promise<{ jobs: JobListing[] }> {
  const url = args.url.trim();
  if (!url) throw new Error("请先提供公司招聘页 URL");

  const snapshot = await fetchRenderedPage(url, "listings");
  if (!snapshot.visibleText) {
    return { jobs: [] };
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const jobs = await callListingsModel(userId, { ...args, url }, snapshot);
      return { jobs };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJobJD(
  userId: string,
  url: string,
  aiConfig?: AiClientConfig,
): Promise<{ jd: string; position?: string }> {
  const targetUrl = url.trim();
  if (!targetUrl) throw new Error("请先提供岗位详情页 URL");

  const snapshot = await fetchRenderedPage(targetUrl, "detail");
  if (!snapshot.visibleText) {
    throw new Error("岗位详情页未抓到可用文本，请换一个页面重试");
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await callJobJDModel(userId, targetUrl, snapshot, aiConfig);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
