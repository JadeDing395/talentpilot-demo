import fs from "fs";
import path from "path";
import { estimateUSD, ModelPricing } from "./pricing";

const DATA_DIR = path.join(process.cwd(), "data");

export interface UsageBucket {
  input: number;
  output: number;
  calls: number;
  usd: number;
}

export interface UsageLog {
  totals: UsageBucket;
  byDay: { [yyyy_mm_dd: string]: UsageBucket };
  byMonth: { [yyyy_mm: string]: UsageBucket };
  byModel: { [modelId: string]: UsageBucket };
  lastUpdated: string | null;
}

function usagePathFor(userId: string): string {
  const safe = /^[A-Za-z0-9_-]+$/.test(userId) ? userId : "default";
  return path.join(DATA_DIR, `usage-${safe}.json`);
}

function emptyBucket(): UsageBucket {
  return { input: 0, output: 0, calls: 0, usd: 0 };
}

function emptyLog(): UsageLog {
  return {
    totals: emptyBucket(),
    byDay: {},
    byMonth: {},
    byModel: {},
    lastUpdated: null,
  };
}

export function readUsage(userId: string = "default"): UsageLog {
  const p = usagePathFor(userId);
  if (!fs.existsSync(p)) return emptyLog();
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const log = JSON.parse(raw) as UsageLog;
    return {
      totals: log.totals ?? emptyBucket(),
      byDay: log.byDay ?? {},
      byMonth: log.byMonth ?? {},
      byModel: log.byModel ?? {},
      lastUpdated: log.lastUpdated ?? null,
    };
  } catch {
    return emptyLog();
  }
}

function writeUsage(userId: string, log: UsageLog): void {
  const p = usagePathFor(userId);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(log, null, 2), "utf-8");
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function add(bucket: UsageBucket, delta: { input: number; output: number; usd: number }) {
  bucket.input += delta.input;
  bucket.output += delta.output;
  bucket.calls += 1;
  bucket.usd += delta.usd;
}

export interface UsageDelta {
  model: string;
  input: number;
  output: number;
  usd: number;
}

/** 累加一次 API 调用的 token 用量并落盘 */
export function recordUsage(
  userId: string,
  model: string,
  input: number,
  output: number,
  customPricing?: { [modelId: string]: ModelPricing },
): UsageDelta {
  const usd = estimateUSD(model, input, output, customPricing);
  const delta = { input, output, usd };

  const log = readUsage(userId);
  const day = todayKey();
  const mon = monthKey();
  if (!log.byDay[day]) log.byDay[day] = emptyBucket();
  if (!log.byMonth[mon]) log.byMonth[mon] = emptyBucket();
  if (!log.byModel[model]) log.byModel[model] = emptyBucket();

  add(log.totals, delta);
  add(log.byDay[day], delta);
  add(log.byMonth[mon], delta);
  add(log.byModel[model], delta);
  log.lastUpdated = new Date().toISOString();

  writeUsage(userId, log);
  return { model, input, output, usd };
}

export interface UsageSnapshot {
  today: UsageBucket;
  currentMonth: UsageBucket;
  totals: UsageBucket;
  byModel: { [modelId: string]: UsageBucket };
  todayKey: string;
  monthKey: string;
  lastUpdated: string | null;
}

export function getUsageSnapshot(userId: string = "default"): UsageSnapshot {
  const log = readUsage(userId);
  const today = log.byDay[todayKey()] ?? emptyBucket();
  const currentMonth = log.byMonth[monthKey()] ?? emptyBucket();
  return {
    today,
    currentMonth,
    totals: log.totals,
    byModel: log.byModel,
    todayKey: todayKey(),
    monthKey: monthKey(),
    lastUpdated: log.lastUpdated,
  };
}
