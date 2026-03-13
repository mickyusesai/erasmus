import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { LogOut, Building2, CreditCard, Users, Plus, RefreshCw, ExternalLink, TrendingUp, CheckCircle, ToggleLeft, ToggleRight } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

function getSuperAdminHeaders(): HeadersInit {
  const token = localStorage.getItem('super-admin-token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function centsToEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

interface Organisation {
  id: string;
  name: string;
  email: string;
  projectCredits: number;
  hasAnnualLicense: boolean;
  annualLicenseExpiresAt?: string;
  foundingCreditClaimed: boolean;
  foundingCreditUsed: boolean;
  isActive: boolean;
  createdAt: string;
  _count: {
    projects: number;
  };
}

interface AffiliateOrg {
  id: string;
  name: string;
  email: string;
  affiliateCode: string | null;
  affiliateActive: boolean;
  commissionRate: number | null;
  linkedCustomerCount: number;
  totalEarnedCents: number;
  pendingBalanceCents: number;
  createdAt: string;
}

interface PayoutRequest {
  id: string;
  name: string;
  email: string;
  affiliateCode: string | null;
  pendingBalanceCents: number;
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'organisations' | 'affiliates'>('organisations');

  // Organisations state
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organisation | null>(null);
  const [creditsToGrant, setCreditsToGrant] = useState(1);

  // Affiliates state
  const [showMakeAffiliateModal, setShowMakeAffiliateModal] = useState(false);
  const [affiliateOrgId, setAffiliateOrgId] = useState('');
  const [affiliateCode, setAffiliateCode] = useState('');
  const [affiliateCommissionRate, setAffiliateCommissionRate] = useState('20');

  useEffect(() => {
    const token = localStorage.getItem('super-admin-token');
    if (!token) {
      navigate('/super-admin/login');
    }
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['super-admin-organisations'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/super-admin/organisations`, {
        headers: getSuperAdminHeaders(),
      });
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('super-admin-token');
          navigate('/super-admin/login');
          throw new Error('Session expired');
        }
        throw new Error('Failed to fetch organisations');
      }
      return res.json();
    },
    retry: false,
  });

  const { data: affiliatesData, isLoading: affiliatesLoading } = useQuery({
    queryKey: ['super-admin-affiliates'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/super-admin/affiliates`, { headers: getSuperAdminHeaders() });
      if (!res.ok) throw new Error('Failed to fetch affiliates');
      return res.json() as Promise<{ affiliates: AffiliateOrg[] }>;
    },
  });

  const { data: payoutRequestsData, isLoading: payoutRequestsLoading } = useQuery({
    queryKey: ['super-admin-payout-requests'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/super-admin/affiliates/payout-requests`, { headers: getSuperAdminHeaders() });
      if (!res.ok) throw new Error('Failed to fetch payout requests');
      return res.json() as Promise<{ affiliates: PayoutRequest[] }>;
    },
  });

  const grantCreditsMutation = useMutation({
    mutationFn: async ({ orgId, credits }: { orgId: string; credits: number }) => {
      const res = await fetch(`${API_BASE}/super-admin/organisations/${orgId}/grant-credits`, {
        method: 'POST',
        headers: getSuperAdminHeaders(),
        body: JSON.stringify({ credits }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to grant credits');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(`Granted ${creditsToGrant} credit(s) successfully`);
      queryClient.invalidateQueries({ queryKey: ['super-admin-organisations'] });
      setShowGrantModal(false);
      setSelectedOrg(null);
      setCreditsToGrant(1);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const createAffiliateMutation = useMutation({
    mutationFn: async () => {
      const rate = parseFloat(affiliateCommissionRate) / 100;
      const res = await fetch(`${API_BASE}/super-admin/affiliates`, {
        method: 'POST',
        headers: getSuperAdminHeaders(),
        body: JSON.stringify({ organisationId: affiliateOrgId, affiliateCode: affiliateCode.toUpperCase(), commissionRate: rate }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message || 'Failed to create affiliate');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Affiliate created successfully');
      queryClient.invalidateQueries({ queryKey: ['super-admin-affiliates'] });
      setShowMakeAffiliateModal(false);
      setAffiliateOrgId('');
      setAffiliateCode('');
      setAffiliateCommissionRate('20');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await fetch(`${API_BASE}/super-admin/affiliates/${orgId}/toggle-active`, {
        method: 'PATCH',
        headers: getSuperAdminHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message || 'Failed to toggle affiliate');
      }
      return res.json();
    },
    onSuccess: (d) => {
      toast.success(d.affiliateActive ? 'Affiliate activated' : 'Affiliate deactivated');
      queryClient.invalidateQueries({ queryKey: ['super-admin-affiliates'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const confirmPayoutMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await fetch(`${API_BASE}/super-admin/affiliates/${orgId}/confirm-payout`, {
        method: 'POST',
        headers: getSuperAdminHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message || 'Failed to confirm payout');
      }
      return res.json();
    },
    onSuccess: (d) => {
      toast.success(`Payout confirmed: ${centsToEur(d.totalCents)}`);
      queryClient.invalidateQueries({ queryKey: ['super-admin-affiliates'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-payout-requests'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleLogout = () => {
    localStorage.removeItem('super-admin-token');
    navigate('/super-admin/login');
  };

  const openGrantModal = (org: Organisation) => {
    setSelectedOrg(org);
    setCreditsToGrant(1);
    setShowGrantModal(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Failed to load data</p>
          <button
            onClick={() => navigate('/super-admin/login')}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const organisations: Organisation[] = data?.organisations || [];
  const stats = data?.stats || { totalOrganisations: 0, totalProjects: 0, totalCreditsOutstanding: 0 };
  const affiliates: AffiliateOrg[] = affiliatesData?.affiliates || [];
  const payoutRequests: PayoutRequest[] = payoutRequestsData?.affiliates || [];

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Super Admin</h1>
              <p className="text-sm text-gray-400">EasyReimburse Control Panel</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center">
                <Building2 className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{stats.totalOrganisations}</p>
                <p className="text-gray-400">Organisations</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-600/20 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{stats.totalProjects}</p>
                <p className="text-gray-400">Total Projects</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-600/20 rounded-xl flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{stats.totalCreditsOutstanding}</p>
                <p className="text-gray-400">Credits Outstanding</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 mb-6 bg-gray-800 p-1 rounded-lg w-fit border border-gray-700">
          <button
            onClick={() => setActiveTab('organisations')}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'organisations' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Organisations
          </button>
          <button
            onClick={() => setActiveTab('affiliates')}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'affiliates' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            <TrendingUp className="w-4 h-4" />
            Affiliates
            {payoutRequests.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-amber-500 text-gray-900 rounded-full">
                {payoutRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Organisations Tab */}
        {activeTab === 'organisations' && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Organisations</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-750 border-b border-gray-700">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Organisation</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Projects</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Credits</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">License</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {organisations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                        No organisations yet
                      </td>
                    </tr>
                  ) : (
                    organisations.map((org) => (
                      <tr key={org.id} className="hover:bg-gray-750">
                        <td className="px-6 py-4">
                          <p className="text-white font-medium">{org.name}</p>
                          <p className="text-sm text-gray-400">
                            {new Date(org.createdAt).toLocaleDateString()}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-gray-300">{org.email}</td>
                        <td className="px-6 py-4 text-center text-gray-300">{org._count.projects}</td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-yellow-600/20 text-yellow-400">
                            {org.projectCredits}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {org.hasAnnualLicense ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-purple-600/20 text-purple-400">
                              Annual
                            </span>
                          ) : org.foundingCreditClaimed && !org.foundingCreditUsed ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-600/20 text-green-400">
                              Founding
                            </span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {org.isActive ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-600/20 text-green-400">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-red-600/20 text-red-400">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openGrantModal(org)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                              Grant
                            </button>
                            <Link
                              to={`/super-admin/org/${org.id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Manage
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Affiliates Tab */}
        {activeTab === 'affiliates' && (
          <div className="space-y-6">
            {/* Affiliates Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Affiliates</h2>
                <button
                  onClick={() => setShowMakeAffiliateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Make Affiliate
                </button>
              </div>
              {affiliatesLoading ? (
                <div className="px-6 py-10 text-center text-gray-400">Loading…</div>
              ) : affiliates.length === 0 ? (
                <div className="px-6 py-10 text-center text-gray-400">No affiliates yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Organisation</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Code</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Rate</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Customers</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Total Earned</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Pending</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Active</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {affiliates.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-750">
                          <td className="px-6 py-4">
                            <p className="text-white font-medium">{a.name}</p>
                            <p className="text-xs text-gray-500">{a.email}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-purple-400 font-semibold">{a.affiliateCode ?? '—'}</span>
                          </td>
                          <td className="px-6 py-4 text-center text-gray-300">
                            {a.commissionRate != null ? `${(a.commissionRate * 100).toFixed(0)}%` : '—'}
                          </td>
                          <td className="px-6 py-4 text-center text-gray-300">{a.linkedCustomerCount}</td>
                          <td className="px-6 py-4 text-right text-gray-300">{centsToEur(a.totalEarnedCents)}</td>
                          <td className="px-6 py-4 text-right">
                            {a.pendingBalanceCents > 0 ? (
                              <span className="text-amber-400 font-medium">{centsToEur(a.pendingBalanceCents)}</span>
                            ) : (
                              <span className="text-gray-500">{centsToEur(0)}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => toggleActiveMutation.mutate(a.id)}
                              disabled={toggleActiveMutation.isPending}
                              title={a.affiliateActive ? 'Click to deactivate' : 'Click to activate'}
                            >
                              {a.affiliateActive
                                ? <ToggleRight className="w-6 h-6 text-green-400 mx-auto" />
                                : <ToggleLeft className="w-6 h-6 text-gray-500 mx-auto" />}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {a.pendingBalanceCents > 0 && (
                              <button
                                onClick={() => {
                                  if (window.confirm(`Confirm payout of ${centsToEur(a.pendingBalanceCents)} to ${a.name}?`)) {
                                    confirmPayoutMutation.mutate(a.id);
                                  }
                                }}
                                disabled={confirmPayoutMutation.isPending}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Confirm Payout
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Payout Requests */}
            {(payoutRequestsLoading || payoutRequests.length > 0) && (
              <div className="bg-gray-800 rounded-xl border border-amber-700/40 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700">
                  <h2 className="text-lg font-semibold text-white">Payout Requests</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Affiliates with pending balance awaiting payout</p>
                </div>
                {payoutRequestsLoading ? (
                  <div className="px-6 py-8 text-center text-gray-400">Loading…</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Affiliate</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Code</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Pending Balance</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {payoutRequests.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-750">
                            <td className="px-6 py-4">
                              <p className="text-white font-medium">{p.name}</p>
                              <p className="text-xs text-gray-500">{p.email}</p>
                            </td>
                            <td className="px-6 py-4 font-mono text-purple-400 font-semibold">{p.affiliateCode ?? '—'}</td>
                            <td className="px-6 py-4 text-right font-semibold text-amber-400">{centsToEur(p.pendingBalanceCents)}</td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  if (window.confirm(`Confirm payout of ${centsToEur(p.pendingBalanceCents)} to ${p.name}?`)) {
                                    confirmPayoutMutation.mutate(p.id);
                                  }
                                }}
                                disabled={confirmPayoutMutation.isPending}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Confirm Payout
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Grant Credits Modal */}
      {showGrantModal && selectedOrg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Grant Credits</h3>
            <p className="text-gray-400 mb-4">
              Grant project credits to <span className="text-white font-medium">{selectedOrg.name}</span>
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Number of Credits
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={creditsToGrant}
                onChange={(e) => setCreditsToGrant(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowGrantModal(false)}
                className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => grantCreditsMutation.mutate({ orgId: selectedOrg.id, credits: creditsToGrant })}
                disabled={grantCreditsMutation.isPending}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                {grantCreditsMutation.isPending ? 'Granting...' : 'Grant Credits'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Make Affiliate Modal */}
      {showMakeAffiliateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Make Organisation an Affiliate</h3>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Organisation</label>
                <select
                  value={affiliateOrgId}
                  onChange={(e) => setAffiliateOrgId(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  <option value="">Select organisation…</option>
                  {organisations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name} ({org.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Affiliate Code (Stripe Coupon ID)</label>
                <input
                  type="text"
                  value={affiliateCode}
                  onChange={(e) => setAffiliateCode(e.target.value.toUpperCase())}
                  placeholder="e.g. YASIR10"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono uppercase placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Commission Rate (%)</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={affiliateCommissionRate}
                  onChange={(e) => setAffiliateCommissionRate(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
                <p className="text-xs text-gray-500 mt-1">e.g. 20 = 20% commission on each purchase</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowMakeAffiliateModal(false);
                  setAffiliateOrgId('');
                  setAffiliateCode('');
                  setAffiliateCommissionRate('20');
                }}
                className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => createAffiliateMutation.mutate()}
                disabled={createAffiliateMutation.isPending || !affiliateOrgId || !affiliateCode || !affiliateCommissionRate}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {createAffiliateMutation.isPending ? 'Creating…' : 'Create Affiliate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
