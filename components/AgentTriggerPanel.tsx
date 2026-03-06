"use client";

import { useState } from "react";
import { Bot, Play, CheckCircle, XCircle } from "lucide-react";

const TRIGGER_OPTIONS = [
  {
    value: "cron_post",
    label: "Generate Post Draft",
    description: "Claude will research, generate, and queue a new post for approval",
  },
  {
    value: "cron_analytics",
    label: "Analytics Summary",
    description: "Fetch and analyze the latest page performance data",
  },
  {
    value: "manual",
    label: "Custom Instruction",
    description: "Give Claude a specific task via free-form text",
  },
];

interface AgentResult {
  success: boolean;
  summary?: string;
  tools_used?: string[];
  iterations?: number;
  error?: string;
}

export default function AgentTriggerPanel() {
  const [trigger, setTrigger] = useState("cron_post");
  const [topicHint, setTopicHint] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);

  const selectedOption = TRIGGER_OPTIONS.find((o) => o.value === trigger)!;

  async function handleRun() {
    setLoading(true);
    setResult(null);

    const context: Record<string, string> = {};
    if (trigger === "cron_post" && topicHint) context.topic_hint = topicHint;
    if (trigger === "manual" && customMessage) context.message = customMessage;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger, context }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Bot className="w-4 h-4 text-purple-500" />
        Trigger Agent
      </h2>

      {/* Trigger selector */}
      <div className="space-y-2 mb-4">
        {TRIGGER_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              trigger === option.value
                ? "border-purple-400 bg-purple-50"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="trigger"
              value={option.value}
              checked={trigger === option.value}
              onChange={() => setTrigger(option.value)}
              className="mt-0.5 accent-purple-600"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">
                {option.label}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {option.description}
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* Conditional inputs */}
      {trigger === "cron_post" && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Topic Hint (optional)
          </label>
          <input
            type="text"
            value={topicHint}
            onChange={(e) => setTopicHint(e.target.value)}
            placeholder="e.g. invoicing for freelancers"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-400 focus:border-transparent"
          />
        </div>
      )}

      {trigger === "manual" && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Custom Instruction
          </label>
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={3}
            placeholder="Tell the agent what to do..."
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none"
          />
        </div>
      )}

      <button
        onClick={handleRun}
        disabled={loading}
        className="btn-primary w-full justify-center bg-purple-600 hover:bg-purple-700"
      >
        <Play className="w-4 h-4" />
        {loading ? "Running Agent..." : `Run: ${selectedOption.label}`}
      </button>

      {/* Result */}
      {result && (
        <div
          className={`mt-4 p-4 rounded-lg ${
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
            <span
              className={`text-sm font-medium ${
                result.success ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {result.success ? "Agent completed successfully" : "Agent failed"}
            </span>
          </div>

          {result.summary && (
            <p className="text-xs text-gray-700 leading-relaxed mb-2">
              {result.summary}
            </p>
          )}

          {result.tools_used && result.tools_used.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-gray-500 mr-1">Tools used:</span>
              {result.tools_used.map((tool) => (
                <span
                  key={tool}
                  className="badge bg-white border border-gray-200 text-gray-600 text-xs"
                >
                  {tool}
                </span>
              ))}
            </div>
          )}

          {result.iterations !== undefined && (
            <p className="text-xs text-gray-500 mt-1">
              {result.iterations} iteration(s)
            </p>
          )}

          {result.error && (
            <p className="text-xs text-red-600">{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
