"use client";

import BrandHeader from "@/components/BrandHeader";
import { TrendingUp, Users, Network, Target, Sparkles } from "lucide-react";

// 对外:人才市场 / 竞争洞察
const OUTBOUND_DIMENSIONS = [
  "人才分布地图(地域 / 平台 / 远程)",
  "技能热度 & 组合趋势",
  "稀缺度 / 供需指数",
  "竞品人才流动(我司 vs 竞品 流入流出)",
  "可挖性评分 & persona 聚类",
  "薪资带预估 & 背景来源",
  "触达响应预测 & 渠道 ROI",
  "行动建议(优先挖谁、从哪挖)",
];

// 对内:技能盘点 / 人才地图
const INBOUND_DIMENSIONS = [
  "技能缺口热力图",
  "9-Box & 隐藏高潜识别",
  "继任池就绪度 & 关键岗位单点风险",
  "活水匹配(员工 ↔ 内部机会)",
  "跨部门流动网络",
  "晋升通道断层分析",
  "供给 vs 需求预测",
  "培养 / 调岗建议",
];

function DimensionList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it} className="flex items-start gap-2 text-sm text-slate-500">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export default function InsightsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <BrandHeader />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-8">
        {/* 头部 */}
        <div className="text-center space-y-3 py-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 text-rose-500 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            开发中 · 敬请期待
          </div>
          <h1 className="text-3xl font-bold text-slate-900">数据洞察</h1>
          <p className="text-slate-500 max-w-2xl mx-auto leading-relaxed">
            把人才库从「静态档案」升级为「动态情报资产」——基于真实抓取样本,生成人才市场洞察与企业内部人才地图。
            <br />
            <span className="text-xs text-slate-400">所有维度仅基于真实数据,不编造数字;维度按数据可得性动态裁剪。</span>
          </p>
        </div>

        {/* 两轨洞察预览 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="border border-dashed border-slate-300 rounded-2xl p-6 bg-slate-50/60">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-700">对外 · 人才市场 / 竞争洞察</div>
                <div className="text-xs text-slate-400">主动寻访轨</div>
              </div>
            </div>
            <DimensionList items={OUTBOUND_DIMENSIONS} />
          </div>

          <div className="border border-dashed border-slate-300 rounded-2xl p-6 bg-slate-50/60">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-700">对内 · 技能盘点 / 人才地图</div>
                <div className="text-xs text-slate-400">内部活水轨</div>
              </div>
            </div>
            <DimensionList items={INBOUND_DIMENSIONS} />
          </div>
        </div>

        {/* 底部说明 */}
        <div className="flex items-center justify-center gap-6 text-xs text-slate-400 pt-2">
          <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> 一套引擎,双轨复用</span>
          <span className="inline-flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> 招聘工具 → AI 招聘官引擎</span>
        </div>
      </main>
    </div>
  );
}
