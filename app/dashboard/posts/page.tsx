import { createServerClient } from "@/lib/supabase";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import BusinessFilter from "@/components/BusinessFilter";
import { FileText, Plus } from "lucide-react";

interface Props {
  searchParams: Promise<{ status?: string; page?: string }>;
}

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Pending Approval", value: "pending_approval" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Published", value: "published" },
  { label: "Rejected", value: "rejected" },
  { label: "Draft", value: "draft" },
];

export default async function PostsPage({ searchParams }: Props) {
  const { status, page: pageKey = "" } = await searchParams;
  const db = createServerClient();

  let query = db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (pageKey) query = query.eq("metadata->>page_key", pageKey);

  const { data: posts, error } = await query;

  // Build status tab hrefs that preserve the business filter
  function tabHref(statusVal: string) {
    const params = new URLSearchParams();
    if (statusVal) params.set("status", statusVal);
    if (pageKey) params.set("page", pageKey);
    const qs = params.toString();
    return qs ? `/dashboard/posts?${qs}` : "/dashboard/posts";
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-500" />
            Post Queue
          </h1>
          <p className="text-gray-500 mt-1">
            Review and approve AI-generated post drafts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BusinessFilter current={pageKey} extraParams={status ? { status } : {}} />
          <Link href="/dashboard/posts/new" className="btn-primary">
            <Plus className="w-4 h-4" />
            New Post
          </Link>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tabHref(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
              status === tab.value || (!status && tab.value === "")
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
          Error loading posts: {error.message}
        </div>
      )}

      {posts && posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No posts found</h3>
          <p className="text-gray-500 text-sm">
            {status || pageKey
              ? "No posts match the current filters."
              : "No posts yet. Launch a campaign to generate some!"}
          </p>
          <div className="mt-4">
            <Link href="/dashboard/posts/new" className="btn-primary">
              <Plus className="w-4 h-4" />
              Create Post Draft
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
