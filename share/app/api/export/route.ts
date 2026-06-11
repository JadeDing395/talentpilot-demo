import { NextRequest, NextResponse } from "next/server";
import { readDB } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/userIdentity";

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const stageId = searchParams.get("stageId");
  const tagId = searchParams.get("tagId");
  const favorite = searchParams.get("favorite");

  const db = readDB(userId);
  let candidates = db.candidates;

  if (stageId) candidates = candidates.filter((c) => c.stageId === Number(stageId));
  if (tagId) candidates = candidates.filter((c) => c.tagIds.includes(Number(tagId)));
  if (favorite === "true") candidates = candidates.filter((c) => c.favorite);

  const stageMap = Object.fromEntries(db.stages.map((s) => [s.id, s.name]));
  const tagMap = Object.fromEntries(db.tags.map((t) => [t.id, t.name]));

  const headers = ["ID", "姓名", "邮箱", "电话", "城市", "作品集", "技能", "标签", "阶段", "评分", "收藏", "来源", "可接项目", "创建时间"];
  const rows = candidates.map((c) => [
    c.id,
    c.name,
    c.email ?? "",
    c.phone ?? "",
    c.location ?? "",
    c.portfolio ?? "",
    c.skills.join(" / "),
    c.tagIds.map((t) => tagMap[t] ?? "").join(" / "),
    stageMap[c.stageId] ?? "",
    c.rating,
    c.favorite ? "是" : "否",
    c.source ?? "",
    c.available ? "是" : "否",
    new Date(c.createdAt).toLocaleDateString("zh-CN"),
  ]);

  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const bom = "\uFEFF"; // UTF-8 BOM for Excel
  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="candidates_${Date.now()}.csv"`,
    },
  });
}
