"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Candidate, Stage, Tag, Platform } from "@/lib/types";
import { PLATFORMS, PLATFORM_LIST } from "@/lib/platforms";
import StarRating from "@/components/StarRating";
import AddCandidateModal from "@/components/AddCandidateModal";
import AiSettingsModal, { loadAiConfig } from "@/components/AiSettingsModal";
import BrandHeader from "@/components/BrandHeader";
import TagSearchSelect from "@/components/TagSearchSelect";
import { AiClientConfig } from "@/lib/scoring-config";
import { getOrCreateUserId, USER_ID_HEADER } from "@/lib/userIdentity";
import { Users, Star, CircleCheck, TrendingUp, Search, Sparkles, BadgeCheck } from "lucide-react";

interface ListData {
  candidates: Candidate[];
  stages: Stage[];
  tags: Tag[];
}

export default function CandidatesPage() {
  const [data, setData] = useState<ListData>({ candidates: [], stages: [], tags: [] });
  const [q, setQ] = useState("");
  const [stageId, setStageId] = useState("");
  const [tagId, setTagId] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<"all" | Platform>("all");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const resetAllFilters = () => {
    setQ("");
    setStageId("");
    setTagId("");
    setFavoriteOnly(false);
    setAvailableOnly(false);
    setRecentOnly(false);
  };

  // AI 设置（与 /radar 页面共用 localStorage）
  const [aiConfig, setAiConfig] = useState<AiClientConfig>({});
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  useEffect(() => { setAiConfig(loadAiConfig()); }, []);
  const aiConfigured = !!aiConfig.apiKey;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stageId) params.set("stageId", stageId);
    if (tagId) params.set("tagId", tagId);
    if (favoriteOnly) params.set("favorite", "true");
    if (availableOnly) params.set("available", "true");
    if (platformFilter !== "all") params.set("platform", platformFilter);
    const res = await fetch(`/api/candidates?${params}`);
    const json = await res.json();
    let candidates = json.candidates as Candidate[];
    // 「本周新增」客户端过滤（API 暂未支持 recentDays 参数）
    if (recentOnly) {
      const cutoff = Date.now() - 7 * 86400000;
      candidates = candidates.filter((c) => new Date(c.createdAt).getTime() > cutoff);
    }
    setData({ ...json, candidates });
    setLoading(false);
  }, [q, stageId, tagId, favoriteOnly, availableOnly, recentOnly, platformFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stageMap = Object.fromEntries(data.stages.map((s) => [s.id, s]));
  const tagMap = Object.fromEntries(data.tags.map((t) => [t.id, t]));

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (stageId) params.set("stageId", stageId);
    if (tagId) params.set("tagId", tagId);
    if (favoriteOnly) params.set("favorite", "true");
    const res = await fetch(`/api/export?${params}`, {
      headers: { [USER_ID_HEADER]: getOrCreateUserId() },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candidates_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleFavorite = async (c: Candidate) => {
    await fetch(`/api/candidates/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: !c.favorite }),
    });
    fetchData();
  };

  const handleRating = async (c: Candidate, rating: number) => {
    await fetch(`/api/candidates/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    fetchData();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <BrandHeader
        actions={
          <>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-sm border border-zinc-200 rounded-lg hover:bg-zinc-100 text-zinc-700 flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              导出 CSV
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              添加候选人
            </button>
            <button
              onClick={() => setAiSettingsOpen(true)}
              className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 transition-colors ${
                aiConfigured
                  ? "border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  : "bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {aiConfigured ? "AI 设置" : "请先配置 AI"}
            </button>
          </>
        }
      />

      {/* 未配置 AI banner */}
      {!aiConfigured && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between">
          <p className="text-xs text-amber-800">
            ⚠️ 未配置 AI 服务。本系统使用 BYOK 模式（自带 API Key），请先点击右上角「请先配置 AI」填入你自己的 API Key 才能使用雷达扫描。
          </p>
          <button
            onClick={() => setAiSettingsOpen(true)}
            className="text-xs px-2.5 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
          >
            立即配置
          </button>
        </div>
      )}

      {/* 主内容 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Hero — 标题 + 平台 tab + 指标卡 */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-semibold text-zinc-900 tracking-tight leading-tight">
                TalentPilot
              </h1>
              <p className="text-sm text-zinc-500 mt-1.5">
                Cross-platform creator discovery · 跨平台美术人才发现
              </p>
            </div>
            <div className="segmented">
              {(["all", "artstation", "weibo", "xiaohongshu"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  data-active={platformFilter === p ? "true" : "false"}
                  className="segmented-item"
                  style={
                    platformFilter === p && p !== "all"
                      ? { color: PLATFORMS[p as Platform].color.brand }
                      : undefined
                  }
                >
                  {p === "all" ? "全部" : PLATFORMS[p as Platform].label}
                </button>
              ))}
            </div>
          </div>

          {/* 指标卡阵：1 个总数 + 3 个平台 + 1 个本周新增（5 卡） */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <PlatformKpi
              label="候选人总数"
              value={data.candidates.length}
              indicatorColor="#0f172a"
              icon={<Users className="w-4 h-4" />}
              active={platformFilter === "all" && !favoriteOnly && !availableOnly && !recentOnly}
              onClick={() => { resetAllFilters(); setPlatformFilter("all"); }}
            />
            {PLATFORM_LIST.map((p) => (
              <PlatformKpi
                key={p.id}
                label={p.label}
                value={data.candidates.filter((c) => c.source === p.id).length}
                indicatorColor={p.color.brand}
                icon={<span className="text-[10px] font-bold tracking-wider" style={{ color: p.color.brand }}>{p.shortLabel}</span>}
                active={platformFilter === p.id}
                onClick={() => setPlatformFilter(platformFilter === p.id ? "all" : p.id)}
              />
            ))}
            <PlatformKpi
              label="本周新增"
              value={data.candidates.filter((c) => {
                const t = new Date(c.createdAt).getTime();
                return Date.now() - t < 7 * 86400000;
              }).length}
              indicatorColor="#0ea5e9"
              icon={<TrendingUp className="w-4 h-4 text-sky-600" />}
              active={recentOnly}
              onClick={() => setRecentOnly((v) => !v)}
            />
          </div>
        </section>

        {/* 主卡片：筛选 + 表格 */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
          {/* 筛选栏 */}
          <div className="px-5 py-3.5 border-b border-zinc-100 flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-52">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="搜索姓名、城市、技能..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-50 border border-transparent rounded-lg focus:outline-none focus:bg-white focus:border-slate-400/30 focus:ring-2 focus:ring-slate-200 transition-all"
              />
            </div>

            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-slate-400/30 focus:ring-2 focus:ring-slate-200 bg-white"
            >
              <option value="">全部阶段</option>
              {data.stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <TagSearchSelect tags={data.tags} value={tagId} onChange={setTagId} />

            <button
              onClick={() => setFavoriteOnly(!favoriteOnly)}
              className={`px-3 py-2 text-sm border rounded-lg flex items-center gap-1.5 transition-colors ${
                favoriteOnly
                  ? "bg-amber-50 border-amber-300 text-amber-700"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <svg className={`w-3.5 h-3.5 ${favoriteOnly ? "fill-amber-400 stroke-amber-400" : "stroke-zinc-400 fill-none"}`} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              仅看收藏
            </button>

            <span className="text-xs text-zinc-400 ml-auto">
              筛选结果 <span className="text-zinc-700 font-medium tabular-nums">{data.candidates.length}</span> 人
            </span>
          </div>

          {/* 表格 / 空态 / 加载 */}
          {loading ? (
            <SkeletonRows />
          ) : data.candidates.length === 0 ? (
            <EmptyState onAdd={() => setShowModal(true)} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left px-5 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider">候选人</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider">城市</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider">标签</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider">阶段</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider">评分</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider">平台</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider">状态</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((c) => {
                  const stage = stageMap[c.stageId];
                  const tags = c.tagIds.map((tid) => tagMap[tid]).filter(Boolean);
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-zinc-100 last:border-0 hover:bg-slate-50 transition-colors group"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            {c.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.avatarUrl} alt={c.name} className="w-9 h-9 rounded-full object-cover ring-2 ring-zinc-100" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center font-semibold text-sm shadow-sm">
                                {c.name[0]}
                              </div>
                            )}
                            {/* 平台徽章：头像右下角 */}
                            {c.source && c.source !== "manual" && (
                              <span
                                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ring-2 ring-white flex items-center justify-center text-[8px] font-bold"
                                style={{ backgroundColor: PLATFORMS[c.source as Platform].color.brand, color: "white" }}
                                title={PLATFORMS[c.source as Platform].label}
                              >
                                {PLATFORMS[c.source as Platform].shortLabel[0]}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <Link href={`/candidates/${c.id}`} className="font-medium text-zinc-900 group-hover:text-slate-900 transition-colors inline-flex items-center gap-1">
                              {c.name}
                              {c.verified && <BadgeCheck className="w-3.5 h-3.5 text-sky-500" />}
                            </Link>
                            {typeof c.followersCount === "number" && c.followersCount > 0 && (
                              <div className="text-xs text-zinc-400 truncate tabular-nums">
                                👥 {c.followersCount.toLocaleString()} 粉
                              </div>
                            )}
                            {!c.followersCount && c.email && <div className="text-xs text-zinc-400 truncate">{c.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 text-sm">{c.location ?? <span className="text-zinc-300">—</span>}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 2).map((t) => (
                            <span
                              key={t.id}
                              className="px-2 py-0.5 rounded-md text-xs font-medium"
                              style={{ backgroundColor: `${t.color}20`, color: t.color }}
                            >
                              {t.name}
                            </span>
                          ))}
                          {tags.length > 2 && (
                            <span className="px-2 py-0.5 rounded-md text-xs bg-zinc-100 text-zinc-500">
                              +{tags.length - 2}
                            </span>
                          )}
                          {tags.length === 0 && <span className="text-xs text-zinc-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {stage && (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium"
                            style={{ backgroundColor: `${stage.color}1A`, color: stage.color }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                            {stage.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StarRating value={c.rating} onChange={(r) => handleRating(c, r)} />
                      </td>
                      <td className="px-4 py-3.5">
                        {c.source && c.source !== "manual" ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium"
                            style={{ backgroundColor: PLATFORMS[c.source as Platform].badge.bg, color: PLATFORMS[c.source as Platform].badge.fg }}
                          >
                            {PLATFORMS[c.source as Platform].label}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-300">手动</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${c.available ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.available ? "bg-emerald-500" : "bg-zinc-400"}`} />
                          {c.available ? "可接触" : "暂不可"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleToggleFavorite(c)}
                            title={c.favorite ? "取消收藏" : "加入收藏"}
                            className="p-1.5 rounded-md hover:bg-amber-100"
                          >
                            <svg
                              className={`w-4 h-4 ${c.favorite ? "fill-amber-400 stroke-amber-400 opacity-100" : "stroke-zinc-400 fill-none"}`}
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          </button>
                          <Link
                            href={`/candidates/${c.id}`}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-zinc-400 hover:text-slate-900"
                            title="查看详情"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        </div>
                        {/* 收藏的人即使没 hover 也显示星 */}
                        {c.favorite && (
                          <button
                            onClick={() => handleToggleFavorite(c)}
                            className="p-1.5 rounded-md group-hover:hidden"
                            title="已收藏"
                          >
                            <svg className="w-4 h-4 fill-amber-400 stroke-amber-400" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showModal && (
        <AddCandidateModal
          stages={data.stages}
          tags={data.tags}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchData(); }}
        />
      )}

      <AiSettingsModal
        open={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
        onSaved={(cfg) => setAiConfig(cfg)}
      />
    </div>
  );
}

/* ===================== KPI 看板组件 ===================== */

/**
 * 平台 KPI 卡片 —— 顶部 3px 平台 brand 色 indicator bar；数字 24px tabnum；
 * active 状态加 ring + 抬高。
 */
function PlatformKpi({
  label,
  value,
  indicatorColor,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  indicatorColor: string;
  icon?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left bg-white rounded-xl pt-3.5 pb-3 px-4 transition-all overflow-hidden group border ${
        active
          ? "border-slate-300 shadow-md -translate-y-0.5"
          : "border-zinc-200/80 hover:border-zinc-300 hover:-translate-y-0.5"
      }`}
    >
      {/* 顶部 indicator bar */}
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: indicatorColor }} />
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">{label}</span>
        {icon && <span className="opacity-70">{icon}</span>}
      </div>
      <div className="text-[26px] font-semibold text-zinc-900 tabular-nums leading-none">
        {value}
      </div>
    </button>
  );
}

function SkeletonRows() {
  return (
    <div className="p-5 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-zinc-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/3 bg-zinc-100 rounded" />
            <div className="h-2.5 w-1/4 bg-zinc-100 rounded" />
          </div>
          <div className="h-4 w-16 bg-zinc-100 rounded" />
          <div className="h-4 w-20 bg-zinc-100 rounded" />
          <div className="h-4 w-14 bg-zinc-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="px-6 py-16 flex flex-col items-center justify-center text-center">
      <div className="relative w-20 h-20 mb-4">
        {/* 扫描波动画 */}
        <div className="absolute inset-0 rounded-full bg-slate-100 animate-ping opacity-40" />
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-slate-200 flex items-center justify-center">
          <svg className="w-8 h-8 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
      <h3 className="text-base font-semibold text-zinc-900 mb-1">候选人库还是空的</h3>
      <p className="text-sm text-zinc-500 mb-5 max-w-sm">
        去雷达扫描页一次发现一批中国画师，或手动添加候选人
      </p>
      <div className="flex items-center gap-2">
        <Link
          href="/weibo"
          className="px-3.5 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 shadow-sm transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          去微博扫描
        </Link>
        <button
          onClick={onAdd}
          className="px-3.5 py-2 text-sm font-medium border border-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          手动添加
        </button>
      </div>
    </div>
  );
}
