"use client";

import { useState } from "react";
import { Stage, Tag } from "@/lib/types";

interface Props {
  stages: Stage[];
  tags: Tag[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AddCandidateModal({ stages, tags, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    portfolio: "",
    skills: "",
    available: true,
    source: "",
    stageId: stages[0]?.id ?? 1,
    tagIds: [] as number[],
    rating: 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleTag = (id: number) => {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(id) ? f.tagIds.filter((t) => t !== id) : [...f.tagIds, id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("姓名不能为空"); return; }
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      skills: form.skills.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
      stageId: Number(form.stageId),
    };
    const res = await fetch("/api/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      onSaved();
    } else {
      setError("保存失败，请重试");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold">添加候选人</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">姓名 *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d4f3c]/30"
                placeholder="候选人姓名"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">邮箱</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d4f3c]/30"
                placeholder="example@mail.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">电话</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d4f3c]/30"
                placeholder="138-xxxx-xxxx"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">城市</label>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d4f3c]/30"
                placeholder="北京"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">来源</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d4f3c]/30 bg-white"
              >
                <option value="">请选择</option>
                {["主动投递", "推荐", "猎头", "内推", "其他"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">作品集链接</label>
              <input
                value={form.portfolio}
                onChange={(e) => setForm({ ...form, portfolio: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d4f3c]/30"
                placeholder="https://..."
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">技能（逗号分隔）</label>
              <input
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d4f3c]/30"
                placeholder="Photoshop, Illustrator, Figma"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">招聘阶段</label>
              <select
                value={form.stageId}
                onChange={(e) => setForm({ ...form, stageId: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d4f3c]/30 bg-white"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.available}
                  onChange={(e) => setForm({ ...form, available: e.target.checked })}
                  className="rounded border-slate-300"
                />
                当前可接触
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">专业标签</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                    form.tagIds.includes(t.id)
                      ? "text-white border-transparent"
                      : "border-slate-300 text-slate-600 hover:border-slate-400"
                  }`}
                  style={form.tagIds.includes(t.id) ? { backgroundColor: t.color, borderColor: t.color } : {}}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-[#0d4f3c] text-white rounded-lg hover:bg-[#083828] disabled:opacity-60"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
