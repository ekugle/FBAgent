/**
 * GET    /api/content/urls          — list all active word-post URLs
 * POST   /api/content/urls          — add a new URL { url, label }
 * DELETE /api/content/urls?id=...   — deactivate a URL
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { z } from "zod";

export async function GET() {
  const db = createServerClient();
  const { data, error } = await db
    .from("word_post_urls")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ urls: data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = z
      .object({ url: z.string().url(), label: z.string().min(1) })
      .safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "url (valid URL) and label (non-empty) are required" },
        { status: 400 }
      );
    }

    const db = createServerClient();
    const { data, error } = await db
      .from("word_post_urls")
      .insert({ url: parsed.data.url, label: parsed.data.label })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ url: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = createServerClient();
  const { error } = await db
    .from("word_post_urls")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
