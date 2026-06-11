import { NextRequest, NextResponse } from "next/server";
import { markSent, upsertOutreach } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/userIdentity";
import type { Platform } from "@/lib/types";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Radar-User-Id",
};

interface SendBody {
  candidateId?: string;
  platform?: Platform;
  message?: string;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400, headers: CORS });
  }

  if (!body.candidateId || !body.platform || !body.message?.trim()) {
    return NextResponse.json({ error: "缺少 candidateId / platform / message" }, { status: 400, headers: CORS });
  }

  const userId = getUserIdFromRequest(req);
  let updated = markSent(userId, body.candidateId);
  if (!updated) {
    upsertOutreach(userId, {
      candidateId: body.candidateId,
      platform: body.platform,
      candidateName: body.candidateId,
      message: body.message.trim(),
      status: "draft",
      createdAt: new Date().toISOString(),
    });
    updated = markSent(userId, body.candidateId);
  }
  if (!updated?.sentAt) {
    return NextResponse.json({ error: "触达台账写入失败" }, { status: 500, headers: CORS });
  }

  return NextResponse.json({ ok: true, sentAt: updated.sentAt }, { headers: CORS });
}
