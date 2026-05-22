/**
 * PATCH /api/campaigns/[id]  — update a campaign (name, template, auto-schedule config)
 * DELETE /api/campaigns/[id] — soft-delete (sets is_active = false)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { z } from "zod";

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  content_template: z.string().min(1).max(63206).optional(),
  category: z.string().optional(),
  page_key: z.enum(["tx2pay", "endorsements"]).optional(),
  auto_enabled: z.boolean().optional(),
  auto_frequency_days: z.number().int().min(1).max(365).optional(),
  auto_quantity: z.number().int().min(1).max(30).optional(),
  next_auto_run: z.string().datetime().optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = UpdateCampaignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = createServerClient();
    const { data, error } = await db
      .from("campaigns")
      .update(parsed.data)
      .eq("id", id)
      .eq("is_active", true)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign: data });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerClient();
  const { error } = await db
    .from("campaigns")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
