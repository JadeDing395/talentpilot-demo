"use client";

import { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  /** 自定义内层 padding,默认 p-6 */
  innerClassName?: string;
}

/**
 * 通用卡片容器 —— 大圆角 + 分层柔阴影 + 标题/副标题分区,
 * 用于 /scan 表单的章节分组、进度面板等。
 */
export default function SectionCard({ title, subtitle, right, children, innerClassName = "" }: Props) {
  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.05)] overflow-hidden"
    >
      <div className="px-6 pt-5 pb-3 flex items-end justify-between gap-3 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {right && <div className="flex-shrink-0">{right}</div>}
      </div>
      <div className={`px-6 py-5 ${innerClassName}`}>{children}</div>
    </section>
  );
}

/**
 * 浮动操作卡 —— 表单底部主操作按钮+状态文字的容器,
 * 视觉上比 SectionCard 更"重"(更深阴影 + 平台主色 accent 顶条)。
 */
export function ActionCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative rounded-2xl bg-white border border-slate-200 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.08)] overflow-hidden"
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: "var(--color-brand)" }}
      />
      <div className="px-6 py-5 pt-6">{children}</div>
    </div>
  );
}
