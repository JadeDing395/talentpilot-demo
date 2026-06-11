import { NextResponse } from "next/server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** ArtStation 公开 API 不需要登录，恒返回 loggedIn=true */
export async function GET() {
  return NextResponse.json(
    { loggedIn: true, message: "ArtStation 公开 API，无需登录" },
    { headers: CORS },
  );
}

export async function POST() {
  return GET();
}
