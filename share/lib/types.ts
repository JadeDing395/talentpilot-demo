export type Platform = "weibo" | "xiaohongshu" | "artstation";

export type CandidateSource = Platform | "manual" | null;

export interface Candidate {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  portfolio: string | null;
  skills: string[];
  available: boolean;
  source: CandidateSource;
  stageId: number;
  tagIds: number[];
  rating: number;
  favorite: boolean;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;

  // 社交平台候选人扩展字段
  platformUserId: string | null;
  profileUrl: string | null;
  followersCount: number | null;
  postsCount: number | null;
  ipLocation: string | null;
  verified: boolean;
  verifiedReason: string | null;
}

export interface Stage {
  id: number;
  name: string;
  order: number;
  color: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Note {
  id: number;
  candidateId: number;
  content: string;
  author: string;
  createdAt: string;
}

export interface HistoryEntry {
  id: number;
  candidateId: number;
  action: string;
  detail: string;
  operator: string;
  createdAt: string;
}
