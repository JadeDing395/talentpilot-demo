"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BrandHeader, { BrandMark } from "@/components/BrandHeader";
import IcpFeedPanel from "@/components/IcpFeedPanel";
import RadarScanForm from "@/components/RadarScanForm";
import RadarResultCard from "@/components/RadarResultCard";
import RadarResultsTable from "@/components/RadarResultsTable";
import TokenUsagePanel from "@/components/TokenUsagePanel";
import AiSettingsModal, { loadAiConfig } from "@/components/AiSettingsModal";
import PlatformSelector, {
  LoginByPlatform,
  loadSelectedPlatforms,
  saveSelectedPlatforms,
  findUnloggedInPlatforms,
} from "@/components/PlatformSelector";
import MultiPlatformProgressPanel from "@/components/MultiPlatformProgressPanel";
import SectionCard from "@/components/SectionCard";
import { useRadarScan } from "@/components/RadarScanContext";
import type { ICP } from "@/lib/icp-shared";
import type { Platform } from "@/lib/types";
import { PLATFORM_LIST, PLATFORMS } from "@/lib/platforms";
import { DEFAULT_WEIGHTS } from "@/lib/scoring-config";

const OUTREACH_ADV_STORAGE = "radar-outreach-company-advantages";
type ResultPlatformFilter = "all" | Platform;

export default function ScanPage() {
  const {
    mergedResults,
    mergedReviewed,
    briefByPlatform,
    isAnyScanning,
    totalRunUsage,
    usageRefreshSignal,
  } = useRadarScan();

  const [view, setView] = useState<"card" | "table">("card");
  const [aiOpen, setAiOpen] = useState(false);
  const [selected, setSelected] = useState<Platform[]>(() => PLATFORM_LIST.map((p) => p.id));
  const [loginByPlatform, setLoginByPlatform] = useState<LoginByPlatform>({});
  const [hydrated, setHydrated] = useState(false);
  const [appliedIcp, setAppliedIcp] = useState<ICP | null>(null);
  const [companyAdvantages, setCompanyAdvantages] = useState("");
  const [resultPlatformFilter, setResultPlatformFilter] = useState<ResultPlatformFilter>("all");

  // mount 后从 localStorage 恢复勾选
  useEffect(() => {
    setSelected(loadSelectedPlatforms());
    try {
      setCompanyAdvantages(localStorage.getItem(OUTREACH_ADV_STORAGE) ?? "");
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  // 持久化勾选
  useEffect(() => {
    if (!hydrated) return;
    saveSelectedPlatforms(selected);
  }, [hydrated, selected]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(OUTREACH_ADV_STORAGE, companyAdvantages);
    } catch {
      // ignore
    }
  }, [companyAdvantages, hydrated]);

  // 平台主色联动:单选时把 body data-platform 设到对应平台,触发 CSS 变量切换;
  // 多选或空选则走中性默认。unmount 时清掉,避免影响其他路由。
  useEffect(() => {
    if (!hydrated || typeof document === "undefined") return;
    if (selected.length === 1) {
      document.body.dataset.platform = selected[0];
    } else {
      delete document.body.dataset.platform;
    }
    return () => {
      if (typeof document !== "undefined") delete document.body.dataset.platform;
    };
  }, [hydrated, selected]);

  const recheckLogin = useCallback(async (platform: Platform) => {
    const meta = PLATFORMS[platform];
    setLoginByPlatform((prev) => ({
      ...prev,
      [platform]: {
        loggedIn: prev[platform]?.loggedIn ?? false,
        message: prev[platform]?.message,
        checking: true,
      },
    }));
    if (meta.requiresLogin === "none") {
      setLoginByPlatform((prev) => ({
        ...prev,
        [platform]: { loggedIn: true, message: "无需登录", checking: false },
      }));
      return;
    }
    try {
      const res = await fetch(`${meta.apiPrefix}/login-status`, { cache: "no-store" });
      const data = await res.json();
      setLoginByPlatform((prev) => ({
        ...prev,
        [platform]: {
          loggedIn: !!data.loggedIn,
          message: typeof data.message === "string" ? data.message : undefined,
          checking: false,
        },
      }));
    } catch (err) {
      setLoginByPlatform((prev) => ({
        ...prev,
        [platform]: {
          loggedIn: false,
          message: err instanceof Error ? err.message : String(err),
          checking: false,
        },
      }));
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    for (const p of PLATFORM_LIST) recheckLogin(p.id);
  }, [hydrated, recheckLogin]);

  const unloggedInPlatforms = findUnloggedInPlatforms(selected, loginByPlatform);

  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  useEffect(() => {
    setHasApiKey(!!loadAiConfig().apiKey);
  }, [aiOpen]);

  const totalWeight =
    DEFAULT_WEIGHTS.jd + DEFAULT_WEIGHTS.keyword + DEFAULT_WEIGHTS.experience +
    DEFAULT_WEIGHTS.education + DEFAULT_WEIGHTS.openness + DEFAULT_WEIGHTS.followers;

  const briefs = PLATFORM_LIST
    .map((p) => ({ id: p.id, label: p.label, brief: briefByPlatform[p.id] }))
    .filter((b) => b.brief);

  const focusPlatform: Platform | null = selected.length === 1 ? selected[0] : null;
  const visibleResultPlatforms = PLATFORM_LIST.filter((p) =>
    mergedResults.some((r) => r.platform === p.id) || mergedReviewed.some((r) => r.platform === p.id),
  );
  const visibleResultPlatformIds = visibleResultPlatforms.map((p) => p.id).join("|");

  useEffect(() => {
    if (resultPlatformFilter === "all") return;
    if (!visibleResultPlatformIds.split("|").filter(Boolean).includes(resultPlatformFilter)) {
      setResultPlatformFilter("all");
    }
  }, [resultPlatformFilter, visibleResultPlatformIds]);

  const filteredResults = resultPlatformFilter === "all"
    ? mergedResults
    : mergedResults.filter((r) => r.platform === resultPlatformFilter);
  const filteredReviewed = resultPlatformFilter === "all"
    ? mergedReviewed
    : mergedReviewed.filter((r) => r.platform === resultPlatformFilter);
  const resultFilterLabel = resultPlatformFilter === "all" ? "全部平台" : PLATFORMS[resultPlatformFilter].label;

  return (
    <>
      <BrandHeader
        actions={
          <>
            <TokenUsagePanel currentRun={totalRunUsage} refreshSignal={usageRefreshSignal} />
            <button onClick={() => setAiOpen(true)} className="btn-ghost">⚙️ AI 设置</button>
          </>
        }
      />

      <main className="px-6 py-8 max-w-[1280px] mx-auto w-full flex-1 space-y-8">
        {/* ─── Hero ─── */}
        <header className="relative pt-6 pb-2">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-3 font-medium">
                TalentPilot · Cross-Platform
              </div>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 leading-[1.05]">
                跨平台美术人才扫描
              </h1>
              <p className="text-base text-slate-500 mt-4 max-w-xl">
                一次填表 · 多平台并发抓取 · AI 评分 · 结果按总分混排
                {hasApiKey === false && (
                  <span className="ml-2 text-amber-600">· 请先在「AI 设置」中配置 API Key</span>
                )}
              </p>
              {focusPlatform && (
                <div className="mt-4 inline-flex items-center gap-2 text-[11px] text-slate-500">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: PLATFORMS[focusPlatform].color.brand }}
                  />
                  当前聚焦平台:{PLATFORMS[focusPlatform].label} · 整页主色已联动
                </div>
              )}
            </div>
            <div className="hidden md:flex flex-col items-center gap-2 flex-shrink-0">
              <BrandMark size={96} spinning={isAnyScanning} color="var(--color-brand)" />
              <div className="text-[10px] text-slate-400 tabular-nums">
                {isAnyScanning ? "扫描中" : "Ready"}
              </div>
            </div>
          </div>
        </header>

        <IcpFeedPanel onApply={setAppliedIcp} />

        {/* ─── 平台选择 ─── */}
        <PlatformSelector
          selected={selected}
          onChange={setSelected}
          loginByPlatform={loginByPlatform}
          onRecheck={recheckLogin}
        />

        {/* ─── 表单 ─── */}
        <RadarScanForm
          selectedPlatforms={selected}
          unloggedInPlatforms={unloggedInPlatforms}
          appliedIcp={appliedIcp}
        />

        {/* ─── 进度面板 ─── */}
        <AnimatePresence>
          {(isAnyScanning || Object.keys(briefByPlatform).length > 0) && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <MultiPlatformProgressPanel selected={selected} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── AI 岗位理解 ─── */}
        {briefs.length > 0 && (
          <SectionCard title="AI 对岗位的理解" subtitle="每个平台独立扩展搜索词,理解角度可能不同">
            <div className="space-y-4">
              {briefs.map((b) => (
                <div key={b.id} className="border-t border-slate-100 first:border-t-0 first:pt-0 pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded"
                      style={{ backgroundColor: PLATFORMS[b.id].badge.bg, color: PLATFORMS[b.id].badge.fg }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PLATFORMS[b.id].color.brand }} />
                      {b.label}
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-600 leading-relaxed">{b.brief?.understanding}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {b.brief?.search_queries.map((q) => (
                      <span
                        key={q}
                        className="px-2 py-0.5 rounded text-[11px]"
                        style={{
                          backgroundColor: PLATFORMS[b.id].badge.bg,
                          color: PLATFORMS[b.id].badge.fg,
                        }}
                      >
                        {q}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ─── 结果区 ─── */}
        {mergedResults.length > 0 && (
          <section>
            <SectionCard
              title="触达上下文"
              subtitle="可选 · 会写进每位候选人的个性化触达话术"
              innerClassName="py-4"
            >
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">我司优势（可选）</label>
                  <input
                    value={companyAdvantages}
                    onChange={(e) => setCompanyAdvantages(e.target.value)}
                    placeholder="例如：二次元项目成熟、主美直带、风格空间大、支持远程协作"
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-400/30 transition-shadow"
                  />
                </div>
              </div>
            </SectionCard>

            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  ✅ 命中 <span className="tabular-nums" style={{ color: "var(--color-brand)" }}>{filteredResults.length}</span>
                  {resultPlatformFilter !== "all" && (
                    <span className="text-base text-slate-400 font-medium"> / {mergedResults.length}</span>
                  )}
                </h2>
                <p className="text-[11px] text-slate-400 mt-1">
                  按总分降序混排 · 卡片上的徽章标识来源平台 · 当前筛选：{resultFilterLabel}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap justify-end">
                {visibleResultPlatforms.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">平台：</span>
                    <div className="segmented">
                      <button
                        type="button"
                        onClick={() => setResultPlatformFilter("all")}
                        data-active={resultPlatformFilter === "all" ? "true" : "false"}
                        className="segmented-item"
                      >
                        全部
                      </button>
                      {visibleResultPlatforms.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setResultPlatformFilter(p.id)}
                          data-active={resultPlatformFilter === p.id ? "true" : "false"}
                          className="segmented-item"
                          style={resultPlatformFilter === p.id ? { color: p.color.brand } : undefined}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="inline-flex rounded-full p-1 bg-slate-100">
                  {(["card", "table"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`px-3.5 py-1 text-xs rounded-full transition-all ${
                        view === v ? "text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                      style={view === v ? { backgroundColor: "var(--color-brand)" } : undefined}
                    >
                      {v === "card" ? "卡片" : "表格"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {view === "card" ? (
              filteredResults.length > 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {filteredResults.map((r) => (
                    <RadarResultCard key={`${r.platform}-${r.platform_user_id}`} result={r} />
                  ))}
                </div>
              ) : (
                <SectionCard title="当前筛选暂无命中" subtitle={`已切到 ${resultFilterLabel}，可切回「全部」查看其他平台结果`}>
                  <div className="text-sm text-slate-400 py-2">这个平台本次没有命中候选人。</div>
                </SectionCard>
              )
            ) : (
              filteredResults.length > 0 ? (
                <RadarResultsTable results={filteredResults} />
              ) : (
                <SectionCard title="当前筛选暂无命中" subtitle={`已切到 ${resultFilterLabel}，可切回「全部」查看其他平台结果`}>
                  <div className="text-sm text-slate-400 py-2">这个平台本次没有命中候选人。</div>
                </SectionCard>
              )
            )}
          </section>
        )}

        {mergedReviewed.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                👀 未命中 <span className="text-slate-400 tabular-nums">({filteredReviewed.length}{resultPlatformFilter !== "all" ? ` / ${mergedReviewed.length}` : ""})</span>
              </h2>
              {mergedResults.length === 0 && visibleResultPlatforms.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">平台：</span>
                  <div className="segmented">
                    <button
                      type="button"
                      onClick={() => setResultPlatformFilter("all")}
                      data-active={resultPlatformFilter === "all" ? "true" : "false"}
                      className="segmented-item"
                    >
                      全部
                    </button>
                    {visibleResultPlatforms.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setResultPlatformFilter(p.id)}
                        data-active={resultPlatformFilter === p.id ? "true" : "false"}
                        className="segmented-item"
                        style={resultPlatformFilter === p.id ? { color: p.color.brand } : undefined}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {filteredReviewed.length > 0 ? (
              <RadarResultsTable results={filteredReviewed} />
            ) : (
              <SectionCard title="当前筛选暂无未命中结果" subtitle={`已切到 ${resultFilterLabel}`}>
                <div className="text-sm text-slate-400 py-2">这个平台当前没有未命中候选人。</div>
              </SectionCard>
            )}
          </section>
        )}

        {!isAnyScanning && mergedResults.length === 0 && mergedReviewed.length === 0 && (
          <SectionCard title="结果区域" subtitle="扫描启动后,命中的候选人会按总分排序显示在这里">
            <div className="text-center text-sm text-slate-400 py-8">
              填写上方表单 + 勾选扫描渠道,点「开始扫描」即可。<br />
              <span className="text-xs">满分 {totalWeight} 分;AI 会综合 bio、互动数据、作品图等进行评估。</span>
            </div>
          </SectionCard>
        )}
      </main>

      <AiSettingsModal open={aiOpen} onClose={() => setAiOpen(false)} onSaved={() => setAiOpen(false)} />
    </>
  );
}
