import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { organisationApi } from '../../services/api';
import toast from 'react-hot-toast';
import { LogIn } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent } from '../../components/ui/Card';

export default function OrgLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const plan = searchParams.get('plan');
  const afterLoginPath = plan ? `/org/billing?plan=${plan}` : '/org/dashboard';

  const loginMutation = useMutation({
    mutationFn: () => organisationApi.login(email, password),
    onSuccess: (data) => {
      localStorage.setItem('org-token', data.token);
      toast.success('Welcome back!');
      navigate(afterLoginPath);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Invalid email or password');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="EasyReimburse" className="w-16 h-16 rounded-2xl mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-gray-900">Organisation Portal</h1>
          <p className="text-gray-500 mt-1">EasyReimburse</p>
        </div>

        {/* Login Card */}
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@organisation.com"
                required
                autoFocus
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />

              <Button type="submit" className="w-full" loading={loginMutation.isPending}>
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </Button>

              <div className="text-right">
                <Link to="/org/forgot-password" className="text-sm text-gray-500 hover:text-primary-600">
                  Forgot password?
                </Link>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200 text-center text-sm text-gray-600 space-y-2">
              <p>
                Don't have an account?{' '}
                <Link to={plan ? `/org/register?plan=${plan}` : '/org/register'} className="text-primary-600 hover:text-primary-700 font-medium">
                  Register here
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
