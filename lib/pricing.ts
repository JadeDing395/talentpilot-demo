/**
 * 常见模型 USD 计费单价（每 1M token）。
 * 用于把扫描中累加的 token 数估算成 USD，喂给 TokenUsagePanel。
 * 价格 = 公开官网价（2026-05 时点），gateway 自定义计费时由用户在 AiSettingsModal 里覆盖。
 */

export interface ModelPricing {
  input: number;  // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

export const MODEL_PRICING: { [modelId: string]: ModelPricing } = {
  // Anthropic Claude 4.x（按 Anthropic 公开价格表）
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-opus-4-5": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },

  // OpenAI（按 OpenAI 公开价格表，2026-05 时点近似）
  "gpt-5": { input: 5, output: 20 },
  "gpt-4.1": { input: 3, output: 12 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "o3": { input: 10, output: 40 },
  "o3-mini": { input: 1.1, output: 4.4 },
};

/** 未知模型时的兜底价（Claude Sonnet 量级） */
const FALLBACK_PRICING: ModelPricing = { input: 3, output: 15 };

export function getPricing(
  modelId: string,
  override?: { [modelId: string]: ModelPricing },
): ModelPricing {
  if (override && override[modelId]) return override[modelId];
  return MODEL_PRICING[modelId] ?? FALLBACK_PRICING;
}

/** 按 token 数 + 单价折算 USD */
export function estimateUSD(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  override?: { [modelId: string]: ModelPricing },
): number {
  const p = getPricing(modelId, override);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
