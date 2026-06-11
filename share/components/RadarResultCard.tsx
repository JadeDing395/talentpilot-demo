"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { RadarResult, ScoreWeights, DEFAULT_WEIGHTS } from "@/lib/scoring-config";
import type { Platform } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";
import { loadAiConfig } from "./AiSettingsModal";

interface Props {
  result: RadarResult;
  weights?: ScoreWeights;
  /** 可选;若未传则使用 result.platform 自身的平台(混排场景) */
  platform?: Platform;
}

const LEVEL_STYLES: Record<string, string> = {
  "高度匹配": "bg-emerald-100 text-emerald-800",
  "较高匹配": "bg-amber-50 text-amber-800",
  "可关注": "bg-amber-100 text-amber-800",
  "低匹配": "bg-slate-100 text-slate-500",
};

const REGION_STYLES: Record<string, string> = {
  "确认中国区域": "bg-red-100 text-red-700",
  "疑似中国区域": "bg-orange-100 text-orange-700",
  "非中国区域": "bg-slate-100 text-slate-500",
};

const OUTREACH_STATUS_STYLES = {
  draft: "bg-amber-50 text-amber-700 border border-amber-200",
  sent: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  unsubscribed: "bg-slate-100 text-slate-500 border border-slate-200",
} as const;

const FORM_STORAGE = "radar-form-global";
const OUTREACH_ADV_STORAGE = "radar-outreach-company-advantages";

interface OutreachLedgerItem {
  candidateId: string;
  platform: Platform;
  candidateName: string;
  message: string;
  status: "draft" | "sent" | "unsubscribed";
  createdAt: string;
  sentAt?: string;
}

function getCandidateId(result: RadarResult): string {
  return `${result.platform}:${result.platform_user_id}`;
}

function loadOutreachContext(): { position?: string; jd?: string; companyAdvantages?: string } {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FORM_STORAGE);
    const form = raw ? JSON.parse(raw) as { position?: string; jd?: string } : {};
    return {
      position: form.position?.trim() || undefined,
      jd: form.jd?.trim() || undefined,
      companyAdvantages: localStorage.getItem(OUTREACH_ADV_STORAGE)?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

function formatSentAt(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-slate-500 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--color-brand)" }} />
      </div>
      <span className="w-10 text-right text-slate-600 font-medium">{value}/{max}</span>
    </div>
  );
}

export default function RadarResultCard({ result, weights = DEFAULT_WEIGHTS, platform }: Props) {
  const activePlatform: Platform = platform ?? result.platform;
  const candidateId = useMemo(() => getCandidateId(result), [result]);
  const totalMax =
    weights.jd + weights.keyword + weights.experience +
    weights.education + weights.openness + weights.followers;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [outreachStatus, setOutreachStatus] = useState<OutreachLedgerItem["status"] | null>(null);
  const [sentAt, setSentAt] = useState("");
  const [outreachError, setOutreachError] = useState("");

  const apiPath = `${PLATFORMS[activePlatform].apiPrefix}/save`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/outreach", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const existing = (data.items as OutreachLedgerItem[] | undefined)?.find((item) => item.candidateId === candidateId);
        if (!existing || cancelled) return;
        setDraftText(existing.message);
        setOutreachStatus(existing.status);
        setSentAt(existing.sentAt ?? "");
        setDraftOpen(existing.status === "draft");
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (res.ok || res.status === 409) {
        setSaved(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "保存失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDraft = async () => {
    setDraftLoading(true);
    setOutreachError("");
    try {
      const aiConfig = loadAiConfig();
      const context = loadOutreachContext();
      const res = await fetch("/api/outreach/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: result,
          position: context.position,
          jd: context.jd,
          companyAdvantages: context.companyAdvantages,
          aiConfig,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.message) {
        throw new Error(data.error || "触达草稿生成失败");
      }
      setDraftText(data.message);
      setDraftOpen(true);
      setOutreachStatus("draft");
      setSentAt("");
    } catch (err) {
      setOutreachError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSend = async () => {
    if (!draftText.trim()) {
      setOutreachError("请先生成或填写触达草稿");
      return;
    }
    setSending(true);
    setOutreachError("");
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          platform: result.platform,
          message: draftText,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "确认发送失败");
      }
      setOutreachStatus("sent");
      setSentAt(data.sentAt || "");
      setDraftOpen(false);
    } catch (err) {
      setOutreachError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      <div className="flex gap-4">
        {result.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.avatar_url} alt={result.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center font-bold flex-shrink-0"
            style={{ backgroundColor: PLATFORMS[activePlatform].badge.bg, color: PLATFORMS[activePlatform].badge.fg }}
          >
            {result.name[0]}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={result.profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-900 hover:text-slate-700"
            >
              {result.name}
            </a>
            {result.verified && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded text-white"
                style={{ backgroundColor: PLATFORMS[activePlatform].color.brand }}
                title={result.verified_reason ?? "已认证"}
              >
                ✓ 认证
              </span>
            )}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: PLATFORMS[activePlatform].badge.bg, color: PLATFORMS[activePlatform].badge.fg }}
            >
              {PLATFORMS[activePlatform].label}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${REGION_STYLES[result.region_confidence]}`}>
              {result.region_confidence}
            </span>
            {outreachStatus === "sent" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                ✓ 已确认发送 {formatSentAt(sentAt)}
              </span>
            )}
            {outreachStatus === "unsubscribed" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                已退订
              </span>
            )}
          </div>
          {result.headline && (
            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{result.headline}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
            {typeof result.followers_count === "number" && (
              <span className="tabular-nums">👥 {result.followers_count.toLocaleString()} 粉</span>
            )}
            {typeof result.posts_count === "number" && (
              <span className="tabular-nums">📝 {result.posts_count.toLocaleString()}</span>
            )}
            {result.ip_location && <span>📍 {result.ip_location}</span>}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-3xl font-bold tabnum" style={{ color: "var(--color-brand)" }}>{result.total_score}</div>
          <div className="text-[10px] text-slate-400">/ {totalMax}</div>
          <span className={`mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-medium ${LEVEL_STYLES[result.score_level]}`}>
            {result.score_level}
          </span>
        </div>
      </div>

      {/* 作品图网格（vision 用过的） */}
      {result.recent_work_images.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {result.recent_work_images.slice(0, 4).map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt=""
              className="w-full aspect-square object-cover rounded-lg border border-slate-200"
              loading="lazy"
            />
          ))}
        </div>
      )}

      <div className="mt-4 space-y-1.5">
        <ScoreBar label="JD 匹配度" value={result.score_breakdown.jd_match} max={weights.jd} />
        <ScoreBar label="关键词匹配" value={result.score_breakdown.keyword_match} max={weights.keyword} />
        <ScoreBar label="背景经验" value={result.score_breakdown.experience_match} max={weights.experience} />
        <ScoreBar label="教育与履历" value={result.score_breakdown.education_match} max={weights.education} />
        <ScoreBar label="开放度" value={result.score_breakdown.openness} max={weights.openness} />
        <ScoreBar label="粉丝影响力" value={result.score_breakdown.followers} max={weights.followers} />
      </div>

      <div className="mt-4 space-y-2 text-xs">
        <div className="text-emerald-700">
          <span className="font-semibold">+ </span>{result.pros}
        </div>
        <div className="text-rose-600">
          <span className="font-semibold">− </span>{result.cons}
        </div>
        <div className="text-slate-600 italic">"{result.art_evaluation}"</div>
        {result.vision_used && (
          <div className="text-[10px] text-slate-400">👁 本次评分参考了候选人的作品图</div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-800">专属触达草稿</div>
            <div className="text-[11px] text-slate-400 mt-1">AI 只生成草稿，必须由你人工确认后才会标记发送。</div>
          </div>
          <div className="flex items-center gap-2">
            {outreachStatus && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${OUTREACH_STATUS_STYLES[outreachStatus]}`}>
                {outreachStatus === "draft" ? "草稿" : outreachStatus === "sent" ? "已确认发送" : "已退订"}
              </span>
            )}
            <button
              onClick={handleGenerateDraft}
              disabled={draftLoading || sending || outreachStatus === "sent"}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {draftLoading ? "生成中..." : draftText ? "重新生成" : "✍️ 生成触达草稿"}
            </button>
          </div>
        </div>

        {draftOpen && (
          <div className="mt-3 space-y-3">
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={5}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-400/30 transition-shadow"
              placeholder="这里会出现 AI 基于候选人画像生成的个性化触达开场白"
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] text-slate-400">确认发送只会记入本地触达台账，不会自动群发。</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateDraft}
                  disabled={draftLoading || sending}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {draftLoading ? "生成中..." : "重新生成"}
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || draftLoading || !draftText.trim()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-brand)" }}
                >
                  {sending ? "发送中..." : "✅ 确认发送"}
                </button>
              </div>
            </div>
          </div>
        )}

        {outreachStatus === "sent" && (
          <div className="mt-3 text-[11px] text-emerald-700">
            ✓ 已确认发送 {formatSentAt(sentAt)} · 已记入触达台账，候选人可随时退订
          </div>
        )}
        {outreachError && <p className="text-xs text-rose-600 mt-3">{outreachError}</p>}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        <div className="space-y-0.5">
          {result.contact && <div>📞 {result.contact}</div>}
          {result.current_project && <div>🏢 {result.current_project}</div>}
          <div className="text-[10px] text-slate-400">{result.open_to_opportunity}</div>
        </div>
        <div className="flex gap-2">
          <a
            href={result.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            主页
          </a>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium ${
              saved ? "bg-emerald-100 text-emerald-700" : "text-white disabled:opacity-60"
            }`}
            style={!saved ? { backgroundColor: "var(--color-brand)" } : undefined}
          >
            {saved ? "✓ 已入库" : saving ? "..." : "入库"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}

      {result.suggested_tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {result.suggested_tags.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              #{t}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
