import { redirect } from "next/navigation";

/** 兼容旧版 /radar 路由 → /scan(统一扫描页) */
export default function RadarRedirect() {
  redirect("/scan");
}
