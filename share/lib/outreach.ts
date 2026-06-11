import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { RadarResult } from "./scoring-config";
import {
  AiClientConfig,
  AiProtocol,
} from "./scoring-config";
import { inferProtocol } from "./models";
import { recordUsage, UsageDelta } from "./usage";

export interface OutreachDraft {
  candidateId: string;
  platform: RadarResult["platform"];
  candidateName: string;
  message: string;
  status: "draft" | "sent" | "unsubscribed";
  createdAt: string;
  sentAt?: string;
}

interface DraftArgs {
  candidate: RadarResult;
  jd?: string;
  position?: string;
  companyAdvantages?: string;
  aiConfig?: AiClientConfig;
}

const OUTREACH_TOOL_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    message: { type: "string" },
  },
  required: ["message"],
};

const OUTREACH_TOOL: Anthropic.Tool = {
  name: "generate_outreach_draft",
  description: "为候选人生成一段个性化招聘触达开场白",
  input_schema: OUTREACH_TOOL_SCHEMA,
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

function buildPrompt({ candidate, jd, position, companyAdvantages }: DraftArgs): string {
  const isArtStation = candidate.platform === "artstation";
  const platformTone = candidate.platform === "weibo"
    ? "微博私信，口吻自然一点，像资深招聘官一对一沟通，不要群发感。"
    : candidate.platform === "xiaohongshu"
    ? "小红书私信，口吻轻一些，但仍然专业真诚。"
    : "ArtStation 站内或邮件风格，可用专业英文，也可中英混合，但要克制专业。";

  return `你是一名专业招聘官，要给一位具体候选人写一段“千人千面”的初次触达开场白。

## 目标
- 写 80-150 字的个性化触达草稿
- 必须基于候选人的真实画像写，体现你看过对方资料
- 结尾留一个软性的 CTA，例如方便的话聊聊 / 是否愿意看机会 / 是否方便加微信
- 绝对不要写成油腻群发、不要浮夸、不要过度承诺

## 平台语境
${platformTone}

## 招聘上下文
- 岗位：${position?.trim() || candidate.position_name || "（未提供）"}
- JD：${jd?.trim() || candidate.position_name || "（未提供）"}
- 我司优势：${companyAdvantages?.trim() || "（未提供，可忽略）"}

## 候选人画像
- 候选人姓名：${candidate.name}
- 平台：${candidate.platform}
- 标题 / bio：${candidate.headline || "（无）"}
- 当前项目：${candidate.current_project || "（未知）"}
- 推断岗位：${candidate.inferred_position}
- 标签：${candidate.suggested_tags.join("、") || "（无）"}
- 优势亮点：${candidate.pros}
- 风险提醒：${candidate.cons}
- 作品评价：${candidate.art_evaluation}
- 联系开放度：${candidate.open_to_opportunity}
- 粉丝量：${typeof candidate.followers_count === "number" ? candidate.followers_count.toLocaleString() : "未知"}
- 最近作品 / 文本：${candidate.recent_works.slice(0, 3).join(" / ") || "（无）"}

## 输出要求
- 只输出 message 字段
- 直接写成可发送的完整文案
- 不要使用模板化开头如“您好打扰了”
- ${isArtStation ? "如果英文更自然，可以直接写英文，但仍然要简洁专业。" : "以中文为主。"}
- 不要编造候选人没公开的信息`;
}

export function getOutreachCandidateId(candidate: Pick<RadarResult, "platform" | "platform_user_id">): string {
  return `${candidate.platform}:${candidate.platform_user_id}`;
}

export async function generateOutreachDraft(
  userId: string,
  args: DraftArgs,
): Promise<{ message: string }> {
  const model = getModel(args.aiConfig);
  const protocol = resolveProtocol(args.aiConfig, model);
  const prompt = buildPrompt(args);

  if (protocol === "anthropic") {
    const client = getAnthropicClient(args.aiConfig);
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      tools: [OUTREACH_TOOL],
      tool_choice: { type: "tool", name: "generate_outreach_draft" },
      messages: [{ role: "user", content: prompt }],
    });
    recordAnthropic(userId, model, response.usage, args.aiConfig?.customPricing);
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("AI 未返回工具调用结果 (generateOutreachDraft)");
    }
    return { message: String((toolUse.input as { message?: string }).message ?? "").trim() };
  }

  const client = getOpenAIClient(args.aiConfig);
  const response = await client.chat.completions.create({
    model,
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
    tools: [{
      type: "function",
      function: {
        name: "generate_outreach_draft",
        description: OUTREACH_TOOL.description,
        parameters: OUTREACH_TOOL_SCHEMA,
      },
    }],
    tool_choice: { type: "function", function: { name: "generate_outreach_draft" } },
  });
  recordOpenAI(userId, model, response.usage, args.aiConfig?.customPricing);
  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("AI 未返回工具调用结果 (generateOutreachDraft)");
  }
  const parsed = JSON.parse(toolCall.function.arguments) as { message?: string };
  return { message: String(parsed.message ?? "").trim() };
}
