import { createServerClient } from "@/lib/supabase";
import Link from "next/link";
import { Facebook, CheckCircle, AlertCircle, Settings } from "lucide-react";

async function getConnectionStatus() {
  const db = createServerClient();
  const [tokenRow, expiresRow] = await Promise.all([
    db.from("agent_memory").select("value, updated_at").eq("key", "fb_page_token").maybeSingle(),
    db.from("agent_memory").select("value").eq("key", "fb_page_token_expires_at").maybeSingle(),
  ]);

  const hasDbToken = !!tokenRow.data?.value;
  const hasEnvToken = !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const connected = hasDbToken || hasEnvToken;
  const source = hasDbToken ? "oauth" : hasEnvToken ? "env" : null;
  const updatedAt = tokenRow.data?.updated_at ?? null;
  const expiresAt = expiresRow.data?.value as string | null ?? null;

  return { connected, source, updatedAt, expiresAt };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { connected, source, updatedAt, expiresAt } = await getConnectionStatus();

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Settings
        </h1>
        <p className="text-gray-500 mt-1">Manage your Facebook Page connection and permissions.</p>
      </div>

      {/* Flash messages */}
      {params.connected === "true" && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">Facebook Page connected successfully.</span>
        </div>
      )}
      {params.error && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">
            <span className="font-medium">Connection failed:</span> {decodeURIComponent(params.error)}
          </span>
        </div>
      )}

      {/* Facebook Connection Card */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Facebook className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Facebook Page</h2>
              <p className="text-sm text-gray-500">Page ID: {process.env.FACEBOOK_PAGE_ID}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {connected && !isExpired ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                <CheckCircle className="w-3.5 h-3.5" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 px-3 py-1 rounded-full">
                <AlertCircle className="w-3.5 h-3.5" />
                {isExpired ? "Token expired" : "Not connected"}
              </span>
            )}
          </div>
        </div>

        {connected && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Token source</span>
              <span className="font-medium text-gray-900">
                {source === "oauth" ? "OAuth (connected via UI)" : "Environment variable"}
              </span>
            </div>
            {updatedAt && (
              <div className="flex justify-between">
                <span>Last updated</span>
                <span className="font-medium text-gray-900">
                  {new Date(updatedAt).toLocaleString()}
                </span>
              </div>
            )}
            {expiresAt && (
              <div className="flex justify-between">
                <span>Expires</span>
                <span className={`font-medium ${isExpired ? "text-red-600" : "text-gray-900"}`}>
                  {new Date(expiresAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-5">
          <div className="mb-3 text-xs text-gray-500">
            Connecting grants these permissions:
            <span className="ml-1 font-medium text-gray-700">
              pages_manage_posts, pages_manage_engagement, pages_read_engagement, pages_show_list
            </span>
          </div>
          <Link
            href="/api/auth/facebook"
            className="btn-primary inline-flex items-center gap-2"
          >
            <Facebook className="w-4 h-4" />
            {connected && !isExpired ? "Reconnect Facebook Page" : "Connect Facebook Page"}
          </Link>
        </div>
      </div>
    </div>
  );
}
