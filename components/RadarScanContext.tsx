"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import {
  RadarResult,
  PositionBrief,
  ScoreWeights,
  AiClientConfig,
} from "@/lib/scoring-config";
import type { Platform } from "@/lib/types";
import type { ICP, ICPInput } from "@/lib/icp-shared";
import { PLATFORM_LIST } from "@/lib/platforms";

export interface ScanStatus {
  type: "idle" | "scanning" | "done" | "error";
  message: string;
  current: number;
  total: number;
  target?: number;
  kept?: number;
  filteredRegion?: number;
  filteredScore?: number;
  errored?: number;
}

export interface ScanFormSnapshot {
  position: string;
  jd: string;
  artStyles: string[];
  tools: string[];
  themes: string[];
  education: string;
  experience: string;
  region: string;
  minScore: number;
  targetCount: number;
  rescanIntervalDays: number;
}

export interface UsageRunSnapshot {
  input: number;
  output: number;
  calls: number;
}

type ByPlatform<T> = Partial<Record<Platform, T>>;

interface StartScanArgs {
  platforms: Platform[];
  form: ScanFormSnapshot;
  weights: ScoreWeights;
  aiConfig: AiClientConfig;
}

interface IcpGenerationState {
  loading: boolean;
  error: string;
  icp: ICP | null;
  input?: ICPInput;
  completedAt?: number;
}

interface RadarScanContextValue {
  /** 每个平台独立的扫描状态;未启动过的平台为 undefined */
  statusByPlatform: ByPlatform<ScanStatus>;
  resultsByPlatform: ByPlatform<RadarResult[]>;
  reviewedByPlatform: ByPlatform<RadarResult[]>;
  briefByPlatform: ByPlatform<PositionBrief | null>;
  usageByPlatform: ByPlatform<UsageRunSnapshot>;

  /** 派生:所有平台的合并结果按 total_score desc */
  mergedResults: RadarResult[];
  mergedReviewed: RadarResult[];
  isAnyScanning: boolean;
  activePlatforms: Platform[];
  /** 当前 run 累计 usage(并发模式下是三个平台的总和) */
  totalRunUsage: UsageRunSnapshot;
  usageRefreshSignal: number;
  /** 各平台合计目标 / 已分析 / 已命中 — 给顶部进度胶囊用 */
  totalProgress: { kept: number; analyzed: number; target: number };
  /** ICP 反推跨页面状态;请求由根 Provider 承载,避免切页丢结果 */
  icpGeneration: IcpGenerationState;

  startScan: (args: StartScanArgs) => Promise<void>;
  /** 不传 = 停所有正在跑的平台;传 platform = 只停这一个 */
  stopScan: (platform?: Platform) => void;
  resetScan: () => void;
  startIcpGeneration: (input: ICPInput, aiConfig: AiClientConfig) => Promise<void>;
  clearIcpGeneration: () => void;
}

const RadarScanContext = createContext<RadarScanContextValue | null>(null);

const INITIAL_STATUS: ScanStatus = { type: "idle", message: "", current: 0, total: 0 };
const INITIAL_USAGE: UsageRunSnapshot = { input: 0, output: 0, calls: 0 };
const INITIAL_ICP_GENERATION: IcpGenerationState = { loading: false, error: "", icp: null };
const PERSIST_KEY = "radar-scan-snapshot-v2";

interface PersistShape {
  statusByPlatform: ByPlatform<ScanStatus>;
  resultsByPlatform: ByPlatform<RadarResult[]>;
  reviewedByPlatform: ByPlatform<RadarResult[]>;
  briefByPlatform: ByPlatform<PositionBrief | null>;
  usageByPlatform: ByPlatform<UsageRunSnapshot>;
}

function loadPersisted(): Partial<PersistShape> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Partial<PersistShape>;
    // 对仍在 "scanning" 的平台降级为 idle —— 页面刷新打断了
    if (data.statusByPlatform) {
      for (const p of Object.keys(data.statusByPlatform) as Platform[]) {
        const s = data.statusByPlatform[p];
        if (s?.type === "scanning") {
          data.statusByPlatform[p] = { ...s, type: "idle", message: "上次扫描在刷新页面时被中断（已保留结果）" };
        }
      }
    }
    return data;
  } catch {
    return {};
  }
}

export function RadarScanProvider({ children }: { children: ReactNode }) {
  // SSR 阶段一律走默认空状态;hydrate 后再从 sessionStorage 恢复
  const [statusByPlatform, setStatusByPlatform] = useState<ByPlatform<ScanStatus>>({});
  const [resultsByPlatform, setResultsByPlatform] = useState<ByPlatform<RadarResult[]>>({});
  const [reviewedByPlatform, setReviewedByPlatform] = useState<ByPlatform<RadarResult[]>>({});
  const [briefByPlatform, setBriefByPlatform] = useState<ByPlatform<PositionBrief | null>>({});
  const [usageByPlatform, setUsageByPlatform] = useState<ByPlatform<UsageRunSnapshot>>({});
  const [usageRefreshSignal, setUsageRefreshSignal] = useState(0);
  const [icpGeneration, setIcpGeneration] = useState<IcpGenerationState>(INITIAL_ICP_GENERATION);
  const [hydrated, setHydrated] = useState(false);
  const abortRefByPlatform = useRef<Partial<Record<Platform, AbortController>>>({});
  const icpGenerationRunRef = useRef<Promise<void> | null>(null);

  // Mount 后从 sessionStorage 恢复
  useEffect(() => {
    const persisted = loadPersisted();
    if (persisted.statusByPlatform) setStatusByPlatform(persisted.statusByPlatform);
    if (persisted.resultsByPlatform) setResultsByPlatform(persisted.resultsByPlatform);
    if (persisted.reviewedByPlatform) setReviewedByPlatform(persisted.reviewedByPlatform);
    if (persisted.briefByPlatform) setBriefByPlatform(persisted.briefByPlatform);
    if (persisted.usageByPlatform) setUsageByPlatform(persisted.usageByPlatform);
    setHydrated(true);
  }, []);

  // 持久化（hydrated 完成前不写,避免覆盖真实快照）
  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;
    try {
      const snapshot: PersistShape = {
        statusByPlatform,
        resultsByPlatform,
        reviewedByPlatform,
        briefByPlatform,
        usageByPlatform,
      };
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify(snapshot));
    } catch {
      // 静默丢弃
    }
  }, [hydrated, statusByPlatform, resultsByPlatform, reviewedByPlatform, briefByPlatform, usageByPlatform]);

  // 派生量
  const mergedResults = useMemo(() => {
    const all: RadarResult[] = [];
    for (const p of PLATFORM_LIST) {
      const arr = resultsByPlatform[p.id];
      if (arr) all.push(...arr);
    }
    return all.sort((a, b) => b.total_score - a.total_score);
  }, [resultsByPlatform]);

  const mergedReviewed = useMemo(() => {
    const all: RadarResult[] = [];
    for (const p of PLATFORM_LIST) {
      const arr = reviewedByPlatform[p.id];
      if (arr) all.push(...arr);
    }
    return all.sort((a, b) => b.total_score - a.total_score);
  }, [reviewedByPlatform]);

  const isAnyScanning = useMemo(
    () => PLATFORM_LIST.some((p) => statusByPlatform[p.id]?.type === "scanning"),
    [statusByPlatform],
  );

  const activePlatforms = useMemo(
    () => PLATFORM_LIST.filter((p) => statusByPlatform[p.id]?.type === "scanning").map((p) => p.id),
    [statusByPlatform],
  );

  const totalRunUsage = useMemo<UsageRunSnapshot>(() => {
    let input = 0, output = 0, calls = 0;
    for (const p of PLATFORM_LIST) {
      const u = usageByPlatform[p.id];
      if (!u) continue;
      input += u.input;
      output += u.output;
      calls += u.calls;
    }
    return { input, output, calls };
  }, [usageByPlatform]);

  const totalProgress = useMemo(() => {
    let kept = 0, analyzed = 0, target = 0;
    for (const p of PLATFORM_LIST) {
      const s = statusByPlatform[p.id];
      if (!s) continue;
      kept += s.kept ?? 0;
      analyzed += s.current ?? 0;
      target += s.target ?? 0;
    }
    return { kept, analyzed, target };
  }, [statusByPlatform]);

  const stopScan = useCallback((platform?: Platform) => {
    if (platform) {
      const ctrl = abortRefByPlatform.current[platform];
      if (ctrl) {
        ctrl.abort();
        delete abortRefByPlatform.current[platform];
      }
      setStatusByPlatform((prev) => ({
        ...prev,
        [platform]: { ...(prev[platform] ?? INITIAL_STATUS), type: "idle", message: "已取消" },
      }));
    } else {
      for (const p of PLATFORM_LIST) {
        const ctrl = abortRefByPlatform.current[p.id];
        if (ctrl) {
          ctrl.abort();
          delete abortRefByPlatform.current[p.id];
        }
      }
      setStatusByPlatform((prev) => {
        const next = { ...prev };
        for (const p of PLATFORM_LIST) {
          if (next[p.id]?.type === "scanning") {
            next[p.id] = { ...next[p.id]!, type: "idle", message: "已取消" };
          }
        }
        return next;
      });
    }
  }, []);

  const resetScan = useCallback(() => {
    stopScan();
    setStatusByPlatform({});
    setResultsByPlatform({});
    setReviewedByPlatform({});
    setBriefByPlatform({});
    setUsageByPlatform({});
    if (typeof window !== "undefined") {
      try { sessionStorage.removeItem(PERSIST_KEY); } catch { /* ignore */ }
    }
  }, [stopScan]);

  const startIcpGeneration = useCallback((input: ICPInput, aiConfig: AiClientConfig) => {
    if (icpGenerationRunRef.current) return icpGenerationRunRef.current;

    const task = (async () => {
      setIcpGeneration({ loading: true, error: "", icp: null, input });

      try {
        const res = await fetch("/api/icp/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, aiConfig }),
        });
        const data = await res.json();
        if (!res.ok || !data.icp) {
          throw new Error(data.error || "ICP 生成失败");
        }
        setIcpGeneration({
          loading: false,
          error: "",
          icp: data.icp as ICP,
          input,
          completedAt: Date.now(),
        });
      } catch (err) {
        setIcpGeneration({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          icp: null,
          input,
        });
      } finally {
        icpGenerationRunRef.current = null;
      }
    })();

    icpGenerationRunRef.current = task;
    return task;
  }, []);

  const clearIcpGeneration = useCallback(() => {
    setIcpGeneration(INITIAL_ICP_GENERATION);
  }, []);

  /** 跑单个平台的扫描流;复用旧的 NDJSON 解析,把所有 setX 改成函数式更新对应槽 */
  const runOnePlatform = useCallback(
    async (
      platform: Platform,
      form: ScanFormSnapshot,
      weights: ScoreWeights,
      aiConfig: AiClientConfig,
      controller: AbortController,
    ) => {
      const apiPath =
        platform === "weibo"
          ? "/api/weibo/scan"
          : platform === "xiaohongshu"
          ? "/api/xhs/scan"
          : "/api/artstation/scan";

      try {
        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            platform,
            weights,
            aiConfig,
            rescanIntervalDays: form.rescanIntervalDays,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          setStatusByPlatform((prev) => ({
            ...prev,
            [platform]: { type: "error", message: txt || "请求失败，请重试", current: 0, total: 0 },
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.type === "status") {
                setStatusByPlatform((prev) => ({
                  ...prev,
                  [platform]: {
                    ...(prev[platform] ?? INITIAL_STATUS),
                    type: "scanning",
                    message: msg.message,
                    total: msg.total ?? prev[platform]?.total ?? 0,
                  },
                }));
              } else if (msg.type === "position_brief") {
                setBriefByPlatform((prev) => ({ ...prev, [platform]: msg.brief as PositionBrief }));
              } else if (msg.type === "login_required") {
                setStatusByPlatform((prev) => ({
                  ...prev,
                  [platform]: {
                    type: "error",
                    message: "需要先登录平台 — 请在扫描页顶部扫码登录后重试",
                    current: 0,
                    total: 0,
                  },
                }));
              } else if (msg.type === "progress") {
                setStatusByPlatform((prev) => ({
                  ...prev,
                  [platform]: {
                    ...(prev[platform] ?? INITIAL_STATUS),
                    type: "scanning",
                    message: prev[platform]?.message ?? "",
                    current: msg.current,
                    total: msg.total,
                    kept: msg.kept,
                    filteredRegion: msg.filteredRegion,
                    filteredScore: msg.filteredScore,
                  },
                }));
              } else if (msg.type === "result") {
                const r = msg.data as RadarResult;
                const passed = r.passed !== false;
                if (passed) {
                  setResultsByPlatform((prev) => ({
                    ...prev,
                    [platform]: [...(prev[platform] ?? []), r],
                  }));
                } else {
                  setReviewedByPlatform((prev) => ({
                    ...prev,
                    [platform]: [...(prev[platform] ?? []), r],
                  }));
                }
              } else if (msg.type === "usage_delta") {
                setUsageByPlatform((prev) => {
                  const cur = prev[platform] ?? INITIAL_USAGE;
                  return {
                    ...prev,
                    [platform]: {
                      input: cur.input + (msg.input ?? 0),
                      output: cur.output + (msg.output ?? 0),
                      calls: cur.calls + 1,
                    },
                  };
                });
                setUsageRefreshSignal((n) => n + 1);
              } else if (msg.type === "done") {
                const parts = [
                  `抓取 ${msg.fetched ?? msg.total ?? 0} 人`,
                  `跳过已入库 ${msg.skippedExisting ?? 0}`,
                  `分析 ${msg.analyzed ?? 0} 人`,
                  `非中国区域 ${msg.filteredRegion ?? 0}`,
                  `评分 < ${msg.minScore ?? "?"}：${msg.filteredScore ?? 0}`,
                  `命中 ${msg.kept ?? 0} / 目标 ${msg.target ?? "—"}`,
                ];
                setStatusByPlatform((prev) => {
                  const cur = prev[platform] ?? INITIAL_STATUS;
                  if (cur.type === "error") return prev;
                  return {
                    ...prev,
                    [platform]: {
                      type: "done",
                      message: `扫描完成 · ${parts.join(" · ")}`,
                      current: msg.analyzed,
                      total: msg.total ?? cur.total,
                      target: msg.target,
                      kept: msg.kept,
                      filteredRegion: msg.filteredRegion,
                      filteredScore: msg.filteredScore,
                    },
                  };
                });
                setUsageRefreshSignal((n) => n + 1);
              } else if (msg.type === "error") {
                setStatusByPlatform((prev) => ({
                  ...prev,
                  [platform]: { type: "error", message: msg.message, current: 0, total: 0 },
                }));
              }
            } catch {
              // skip malformed line
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setStatusByPlatform((prev) => ({
            ...prev,
            [platform]: { type: "error", message: String(err), current: 0, total: 0 },
          }));
        }
      } finally {
        if (abortRefByPlatform.current[platform] === controller) {
          delete abortRefByPlatform.current[platform];
        }
      }
    },
    [],
  );

  const startScan = useCallback(
    async ({ platforms, form, weights, aiConfig }: StartScanArgs) => {
      if (platforms.length === 0) return;

      // 先中止当前任何正在跑的同平台
      for (const p of platforms) {
        const existing = abortRefByPlatform.current[p];
        if (existing) {
          existing.abort();
          delete abortRefByPlatform.current[p];
        }
      }

      // 清掉这些平台的旧结果 + 初始化 status / usage
      setResultsByPlatform((prev) => {
        const next = { ...prev };
        for (const p of platforms) next[p] = [];
        return next;
      });
      setReviewedByPlatform((prev) => {
        const next = { ...prev };
        for (const p of platforms) next[p] = [];
        return next;
      });
      setBriefByPlatform((prev) => {
        const next = { ...prev };
        for (const p of platforms) next[p] = null;
        return next;
      });
      setUsageByPlatform((prev) => {
        const next = { ...prev };
        for (const p of platforms) next[p] = { ...INITIAL_USAGE };
        return next;
      });
      setStatusByPlatform((prev) => {
        const next = { ...prev };
        for (const p of platforms) {
          next[p] = {
            type: "scanning",
            message: "正在初始化扫描...",
            current: 0,
            total: 0,
            target: form.targetCount,
          };
        }
        return next;
      });

      // 给每个平台分配 AbortController 并并发跑
      const tasks = platforms.map((p) => {
        const ctrl = new AbortController();
        abortRefByPlatform.current[p] = ctrl;
        return runOnePlatform(p, form, weights, aiConfig, ctrl);
      });

      await Promise.allSettled(tasks);
    },
    [runOnePlatform],
  );

  return (
    <RadarScanContext.Provider
      value={{
        statusByPlatform,
        resultsByPlatform,
        reviewedByPlatform,
        briefByPlatform,
        usageByPlatform,
        mergedResults,
        mergedReviewed,
        isAnyScanning,
        activePlatforms,
        totalRunUsage,
        usageRefreshSignal,
        totalProgress,
        icpGeneration,
        startScan,
        stopScan,
        resetScan,
        startIcpGeneration,
        clearIcpGeneration,
      }}
    >
      {children}
    </RadarScanContext.Provider>
  );
}

export function useRadarScan(): RadarScanContextValue {
  const ctx = useContext(RadarScanContext);
  if (!ctx) throw new Error("useRadarScan must be used inside RadarScanProvider");
  return ctx;
}
