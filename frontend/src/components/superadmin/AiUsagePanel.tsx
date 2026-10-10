import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

interface AiUsageJob {
  job: 'EXTRACTION' | 'CONSOLIDATION' | 'REVIEW';
  label: string;
  calls: number;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  avgDurationMs: number | null;
  shareOfCost: number;
}

interface AiUsageReport {
  days: number;
  since: string;
  loggingStartedAt: string | null;
  jobs: AiUsageJob[];
  total: { calls: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number };
  participants: number;
  costPerParticipantUsd: number | null;
  unpricedModels: string[];
}

const PERIODS = [7, 30, 90] as const;
const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const fmtUsd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Claude token usage and estimated cost per AI job, from the AiUsage log */
export function AiUsagePanel() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const { data, isLoading, error } = useQuery<AiUsageReport>({
    queryKey: ['super-admin-ai-usage', days],
    queryFn: async () => {
      const token = localStorage.getItem('super-admin-token');
      const res = await fetch(`${API_BASE}/super-admin/ai-usage?days=${days}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to load AI usage');
      return res.json();
    },
  });

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white">AI usage</h2>
          <p className="text-sm text-gray-400">Claude tokens per job, estimated at list prices. The Anthropic Console shows the actual bill.</p>
        </div>
        <div className="flex gap-1 bg-gray-900 p-1 rounded-lg">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className={`px-3 py-1.5 rounded-md text-sm ${days === p ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {p} days
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-gray-400">Loading…</div>
      ) : error || !data ? (
        <div className="p-8 text-center text-red-400">Could not load AI usage.</div>
      ) : data.jobs.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          No AI usage recorded in this period yet. Every Claude call is logged from the moment this version was deployed.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-5 border-b border-gray-700">
            <div>
              <p className="text-2xl font-bold text-white">{fmtUsd(data.total.estimatedCostUsd)}</p>
              <p className="text-sm text-gray-400">Estimated cost</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{data.total.calls}</p>
              <p className="text-sm text-gray-400">AI calls</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{data.participants}</p>
              <p className="text-sm text-gray-400">Participants</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{data.costPerParticipantUsd != null ? fmtUsd(data.costPerParticipantUsd) : '—'}</p>
              <p className="text-sm text-gray-400">Per participant</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="px-6 py-3 font-medium">Job</th>
                  <th className="px-6 py-3 font-medium text-right">Calls</th>
                  <th className="px-6 py-3 font-medium text-right">Input tokens</th>
                  <th className="px-6 py-3 font-medium text-right">Output tokens</th>
                  <th className="px-6 py-3 font-medium text-right">Est. cost</th>
                  <th className="px-6 py-3 font-medium text-right">Share</th>
                  <th className="px-6 py-3 font-medium text-right">Avg time</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j) => (
                  <tr key={j.job} className="border-b border-gray-700/60 text-gray-200">
                    <td className="px-6 py-3 text-white">{j.label}</td>
                    <td className="px-6 py-3 text-right">{j.calls}</td>
                    <td className="px-6 py-3 text-right">{fmtTokens(j.inputTokens + j.cacheWriteTokens + j.cacheReadTokens)}</td>
                    <td className="px-6 py-3 text-right">{fmtTokens(j.outputTokens)}</td>
                    <td className="px-6 py-3 text-right">{fmtUsd(j.estimatedCostUsd)}</td>
                    <td className="px-6 py-3 text-right">{Math.round(j.shareOfCost * 100)}%</td>
                    <td className="px-6 py-3 text-right">{j.avgDurationMs != null ? `${(j.avgDurationMs / 1000).toFixed(1)}s` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-6 py-3 text-xs text-gray-500">
            {data.loggingStartedAt ? `Logging started ${fmtDate(data.loggingStartedAt)}.` : ''}
            {data.unpricedModels.length > 0 ? ` No list price known for ${data.unpricedModels.join(', ')}; those calls count as $0 here.` : ''}
          </p>
        </>
      )}
    </div>
  );
}
