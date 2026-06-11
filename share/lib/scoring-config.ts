/**
 * 前后端共用的评分配置 + 类型定义。
 * 这个文件 **不能** 引入任何服务端专用的依赖（如 Anthropic SDK / puppeteer），
 * 否则会在客户端打包时炸。所有 server-only 的代码放在 lib/claude.ts。
 */

import type { Platform } from "./types";

// ---------- 评分权重 ----------

export interface ScoreWeights {
  jd: number;          // JD 匹配度
  keyword: number;     // 关键词匹配度
  experience: number;  // 背景经验匹配度
  education: number;   // 教育与履历匹配度
  openness: number;    // 候选人开放度与联系可行性
  followers: number;   // 社区影响力（粉丝 / 行业认知度）
}

// 社交平台默认权重：粉丝信号更强、open-to-work 概念弱
export const DEFAULT_WEIGHTS: ScoreWeights = {
  jd: 40,
  keyword: 20,
  experience: 15,
  education: 5,
  openness: 5,
  followers: 15,
};

export const DIMENSION_DEFINITIONS = [
  {
    key: "jd" as const,
    name: "JD 匹配度",
    bullets: [
      "岗位职责与候选人作品方向是否一致",
      "作品成熟度是否符合目标级别",
      "技能栈是否匹配岗位要求",
      "是否具有相关项目经验",
    ],
  },
  {
    key: "keyword" as const,
    name: "关键词匹配度",
    bullets: [
      "风格关键词匹配情况（话题标签 / 简介关键词）",
      "工具/流程关键词匹配情况",
      "题材关键词匹配情况",
      "是否有用户指定标签",
    ],
  },
  {
    key: "experience" as const,
    name: "背景经验匹配度",
    bullets: [
      "游戏项目经验（认证/置顶/简介中提及）",
      "项目类型匹配（如二次元、SLG、MMO、卡牌、开放世界等）",
      "商业项目经验 / 团队协作经验 / 外包或甲方经验",
      "初/中/高级资历判断",
    ],
  },
  {
    key: "education" as const,
    name: "教育与履历匹配度",
    bullets: [
      "学历是否满足要求（如简介提及）",
      "是否有相关专业背景",
      "履历信息是否完整可信",
    ],
  },
  {
    key: "openness" as const,
    name: "候选人开放度与联系可行性",
    bullets: [
      "简介/置顶笔记是否含「约稿/接单/求职/看机会/商务合作」",
      "是否留有联系方式（微信/QQ/邮箱/B站/站酷）",
      "是否可从公开资料推断出便于接触",
    ],
  },
  {
    key: "followers" as const,
    name: "社区影响力（粉丝数）",
    bullets: [
      "微博/小红书粉丝数级别（量级判断而非死磕数字）",
      "粉丝量与岗位要求级别是否匹配（资深岗看重，初级岗权重低）",
      "是否有平台官方认证 / 蓝V红V / 出现在精选话题",
      "对中小厂招聘价值：高粉影响力强但接触难度大；低粉但作品强可视为潜力股",
    ],
  },
];

// ---------- 评分输出结构 ----------

export interface ScoreBreakdown {
  jd_match: number;
  keyword_match: number;
  experience_match: number;
  education_match: number;
  openness: number;
  followers: number;
}

export interface RadarResult {
  // 基础信息
  platform: Platform;
  platform_user_id: string;
  username: string;        // 平台用户名/昵称
  name: string;            // 真实姓名（若有）
  profile_url: string;
  avatar_url: string | null;
  location: string | null;
  ip_location: string | null;
  region_confidence: "确认中国区域" | "疑似中国区域" | "非中国区域";
  headline: string | null; // bio / 个人介绍
  recent_works: string[];  // 最近笔记/微博文本
  recent_work_images: string[]; // 抽给 vision 评分的图片 URL
  followers_count: number | null;
  posts_count: number | null;
  verified: boolean;
  verified_reason: string | null;

  passed: boolean;

  // 岗位
  position_name: string;
  inferred_position: string;

  // 评分
  total_score: number;
  score_level: "高度匹配" | "较高匹配" | "可关注" | "低匹配";
  score_breakdown: ScoreBreakdown;
  pros: string;
  cons: string;
  art_evaluation: string;
  vision_used: boolean;  // 是否用了图片评分

  // 联系方式 / 求职意向 / 项目
  contact: string | null;
  available_for_work: boolean | null;
  open_to_opportunity: "明确看机会" | "可能看机会" | "未表明" | "暂不看机会";
  current_project: string | null;

  // AI 提取的标签
  suggested_tags: string[];
}

// ---------- 扫描入参 ----------

export interface ScanParams {
  platform: Platform;
  position: string;
  jd: string;
  artStyles: string[];
  tools: string[];
  themes: string[];
  education: string;
  experience: string;
  region: string;
  weights?: ScoreWeights;
}

// 用户自带的 AI 服务配置
export type AiProtocol = "anthropic" | "openai-compatible";

export interface AiClientConfig {
  protocol?: AiProtocol;        // 协议；默认根据 model 推断
  baseURL?: string;             // 例如 https://llm-proxy.tapsvc.com
  apiKey?: string;
  model?: string;               // claude-sonnet-4-6 / gpt-4o 等
  visionEnabled?: boolean;      // 是否启用 AI 看图（默认 true）
  monthlyQuotaUSD?: number;     // 月度配额，默认 300
  gatewayDashboardUrl?: string; // 默认 https://console.tapsvc.com/nova/#/ai-gateway?tab=overview
  customPricing?: { [modelId: string]: { input: number; output: number } };
}

export const DEFAULT_GATEWAY_DASHBOARD_URL =
  "https://console.tapsvc.com/nova/#/ai-gateway?tab=overview";
export const DEFAULT_MONTHLY_QUOTA_USD = 300;
export const DEFAULT_BASE_URL_PLACEHOLDER = "https://llm-proxy.tapsvc.com";

// ---------- 岗位语义解析输出 ----------

export interface PositionBrief {
  understanding: string;
  key_skills: string[];
  artwork_features: string[];
  search_queries: string[];
}
