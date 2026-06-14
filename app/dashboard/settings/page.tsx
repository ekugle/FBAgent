/**
 * Settings — connected pages + content configuration.
 */

import { Settings, CheckCircle, Facebook } from "lucide-react";
import { createServerClient } from "@/lib/supabase";
import UrlManager from "@/components/UrlManager";

const PAGES = [
  { label: "TX2Pay", envKey: "PUBLER_FACEBOOK_ACCOUNT_ID" },
  { label: "eEndorsements.com", envKey: "PUBLER_ENDORSEMENTS_ACCOUNT_ID" },
];

export default async function SettingsPage() {
  const allConfigured = PAGES.every((p) => !!process.env[p.envKey]);

  const db = createServerClient();
  const { data: urls } = await db
    .from("word_post_urls")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Settings
        </h1>
        <p className="text-gray-500 mt-1">
          Facebook posting is handled by Publer — no manual token management needed.
        </p>
      </div>

      {/* Connected Pages */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Connected Facebook Pages
        </h2>
        <div className="space-y-3">
          {PAGES.map((page) => {
            const isConfigured = !!process.env[page.envKey];
            return (
              <div
                key={page.label}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <Facebook className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{page.label}</p>
                    <p className="text-xs text-gray-500">Managed via Publer</p>
                  </div>
                </div>
                {isConfigured ? (
                  <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <CheckCircle className="w-4 h-4" />
                    Connected
                  </span>
                ) : (
                  <span className="text-sm text-red-500 font-medium">
                    Missing env var: {page.envKey}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {allConfigured && (
          <p className="mt-4 text-xs text-gray-400">
            Both pages are active in Publer. Posts publish automatically
            when approved in the Post Queue.
          </p>
        )}
      </div>

      {/* Publer link */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Manage in Publer
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          To reconnect a Facebook page or add new social accounts, go to Publer directly.
        </p>
        <a
          href="https://app.publer.com/#/accounts"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex"
        >
          Open Publer Accounts →
        </a>
      </div>

      {/* Word Post URL Rotation */}
      <UrlManager initialUrls={urls ?? []} />
    </div>
  );
}
