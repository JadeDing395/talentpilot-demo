import { NextRequest, NextResponse } from "next/server";
import { synthesizeICPForUser, type ICPInput } from "@/lib/icp";
import { type AiClientConfig } from "@/lib/scoring-config";
import { getUserIdFromRequest } from "@/lib/userIdentity";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Radar-User-Id",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: { input?: ICPInput; aiConfig?: AiClientConfig };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400, headers: CORS });
  }

  if (!body.input) {
    return NextResponse.json({ error: "缺少 input" }, { status: 400, headers: CORS });
  }

  try {
    const userId = getUserIdFromRequest(req);
    const icp = await synthesizeICPForUser(userId, body.input, body.aiConfig ?? {});
    return NextResponse.json({ icp }, { headers: CORS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500, headers: CORS });
  }
}
