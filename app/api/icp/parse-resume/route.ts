import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Radar-User-Id",
};

interface ParsedResumeItem {
  name: string;
  text: string;
  charCount: number;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function normalizeResumeText(text: string): string {
  return text
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

async function parseResumeFile(file: File): Promise<ParsedResumeItem> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = getExtension(file.name);

  let text = "";
  if (ext === ".pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      text = parsed.text || "";
    } finally {
      await parser.destroy().catch(() => {});
    }
  } else if (ext === ".docx") {
    const parsed = await mammoth.extractRawText({ buffer });
    text = parsed.value || "";
  } else if (ext === ".txt") {
    text = buffer.toString("utf-8");
  } else {
    throw new Error(`仅支持 PDF / DOCX / TXT，当前文件：${file.name}`);
  }

  const normalized = normalizeResumeText(text);
  if (!normalized) {
    throw new Error(`未能从文件中解析出有效文本：${file.name}`);
  }

  return {
    name: file.name,
    text: normalized,
    charCount: normalized.length,
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求格式错误，请使用 multipart/form-data 上传文件" }, { status: 400, headers: CORS });
  }

  const files = formData.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "请至少上传一个 PDF / DOCX / TXT 文件" }, { status: 400, headers: CORS });
  }

  try {
    const items: ParsedResumeItem[] = [];
    for (const file of files) {
      items.push(await parseResumeFile(file));
    }
    return NextResponse.json({ items }, { headers: CORS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 400, headers: CORS });
  }
}
