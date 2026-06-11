"use client";

import { ReactNode } from "react";

interface Props {
  /** 当前进度值 */
  value: number;
  /** 满分 */
  max: number;
  /** 直径，px */
  size?: number;
  /** 描边粗细 */
  stroke?: number;
  /** 主色 */
  color?: string;
  /** 背景轨道色 */
  trackColor?: string;
  /** 中心内容（覆盖默认数字） */
  children?: ReactNode;
  /** 是否显示 shimmer 动效 */
  animated?: boolean;
}

/**
 * 环形进度组件 —— 用于扫描进度 / 命中率 / 权重分布
 */
export default function CircularProgress({
  value,
  max,
  size = 96,
  stroke = 8,
  color = "var(--color-brand)",
  trackColor = "var(--color-brand-bg)",
  children,
  animated = false,
}: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const offset = c * (1 - pct);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* 背景轨道 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {/* 进度弧 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        {/* 扫描动画头（小亮点跟着进度走，扫描中才显示） */}
        {animated && pct > 0 && pct < 1 && (
          <circle
            cx={size / 2 + r * Math.cos(2 * Math.PI * pct - Math.PI / 2)}
            cy={size / 2 + r * Math.sin(2 * Math.PI * pct - Math.PI / 2)}
            r={stroke / 2 + 1}
            fill={color}
            opacity={0.9}
            style={{ transform: `rotate(${pct * 360}deg)` }}
          >
            <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
      {/* 中心内容 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children ?? (
          <>
            <div className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>
              {Math.round(value)}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">/ {Math.round(max)}</div>
          </>
        )}
      </div>
    </div>
  );
}
