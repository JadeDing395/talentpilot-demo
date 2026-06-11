"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PLATFORM_LIST, PLATFORMS } from "@/lib/platforms";
import type { Platform } from "@/lib/types";
import { useRadarScan, ScanStatus } from "./RadarScanContext";
import SectionCard from "./SectionCard";

interface Props {
  selected: Platform[];
}

function statusLabel(s: ScanStatus | undefined): string {
  if (!s) return "未启动";
  if (s.type === "scanning") return "扫描中";
  if (s.type === "done") return "完成";
  if (s.type === "error") return "出错";
  return "待命";
}

function statusColor(s: ScanStatus | undefined): string {
  if (!s) return "#94a3b8";
  if (s.type === "scanning") return "#0ea5e9";
  if (s.type === "done") return "#10b981";
  if (s.type === "error") return "#f43f5e";
  return "#94a3b8";
}

export default function MultiPlatformProgressPanel({ selected }: Props) {
  const { statusByPlatform, stopScan } = useRadarScan();

  const idsToShow: Platform[] = [
    ...selected,
    ...PLATFORM_LIST.map((p) => p.id).filter((p) => !selected.includes(p) && statusByPlatform[p]),
  ];

  if (idsToShow.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <SectionCard title="扫描进度" subtitle="多平台并发执行 · 每行可单独停止">
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {idsToShow.map((id) => {
              const meta = PLATFORMS[id];
              const s = statusByPlatform[id];
              const total = s?.total ?? 0;
              const current = s?.current ?? 0;
              const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
              const isScanning = s?.type === "scanning";
              const sColor = statusColor(s);

              return (
                <motion.div
                  key={id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-center gap-4 p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors"
                >
                  {/* 平台徽章 */}
                  <span
                    className="inline-flex items-center gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg shrink-0 w-[112px]"
                    style={{ backgroundColor: meta.badge.bg, color: meta.badge.fg }}
                  >
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{
                        backgroundColor: meta.color.brand,
                        boxShadow: isScanning ? `0 0 0 3px ${meta.color.brand}30` : "none",
                      }}
                    />
                    {meta.label}
                  </span>

                  {/* 进度条 + 消息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: `linear-gradient(90deg, ${meta.color.brand} 0%, ${meta.color.brand}dd 100%)`,
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-500 tabular-nums w-16 text-right shrink-0 font-medium">
                        {s ? `${current}/${total || "?"}` : "—"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate" title={s?.message}>
                      {s?.message ?? "等待启动"}
                    </div>
                  </div>

                  {/* 状态徽章 + ✕ */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 tabular-nums"
                      style={{
                        color: sColor,
                        backgroundColor: `${sColor}12`,
                      }}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${isScanning ? "animate-pulse" : ""}`}
                        style={{ backgroundColor: sColor }}
                      />
                      {statusLabel(s)}
                      {typeof s?.kept === "number" && s.kept > 0 ? ` · 命中 ${s.kept}` : ""}
                    </span>
                    {isScanning && (
                      <button
                        type="button"
                        onClick={() => stopScan(id)}
                        className="text-[11px] w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 transition-colors"
                        title="停止该平台扫描"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </SectionCard>
    </motion.div>
  );
}
