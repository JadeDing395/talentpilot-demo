"use client";

import { useState } from "react";
import type { Platform } from "@/lib/types";
import { PLATFORM_LIST, PLATFORMS } from "@/lib/platforms";
import LoginQrModal from "./LoginQrModal";

export interface LoginInfo {
  loggedIn: boolean;
  message?: string;
  checking: boolean;
}

export type LoginByPlatform = Partial<Record<Platform, LoginInfo>>;

interface Props {
  selected: Platform[];
  onChange: (next: Platform[]) => void;
  loginByPlatform: LoginByPlatform;
  onRecheck: (platform: Platform) => void;
}

const STORAGE_KEY = "radar-scan-platforms";

export function loadSelectedPlatforms(): Platform[] {
  if (typeof window === "undefined") return PLATFORM_LIST.map((p) => p.id);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return PLATFORM_LIST.map((p) => p.id);
    const arr = JSON.parse(raw) as Platform[];
    const valid = PLATFORM_LIST.map((p) => p.id);
    const filtered = arr.filter((x) => valid.includes(x));
    return filtered.length > 0 ? filtered : PLATFORM_LIST.map((p) => p.id);
  } catch {
    return PLATFORM_LIST.map((p) => p.id);
  }
}

export function saveSelectedPlatforms(selected: Platform[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
  } catch {
    // ignore
  }
}

export function findUnloggedInPlatforms(
  selected: Platform[],
  loginByPlatform: LoginByPlatform,
): Platform[] {
  return selected.filter((p) => {
    if (PLATFORMS[p].requiresLogin === "none") return false;
    return loginByPlatform[p]?.loggedIn !== true;
  });
}

export default function PlatformSelector({ selected, onChange, loginByPlatform, onRecheck }: Props) {
  const [loginModalFor, setLoginModalFor] = useState<Platform | null>(null);

  const toggle = (id: Platform) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">扫描渠道</h3>
        <span className="text-[11px] text-slate-400">可多选并发执行 · 单选时整页主色跟随该平台</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PLATFORM_LIST.map((meta) => {
          const id = meta.id;
          const info = loginByPlatform[id];
          const checked = selected.includes(id);
          const needsLogin = meta.requiresLogin === "qr";
          const isLoggedIn = info?.loggedIn === true;

          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={`
                group relative text-left rounded-2xl p-5 transition-all border
                ${checked
                  ? "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.08)] -translate-y-0.5"
                  : "border-slate-200 bg-white hover:bg-slate-50/60 hover:border-slate-300"}
              `}
              style={
                checked
                  ? {
                      borderColor: meta.color.brand,
                      backgroundColor: meta.color.brandSoft,
                    }
                  : undefined
              }
            >
              {/* 勾选指示器 */}
              <div
                className="absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
                style={{
                  borderColor: checked ? meta.color.brand : "#cbd5e1",
                  backgroundColor: checked ? meta.color.brand : "transparent",
                }}
              >
                {checked && <span className="text-white text-[10px] leading-none">✓</span>}
              </div>

              {/* 平台 logo + 名称 */}
              <div className="flex items-center gap-2.5 mb-2 pr-8">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
                  style={{ backgroundColor: meta.color.brand }}
                >
                  {meta.shortLabel}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-slate-900 truncate">{meta.label}</div>
                  <div className="text-[11px] text-slate-500 truncate">{meta.tagline}</div>
                </div>
              </div>

              {/* 登录状态行 */}
              <div className="mt-3 pt-3 border-t border-slate-200/70 flex items-center justify-between text-xs h-7">
                {!needsLogin ? (
                  <span className="text-emerald-600 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    公开 API · 无需登录
                  </span>
                ) : info?.checking ? (
                  <span className="text-slate-400 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    检测中...
                  </span>
                ) : isLoggedIn ? (
                  <>
                    <span className="text-emerald-600 inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      已登录
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setLoginModalFor(id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setLoginModalFor(id);
                        }
                      }}
                      title="cookie 在但 server 可能已失效?点这里强制重新扫码"
                      className="text-[10px] text-slate-400 hover:text-slate-700 underline cursor-pointer"
                    >
                      重新登录
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-amber-600 inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      未登录
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setLoginModalFor(id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setLoginModalFor(id);
                        }
                      }}
                      className="text-[11px] px-2 py-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      扫码登录
                    </span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 开发中渠道:展示产品扩展蓝图 + 合规分级,灰显代表 roadmap(逐步打磨、未来更广覆盖) */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">即将支持 · 开发中</h4>
          <span className="text-[11px] text-slate-400">🟢 公开可采　🟡 登录态限速　🔴 高 ToS 风险</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {[
            { name: "Bilibili", dot: "🟡", tag: "动画/教程创作者" },
            { name: "站酷 ZCOOL", dot: "🟡", tag: "国内动效/设计" },
            { name: "Behance", dot: "🟢", tag: "motion 设计" },
            { name: "Pixiv", dot: "🟡", tag: "插画/二次元" },
            { name: "GitHub", dot: "🟢", tag: "技术/技术美术" },
            { name: "Google Scholar", dot: "🟢", tag: "学术/研究人才" },
            { name: "LinkedIn 领英", dot: "🔴", tag: "资深/海外履历" },
            { name: "脉脉", dot: "🔴", tag: "职场社招" },
          ].map((ch) => (
            <div
              key={ch.name}
              className="border border-dashed border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50/70 select-none"
              title="开发中,敬请期待"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-medium text-slate-400">{ch.name}</span>
                <span className="text-[10px] leading-none">{ch.dot}</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">{ch.tag}</div>
              <span className="text-[9px] text-slate-400 mt-1.5 inline-block px-1.5 py-0.5 bg-slate-200/70 rounded">开发中</span>
            </div>
          ))}
        </div>
      </div>

      {loginModalFor && (
        <LoginQrModal
          open={true}
          platform={loginModalFor}
          onClose={() => {
            const p = loginModalFor;
            setLoginModalFor(null);
            if (p) onRecheck(p);
          }}
          onLoggedIn={() => {
            const p = loginModalFor;
            setLoginModalFor(null);
            if (p) onRecheck(p);
          }}
        />
      )}
    </div>
  );
}
