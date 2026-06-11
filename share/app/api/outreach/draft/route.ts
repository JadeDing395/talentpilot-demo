import { NextRequest, NextResponse } from "next/server";
import { upsertOutreach } from "@/lib/db";
import { generateOutreachDraft, getOutreachCandidateId } from "@/lib/outreach";
import type { RadarResult, AiClientConfig } from "@/lib/scoring-config";
import { getUserIdFromRequest } from "@/lib/userIdentity";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Radar-User-Id",
};

interface DraftBody {
  candidate?: RadarResult;
  jd?: string;
  position?: string;
  companyAdvantages?: string;
  aiConfig?: AiClientConfig;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: DraftBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400, headers: CORS });
  }

  if (!body.candidate) {
    return NextResponse.json({ error: "缺少 candidate" }, { status: 400, headers: CORS });
  }

  const userId = getUserIdFromRequest(req);

  try {
    const { message } = await generateOutreachDraft(userId, {
      candidate: body.candidate,
      jd: body.jd,
      position: body.position,
      companyAdvantages: body.companyAdvantages,
      aiConfig: body.aiConfig,
    });

    if (!message) {
      throw new Error("AI 未生成有效触达文案");
    }

    upsertOutreach(userId, {
      candidateId: getOutreachCandidateId(body.candidate),
      platform: body.candidate.platform,
      candidateName: body.candidate.name,
      message,
      status: "draft",
      createdAt: new Date().toISOString(),
      sentAt: undefined,
    });

    return NextResponse.json({ message }, { headers: CORS });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg.slice(0, 500) }, { status: 500, headers: CORS });
  }
}
