import { NextRequest, NextResponse } from "next/server";
import { getUsageSnapshot } from "@/lib/usage";
import { getUserIdFromRequest } from "@/lib/userIdentity";
import { DEFAULT_MONTHLY_QUOTA_USD } from "@/lib/scoring-config";

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
  const snap = getUsageSnapshot(userId);
  const url = new URL(req.url);
  const quotaParam = url.searchParams.get("quota");
  const monthlyQuotaUSD = quotaParam ? Number(quotaParam) || DEFAULT_MONTHLY_QUOTA_USD : DEFAULT_MONTHLY_QUOTA_USD;
  const percentOfQuota = monthlyQuotaUSD > 0 ? (snap.currentMonth.usd / monthlyQuotaUSD) * 100 : 0;
  return NextResponse.json(
    {
      today: snap.today,
      currentMonth: snap.currentMonth,
      totals: snap.totals,
      byModel: snap.byModel,
      monthlyQuotaUSD,
      percentOfQuota,
      todayKey: snap.todayKey,
      monthKey: snap.monthKey,
      lastUpdated: snap.lastUpdated,
    },
    { headers: CORS },
  );
}
