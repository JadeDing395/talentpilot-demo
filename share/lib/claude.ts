/**
 * AI 评分层 — 同时支持 Anthropic 原生协议与 OpenAI 兼容协议。
 *
 * 对外暴露 expandPosition + scoreCandidate；内部按 cfg.protocol 分流。
 * 所有调用都会通过 recordUsage 把 token 用量累加到当前 userId 的 usage 日志。
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  DEFAULT_WEIGHTS,
  DIMENSION_DEFINITIONS,
  ScoreBreakdown,
  ScoreWeights,
  ScanParams,
  PositionBrief,
  AiClientConfig,
  AiProtocol,
} from "./scoring-config";
import { inferProtocol, supportsVision } from "./models";
import { recordUsage, UsageDelta } from "./usage";
import type { NormalizedCandidate } from "./social-types";
import type { Platform } from "./types";

export type {
  ScoreBreakdown,
  RadarResult,
  ScoreWeights,
  ScanParams,
  PositionBrief,
  AiClientConfig,
} from "./scoring-config";
export { DEFAULT_WEIGHTS, DIMENSION_DEFINITIONS } from "./scoring-config";

// ---------- 客户端工厂 ----------

function resolveProtocol(cfg?: AiClientConfig, model?: string): AiProtocol {
  return cfg?.protocol ?? inferProtocol(model ?? cfg?.model);
}

function getModel(cfg?: AiClientConfig): string {
  return cfg?.model?.trim() || process.env.MODEL || "claude-sonnet-4-6";
}

function getApiKey(cfg?: AiClientConfig): string {
  const k = cfg?.apiKey?.trim() || process.env.LITELLM_API_KEY || "";
  if (!k) throw new Error("AI 服务未配置：请在页面右上角「AI 设置」中填入 API Key");
  return k;
}

function getBaseURL(cfg?: AiClientConfig): string | undefined {
  return cfg?.baseURL?.trim() || process.env.ANTHROPIC_BASE_URL;
}

function getAnthropicClient(cfg?: AiClientConfig): Anthropic {
  return new Anthropic({ baseURL: getBaseURL(cfg), apiKey: getApiKey(cfg) });
}

function getOpenAIClient(cfg?: AiClientConfig): OpenAI {
  // OpenAI SDK 会自动加 /v1，调用者只需给基础域名
  let baseURL = getBaseURL(cfg);
  // 用户填了完整 endpoint（带 /v1）时也兼容
  if (baseURL && !baseURL.endsWith("/v1")) {
    baseURL = baseURL.replace(/\/$/, "") + "/v1";
  }
  return new OpenAI({ baseURL, apiKey: getApiKey(cfg) });
}

// ---------- Usage 累加 ----------

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

// ---------- 1) 岗位语义解析 ----------

const POSITION_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    understanding: { type: "string", description: "对该岗位的整体理解，3-4 句中文，明确产出物、所属阶段、典型工作场景" },
    key_skills: { type: "array", items: { type: "string" }, description: "5-10 个核心技能/工具/能力关键字" },
    artwork_features: { type: "array", items: { type: "string" }, description: "5-8 个作品视觉特征关键字" },
    search_queries: {
      type: "array",
      items: { type: "string" },
      description: "6-10 个用于在微博/小红书搜索的中文短语；可含话题标签 #xxx#，例如：原画师 招聘 / 插画约稿 / 角色设计 / 二次元立绘 / #原画师# / #插画师#",
    },
  },
  required: ["understanding", "key_skills", "artwork_features", "search_queries"],
};

const POSITION_TOOL: Anthropic.Tool = {
  name: "describe_position",
  description: "对游戏美术岗位进行专业理解，输出技能、作品特征和微博/小红书搜索词（中文为主）",
  input_schema: POSITION_TOOL_SCHEMA,
};

function buildPositionBase(
  position: string,
  jd: string,
  artStyles: string[],
  tools: string[],
  themes: string[],
): string {
  return `岗位名称：${position}
JD：${jd || "（未提供）"}
美术风格：${artStyles.length > 0 ? artStyles.join("、") : "（未指定）"}
工具/软件要求：${tools.length > 0 ? tools.join("、") : "（未指定）"}
题材偏好：${themes.length > 0 ? themes.join("、") : "（未指定）"}`;
}

/**
 * 微博 prompt — IP 引导 + 职能标签 50/50 混合。
 * HR 真实有效的搜法不是搜"原画师"泛词,而是用知名游戏 IP 名反推画师。
 */
function weiboPromptBody(base: string): string {
  return `请对以下游戏美术岗位进行专业理解，并产出在【微博】上**搜索画师真实微博内容**所需的关键词。

${base}

## ⚠️ 微博搜索的关键直觉

画师在微博晒作品时常带的标签是「游戏 IP 名 + 画师/原画/KV」或「身份标签 + 创作内容」。HR 真实有效搜法不是搜"原画师"这种泛词，而是用知名游戏 IP 名（项目名）反推画师。

我们的抓取逻辑是【搜实时微博正文 → 反推作者】，所以关键词要是**画师真实会写在微博正文/话题里**的词。

## search_queries 应该是 50/50 混合（共 6-10 条）

### ✅ 一半：IP 引导（根据岗位的风格/题材，挑 3-5 个最相关 IP）

- 头部二次元/动漫 IP：\`原神画师\`、\`鸣潮画师\`、\`崩坏画师\`、\`明日方舟同人\`、\`阴阳师立绘\`、\`光遇画手\`、\`光与夜之恋立绘\`、\`恋与制作人插画\`
- 头部 MOBA / 竞技 IP：\`王者人物原画\`、\`王者皮肤原画\`
- 头部国风 IP：\`剑网三同人\`、\`逆水寒角色\`、\`原神璃月\`
- 形式可以是 \`原神画师\` / \`原神KV\` / \`原神角色设计\` / \`鸣潮同人\`

### ✅ 另一半：身份标签 + 话题标签 + 接稿描述

- 身份标签型：\`动漫博主 原画\`、\`插画师 接稿\`、\`概念设计师\`、\`画手 商稿\`
- 话题标签型：\`#插画日常#\`、\`#原画约稿#\`、\`#立绘约稿#\`、\`#手绘#\`、\`#数位板#\`
- 接稿描述型：\`商稿\`、\`商业插画\`、\`约稿中\`、\`稿件\`、\`插画接单\`

### ❌ 不要的搜索词

- 纯职能词：\`原画师\` / \`插画师\`（召回大量无作品账号或同名号）
- HR 用语：\`招聘\` / \`求职\` / \`应聘\`
- 太泛的 IP：\`游戏\` / \`动漫\`
- 单字：\`画\` / \`稿\`

## 要求

- 6-10 条中文短语
- IP 引导和职能/标签**各占一半左右**
- IP 选择要匹配岗位的美术风格/题材（如二次元岗位优先原神/明日方舟/光与夜之恋，国风岗位优先剑网三/逆水寒）
- 短语要够具体，避免单字或太宽泛`;
}

/**
 * 小红书 prompt — 风格 + 类型组合。
 * 画师笔记标题非常有"风格信号"，让搜索词本身带上风格关键词，搜出来的笔记自然按风格聚类。
 */
function xhsPromptBody(base: string): string {
  return `请对以下游戏美术岗位进行专业理解，并产出在【小红书】上**搜索画师真实笔记**所需的关键词。

${base}

## ⚠️ 小红书搜索的关键直觉

画师的笔记标题非常有"风格信号"，常见组合是「风格关键词 + 作品类型」（如"二次元角色原画"、"古风厚涂立绘"）。单独搜"角色原画"会跳出各种画风让 HR 自己挑；最好让搜索词本身带上风格关键词，搜出来的笔记天然按风格聚类。

我们的抓取逻辑是【搜笔记 → 反推作者】，所以关键词要是**画师真实会写在笔记标题/话题里**的词。

## search_queries 应是「风格 + 类型」组合（共 6-10 条）

### ✅ 风格 + 类型组合（占主）

- 二次元 / 日系 / Q版：\`二次元 角色原画\`、\`日系 角色立绘\`、\`Q版 角色头像\`、\`厚涂 二次元\`
- 国风 / 古风：\`古风 角色立绘\`、\`国风 插画\`、\`水墨 角色\`、\`古风 厚涂\`
- 写实 / 概念：\`厚涂 角色\`、\`赛博朋克 角色设计\`、\`奇幻 概念图\`、\`写实 半身像\`
- 工艺 / 技法关键词（画师笔记标题常用）：\`线稿\`、\`厚涂\`、\`平涂\`、\`赛璐璐\`

### ✅ 话题标签形式

\`#二次元立绘#\`、\`#古风插画#\`、\`#厚涂教程#\`、\`#角色设计过程#\`、\`#原画日常#\`

### ✅ 知名 IP 同人（小红书也有大量同人画师）

\`原神同人\`、\`光与夜之恋立绘\`、\`恋与制作人插画\`、\`明日方舟同人\`

### ❌ 不要的搜索词

- 单一职能词：\`角色原画\` / \`插画师\` / \`画师\`（召回杂乱）
- HR 用语：\`招聘\` / \`应聘\`
- 太单一的风格词：\`二次元\` / \`古风\`（没带类型，召回过宽）

## 要求

- 6-10 条中文短语
- 至少 2 条要反映岗位指定的美术风格 / 题材
- 至少 3 条是「风格+类型」格式
- 至少 2 条话题标签 \`#xxx#\` 格式`;
}

/**
 * ArtStation prompt — 保持原有(用户没反馈问题, 工作良好)。
 * 注意 ArtStation 是国际平台,关键词以英文/通用为主。
 */
function artstationPromptBody(base: string): string {
  return `请对以下游戏美术岗位进行专业理解，并产出在【ArtStation / 国际画师社区】上**搜索画师真实作品页**所需的关键词。

${base}

## ⚠️ 极其重要：search_queries 的设计原则

我们的搜索逻辑是【搜作品页 / 用户页 → 反推画师】，关键词必须是**画师真实会写在作品标题/标签里**的词，而不是 HR 招聘 jargon。

✅ **好的 search_queries 例子**：
- 作品类型词：\`character concept\`、\`character design\`、\`environment concept\`、\`key art\`、\`fantasy illustration\`
- 风格描述词：\`stylized character\`、\`semi-realism portrait\`、\`anime style\`、\`oriental ink painting\`
- 项目/题材类型：\`MOBA character\`、\`mecha design\`、\`creature design\`、\`weapon concept\`
- 中文画师社区惯用词：\`原画\`、\`角色设计\`、\`立绘\`、\`概念设计\`

❌ **差的 search_queries 例子**：
- ❌ \`hiring artist\` / \`原画师 招聘\` — 画师不会在作品页写"招聘"
- ❌ 太宽泛的 \`art\` / \`drawing\` — 召回过多无关内容

## 要求

- 6-10 条短语（中英文均可，混合更好）
- 至少 3 条是**作品/创作类描述词**（不带 hiring/recruiting/求职）
- 如果指定了具体美术风格/题材，至少 2 条要反映这些偏好
- 短语要够具体，避免单字或太宽泛`;
}

function buildPositionUserMessage(
  platform: Platform,
  position: string,
  jd: string,
  artStyles: string[],
  tools: string[],
  themes: string[],
): string {
  const base = buildPositionBase(position, jd, artStyles, tools, themes);
  if (platform === "weibo") return weiboPromptBody(base);
  if (platform === "xiaohongshu") return xhsPromptBody(base);
  return artstationPromptBody(base);
}

export async function expandPosition(
  userId: string,
  platform: Platform,
  position: string,
  jd: string,
  artStyles: string[],
  tools: string[],
  themes: string[],
  aiConfig?: AiClientConfig,
): Promise<PositionBrief> {
  const userMessage = buildPositionUserMessage(platform, position, jd, artStyles, tools, themes);
  const model = getModel(aiConfig);
  const protocol = resolveProtocol(aiConfig, model);

  let parsed: PositionBrief;

  if (protocol === "anthropic") {
    const client = getAnthropicClient(aiConfig);
    const response = await client.messages.create({
      model,
      max_tokens: 800,
      tools: [POSITION_TOOL],
      tool_choice: { type: "tool", name: "describe_position" },
      messages: [{ role: "user", content: userMessage }],
    });
    recordAnthropic(userId, model, response.usage, aiConfig?.customPricing);
    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("AI 未返回工具调用结果 (expandPosition)");
    }
    parsed = toolUse.input as PositionBrief;
  } else {
    const client = getOpenAIClient(aiConfig);
    const response = await client.chat.completions.create({
      model,
      max_tokens: 800,
      messages: [{ role: "user", content: userMessage }],
      tools: [
        {
          type: "function",
          function: {
            name: "describe_position",
            description: POSITION_TOOL.description,
            parameters: POSITION_TOOL_SCHEMA,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "describe_position" } },
    });
    recordOpenAI(userId, model, response.usage, aiConfig?.customPricing);
    const tc = response.choices[0]?.message?.tool_calls?.[0];
    if (!tc || tc.type !== "function") {
      throw new Error("AI 未返回工具调用结果 (expandPosition)");
    }
    parsed = JSON.parse(tc.function.arguments) as PositionBrief;
  }

  return {
    understanding: parsed.understanding,
    key_skills: parsed.key_skills ?? [],
    artwork_features: parsed.artwork_features ?? [],
    search_queries: parsed.search_queries ?? [],
  };
}

// ---------- 2) 候选人评分 ----------

function buildSystemPrompt(weights: ScoreWeights, platformLabel: string): string {
  const total = weights.jd + weights.keyword + weights.experience + weights.education + weights.openness + weights.followers;

  const dims = DIMENSION_DEFINITIONS.map((d, i) => {
    const w = weights[d.key];
    return `### ${i + 1}. ${d.name}（${w} 分）\n${d.bullets.map((b) => `- ${b}`).join("\n")}`;
  }).join("\n\n");

  const isArtStation = platformLabel === "ArtStation";
  const signalDesc = isArtStation
    ? "ArtStation 上的候选人专业信号集中在：bio（多为英文）、headline、available_for_work 字段、个人网站和 social_profiles 链接、作品集（projects）的标题/tag/描述/封面图。中国画师常在 location/country 字段标 China/CN/上海/北京等城市名。"
    : "候选人数据来自中文社交平台，专业信号集中在：bio/个人简介、平台认证（蓝V/红V）及认证理由、置顶/最近的图文笔记/微博、话题标签 #xxx#、IP 属地、粉丝/笔记互动数。";

  return `你是一名专业的游戏公司美术招聘顾问，同时具备资深美术评估能力。你的任务是根据招聘需求对【${platformLabel}】上的画师候选人进行综合评分，并抽取联系方式、所在项目等关键信息。

${signalDesc}**如果提供了作品图**，应当结合图片中体现的画风、完成度、原创性给出更准确的评分。

## 岗位画像（由前置 AI 解析得到，已对岗位有深刻理解）
{POSITION_BRIEF}

## 评分体系（满分 ${total} 分）

${dims}

## 评分等级（按总分百分比换算）
- 高度匹配：85% 以上 / 较高匹配：70-84% / 可关注：55-69% / 低匹配：< 55%

注意：score_breakdown 各维度分值上限分别是 jd:${weights.jd} / keyword:${weights.keyword} / experience:${weights.experience} / education:${weights.education} / openness:${weights.openness} / followers:${weights.followers}。total_score 必须正好等于六维之和。

## 评分原则修正（必须遵守）
- **education 维度**：社交平台候选人通常不会公开学历。若公开资料里**没有明确教育信息**，必须按该维度**中位分**处理（通常给 ${Math.ceil(weights.education / 2)} 分，允许上下浮动 1 分），**不得**因为“未披露学历”直接打 0 分。
- **能力评分与触达难度分离**：候选人身处海外、未留联系方式、联系路径不明确，属于**触达难度**，只能体现在 cons 与 openness 维度；**不得**连累 jd_match 或 experience_match 的能力评分。
- **严格上限**：score_breakdown 六个维度都必须是**整数**，且**严禁超过各自上限**、严禁为负数；total_score 必须等于六维之和。输出前自行复核一次。

## 📊 ${platformLabel} 粉丝数评分参考

请按以下量级 + 岗位级别综合判断（不能死磕数字）：
- **10w+**：行业头部 KOL / 顶级画师
- **3w-10w**：资深 + 在业内有一定知名度
- **5000-3w**：中级 + 活跃产出
- **1000-5000**：起步阶段 / 中级
- **300-1000**：新人 / 小号 / 不活跃
- **< 300**：刚开始 / 作品少 / 不活跃

评分要点（满分 ${weights.followers} 分）：
1. 不能完全按粉丝量线性给分。某些极强的中国画师可能主要活跃在站酷/ArtStation，${platformLabel} 是次要平台，但作品水平很高。这种应给中等偏上分，并在 cons 里标"主要活跃在其他平台"。
2. 平台官方认证（蓝V/红V/官方认证）+ 认证理由是强信号，例如认证理由是"游戏原画师 / 某某工作室主美"，可直接判定为资深级别。
3. 粉丝量与岗位级别匹配：招初级岗 1000+ 即可给高分；招资深主美/总监最好 5w+。
4. 0 粉或 < 50 粉通常说明账号是新建/废弃/小号，应在 cons 里点出。

## 🎨 中国游戏美术风格分类知识库（必读，避免胡乱归类）

判断候选人作品的美术风格时**必须基于实际作品/笔记内容/话题标签和图片**，**不要被搜索关键词误导**。

**国风/古风/写实**（不是二次元）：王者荣耀、完美世界、诛仙、梦幻西游、永劫无间、黑神话悟空、斗罗大陆、不良人、镇魂街、轩辕传奇、古剑奇谭、仙剑奇侠传等

**MOBA/竞技写实**（不是二次元）：LOL、传说对决、DOTA、Smite

**真正的二次元**（日式动漫风、赛璐璐/平涂卡通）：原神、崩坏、绝区零（米哈游系）、蔚蓝档案、明日方舟、碧蓝航线、战双帕弥什、公主连结、少女前线、阴阳师

**Q版/卡通可爱**：第五人格、蛋仔派对、摩尔庄园

**写实欧美/AAA 大作**：战地、使命召唤、巫师、赛博朋克 2077

⚠️ **重要规则**：
1. 候选人作品里有"王者荣耀/完美世界/不良人"等 → 不能描述为"二次元"，应该是 **写实国风** / **半写实** / **写实奇幻**
2. 只有真的看到日漫赛璐璐/平涂卡通/萌系大眼睛立绘才能写"二次元"
3. 如果用户搜的是"二次元"但候选人作品其实是"写实国风"，**必须在 cons 里诚实指出**，不能为了讨好用户胡说
4. art_evaluation 里描述风格时，要基于看到的实际作品/图片，**不要复读用户的搜索关键词**

## 输出要求（必须严格遵守，禁止幻觉）
- pros：一句话，**仅列加分项**，要具体引用候选人的作品/标签/认证/经历
- cons：一句话，**仅列减分项或风险**；没有显著减分项就写"无明显减分项"
- art_evaluation：2-3 句，专业评价候选人作品风格和水平
- inferred_position：推断最匹配的具体岗位名称（中文）
- suggested_tags：5-8 个**简短可复用**的中文标签（每个 2-6 个字），覆盖：岗位类型 / 美术风格 / 题材方向 / 段位 / 公司归属（仅当 bio 明确） / 求职意向（仅当明确）

### ⚠️ 禁止编造
- **contact**：只允许从 bio/置顶笔记/微博文本中**复制**邮箱/微信/QQ/手机号（识别 "wx:" "VX:" "微信" "QQ:" "邮箱" "@gmail" "约稿" 等前缀）。无任何线索时**必须返回 null**。**绝对不允许**根据用户名推测邮箱或编造账号。多种联系方式用 " | " 分隔
- **current_project**：只允许从 bio / 认证理由 / 置顶内容**复制**明确写出的当前公司/工作室/项目名。**禁止根据作品风格推测**。未明确写出**必须返回 null**

### open_to_opportunity（四档严格判据，按规则归类，禁止主观揣测）

- **"明确看机会"** ：bio / 置顶笔记 / 认证理由里**明确写了**至少一项招揽语：
  "约稿" / "接稿" / "接外包" / "求职中" / "求 offer" / "在找工作" / "商务合作" /
  "looking for opportunity" / "open to work" / "available for hire" / "freelance available"

- **"可能看机会"** （仅以下三种情况之一）：
  ① bio 留了商务/约稿联系方式，但没写明确招揽语
     （如 "WX:xxx" / "VX:xxx" / "QQ:xxx" / "商务请联系" / "合作:xxx" / "约稿邮箱:xxx" / "私信详谈"）
  ② 最近置顶或高赞笔记/微博的内容明显是"接稿样图 / 商业案例展示 / 作品报价表"
  ③ ArtStation 候选人的 \`available_for_work\` 字段为 true，但 bio 没有明确表述

- **"未表明"** ：bio 完全没相关线索（既无招揽语、也无商务联系方式、available_for_work 未知）

- **"暂不看机会"** ：bio 明确写：
  "暂不接稿" / "不约稿" / "不接私信" / "档期已满" / "停接" / "not available" / "目前不接" 等

**严格按上述规则归类**，不允许凭"账号活跃""作品多"等主观感受揣测。如果模糊不清就归"未表明"。

如果其他字段找不到证据，宁可返回 null / "未表明"，也不要编造。`;
}

function buildScoreToolSchema(weights: ScoreWeights) {
  const total = weights.jd + weights.keyword + weights.experience + weights.education + weights.openness + weights.followers;
  return {
    type: "object" as const,
    properties: {
      total_score: { type: "number", description: `综合评分，0-${total} 整数；必须等于六个维度分之和` },
      score_level: { type: "string", enum: ["高度匹配", "较高匹配", "可关注", "低匹配"] },
      score_breakdown: {
        type: "object",
        properties: {
          jd_match: { type: "number", description: `0-${weights.jd}` },
          keyword_match: { type: "number", description: `0-${weights.keyword}` },
          experience_match: { type: "number", description: `0-${weights.experience}` },
          education_match: { type: "number", description: `0-${weights.education}` },
          openness: { type: "number", description: `0-${weights.openness}` },
          followers: { type: "number", description: `0-${weights.followers}` },
        },
        required: ["jd_match", "keyword_match", "experience_match", "education_match", "openness", "followers"],
      },
      pros: { type: "string" },
      cons: { type: "string" },
      art_evaluation: { type: "string" },
      inferred_position: { type: "string" },
      contact: { type: ["string", "null"], description: "邮箱/微信/QQ/手机号；无则 null" },
      open_to_opportunity: { type: "string", enum: ["明确看机会", "可能看机会", "未表明", "暂不看机会"] },
      current_project: { type: ["string", "null"] },
      suggested_tags: { type: "array", items: { type: "string" } },
    },
    required: [
      "total_score", "score_level", "score_breakdown", "pros", "cons",
      "art_evaluation", "inferred_position", "contact",
      "open_to_opportunity", "current_project", "suggested_tags",
    ],
  };
}

export interface ScoreOutput {
  total_score: number;
  score_level: "高度匹配" | "较高匹配" | "可关注" | "低匹配";
  score_breakdown: ScoreBreakdown;
  pros: string;
  cons: string;
  art_evaluation: string;
  inferred_position: string;
  contact: string | null;
  open_to_opportunity: "明确看机会" | "可能看机会" | "未表明" | "暂不看机会";
  current_project: string | null;
  suggested_tags: string[];
  vision_used: boolean;
  region_confidence: "确认中国区域" | "疑似中国区域" | "非中国区域";
}

const LEGACY_DEFAULT_WEIGHTS: ScoreWeights = {
  jd: 35,
  keyword: 20,
  experience: 15,
  education: 10,
  openness: 5,
  followers: 15,
};

function computeScoreLevel(totalScore: number, maxScore: number): ScoreOutput["score_level"] {
  const ratio = maxScore > 0 ? totalScore / maxScore : 0;
  if (ratio >= 0.85) return "高度匹配";
  if (ratio >= 0.7) return "较高匹配";
  if (ratio >= 0.55) return "可关注";
  return "低匹配";
}

function normalizeScoreOutput(
  parsed: Omit<ScoreOutput, "vision_used" | "region_confidence">,
  weights: ScoreWeights,
): Omit<ScoreOutput, "vision_used" | "region_confidence"> {
  const toBoundedInt = (value: number | undefined, max: number): number => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(max, Math.round(num)));
  };
  const remapDimension = (value: number | undefined, legacyMax: number, currentMax: number): number => {
    const bounded = toBoundedInt(value, Math.max(legacyMax, currentMax));
    if (legacyMax === currentMax) return Math.max(0, Math.min(currentMax, bounded));
    const ratio = legacyMax > 0 ? Math.min(bounded, legacyMax) / legacyMax : 0;
    return Math.max(0, Math.min(currentMax, Math.round(ratio * currentMax)));
  };

  const score_breakdown: ScoreBreakdown = {
    jd_match: remapDimension(parsed.score_breakdown?.jd_match, LEGACY_DEFAULT_WEIGHTS.jd, weights.jd),
    keyword_match: remapDimension(parsed.score_breakdown?.keyword_match, LEGACY_DEFAULT_WEIGHTS.keyword, weights.keyword),
    experience_match: remapDimension(parsed.score_breakdown?.experience_match, LEGACY_DEFAULT_WEIGHTS.experience, weights.experience),
    education_match: remapDimension(parsed.score_breakdown?.education_match, LEGACY_DEFAULT_WEIGHTS.education, weights.education),
    openness: remapDimension(parsed.score_breakdown?.openness, LEGACY_DEFAULT_WEIGHTS.openness, weights.openness),
    followers: remapDimension(parsed.score_breakdown?.followers, LEGACY_DEFAULT_WEIGHTS.followers, weights.followers),
  };

  const total_score =
    score_breakdown.jd_match +
    score_breakdown.keyword_match +
    score_breakdown.experience_match +
    score_breakdown.education_match +
    score_breakdown.openness +
    score_breakdown.followers;
  const maxScore = weights.jd + weights.keyword + weights.experience + weights.education + weights.openness + weights.followers;

  return {
    ...parsed,
    total_score,
    score_level: computeScoreLevel(total_score, maxScore),
    score_breakdown,
  };
}

function applyCandidateScoreHeuristics(
  parsed: Omit<ScoreOutput, "vision_used" | "region_confidence">,
  candidate: NormalizedCandidate,
  scanParams: ScanParams,
  weights: ScoreWeights,
): Omit<ScoreOutput, "vision_used" | "region_confidence"> {
  const next = {
    ...parsed,
    score_breakdown: { ...parsed.score_breakdown },
  };
  const textCorpus = [
    candidate.bio ?? "",
    candidate.verifiedReason ?? "",
    ...candidate.posts.slice(0, 8).map((post) => post.text),
  ].join("\n");

  const hasEducationSignal = /本科|硕士|博士|大专|学历|毕业|大学|学院|专业/i.test(textCorpus);
  if (!hasEducationSignal) {
    next.score_breakdown.education_match = Math.max(
      next.score_breakdown.education_match,
      Math.ceil(weights.education / 2),
    );
  }

  const roleWantsCharacterArt = /角色|插画|原画|立绘|二次元/i.test(`${scanParams.position} ${scanParams.jd}`);
  const verifiedArtist = /画师|插画|原画|illustrat|artist|concept/i.test(candidate.verifiedReason ?? "");
  const professionalBioSignal = /illustrator|原画师|插画师|概念设计|米画师|外包合作|接稿|约稿/i.test(candidate.bio ?? "");
  const artTextSignal = candidate.posts.some((post) =>
    /稿件|立绘|插画|角色|服装|设计|commission|art|oc|同人|原神|鸣潮|崩坏/i.test(post.text),
  );
  const strongVisualSignal =
    candidate.posts.filter((post) => post.imageUrls.length > 0).length >= 3 &&
    artTextSignal &&
    (candidate.followers ?? 0) >= 1000;

  if (roleWantsCharacterArt && strongVisualSignal && (verifiedArtist || professionalBioSignal)) {
    next.score_breakdown.experience_match = Math.max(
      next.score_breakdown.experience_match,
      Math.min(weights.experience, Math.ceil(weights.experience * 0.67)),
    );
    if (verifiedArtist && (candidate.followers ?? 0) >= 100000) {
      next.score_breakdown.jd_match = Math.max(
        next.score_breakdown.jd_match,
        Math.min(weights.jd, Math.ceil(weights.jd * 0.9)),
      );
    }
  }

  const total_score =
    next.score_breakdown.jd_match +
    next.score_breakdown.keyword_match +
    next.score_breakdown.experience_match +
    next.score_breakdown.education_match +
    next.score_breakdown.openness +
    next.score_breakdown.followers;
  const maxScore = weights.jd + weights.keyword + weights.experience + weights.education + weights.openness + weights.followers;

  return {
    ...next,
    total_score,
    score_level: computeScoreLevel(total_score, maxScore),
  };
}

function buildCandidateUserText(
  candidate: NormalizedCandidate,
  scanParams: ScanParams,
  regionConfidence: string,
): string {
  const postLines = candidate.posts.slice(0, 15).map((p, i) => {
    const e = p.engagement;
    const topics = p.topics.length > 0 ? ` [${p.topics.map((t) => `#${t}#`).join(" ")}]` : "";
    const imgs = p.imageUrls.length > 0 ? ` [图×${p.imageUrls.length}]` : "";
    return `${i + 1}. (互动${e}${imgs}${topics}) ${p.text.slice(0, 140)}`;
  });

  return `## 本次招聘需求
平台：${candidate.platform === "weibo" ? "微博" : candidate.platform === "xiaohongshu" ? "小红书" : "ArtStation"}
岗位：${scanParams.position}
JD摘要：${scanParams.jd || "（未提供）"}
美术风格：${scanParams.artStyles.length > 0 ? scanParams.artStyles.join("、") : "（未指定）"}
工具/软件要求：${scanParams.tools.length > 0 ? scanParams.tools.join("、") : "（未指定）"}
题材偏好：${scanParams.themes.length > 0 ? scanParams.themes.join("、") : "（未指定）"}
学历要求：${scanParams.education || "（未提供）"}
背景经验要求：${scanParams.experience || "（未提供）"}
地域要求：${scanParams.region || "中国区域"}

## 候选人信息
昵称：${candidate.name}
平台 ID：${candidate.platformUserId}
主页：${candidate.profileUrl}
地区：${candidate.location ?? "未知"} / IP 属地：${candidate.ipLocation ?? "未知"} / 地区可信度：${regionConfidence}
平台认证：${candidate.verified ? `已认证（${candidate.verifiedReason ?? "未提供理由"}）` : "未认证"}
粉丝数：${candidate.followers === null ? "未知" : candidate.followers.toLocaleString()}
笔记/微博数：${candidate.postsCount === null ? "未知" : candidate.postsCount.toLocaleString()}
Bio：${candidate.bio ?? "无"}

## 近期作品 / 笔记（共 ${candidate.posts.length} 条，按互动量排）
${postLines.length > 0 ? postLines.join("\n") : "无作品数据"}

请根据以上信息（${candidate.posts.length > 0 ? "以及附带的作品图片" : "无作品图"}）对该候选人进行评分。`;
}

// ---------- region 判定 ----------

function detectRegion(candidate: NormalizedCandidate): "确认中国区域" | "疑似中国区域" | "非中国区域" {
  // IP 属地非空且不含"海外"/英文 → 强信号确认中国
  const ip = candidate.ipLocation ?? "";
  if (ip && !/海外|海外华人|other/i.test(ip)) {
    return "确认中国区域";
  }
  const loc = candidate.location ?? "";
  if (/中国|大陆|港|澳|台/.test(loc + ip)) return "确认中国区域";
  if (/[一-龥]/.test(candidate.bio ?? "") || /[一-龥]/.test(candidate.name)) {
    return "疑似中国区域";
  }
  return "非中国区域";
}

// ---------- vision: 拉取图片转 base64 ----------

async function fetchImageAsBase64(url: string, maxBytes = 5 * 1024 * 1024): Promise<{ mediaType: string; data: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Referer: "https://weibo.com/",
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    const mediaType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    if (!/^image\//.test(mediaType)) return null;
    return { mediaType, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

function pickVisionImages(candidate: NormalizedCandidate, limit = 4): string[] {
  // 按互动数排，挑前 N 个有图的 post，每个 post 最多取 1 张代表图
  const sorted = [...candidate.posts]
    .filter((p) => p.imageUrls.length > 0)
    .sort((a, b) => b.engagement - a.engagement);
  const urls: string[] = [];
  for (const p of sorted) {
    if (urls.length >= limit) break;
    urls.push(p.imageUrls[0]);
  }
  return urls;
}

// ---------- 主入口：评分 ----------

export async function scoreCandidate(
  userId: string,
  candidate: NormalizedCandidate,
  scanParams: ScanParams,
  positionBrief: PositionBrief,
  aiConfig?: AiClientConfig,
): Promise<ScoreOutput> {
  const weights = scanParams.weights ?? DEFAULT_WEIGHTS;
  const model = getModel(aiConfig);
  const protocol = resolveProtocol(aiConfig, model);
  const region = detectRegion(candidate);

  const platformLabel = candidate.platform === "weibo" ? "微博" : candidate.platform === "xiaohongshu" ? "小红书" : "ArtStation";
  const briefText = `岗位理解：${positionBrief.understanding}
核心技能：${positionBrief.key_skills.join("、")}
作品特征：${positionBrief.artwork_features.join("、")}`;
  const systemPrompt = buildSystemPrompt(weights, platformLabel).replace("{POSITION_BRIEF}", briefText);
  const userText = buildCandidateUserText(candidate, scanParams, region);

  const visionWanted = aiConfig?.visionEnabled !== false && supportsVision(model);
  const visionUrls = visionWanted ? pickVisionImages(candidate, 4) : [];
  const visionImages: Array<{ mediaType: string; data: string }> = [];
  if (visionUrls.length > 0) {
    const fetched = await Promise.all(visionUrls.map((u) => fetchImageAsBase64(u)));
    for (const f of fetched) if (f) visionImages.push(f);
  }
  const visionUsed = visionImages.length > 0;

  if (protocol === "anthropic") {
    const client = getAnthropicClient(aiConfig);
    const userContent: Anthropic.ContentBlockParam[] = [{ type: "text", text: userText }];
    for (const img of visionImages) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: img.data },
      });
    }

    const response = await client.messages.create({
      model,
      max_tokens: 1500,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      tools: [{ name: "score_candidate", description: "对候选人进行结构化评分", input_schema: buildScoreToolSchema(weights) }],
      tool_choice: { type: "tool", name: "score_candidate" },
      messages: [{ role: "user", content: userContent }],
    });
    recordAnthropic(userId, model, response.usage, aiConfig?.customPricing);

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("AI 未返回工具调用结果 (scoreCandidate)");
    }
    const parsed = applyCandidateScoreHeuristics(
      normalizeScoreOutput(
      toolUse.input as Omit<ScoreOutput, "vision_used" | "region_confidence">,
      weights,
      ),
      candidate,
      scanParams,
      weights,
    );
    return { ...parsed, vision_used: visionUsed, region_confidence: region };
  } else {
    const client = getOpenAIClient(aiConfig);
    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: "text", text: userText }];
    for (const img of visionImages) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${img.mediaType};base64,${img.data}` },
      });
    }
    const response = await client.chat.completions.create({
      model,
      max_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [{
        type: "function",
        function: { name: "score_candidate", description: "对候选人进行结构化评分", parameters: buildScoreToolSchema(weights) },
      }],
      tool_choice: { type: "function", function: { name: "score_candidate" } },
    });
    recordOpenAI(userId, model, response.usage, aiConfig?.customPricing);
    const tc = response.choices[0]?.message?.tool_calls?.[0];
    if (!tc || tc.type !== "function") {
      throw new Error("AI 未返回工具调用结果 (scoreCandidate)");
    }
    const parsed = applyCandidateScoreHeuristics(
      normalizeScoreOutput(
      JSON.parse(tc.function.arguments) as Omit<ScoreOutput, "vision_used" | "region_confidence">,
      weights,
      ),
      candidate,
      scanParams,
      weights,
    );
    return { ...parsed, vision_used: visionUsed, region_confidence: region };
  }
}

// ---------- 测试连通 ----------

export async function pingAi(aiConfig?: AiClientConfig): Promise<{ reply: string; model: string }> {
  const model = getModel(aiConfig);
  const protocol = resolveProtocol(aiConfig, model);
  if (protocol === "anthropic") {
    const client = getAnthropicClient(aiConfig);
    const res = await client.messages.create({
      model,
      max_tokens: 30,
      messages: [{ role: "user", content: '请回复"OK"两个字符，不要其他内容' }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("");
    return { reply: text.slice(0, 50), model };
  } else {
    const client = getOpenAIClient(aiConfig);
    const res = await client.chat.completions.create({
      model,
      max_tokens: 30,
      messages: [{ role: "user", content: '请回复"OK"两个字符，不要其他内容' }],
    });
    return { reply: (res.choices[0]?.message?.content ?? "").slice(0, 50), model };
  }
}
