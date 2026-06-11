import { NextRequest } from "next/server";
import { handleSave, corsOptionsResponse } from "@/lib/save-handler";

export const OPTIONS = corsOptionsResponse;

export async function POST(req: NextRequest) {
  return handleSave(req, "artstation");
}
