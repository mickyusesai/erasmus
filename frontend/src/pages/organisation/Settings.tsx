import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { organisationApi } from '../../services/api';
import toast from 'react-hot-toast';
import { ArrowLeft, User, Lock, Building } from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Check if logged in
  useEffect(() => {
    const token = localStorage.getItem('org-token');
    if (!token) {
      navigate('/org/login');
    }
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['org-settings'],
    queryFn: organisationApi.getSettings,
    retry: false,
  });

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
          <p className="text-red-600 mb-4">Failed to load settings.</p>
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

        <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

        {/* Profile Section */}
        <ProfileSection organisation={data.organisation} queryClient={queryClient} />

        {/* Password Section */}
        <PasswordSection />

        {/* Account Info */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <Building className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Account Information</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Account ID</span>
              <span className="text-gray-900 font-mono">{data.organisation.id}</span>
            </div>
            {data.organisation.oid && (
              <div className="flex justify-between">
                <span className="text-gray-600">Organisation ID (OID)</span>
                <span className="text-gray-900">{data.organisation.oid}</span>
              </div>
            )}
            {data.organisation.createdAt && (
              <div className="flex justify-between">
                <span className="text-gray-600">Member since</span>
                <span className="text-gray-900">{new Date(data.organisation.createdAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ organisation, queryClient }: { organisation: { id: string; name: string; email: string; oid?: string; createdAt?: string }; queryClient: ReturnType<typeof useQueryClient> }) {
  const [name, setName] = useState(organisation.name);
  const [email, setEmail] = useState(organisation.email);
  const [isEditing, setIsEditing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: () => organisationApi.updateProfile({ name, email }),
    onSuccess: () => {
      toast.success('Profile updated successfully');
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update profile');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <User className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setName(organisation.name);
                setEmail(organisation.email);
                setIsEditing(false);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Name</span>
            <span className="text-gray-900">{organisation.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Email</span>
            <span className="text-gray-900">{organisation.email}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordSection() {
  const [isChanging, setIsChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changeMutation = useMutation({
    mutationFn: () => organisationApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password changed successfully');
      setIsChanging(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to change password');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    changeMutation.mutate();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Password</h2>
        </div>
        {!isChanging && (
          <button
            onClick={() => setIsChanging(true)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Change
          </button>
        )}
      </div>

      {isChanging ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Current Password
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Min. 8 characters with uppercase, lowercase, and a number
            </p>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setIsChanging(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={changeMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {changeMutation.isPending ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-gray-600">••••••••</p>
      )}
    </div>
  );
}
