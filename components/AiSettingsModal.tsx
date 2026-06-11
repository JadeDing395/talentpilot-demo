"use client";

import { useEffect, useState } from "react";
import {
  AiClientConfig,
  DEFAULT_BASE_URL_PLACEHOLDER,
  DEFAULT_GATEWAY_DASHBOARD_URL,
  DEFAULT_MONTHLY_QUOTA_USD,
} from "@/lib/scoring-config";
import { MODEL_OPTIONS, DEFAULT_MODEL_ID, inferProtocol, supportsVision } from "@/lib/models";

const STORAGE_KEY = "radar-ai-config";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (cfg: AiClientConfig) => void;
}

export function loadAiConfig(): AiClientConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AiClientConfig;
  } catch {
    return {};
  }
}

export function saveAiConfig(cfg: AiClientConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

interface TestResult {
  ok: boolean;
  message: string;
  detail?: string;
}

export default function AiSettingsModal({ open, onClose, onSaved }: Props) {
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [customModel, setCustomModel] = useState("");
  const [protocol, setProtocol] = useState<"anthropic" | "openai-compatible">("anthropic");
  const [visionEnabled, setVisionEnabled] = useState(true);
  const [monthlyQuotaUSD, setMonthlyQuotaUSD] = useState<number>(DEFAULT_MONTHLY_QUOTA_USD);
  const [gatewayDashboardUrl, setGatewayDashboardUrl] = useState(DEFAULT_GATEWAY_DASHBOARD_URL);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    if (open) {
      const cfg = loadAiConfig();
      setBaseURL(cfg.baseURL ?? "");
      setApiKey(cfg.apiKey ?? "");
      const m = cfg.model ?? DEFAULT_MODEL_ID;
      const known = MODEL_OPTIONS.find((o) => o.id === m);
      if (known) {
        setModel(m);
        setCustomModel("");
      } else {
        setModel("__custom__");
        setCustomModel(m);
      }
      setProtocol(cfg.protocol ?? inferProtocol(m));
      setVisionEnabled(cfg.visionEnabled ?? true);
      setMonthlyQuotaUSD(cfg.monthlyQuotaUSD ?? DEFAULT_MONTHLY_QUOTA_USD);
      setGatewayDashboardUrl(cfg.gatewayDashboardUrl ?? DEFAULT_GATEWAY_DASHBOARD_URL);
      setTestResult(null);
    }
  }, [open]);

  // 选模型时联动协议
  useEffect(() => {
    if (model && model !== "__custom__") {
      setProtocol(inferProtocol(model));
    }
  }, [model]);

  const effectiveModel = model === "__custom__" ? customModel.trim() : model;

  const buildConfig = (): AiClientConfig => ({
    protocol,
    baseURL: baseURL.trim() || undefined,
    apiKey: apiKey.trim() || undefined,
    model: effectiveModel || undefined,
    visionEnabled,
    monthlyQuotaUSD: Number(monthlyQuotaUSD) || DEFAULT_MONTHLY_QUOTA_USD,
    gatewayDashboardUrl: gatewayDashboardUrl.trim() || DEFAULT_GATEWAY_DASHBOARD_URL,
  });

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestResult({ ok: false, message: "请先填入 API Key" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiConfig: buildConfig() }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({
          ok: true,
          message: `连接成功 (${data.latencyMs}ms)`,
          detail: `${data.model} 回复："${data.reply}"`,
        });
      } else {
        setTestResult({
          ok: false,
          message: data.error || "测试失败",
          detail: data.rawError,
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: "网络错误",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  if (!open) return null;

  const handleSave = () => {
    const cfg = buildConfig();
    saveAiConfig(cfg);
    onSaved?.(cfg);
    onClose();
  };

  const handleClear = () => {
    if (!confirm("确认清空 AI 配置？后续扫描会失败。")) return;
    localStorage.removeItem(STORAGE_KEY);
    setBaseURL("");
    setApiKey("");
    setModel(DEFAULT_MODEL_ID);
    setCustomModel("");
    onSaved?.({});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">AI 服务配置</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <p className="text-xs text-slate-500 mb-5 leading-relaxed">
          配置一次后会自动保存在你浏览器本地，下次进来直接用。
          <strong className="text-amber-600"> API Key 不会上传到服务器或别处。</strong>
        </p>

        <div className="space-y-4">
          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">API Base URL</label>
            <input
              type="text"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder={`例如 ${DEFAULT_BASE_URL_PLACEHOLDER}`}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400/30 font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">公司 AI Gateway 或 LiteLLM 网关；留空走官方 Anthropic/OpenAI API</p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              API Key <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full pl-3 pr-16 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400/30 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700 px-2"
              >
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
          </div>

          {/* 模型选择 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">模型 (Model)</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400/30 bg-white"
            >
              <optgroup label="Anthropic Claude">
                {MODEL_OPTIONS.filter((o) => o.vendor === "anthropic").map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </optgroup>
              <optgroup label="OpenAI GPT">
                {MODEL_OPTIONS.filter((o) => o.vendor === "openai").map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </optgroup>
              <option value="__custom__">自定义模型 ID...</option>
            </select>
            {model === "__custom__" && (
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="输入 gateway 上的自定义模型 ID"
                className="mt-2 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400/30 font-mono"
              />
            )}
          </div>

          {/* 协议选择 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">API 协议</label>
            <div className="flex gap-2">
              {(["anthropic", "openai-compatible"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProtocol(p)}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg border transition ${
                    protocol === p
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {p === "anthropic" ? "Anthropic /v1/messages" : "OpenAI 兼容 /v1/chat/completions"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">选 Claude 默认走 Anthropic；选 GPT 默认走 OpenAI 兼容。Gateway 一般两个都支持。</p>
          </div>

          {/* Vision 开关 */}
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
            <div>
              <div className="text-xs font-medium text-slate-700">AI 看图评分</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                抽 3-5 张作品图给 AI 看，评分更准但更贵
                {effectiveModel && !supportsVision(effectiveModel) && (
                  <span className="text-amber-600">（当前模型不支持 vision，会自动降级）</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setVisionEnabled(!visionEnabled)}
              className={`relative w-10 h-5 rounded-full transition ${
                visionEnabled ? "bg-slate-900" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  visionEnabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* 高级 */}
          <div>
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              {advanced ? "▾" : "▸"} 高级（配额 / 看板 URL）
            </button>
            {advanced && (
              <div className="mt-2 space-y-3 border-l-2 border-slate-100 pl-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">月度配额 (USD)</label>
                  <input
                    type="number"
                    min={1}
                    value={monthlyQuotaUSD}
                    onChange={(e) => setMonthlyQuotaUSD(Number(e.target.value) || DEFAULT_MONTHLY_QUOTA_USD)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">用于扫描页底部 Gateway 配额面板的进度条</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Gateway Dashboard URL</label>
                  <input
                    type="text"
                    value={gatewayDashboardUrl}
                    onChange={(e) => setGatewayDashboardUrl(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400/30 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">配额面板点击后跳转到这个地址</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 测试结果 */}
        {testResult && (
          <div
            className={`mt-4 px-3 py-2.5 rounded-lg text-xs ${
              testResult.ok
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}
          >
            <p className="font-semibold flex items-center gap-1.5">
              {testResult.ok ? "✓" : "✗"} {testResult.message}
            </p>
            {testResult.detail && (
              <p className="text-[11px] opacity-80 mt-1 break-all">{testResult.detail}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
          <button onClick={handleClear} className="text-xs text-rose-600 hover:underline">
            清空配置
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleTest}
              disabled={!apiKey.trim() || testing}
              className="px-3 py-2 text-sm border border-slate-300 text-slate-700 bg-slate-50 rounded-lg hover:bg-slate-100 disabled:opacity-50"
            >
              {testing ? "测试中..." : "测试连接"}
            </button>
            <button
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="px-3 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
