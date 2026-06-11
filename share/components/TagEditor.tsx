"use client";

import { useState, useMemo } from "react";
import { Tag } from "@/lib/types";

interface Props {
  allTags: Tag[];
  currentTagIds: number[];
  onChange: (nextTagIds: number[]) => void;
}

/**
 * 标签编辑器：
 * - 显示当前候选人的标签，每个右上角有 × 可移除
 * - 底部输入框：边输边过滤现有标签 + 高亮提示；回车若有匹配则添加该标签，否则创建新标签后添加
 */
export default function TagEditor({ allTags, currentTagIds, onChange }: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const tagMap = useMemo(() => Object.fromEntries(allTags.map((t) => [t.id, t])), [allTags]);
  const currentTags = currentTagIds.map((id) => tagMap[id]).filter(Boolean) as Tag[];

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return allTags
      .filter((t) => !currentTagIds.includes(t.id) && t.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [input, allTags, currentTagIds]);

  const removeTag = (id: number) => {
    onChange(currentTagIds.filter((t) => t !== id));
  };

  const addTagById = (id: number) => {
    if (currentTagIds.includes(id)) return;
    onChange([...currentTagIds, id]);
    setInput("");
  };

  const addTagByName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // 优先匹配已有
    const existing = allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      addTagById(existing.id);
      return;
    }
    // 创建新的
    setBusy(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        const newTag = await res.json();
        onChange([...currentTagIds, newTag.id]);
        setInput("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* 已选标签 */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {currentTags.length === 0 && (
          <span className="text-xs text-slate-400">暂无标签</span>
        )}
        {currentTags.map((t) => (
          <button
            key={t.id}
            onClick={() => removeTag(t.id)}
            className="group px-2 py-0.5 rounded-full text-xs font-medium text-white flex items-center gap-1 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: t.color }}
            title="点击移除"
          >
            <span>{t.name}</span>
            <span className="opacity-60 group-hover:opacity-100">×</span>
          </button>
        ))}
      </div>

      {/* 输入框 + 候选下拉 */}
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (suggestions.length > 0) addTagById(suggestions[0].id);
              else if (input.trim()) addTagByName(input);
            }
          }}
          placeholder="+ 添加标签（回车确认）"
          disabled={busy}
          className="w-full px-2.5 py-1.5 text-xs border border-dashed border-slate-300 rounded-md focus:outline-none focus:border-[#0d4f3c]/40 focus:bg-white disabled:opacity-50"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-sm max-h-48 overflow-y-auto">
            {suggestions.map((t, i) => (
              <button
                key={t.id}
                onClick={() => addTagById(t.id)}
                className={`w-full text-left px-2.5 py-1 text-xs hover:bg-[#ecf3ef] flex items-center gap-2 ${
                  i === 0 ? "bg-[#ecf3ef]/50" : ""
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                <span>{t.name}</span>
                {i === 0 && <span className="ml-auto text-[10px] text-[#71717a]">回车选中</span>}
              </button>
            ))}
          </div>
        )}
        {input.trim() && suggestions.length === 0 && !busy && (
          <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-sm">
            <button
              onClick={() => addTagByName(input)}
              className="w-full text-left px-2.5 py-1 text-xs hover:bg-emerald-50 text-emerald-700"
            >
              + 创建新标签「{input.trim()}」
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
