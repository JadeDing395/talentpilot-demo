import { NextRequest } from "next/server";
import { handleScan, corsOptionsResponse, PlatformAdapter } from "@/lib/scan-handler";
import * as as from "@/lib/artstation";
import type { NormalizedCandidate } from "@/lib/social-types";

const adapter: PlatformAdapter = {
  platform: "artstation",
  checkLogin: async () => ({ loggedIn: true, message: "ArtStation 公开 API，无需登录" }),
  delayBetweenQueries: [400, 800],
  async searchAndFetch(query, opts) {
    const users = await as.searchUsers(query, { maxUsers: opts.perQuery * 2 });
    const out: NormalizedCandidate[] = [];
    for (const u of users.slice(0, opts.perQuery)) {
      try {
        const [profile, projects] = await Promise.all([
          as.fetchProfile(u.username),
          as.fetchProjects(u.username, opts.postsLimit),
        ]);
        const merged: as.ASUser = { ...u, ...profile };
        out.push(as.toNormalizedCandidate(merged, projects));
        await as.delay(200 + Math.random() * 300);
      } catch {
        // ignore one failure
      }
    }
    return out;
  },
  getLastError: as.getLastPostError,
};

export const OPTIONS = corsOptionsResponse;

export async function POST(req: NextRequest) {
  return handleScan(req, adapter);
}
