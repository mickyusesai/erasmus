import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FolderKanban, Users, CheckCircle, Clock, Euro, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { adminApi } from '../../services/api';

// Helper function to format dates as DD-MM-YYYY (European format)
function formatDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: adminApi.getDashboardStats,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Projects',
      value: stats?.totalProjects || 0,
      icon: FolderKanban,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      label: 'Total Participants',
      value: stats?.totalParticipants || 0,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: 'Files Complete',
      value: stats?.statusCounts.participantComplete || 0,
      icon: CheckCircle,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
    },
    {
      label: 'Waiting for Participant',
      value: stats?.statusCounts.draft || 0,
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
    },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of all reimbursement activities</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Financial Summary */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Financial Summary</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Euro className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total to Reimburse</p>
                    <p className="font-semibold text-gray-900">
                      {new Intl.NumberFormat('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(stats?.totalToReimburse || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-50 rounded-xl">
                  <p className="text-sm text-emerald-600">Approved</p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {stats?.statusCounts.adminApproved || 0}
                  </p>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl">
                  <p className="text-sm text-purple-600">Paid</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {stats?.statusCounts.paid || 0}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Breakdown */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Status Breakdown</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Draft', count: stats?.statusCounts.draft || 0, status: 'DRAFT' as const },
                { label: 'Participant Complete', count: stats?.statusCounts.participantComplete || 0, status: 'PARTICIPANT_COMPLETE' as const },
                { label: 'Admin Approved', count: stats?.statusCounts.adminApproved || 0, status: 'ADMIN_APPROVED' as const },
                { label: 'Paid', count: stats?.statusCounts.paid || 0, status: 'PAID' as const },
              ].map((item) => (
                <div key={item.status} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={item.status} />
                    <span className="text-gray-700">{item.label}</span>
                  </div>
                  <span className="font-semibold text-gray-900">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Projects */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Projects</h2>
            <Link
              to="/admin/projects"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {stats?.recentProjects && stats.recentProjects.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="pb-3">Project</th>
                    <th className="pb-3">Location</th>
                    <th className="pb-3">Dates</th>
                    <th className="pb-3">Participants</th>
                    <th className="pb-3">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.recentProjects.map((project) => (
                    <tr key={project.id} className="hover:bg-gray-50">
                      <td className="py-3">
                        <Link
                          to={`/admin/projects/${project.id}`}
                          className="font-medium text-gray-900 hover:text-primary-600"
                        >
                          {project.name}
                        </Link>
                      </td>
                      <td className="py-3 text-gray-600">{project.country}</td>
                      <td className="py-3 text-gray-600 text-sm">
                        {formatDate(project.startDate)} -{' '}
                        {formatDate(project.endDate)}
                      </td>
                      <td className="py-3 text-gray-600">{project.participantStats.total}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[120px]">
                            <div
                              className="h-full bg-gradient-soft rounded-full"
                              style={{
                                width: `${
                                  project.participantStats.total > 0
                                    ? (project.participantStats.paid / project.participantStats.total) * 100
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">
                            {project.participantStats.paid}/{project.participantStats.total}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No projects yet</p>
              <Link
                to="/admin/projects"
                className="text-primary-600 hover:text-primary-700 font-medium text-sm mt-2 inline-block"
              >
                Create your first project
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
