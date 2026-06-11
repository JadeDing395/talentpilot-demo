"use client";

import { useState } from "react";
import { RadarResult, ScoreWeights, DEFAULT_WEIGHTS } from "@/lib/scoring-config";
import type { Platform } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";

interface Props {
  results: RadarResult[];
  weights?: ScoreWeights;
  /** 可选;若未传则使用每行 r.platform 决定 save endpoint(混排场景) */
  platform?: Platform;
}

const LEVEL_STYLES: Record<string, string> = {
  "高度匹配": "bg-emerald-100 text-emerald-800",
  "较高匹配": "bg-amber-50 text-amber-800",
  "可关注": "bg-amber-100 text-amber-800",
  "低匹配": "bg-slate-100 text-slate-500",
};

const OPP_STYLES: Record<string, string> = {
  "明确看机会": "bg-emerald-100 text-emerald-700",
  "可能看机会": "bg-amber-100 text-amber-700",
  "未表明": "bg-slate-100 text-slate-500",
  "暂不看机会": "bg-rose-100 text-rose-600",
};

function Unknown() {
  return <span className="text-slate-400 italic">未知</span>;
}

interface RowProps {
  r: RadarResult;
  saved: boolean;
  saving: boolean;
  weights: ScoreWeights;
  onSave: (r: RadarResult) => void;
}

function CandidateRow({ r, saved, saving, weights, onSave }: RowProps) {
  const [open, setOpen] = useState(false);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (saving || saved) return;
    onSave(r);
  };

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50/70 cursor-pointer transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-3 py-3 align-top">
          <div className="text-xs font-medium text-slate-800">{r.position_name}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">推断：{r.inferred_position}</div>
        </td>

        <td className="px-3 py-3 align-top">
          <div className="flex items-start gap-2">
            {r.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.avatar_url} alt={r.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: PLATFORMS[r.platform].badge.bg, color: PLATFORMS[r.platform].badge.fg }}
              >
                {r.name[0]}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <a
                  href={r.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-semibold text-slate-900 hover:text-slate-600 truncate"
                >
                  {r.name}
                </a>
                {r.verified && (
                  <span
                    className="text-[9px] px-1 rounded text-white"
                    style={{ backgroundColor: PLATFORMS[r.platform].color.brand }}
                    title={r.verified_reason ?? "已认证"}
                  >
                    V
                  </span>
                )}
              </div>
              <span
                className="text-[9px] px-1 py-0.5 rounded inline-block mt-0.5"
                style={{ backgroundColor: PLATFORMS[r.platform].badge.bg, color: PLATFORMS[r.platform].badge.fg }}
              >
                {PLATFORMS[r.platform].label}
              </span>
              {r.headline && (
                <div className="text-[10px] text-slate-400 truncate max-w-[180px] mt-0.5" title={r.headline}>
                  {r.headline}
                </div>
              )}
            </div>
          </div>
        </td>

        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-2">
            <div className="text-base font-bold" style={{ color: "var(--color-brand)" }}>{r.total_score}</div>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${LEVEL_STYLES[r.score_level]}`}>
              {r.score_level}
            </span>
            {r.vision_used && (
              <span className="text-[9px] text-slate-400" title="本次评分用了作品图">👁</span>
            )}
          </div>
          <div className="mt-1 space-y-0.5 text-[11px]">
            <div className="text-emerald-700"><span className="font-semibold">+ </span>{r.pros}</div>
            <div className="text-rose-600"><span className="font-semibold">− </span>{r.cons}</div>
          </div>
        </td>

        <td className="px-3 py-3 align-top text-xs">
          {r.contact ? <span className="text-slate-700 break-all">{r.contact}</span> : <Unknown />}
        </td>

        <td className="px-3 py-3 align-top">
          <div className="space-y-1 text-xs text-slate-700">
            {r.ip_location && <div>📍 {r.ip_location}</div>}
            {!r.ip_location && r.location && <div>📍 {r.location}</div>}
            {typeof r.followers_count === "number" && (
              <div className="tabular-nums">👥 {r.followers_count.toLocaleString()} 粉</div>
            )}
            {r.current_project && (
              <div className="truncate max-w-[160px]" title={r.current_project}>🏢 {r.current_project}</div>
            )}
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${OPP_STYLES[r.open_to_opportunity]}`}>
              {r.open_to_opportunity}
            </span>
          </div>
        </td>

        <td className="px-3 py-3 align-top text-right">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
              saved ? "bg-emerald-100 text-emerald-700 cursor-default" : "text-white disabled:opacity-60"
            }`}
            style={!saved ? { backgroundColor: "var(--color-brand)" } : undefined}
          >
            {saved ? "已存" : saving ? "..." : "入库"}
          </button>
        </td>
      </tr>

      {open && (
        <tr className="bg-slate-50/50">
          <td colSpan={6} className="px-3 py-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-[10px] text-slate-400 mb-1">作品评价</p>
                <p className="text-xs text-slate-700 leading-relaxed">{r.art_evaluation}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-[10px] text-slate-400 mb-1">评分明细</p>
                <div className="space-y-1 text-[11px] text-slate-600">
                  <div>JD匹配：{r.score_breakdown.jd_match}/{weights.jd}</div>
                  <div>关键词：{r.score_breakdown.keyword_match}/{weights.keyword}</div>
                  <div>经验：{r.score_breakdown.experience_match}/{weights.experience}</div>
                  <div>学历：{r.score_breakdown.education_match}/{weights.education}</div>
                  <div>开放度：{r.score_breakdown.openness}/{weights.openness}</div>
                  <div>
                    粉丝数：{r.score_breakdown.followers ?? 0}/{weights.followers}
                    {typeof r.followers_count === "number" && (
                      <span className="text-slate-400 ml-1">· 实际 {r.followers_count.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-[10px] text-slate-400 mb-1">近期作品（{r.recent_works.length}）</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {r.recent_works.slice(0, 6).map((w, i) => (
                    <div key={i} className="text-[10px] text-slate-600 truncate" title={w}>· {w}</div>
                  ))}
                  {r.recent_works.length === 0 && <Unknown />}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

type SortKey =
  | "total" | "jd_match" | "keyword_match" | "experience_match"
  | "education_match" | "openness" | "followers" | "followers_count";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "total", label: "总分" },
  { value: "jd_match", label: "JD 匹配度" },
  { value: "keyword_match", label: "关键词/风格" },
  { value: "experience_match", label: "项目经验" },
  { value: "education_match", label: "学历背景" },
  { value: "openness", label: "求职意向/活跃度" },
  { value: "followers", label: "粉丝得分" },
  { value: "followers_count", label: "粉丝数（实际）" },
];

export default function RadarResultsTable({ results, weights = DEFAULT_WEIGHTS, platform }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>("total");
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [savingSet, setSavingSet] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);

  const sorted = [...results].sort((a, b) => {
    if (sortBy === "total") return b.total_score - a.total_score;
    if (sortBy === "followers_count") return (b.followers_count ?? 0) - (a.followers_count ?? 0);
    if (sortBy === "followers") return (b.score_breakdown.followers ?? 0) - (a.score_breakdown.followers ?? 0);
    return (b.score_breakdown[sortBy as keyof typeof a.score_breakdown] ?? 0) -
           (a.score_breakdown[sortBy as keyof typeof a.score_breakdown] ?? 0);
  });

  const saveOne = async (r: RadarResult) => {
    // 混排场景下,每行用 r.platform 决定 save endpoint;旧用法 platform prop 兜底
    const apiPath = `${PLATFORMS[platform ?? r.platform].apiPrefix}/save`;
    setSavingSet((prev) => new Set(prev).add(r.platform_user_id));
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r),
      });
      if (res.ok || res.status === 409) {
        setSavedSet((prev) => new Set(prev).add(r.platform_user_id));
      }
    } finally {
      setSavingSet((prev) => {
        const n = new Set(prev);
        n.delete(r.platform_user_id);
        return n;
      });
    }
  };

  const handleSaveAll = async () => {
    setBatchRunning(true);
    const todo = sorted.filter((r) => !savedSet.has(r.platform_user_id));
    for (const r of todo) await saveOne(r);
    setBatchRunning(false);
  };

  const totalCount = sorted.length;
  const savedCount = sorted.filter((r) => savedSet.has(r.platform_user_id)).length;
  const allSaved = savedCount === totalCount;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 bg-slate-50/50 gap-3">
        <div className="text-xs text-slate-500">
          已入库 <span className="font-semibold text-slate-700">{savedCount}</span> / {totalCount}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">排序：</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400/30"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={batchRunning || allSaved}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              allSaved
                ? "bg-emerald-100 text-emerald-700 cursor-default"
                : batchRunning
                ? "bg-slate-200 text-slate-500 cursor-wait"
                : "text-white"
            }`}
            style={!allSaved && !batchRunning ? { backgroundColor: "var(--color-brand)" } : undefined}
          >
            {allSaved
              ? "✓ 已全部入库"
              : batchRunning
              ? `入库中 ${savedCount}/${totalCount}...`
              : `全部入库（${totalCount - savedCount} 人）`}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs w-[100px]">岗位</th>
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs w-[200px]">候选人</th>
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">评分</th>
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs w-[160px]">联系方式</th>
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs w-[180px]">状态</th>
              <th className="px-3 py-2.5 w-[80px]"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <CandidateRow
                key={r.platform_user_id}
                r={r}
                saved={savedSet.has(r.platform_user_id)}
                saving={savingSet.has(r.platform_user_id)}
                weights={weights}
                onSave={saveOne}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
