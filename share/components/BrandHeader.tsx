"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useRadarScan } from "@/components/RadarScanContext";
import { PLATFORMS } from "@/lib/platforms";

interface Props {
  actions?: ReactNode;
}

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/scan", label: "扫描" },
  { href: "/candidates", label: "候选人库" },
  { href: "/insights", label: "数据洞察" },
];

export default function BrandHeader({ actions }: Props) {
  const pathname = usePathname();
  const { isAnyScanning: isScanning, activePlatforms, totalProgress } = useRadarScan();
  // logo / 装饰 / active 下划线 都跟随 body data-platform 的 --color-brand CSS 变量
  const accentColor = "var(--color-brand)";
  const firstActive = activePlatforms[0];

  return (
    <header className="sticky top-0 z-30 bg-[#fafafa]/85 backdrop-blur-xl border-b border-zinc-200/60">
      <div className="px-6 h-16 flex items-center gap-6 max-w-[1400px] mx-auto">
        {/* Logo + Wordmark */}
        <Link href="/scan" className="flex items-center gap-2.5 group">
          <BrandMark spinning={isScanning} color={accentColor} />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-[#18181b]">
              TalentPilot
            </div>
            <div className="text-[11px] text-[#71717a]">
              {isScanning ? (
                <span style={{ color: firstActive ? PLATFORMS[firstActive].color.brand : accentColor }}>
                  ● 扫描中
                  {activePlatforms.length > 1
                    ? `（${activePlatforms.length} 个平台并发）`
                    : firstActive
                    ? `（${PLATFORMS[firstActive].label}）`
                    : ""}
                  {totalProgress.kept > 0 ? ` · 命中 ${totalProgress.kept}` : ""}
                </span>
              ) : (
                "觅talent · AI 招聘官引擎"
              )}
            </div>
          </div>
        </Link>

        {/* 主导航：克制的 underline tab 风（Linear 风） */}
        <nav className="flex items-center gap-1 ml-2">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "text-[#18181b]" : "text-[#71717a] hover:text-[#18181b]"
                }`}
              >
                {item.label}
                {active && (
                  <span
                    className="absolute left-3 right-3 -bottom-[1px] h-[2px] rounded-full"
                    style={{ backgroundColor: accentColor }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {actions}
        </div>
      </div>
    </header>
  );
}

/** 雷达 logo —— 同心圆 + 扫描臂，颜色跟当前页面平台 */
export function BrandMark({
  size = 32,
  spinning = false,
  color = "#0f172a",
}: {
  size?: number;
  spinning?: boolean;
  color?: string;
}) {
  return (
    <div
      className={`relative flex items-center justify-center flex-shrink-0 ${spinning ? "radar-spinning" : ""}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
        <circle cx="20" cy="20" r="18" fill={color} />
        <circle cx="20" cy="20" r="13" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        <circle cx="20" cy="20" r="8" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
        <circle cx="20" cy="20" r="3" fill="white" />
        <path d="M20 20 L36 20" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function MakerSignature() {
  return (
    <div
      className="fixed bottom-4 right-4 z-20 pointer-events-none select-none"
      aria-hidden="true"
    >
      <div
        className="pointer-events-auto opacity-40 hover:opacity-100 transition-opacity px-3 py-1.5 rounded-full flex items-center gap-1.5 text-[10px] text-[#71717a] bg-white/70 backdrop-blur border border-zinc-200"
        title="本系统由 丁丁 定制"
      >
        <span className="font-mono tracking-wider">DESIGNED BY</span>
        <span className="font-semibold" style={{ color: "var(--color-brand)" }}>丁丁</span>
      </div>
    </div>
  );
}
