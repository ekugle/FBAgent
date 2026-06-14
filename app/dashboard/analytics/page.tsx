import { createServerClient } from "@/lib/supabase";
import BusinessFilter from "@/components/BusinessFilter";
import {
  BarChart3,
  TrendingUp,
  Users,
  Eye,
  Heart,
  MessageSquare,
  Share2,
} from "lucide-react";

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const { page: pageKey = "" } = await searchParams;
  const db = createServerClient();

  // post_analytics can be filtered by the linked post's page_key
  let postQuery = db
    .from("post_analytics")
    .select("*, posts(content, published_at, metadata)")
    .order("fetched_at", { ascending: false })
    .limit(10);

  const [analyticsResult, postAnalyticsResult] = await Promise.all([
    db
      .from("page_analytics")
      .select("*")
      .order("period_start", { ascending: false })
      .limit(14),
    postQuery,
  ]);

  const analytics = analyticsResult.data ?? [];
  const allPostAnalytics = postAnalyticsResult.data ?? [];

  // Filter post analytics client-side via joined post metadata
  const postAnalytics = pageKey
    ? allPostAnalytics.filter((pa) => {
        const post = pa.posts as { metadata?: { page_key?: string } } | null;
        return post?.metadata?.page_key === pageKey;
      })
    : allPostAnalytics;

  const latest = analytics[0];
  const previous = analytics[1];

  function pctChange(current: number, prev: number) {
    if (!prev || prev === 0) return null;
    return ((current - prev) / prev) * 100;
  }

  const metricCards = latest
    ? [
        {
          label: "Impressions",
          value: latest.impressions,
          prev: previous?.impressions,
          icon: Eye,
          color: "text-blue-500",
          bg: "bg-blue-50",
        },
        {
          label: "Reach",
          value: latest.reach,
          prev: previous?.reach,
          icon: TrendingUp,
          color: "text-emerald-500",
          bg: "bg-emerald-50",
        },
        {
          label: "Engaged Users",
          value: latest.engaged_users,
          prev: previous?.engaged_users,
          icon: Users,
          color: "text-purple-500",
          bg: "bg-purple-50",
        },
        {
          label: "Page Fans",
          value: latest.page_fans,
          prev: previous?.page_fans,
          icon: Heart,
          color: "text-rose-500",
          bg: "bg-rose-50",
        },
        {
          label: "Post Engagements",
          value: latest.post_engagements,
          prev: previous?.post_engagements,
          icon: MessageSquare,
          color: "text-amber-500",
          bg: "bg-amber-50",
        },
      ]
    : [];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-500" />
            Analytics
          </h1>
          <p className="text-gray-500 mt-1">
            Facebook page performance metrics
          </p>
        </div>
        <BusinessFilter current={pageKey} />
      </div>

      {/* No data state */}
      {!latest && (
        <div className="card p-12 text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No analytics data yet
          </h3>
          <p className="text-gray-500 text-sm">
            Run the analytics cron job or trigger it from the Agent page to
            populate this data.
          </p>
        </div>
      )}

      {/* Metric Cards */}
      {latest && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
            {metricCards.map((metric) => {
              const change = pctChange(metric.value, metric.prev ?? 0);
              return (
                <div key={metric.label} className="card p-5">
                  <div
                    className={`w-9 h-9 rounded-lg ${metric.bg} flex items-center justify-center mb-3`}
                  >
                    <metric.icon className={`w-4 h-4 ${metric.color}`} />
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {metric.value.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {metric.label}
                  </div>
                  {change !== null && (
                    <div
                      className={`text-xs mt-1 font-medium ${
                        change >= 0 ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
                      vs prev
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Period table */}
          <div className="card p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">
              Historical Data
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">
                      Period
                    </th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">
                      Impressions
                    </th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">
                      Reach
                    </th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">
                      Engaged
                    </th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">
                      Fans
                    </th>
                    <th className="text-right py-2 pl-3 text-gray-500 font-medium">
                      Engagements
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2 pr-4 text-gray-700">
                        {row.period_start}
                      </td>
                      <td className="text-right py-2 px-3 text-gray-900">
                        {row.impressions.toLocaleString()}
                      </td>
                      <td className="text-right py-2 px-3 text-gray-900">
                        {row.reach.toLocaleString()}
                      </td>
                      <td className="text-right py-2 px-3 text-gray-900">
                        {row.engaged_users.toLocaleString()}
                      </td>
                      <td className="text-right py-2 px-3 text-gray-900">
                        {row.page_fans.toLocaleString()}
                      </td>
                      <td className="text-right py-2 pl-3 text-gray-900">
                        {row.post_engagements.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Per-post analytics */}
      {postAnalytics.length > 0 && (
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Post Performance
          </h2>
          <div className="space-y-4">
            {postAnalytics.map((pa) => {
              const post = pa.posts as {
                content: string;
                published_at: string;
              } | null;
              return (
                <div
                  key={pa.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  {post && (
                    <p className="text-sm text-gray-800 mb-3 line-clamp-2">
                      {post.content}
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Reach", value: pa.reach },
                      { label: "Reactions", value: pa.reactions },
                      { label: "Comments", value: pa.comments_count },
                      {
                        label: "Eng. Rate",
                        value: `${(pa.engagement_rate * 100).toFixed(2)}%`,
                      },
                    ].map((m) => (
                      <div key={m.label} className="text-center">
                        <div className="text-lg font-bold text-gray-900">
                          {typeof m.value === "number"
                            ? m.value.toLocaleString()
                            : m.value}
                        </div>
                        <div className="text-xs text-gray-500">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
