import { NextRequest, NextResponse } from "next/server";
import { readDB } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/userIdentity";

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  const db = readDB(userId);
  return NextResponse.json(db.stages);
}
