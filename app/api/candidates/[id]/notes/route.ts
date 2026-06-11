import { NextRequest, NextResponse } from "next/server";
import { readDB, writeDB, addHistory, Note } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/userIdentity";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromRequest(req);
  const { id } = await params;
  const db = readDB(userId);
  const notes = db.notes.filter((n) => n.candidateId === Number(id));
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromRequest(req);
  const { id } = await params;
  const body = await req.json();
  const db = readDB(userId);

  const note: Note = {
    id: db.nextId.notes++,
    candidateId: Number(id),
    content: body.content,
    author: body.author ?? "HR",
    createdAt: new Date().toISOString(),
  };

  db.notes.push(note);
  addHistory(db, Number(id), "note_added", `${note.author} 添加了备注`, note.author);
  writeDB(db, userId);
  return NextResponse.json(note, { status: 201 });
}
