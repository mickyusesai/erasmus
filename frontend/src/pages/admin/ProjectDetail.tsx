import { useState, useCallback, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import {
  ArrowLeft,
  Upload,
  Send,
  Trash2,
  Settings,
  Users,
  FileText,
  Plus,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { adminApi, Participant, ImportPreview } from '../../services/api';
import { clsx } from 'clsx';

// Helper function to format dates as DD-MM-YYYY (European format)
function formatDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

type TabType = 'overview' | 'participants' | 'settings';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => adminApi.getProject(id!),
    enabled: !!id,
  });

  const { data: participants } = useQuery({
    queryKey: ['participants', id],
    queryFn: () => adminApi.getParticipants({ projectId: id }),
    enabled: !!id,
  });

  const { data: countryLimits } = useQuery({
    queryKey: ['country-limits', id],
    queryFn: () => adminApi.getCountryLimits(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.deleteProject(id!),
    onSuccess: () => {
      toast.success('Project deleted');
      navigate('/admin/projects');
    },
    onError: () => {
      toast.error('Failed to delete project');
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded-lg" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Project not found</p>
        <Link to="/admin/projects" className="text-primary-600 hover:underline mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'participants', label: 'Participants', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/admin/projects"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-500">
            {project.country} &middot;{' '}
            {formatDate(project.startDate)} -{' '}
            {formatDate(project.endDate)}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => adminApi.exportProjectCsv(id!)}
        >
          Export CSV
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab project={project} participants={participants || []} />
      )}
      {activeTab === 'participants' && (
        <ParticipantsTab projectId={id!} participants={participants || []} />
      )}
      {activeTab === 'settings' && (
        <SettingsTab
          project={project}
          countryLimits={countryLimits || []}
          onDelete={() => {
            if (confirm('Are you sure you want to delete this project? This will also delete all participant data and uploaded documents.')) {
              deleteMutation.mutate();
            }
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function OverviewTab({ project, participants }: { project: any; participants: Participant[] }) {
  const stats = {
    total: participants.length,
    draft: participants.filter((p) => p.status === 'DRAFT').length,
    complete: participants.filter((p) => p.status === 'PARTICIPANT_COMPLETE').length,
    approved: participants.filter((p) => p.status === 'ADMIN_APPROVED').length,
    paid: participants.filter((p) => p.status === 'PAID').length,
    totalAmount: participants.reduce(
      (sum, p) => sum + (p.reimbursementSummary?.amountToReimburse || 0),
      0
    ),
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Description */}
        {project.description && (
          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-600">{project.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'bg-gray-100' },
            { label: 'Draft', value: stats.draft, color: 'bg-gray-100' },
            { label: 'Complete', value: stats.complete, color: 'bg-amber-100' },
            { label: 'Paid', value: stats.paid, color: 'bg-purple-100' },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <Card>
          <CardContent>
            <h3 className="font-semibold text-gray-900 mb-4">Financial Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Total to Reimburse</span>
                <span className="font-semibold">
                  {new Intl.NumberFormat('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(stats.totalAmount)}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-soft rounded-full"
                  style={{
                    width: `${stats.total > 0 ? (stats.paid / stats.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-sm text-gray-500">
                {stats.paid} of {stats.total} reimbursements paid
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Helper to determine participant warning status
function getParticipantWarnings(participant: Participant): { hasWarning: boolean; message: string } {
  // Check if AI check failed
  if (participant.reimbursementSummary && !participant.reimbursementSummary.aiCheckOk) {
    return { hasWarning: true, message: 'Missing documents or data issues' };
  }

  // Check if status is still draft and no documents
  if (participant.status === 'DRAFT') {
    if (!participant.reimbursementSummary || participant.reimbursementSummary.totalEur === 0) {
      return { hasWarning: true, message: 'No travel data submitted' };
    }
  }

  // Check if participant marked complete but AI check failed
  if (participant.status === 'PARTICIPANT_COMPLETE' && participant.reimbursementSummary && !participant.reimbursementSummary.aiCheckOk) {
    return { hasWarning: true, message: 'Review needed - validation issues' };
  }

  return { hasWarning: false, message: '' };
}

function ParticipantsTab({ projectId, participants }: { projectId: string; participants: Participant[] }) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  // Form state for adding individual participant
  const [newParticipant, setNewParticipant] = useState({
    firstName: '',
    lastName: '',
    email: '',
    country: '',
  });

  const sendMagicLinksMutation = useMutation({
    mutationFn: (ids: string[]) => adminApi.sendMagicLinksBulk(ids),
    onSuccess: () => {
      toast.success('Magic links sent');
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      setSelectedIds([]);
    },
    onError: () => {
      toast.error('Failed to send magic links');
    },
  });

  const createParticipantMutation = useMutation({
    mutationFn: (data: typeof newParticipant) =>
      adminApi.createParticipant({ ...data, projectId }),
    onSuccess: () => {
      toast.success('Participant added successfully');
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['country-limits-check'] });
      setShowAddModal(false);
      setNewParticipant({ firstName: '', lastName: '', email: '', country: '' });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add participant');
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === participants.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(participants.map((p) => p.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setShowAddModal(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Add Participant
        </Button>
        <Button variant="secondary" onClick={() => setShowImportModal(true)}>
          <Upload className="w-4 h-4 mr-2" />
          Import CSV
        </Button>
        {selectedIds.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => sendMagicLinksMutation.mutate(selectedIds)}
            loading={sendMagicLinksMutation.isPending}
          >
            <Send className="w-4 h-4 mr-2" />
            Send Magic Links ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* Add Participant Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Participant"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createParticipantMutation.mutate(newParticipant);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={newParticipant.firstName}
              onChange={(e) => setNewParticipant(prev => ({ ...prev, firstName: e.target.value }))}
              required
            />
            <Input
              label="Last Name"
              value={newParticipant.lastName}
              onChange={(e) => setNewParticipant(prev => ({ ...prev, lastName: e.target.value }))}
              required
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={newParticipant.email}
            onChange={(e) => setNewParticipant(prev => ({ ...prev, email: e.target.value }))}
            required
          />
          <Input
            label="Country"
            value={newParticipant.country}
            onChange={(e) => setNewParticipant(prev => ({ ...prev, country: e.target.value }))}
            placeholder="e.g., Poland, Germany, Spain..."
            required
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createParticipantMutation.isPending}
            >
              Add Participant
            </Button>
          </div>
        </form>
      </Modal>

      {/* Participants Table */}
      {participants.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === participants.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Check</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Last Email</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {participants.map((participant) => {
                  const warnings = getParticipantWarnings(participant);
                  return (
                    <tr key={participant.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(participant.id)}
                          onChange={() => toggleSelect(participant.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/participants/${participant.id}`}
                          className="font-medium text-gray-900 hover:text-primary-600"
                        >
                          {participant.firstName} {participant.lastName}
                        </Link>
                        <p className="text-sm text-gray-500">{participant.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{participant.country}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={participant.status} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {participant.status === 'PAID' || participant.status === 'ADMIN_APPROVED' ? (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100">
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                          </div>
                        ) : participant.status === 'DRAFT' && (!participant.reimbursementSummary || participant.reimbursementSummary.totalEur === 0) ? (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100" title="Waiting for submission">
                            <Clock className="w-4 h-4 text-gray-400" />
                          </div>
                        ) : warnings.hasWarning ? (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100" title={warnings.message}>
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100" title="All checks passed">
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {participant.reimbursementSummary
                          ? new Intl.NumberFormat('de-DE', {
                              style: 'currency',
                              currency: 'EUR',
                            }).format(participant.reimbursementSummary.amountToReimburse)
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {participant.lastMagicLinkSentAt
                          ? formatDate(participant.lastMagicLinkSentAt)
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/participants/${participant.id}`}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No participants yet</h3>
            <p className="text-gray-500 mb-4">Import participants from a CSV file</p>
            <Button onClick={() => setShowImportModal(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Import CSV
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Import Modal */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        projectId={projectId}
      />
    </div>
  );
}

function ImportModal({ isOpen, onClose, projectId }: { isOpen: boolean; onClose: () => void; projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const queryClient = useQueryClient();

  const previewMutation = useMutation({
    mutationFn: (file: File) => adminApi.previewImport(file),
    onSuccess: (data) => {
      setPreview(data);
      setStep('preview');
    },
    onError: () => {
      toast.error('Failed to parse CSV file');
    },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => adminApi.importParticipants(projectId, file),
    onSuccess: (data) => {
      toast.success(`Imported ${data.created} participants`);
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      handleClose();
    },
    onError: () => {
      toast.error('Failed to import participants');
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setFile(file);
      previewMutation.mutate(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
  });

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setStep('upload');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Participants" size="lg">
      {step === 'upload' && (
        <div className="space-y-6">
          <div
            {...getRootProps()}
            className={clsx(
              'dropzone',
              isDragActive && 'active'
            )}
          >
            <input {...getInputProps()} />
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              {isDragActive
                ? 'Drop the CSV file here'
                : 'Drag and drop a CSV file, or click to select'}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Required columns: first_name, last_name, email, country
            </p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl">
            <h4 className="font-medium text-gray-900 mb-2">CSV Format Example</h4>
            <code className="text-xs text-gray-600 block whitespace-pre">
              first_name,last_name,email,country{'\n'}
              Anna,Smith,anna@example.com,Poland{'\n'}
              Jan,Kowalski,jan@example.com,Germany
            </code>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-6">
          <div className="p-4 bg-emerald-50 rounded-xl">
            <p className="text-emerald-700">
              Found {preview.totalRows} participants to import
            </p>
          </div>

          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">First Name</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Last Name</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Country</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.preview.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{row.firstName}</td>
                    <td className="px-3 py-2">{row.lastName}</td>
                    <td className="px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2">{row.country}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.totalRows > 10 && (
            <p className="text-sm text-gray-500">
              Showing first 10 of {preview.totalRows} rows
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button
              onClick={() => file && importMutation.mutate(file)}
              loading={importMutation.isPending}
            >
              Import {preview.totalRows} Participants
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SettingsTab({
  project,
  countryLimits,
  onDelete,
  isDeleting,
}: {
  project: any;
  countryLimits: any[];
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [newCountry, setNewCountry] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newGreenTravel, setNewGreenTravel] = useState(false);
  const [missingCountriesChecked, setMissingCountriesChecked] = useState(false);
  const queryClient = useQueryClient();

  // Check for missing countries on mount
  const { data: missingCheck } = useQuery({
    queryKey: ['country-limits-check', project.id],
    queryFn: () => adminApi.checkMissingCountryLimits(project.id),
    enabled: !!project.id,
  });

  // Auto-populate when there are missing countries
  const autoPopulateMutation = useMutation({
    mutationFn: () => adminApi.autoPopulateCountryLimits(project.id, 0),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['country-limits'] });
      queryClient.invalidateQueries({ queryKey: ['country-limits-check'] });
      if (data.created.length > 0) {
        toast.success(`Added ${data.created.length} country limits from participants (please set amounts)`);
      }
      setMissingCountriesChecked(true);
    },
    onError: () => {
      toast.error('Failed to auto-populate country limits');
    },
  });

  // Auto-populate on mount if there are missing countries
  useEffect(() => {
    if (missingCheck?.hasMissingCountries && !missingCountriesChecked && !autoPopulateMutation.isPending) {
      autoPopulateMutation.mutate();
    }
  }, [missingCheck?.hasMissingCountries, missingCountriesChecked]);

  const addLimitMutation = useMutation({
    mutationFn: ({ country, amount, greenTravel }: { country: string; amount: number; greenTravel: boolean }) =>
      adminApi.setCountryLimit(project.id, { country, maxReimbursementAmount: amount, greenTravel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['country-limits'] });
      setNewCountry('');
      setNewAmount('275');
      setNewGreenTravel(false);
      toast.success('Country limit added');
    },
    onError: () => {
      toast.error('Failed to add country limit');
    },
  });

  const updateLimitMutation = useMutation({
    mutationFn: ({ country, amount, greenTravel }: { country: string; amount: number; greenTravel: boolean }) =>
      adminApi.setCountryLimit(project.id, { country, maxReimbursementAmount: amount, greenTravel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['country-limits'] });
    },
    onError: () => {
      toast.error('Failed to update country limit');
    },
  });

  const deleteLimitMutation = useMutation({
    mutationFn: (country: string) => adminApi.deleteCountryLimit(project.id, country),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['country-limits'] });
      toast.success('Country limit removed');
    },
  });

  const toggleGreenTravel = (limit: any) => {
    updateLimitMutation.mutate({
      country: limit.country,
      amount: limit.maxReimbursementAmount,
      greenTravel: !limit.greenTravel,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Country Limits */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Country Reimbursement Limits</h3>
              <p className="text-sm text-gray-500 mt-1">
                Maximum reimbursement amounts per sending country
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => autoPopulateMutation.mutate()}
              loading={autoPopulateMutation.isPending}
            >
              Auto-fill from participants
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Add new limit */}
            <div className="p-3 bg-gray-50 rounded-xl space-y-3">
              <div className="flex gap-3">
                <Input
                  placeholder="Country (e.g., Poland)"
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="number"
                  placeholder="Amount"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-32"
                />
                <Button
                  onClick={() => {
                    if (newCountry && newAmount) {
                      addLimitMutation.mutate({
                        country: newCountry,
                        amount: parseFloat(newAmount),
                        greenTravel: newGreenTravel,
                      });
                    }
                  }}
                  loading={addLimitMutation.isPending}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={newGreenTravel}
                  onChange={(e) => setNewGreenTravel(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Green travel (allows hotel invoice uploads)
              </label>
            </div>

            {/* Existing limits */}
            <div className="space-y-2">
              {countryLimits.map((limit) => {
                const needsAmount = limit.maxReimbursementAmount === 0;
                return (
                  <div
                    key={limit.id}
                    className={clsx(
                      'flex items-center justify-between p-3 rounded-xl',
                      needsAmount ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
                    )}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{limit.country}</span>
                        {limit.greenTravel && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            Green travel
                          </span>
                        )}
                        {needsAmount && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            Set amount
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={limit.greenTravel || false}
                          onChange={() => toggleGreenTravel(limit)}
                          className="rounded border-gray-300 w-3.5 h-3.5"
                        />
                        Green
                      </label>
                      {needsAmount ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="Amount"
                            className="w-24 text-sm"
                            onBlur={(e) => {
                              const amount = parseFloat(e.target.value);
                              if (amount > 0) {
                                updateLimitMutation.mutate({
                                  country: limit.country,
                                  amount,
                                  greenTravel: limit.greenTravel || false,
                                });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const amount = parseFloat((e.target as HTMLInputElement).value);
                                if (amount > 0) {
                                  updateLimitMutation.mutate({
                                    country: limit.country,
                                    amount,
                                    greenTravel: limit.greenTravel || false,
                                  });
                                }
                              }
                            }}
                          />
                          <span className="text-xs text-gray-400">EUR</span>
                        </div>
                      ) : (
                        <span className="text-gray-600">
                          {new Intl.NumberFormat('de-DE', {
                            style: 'currency',
                            currency: limit.currency,
                          }).format(limit.maxReimbursementAmount)}
                        </span>
                      )}
                      <button
                        onClick={() => deleteLimitMutation.mutate(limit.country)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {countryLimits.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">
                  No country limits defined yet. Import participants first - countries will be added automatically.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-red-600">Danger Zone</h3>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Deleting this project will permanently remove all participant data,
            uploaded documents, and reimbursement records. This action cannot be undone.
          </p>
          <Button variant="danger" onClick={onDelete} loading={isDeleting}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Project
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
