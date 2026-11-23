import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search, UserPlus, X } from 'lucide-react';
import { superAdminApi, type AffiliateCustomerLink } from '../../services/api';

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB');

/**
 * An affiliate's customers, and adding organisations to it by hand: for organisations the
 * affiliate brought in without using the code. Commission starts with their next purchase;
 * what they bought before is never counted.
 */
export function AffiliateCustomersModal({ affiliateId, onClose }: { affiliateId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['super-admin-affiliate-customers', affiliateId],
    queryFn: () => superAdminApi.getAffiliateCustomers(affiliateId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['super-admin-affiliate-customers', affiliateId] });
    queryClient.invalidateQueries({ queryKey: ['super-admin-affiliates'] });
  };

  const addMutation = useMutation({
    mutationFn: () => superAdminApi.addAffiliateCustomers(affiliateId, [...selected]),
    onSuccess: (res) => {
      toast.success(res.message, { duration: 6000 });
      setSelected(new Set());
      setSearch('');
      refresh();
    },
    onError: (err: Error) => toast.error(err.message || 'Could not add the organisations', { duration: 8000 }),
  });

  const removeMutation = useMutation({
    mutationFn: (linkId: string) => superAdminApi.removeAffiliateCustomer(affiliateId, linkId),
    onSuccess: (res) => {
      toast.success(res.message);
      refresh();
    },
    onError: (err: Error) => toast.error(err.message || 'Could not remove the link', { duration: 8000 }),
  });

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return (data?.available ?? []).filter((o) => words.every((w) => o.name.toLowerCase().includes(w) || o.email.toLowerCase().includes(w)));
  }, [data, search]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const affiliate = data?.affiliate;
  const rate = affiliate?.commissionRate != null ? `${(affiliate.commissionRate * 100).toFixed(0)}%` : null;
  const chosen = (data?.available ?? []).filter((o) => selected.has(o.id));

  const add = () => {
    if (!affiliate || chosen.length === 0) return;
    const names = chosen.map((o) => o.name).join(', ');
    const earns = rate ? `${affiliate.name} earns ${rate} on every purchase they make from now on.` : `${affiliate.name} has no commission rate set.`;
    if (window.confirm(`Add ${chosen.length === 1 ? names : `these ${chosen.length} organisations`} to ${affiliate.name}?\n\n${chosen.length === 1 ? '' : `${names}\n\n`}${earns} Purchases they already made are not counted.`)) {
      addMutation.mutate();
    }
  };

  const remove = (c: AffiliateCustomerLink) => {
    if (window.confirm(`Remove ${c.name} from ${affiliate?.name ?? 'this affiliate'}? It has not earned any commission.`)) {
      removeMutation.mutate(c.linkId);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-700 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Customers of {affiliate?.name ?? '…'}</h3>
            {affiliate && (
              <p className="text-sm text-gray-400 mt-0.5">
                Code <span className="font-mono text-purple-400">{affiliate.affiliateCode ?? '—'}</span>
                {rate && <> · {rate} commission</>}
                {!affiliate.affiliateActive && <span className="text-red-400"> · deactivated</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-6">
          {isLoading && <p className="text-gray-400 text-sm">Loading…</p>}
          {error && <p className="text-red-400 text-sm">{error instanceof Error ? error.message : 'Could not load the customers'}</p>}

          {data && (
            <>
              <section>
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Customers · {data.customers.length}</h4>
                {data.customers.length === 0 ? (
                  <p className="text-sm text-gray-500">No customers yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-700 border border-gray-700 rounded-lg">
                    {data.customers.map((c) => (
                      <li key={c.linkId} className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-white font-medium truncate">{c.name}</p>
                          <p className="text-xs text-gray-500 truncate">{c.email}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Linked {day(c.linkedAt)} · {c.addedBy ? <>added by hand ({c.addedBy})</> : 'used the code'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm text-gray-300">
                            {c.commissionCount === 0
                              ? 'No purchase since'
                              : `${c.commissionCount} purchase${c.commissionCount === 1 ? '' : 's'} · ${eur(c.commissionCents)} commission`}
                          </p>
                          {c.purchasesBeforeLink > 0 && (
                            <p className="text-xs text-gray-500">
                              {c.purchasesBeforeLink} purchase{c.purchasesBeforeLink === 1 ? '' : 's'} before the link, not counted
                            </p>
                          )}
                          {c.removable && (
                            <button
                              onClick={() => remove(c)}
                              disabled={removeMutation.isPending}
                              className="text-xs text-red-400 hover:text-red-300 mt-1 disabled:opacity-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Add organisations</h4>
                <p className="text-sm text-gray-400 leading-relaxed mb-3">
                  For organisations this affiliate brought in without using the code. Commission starts with their next purchase.
                  What they bought before is not counted.
                </p>

                {!data.affiliate.affiliateActive ? (
                  <p className="text-sm text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-3">
                    This affiliate is deactivated. Activate it in the list to add customers.
                  </p>
                ) : data.available.length === 0 ? (
                  <p className="text-sm text-gray-500">Every organisation is already linked to an affiliate.</p>
                ) : (
                  <>
                    <div className="relative mb-2">
                      <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name or email"
                        className="w-full pl-9 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500"
                      />
                    </div>
                    <ul className="border border-gray-700 rounded-lg divide-y divide-gray-700 max-h-64 overflow-y-auto">
                      {shown.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">No organisation matches “{search}”.</li>}
                      {shown.map((o) => (
                        <li key={o.id}>
                          <label className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-gray-700/50">
                            <input
                              type="checkbox"
                              checked={selected.has(o.id)}
                              onChange={() => toggle(o.id)}
                              className="rounded border-gray-500 bg-gray-700 w-4 h-4"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-white truncate">{o.name}</span>
                              <span className="block text-xs text-gray-500 truncate">{o.email}</span>
                            </span>
                            <span className="text-xs text-gray-500 flex-shrink-0">
                              {o.completedPurchases === 0
                                ? 'no purchases yet'
                                : `${o.completedPurchases} purchase${o.completedPurchases === 1 ? '' : 's'} so far`}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {data.linkedToOtherAffiliates > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        {data.linkedToOtherAffiliates} organisation{data.linkedToOtherAffiliates === 1 ? ' is' : 's are'} linked to another
                        affiliate and not listed: a customer has one affiliate, for good.
                      </p>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 truncate">
            {chosen.length > 0 ? chosen.map((o) => o.name).join(', ') : ''}
          </p>
          <div className="flex gap-3 flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 text-sm">
              Close
            </button>
            <button
              onClick={add}
              disabled={chosen.length === 0 || addMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
            >
              <UserPlus className="w-4 h-4" />
              {addMutation.isPending
                ? 'Adding…'
                : chosen.length === 0
                  ? 'Add organisations'
                  : `Add ${chosen.length} organisation${chosen.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
