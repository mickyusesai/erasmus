import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { organisationApi } from '../../services/api';
import toast from 'react-hot-toast';

export default function OrgLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = useMutation({
    mutationFn: () => organisationApi.login(email, password),
    onSuccess: (data) => {
      localStorage.setItem('org-token', data.token);
      toast.success('Login successful');
      navigate('/org/dashboard');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Login failed');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">EasyReimburse</h1>
          <p className="text-gray-600 mt-2">Organisation Login</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="your@organisation.com"
            />
          </div>

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
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full py-3 px-4 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Don't have an account?{' '}
            <Link to="/org/register" className="text-primary-600 hover:text-primary-700 font-medium">
              Register here
            </Link>
          </p>
          <p className="mt-2">
            Have an invitation code?{' '}
            <Link to="/founding-access" className="text-primary-600 hover:text-primary-700 font-medium">
              Claim your free project
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
