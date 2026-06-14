import { createServerClient } from "@/lib/supabase";
import Link from "next/link";
import {
  FileText,
  MessageSquare,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  CalendarDays,
  Megaphone,
  Building2,
} from "lucide-react";

async function getDashboardData() {
  const db = createServerClient();

  const [postsResult, commentsResult, responsesResult, analyticsResult, upcomingResult] =
    await Promise.all([
      db.from("posts").select("status, metadata"),
      db.from("comments").select("sentiment"),
      db.from("comment_responses").select("status"),
      db
        .from("page_analytics")
        .select("*")
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("posts")
        .select("id, content, status, scheduled_at, metadata")
        .in("status", ["scheduled", "pending_approval"])
        .order("scheduled_at", { ascending: true })
        .limit(8),
    ]);

  return {
    posts: postsResult.data ?? [],
    comments: commentsResult.data ?? [],
    responses: responsesResult.data ?? [],
    latestAnalytics: analyticsResult.data,
    upcoming: upcomingResult.data ?? [],
  };
}

const PAGE_LABELS: Record<string, string> = {
  tx2pay: "TX2Pay",
  endorsements: "eEndorsements",
};
const PAGE_COLORS: Record<string, string> = {
  tx2pay: "text-blue-600",
  endorsements: "text-purple-600",
};

export default async function DashboardPage() {
  const { posts, comments, responses, latestAnalytics, upcoming } =
    await getDashboardData();

  const pendingPosts = posts.filter((p) => p.status === "pending_approval").length;
  const publishedPosts = posts.filter((p) => p.status === "published").length;
  const scheduledPosts = posts.filter((p) => p.status === "scheduled").length;
  const pendingResponses = responses.filter(
    (r) => r.status === "pending_approval" || r.status === "draft"
  ).length;
  const negativeComments = comments.filter((c) => c.sentiment === "negative").length;

  // Per-business breakdowns
  const byBusiness: Record<string, { published: number; scheduled: number; pending: number }> = {};
  for (const post of posts) {
    const meta = post.metadata as { page_key?: string } | null;
    const key = meta?.page_key ?? "tx2pay";
    if (!byBusiness[key]) byBusiness[key] = { published: 0, scheduled: 0, pending: 0 };
    if (post.status === "published") byBusiness[key].published++;
    else if (post.status === "scheduled") byBusiness[key].scheduled++;
    else if (post.status === "pending_approval") byBusiness[key].pending++;
  }

  const stats = [
    {
      label: "Posts Awaiting Approval",
      value: pendingPosts,
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-50",
      href: "/dashboard/posts?status=pending_approval",
      urgent: pendingPosts > 0,
    },
    {
      label: "Published Posts",
      value: publishedPosts,
      icon: CheckCircle,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
      href: "/dashboard/posts?status=published",
      urgent: false,
    },
    {
      label: "Scheduled Posts",
      value: scheduledPosts,
      icon: CalendarDays,
      color: "text-blue-500",
      bg: "bg-blue-50",
      href: "/dashboard/calendar",
      urgent: false,
    },
    {
      label: "Negative Comments",
      value: negativeComments,
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-50",
      href: "/dashboard/comments?sentiment=negative",
      urgent: negativeComments > 0,
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Social Agent — Content Overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <div
              className={`card p-6 hover:shadow-md transition-shadow cursor-pointer ${
                stat.urgent ? "ring-2 ring-offset-1 ring-amber-400" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                {stat.urgent && (
                  <span className="badge bg-amber-100 text-amber-700">Action needed</span>
                )}
              </div>
              <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Upcoming Posts */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-500" />
              Upcoming Posts
            </h2>
            <Link href="/dashboard/calendar" className="text-sm text-blue-600 hover:underline">
              View calendar →
            </Link>
          </div>

          {upcoming.length > 0 ? (
            <div className="space-y-2">
              {upcoming.map((post) => {
                const meta = post.metadata as { page_key?: string } | null;
                const pageKey = meta?.page_key ?? "tx2pay";
                const scheduledDate = post.scheduled_at
                  ? new Date(post.scheduled_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "Unscheduled";
                return (
                  <div
                    key={post.id}
                    className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{post.content.slice(0, 80)}&hellip;</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{scheduledDate}</span>
                        <span className={`text-xs font-medium ${PAGE_COLORS[pageKey] ?? "text-gray-500"}`}>
                          {PAGE_LABELS[pageKey] ?? pageKey}
                        </span>
                        {post.status === "pending_approval" && (
                          <span className="text-xs text-amber-600">&middot; Awaiting approval</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No upcoming posts scheduled.</p>
              <Link href="/dashboard/campaigns" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
                Launch a campaign →
              </Link>
            </div>
          )}
        </div>

        {/* Right column: business breakdown + page performance */}
        <div className="space-y-4">
          {/* Per-business content summary */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-gray-500" />
              Content by Business
            </h2>
            {Object.keys(byBusiness).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(byBusiness).map(([key, counts]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-semibold ${PAGE_COLORS[key] ?? "text-gray-700"}`}>
                        {PAGE_LABELS[key] ?? key}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs pl-1">
                      <Link href={`/dashboard/posts?status=published&page=${key}`} className="text-emerald-600 hover:underline">
                        {counts.published} published
                      </Link>
                      <Link href={`/dashboard/calendar?page=${key}`} className="text-blue-600 hover:underline">
                        {counts.scheduled} scheduled
                      </Link>
                      {counts.pending > 0 && (
                        <Link href={`/dashboard/posts?status=pending_approval&page=${key}`} className="text-amber-600 font-medium hover:underline">
                          {counts.pending} pending ↗
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No posts yet.</p>
            )}
          </div>

          {/* Page Performance */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                Page Performance
              </h2>
              <Link href="/dashboard/analytics" className="text-sm text-blue-600 hover:underline">
                View all →
              </Link>
            </div>

            {latestAnalytics ? (
              <div className="space-y-2">
                {[
                  { label: "Impressions", value: latestAnalytics.impressions },
                  { label: "Reach", value: latestAnalytics.reach },
                  { label: "Engaged Users", value: latestAnalytics.engaged_users },
                  { label: "Page Fans", value: latestAnalytics.page_fans },
                  { label: "Post Engagements", value: latestAnalytics.post_engagements },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0"
                  >
                    <span className="text-sm text-gray-600">{m.label}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {m.value.toLocaleString()}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-gray-400 mt-1">
                  {latestAnalytics.period_start} &rarr; {latestAnalytics.period_end}
                </p>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400">
                <TrendingUp className="w-7 h-7 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No analytics data yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/campaigns" className="btn-primary">
            <Megaphone className="w-4 h-4" />
            Launch Campaign
          </Link>
          <Link href="/dashboard/posts/new" className="btn-secondary">
            <FileText className="w-4 h-4" />
            New Post Draft
          </Link>
          <Link href="/dashboard/posts?status=pending_approval" className="btn-secondary">
            <Clock className="w-4 h-4" />
            Review Pending ({pendingPosts})
          </Link>
          <Link href="/dashboard/comments" className="btn-secondary">
            <MessageSquare className="w-4 h-4" />
            Review Comments ({pendingResponses})
          </Link>
        </div>
      </div>
    </div>
  );
}
