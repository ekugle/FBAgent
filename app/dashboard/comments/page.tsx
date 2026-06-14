import { createServerClient } from "@/lib/supabase";
import Link from "next/link";
import CommentCard from "@/components/CommentCard";
import BusinessFilter from "@/components/BusinessFilter";
import { MessageSquare } from "lucide-react";

interface Props {
  searchParams: Promise<{ sentiment?: string; page?: string }>;
}

const SENTIMENT_TABS = [
  { label: "All", value: "" },
  { label: "Positive", value: "positive" },
  { label: "Neutral", value: "neutral" },
  { label: "Negative", value: "negative" },
  { label: "Unanalyzed", value: "unanalyzed" },
];

export default async function CommentsPage({ searchParams }: Props) {
  const { sentiment, page: pageKey = "" } = await searchParams;
  const db = createServerClient();

  // Fetch comments with their linked post metadata for business filtering
  let query = db
    .from("comments")
    .select(`*, comment_responses (*), posts(metadata)`)
    .order("received_at", { ascending: false })
    .limit(100);

  if (sentiment === "unanalyzed") {
    query = query.is("sentiment", null);
  } else if (sentiment) {
    query = query.eq("sentiment", sentiment);
  }

  const { data: allComments, error } = await query;

  // Filter by page_key via the joined post (null post_id = external post, shown in All)
  const comments = pageKey
    ? (allComments ?? []).filter((c) => {
        const meta = (c.posts as { metadata?: { page_key?: string } } | null)?.metadata;
        return meta?.page_key === pageKey;
      })
    : (allComments ?? []);

  const pendingCount = comments.filter((c) => {
    const responses = c.comment_responses as Array<{ status: string }>;
    return responses.some(
      (r) => r.status === "draft" || r.status === "pending_approval"
    );
  }).length;

  function tabHref(sentimentVal: string) {
    const params = new URLSearchParams();
    if (sentimentVal) params.set("sentiment", sentimentVal);
    if (pageKey) params.set("page", pageKey);
    const qs = params.toString();
    return qs ? `/dashboard/comments?${qs}` : "/dashboard/comments";
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-blue-500" />
            Comments
          </h1>
          <p className="text-gray-500 mt-1">
            Review AI-drafted responses before posting to Facebook
            {pendingCount > 0 && (
              <span className="ml-2 badge bg-amber-100 text-amber-700">
                {pendingCount} pending review
              </span>
            )}
          </p>
        </div>
        <BusinessFilter current={pageKey} extraParams={sentiment ? { sentiment } : {}} />
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
        {SENTIMENT_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tabHref(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
              sentiment === tab.value || (!sentiment && tab.value === "")
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {error && (
        <div className="card p-4 border-red-200 bg-red-50 text-red-700 text-sm mb-4">
          Error loading comments: {error.message}
        </div>
      )}

      {comments.length > 0 ? (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              responses={comment.comment_responses ?? []}
            />
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No comments found</h3>
          <p className="text-gray-500 text-sm">
            {sentiment || pageKey
              ? "No comments match the current filters."
              : "No comments yet. Comments will appear here when received via webhook."}
          </p>
        </div>
      )}
    </div>
  );
}
