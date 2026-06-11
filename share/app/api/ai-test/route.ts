import { NextRequest, NextResponse } from "next/server";
import { pingAi } from "@/lib/claude";
import { AiClientConfig } from "@/lib/scoring-config";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * 用用户提供的 AI 配置发一次最小测试请求（双协议自动分流）。
 * Body: { aiConfig: AiClientConfig }
 * 成功返回 { ok: true, model, latencyMs, reply }
 * 失败返回 { ok: false, error, rawError }
 */
export async function POST(req: NextRequest) {
  let body: { aiConfig?: AiClientConfig };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400, headers: CORS });
  }
  const cfg = body.aiConfig ?? {};
  if (!cfg.apiKey?.trim()) {
    return NextResponse.json({ ok: false, error: "未提供 API Key" }, { status: 400, headers: CORS });
  }

  const t0 = Date.now();
  try {
    const { reply, model } = await pingAi(cfg);
    return NextResponse.json(
      { ok: true, model, latencyMs: Date.now() - t0, reply },
      { headers: CORS },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let hint = "";
    if (/401|unauthorized|invalid.*key/i.test(msg)) hint = "API Key 无效或权限不足";
    else if (/404|not.*found/i.test(msg)) hint = "Base URL 或 Model 名称错误";
    else if (/429|rate/i.test(msg)) hint = "频率超限或余额不足";
    else if (/timeout|fetch.*fail|network/i.test(msg)) hint = "网络无法访问该 Base URL";
    else if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) hint = "Base URL 域名解析失败";
    return NextResponse.json(
      { ok: false, error: hint || msg, rawError: msg.slice(0, 300) },
      { headers: CORS },
    );
  }
}
