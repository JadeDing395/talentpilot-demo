#!/usr/bin/env tsx
/**
 * 一次性数据迁移脚本：把旧版候选人库迁移到 TalentPilot。
 *
 * 用法：
 *   npx tsx scripts/migrate-from-art.ts                     # dry-run，只看会做什么
 *   npx tsx scripts/migrate-from-art.ts --apply             # 实际写入
 *
 * 策略：
 *   1. 迁移前先把 TalentPilot 的 data/ 整目录备份到 data.backup-{timestamp}/
 *   2. 对 art 的每个 db.json / db-*.json，读出 candidates / stages / tags / notes / history
 *   3. 每条 candidate 强制 source='artstation'、profileUrl=portfolio、补齐其他扩展字段为 null
 *   4. 直接覆盖 TalentPilot 的同名文件（目标端是空模板，无冲突）
 */

import fs from "fs";
import path from "path";

const LEGACY_ART_PROJECT = ["art", "talent", "radar"].join("-");
const ART_DIR = process.env.ART_DATA_DIR ?? path.join("/Users/jade/Desktop", LEGACY_ART_PROJECT, "data");
const SOCIAL_DIR = process.env.SOCIAL_DATA_DIR ?? path.resolve(__dirname, "../data");
const APPLY = process.argv.includes("--apply");

interface Candidate {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  portfolio: string | null;
  skills: string[];
  available: boolean;
  source: string | null;
  stageId: number;
  tagIds: number[];
  rating: number;
  favorite: boolean;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  // 社交字段（迁移时补齐）
  platformUserId?: string | null;
  profileUrl?: string | null;
  followersCount?: number | null;
  postsCount?: number | null;
  ipLocation?: string | null;
  verified?: boolean;
  verifiedReason?: string | null;
}

interface DB {
  candidates: Candidate[];
  stages: unknown[];
  tags: unknown[];
  notes: unknown[];
  history: unknown[];
  nextId: { candidates: number; notes: number; history: number; tags?: number };
}

function log(...args: unknown[]) {
  console.log("[migrate]", ...args);
}

function backupSocial(): string | null {
  if (!fs.existsSync(SOCIAL_DIR)) {
    log(`social data dir 不存在，跳过备份: ${SOCIAL_DIR}`);
    return null;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = `${SOCIAL_DIR}.backup-${ts}`;
  log(`备份 ${SOCIAL_DIR} → ${backupDir}`);
  if (!APPLY) return backupDir;
  // 简单深拷贝目录（仅 JSON 文件，不会很大）
  fs.mkdirSync(backupDir, { recursive: true });
  for (const f of fs.readdirSync(SOCIAL_DIR)) {
    fs.copyFileSync(path.join(SOCIAL_DIR, f), path.join(backupDir, f));
  }
  return backupDir;
}

function migrateCandidate(c: Candidate): Candidate {
  // 是 ArtStation 候选人。portfolio 字段就是 ArtStation URL。
  // 从 URL 抽出 username 作为 platformUserId。
  let platformUserId: string | null = null;
  if (c.portfolio) {
    const m = c.portfolio.match(/artstation\.com\/([^/?#]+)/);
    if (m) platformUserId = m[1];
  }
  return {
    ...c,
    source: "artstation",
    platformUserId: platformUserId ?? c.platformUserId ?? null,
    profileUrl: c.portfolio ?? c.profileUrl ?? null,
    followersCount: c.followersCount ?? null,
    postsCount: c.postsCount ?? null,
    ipLocation: c.ipLocation ?? null,
    verified: c.verified ?? false,
    verifiedReason: c.verifiedReason ?? null,
  };
}

function migrateDB(art: DB): DB {
  return {
    ...art,
    candidates: art.candidates.map(migrateCandidate),
  };
}

function listArtDbFiles(): string[] {
  if (!fs.existsSync(ART_DIR)) {
    throw new Error(`art data dir not found: ${ART_DIR}`);
  }
  return fs
    .readdirSync(ART_DIR)
    .filter((f) => f.startsWith("db") && f.endsWith(".json") && !f.endsWith(".bak"));
}

function migrateOneFile(filename: string) {
  const artPath = path.join(ART_DIR, filename);
  const socialPath = path.join(SOCIAL_DIR, filename);

  const raw = fs.readFileSync(artPath, "utf-8");
  const artDb = JSON.parse(raw) as DB;
  const migratedDb = migrateDB(artDb);

  const summary = {
    file: filename,
    candidates: migratedDb.candidates.length,
    stages: migratedDb.stages.length,
    tags: migratedDb.tags.length,
    notes: migratedDb.notes.length,
    history: migratedDb.history.length,
    withPlatformUserId: migratedDb.candidates.filter((c) => c.platformUserId).length,
  };
  log(`  ${filename}:`, summary);

  if (APPLY) {
    if (!fs.existsSync(SOCIAL_DIR)) fs.mkdirSync(SOCIAL_DIR, { recursive: true });
    fs.writeFileSync(socialPath, JSON.stringify(migratedDb, null, 2), "utf-8");
    log(`  ✓ wrote ${socialPath}`);
  }
  return summary;
}

function main() {
  log(`mode = ${APPLY ? "APPLY (will write files)" : "DRY-RUN (use --apply to write)"}`);
  log(`ART_DIR = ${ART_DIR}`);
  log(`SOCIAL_DIR = ${SOCIAL_DIR}`);

  backupSocial();

  const files = listArtDbFiles();
  log(`art has ${files.length} db files: ${files.join(", ")}`);

  const summaries = files.map(migrateOneFile);
  const totalCandidates = summaries.reduce((s, x) => s + x.candidates, 0);
  log(`---`);
  log(`总共迁移 ${totalCandidates} 个候选人，分布 ${files.length} 个 user 文件`);

  if (!APPLY) {
    log(`这是 dry-run。确认无误后用 --apply 真正写入。`);
  } else {
    log(`✓ 迁移完成。下次启动 next dev，访问 /candidates 切到 ArtStation tab 应能看到候选人。`);
  }
}

main();
