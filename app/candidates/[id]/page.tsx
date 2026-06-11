"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Candidate, Stage, Tag, Note, HistoryEntry } from "@/lib/types";
import StarRating from "@/components/StarRating";
import TagEditor from "@/components/TagEditor";
import BrandHeader from "@/components/BrandHeader";

interface DetailData {
  candidate: Candidate;
  notes: Note[];
  history: HistoryEntry[];
  stage: Stage;
  tags: Tag[];
  allStages: Stage[];
  allTags: Tag[];
}

const ACTION_LABELS: Record<string, string> = {
  created: "档案创建",
  stage_change: "阶段变更",
  rating_change: "评分更新",
  favorite: "收藏状态",
  note_added: "添加备注",
};

export default function CandidateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<DetailData | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteAuthor, setNoteAuthor] = useState("HR");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "notes" | "history">("info");
  const [editingStage, setEditingStage] = useState(false);

  const fetchData = async () => {
    const res = await fetch(`/api/candidates/${id}`);
    if (res.ok) setData(await res.json());
  };

  useEffect(() => { fetchData(); }, [id]);

  const handlePatch = async (patch: Partial<Candidate>) => {
    await fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    fetchData();
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSubmittingNote(true);
    await fetch(`/api/candidates/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteText, author: noteAuthor }),
    });
    setNoteText("");
    setSubmittingNote(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!confirm("确认删除该候选人档案？此操作不可撤销。")) return;
    await fetch(`/api/candidates/${id}`, { method: "DELETE" });
    router.push("/candidates");
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-400">加载中...</div>
    );
  }

  const { candidate: c, notes, history, stage, tags, allStages, allTags } = data;

  return (
    <div className="min-h-screen flex flex-col">
      <BrandHeader
        actions={
          <Link
            href="/candidates"
            className="text-zinc-500 hover:text-zinc-900 flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回列表
          </Link>
        }
      />

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-6 grid grid-cols-3 gap-6 items-start">
        {/* Left panel */}
        <div className="col-span-1 space-y-4">
          {/* Profile card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-[#ccdfd5] flex items-center justify-center text-[#0d4f3c] text-2xl font-bold mb-3">
                {c.name[0]}
              </div>
              <h2 className="text-xl font-bold text-slate-900">{c.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
                >
                  {stage?.name ?? "未知"}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.available ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {c.available ? "可接触" : "暂不可"}
                </span>
              </div>
            </div>

            <div className="flex justify-center mb-4">
              <StarRating
                value={c.rating}
                onChange={(r) => handlePatch({ rating: r })}
              />
            </div>

            <div className="space-y-2 text-sm">
              {c.email && (
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a href={`mailto:${c.email}`} className="hover:text-[#0d4f3c]">{c.email}</a>
                </div>
              )}
              {c.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {c.phone}
                </div>
              )}
              {c.location && (
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {c.location}
                </div>
              )}
              {c.portfolio && (
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <a href={c.portfolio} target="_blank" rel="noopener noreferrer" className="text-[#0d4f3c] hover:underline truncate">
                    作品集
                  </a>
                </div>
              )}
              {c.source && (
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {c.source}
                </div>
              )}
            </div>

            {/* Tags 编辑 */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 mb-1.5">标签</p>
              <TagEditor
                allTags={allTags}
                currentTagIds={c.tagIds}
                onChange={(next) => handlePatch({ tagIds: next })}
              />
            </div>

            {/* Skills */}
            {c.skills.length > 0 && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-1.5">
                  {c.skills.map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">操作</h3>
            <button
              onClick={() => handlePatch({ favorite: !c.favorite })}
              className={`w-full px-3 py-2 text-sm rounded-lg border flex items-center gap-2 transition-colors ${
                c.favorite ? "bg-amber-50 border-amber-300 text-amber-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <svg className={`w-4 h-4 ${c.favorite ? "fill-amber-400 stroke-amber-400" : "fill-none stroke-slate-500"}`} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              {c.favorite ? "取消收藏" : "加入收藏"}
            </button>
            <button
              onClick={() => handlePatch({ available: !c.available })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {c.available ? "标记为暂不可接触" : "标记为可接触"}
            </button>
            <button
              onClick={handleDelete}
              className="w-full px-3 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              删除档案
            </button>
          </div>
        </div>

        {/* Right panel */}
        <div className="col-span-2 space-y-4">
          {/* Pipeline Stage */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">招聘进度</h3>
              <button
                onClick={() => setEditingStage(!editingStage)}
                className="text-xs text-[#0d4f3c] hover:underline"
              >
                {editingStage ? "收起" : "更改阶段"}
              </button>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {allStages.sort((a, b) => a.order - b.order).map((s, i, arr) => (
                <div key={s.id} className="flex items-center gap-1">
                  <div
                    className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
                      s.id === c.stageId
                        ? "text-white ring-2 ring-offset-1"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                    style={s.id === c.stageId ? { backgroundColor: s.color } : {}}
                    onClick={() => editingStage && handlePatch({ stageId: s.id })}
                    title={editingStage ? `切换到${s.name}` : s.name}
                  >
                    {s.name}
                  </div>
                  {i < arr.length - 1 && (
                    <svg className="w-3 h-3 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
            {editingStage && (
              <p className="text-xs text-slate-500 mt-3">点击阶段名称切换</p>
            )}
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200">
              {(["info", "notes", "history"] as const).map((tab) => {
                const labels = { info: "基本信息", notes: `备注 (${notes.length})`, history: `动态 (${history.length})` };
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-3 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? "border-b-2 border-[#0d4f3c] text-[#0d4f3c]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            <div className="p-5">
              {activeTab === "info" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">创建时间</span>
                      <p className="font-medium mt-0.5">{new Date(c.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">最近更新</span>
                      <p className="font-medium mt-0.5">{new Date(c.updatedAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">评分</span>
                      <div className="mt-1">
                        <StarRating value={c.rating} readonly />
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">是否收藏</span>
                      <p className="font-medium mt-0.5">{c.favorite ? "⭐ 已收藏" : "未收藏"}</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="space-y-4">
                  {notes.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">暂无备注</p>
                  ) : (
                    <div className="space-y-3">
                      {notes.map((n) => (
                        <div key={n.id} className="bg-slate-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700">{n.author}</span>
                            <span className="text-xs text-slate-400">
                              {new Date(n.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700">{n.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add note */}
                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex gap-2 mb-2">
                      <input
                        value={noteAuthor}
                        onChange={(e) => setNoteAuthor(e.target.value)}
                        className="w-24 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d4f3c]/30"
                        placeholder="署名"
                      />
                    </div>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={3}
                      placeholder="添加备注..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d4f3c]/30 resize-none"
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={submittingNote || !noteText.trim()}
                      className="mt-2 px-4 py-1.5 text-sm bg-[#0d4f3c] text-white rounded-lg hover:bg-[#083828] disabled:opacity-50"
                    >
                      {submittingNote ? "提交中..." : "添加备注"}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "history" && (
                <div className="space-y-1">
                  {history.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">暂无动态</p>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-200" />
                      <div className="space-y-4">
                        {[...history].reverse().map((h) => (
                          <div key={h.id} className="flex gap-3 relative">
                            <div className="w-7 h-7 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center flex-shrink-0 z-10">
                              <div className="w-2 h-2 rounded-full bg-[#0d4f3c]" />
                            </div>
                            <div className="flex-1 pb-1">
                              <div className="flex items-baseline justify-between">
                                <span className="text-sm font-medium text-slate-800">{h.detail}</span>
                                <span className="text-xs text-slate-400 ml-2 flex-shrink-0">
                                  {new Date(h.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500">by {h.operator}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
