import { NextResponse } from "next/server";

const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_posts",
  "pages_manage_engagement",
  "public_profile",
].join(",");

export async function GET() {
  const appId = process.env.FACEBOOK_APP_ID!;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/facebook/callback`;

  const url = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_type", "code");

  return NextResponse.redirect(url.toString());
}
