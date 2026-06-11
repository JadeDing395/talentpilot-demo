import { NextRequest, NextResponse } from "next/server";
import { RadarResult } from "@/lib/claude";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const FEISHU_BASE = "https://open.feishu.cn/open-apis";

async function getAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("未配置飞书应用凭证（FEISHU_APP_ID / FEISHU_APP_SECRET）");
  }
  const res = await fetch(`${FEISHU_BASE}/auth/v3/app_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`飞书 Token 获取失败: ${data.msg}`);
  return data.app_access_token as string;
}

async function feishuPost(token: string, path: string, body: unknown) {
  const res = await fetch(`${FEISHU_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`飞书 API 错误 [${path}]: ${data.msg}`);
  return data;
}

// Feishu Bitable field types
const FieldType = {
  Text: 1,
  Number: 2,
  SingleSelect: 3,
  Url: 15,
} as const;

export async function POST(req: NextRequest) {
  let body: { position: string; results: RadarResult[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const { position, results } = body;
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: "无候选人数据" }, { status: 400, headers: CORS });
  }

  try {
    const token = await getAccessToken();

    // 1. Create Bitable
    const today = new Date().toLocaleDateString("zh-CN");
    const createApp = await feishuPost(token, "/bitable/v1/apps", {
      name: `${position} 候选人扫描 - ${today}`,
    });
    const appToken: string = createApp.data.app.app_token;
    const appUrl: string = createApp.data.app.url;

    // 2. Get default table ID
    const tablesRes = await fetch(`${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tablesData = await tablesRes.json();
    const tableId: string = tablesData.data.items[0].table_id;

    // 3. Add fields (the default table already has one text field; we add the rest)
    const fieldsToAdd = [
      { field_name: "岗位", type: FieldType.Text },
      { field_name: "平台", type: FieldType.SingleSelect },
      { field_name: "主页", type: FieldType.Url },
      { field_name: "联系方式", type: FieldType.Text },
      { field_name: "看机会", type: FieldType.SingleSelect },
      { field_name: "所在项目", type: FieldType.Text },
      { field_name: "地域", type: FieldType.Text },
      { field_name: "粉丝数", type: FieldType.Number },
      { field_name: "总分", type: FieldType.Number },
      { field_name: "评级", type: FieldType.SingleSelect },
      { field_name: "推断岗位", type: FieldType.Text },
      { field_name: "加分项", type: FieldType.Text },
      { field_name: "减分项", type: FieldType.Text },
      { field_name: "作品评价", type: FieldType.Text },
    ];

    // Rename default field to "姓名"
    const fieldsListRes = await fetch(
      `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const fieldsListData = await fieldsListRes.json();
    const defaultFieldId: string = fieldsListData.data.items[0].field_id;

    await fetch(
      `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${defaultFieldId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ field_name: "姓名", type: FieldType.Text }),
      }
    );

    for (const field of fieldsToAdd) {
      await feishuPost(
        token,
        `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
        field
      );
    }

    // 4. Batch insert records (max 500 per call)
    const records = results.map((r) => {
      return {
        fields: {
          姓名: r.name || r.username,
          岗位: r.position_name || "未知",
          平台: r.platform === "weibo" ? "微博" : r.platform === "xiaohongshu" ? "小红书" : "ArtStation",
          主页: { link: r.profile_url, text: r.profile_url },
          联系方式: r.contact ?? "未知",
          看机会: r.open_to_opportunity,
          所在项目: r.current_project ?? "未知",
          地域: r.ip_location || r.location || "未知",
          粉丝数: r.followers_count ?? 0,
          总分: r.total_score,
          评级: r.score_level,
          推断岗位: r.inferred_position,
          加分项: r.pros,
          减分项: r.cons,
          作品评价: r.art_evaluation,
        },
      };
    });

    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
      await feishuPost(
        token,
        `/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
        { records: records.slice(i, i + BATCH) }
      );
    }

    return NextResponse.json({ url: appUrl }, { headers: CORS });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
