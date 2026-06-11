"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Tag } from "@/lib/types";

interface Props {
  tags: Tag[];
  value: string;        // 当前选中的 tag id（字符串），""=全部
  onChange: (id: string) => void;
}

/**
 * 可搜索的标签筛选下拉
 * - 折叠状态显示当前选中标签 + 数量徽章
 * - 展开后顶部一个搜索框，下面是滚动列表（支持上百个标签）
 * - 列出"全部标签"作为重置选项
 */
export default function TagSearchSelect({ tags, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // 点外面关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = tags.find((t) => String(t.id) === value);

  const filtered = useMemo(() => {
    if (!q.trim()) return tags;
    const lower = q.trim().toLowerCase();
    return tags.filter((t) => t.name.toLowerCase().includes(lower));
  }, [q, tags]);

  return (
    <div ref={ref} className="relative">
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`px-3 py-2 text-sm border rounded-lg flex items-center gap-1.5 transition-colors min-w-[120px] ${
          selected
            ? "border-[#0d4f3c]/30 bg-[#ecf3ef] text-[#0d4f3c]"
            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
        }`}
      >
        {selected ? (
          <>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: selected.color }}
            />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-zinc-500">全部标签</span>
        )}
        <svg
          className={`w-3.5 h-3.5 ml-auto text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 下拉 popover */}
      {open && (
        <div className="absolute z-20 left-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-zinc-200 overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b border-zinc-100">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索标签..."
                autoFocus
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:bg-white focus:border-[#0d4f3c]/30 focus:ring-2 focus:ring-[#ccdfd5] transition-all"
              />
            </div>
          </div>

          {/* 列表 */}
          <div className="max-h-64 overflow-y-auto py-1">
            {/* "全部" 重置项 */}
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
                setQ("");
              }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                value === "" ? "bg-[#ecf3ef] text-[#0d4f3c] font-medium" : "text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-zinc-300" />
              <span>全部标签</span>
              <span className="ml-auto text-[10px] text-zinc-400">{tags.length}</span>
            </button>

            <div className="my-1 border-t border-zinc-100" />

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-zinc-400 text-center">无匹配标签</p>
            ) : (
              filtered.map((t) => {
                const active = String(t.id) === value;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onChange(String(t.id));
                      setOpen(false);
                      setQ("");
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                      active ? "bg-[#ecf3ef] text-[#0d4f3c] font-medium" : "text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="truncate">{t.name}</span>
                    {active && (
                      <svg className="w-3 h-3 ml-auto text-[#0d4f3c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
