import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { organisationApi } from '../../services/api';
import toast from 'react-hot-toast';
import { Gift, CheckCircle } from 'lucide-react';

export default function FoundingAccess() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oid, setOid] = useState('');

  const claimMutation = useMutation({
    mutationFn: () => organisationApi.claimFoundingCredit({ name, email, password, oid }),
    onSuccess: (data) => {
      localStorage.setItem('org-token', data.token);
      toast.success('Welcome! Your founding credit has been claimed.');
      navigate('/org/dashboard');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to claim founding credit');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    claimMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4">
            <Gift className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Claim Your Free Project</h1>
          <p className="text-gray-600 mt-2">
            As an early adopter, you get one project credit free!
          </p>
        </div>

        {/* Benefits */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-indigo-900 mb-2">What you get:</h3>
          <ul className="space-y-2 text-sm text-indigo-800">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-indigo-600" />
              One free project credit (worth €95)
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-indigo-600" />
              Full access to all features
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-indigo-600" />
              AI-powered document analysis
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-indigo-600" />
              Unlimited participants per project
            </li>
          </ul>
          <p className="text-xs text-indigo-600 mt-3">
            * Credit must be used to start a project within 1 month
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="oid" className="block text-sm font-medium text-gray-700 mb-1">
              Organisation ID (OID)
            </label>
            <input
              id="oid"
              type="text"
              value={oid}
              onChange={(e) => setOid(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="E10012345"
            />
            <p className="text-xs text-gray-500 mt-1">
              Your Erasmus+ Organisation ID
            </p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Organisation Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Your Organisation"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="your@organisation.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Min. 8 chars"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Confirm"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Password must contain uppercase, lowercase, and a number
          </p>

          <button
            type="submit"
            disabled={claimMutation.isPending}
            className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50"
          >
            {claimMutation.isPending ? 'Claiming your credit...' : 'Claim Free Project Credit'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Already have an account?{' '}
            <Link to="/org/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
