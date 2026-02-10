import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { organisationApi } from '../../services/api';
import { ArrowLeft, CreditCard, CheckCircle, Clock, AlertTriangle, ExternalLink } from 'lucide-react';

const PRICING = {
  SINGLE: { name: 'Single Project', price: 95, credits: 1 },
  PACK_5: { name: 'Pack of 5', price: 395, credits: 5, savings: 80 },
  PACK_10: { name: 'Pack of 10', price: 595, credits: 10, savings: 355 },
  ANNUAL: { name: 'Annual License', price: 995, credits: -1 },
};

export default function Billing() {
  const navigate = useNavigate();

  // Check if logged in
  useEffect(() => {
    const token = localStorage.getItem('org-token');
    if (!token) {
      navigate('/org/login');
    }
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['org-billing'],
    queryFn: organisationApi.getBilling,
    retry: false,
  });

  const handlePurchase = async (type: string) => {
    // TODO: Integrate with Stripe
    alert(`Stripe integration coming soon! You selected: ${type}`);
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Project Credits</p>
              <p className="text-2xl font-bold text-gray-900">{credits.projectCredits}</p>
            </div>

            <div className={`rounded-lg p-4 ${credits.hasAnnualLicense && !credits.annualLicenseExpired ? 'bg-green-50' : 'bg-gray-50'}`}>
              <p className="text-sm text-gray-600">Annual License</p>
              <p className="text-lg font-bold text-gray-900">
                {credits.hasAnnualLicense ? (
                  credits.annualLicenseExpired ? (
                    <span className="text-red-600">Expired</span>
                  ) : (
                    <span className="text-green-600">Active</span>
                  )
                ) : (
                  'Not active'
                )}
              </p>
              {credits.annualLicenseExpiresAt && (
                <p className="text-xs text-gray-500 mt-1">
                  {credits.annualLicenseExpired ? 'Expired' : 'Expires'}: {new Date(credits.annualLicenseExpiresAt).toLocaleDateString()}
                </p>
              )}
            </div>

            <div className={`rounded-lg p-4 ${credits.hasFoundingCredit && !credits.foundingCreditExpired ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <p className="text-sm text-gray-600">Founding Credit</p>
              <p className="text-lg font-bold text-gray-900">
                {credits.hasFoundingCredit ? (
                  credits.foundingCreditExpired ? (
                    <span className="text-red-600">Expired</span>
                  ) : (
                    <span className="text-blue-600">Available</span>
                  )
                ) : (
                  'Not available'
                )}
              </p>
              {credits.foundingCreditExpiresAt && !credits.foundingCreditExpired && (
                <p className="text-xs text-gray-500 mt-1">
                  Expires: {new Date(credits.foundingCreditExpiresAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Pricing Options */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Purchase Credits</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Single */}
            <div className="border border-gray-200 rounded-xl p-5 hover:border-primary-300 transition-colors">
              <h3 className="font-semibold text-gray-900">{PRICING.SINGLE.name}</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">€{PRICING.SINGLE.price}</p>
              <p className="text-sm text-gray-500 mt-1">{PRICING.SINGLE.credits} project credit</p>
              <button
                onClick={() => handlePurchase('SINGLE')}
                className="w-full mt-4 py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                Purchase
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
                className="w-full mt-4 py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                Purchase
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
                className="w-full mt-4 py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                Purchase
              </button>
            </div>

            {/* Annual */}
            <div className="border border-gray-200 rounded-xl p-5 hover:border-primary-300 transition-colors bg-gradient-to-br from-indigo-50 to-purple-50">
              <h3 className="font-semibold text-gray-900">{PRICING.ANNUAL.name}</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">€{PRICING.ANNUAL.price}</p>
              <p className="text-sm text-gray-500 mt-1">Unlimited projects</p>
              <p className="text-xs text-indigo-600 font-medium">For 12 months</p>
              <button
                onClick={() => handlePurchase('ANNUAL')}
                className="w-full mt-4 py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                Purchase
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4 text-center">
            Credits never expire. Annual license is valid for 12 months from purchase.
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
                           purchase.type === 'SINGLE' ? 'Single Project' :
                           purchase.type === 'PACK_5' ? 'Pack of 5' :
                           purchase.type === 'PACK_10' ? 'Pack of 10' :
                           purchase.type === 'ANNUAL' ? 'Annual License' :
                           purchase.type === 'MANUAL' ? 'Manual Credit' : purchase.type}
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
                        {purchase.creditsGranted === -1 ? 'Unlimited' : `${purchase.creditsGranted} credit${purchase.creditsGranted !== 1 ? 's' : ''}`}
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
