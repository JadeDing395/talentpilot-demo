import type { ScoreWeights } from "./scoring-config";

export interface ICPInput {
  companyUrl?: string;
  careerPageUrl?: string;
  briefSentence?: string;
  successResumes?: string[];
  topPerformerLinks?: string[];
}

export const EDUCATION_OPTIONS = [
  "不限",
  "大专及以上",
  "本科及以上",
  "硕士及以上",
  "博士",
] as const;

export type EducationOption = typeof EDUCATION_OPTIONS[number];
export const DEFAULT_EDUCATION: EducationOption = "不限";

export interface ICP {
  position: string;
  jd: string;
  keywords: string[];
  education?: string;
  experience?: string;
  weights: ScoreWeights;
  personaTraits: string[];
  competitorTargeting: string[];
  companyInsight: string;
  channelStrategy: {
    artstation?: string[];
    weibo?: string[];
    xiaohongshu?: string[];
  };
  sourceInputs: ICPInput;
  reasoning: string;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeEducation(value: unknown): EducationOption {
  const text = normalizeText(value);
  if (!text) return DEFAULT_EDUCATION;
  return (EDUCATION_OPTIONS as readonly string[]).includes(text)
    ? (text as EducationOption)
    : DEFAULT_EDUCATION;
}
