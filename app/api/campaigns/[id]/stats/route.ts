/**
 * GET /api/campaigns/[id]/stats
 * Returns post counts by status and avg engagement for a campaign.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCampaignStats } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const stats = await getCampaignStats(id);
    return NextResponse.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
