import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { organisationApi, ExchangeRateMode } from '../../services/api';
import toast from 'react-hot-toast';
import { ArrowLeft, ChevronDown, CreditCard, Gift, HelpCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { SetupSteps } from '../../components/organisation/SetupSteps';

/** What one project credit costs, as on the Billing page */
const CREDIT_PRICES = [
  { label: 'Single credit', price: '€129' },
  { label: 'Pack of 5', price: '€499' },
  { label: 'Pack of 10', price: '€899' },
];

export default function ProjectCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  /** Which kind of project, when there is a choice (the free first project or a credit) */
  const [kind, setKind] = useState<'free' | 'credit' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [country, setCountry] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [exchangeRateMode, setExchangeRateMode] = useState<ExchangeRateMode>('PURCHASE_DATE');
  const [exchangeRateManualDate, setExchangeRateManualDate] = useState('');
  /** A description and the exchange rate rule have good defaults: folded away until asked for */
  const [showMore, setShowMore] = useState(false);

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
      free: chosen === 'free',
      name,
      description,
      country,
      venueAddress: venueAddress || undefined,
      startDate,
      endDate,
      exchangeRateMode,
      exchangeRateManualDate: exchangeRateMode === 'MANUAL_DATE' ? (exchangeRateManualDate || null) : null,
    }),
    onSuccess: (data) => {
      toast.success(data.free ? `Project created. It's free for up to ${freeMax} participants.` : 'Project created! Used 1 credit.');
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
      // On to the participants, the amounts and the invitations
      navigate(`/org/projects/${data.project.id}/setup`);
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

    if (exchangeRateMode === 'MANUAL_DATE' && !exchangeRateManualDate) {
      toast.error('Please choose the date to use for exchange rates');
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

  // The first project is free (up to 10 participants); every other one uses a credit.
  // With both at hand the free one is the default: it can be upgraded later, a credit can't be taken back.
  const credits = dashboard?.credits.available ?? 0;
  const freeAvailable = !!dashboard?.freeProject?.available;
  const freeMax = dashboard?.freeProject?.maxParticipants ?? 10;
  const chosen: 'free' | 'credit' | null =
    kind === 'free' && freeAvailable ? 'free' : kind === 'credit' && credits > 0 ? 'credit' : freeAvailable ? 'free' : credits > 0 ? 'credit' : null;
  const canCreate = chosen !== null;

  // Neither a free project nor a credit: this is the moment a credit is needed, so say what it costs
  if (!canCreate) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link to="/org/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="bg-white rounded-xl shadow-sm p-8">
            <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center mb-4">
              <CreditCard className="w-6 h-6 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">A new project needs a project credit</h1>
            <p className="text-gray-600 mt-2">
              One credit is one project with up to 60 participants. Your free project has been used already.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-6">
              {CREDIT_PRICES.map((option) => (
                <div key={option.label} className="rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-sm text-gray-500">{option.label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{option.price}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-6">
              <Link to="/org/dashboard" className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Not now
              </Link>
              <Link to="/org/billing" className="flex-1 py-3 px-6 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors text-center">
                Buy credits
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <div className="mb-6 pb-6 border-b border-gray-100">
            <SetupSteps current={1} done={[]} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Create New Project</h1>
          <p className="text-gray-600 mb-6">
            Its name, place and dates are enough to start. The participants, the amounts and the invitations come next.
          </p>

          {/* What this project costs: nothing (the first one), or a credit */}
          {freeAvailable && credits > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6" role="radiogroup" aria-label="Kind of project">
              {([
                { id: 'free', icon: Gift, title: 'Free project', text: `Up to ${freeMax} participants. No credit needed, and you can upgrade it later.` },
                { id: 'credit', icon: CreditCard, title: 'Full project', text: `Up to 60 participants. Uses 1 of your ${credits} credit${credits === 1 ? '' : 's'}.` },
              ] as const).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen === option.id}
                  onClick={() => setKind(option.id)}
                  className={clsx(
                    'text-left rounded-xl border-2 p-4 transition-colors',
                    chosen === option.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <option.icon className={clsx('w-4 h-4', chosen === option.id ? 'text-primary-600' : 'text-gray-400')} />
                    <span className="font-semibold text-gray-900">{option.title}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{option.text}</p>
                </button>
              ))}
            </div>
          ) : chosen === 'free' ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6 flex items-start gap-3">
              <Gift className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-emerald-900 text-sm">
                <strong>Your first project is free</strong> for up to {freeMax} participants. Need room for more later? You can upgrade it with a
                credit at any time.
              </p>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-blue-800 text-sm">
                {`Creating this project will use 1 credit. You have ${credits} credit${credits === 1 ? '' : 's'} available.`}
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

            <div>
              <div className="flex items-center gap-1 mb-1">
                <label htmlFor="venueAddress" className="block text-sm font-medium text-gray-700">
                  Venue Address
                </label>
                <div className="relative group">
                  <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-72 z-10">
                    The venue address helps our AI understand where participants are traveling to. Participants may not always reach the exact venue by public transport (e.g., bus pickup from a nearby city).
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
              <input
                id="venueAddress"
                type="text"
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                disabled={!canCreate}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="e.g., Dlouha 33, Prague, Czech Republic"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Arrival Day *
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
                  Departure Day *
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

            {/* A description and the exchange rate rule: good defaults, changeable here or later in Settings */}
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              aria-expanded={showMore}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              <ChevronDown className={clsx('w-4 h-4 transition-transform', showMore && 'rotate-180')} />
              More options
              {!showMore && <span className="font-normal text-gray-400">· description, exchange rates (by purchase date)</span>}
            </button>

            {showMore && (
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
            )}

            {/* Exchange rate handling */}
            {showMore && (
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center gap-1 mb-1 mt-3">
                <label className="block text-sm font-medium text-gray-700">
                  Currency Exchange Rate
                </label>
                <div className="relative group">
                  <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-72 z-10">
                    Choose which exchange rate to apply when converting foreign-currency receipts to EUR. You can fine-tune individual currencies later in project settings.
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
              <select
                value={exchangeRateMode}
                onChange={(e) => setExchangeRateMode(e.target.value as ExchangeRateMode)}
                disabled={!canCreate}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="PURCHASE_DATE">By purchase date (recommended)</option>
                <option value="PROJECT_END_DATE">By project end date (one rate per currency)</option>
                <option value="MANUAL_DATE">By a specific date (one rate per currency)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {exchangeRateMode === 'PURCHASE_DATE' && 'Each receipt is converted using the official rate for its purchase month.'}
                {exchangeRateMode === 'PROJECT_END_DATE' && 'All receipts use the official rate from the project end date — one rate per currency.'}
                {exchangeRateMode === 'MANUAL_DATE' && 'All receipts use the official rate from the date you choose — one rate per currency.'}
              </p>
              {exchangeRateMode === 'MANUAL_DATE' && (
                <div className="mt-3">
                  <label htmlFor="exchangeRateManualDate" className="block text-sm font-medium text-gray-700 mb-1">
                    Exchange rate date *
                  </label>
                  <input
                    id="exchangeRateManualDate"
                    type="date"
                    value={exchangeRateManualDate}
                    onChange={(e) => setExchangeRateManualDate(e.target.value)}
                    disabled={!canCreate}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
              )}
            </div>
            )}

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
