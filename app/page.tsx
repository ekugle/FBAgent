import { createServerClient } from "@/lib/supabase";
import Link from "next/link";
import {
  FileText,
  MessageSquare,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Bot,
} from "lucide-react";

async function getDashboardStats() {
  const db = createServerClient();

  const [posts, comments, responses, agentRuns, analytics] = await Promise.all([
    db.from("posts").select("status"),
    db.from("comments").select("sentiment"),
    db.from("comment_responses").select("status"),
    db
      .from("agent_runs")
      .select("trigger, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("page_analytics")
      .select("*")
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    posts: posts.data ?? [],
    comments: comments.data ?? [],
    responses: responses.data ?? [],
    agentRuns: agentRuns.data ?? [],
    latestAnalytics: analytics.data,
  };
}

export default async function DashboardPage() {
  const { posts, comments, responses, agentRuns, latestAnalytics } =
    await getDashboardStats();

  const pendingPosts = posts.filter((p) => p.status === "pending_approval").length;
  const publishedPosts = posts.filter((p) => p.status === "published").length;
  const scheduledPosts = posts.filter((p) => p.status === "scheduled").length;
  const pendingResponses = responses.filter(
    (r) => r.status === "pending_approval" || r.status === "draft"
  ).length;
  const negativeComments = comments.filter(
    (c) => c.sentiment === "negative"
  ).length;

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
      label: "Responses to Review",
      value: pendingResponses,
      icon: MessageSquare,
      color: "text-blue-500",
      bg: "bg-blue-50",
      href: "/dashboard/comments",
      urgent: pendingResponses > 0,
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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Social Agent — Content Overview
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
                  <span className="badge bg-amber-100 text-amber-700">
                    Action needed
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {stat.value}
              </div>
              <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Analytics */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Page Performance
            </h2>
            <Link
              href="/dashboard/analytics"
              className="text-sm text-blue-600 hover:underline"
            >
              View all →
            </Link>
          </div>

          {latestAnalytics ? (
            <div className="space-y-3">
              {[
                {
                  label: "Impressions",
                  value: latestAnalytics.impressions.toLocaleString(),
                },
                {
                  label: "Reach",
                  value: latestAnalytics.reach.toLocaleString(),
                },
                {
                  label: "Engaged Users",
                  value: latestAnalytics.engaged_users.toLocaleString(),
                },
                {
                  label: "Page Fans",
                  value: latestAnalytics.page_fans.toLocaleString(),
                },
                {
                  label: "Post Engagements",
                  value: latestAnalytics.post_engagements.toLocaleString(),
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0"
                >
                  <span className="text-sm text-gray-600">{m.label}</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {m.value}
                  </span>
                </div>
              ))}
              <p className="text-xs text-gray-400 mt-2">
                Period: {latestAnalytics.period_start} →{" "}
                {latestAnalytics.period_end}
              </p>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No analytics data yet.</p>
              <p className="text-xs mt-1">
                Run the analytics cron or fetch from Meta.
              </p>
            </div>
          )}
        </div>

        {/* Recent Agent Runs */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Bot className="w-4 h-4 text-purple-500" />
              Recent Agent Runs
            </h2>
            <Link
              href="/dashboard/agent"
              className="text-sm text-blue-600 hover:underline"
            >
              View all →
            </Link>
          </div>

          {agentRuns.length > 0 ? (
            <div className="space-y-2">
              {agentRuns.map((run: {
                trigger: string;
                status: string;
                created_at: string;
              }, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {run.trigger}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(run.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`badge ${
                      run.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : run.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No agent runs yet.</p>
              <p className="text-xs mt-1">
                Trigger the agent manually or wait for the cron.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-6 mt-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/posts/new" className="btn-primary">
            <FileText className="w-4 h-4" />
            New Post Draft
          </Link>
          <Link href="/dashboard/posts?status=pending_approval" className="btn-secondary">
            <Clock className="w-4 h-4" />
            Review Pending Posts ({pendingPosts})
          </Link>
          <Link href="/dashboard/comments" className="btn-secondary">
            <MessageSquare className="w-4 h-4" />
            Review Comments ({pendingResponses})
          </Link>
          <TriggerAgentButton />
        </div>
      </div>
    </div>
  );
}

// Client component for triggering the agent
function TriggerAgentButton() {
  return (
    <form action="/api/agent" method="post">
      <Link
        href="/dashboard/agent/trigger"
        className="btn-secondary"
      >
        <Bot className="w-4 h-4" />
        Trigger Agent
      </Link>
    </form>
  );
}
