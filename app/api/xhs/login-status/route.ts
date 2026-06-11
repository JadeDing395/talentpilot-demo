import { NextResponse } from "next/server";
import { checkLoginStatus, startLoginFlow } from "@/lib/xhs-puppeteer";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function safeErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    const s = JSON.stringify(err);
    return s && s !== "{}" ? s : "未知错误";
  } catch {
    return "未知错误";
  }
}

export async function GET() {
  try {
    const status = await checkLoginStatus();
    return NextResponse.json(status, { headers: CORS });
  } catch (err) {
    return NextResponse.json(
      { loggedIn: false, message: `检查登录失败：${safeErrMsg(err)}` },
      { headers: CORS },
    );
  }
}

export async function POST(req: Request) {
  try {
    const mode = new URL(req.url).searchParams.get("mode") === "window" ? "window" : "qr";
    const status = await startLoginFlow(mode);
    return NextResponse.json(status, { headers: CORS });
  } catch (err) {
    return NextResponse.json(
      { loggedIn: false, message: `打开登录页失败：${safeErrMsg(err)}` },
      { headers: CORS },
    );
  }
}
