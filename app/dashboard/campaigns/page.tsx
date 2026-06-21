"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Megaphone,
  Plus,
  Play,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Trash2,
  BarChart2,
} from "lucide-react";

const PAGE_OPTIONS = [
  { key: "tx2pay", label: "TX2Pay", color: "blue" },
  { key: "endorsements", label: "eEndorsements.com", color: "purple" },
] as const;
type PageKey = "tx2pay" | "endorsements";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  content_template: string;
  image_urls: string[] | null;
  page_key: PageKey;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

interface CampaignStats {
  total: number;
  by_status: Record<string, number>;
  avg_engagement_rate: number | null;
  avg_reach: number | null;
}

interface BatchResult {
  success: boolean;
  summary?: string;
  toolsUsed?: string[];
  iterations?: number;
  error?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  payment_tips: "Payment Tips",
  product_features: "Product Features",
  word_post: "Word Post",
  small_business_finance: "SMB Finance",
  customer_success: "Customer Success",
  industry_insights: "Industry Insights",
  behind_the_scenes: "Behind the Scenes",
};

// ─── Campaign Form (shared by Create + Edit) ──────────────────────────────────

interface CampaignFormValues {
  name: string;
  description: string;
  contentTemplate: string;
  category: string;
  pageKey: PageKey;
}

const DEFAULT_FORM: CampaignFormValues = {
  name: "",
  description: "",
  contentTemplate: "",
  category: "",
  pageKey: "tx2pay",
};

function campaignToForm(c: Campaign): CampaignFormValues {
  return {
    name: c.name,
    description: c.description ?? "",
    contentTemplate: c.content_template,
    category: c.category ?? "",
    pageKey: c.page_key,
  };
}

function CampaignForm({
  values,
  onChange,
}: {
  values: CampaignFormValues;
  onChange: (v: CampaignFormValues) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          required
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          placeholder="e.g. Get Paid Faster Series"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
        <input
          type="text"
          value={values.description}
          onChange={(e) => onChange({ ...values, description: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          placeholder="Short description of the campaign goal"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category (optional)</label>
        <select
          value={values.category}
          onChange={(e) => onChange({ ...values, category: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        >
          <option value="">— Select category —</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {values.category === "word_post" && (
          <p className="text-xs text-sky-600 mt-1.5 flex items-start gap-1">
            <span>ℹ</span>
            <span>
              Word Post campaigns rotate through the URLs in{" "}
              <a href="/dashboard/settings" target="_blank" className="underline">Settings → Word Post URL Rotation</a>.
              Each generated post links to a different product page.
            </span>
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Facebook Page</label>
        <div className="flex gap-2">
          {PAGE_OPTIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange({ ...values, pageKey: p.key })}
              className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                values.pageKey === p.key
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Post Content Template</label>
        <textarea
          value={values.contentTemplate}
          onChange={(e) => onChange({ ...values, contentTemplate: e.target.value })}
          required
          rows={7}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
          placeholder={
            values.category === "word_post"
              ? "Describe the tone and style for word posts. Each post will automatically link to a different URL from the rotation. Example: Write an engaging educational post about a TX2Pay feature. Open with a question or surprising stat. Keep it conversational and end with a clear call-to-action to click the link."
              : "Write the base post content. Claude will use this as a template for all generated posts in this campaign."
          }
        />
        <p className="text-xs text-gray-400 mt-1">{values.contentTemplate.length} characters</p>
      </div>
    </div>
  );
}

// ─── Create Campaign Modal ────────────────────────────────────────────────────

function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [values, setValues] = useState<CampaignFormValues>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          description: values.description || undefined,
          content_template: values.contentTemplate,
          category: values.category || undefined,
          page_key: values.pageKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create campaign");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-blue-500" />
          New Campaign
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <CampaignForm values={values} onChange={setValues} />
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {loading ? "Creating…" : "Create Campaign"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Campaign Modal ──────────────────────────────────────────────────────

function EditCampaignModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<CampaignFormValues>(campaignToForm(campaign));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          description: values.description || undefined,
          content_template: values.contentTemplate,
          category: values.category || undefined,
          page_key: values.pageKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update campaign");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Pencil className="w-5 h-5 text-gray-500" />
          Edit Campaign
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <CampaignForm values={values} onChange={setValues} />
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {loading ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Batch Launch Modal ───────────────────────────────────────────────────────

function BatchLaunchModal({
  campaign,
  onClose,
}: {
  campaign: Campaign;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(3);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    d.setHours(9);
    return d.toISOString().slice(0, 16);
  });
  const [frequencyDays, setFrequencyDays] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);

  const scheduledTimes: string[] = [];
  if (startDate) {
    const startMs = new Date(startDate).getTime();
    for (let i = 0; i < quantity; i++) {
      scheduledTimes.push(
        new Date(startMs + i * frequencyDays * 24 * 60 * 60 * 1000).toLocaleString()
      );
    }
  }

  async function handleLaunch() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaign.id,
          quantity,
          start_date: new Date(startDate).toISOString(),
          frequency_days: frequencyDays,
        }),
      });
      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        // Non-JSON response (e.g. Vercel 504 timeout page)
        data = { success: false, error: res.ok ? "Unexpected server response" : `Server error ${res.status} — generation may have timed out. Try fewer posts or try again.` };
      }
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Play className="w-5 h-5 text-purple-500" />
          Launch Campaign Batch
        </h2>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-500">{campaign.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            campaign.page_key === "endorsements"
              ? "bg-purple-50 text-purple-700"
              : "bg-blue-50 text-blue-700"
          }`}>
            {PAGE_OPTIONS.find(p => p.key === campaign.page_key)?.label ?? "TX2Pay"}
          </span>
        </div>

        {!result ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Posts</label>
              <input
                type="number"
                min={1}
                max={30}
                value={quantity}
                onChange={(e) => setQuantity(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Post Date & Time</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Days between posts</label>
              <select
                value={frequencyDays}
                onChange={(e) => setFrequencyDays(parseInt(e.target.value))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              >
                <option value={1}>Every day</option>
                <option value={2}>Every 2 days</option>
                <option value={3}>Every 3 days</option>
                <option value={7}>Weekly</option>
                <option value={14}>Every 2 weeks</option>
              </select>
            </div>

            {scheduledTimes.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">Schedule preview:</p>
                <ol className="space-y-1">
                  {scheduledTimes.map((t, i) => (
                    <li key={i} className="text-xs text-gray-600">
                      <span className="font-medium">Post {i + 1}:</span> {t}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleLaunch}
                disabled={loading || !startDate}
                className="btn-primary bg-purple-600 hover:bg-purple-700 w-full justify-center"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Generating {quantity} posts…</>
                ) : (
                  <><Play className="w-4 h-4" />Generate {quantity} Post{quantity !== 1 ? "s" : ""}</>
                )}
              </button>
              <button onClick={onClose} className="btn-secondary" disabled={loading}>Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div className={`p-4 rounded-lg mb-4 ${result.success ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.success
                  ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                  : <XCircle className="w-4 h-4 text-red-500" />
                }
                <span className={`text-sm font-medium ${result.success ? "text-emerald-700" : "text-red-700"}`}>
                  {result.success ? `${quantity} drafts queued for approval` : "Generation failed"}
                </span>
              </div>
              {result.summary && <p className="text-xs text-gray-700 leading-relaxed">{result.summary}</p>}
              {result.error && <p className="text-xs text-red-600">{result.error}</p>}
            </div>
            <div className="flex gap-3">
              {result.success && (
                <a href="/dashboard/posts?status=pending_approval" className="btn-primary text-sm">
                  Review in Post Queue
                </a>
              )}
              <button onClick={onClose} className="btn-secondary text-sm">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Campaign Card ────────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  onLaunch,
  onEdit,
  onDeleted,
}: {
  campaign: Campaign;
  onLaunch: (c: Campaign) => void;
  onEdit: (c: Campaign) => void;
  onDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/campaigns/${campaign.id}/stats`)
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => null);
  }, [campaign.id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
              campaign.page_key === "endorsements"
                ? "bg-purple-50 text-purple-700"
                : "bg-blue-50 text-blue-700"
            }`}>
              {PAGE_OPTIONS.find(p => p.key === campaign.page_key)?.label ?? "TX2Pay"}
            </span>
            {campaign.category && (
              <span className="badge bg-gray-100 text-gray-600 border-gray-200 text-xs shrink-0">
                {CATEGORY_LABELS[campaign.category] ?? campaign.category}
              </span>
            )}
          </div>

          {campaign.description && (
            <p className="text-sm text-gray-500 mb-2">{campaign.description}</p>
          )}

          {/* Stats row */}
          {stats && stats.total > 0 && (
            <div className="flex items-center gap-3 mb-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <BarChart2 className="w-3.5 h-3.5 text-gray-400" />
                {stats.total} post{stats.total !== 1 ? "s" : ""} total
              </span>
              {(stats.by_status.published ?? 0) > 0 && (
                <span className="text-emerald-600">{stats.by_status.published} published</span>
              )}
              {(stats.by_status.pending_approval ?? 0) > 0 && (
                <span className="text-amber-600">{stats.by_status.pending_approval} pending</span>
              )}
              {(stats.by_status.scheduled ?? 0) > 0 && (
                <span className="text-blue-600">{stats.by_status.scheduled} scheduled</span>
              )}
              {stats.avg_engagement_rate != null && (
                <span className="text-purple-600">
                  {(stats.avg_engagement_rate * 100).toFixed(1)}% avg engagement
                </span>
              )}
              {stats.avg_reach != null && (
                <span>{stats.avg_reach.toLocaleString()} avg reach</span>
              )}
            </div>
          )}

          {/* Template preview toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : "Preview"} template
          </button>
          {expanded && (
            <pre className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap font-sans">
              {campaign.content_template}
            </pre>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onEdit(campaign)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Edit campaign"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete campaign"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onLaunch(campaign)}
            className="btn-primary bg-purple-600 hover:bg-purple-700"
          >
            <Play className="w-4 h-4" />
            Launch
          </button>
        </div>
      </div>

      {/* Delete confirm inline */}
      {showDeleteConfirm && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
          <p className="text-sm text-gray-600 flex-1">
            Archive <strong>{campaign.name}</strong>? This hides it but keeps existing posts.
          </p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm text-red-600 font-medium hover:text-red-700 flex items-center gap-1"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {deleting ? "Deleting…" : "Confirm"}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

const ALL_CATEGORIES = [
  { value: "", label: "All Types" },
  { value: "payment_tips", label: "Payment Tips" },
  { value: "product_features", label: "Product Features" },
  { value: "word_post", label: "Word Post" },
  { value: "small_business_finance", label: "SMB Finance" },
  { value: "customer_success", label: "Customer Success" },
  { value: "industry_insights", label: "Industry Insights" },
  { value: "behind_the_scenes", label: "Behind the Scenes" },
];

const PAGE_FILTER_OPTIONS = [
  { value: "", label: "All Businesses" },
  { value: "tx2pay", label: "TX2Pay" },
  { value: "endorsements", label: "eEndorsements" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Campaign | null>(null);
  const [activeLaunch, setActiveLaunch] = useState<Campaign | null>(null);
  const [filterPage, setFilterPage] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const filtered = campaigns.filter((c) => {
    if (filterPage && c.page_key !== filterPage) return false;
    if (filterCategory && c.category !== filterCategory) return false;
    return true;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-blue-500" />
            Campaigns
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Content templates for each Facebook page. Launch batches manually when you&apos;re ready.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        {/* Business filter */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {PAGE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterPage(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filterPage === opt.value
                  ? opt.value === "endorsements"
                    ? "bg-white text-purple-700 shadow-sm"
                    : opt.value === "tx2pay"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
        >
          {ALL_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>

        {(filterPage || filterCategory) && (
          <button
            onClick={() => { setFilterPage(""); setFilterCategory(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading campaigns…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          {campaigns.length === 0 ? (
            <>
              <p className="text-gray-500 font-medium">No campaigns yet</p>
              <p className="text-sm text-gray-400 mt-1 mb-4">
                Create a campaign template to start generating and scheduling posts.
              </p>
              <button onClick={() => setShowCreate(true)} className="btn-primary mx-auto">
                <Plus className="w-4 h-4" />
                Create First Campaign
              </button>
            </>
          ) : (
            <p className="text-gray-500">No campaigns match the current filters.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onLaunch={setActiveLaunch}
              onEdit={setEditTarget}
              onDeleted={fetchCampaigns}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchCampaigns();
          }}
        />
      )}

      {editTarget && (
        <EditCampaignModal
          campaign={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            fetchCampaigns();
          }}
        />
      )}

      {activeLaunch && (
        <BatchLaunchModal
          campaign={activeLaunch}
          onClose={() => setActiveLaunch(null)}
        />
      )}
    </div>
  );
}
