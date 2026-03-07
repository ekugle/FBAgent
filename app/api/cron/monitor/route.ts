/**
 * GET /api/cron/monitor
 *
 * Placeholder — comment monitoring requires a Facebook connection.
 * This will be wired up when comment management is added.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ success: true, message: "Comment monitoring not yet configured." });
}
