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
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  content_template: string;
  image_urls: string[] | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

interface BatchResult {
  success: boolean;
  summary?: string;
  toolsUsed?: string[];
  iterations?: number;
  error?: string;
}

// ─── Create Campaign Modal ────────────────────────────────────────────────────

function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contentTemplate, setContentTemplate] = useState("");
  const [category, setCategory] = useState("");
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
        body: JSON.stringify({ name, description: description || undefined, content_template: contentTemplate, category: category || undefined }),
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-blue-500" />
          New Campaign
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              placeholder="e.g. Get Paid Faster Series"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              placeholder="Short description of the campaign goal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category (optional)</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            >
              <option value="">— Select category —</option>
              <option value="payment_tips">Payment Tips</option>
              <option value="product_features">Product Features</option>
              <option value="small_business_finance">Small Business Finance</option>
              <option value="customer_success">Customer Success</option>
              <option value="industry_insights">Industry Insights</option>
              <option value="behind_the_scenes">Behind the Scenes</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Post Content Template</label>
            <textarea
              value={contentTemplate}
              onChange={(e) => setContentTemplate(e.target.value)}
              required
              rows={8}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
              placeholder="Write the base post content. Claude will use this as the template for all generated posts in this campaign."
            />
            <p className="text-xs text-gray-400 mt-1">{contentTemplate.length} characters</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {loading ? "Creating..." : "Create Campaign"}
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

  // Preview the scheduled times
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
      const data = await res.json();
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
        <p className="text-sm text-gray-500 mb-4">{campaign.name}</p>

        {!result ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Number of Posts
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Post Date & Time
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency (days between posts)
              </label>
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

            {/* Schedule preview */}
            {scheduledTimes.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">Scheduled posts preview:</p>
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
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating {quantity} posts...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Generate {quantity} Post{quantity !== 1 ? "s" : ""}
                  </>
                )}
              </button>
              <button onClick={onClose} className="btn-secondary" disabled={loading}>Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div
              className={`p-4 rounded-lg mb-4 ${
                result.success
                  ? "bg-emerald-50 border border-emerald-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {result.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className={`text-sm font-medium ${result.success ? "text-emerald-700" : "text-red-700"}`}>
                  {result.success ? `${quantity} drafts queued for approval` : "Generation failed"}
                </span>
              </div>
              {result.summary && (
                <p className="text-xs text-gray-700 leading-relaxed">{result.summary}</p>
              )}
              {result.error && (
                <p className="text-xs text-red-600">{result.error}</p>
              )}
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
}: {
  campaign: Campaign;
  onLaunch: (c: Campaign) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const categoryLabels: Record<string, string> = {
    payment_tips: "Payment Tips",
    product_features: "Product Features",
    small_business_finance: "SMB Finance",
    customer_success: "Customer Success",
    industry_insights: "Industry Insights",
    behind_the_scenes: "Behind the Scenes",
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 truncate">{campaign.name}</h3>
            {campaign.category && (
              <span className="badge bg-blue-50 text-blue-700 border-blue-200 text-xs shrink-0">
                {categoryLabels[campaign.category] ?? campaign.category}
              </span>
            )}
          </div>
          {campaign.description && (
            <p className="text-sm text-gray-500 mb-2">{campaign.description}</p>
          )}
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
        <button
          onClick={() => onLaunch(campaign)}
          className="btn-primary bg-purple-600 hover:bg-purple-700 shrink-0"
        >
          <Play className="w-4 h-4" />
          Launch
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeLaunch, setActiveLaunch] = useState<Campaign | null>(null);

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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-blue-500" />
            Campaigns
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Pre-designed post templates. Launch a batch to auto-generate and schedule multiple posts at once.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading campaigns...
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card p-12 text-center">
          <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No campaigns yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            Create a campaign template to start scheduling batches of posts.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" />
            Create First Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} onLaunch={setActiveLaunch} />
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

      {activeLaunch && (
        <BatchLaunchModal
          campaign={activeLaunch}
          onClose={() => setActiveLaunch(null)}
        />
      )}
    </div>
  );
}
