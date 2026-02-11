import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { organisationApi, OrgDashboardData } from '../../services/api';
import { Plus, Users, FolderKanban, CreditCard, Settings, LogOut, AlertTriangle, CheckCircle, ArrowRight, Euro } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

// Helper function to format dates as DD-MM-YYYY (European format)
function formatDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

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
      <div className="min-h-screen bg-gray-50">
        <div className="animate-pulse space-y-6 max-w-7xl mx-auto px-4 py-8">
          <div className="h-8 w-48 bg-gray-200 rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent>
            <div className="text-center">
              <p className="text-red-600 mb-4">Failed to load dashboard. Please login again.</p>
              <Button onClick={handleLogout}>Go to Login</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dashboard = data as OrgDashboardData;

  const statCards = [
    {
      label: 'Available Credits',
      value: dashboard.credits.hasAnnualLicense && !dashboard.credits.annualLicenseExpired
        ? '∞'
        : String(dashboard.credits.available),
      icon: CreditCard,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      label: 'Total Projects',
      value: dashboard.stats.projectCount,
      icon: FolderKanban,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: 'Total Participants',
      value: dashboard.stats.totalParticipants,
      icon: Users,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="EasyReimburse" className="w-10 h-10 rounded-xl object-contain" />
            <div>
              <h1 className="font-semibold text-gray-900">EasyReimburse</h1>
              <p className="text-xs text-gray-500">{dashboard.organisation.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/org/billing"
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Billing
            </Link>
            <Link
              to="/org/settings"
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5" />
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1">Welcome back! Here's your organisation overview.</p>
          </div>
          <Link to="/org/projects/new">
            <Button disabled={!dashboard.credits.canCreateProject}>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>

        {/* Credit Status Alert */}
        <CreditStatusCard credits={dashboard.credits} />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {statCards.map((stat) => (
            <Card key={stat.label}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Credit Summary */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Credit Summary</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Project Credits</p>
                      <p className="font-semibold text-gray-900">
                        {dashboard.credits.hasAnnualLicense && !dashboard.credits.annualLicenseExpired
                          ? 'Unlimited (Annual License)'
                          : `${dashboard.credits.available} available`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Link to="/org/billing" className="p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors">
                    <p className="text-sm text-primary-600">Buy Credits</p>
                    <p className="text-lg font-bold text-primary-700">€95/project</p>
                  </Link>
                  <Link to="/org/billing" className="p-4 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors">
                    <p className="text-sm text-emerald-600">Annual License</p>
                    <p className="text-lg font-bold text-emerald-700">€995/year</p>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Account Status</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-700">Organisation</span>
                  <span className="font-semibold text-gray-900">{dashboard.organisation.name}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-700">Email</span>
                  <span className="font-semibold text-gray-900">{dashboard.organisation.email}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-700">Projects Created</span>
                  <span className="font-semibold text-gray-900">{dashboard.stats.projectCount}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-700">Total Participants</span>
                  <span className="font-semibold text-gray-900">{dashboard.stats.totalParticipants}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Projects List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Your Projects</h2>
              {dashboard.projects.length > 0 && (
                <Link
                  to="/org/projects/new"
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                >
                  Create new <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {dashboard.projects.length === 0 ? (
              <div className="text-center py-8">
                <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No projects yet</p>
                <Link
                  to="/org/projects/new"
                  className="text-primary-600 hover:text-primary-700 font-medium text-sm mt-2 inline-block"
                >
                  Create your first project
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="pb-3">Project</th>
                      <th className="pb-3">Location</th>
                      <th className="pb-3">Dates</th>
                      <th className="pb-3">Participants</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dashboard.projects.map((project) => (
                      <tr key={project.id} className="hover:bg-gray-50">
                        <td className="py-3">
                          <Link
                            to={`/org/projects/${project.id}`}
                            className="font-medium text-gray-900 hover:text-primary-600"
                          >
                            {project.name}
                          </Link>
                        </td>
                        <td className="py-3 text-gray-600">{project.country}</td>
                        <td className="py-3 text-gray-600 text-sm">
                          {formatDate(project.startDate)} - {formatDate(project.endDate)}
                        </td>
                        <td className="py-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {project.participantCount} participants
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function CreditStatusCard({ credits }: { credits: OrgDashboardData['credits'] }) {
  // Annual license active
  if (credits.hasAnnualLicense && !credits.annualLicenseExpired) {
    const expiresAt = credits.annualLicenseExpiresAt ? new Date(credits.annualLicenseExpiresAt) : null;
    return (
      <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-emerald-800">Annual License Active</h3>
            <p className="text-emerald-700 text-sm mt-1">
              You have unlimited project credits.
              {expiresAt && ` License expires on ${formatDate(expiresAt)}.`}
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
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-800">Founding Credit Available</h3>
            <p className="text-blue-700 text-sm mt-1">
              You have 1 free project credit from early access.
              {expiresAt && ` Please start a project before ${formatDate(expiresAt)} to use it.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No credits
  if (!credits.canCreateProject) {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-amber-800">No Credits Available</h3>
            <p className="text-amber-700 text-sm mt-1">
              {credits.reason || 'Purchase credits to create new projects.'}
            </p>
            <Link
              to="/org/billing"
              className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-amber-800 hover:text-amber-900"
            >
              Buy credits <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Has regular credits - don't show anything special
  return null;
}
