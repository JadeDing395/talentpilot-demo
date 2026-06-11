"use client";

import { useMemo, useState } from "react";
import SectionCard from "./SectionCard";
import IcpReviewModal from "./IcpReviewModal";
import { loadAiConfig } from "./AiSettingsModal";
import type { ICP, ICPInput } from "@/lib/icp-shared";

interface Props {
  onApply: (icp: ICP) => void;
}

type FeedTab = "companyUrl" | "briefSentence" | "successResumes" | "topPerformerLinks";

interface UploadedResume {
  id: string;
  name: string;
  text: string;
  charCount: number;
}

const fieldClass = "w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-400/30 transition-shadow";
const tabs: Array<{ id: FeedTab; label: string; subtitle: string }> = [
  { id: "companyUrl", label: "公司 URL", subtitle: "抓官网信息反推画像" },
  { id: "briefSentence", label: "一句话", subtitle: "用一句话快速下需求" },
  { id: "successResumes", label: "简历", subtitle: "上传 PDF / DOCX / TXT 自动解析" },
  { id: "topPerformerLinks", label: "标杆主页", subtitle: "MVP 阶段简化：与一句话合并处理" },
];

function splitTextarea(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export default function IcpFeedPanel({ onApply }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [activeTabs, setActiveTabs] = useState<FeedTab[]>(["companyUrl", "briefSentence"]);
  const [companyUrl, setCompanyUrl] = useState("");
  const [careerPageUrl, setCareerPageUrl] = useState("");
  const [briefSentence, setBriefSentence] = useState("");
  const [uploadedResumes, setUploadedResumes] = useState<UploadedResume[]>([]);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [topPerformerText, setTopPerformerText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewingIcp, setReviewingIcp] = useState<ICP | null>(null);

  const input = useMemo<ICPInput>(() => ({
    companyUrl: activeTabs.includes("companyUrl") ? companyUrl.trim() || undefined : undefined,
    careerPageUrl: activeTabs.includes("companyUrl") ? careerPageUrl.trim() || undefined : undefined,
    briefSentence: activeTabs.includes("briefSentence") ? briefSentence.trim() || undefined : undefined,
    successResumes: activeTabs.includes("successResumes") ? uploadedResumes.map((item) => item.text) : undefined,
    topPerformerLinks: activeTabs.includes("topPerformerLinks") ? splitTextarea(topPerformerText) : undefined,
  }), [activeTabs, briefSentence, careerPageUrl, companyUrl, topPerformerText, uploadedResumes]);

  const hasAnyInput =
    !!input.companyUrl ||
    !!input.careerPageUrl ||
    !!input.briefSentence ||
    (input.successResumes?.length ?? 0) > 0 ||
    (input.topPerformerLinks?.length ?? 0) > 0;
  const hasPositionSignal =
    !!input.briefSentence ||
    (input.successResumes?.length ?? 0) > 0 ||
    (input.topPerformerLinks?.length ?? 0) > 0;

  const toggleTab = (tab: FeedTab) => {
    setActiveTabs((prev) => (
      prev.includes(tab) ? prev.filter((item) => item !== tab) : [...prev, tab]
    ));
  };

  const handleResumeUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploadingResume(true);
    setError("");

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));

      const res = await fetch("/api/icp/parse-resume", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.items)) {
        throw new Error(data.error || "简历解析失败");
      }

      const parsed = (data.items as Array<{ name: string; text: string; charCount: number }>).map((item, index) => ({
        id: `${item.name}-${item.charCount}-${Date.now()}-${index}`,
        name: item.name,
        text: item.text,
        charCount: item.charCount,
      }));
      setUploadedResumes((prev) => [...prev, ...parsed]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingResume(false);
    }
  };

  const removeResume = (id: string) => {
    setUploadedResumes((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSynthesize = async () => {
    const aiConfig = loadAiConfig();
    if (!aiConfig.apiKey?.trim()) {
      setError("请先在右上角「AI 设置」里配置 API Key");
      return;
    }
    if (!hasAnyInput) {
      setError("请至少提供一个输入来源");
      return;
    }
    if (!hasPositionSignal) {
      setError("请先填写岗位名称或一句话需求");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/icp/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, aiConfig }),
      });
      const data = await res.json();
      if (!res.ok || !data.icp) {
        throw new Error(data.error || "ICP 生成失败");
      }
      setReviewingIcp(data.icp as ICP);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SectionCard
        title="AI 一键反推招聘画像 ICP"
        subtitle="多入口可组合投喂：公司 URL / 一句话先打通，简历与标杆主页保留 MVP 占位"
        right={(
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            {expanded ? "收起" : "展开"}
          </button>
        )}
      >
        {!expanded ? (
          <p className="text-sm text-slate-500">
            先投喂公司官网与一句话需求，AI 会反推岗位、JD、关键词与平台策略，再一键写入搜索表单。
          </p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {tabs.map((tab) => {
                const active = activeTabs.includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => toggleTab(tab.id)}
                    className={`text-left rounded-xl border px-4 py-3 transition-all ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_8px_24px_rgba(15,23,42,0.14)]"
                        : "border-slate-200 bg-slate-50 hover:bg-white text-slate-700"
                    }`}
                  >
                    <div className="text-sm font-semibold">{tab.label}</div>
                    <div className={`text-[11px] mt-1 ${active ? "text-slate-200" : "text-slate-400"}`}>
                      {tab.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-4">
              {activeTabs.includes("companyUrl") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">公司 URL</label>
                    <input
                      value={companyUrl}
                      onChange={(event) => setCompanyUrl(event.target.value)}
                      placeholder="https://careers.yourcompany.com"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">公司招聘页 URL</label>
                    <input
                      value={careerPageUrl}
                      onChange={(event) => setCareerPageUrl(event.target.value)}
                      placeholder="https://jobs.example.com"
                      className={fieldClass}
                    />
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      真实 JD 不再由 AI 编写，会在审稿弹窗里基于这个招聘页抓岗位清单并回填。
                    </p>
                  </div>
                </div>
              )}

              {activeTabs.includes("briefSentence") && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">一句话需求</label>
                  <input
                    value={briefSentence}
                    onChange={(event) => setBriefSentence(event.target.value)}
                    placeholder="例如：招二次元角色原画师"
                    className={fieldClass}
                  />
                </div>
              )}

              {activeTabs.includes("successResumes") && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">成功简历文件</label>
                      <p className="text-[11px] text-slate-400">支持 PDF / DOCX / TXT，可一次上传多份，解析后直接投喂 ICP。</p>
                    </div>
                    <label className={`inline-flex items-center px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer ${uploadingResume ? "opacity-60 cursor-not-allowed" : ""}`}>
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                        multiple
                        className="hidden"
                        disabled={uploadingResume}
                        onChange={(event) => {
                          void handleResumeUpload(event.target.files);
                          event.currentTarget.value = "";
                        }}
                      />
                      {uploadingResume ? "解析中..." : "上传简历"}
                    </label>
                  </div>

                  {uploadedResumes.length > 0 ? (
                    <div className="space-y-2">
                      {uploadedResumes.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div>
                            <div className="text-sm font-medium text-slate-800">{item.name}</div>
                            <div className="text-[11px] text-slate-500 mt-1">已解析 {item.charCount.toLocaleString()} 字</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeResume(item.id)}
                            className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-400">
                      还没有上传简历文件。
                    </div>
                  )}
                </div>
              )}

              {activeTabs.includes("topPerformerLinks") && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">标杆候选人主页</label>
                  <textarea
                    value={topPerformerText}
                    onChange={(event) => setTopPerformerText(event.target.value)}
                    rows={4}
                    placeholder="MVP 阶段简化：每行一个链接或描述文本，会与一句话需求合并处理"
                    className={fieldClass}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="text-[11px] text-slate-400">
                当前支持组合投喂；后续简历与标杆主页会升级成独立解析链路。真实 JD 请在审稿弹窗里从招聘页岗位详情抓取。
              </div>
              <button
                type="button"
                onClick={handleSynthesize}
                disabled={loading || !hasAnyInput || !hasPositionSignal}
                className={`px-5 py-2.5 text-sm font-semibold rounded-xl text-white ${
                  loading || !hasAnyInput || !hasPositionSignal
                    ? "bg-slate-300 cursor-not-allowed"
                    : "bg-slate-900 hover:bg-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.14)]"
                }`}
              >
                {loading ? "反推中..." : "反推 ICP"}
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <IcpReviewModal
        icp={reviewingIcp}
        onClose={() => setReviewingIcp(null)}
        onApply={(icp) => {
          onApply(icp);
          setReviewingIcp(null);
        }}
      />
    </>
  );
}
