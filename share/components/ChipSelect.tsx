"use client";

import { useState } from "react";

interface Props {
  label: string;
  options: string[]; // 预设可选项
  value: string[]; // 当前选中
  onChange: (next: string[]) => void;
  disabled?: boolean;
  hint?: string;
  allowCustom?: boolean;
}

/**
 * 多选 chip 组件：
 * - 预设选项点击切换选中
 * - 选中后高亮（indigo），未选中是浅色
 * - allowCustom=true 时底部有"+ 添加自定义"输入框，可以补充预设之外的标签
 */
export default function ChipSelect({
  label,
  options,
  value,
  onChange,
  disabled = false,
  hint,
  allowCustom = true,
}: Props) {
  const [customInput, setCustomInput] = useState("");
  const selected = new Set(value);

  const toggle = (opt: string) => {
    if (disabled) return;
    if (selected.has(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  const removeCustom = (opt: string) => {
    if (disabled) return;
    onChange(value.filter((v) => v !== opt));
  };

  const addCustom = () => {
    const v = customInput.trim();
    if (!v || selected.has(v)) {
      setCustomInput("");
      return;
    }
    onChange([...value, v]);
    setCustomInput("");
  };

  // 找出"自定义"的 chip（不在预设里的）
  const customChips = value.filter((v) => !options.includes(v));

  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label}
        {hint && <span className="text-slate-400 font-normal ml-1">({hint})</span>}
      </label>
      <div className="flex flex-wrap gap-1.5 p-2 border border-slate-300 rounded-lg bg-white min-h-[42px]">
        {options.map((opt) => {
          const isSel = selected.has(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              disabled={disabled}
              className={`px-2 py-0.5 rounded-md text-xs transition-colors disabled:opacity-50 ${
                isSel
                  ? "bg-[#0d4f3c] text-white border border-[#0d4f3c]"
                  : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {opt}
            </button>
          );
        })}
        {customChips.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => removeCustom(opt)}
            disabled={disabled}
            className="px-2 py-0.5 rounded-md text-xs bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 disabled:opacity-50"
            title="点击移除"
          >
            {opt} ×
          </button>
        ))}
        {allowCustom && !disabled && (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="+ 自定义"
              className="px-1.5 py-0.5 text-xs border border-dashed border-slate-300 rounded-md w-20 focus:outline-none focus:ring-1 focus:ring-[#0d4f3c]/30 focus:w-32 transition-all"
            />
          </div>
        )}
      </div>
    </div>
  );
}
