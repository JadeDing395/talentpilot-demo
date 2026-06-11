"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_EDUCATION, EDUCATION_OPTIONS, normalizeEducation, type ICP } from "@/lib/icp-shared";
import type { ScoreWeights } from "@/lib/scoring-config";
import { loadAiConfig } from "./AiSettingsModal";
import CyclistLoader from "./CyclistLoader";

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

interface ChannelRecommendation {
  name: string;
  tone: "priority" | "secondary";
  reason: string;
}

const supportedRankMarks = ["①", "②", "③"];

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

function buildChannelRecommendations(position: string, jd: string): ChannelRecommendation[] {
  const text = `${position}\n${jd}`.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(text);

  const isUi = has(/ui|交互|界面|ux|设计师/);
  const isTechArt = has(/技术美术|(^|[\s/（(])ta([\s/）)]|$)|shader|渲染|管线|工具开发|脚本|材质/);
  const isAnimation = has(/3d|动画|动作|特效|骨骼|maya|max|ue|虚幻|unreal/);
  const isIllustration = has(/插画|原画|角色|二次元|立绘|概念设计|concept|角色设计/);

  if (isTechArt) {
    return [
      { name: "ArtStation", tone: "priority", reason: "技术美术、渲染与引擎向作品和履历最集中。" },
      { name: "微博", tone: "secondary", reason: "能补充国内项目曝光和业内社交，但 TA 比例不高。" },
      { name: "小红书", tone: "secondary", reason: "可补少量引擎向内容与个人表达，召回通常弱于作品站。" },
    ];
  }

  if (isAnimation) {
    return [
      { name: "ArtStation", tone: "priority", reason: "3D、动作、特效和动画类作品集最集中，专业度最高。" },
      { name: "小红书", tone: "secondary", reason: "二次元与动效分享有一定活跃度，但动画岗位密度较低。" },
      { name: "微博", tone: "secondary", reason: "原画和插画大粉多，纯动画/动作设计师比例偏低。" },
    ];
  }

  if (isUi) {
    return [
      { name: "小红书", tone: "priority", reason: "UI、交互和视觉设计师内容活跃，个人风格表达强。" },
      { name: "ArtStation", tone: "secondary", reason: "能补作品集型设计师，但 UI 覆盖不如小红书直接。" },
      { name: "微博", tone: "secondary", reason: "可补行业曝光与设计师社交，但结构化作品较少。" },
    ];
  }

  if (isIllustration) {
    return [
      { name: "ArtStation", tone: "priority", reason: "原画、插画、概念设计作品集最稳定，筛选效率最高。" },
      { name: "小红书", tone: "secondary", reason: "二次元插画和视觉风格内容活跃，容易找到新锐画师。" },
      { name: "微博", tone: "secondary", reason: "原画大粉和同人画师聚集，补充头部曝光账号很有效。" },
    ];
  }

  return [
    { name: "ArtStation", tone: "priority", reason: "默认首选，专业作品集最集中，筛人效率最高。" },
    { name: "小红书", tone: "secondary", reason: "适合补充国内创作者和风格表达型人才。" },
    { name: "微博", tone: "secondary", reason: "适合补头部曝光账号与同人/项目讨论场景。" },
  ];
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
  const channelRecommendations = useMemo(
    () => (draft ? buildChannelRecommendations(draft.position, draft.jd) : []),
    [draft],
  );

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

              {jobsLoading && (
                <CyclistLoader message="正在翻页抓取岗位，请稍候..." />
              )}

              {!jobsLoading && fetchingJobUrl && (
                <CyclistLoader message="正在抓取岗位详情 JD，请稍候..." />
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

          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-slate-700">渠道策略</div>
              <p className="text-[11px] text-slate-400 mt-1">结合岗位与 JD 特征，先给出渠道优先级建议，再编辑各平台搜索策略。</p>
            </div>

            <div className="border border-dashed border-slate-300 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">推荐渠道优先级（基于岗位特征）</div>
              <div className="mt-3 space-y-2">
                {channelRecommendations.map((item, index) => (
                  <div key={item.name} className="flex items-start justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">{`${supportedRankMarks[index] || `${index + 1}.`} ${item.name}`}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            item.tone === "priority"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {item.tone === "priority" ? "优先" : "次选"}
                        </span>
                        <span className="text-[11px]" style={{ color: item.name === "ArtStation" ? "#0d4f3c" : item.name === "小红书" ? "#cc1c35" : "#cc6800" }}>
                          {item.name === "ArtStation" ? "🟢" : "🟡"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{item.reason}</div>
                    </div>
                  </div>
                ))}
              </div>

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
