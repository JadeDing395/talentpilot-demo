/**
 * 平台无关的"保存扫描结果到候选人库"工具。
 * /api/weibo/save 和 /api/xhs/save 都调用 saveRadarResult。
 */

import { NextRequest, NextResponse } from "next/server";
import { readDB, writeDB, addHistory, getOrCreateTagId, findBySocialId } from "./db";
import { getUserIdFromRequest } from "./userIdentity";
import { RadarResult } from "./scoring-config";
import type { Candidate, Platform } from "./types";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Radar-User-Id",
};

export function corsOptionsResponse() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function handleSave(req: NextRequest, expectedPlatform: Platform): Promise<Response> {
  const userId = getUserIdFromRequest(req);
  let body: RadarResult;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  if (body.platform !== expectedPlatform) {
    return NextResponse.json(
      { error: `平台不匹配（期望 ${expectedPlatform}，收到 ${body.platform}）` },
      { status: 400, headers: CORS },
    );
  }

  const db = readDB(userId);
  const existing = findBySocialId(db, expectedPlatform, body.platform_user_id);
  if (existing) {
    return NextResponse.json(
      { message: "候选人已存在", id: existing.id },
      { status: 409, headers: CORS },
    );
  }

  // 自动建标签
  const tagIds: number[] = [];
  for (const tagName of body.suggested_tags ?? []) {
    const id = getOrCreateTagId(db, tagName);
    if (id) tagIds.push(id);
  }

  const now = new Date().toISOString();
  const candidate: Candidate = {
    id: db.nextId.candidates++,
    name: body.name || body.username,
    email: null,
    phone: null,
    location: body.ip_location || body.location || null,
    portfolio: body.profile_url,
    skills: [],
    available: !!body.available_for_work,
    source: expectedPlatform,
    stageId: db.stages[0].id,
    tagIds,
    rating: Math.min(5, Math.round(body.total_score / 20)),
    favorite: false,
    avatarUrl: body.avatar_url,
    createdAt: now,
    updatedAt: now,
    platformUserId: body.platform_user_id,
    profileUrl: body.profile_url,
    followersCount: body.followers_count,
    postsCount: body.posts_count,
    ipLocation: body.ip_location,
    verified: body.verified,
    verifiedReason: body.verified_reason,
  };
  db.candidates.push(candidate);

  addHistory(
    db,
    candidate.id,
    "imported",
    `从 ${expectedPlatform === "weibo" ? "微博" : "小红书"} 扫描入库 · 评分 ${body.total_score}（${body.score_level}）· ${body.inferred_position}`,
    "Radar",
  );
  // 也写一条评分明细
  addHistory(
    db,
    candidate.id,
    "ai_score",
    `加分：${body.pros}\n减分：${body.cons}\n作品评价：${body.art_evaluation}`,
    "AI",
  );

  writeDB(db, userId);
  return NextResponse.json({ id: candidate.id, candidate }, { status: 201, headers: CORS });
}
