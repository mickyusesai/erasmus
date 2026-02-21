import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { organisationApi } from '../../services/api';
import { ArrowLeft, CreditCard, CheckCircle, Clock, AlertTriangle, ExternalLink } from 'lucide-react';

const PRICING = {
  SINGLE:  { name: 'Single Project', price: 129, credits: 1 },
  PACK_5:  { name: 'Pack of 5',      price: 499, credits: 5,  savings: 146 },
  PACK_10: { name: 'Pack of 10',     price: 899, credits: 10, savings: 391 },
} as const;

type PlanType = keyof typeof PRICING;

export default function Billing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<PlanType | null>(null);

  // Check if logged in
  useEffect(() => {
    const token = localStorage.getItem('org-token');
    if (!token) {
      navigate('/org/login');
    }
  }, [navigate]);

  // Handle ?success=1 return from Stripe
  useEffect(() => {
    if (searchParams.get('success') === '1') {
      toast.success('Payment successful! Your credits will appear shortly.');
      queryClient.invalidateQueries({ queryKey: ['org-billing'] });
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
    }
  }, [searchParams, queryClient]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['org-billing'],
    queryFn: organisationApi.getBilling,
    retry: false,
  });

  const handlePurchase = async (type: PlanType) => {
    setLoadingPlan(type);
    try {
      const { url } = await organisationApi.createCheckoutSession(type);
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start checkout');
      setLoadingPlan(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <p className="text-red-600 mb-4">Failed to load billing information.</p>
          <Link
            to="/org/dashboard"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { credits, purchases } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          to="/org/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-8">Billing & Credits</h1>

        {/* Current Status */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Status</h2>
          <div className="bg-gray-50 rounded-lg p-4 inline-block">
            <p className="text-sm text-gray-600">Available Project Credits</p>
            <p className="text-3xl font-bold text-gray-900">{credits.projectCredits}</p>
          </div>
          {searchParams.get('success') === '1' && (
            <p className="mt-4 text-sm text-amber-600">
              Credits may take a moment to appear — refresh the page if the balance hasn't updated yet.
            </p>
          )}
        </div>

        {/* Pricing Options */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Purchase Credits</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Single */}
            <div className="border border-gray-200 rounded-xl p-5 hover:border-primary-300 transition-colors">
              <h3 className="font-semibold text-gray-900">{PRICING.SINGLE.name}</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">€{PRICING.SINGLE.price}</p>
              <p className="text-sm text-gray-500 mt-1">{PRICING.SINGLE.credits} project credit</p>
              <button
                onClick={() => handlePurchase('SINGLE')}
                disabled={loadingPlan !== null}
                className="w-full mt-4 py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-60"
              >
                {loadingPlan === 'SINGLE' ? 'Redirecting…' : 'Purchase'}
              </button>
            </div>

            {/* Pack of 5 */}
            <div className="border-2 border-primary-500 rounded-xl p-5 relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                Popular
              </div>
              <h3 className="font-semibold text-gray-900">{PRICING.PACK_5.name}</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">€{PRICING.PACK_5.price}</p>
              <p className="text-sm text-gray-500 mt-1">{PRICING.PACK_5.credits} project credits</p>
              <p className="text-xs text-green-600 font-medium">Save €{PRICING.PACK_5.savings}</p>
              <button
                onClick={() => handlePurchase('PACK_5')}
                disabled={loadingPlan !== null}
                className="w-full mt-4 py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-60"
              >
                {loadingPlan === 'PACK_5' ? 'Redirecting…' : 'Purchase'}
              </button>
            </div>

            {/* Pack of 10 */}
            <div className="border border-gray-200 rounded-xl p-5 hover:border-primary-300 transition-colors">
              <h3 className="font-semibold text-gray-900">{PRICING.PACK_10.name}</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">€{PRICING.PACK_10.price}</p>
              <p className="text-sm text-gray-500 mt-1">{PRICING.PACK_10.credits} project credits</p>
              <p className="text-xs text-green-600 font-medium">Save €{PRICING.PACK_10.savings}</p>
              <button
                onClick={() => handlePurchase('PACK_10')}
                disabled={loadingPlan !== null}
                className="w-full mt-4 py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-60"
              >
                {loadingPlan === 'PACK_10' ? 'Redirecting…' : 'Purchase'}
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4 text-center">
            Credits never expire. Prices exclude VAT where applicable.
          </p>
        </div>

        {/* Purchase History */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Purchase History</h2>
          </div>
          {purchases.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CreditCard className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No purchases yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {purchase.status === 'COMPLETED' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : purchase.status === 'PENDING' ? (
                        <Clock className="w-5 h-5 text-yellow-600" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium text-gray-900">
                          {purchase.type === 'FOUNDING' ? 'Founding Credit' :
                           purchase.type === 'SINGLE'   ? 'Single Project' :
                           purchase.type === 'PACK_5'   ? 'Pack of 5' :
                           purchase.type === 'PACK_10'  ? 'Pack of 10' :
                           purchase.type === 'MANUAL'   ? 'Manual Credit' : purchase.type}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(purchase.completedAt || purchase.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        {purchase.amountCents === 0 ? 'Free' : `€${(purchase.amountCents / 100).toFixed(2)}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        {`${purchase.creditsGranted} credit${purchase.creditsGranted !== 1 ? 's' : ''}`}
                      </p>
                      {purchase.stripeInvoiceUrl && (
                        <a
                          href={purchase.stripeInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 mt-1"
                        >
                          Invoice <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
