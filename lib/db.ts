import fs from "fs";
import path from "path";
import type { Candidate, Stage, Tag, Note, HistoryEntry } from "./types";
import type { OutreachDraft } from "./outreach";

const DATA_DIR = path.join(process.cwd(), "data");

function isMultiUserMode(): boolean {
  const flag = process.env.RADAR_MULTI_USER;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production";
}

function dbPathFor(userId: string): string {
  if (!isMultiUserMode()) {
    return path.join(DATA_DIR, "db.json");
  }
  const safe = /^[A-Za-z0-9_-]+$/.test(userId) ? userId : "default";
  return path.join(DATA_DIR, `db-${safe}.json`);
}

function emptyDB(): DB {
  return {
    candidates: [],
    stages: [
      { id: 1, name: "待初筛", order: 1, color: "#94a3b8" },
      { id: 2, name: "初筛通过", order: 2, color: "#3b82f6" },
      { id: 3, name: "面试中", order: 3, color: "#f59e0b" },
      { id: 4, name: "offer", order: 4, color: "#8b5cf6" },
      { id: 5, name: "已录用", order: 5, color: "#22c55e" },
      { id: 6, name: "已拒绝", order: 6, color: "#ef4444" },
    ],
    tags: [],
    notes: [],
    history: [],
    outreach: [],
    nextId: { candidates: 1, notes: 1, history: 1, tags: 1 },
  };
}

export type { Candidate, Stage, Tag, Note, HistoryEntry } from "./types";

export interface DB {
  candidates: Candidate[];
  stages: Stage[];
  tags: Tag[];
  notes: Note[];
  history: HistoryEntry[];
  outreach: OutreachDraft[];
  nextId: { candidates: number; notes: number; history: number; tags?: number };
}

function migrateCandidate(c: Partial<Candidate> & { id: number }): Candidate {
  return {
    id: c.id,
    name: c.name ?? "",
    email: c.email ?? null,
    phone: c.phone ?? null,
    location: c.location ?? null,
    portfolio: c.portfolio ?? null,
    skills: Array.isArray(c.skills) ? c.skills : [],
    available: c.available ?? false,
    source: (c.source as Candidate["source"]) ?? null,
    stageId: c.stageId ?? 1,
    tagIds: Array.isArray(c.tagIds) ? c.tagIds : [],
    rating: c.rating ?? 0,
    favorite: c.favorite ?? false,
    avatarUrl: c.avatarUrl ?? null,
    createdAt: c.createdAt ?? new Date().toISOString(),
    updatedAt: c.updatedAt ?? new Date().toISOString(),
    platformUserId: c.platformUserId ?? null,
    profileUrl: c.profileUrl ?? c.portfolio ?? null,
    followersCount: c.followersCount ?? null,
    postsCount: c.postsCount ?? null,
    ipLocation: c.ipLocation ?? null,
    verified: c.verified ?? false,
    verifiedReason: c.verifiedReason ?? null,
  };
}

export function readDB(userId: string = "default"): DB {
  const p = dbPathFor(userId);
  if (!fs.existsSync(p)) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const empty = emptyDB();
    fs.writeFileSync(p, JSON.stringify(empty, null, 2), "utf-8");
    return empty;
  }
  const raw = fs.readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw) as DB;
  // 对老数据做字段补全
  parsed.candidates = (parsed.candidates ?? []).map(migrateCandidate);
  parsed.outreach = parsed.outreach ?? [];
  if (!parsed.nextId) {
    parsed.nextId = { candidates: 1, notes: 1, history: 1, tags: 1 };
  }
  return parsed;
}

export function writeDB(db: DB, userId: string = "default"): void {
  const p = dbPathFor(userId);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(db, null, 2), "utf-8");
}

const TAG_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#34d399", "#fbbf24",
  "#f87171", "#94a3b8", "#fb923c", "#22d3ee", "#84cc16",
  "#ec4899", "#8b5cf6", "#3b82f6", "#10b981", "#eab308",
];

export function getOrCreateTagId(db: DB, name: string): number {
  const trimmed = name.trim();
  if (!trimmed) return 0;
  const existing = db.tags.find((t) => t.name === trimmed);
  if (existing) return existing.id;

  if (!db.nextId.tags) {
    db.nextId.tags = (db.tags.reduce((m, t) => Math.max(m, t.id), 0) || 0) + 1;
  }
  const id = db.nextId.tags++;
  const color = TAG_COLORS[id % TAG_COLORS.length];
  db.tags.push({ id, name: trimmed, color });
  return id;
}

export function addHistory(
  db: DB,
  candidateId: number,
  action: string,
  detail: string,
  operator: string = "HR"
) {
  const entry: HistoryEntry = {
    id: db.nextId.history++,
    candidateId,
    action,
    detail,
    operator,
    createdAt: new Date().toISOString(),
  };
  db.history.push(entry);
  return entry;
}

/** 按 (source, platformUserId) 查找现有候选人，用于扫描入库去重 */
export function findBySocialId(
  db: DB,
  source: Candidate["source"],
  platformUserId: string,
): Candidate | undefined {
  if (!source || !platformUserId) return undefined;
  return db.candidates.find(
    (c) => c.source === source && c.platformUserId === platformUserId,
  );
}

export function listOutreach(userId: string = "default"): OutreachDraft[] {
  const db = readDB(userId);
  return [...db.outreach].sort((a, b) => {
    const at = a.sentAt ?? a.createdAt;
    const bt = b.sentAt ?? b.createdAt;
    return bt.localeCompare(at);
  });
}

export function upsertOutreach(userId: string, draft: OutreachDraft): OutreachDraft {
  const db = readDB(userId);
  const idx = db.outreach.findIndex((item) => item.candidateId === draft.candidateId);
  if (idx >= 0) {
    const existing = db.outreach[idx];
    const lockedStatus = existing.status === "sent" || existing.status === "unsubscribed";
    db.outreach[idx] = lockedStatus && draft.status === "draft"
      ? {
          ...existing,
          message: draft.message,
          createdAt: draft.createdAt,
        }
      : { ...existing, ...draft };
  } else {
    db.outreach.push(draft);
  }
  writeDB(db, userId);
  return idx >= 0 ? db.outreach[idx] : draft;
}

export function markSent(userId: string, candidateId: string): OutreachDraft | null {
  const db = readDB(userId);
  const idx = db.outreach.findIndex((item) => item.candidateId === candidateId);
  if (idx < 0) return null;
  db.outreach[idx] = {
    ...db.outreach[idx],
    status: "sent",
    sentAt: new Date().toISOString(),
  };
  writeDB(db, userId);
  return db.outreach[idx];
}

export function markUnsubscribed(userId: string, candidateId: string): OutreachDraft | null {
  const db = readDB(userId);
  const idx = db.outreach.findIndex((item) => item.candidateId === candidateId);
  if (idx < 0) return null;
  db.outreach[idx] = {
    ...db.outreach[idx],
    status: "unsubscribed",
  };
  writeDB(db, userId);
  return db.outreach[idx];
}
