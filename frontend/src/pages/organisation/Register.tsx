import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { organisationApi } from '../../services/api';
import toast from 'react-hot-toast';
import { UserPlus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent } from '../../components/ui/Card';

export default function OrgRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const plan = searchParams.get('plan');
  const afterRegisterPath = plan ? `/org/billing?plan=${plan}` : '/org/dashboard';

  const registerMutation = useMutation({
    mutationFn: () => organisationApi.register({ name, email, password }),
    onSuccess: (data) => {
      localStorage.setItem('org-token', data.token);
      localStorage.setItem('org-id', data.organisation.id);
      toast.success('Registration successful! Welcome to EasyReimburse.');
      navigate(afterRegisterPath);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Registration failed');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    registerMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="EasyReimburse" className="w-16 h-16 rounded-2xl mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 mt-1">EasyReimburse</p>
        </div>

        {/* Register Card */}
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Organisation Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Organisation"
                required
                autoFocus
              />

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@organisation.com"
                required
              />

              <div>
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Must contain uppercase, lowercase, and a number
                </p>
              </div>

              <Input
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
              />

              <Button type="submit" className="w-full" loading={registerMutation.isPending}>
                <UserPlus className="w-4 h-4 mr-2" />
                Create Account
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200 text-center text-sm text-gray-600 space-y-2">
              <p>
                Already have an account?{' '}
                <Link to={plan ? `/org/login?plan=${plan}` : '/org/login'} className="text-primary-600 hover:text-primary-700 font-medium">
                  Sign in
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
