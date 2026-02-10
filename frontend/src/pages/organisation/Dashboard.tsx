import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { organisationApi, OrgDashboardData } from '../../services/api';
import { Plus, Users, FolderOpen, CreditCard, Settings, LogOut, AlertTriangle, CheckCircle } from 'lucide-react';

export default function OrgDashboard() {
  const navigate = useNavigate();

  // Check if logged in
  useEffect(() => {
    const token = localStorage.getItem('org-token');
    if (!token) {
      navigate('/org/login');
    }
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['org-dashboard'],
    queryFn: organisationApi.getDashboard,
    retry: false,
  });

  const handleLogout = () => {
    localStorage.removeItem('org-token');
    navigate('/org/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <p className="text-red-600 mb-4">Failed to load dashboard. Please login again.</p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const dashboard = data as OrgDashboardData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">EasyReimburse</h1>
            <p className="text-sm text-gray-600">{dashboard.organisation.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/org/settings"
              className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-600 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Message */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Welcome back!</h2>
          <p className="text-gray-600">Here's an overview of your organisation's projects.</p>
        </div>

        {/* Credit Status */}
        <div className="mb-8">
          <CreditStatusCard credits={dashboard.credits} />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            icon={<CreditCard className="w-8 h-8 text-primary-600" />}
            label="Available Credits"
            value={dashboard.credits.hasAnnualLicense && !dashboard.credits.annualLicenseExpired
              ? 'Unlimited'
              : String(dashboard.credits.available)}
          />
          <StatCard
            icon={<FolderOpen className="w-8 h-8 text-blue-600" />}
            label="Total Projects"
            value={String(dashboard.stats.projectCount)}
          />
          <StatCard
            icon={<Users className="w-8 h-8 text-green-600" />}
            label="Total Participants"
            value={String(dashboard.stats.totalParticipants)}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-8">
          <Link
            to="/org/projects/new"
            className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
              dashboard.credits.canCreateProject
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            onClick={(e) => !dashboard.credits.canCreateProject && e.preventDefault()}
          >
            <Plus className="w-5 h-5" />
            Create New Project
          </Link>
          <Link
            to="/org/billing"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <CreditCard className="w-5 h-5" />
            Buy Credits
          </Link>
        </div>

        {/* Projects List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Your Projects</h3>
          </div>
          {dashboard.projects.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No projects yet. Create your first project to get started!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {dashboard.projects.map((project) => (
                <Link
                  key={project.id}
                  to={`/org/projects/${project.id}`}
                  className="block px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">{project.name}</h4>
                      <p className="text-sm text-gray-500">
                        {project.country} • {new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{project.participantCount} participants</p>
                      <p className="text-xs text-gray-500">Created {new Date(project.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-4">
        {icon}
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function CreditStatusCard({ credits }: { credits: OrgDashboardData['credits'] }) {
  // Annual license active
  if (credits.hasAnnualLicense && !credits.annualLicenseExpired) {
    const expiresAt = credits.annualLicenseExpiresAt ? new Date(credits.annualLicenseExpiresAt) : null;
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-green-800">Annual License Active</h3>
            <p className="text-green-700 text-sm mt-1">
              You have unlimited project credits.
              {expiresAt && ` License expires on ${expiresAt.toLocaleDateString()}.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Founding credit available
  if (credits.hasFoundingCredit && !credits.foundingCreditExpired) {
    const expiresAt = credits.foundingCreditExpiresAt ? new Date(credits.foundingCreditExpiresAt) : null;
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-800">Founding Credit Available</h3>
            <p className="text-blue-700 text-sm mt-1">
              You have 1 free project credit from early access.
              {expiresAt && ` Please start a project before ${expiresAt.toLocaleDateString()} to use it.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No credits
  if (!credits.canCreateProject) {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-800">No Credits Available</h3>
            <p className="text-amber-700 text-sm mt-1">
              {credits.reason || 'Purchase credits to create new projects.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Has regular credits
  return (
    <div className="bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl p-6">
      <div className="flex items-start gap-3">
        <CreditCard className="w-6 h-6 text-gray-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-gray-800">{credits.available} Credit{credits.available !== 1 ? 's' : ''} Available</h3>
          <p className="text-gray-600 text-sm mt-1">
            You can create {credits.available} more project{credits.available !== 1 ? 's' : ''}.
          </p>
        </div>
      </div>
    </div>
  );
}
