import { NextRequest, NextResponse } from "next/server";
import { readDB, writeDB, addHistory, Candidate } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/userIdentity";

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.toLowerCase() ?? "";
  const stageId = searchParams.get("stageId");
  const tagId = searchParams.get("tagId");
  const available = searchParams.get("available");
  const favorite = searchParams.get("favorite");
  const platform = searchParams.get("platform"); // weibo | xiaohongshu | all

  const db = readDB(userId);
  let candidates = db.candidates;

  if (q) {
    candidates = candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.location?.toLowerCase().includes(q) ?? false) ||
        c.skills.some((s) => s.toLowerCase().includes(q))
    );
  }
  if (stageId) candidates = candidates.filter((c) => c.stageId === Number(stageId));
  if (tagId) candidates = candidates.filter((c) => c.tagIds.includes(Number(tagId)));
  if (available === "true") candidates = candidates.filter((c) => c.available);
  if (favorite === "true") candidates = candidates.filter((c) => c.favorite);
  if (platform && platform !== "all") {
    candidates = candidates.filter((c) => c.source === platform);
  }

  return NextResponse.json({ candidates, stages: db.stages, tags: db.tags });
}

export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  const body = await req.json();
  const db = readDB(userId);

  const now = new Date().toISOString();
  const candidate: Candidate = {
    id: db.nextId.candidates++,
    name: body.name,
    email: body.email ?? null,
    phone: body.phone ?? null,
    location: body.location ?? null,
    portfolio: body.portfolio ?? null,
    skills: body.skills ?? [],
    available: body.available ?? true,
    source: body.source ?? null,
    stageId: body.stageId ?? db.stages[0].id,
    tagIds: body.tagIds ?? [],
    rating: body.rating ?? 0,
    favorite: false,
    avatarUrl: body.avatarUrl ?? null,
    createdAt: now,
    updatedAt: now,
    platformUserId: body.platformUserId ?? null,
    profileUrl: body.profileUrl ?? body.portfolio ?? null,
    followersCount: body.followersCount ?? null,
    postsCount: body.postsCount ?? null,
    ipLocation: body.ipLocation ?? null,
    verified: body.verified ?? false,
    verifiedReason: body.verifiedReason ?? null,
  };

  db.candidates.push(candidate);
  addHistory(db, candidate.id, "created", "候选人档案已创建", body.operator ?? "HR");
  addHistory(
    db,
    candidate.id,
    "stage_change",
    `阶段变更为「${db.stages.find((s) => s.id === candidate.stageId)?.name ?? ""}」`,
    body.operator ?? "HR"
  );
  writeDB(db, userId);

  return NextResponse.json(candidate, { status: 201 });
}
