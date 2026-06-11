import { NextRequest, NextResponse } from "next/server";
import { listOutreach } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/userIdentity";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Radar-User-Id",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  return NextResponse.json({ items: listOutreach(userId) }, { headers: CORS });
}
