import { NextRequest } from "next/server";
import { handleScan, corsOptionsResponse, PlatformAdapter } from "@/lib/scan-handler";
import * as wb from "@/lib/weibo-puppeteer";
import type { NormalizedCandidate } from "@/lib/social-types";

const adapter: PlatformAdapter = {
  platform: "weibo",
  checkLogin: wb.checkLoginStatus,
  delayBetweenQueries: [800, 1500],
  async searchAndFetch(query, opts) {
    // 微博画师召回策略:搜正文反推作者(含画师+路人)→ 串行抓档案(ajax 已加超时,防 hang)
    // → 用【认证 verified_reason + 简介关键词】过滤出真画师,把聊话题的路人筛掉。
    const users = await wb.searchUsers(query, { sort: "hot" });
    const out: NormalizedCandidate[] = [];
    // 多取一些候选作过滤池(路人会被筛掉)
    const pool = users.slice(0, Math.max(opts.perQuery * 3, 12));
    for (const u of pool) {
      if (out.length >= opts.perQuery) break;
      try {
        const profile = await wb.fetchProfile(u.uid);
        const cand = profile ?? u;
        // 画师信号:微博认证含画师/艺术,或简介含美术关键词
        const signal = `${cand.verifiedReason ?? ""} ${cand.description ?? ""}`;
        const isArtist = /画师|插画|原画|绘师|美术|作画|分镜|角色设计|概念设计|约稿|接稿|商稿|illustrat|concept\s*art|artist|画手|设计师/i.test(signal);
        if (!isArtist) continue; // 路人(无画师认证/简介)跳过
        const posts = await wb.fetchRecentPosts(u.uid, 6).catch(() => []);
        out.push(wb.toNormalizedCandidate(cand, posts));
      } catch {
        // 单个失败不阻断
      }
    }
    return out;
  },
  getLastError: wb.getLastPostError,
};

export const OPTIONS = corsOptionsResponse;

export async function POST(req: NextRequest) {
  return handleScan(req, adapter);
}
