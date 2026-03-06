import { createServerClient } from "@/lib/supabase";
import AgentTriggerPanel from "@/components/AgentTriggerPanel";
import { Bot, CheckCircle, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default async function AgentPage() {
  const db = createServerClient();

  const { data: runs } = await db
    .from("agent_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const agentRuns = runs ?? [];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bot className="w-6 h-6 text-purple-500" />
          Agent Control
        </h1>
        <p className="text-gray-500 mt-1">
          Manually trigger the Claude agent and view run history
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trigger Panel */}
        <AgentTriggerPanel />

        {/* Run History */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Run History</h2>
          {agentRuns.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No agent runs yet.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {agentRuns.map((run) => (
                <div
                  key={run.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {run.status === "completed" ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : run.status === "failed" ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <Clock className="w-4 h-4 text-blue-500" />
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {run.trigger}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(run.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>

                  {run.tools_used && run.tools_used.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {run.tools_used.map((tool: string) => (
                        <span
                          key={tool}
                          className="badge bg-purple-50 text-purple-700 text-xs"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}

                  {run.output?.summary && (
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {String(run.output.summary).slice(0, 200)}
                      {String(run.output.summary).length > 200 ? "..." : ""}
                    </p>
                  )}

                  {run.error_message && (
                    <p className="text-xs text-red-600 mt-1">
                      {run.error_message}
                    </p>
                  )}

                  {run.duration_ms && (
                    <p className="text-xs text-gray-400 mt-1">
                      Duration: {(run.duration_ms / 1000).toFixed(1)}s
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
