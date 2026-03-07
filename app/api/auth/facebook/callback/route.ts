import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXTAUTH_URL!;

  if (error || !code) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard/settings?error=${encodeURIComponent(error ?? "no_code")}`
    );
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;
  const redirectUri = `${baseUrl}/api/auth/facebook/callback`;

  try {
    // 1. Exchange code for short-lived user token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v25.0/oauth/access_token?` +
        new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })
    );
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: { message: string } };
    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? "Failed to get user token");
    }

    // 2. Exchange for long-lived user token
    const longRes = await fetch(
      `https://graph.facebook.com/v25.0/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: tokenData.access_token,
        })
    );
    const longData = (await longRes.json()) as { access_token?: string; expires_in?: number; error?: { message: string } };
    if (!longData.access_token) {
      throw new Error(longData.error?.message ?? "Failed to get long-lived token");
    }

    // 3. Get page access token
    const pageId = process.env.FACEBOOK_PAGE_ID!;
    const pageRes = await fetch(
      `https://graph.facebook.com/v25.0/${pageId}?fields=access_token,name&access_token=${longData.access_token}`
    );
    const pageData = (await pageRes.json()) as { access_token?: string; name?: string; error?: { message: string } };
    if (!pageData.access_token) {
      throw new Error(pageData.error?.message ?? "Failed to get page token");
    }

    // 4. Store page token in Supabase agent_memory
    const db = createServerClient();
    const expiresAt = longData.expires_in
      ? new Date(Date.now() + longData.expires_in * 1000).toISOString()
      : null;

    await db.from("agent_memory").upsert(
      { key: "fb_page_token", value: pageData.access_token, description: `Page token for ${pageData.name} (${pageId}). Expires: ${expiresAt ?? "never"}`, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

    if (expiresAt) {
      await db.from("agent_memory").upsert(
        { key: "fb_page_token_expires_at", value: expiresAt, description: "Expiry timestamp for fb_page_token", updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    }

    return NextResponse.redirect(`${baseUrl}/dashboard/settings?connected=true`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(
      `${baseUrl}/dashboard/settings?error=${encodeURIComponent(msg)}`
    );
  }
}
