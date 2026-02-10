import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { organisationApi } from '../../services/api';
import toast from 'react-hot-toast';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

export default function ProjectCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [country, setCountry] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [carRatePerKm, setCarRatePerKm] = useState('0.22');

  // Check if logged in
  useEffect(() => {
    const token = localStorage.getItem('org-token');
    if (!token) {
      navigate('/org/login');
    }
  }, [navigate]);

  // Check credit status
  const { data: dashboard, isLoading: loadingDashboard } = useQuery({
    queryKey: ['org-dashboard'],
    queryFn: organisationApi.getDashboard,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: () => organisationApi.createProject({
      name,
      description,
      country,
      startDate,
      endDate,
      carRatePerKm: parseFloat(carRatePerKm),
    }),
    onSuccess: (data) => {
      toast.success(`Project created! Used ${data.creditUsed === 'FOUNDING' ? 'founding credit' : data.creditUsed === 'ANNUAL' ? 'annual license' : '1 credit'}.`);
      navigate(`/org/projects/${data.project.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create project');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (new Date(endDate) < new Date(startDate)) {
      toast.error('End date must be after start date');
      return;
    }

    createMutation.mutate();
  };

  if (loadingDashboard) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const canCreate = dashboard?.credits.canCreateProject;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          to="/org/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="bg-white rounded-xl shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Create New Project</h1>
          <p className="text-gray-600 mb-6">
            Set up a new project for your Erasmus+ mobility.
          </p>

          {/* Credit warning */}
          {!canCreate && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-800">No Credits Available</h3>
                  <p className="text-amber-700 text-sm mt-1">
                    {dashboard?.credits.reason || 'Please purchase credits to create a project.'}
                  </p>
                  <Link
                    to="/org/billing"
                    className="inline-block mt-2 text-sm font-medium text-amber-800 hover:text-amber-900"
                  >
                    Purchase credits →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Credit info */}
          {canCreate && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-blue-800 text-sm">
                {dashboard?.credits.hasAnnualLicense && !dashboard?.credits.annualLicenseExpired
                  ? 'Creating this project will use your annual license (unlimited projects).'
                  : dashboard?.credits.hasFoundingCredit && !dashboard?.credits.foundingCreditExpired
                  ? 'Creating this project will use your founding credit (1 free project).'
                  : `Creating this project will use 1 credit. You have ${dashboard?.credits.available} credits available.`}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Project Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={!canCreate}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="e.g., Youth Exchange Prague 2024"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canCreate}
                rows={3}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Brief description of the project"
              />
            </div>

            <div>
              <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
                Host Country *
              </label>
              <input
                id="country"
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
                disabled={!canCreate}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="e.g., Czech Republic"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  disabled={!canCreate}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date *
                </label>
                <input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  disabled={!canCreate}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="carRatePerKm" className="block text-sm font-medium text-gray-700 mb-1">
                Car Rate per KM (EUR) *
              </label>
              <input
                id="carRatePerKm"
                type="number"
                step="0.01"
                min="0"
                value={carRatePerKm}
                onChange={(e) => setCarRatePerKm(e.target.value)}
                required
                disabled={!canCreate}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                Standard Erasmus+ rate is €0.22 per km
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <Link
                to="/org/dashboard"
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={!canCreate || createMutation.isPending}
                className="flex-1 py-3 px-6 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
