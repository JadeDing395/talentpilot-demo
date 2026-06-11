import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "puppeteer",
    "puppeteer-core",
    "puppeteer-extra",
    "puppeteer-extra-plugin",
    "puppeteer-extra-plugin-stealth",
    "pdf-parse",
    "mammoth",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.sinaimg.cn" },
      { protocol: "https", hostname: "**.weibocdn.com" },
      { protocol: "https", hostname: "**.xhscdn.com" },
      { protocol: "https", hostname: "**.xiaohongshu.com" },
    ],
  },
  ...(process.env.NEXT_BUILD_STANDALONE === "true" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
