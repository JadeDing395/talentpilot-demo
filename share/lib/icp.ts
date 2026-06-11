import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  AiClientConfig,
  AiProtocol,
  DEFAULT_WEIGHTS,
  ScoreWeights,
} from "./scoring-config";
import { inferProtocol } from "./models";
import { recordUsage, UsageDelta } from "./usage";
import {
  normalizeEducation,
  type ICP,
  type ICPInput,
} from "./icp-shared";

export type { EducationOption, ICP, ICPInput } from "./icp-shared";
export { DEFAULT_EDUCATION, EDUCATION_OPTIONS, normalizeEducation } from "./icp-shared";

interface IcpDraft {
  position: string;
  jd: string;
  keywords: string[];
  education?: string;
  experience?: string;
  weights: Partial<ScoreWeights>;
  personaTraits: string[];
  competitorTargeting: string[];
  companyInsight: string;
  channelStrategy?: {
    artstation?: string[];
    weibo?: string[];
    xiaohongshu?: string[];
  };
  reasoning: string;
}

interface CompanyPageContext {
  requestedUrl?: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  bodyExcerpt?: string;
  fetchError?: string;
}

const ICP_TOOL_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    position: { type: "string" },
    jd: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    education: { type: "string" },
    experience: { type: "string" },
    weights: {
      type: "object",
      additionalProperties: false,
      properties: {
        jd: { type: "number" },
        keyword: { type: "number" },
        experience: { type: "number" },
        education: { type: "number" },
        openness: { type: "number" },
        followers: { type: "number" },
      },
      required: ["jd", "keyword", "experience", "education", "openness", "followers"],
    },
    personaTraits: { type: "array", items: { type: "string" } },
    competitorTargeting: { type: "array", items: { type: "string" } },
    companyInsight: { type: "string" },
    channelStrategy: {
      type: "object",
      additionalProperties: false,
      properties: {
        artstation: { type: "array", items: { type: "string" } },
        weibo: { type: "array", items: { type: "string" } },
        xiaohongshu: { type: "array", items: { type: "string" } },
      },
    },
    reasoning: { type: "string" },
  },
  required: [
    "position",
    "jd",
    "keywords",
    "weights",
    "personaTraits",
    "competitorTargeting",
    "companyInsight",
    "channelStrategy",
    "reasoning",
  ],
};

const ICP_TOOL: Anthropic.Tool = {
  name: "synthesize_icp",
  description: "根据招聘输入反推招聘画像 ICP，并产出结构化字段",
  input_schema: ICP_TOOL_SCHEMA,
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

function normalizeInput(input: ICPInput): ICPInput {
  return {
    companyUrl: input.companyUrl?.trim() || undefined,
    careerPageUrl: input.careerPageUrl?.trim() || undefined,
    briefSentence: input.briefSentence?.trim() || undefined,
    successResumes: uniqueLines(input.successResumes ?? []),
    topPerformerLinks: uniqueLines(input.topPerformerLinks ?? []),
  };
}

function uniqueLines(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractTag(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern);
  if (!match?.[1]) return undefined;
  return decodeHtml(match[1].replace(/\s+/g, " ").trim()) || undefined;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

async function fetchCompanyPageContext(companyUrl?: string): Promise<CompanyPageContext> {
  if (!companyUrl) return {};

  try {
    const res = await fetch(companyUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const title = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description =
      extractTag(html, /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ??
      extractTag(html, /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i);
    const bodyHtml = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
    const bodyExcerpt = htmlToText(bodyHtml).slice(0, 5000) || undefined;

    return {
      requestedUrl: companyUrl,
      finalUrl: res.url,
      title,
      description,
      bodyExcerpt,
    };
  } catch (error) {
    return {
      requestedUrl: companyUrl,
      fetchError: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildPrompt(input: ICPInput, company: CompanyPageContext): string {
  return `你是一名资深招聘官产品策略师。请根据以下输入，反推一个可直接用于 TalentPilot 招聘搜索的 ICP（招聘画像）。

## 任务目标
1. 输出一个兼容现有扫描表单的招聘画像，供用户一键应用。
2. 关键词要偏向真实可搜到候选人的关键词，而不是 HR 空话。
3. 权重必须基于默认权重微调，保持总和 100。
4. 竞品公司只能给“建议名单”，必须在 reasoning 里明确提醒“必须人工确认”，不要写成既定事实。

## 已知默认评分权重
${JSON.stringify(DEFAULT_WEIGHTS)}

## 用户输入
- 公司 URL：${input.companyUrl || "（未提供）"}
- 公司招聘页 URL：${input.careerPageUrl || "（未提供）"}
- 一句话需求：${input.briefSentence || "（未提供）"}
- 成功简历文本：${input.successResumes && input.successResumes.length > 0 ? input.successResumes.join("\n---\n") : "（未提供）"}
- 标杆候选人主页：${input.topPerformerLinks && input.topPerformerLinks.length > 0 ? input.topPerformerLinks.join("\n") : "（未提供）"}

## 公司 URL 抓取摘要
- 请求 URL：${company.requestedUrl || "（无）"}
- 最终 URL：${company.finalUrl || "（未知）"}
- 页面标题：${company.title || "（未提取到）"}
- 页面描述：${company.description || "（未提取到）"}
- 页面正文摘录：${company.bodyExcerpt || "（抓取失败，若有 URL 本身请仅基于 URL 字符串推断）"}
- 抓取错误：${company.fetchError || "（无）"}

## 输出要求
- position：中文岗位名，清晰具体
- jd：固定返回空字符串，不要编造或总结 JD；真实 JD 会由官网岗位详情页单独抓取
- keywords：6-12 个搜索关键词，适合直接投喂现有扫描器
- education / experience：没有明显要求时可留空字符串
- weights：六维权重，允许小幅调节，但必须总和 100
- personaTraits：5-8 条人才特征
- competitorTargeting：3-8 个建议公司/团队名，仅作建议，不可伪装成事实
- companyInsight：1 段中文总结你对该公司/项目/团队风格与可能对标方向的判断，只用于理解公司和找对标，不是 JD
- channelStrategy：分别给 artstation / weibo / xiaohongshu 建议关键词，各 3-8 条
- reasoning：1 段中文解释，必须明确写出“竞品建议必须人工确认”，并点明 companyInsight 只是 AI 推断，不是官网 JD

只返回结构化结果，不要加额外说明。`;
}

async function callIcpModel(
  userId: string,
  input: ICPInput,
  company: CompanyPageContext,
  aiConfig?: AiClientConfig,
): Promise<IcpDraft> {
  const model = getModel(aiConfig);
  const protocol = resolveProtocol(aiConfig, model);
  const prompt = buildPrompt(input, company);

  if (protocol === "anthropic") {
    const client = getAnthropicClient(aiConfig);
    const response = await client.messages.create({
      model,
      max_tokens: 1800,
      tools: [ICP_TOOL],
      tool_choice: { type: "tool", name: "synthesize_icp" },
      messages: [{ role: "user", content: prompt }],
    });
    recordAnthropic(userId, model, response.usage, aiConfig?.customPricing);
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("AI 未返回工具调用结果 (synthesizeICP)");
    }
    return toolUse.input as IcpDraft;
  }

  const client = getOpenAIClient(aiConfig);
  const response = await client.chat.completions.create({
    model,
    max_tokens: 1800,
    messages: [{ role: "user", content: prompt }],
    tools: [{
      type: "function",
      function: {
        name: "synthesize_icp",
        description: ICP_TOOL.description,
        parameters: ICP_TOOL_SCHEMA,
      },
    }],
    tool_choice: { type: "function", function: { name: "synthesize_icp" } },
  });
  recordOpenAI(userId, model, response.usage, aiConfig?.customPricing);
  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("AI 未返回工具调用结果 (synthesizeICP)");
  }
  return JSON.parse(toolCall.function.arguments) as IcpDraft;
}

function normalizeArray(values: unknown, fallback: string[] = [], max = 12): string[] {
  if (!Array.isArray(values)) return fallback;
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, max);
}

function normalizeWeightValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function normalizeWeights(weights?: Partial<ScoreWeights>): ScoreWeights {
  const base: ScoreWeights = {
    jd: normalizeWeightValue(weights?.jd, DEFAULT_WEIGHTS.jd),
    keyword: normalizeWeightValue(weights?.keyword, DEFAULT_WEIGHTS.keyword),
    experience: normalizeWeightValue(weights?.experience, DEFAULT_WEIGHTS.experience),
    education: normalizeWeightValue(weights?.education, DEFAULT_WEIGHTS.education),
    openness: normalizeWeightValue(weights?.openness, DEFAULT_WEIGHTS.openness),
    followers: normalizeWeightValue(weights?.followers, DEFAULT_WEIGHTS.followers),
  };
  const entries = Object.entries(base) as Array<[keyof ScoreWeights, number]>;
  const sum = entries.reduce((total, [, value]) => total + value, 0);
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  const scaled = entries.map(([key, value]) => {
    const exact = (value / sum) * 100;
    return { key, exact, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remain = 100 - scaled.reduce((total, item) => total + item.floor, 0);
  scaled.sort((a, b) => b.frac - a.frac);
  const result = {} as ScoreWeights;
  for (const item of scaled) {
    const next = item.floor + (remain > 0 ? 1 : 0);
    result[item.key] = next;
    if (remain > 0) remain -= 1;
  }
  return result;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeDraft(input: ICPInput, draft: IcpDraft): ICP {
  const keywords = normalizeArray(draft.keywords);
  const personaTraits = normalizeArray(draft.personaTraits, [], 10);
  const competitorTargeting = normalizeArray(draft.competitorTargeting, [], 10);
  const channelStrategy = draft.channelStrategy ?? {};
  const companyInsight =
    normalizeText(draft.companyInsight) ??
    normalizeText(draft.reasoning) ??
    "基于公司公开信息推断了业务风格、项目偏好与可参考的对标方向。";
  let reasoning = normalizeText(draft.reasoning) ?? "基于输入内容推断了岗位、关键词和搜索策略。";
  if (!reasoning.includes("人工确认")) {
    reasoning += " 竞品建议必须人工确认后再用于定向搜索。";
  }
  if (!reasoning.includes("不是 JD")) {
    reasoning += " companyInsight 只是 AI 推断，用于理解公司和找对标，不是 JD。";
  }

  return {
    position: normalizeText(draft.position) ?? input.briefSentence ?? "",
    jd: normalizeText(draft.jd) ?? "",
    keywords: keywords.length > 0 ? keywords : [input.briefSentence || "招聘画像"],
    education: normalizeEducation(draft.education),
    experience: normalizeText(draft.experience),
    weights: normalizeWeights(draft.weights),
    personaTraits,
    competitorTargeting,
    companyInsight,
    channelStrategy: {
      artstation: normalizeArray(channelStrategy.artstation, [], 8),
      weibo: normalizeArray(channelStrategy.weibo, [], 8),
      xiaohongshu: normalizeArray(channelStrategy.xiaohongshu, [], 8),
    },
    sourceInputs: input,
    reasoning,
  };
}

export async function synthesizeICP(input: ICPInput, aiConfig: AiClientConfig): Promise<ICP> {
  return synthesizeICPForUser("default", input, aiConfig);
}

export async function synthesizeICPForUser(
  userId: string,
  rawInput: ICPInput,
  aiConfig: AiClientConfig,
): Promise<ICP> {
  const input = normalizeInput(rawInput);
  const hasAnyInput =
    !!input.companyUrl ||
    !!input.careerPageUrl ||
    !!input.briefSentence ||
    (input.successResumes?.length ?? 0) > 0 ||
    (input.topPerformerLinks?.length ?? 0) > 0;

  if (!hasAnyInput) {
    throw new Error("请至少提供一个 ICP 输入来源");
  }
  const hasPositionSignal =
    !!input.briefSentence ||
    (input.successResumes?.length ?? 0) > 0 ||
    (input.topPerformerLinks?.length ?? 0) > 0;
  if (!hasPositionSignal) {
    throw new Error("请先填写岗位名称或一句话需求");
  }

  const company = await fetchCompanyPageContext(input.companyUrl);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const draft = await callIcpModel(userId, input, company, aiConfig);
      return normalizeDraft(input, draft);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
