import { NextRequest, NextResponse } from "next/server";
import { readDB, writeDB, getOrCreateTagId } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/userIdentity";

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  const db = readDB(userId);
  return NextResponse.json(db.tags);
}

// 按名字 idempotent 创建标签——已存在直接返回；不存在创建后返回
export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name 不能为空" }, { status: 400 });

  const db = readDB(userId);
  const id = getOrCreateTagId(db, name);
  writeDB(db, userId);
  const tag = db.tags.find((t) => t.id === id);
  return NextResponse.json(tag);
}
