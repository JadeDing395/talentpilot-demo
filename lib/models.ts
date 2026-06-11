/**
 * 模型列表与协议推断。
 * 前后端共用，不要引入服务端依赖。
 */

import type { AiProtocol } from "./scoring-config";

export interface ModelOption {
  id: string;
  label: string;
  vendor: "anthropic" | "openai";
  defaultProtocol: AiProtocol;
  vision: boolean; // 是否支持 vision（多模态）
}

export const MODEL_OPTIONS: ModelOption[] = [
  // Claude 4.x 系列
  { id: "claude-opus-4-7", label: "Claude Opus 4.7（最强 / 贵）", vendor: "anthropic", defaultProtocol: "anthropic", vision: true },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6（推荐 / 性价比高）", vendor: "anthropic", defaultProtocol: "anthropic", vision: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5（最快 / 便宜）", vendor: "anthropic", defaultProtocol: "anthropic", vision: true },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5", vendor: "anthropic", defaultProtocol: "anthropic", vision: true },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", vendor: "anthropic", defaultProtocol: "anthropic", vision: true },

  // OpenAI 系列
  { id: "gpt-5", label: "GPT-5", vendor: "openai", defaultProtocol: "openai-compatible", vision: true },
  { id: "gpt-4.1", label: "GPT-4.1", vendor: "openai", defaultProtocol: "openai-compatible", vision: true },
  { id: "gpt-4o", label: "GPT-4o", vendor: "openai", defaultProtocol: "openai-compatible", vision: true },
  { id: "gpt-4o-mini", label: "GPT-4o mini（便宜）", vendor: "openai", defaultProtocol: "openai-compatible", vision: true },
  { id: "o3", label: "OpenAI o3", vendor: "openai", defaultProtocol: "openai-compatible", vision: false },
  { id: "o3-mini", label: "OpenAI o3-mini", vendor: "openai", defaultProtocol: "openai-compatible", vision: false },
];

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

/** 按 model id 推断协议；未知模型默认 openai-compatible（gateway 通用） */
export function inferProtocol(model: string | undefined): AiProtocol {
  if (!model) return "anthropic";
  const found = MODEL_OPTIONS.find((m) => m.id === model);
  if (found) return found.defaultProtocol;
  if (/^claude/i.test(model)) return "anthropic";
  return "openai-compatible";
}

export function getModelOption(model: string | undefined): ModelOption | undefined {
  if (!model) return undefined;
  return MODEL_OPTIONS.find((m) => m.id === model);
}

export function supportsVision(model: string | undefined): boolean {
  const opt = getModelOption(model);
  if (opt) return opt.vision;
  // 未知模型默认认为支持 vision
  return true;
}
