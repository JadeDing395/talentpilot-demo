import { NextRequest, NextResponse } from "next/server";
import { readDB, writeDB, addHistory } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/userIdentity";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromRequest(req);
  const { id } = await params;
  const db = readDB(userId);
  const candidate = db.candidates.find((c) => c.id === Number(id));
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notes = db.notes.filter((n) => n.candidateId === Number(id));
  const history = db.history.filter((h) => h.candidateId === Number(id));
  const stage = db.stages.find((s) => s.id === candidate.stageId);
  const tags = db.tags.filter((t) => candidate.tagIds.includes(t.id));

  return NextResponse.json({ candidate, notes, history, stage, tags, allStages: db.stages, allTags: db.tags });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromRequest(req);
  const { id } = await params;
  const body = await req.json();
  const db = readDB(userId);

  const idx = db.candidates.findIndex((c) => c.id === Number(id));
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prev = db.candidates[idx];

  // Track stage change
  if (body.stageId !== undefined && body.stageId !== prev.stageId) {
    const stageName = db.stages.find((s) => s.id === body.stageId)?.name ?? "";
    addHistory(db, prev.id, "stage_change", `阶段变更为「${stageName}」`, body.operator ?? "HR");
  }

  // Track rating change
  if (body.rating !== undefined && body.rating !== prev.rating) {
    addHistory(db, prev.id, "rating_change", `评分更新为 ${body.rating} 星`, body.operator ?? "HR");
  }

  // Track favorite toggle
  if (body.favorite !== undefined && body.favorite !== prev.favorite) {
    addHistory(db, prev.id, "favorite", body.favorite ? "已加入收藏" : "已取消收藏", body.operator ?? "HR");
  }

  db.candidates[idx] = {
    ...prev,
    ...body,
    id: prev.id,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
  };

  writeDB(db, userId);
  return NextResponse.json(db.candidates[idx]);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromRequest(req);
  const { id } = await params;
  const db = readDB(userId);
  const idx = db.candidates.findIndex((c) => c.id === Number(id));
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  db.candidates.splice(idx, 1);
  db.notes = db.notes.filter((n) => n.candidateId !== Number(id));
  db.history = db.history.filter((h) => h.candidateId !== Number(id));
  writeDB(db, userId);
  return NextResponse.json({ ok: true });
}
