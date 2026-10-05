import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { organisationApi, AffiliateCustomerPurchase } from '../../services/api';
import { ArrowLeft, Users, TrendingUp, Clock, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

function centsToEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function purchaseTypeLabel(type: string): string {
  const map: Record<string, string> = {
    SINGLE: '1 Credit',
    PACK_5: '5 Credits',
    PACK_10: '10 Credits',
    ANNUAL: 'Annual License',
    MANUAL: 'Manual Grant',
    FOUNDING: 'Founding Credit',
  };
  return map[type] ?? type;
}

function CommissionBadge({ status }: { status: AffiliateCustomerPurchase['commissionStatus'] }) {
  if (status === 'PAID') return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Paid</span>;
  if (status === 'REVERSED') return <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Reversed</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />Pending</span>;
}

export default function AffiliatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showTerms, setShowTerms] = useState(false);
  const [showPayoutConfirm, setShowPayoutConfirm] = useState(false);

  const token = localStorage.getItem('org-token');
  if (!token) {
    navigate('/org/login');
    return null;
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['org-affiliate'],
    queryFn: organisationApi.getAffiliate,
  });

  const payoutMutation = useMutation({
    mutationFn: organisationApi.requestAffiliatePayout,
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ['org-affiliate'] });
      setShowPayoutConfirm(false);
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Failed to submit payout request');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load affiliate data.</p>
          <Link to="/org/dashboard" className="text-purple-600 hover:underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const canRequestPayout = data.pendingBalanceCents >= data.minPayoutCents;
  const allPurchases = data.linkedCustomers.flatMap((c) =>
    c.purchases.map((p) => ({ ...p, orgName: c.orgName }))
  ).sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link to="/org/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Affiliate Program</h1>
            <p className="text-sm text-gray-500 mt-1">Earn commission by referring new organisations to EasyReimburse.</p>
          </div>
          {!data.affiliateActive && (
            <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
              Programme deactivated
            </span>
          )}
        </div>

        {/* Affiliate Code Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Your Affiliate Code</h2>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-3xl font-mono font-bold text-purple-700 tracking-widest bg-purple-50 px-6 py-3 rounded-lg">
              {data.affiliateCode ?? '—'}
            </span>
            <div>
              <p className="text-sm text-gray-600">Commission rate: <span className="font-semibold text-gray-900">{data.commissionRate ? `${(data.commissionRate * 100).toFixed(0)}%` : '—'}</span></p>
              <p className="text-sm text-gray-500 mt-0.5">Earned on every purchase from customers you refer — forever.</p>
            </div>
          </div>
        </div>

        {/* Earnings Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-sm text-gray-500">Total Earned (all time)</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{centsToEur(data.totalEarnedCents)}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-sm text-gray-500">Pending Balance</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{centsToEur(data.pendingBalanceCents)}</p>
            {!canRequestPayout && data.pendingBalanceCents > 0 && (
              <p className="text-xs text-gray-400 mt-1">Minimum {centsToEur(data.minPayoutCents)} to request payout</p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-sm text-gray-500">Linked Customers</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data.linkedCustomers.length}</p>
          </div>
        </div>

        {/* Request Payout */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Request Payout</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {canRequestPayout
                  ? `Your pending balance of ${centsToEur(data.pendingBalanceCents)} is ready to be paid out.`
                  : `You need at least ${centsToEur(data.minPayoutCents)} pending to request a payout.`}
              </p>
            </div>
            <button
              onClick={() => setShowPayoutConfirm(true)}
              disabled={!canRequestPayout || payoutMutation.isPending}
              className="px-5 py-2.5 bg-purple-600 text-white rounded-lg font-medium text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Request Payout ({centsToEur(data.pendingBalanceCents)})
            </button>
          </div>
        </div>

        {/* Commission Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Commission History</h2>
            <p className="text-sm text-gray-500 mt-0.5">All purchases from your linked customers</p>
          </div>

          {allPurchases.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No customers linked yet.</p>
              <p className="text-gray-400 text-xs mt-1">Share your affiliate code to start earning.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
                    <th className="px-6 py-3">Organisation</th>
                    <th className="px-6 py-3">Purchase Date</th>
                    <th className="px-6 py-3">What They Bought</th>
                    <th className="px-6 py-3 text-right">Amount Paid</th>
                    <th className="px-6 py-3 text-right">Commission</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allPurchases.map((p) => (
                    <tr key={p.purchaseId} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{p.orgName}</td>
                      <td className="px-6 py-3 text-gray-600">
                        {p.completedAt ? new Date(p.completedAt).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="px-6 py-3 text-gray-600">{purchaseTypeLabel(p.purchaseType)}</td>
                      <td className="px-6 py-3 text-right text-gray-900">{centsToEur(p.amountCents)}</td>
                      <td className="px-6 py-3 text-right font-medium text-emerald-700">{centsToEur(p.commissionCents)}</td>
                      <td className="px-6 py-3"><CommissionBadge status={p.commissionStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Affiliate Terms */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
          <button
            onClick={() => setShowTerms(!showTerms)}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-base font-semibold text-gray-900">Affiliate Programme Terms</span>
            {showTerms ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          </button>
          {showTerms && (
            <div className="px-6 pb-6 text-sm text-gray-700 space-y-4 border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 italic">Last updated: March 2026</p>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">1. Eligibility</h3>
                <p>The EasyReimburse Affiliate Programme is by invitation only. Only organisations approved by EasyReimburse ("we") may participate.</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">2. Affiliate Code</h3>
                <p>Each affiliate receives a unique discount code which they may share with potential customers. The code entitles a new customer to a discount on their first credit purchase, as configured in the system.</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">3. Commission</h3>
                <p>For every completed credit purchase made by a customer linked to your affiliate account, you earn a commission equal to the percentage stated in your affiliate dashboard, calculated on the net amount actually paid (after any discount). The commission rate may be updated by EasyReimburse with 30 days' notice.</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">4. Customer Linking</h3>
                <p>A customer is permanently linked to you when they use your affiliate code on their first purchase. A customer can only ever be linked to one affiliate. If a customer uses a different affiliate code on a subsequent purchase, the link does not change.</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">5. Refunds</h3>
                <p>If a customer purchase is refunded, the associated commission is reversed and deducted from your pending balance.</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">6. Payouts</h3>
                <p>Payouts are available when your pending balance reaches €100 or more. You may request a payout via the dashboard. Payouts are processed manually and may take up to 14 business days. We reserve the right to withhold payment if we suspect fraud or violation of these terms.</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">7. Deactivation</h3>
                <p>We may deactivate your affiliate status at any time. Deactivation stops new customers from being linked to your account but does not affect existing linked customers or pending earnings.</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">8. No Guarantees</h3>
                <p>We make no guarantees about the number of referrals or earnings you will receive.</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">9. Governing Law</h3>
                <p>These terms are governed by Belgian law. Any disputes shall be submitted to the courts of Belgium.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payout Confirmation Modal */}
      {showPayoutConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Request Payout</h3>
            <p className="text-sm text-gray-600 mb-4">
              You are requesting a payout of <strong>{centsToEur(data.pendingBalanceCents)}</strong>.
              We will contact you at <strong>{localStorage.getItem('org-email') ?? 'your email'}</strong> to arrange payment.
            </p>
            <p className="text-sm text-gray-500 mb-6">Payouts are processed manually within 14 business days.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowPayoutConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => payoutMutation.mutate()}
                disabled={payoutMutation.isPending}
                className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {payoutMutation.isPending ? 'Submitting…' : 'Confirm Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
