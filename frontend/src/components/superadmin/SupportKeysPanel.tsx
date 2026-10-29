import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { KeyRound, Copy, Plus } from 'lucide-react';
import { superAdminApi } from '../../services/api';

/**
 * Read-only support keys (24 hours) for checking participants from outside the app,
 * e.g. pasted into a Claude Code chat. A key is shown once, right after creating it.
 */
export function SupportKeysPanel() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['super-admin-support-keys'], queryFn: superAdminApi.getSupportKeys });

  const create = useMutation({
    mutationFn: () => superAdminApi.createSupportKey(label.trim() || 'Claude support'),
    onSuccess: (r) => {
      setNewKey(r.key);
      setLabel('');
      queryClient.invalidateQueries({ queryKey: ['super-admin-support-keys'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not create a key'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => superAdminApi.revokeSupportKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin-support-keys'] }),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2"><KeyRound className="w-5 h-5" /> Support keys</h2>
        <p className="text-sm text-gray-400 mt-1">
          A key lets someone look up participants read-only for 24 hours: trips, documents, what the AI read, the green travel
          calculation and the change log. Bank account numbers are masked and nothing can be changed. Paste it into your Claude Code
          chat when you want Claude to check participants, and revoke it when you're done.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What it's for, e.g. Marija's questions"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
        />
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Create key (24 hours)
        </button>
      </div>

      {newKey && (
        <div className="p-4 rounded-lg bg-emerald-900/30 border border-emerald-700 space-y-2">
          <p className="text-sm text-emerald-200">Copy this key now — it is only shown once.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-emerald-100 break-all bg-gray-900 rounded px-3 py-2">{newKey}</code>
            <button onClick={() => copy(newKey)} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600 text-white" title="Copy">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-gray-300 mb-2">Recent keys</p>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !data?.keys.length ? (
          <p className="text-sm text-gray-500">No keys yet.</p>
        ) : (
          <div className="divide-y divide-gray-700 rounded-lg border border-gray-700">
            {data.keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={k.active ? 'text-emerald-400' : 'text-gray-500'}>{k.active ? 'Active' : k.revokedAt ? 'Revoked' : 'Expired'}</span>
                <span className="flex-1 min-w-0 truncate text-gray-200">{k.label || 'Support key'}</span>
                <span className="text-gray-500 text-xs">
                  {k.useCount} request{k.useCount === 1 ? '' : 's'} · until {new Date(k.expiresAt).toLocaleString()}
                </span>
                {k.active && (
                  <button onClick={() => revoke.mutate(k.id)} className="text-xs text-red-400 hover:text-red-300">Revoke</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
