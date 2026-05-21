/**
 * GET  /api/campaigns  — list all active campaigns
 * POST /api/campaigns  — create a new campaign
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { z } from "zod";

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  content_template: z.string().min(1).max(63206),
  image_urls: z.array(z.string().url()).optional(),
  category: z.string().optional(),
  page_key: z.enum(["tx2pay", "endorsements"]).default("tx2pay"),
});

export async function GET() {
  const db = createServerClient();
  const { data, error } = await db
    .from("campaigns")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateCampaignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = createServerClient();
    const { data, error } = await db
      .from("campaigns")
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
