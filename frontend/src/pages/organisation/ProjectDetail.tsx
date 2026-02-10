import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { organisationApi } from '../../services/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Users, Calendar, MapPin, Edit2, Save, X, Copy, ExternalLink, Trash2 } from 'lucide-react';

export default function OrgProjectDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    country: '',
    startDate: '',
    endDate: '',
    carRatePerKm: 0,
  });

  // Check if logged in
  useEffect(() => {
    const token = localStorage.getItem('org-token');
    if (!token) {
      navigate('/org/login');
    }
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['org-project', id],
    queryFn: () => organisationApi.getProject(id!),
    enabled: !!id,
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: typeof editForm) => organisationApi.updateProject(id!, updates),
    onSuccess: () => {
      toast.success('Project updated successfully');
      queryClient.invalidateQueries({ queryKey: ['org-project', id] });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update project');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => organisationApi.deleteProject(id!),
    onSuccess: () => {
      toast.success('Project deleted successfully');
      navigate('/org/dashboard');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete project');
    },
  });

  useEffect(() => {
    if (data?.project) {
      const p = data.project;
      setEditForm({
        name: p.name,
        description: p.description || '',
        country: p.country,
        startDate: new Date(p.startDate).toISOString().split('T')[0],
        endDate: new Date(p.endDate).toISOString().split('T')[0],
        carRatePerKm: p.carRatePerKm,
      });
    }
  }, [data]);

  const handleSave = () => {
    if (new Date(editForm.endDate) < new Date(editForm.startDate)) {
      toast.error('End date must be after start date');
      return;
    }
    updateMutation.mutate(editForm);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  const copyParticipantLink = () => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/reimbursement?project=${id}`;
    navigator.clipboard.writeText(link);
    toast.success('Participant link copied to clipboard');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !data?.project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <p className="text-red-600 mb-4">Project not found or access denied.</p>
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

  const project = data.project;

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

        {/* Project Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="text-2xl font-bold text-gray-900 w-full px-2 py-1 border border-gray-300 rounded-lg"
                />
              ) : (
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              )}

              {isEditing ? (
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="mt-2 w-full px-2 py-1 border border-gray-300 rounded-lg text-gray-600"
                  rows={2}
                  placeholder="Project description"
                />
              ) : (
                project.description && (
                  <p className="text-gray-600 mt-1">{project.description}</p>
                )
              )}
            </div>

            <div className="flex gap-2 ml-4">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="p-2 text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    <Save className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Project Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4" />
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.country}
                  onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                />
              ) : (
                <span className="text-sm">{project.country}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4" />
              {isEditing ? (
                <input
                  type="date"
                  value={editForm.startDate}
                  onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                />
              ) : (
                <span className="text-sm">{new Date(project.startDate).toLocaleDateString()}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4" />
              {isEditing ? (
                <input
                  type="date"
                  value={editForm.endDate}
                  onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                />
              ) : (
                <span className="text-sm">{new Date(project.endDate).toLocaleDateString()}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Users className="w-4 h-4" />
              <span className="text-sm">{project.participantCount} participants</span>
            </div>
          </div>

          {/* Car rate */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-sm font-medium">Car rate:</span>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.carRatePerKm}
                  onChange={(e) => setEditForm({ ...editForm, carRatePerKm: parseFloat(e.target.value) })}
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                />
              ) : (
                <span className="text-sm">€{project.carRatePerKm.toFixed(2)}/km</span>
              )}
            </div>
          </div>
        </div>

        {/* Participant Link */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Participant Registration Link</h2>
          <p className="text-gray-600 text-sm mb-4">
            Share this link with participants so they can register and submit their reimbursement documents.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-50 rounded-lg px-4 py-3 font-mono text-sm text-gray-700 truncate">
              {window.location.origin}/reimbursement?project={id}
            </div>
            <button
              onClick={copyParticipantLink}
              className="p-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              title="Copy link"
            >
              <Copy className="w-5 h-5" />
            </button>
            <a
              href={`/reimbursement?project=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* Participants List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Participants</h2>
          </div>
          {project.participants.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No participants yet. Share the registration link to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {project.participants.map((participant) => (
                <div
                  key={participant.id}
                  className="px-6 py-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {participant.firstName} {participant.lastName}
                      </p>
                      <p className="text-sm text-gray-500">{participant.email}</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        participant.status === 'PAID' ? 'bg-green-100 text-green-800' :
                        participant.status === 'ADMIN_APPROVED' ? 'bg-blue-100 text-blue-800' :
                        participant.status === 'PARTICIPANT_COMPLETE' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {participant.status.replace(/_/g, ' ')}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">{participant.country}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger Zone */}
        {project.participantCount === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-red-200">
            <h2 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h2>
            <p className="text-gray-600 text-sm mb-4">
              Delete this project permanently. This action cannot be undone.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Project'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
