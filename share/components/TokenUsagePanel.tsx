"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DEFAULT_GATEWAY_DASHBOARD_URL,
  DEFAULT_MONTHLY_QUOTA_USD,
  AiClientConfig,
} from "@/lib/scoring-config";
import { loadAiConfig } from "./AiSettingsModal";

interface Bucket {
  input: number;
  output: number;
  calls: number;
  usd: number;
}

interface UsageSnapshot {
  today: Bucket;
  currentMonth: Bucket;
  totals: Bucket;
  monthlyQuotaUSD: number;
  percentOfQuota: number;
  lastUpdated: string | null;
}

interface Props {
  /** 本次扫描的累加；保留入参以便后续展开使用 */
  currentRun?: { input: number; output: number; calls: number };
  /** 触发刷新的信号；每次 ++ 都拉一次 /api/usage */
  refreshSignal?: number;
}

function formatUSD(n: number): string {
  if (n < 0.01) return "$" + n.toFixed(4);
  return "$" + n.toFixed(2);
}

/**
 * 紧凑版"Gateway 用量胶囊"：单行展示 `Today $X/$Y · NN%` + 进度条 + tooltip。
 * 整体可点击，新窗口打开公司 AI Gateway dashboard。
 */
export default function TokenUsagePanel({ refreshSignal }: Props) {
  const [snap, setSnap] = useState<UsageSnapshot | null>(null);
  const [cfg, setCfg] = useState<AiClientConfig>({});

  const load = useCallback(async () => {
    const c = loadAiConfig();
    setCfg(c);
    const quota = c.monthlyQuotaUSD ?? DEFAULT_MONTHLY_QUOTA_USD;
    try {
      const res = await fetch(`/api/usage?quota=${quota}`, { cache: "no-store" });
      if (res.ok) setSnap(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  const dashboardUrl = cfg.gatewayDashboardUrl ?? DEFAULT_GATEWAY_DASHBOARD_URL;
  const quota = snap?.monthlyQuotaUSD ?? DEFAULT_MONTHLY_QUOTA_USD;
  const pct = snap?.percentOfQuota ?? 0;
  const barColor = pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <a
      href={dashboardUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="打开浏览器查看完整用量看板"
      className="inline-flex flex-col items-stretch gap-1 px-3 py-2 rounded-full border border-zinc-200 bg-white/70 hover:bg-white hover:border-slate-400 hover:shadow-sm transition group min-w-[180px]"
    >
      <div className="flex items-center justify-between gap-3 text-xs tabnum">
        <span className="text-slate-700">
          <span className="text-slate-500">Today </span>
          <span className="font-semibold">
            {snap ? formatUSD(snap.currentMonth.usd) : "$0"}
          </span>
          <span className="text-slate-400">/{formatUSD(quota)}</span>
        </span>
        <span className="text-slate-500 group-hover:text-slate-900">
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-500`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </a>
  );
}
