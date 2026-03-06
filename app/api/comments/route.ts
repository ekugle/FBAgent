/**
 * GET /api/comments — list comments with their draft responses
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const sentiment = searchParams.get("sentiment");

  let query = db
    .from("comments")
    .select(`
      *,
      comment_responses (*)
    `)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (sentiment) {
    query = query.eq("sentiment", sentiment);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comments: data });
}
