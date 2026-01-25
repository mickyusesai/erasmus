import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Lock } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent } from '../../components/ui/Card';
import { adminApi } from '../../services/api';
import { useAuthStore } from '../../hooks/useAuthStore';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      toast.error('Please enter a password');
      return;
    }

    setLoading(true);
    try {
      const result = await adminApi.login(password);
      login(result.token);
      toast.success('Welcome back!');
      navigate('/admin/dashboard');
    } catch (error) {
      toast.error('Invalid password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-soft mb-4">
            <span className="text-white font-bold text-2xl">E+</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Portal</h1>
          <p className="text-gray-500 mt-1">Erasmus+ Reimbursement System</p>
        </div>

        {/* Login Card */}
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Input
                  label="Admin Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  autoFocus
                />
              </div>

              <Button type="submit" className="w-full" loading={loading}>
                <Lock className="w-4 h-4 mr-2" />
                Sign In
              </Button>
            </form>

            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500 text-center">
                For development, use the password configured in your environment variables.
                Default is <code className="bg-gray-200 px-1 rounded">admin123</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
