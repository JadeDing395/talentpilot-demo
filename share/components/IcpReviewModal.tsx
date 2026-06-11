"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_EDUCATION, EDUCATION_OPTIONS, normalizeEducation, type ICP } from "@/lib/icp-shared";
import type { ScoreWeights } from "@/lib/scoring-config";
import { loadAiConfig } from "./AiSettingsModal";

interface Props {
  icp: ICP | null;
  onApply: (icp: ICP) => void;
  onClose: () => void;
}

const fieldClass = "w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-400/30 transition-shadow";
const labelClass = "block text-xs font-medium text-slate-700 mb-1.5";
const weightKeys: Array<keyof ScoreWeights> = ["jd", "keyword", "experience", "education", "openness", "followers"];
const weightLabels: Record<keyof ScoreWeights, string> = {
  jd: "JD 匹配",
  keyword: "关键词匹配",
  experience: "背景经验",
  education: "教育履历",
  openness: "开放度",
  followers: "影响力",
};

interface JobListing {
  title: string;
  detailUrl?: string;
  snippet: string;
}

function splitList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function joinList(values?: string[]): string {
  return (values ?? []).join("\n");
}

export default function IcpReviewModal({ icp, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<ICP | null>(icp);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState("");
  const [fetchingJobUrl, setFetchingJobUrl] = useState<string | null>(null);

  useEffect(() => {
    setDraft(icp);
    setJobs([]);
    setJobsError("");
    setJobsLoading(false);
    setFetchingJobUrl(null);
  }, [icp]);

  const totalWeight = useMemo(() => {
    if (!draft) return 0;
    return weightKeys.reduce((total, key) => total + draft.weights[key], 0);
  }, [draft]);

  if (!draft) return null;

  const updateCareerPageUrl = (value: string) => {
    setDraft((prev) => (
      prev
        ? {
            ...prev,
            sourceInputs: {
              ...prev.sourceInputs,
              careerPageUrl: value || undefined,
            },
          }
        : prev
    ));
  };

  const updateWeights = (key: keyof ScoreWeights, value: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        weights: {
          ...prev.weights,
          [key]: Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)),
        },
      };
    });
  };

  const applyDisabled = totalWeight !== 100;

  const handleFetchJobs = async () => {
    const careerPageUrl = draft.sourceInputs.careerPageUrl?.trim();
    const aiConfig = loadAiConfig();
    if (!aiConfig.apiKey?.trim()) {
      setJobsError("请先在右上角「AI 设置」里配置 API Key");
      return;
    }
    if (!careerPageUrl) {
      setJobsError("请先提供公司招聘页 URL");
      return;
    }

    setJobsLoading(true);
    setJobsError("");
    setJobs([]);

    try {
      const res = await fetch("/api/jd/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: careerPageUrl,
          position: draft.position,
          keywords: draft.keywords,
          aiConfig,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "岗位清单抓取失败");
      }
      const nextJobs = Array.isArray(data.jobs) ? data.jobs as JobListing[] : [];
      setJobs(nextJobs);
      if (nextJobs.length === 0) {
        setJobsError("没抽到岗位，请换招聘页或直接贴岗位详情页 URL。");
      }
    } catch (error) {
      setJobsError(error instanceof Error ? error.message : String(error));
    } finally {
      setJobsLoading(false);
    }
  };

  const handleFetchJob = async (url: string) => {
    const aiConfig = loadAiConfig();
    if (!aiConfig.apiKey?.trim()) {
      setJobsError("请先在右上角「AI 设置」里配置 API Key");
      return;
    }
    if (!url.trim()) {
      setJobsError("这个岗位没有可用的详情页链接，请直接贴岗位详情页 URL");
      return;
    }

    setFetchingJobUrl(url);
    setJobsError("");

    try {
      const res = await fetch("/api/jd/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, aiConfig }),
      });
      const data = await res.json();
      if (!res.ok || !data.jd) {
        throw new Error(data.error || "岗位 JD 抓取失败");
      }
      setDraft((prev) => (
        prev
          ? {
              ...prev,
              position: typeof data.position === "string" && data.position.trim() ? data.position.trim() : prev.position,
              jd: String(data.jd),
            }
          : prev
      ));
    } catch (error) {
      setJobsError(error instanceof Error ? error.message : String(error));
    } finally {
      setFetchingJobUrl(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">审稿并应用 ICP</h2>
            <p className="text-xs text-slate-500 mt-1">先确认 AI 反推画像，再一键写入下方搜索表单。</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>岗位名称</label>
              <input
                value={draft.position}
                onChange={(event) => setDraft({ ...draft, position: event.target.value })}
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>学历要求</label>
              <select
                value={normalizeEducation(draft.education)}
                onChange={(event) => setDraft({ ...draft, education: event.target.value })}
                className={fieldClass}
              >
                {EDUCATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>经验要求</label>
              <input
                value={draft.experience ?? ""}
                onChange={(event) => setDraft({ ...draft, experience: event.target.value || undefined })}
                className={fieldClass}
                placeholder="3 年以上 / 不限"
              />
            </div>

            <div>
              <label className={labelClass}>人才特征</label>
              <textarea
                value={joinList(draft.personaTraits)}
                onChange={(event) => setDraft({ ...draft, personaTraits: splitList(event.target.value) })}
                rows={4}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <div className="border border-amber-200 rounded-2xl bg-amber-50/70 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold text-slate-900">官网真实 JD 抓取</div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    AI 不再编 JD。请从公司招聘页抓岗位清单，再点选某个岗位，把真实 JD 回填到当前 ICP。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFetchJobs}
                    disabled={jobsLoading}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg text-white ${
                      jobsLoading ? "bg-slate-300 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800"
                    }`}
                  >
                    {jobsLoading ? "抓取中..." : "抓取岗位"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFetchJob(draft.sourceInputs.careerPageUrl?.trim() || "")}
                    disabled={fetchingJobUrl === (draft.sourceInputs.careerPageUrl?.trim() || "")}
                    className="px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    {fetchingJobUrl === (draft.sourceInputs.careerPageUrl?.trim() || "") ? "抓取 JD 中..." : "直接抓当前 URL JD"}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelClass}>公司招聘页 URL</label>
                <input
                  value={draft.sourceInputs.careerPageUrl ?? ""}
                  onChange={(event) => updateCareerPageUrl(event.target.value)}
                  placeholder="https://jobs.example.com"
                  className={fieldClass}
                />
              </div>

              {jobsError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {jobsError}
                </div>
              )}

              {jobs.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700">岗位清单</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {jobs.map((job) => {
                      const key = `${job.title}-${job.detailUrl || job.snippet}`;
                      const loading = !!job.detailUrl && fetchingJobUrl === job.detailUrl;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleFetchJob(job.detailUrl || "")}
                          className="text-left rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-400 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{job.title}</div>
                              <div className="text-xs text-slate-500 mt-1">{job.snippet}</div>
                            </div>
                            <span className="text-[11px] text-slate-400 whitespace-nowrap">
                              {loading ? "抓 JD 中..." : job.detailUrl ? "抓这个岗位" : "无详情链接"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass}>JD 描述</label>
            <textarea
              value={draft.jd}
              onChange={(event) => setDraft({ ...draft, jd: event.target.value })}
              rows={6}
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>搜索关键词（可编辑）</label>
              <textarea
                value={joinList(draft.keywords)}
                onChange={(event) => setDraft({ ...draft, keywords: splitList(event.target.value) })}
                rows={6}
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>竞品定向建议（可编辑）</label>
              <p className="text-[11px] text-rose-600 mb-2">
                以下竞品由 AI 推断，必须由你确认才会用于定向搜索。
              </p>
              <textarea
                value={joinList(draft.competitorTargeting)}
                onChange={(event) => setDraft({ ...draft, competitorTargeting: splitList(event.target.value) })}
                rows={6}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-xs font-medium text-slate-700">推荐评分权重（可编辑）</div>
                <p className="text-[11px] text-slate-400 mt-1">应用前请确保合计 100。</p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-semibold tabular-nums ${
                  totalWeight === 100
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-600 border border-rose-200"
                }`}
              >
                {totalWeight}/100
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {weightKeys.map((key) => (
                <div key={key} className="border border-slate-200 rounded-xl p-3 bg-slate-50/70">
                  <label className="block text-[11px] font-medium text-slate-600 mb-2">
                    {weightLabels[key]}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.weights[key]}
                    onChange={(event) => updateWeights(key, Number(event.target.value) || 0)}
                    className={fieldClass}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>ArtStation 策略</label>
              <textarea
                value={joinList(draft.channelStrategy.artstation)}
                onChange={(event) => setDraft({
                  ...draft,
                  channelStrategy: { ...draft.channelStrategy, artstation: splitList(event.target.value) },
                })}
                rows={5}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>微博策略</label>
              <textarea
                value={joinList(draft.channelStrategy.weibo)}
                onChange={(event) => setDraft({
                  ...draft,
                  channelStrategy: { ...draft.channelStrategy, weibo: splitList(event.target.value) },
                })}
                rows={5}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>小红书策略</label>
              <textarea
                value={joinList(draft.channelStrategy.xiaohongshu)}
                onChange={(event) => setDraft({
                  ...draft,
                  channelStrategy: { ...draft.channelStrategy, xiaohongshu: splitList(event.target.value) },
                })}
                rows={5}
                className={fieldClass}
              />
            </div>
          </div>

          {/* 规划中渠道:完整渠道矩阵 + 合规分级,灰显代表 roadmap(当前已接入 ArtStation/微博/小红书,其余规划中) */}
          <div>
            <label className={labelClass}>更多推荐渠道(规划中 · 按岗位智能匹配)</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
              {[
                { name: "Bilibili", dot: "🟡", reason: "动画/教程视频创作者" },
                { name: "站酷 ZCOOL", dot: "🟡", reason: "国内动效/设计师" },
                { name: "Behance", dot: "🟢", reason: "motion / 动画设计" },
                { name: "Pixiv", dot: "🟡", reason: "插画 / 二次元" },
                { name: "GitHub", dot: "🟢", reason: "技术 / 技术美术" },
                { name: "Google Scholar", dot: "🟢", reason: "学术 / 研究人才" },
                { name: "LinkedIn 领英", dot: "🔴", reason: "资深 / 海外履历" },
                { name: "脉脉", dot: "🔴", reason: "职场社招" },
              ].map((ch) => (
                <div
                  key={ch.name}
                  className="border border-dashed border-slate-300 rounded-lg px-2.5 py-2 bg-slate-100/60"
                  title="规划中,暂未接入采集"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium text-slate-500">{ch.name}</span>
                    <span className="text-[10px] leading-none">{ch.dot}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{ch.reason}</div>
                  <span className="text-[9px] text-slate-400 mt-1 inline-block px-1 py-0.5 bg-slate-200/70 rounded">规划中</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              🟢 公开可采　🟡 登录态限速　🔴 高 ToS 风险(走官方 API / 人工导入)　·　当前已接入 ArtStation / 微博 / 小红书
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
              <div className="text-xs font-medium text-slate-700 mb-2">输入溯源</div>
              <div className="space-y-2 text-[12px] text-slate-600">
                <div><span className="text-slate-400">公司 URL：</span>{draft.sourceInputs.companyUrl || "（未提供）"}</div>
                <div><span className="text-slate-400">公司招聘页 URL：</span>{draft.sourceInputs.careerPageUrl || "（未提供）"}</div>
                <div><span className="text-slate-400">一句话需求：</span>{draft.sourceInputs.briefSentence || "（未提供）"}</div>
                <div>
                  <span className="text-slate-400">成功简历：</span>
                  {(draft.sourceInputs.successResumes ?? []).length > 0
                    ? `${draft.sourceInputs.successResumes?.length} 段文本`
                    : "（未提供）"}
                </div>
                <div>
                  <span className="text-slate-400">标杆主页：</span>
                  {(draft.sourceInputs.topPerformerLinks ?? []).length > 0
                    ? draft.sourceInputs.topPerformerLinks?.join("、")
                    : "（未提供）"}
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>公司理解（AI 推断，不是 JD）</label>
              <p className="text-[11px] text-amber-700 mb-2">
                AI 推断 · 用于理解公司和找对标，不是 JD。
              </p>
              <textarea
                value={draft.companyInsight}
                onChange={(event) => setDraft({ ...draft, companyInsight: event.target.value })}
                rows={4}
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>AI 推断说明</label>
              <textarea
                value={draft.reasoning}
                onChange={(event) => setDraft({ ...draft, reasoning: event.target.value })}
                rows={6}
                className={fieldClass}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            {applyDisabled ? "权重合计需等于 100 后才能应用到搜索。" : "应用后会自动填充下方搜索表单。"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => onApply(draft)}
              disabled={applyDisabled}
              className={`px-4 py-2 text-sm font-semibold rounded-lg text-white ${
                applyDisabled ? "bg-slate-300 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800"
              }`}
            >
              应用到搜索
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
