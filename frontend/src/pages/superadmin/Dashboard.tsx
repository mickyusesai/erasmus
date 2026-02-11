import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { LogOut, Building2, CreditCard, Users, Plus, RefreshCw } from 'lucide-react';

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

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organisation | null>(null);
  const [creditsToGrant, setCreditsToGrant] = useState(1);

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

        {/* Organisations Table */}
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
                        <button
                          onClick={() => openGrantModal(org)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Grant
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
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
    </div>
  );
}
