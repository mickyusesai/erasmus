import { useState, useCallback, useMemo, useEffect } from 'react';
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
  FileText,
  AlertTriangle,
  CheckCircle,
  UserPlus,
  ChevronUp,
  ChevronDown,
  FileX,
  ShieldCheck,
  Banknote,
  Users,
  Share2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { organisationApi, OrgParticipant, ImportPreview } from '../../services/api';
import { clsx } from 'clsx';

// Helper function to format dates as DD-MM-YYYY (European format)
function formatDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

type TabType = 'overview' | 'settings';
type SortField = 'name' | 'country' | 'status' | 'check' | 'amount';
type SortDirection = 'asc' | 'desc';

export default function OrgProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Check if logged in
  useEffect(() => {
    const token = localStorage.getItem('org-token');
    if (!token) {
      navigate('/org/login');
    }
  }, [navigate]);

  const { data: projectData, isLoading } = useQuery({
    queryKey: ['org-project', id],
    queryFn: () => organisationApi.getProject(id!),
    enabled: !!id,
    retry: false,
  });

  const { data: participantsData } = useQuery({
    queryKey: ['org-participants', id],
    queryFn: () => organisationApi.getProjectParticipants(id!),
    enabled: !!id,
  });

  const { data: countryLimits } = useQuery({
    queryKey: ['org-country-limits', id],
    queryFn: () => organisationApi.getCountryLimits(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => organisationApi.deleteProject(id!),
    onSuccess: () => {
      toast.success('Project deleted');
      navigate('/org/dashboard');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete project');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-gray-200 rounded-lg" />
            <div className="h-64 bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!projectData?.project) {
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

  const project = projectData.project;
  const participants = participantsData?.participants || [];

  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-6 animate-fadeIn">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Link
              to="/org/dashboard"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                {project.isTestProject && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    Test Project
                  </span>
                )}
              </div>
              <p className="text-gray-500">
                {project.country} &middot;{' '}
                {formatDate(project.startDate)} -{' '}
                {formatDate(project.endDate)}
                {project.maxParticipants && (
                  <> &middot; Max {project.maxParticipants} participants</>
                )}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => organisationApi.exportProjectCsv(id!)}
            >
              Export CSV
            </Button>
          </div>

          {/* Test Project Banner */}
          {project.isTestProject && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-amber-800">Test Project</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    This is a free test project limited to {project.maxParticipants || 10} participants.
                    To create a full project with unlimited participants, please{' '}
                    <Link to="/org/billing" className="underline font-medium">purchase credits</Link>.
                  </p>
                </div>
              </div>
            </div>
          )}

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
            <OverviewTab
              project={project}
              projectId={id!}
              participants={participants}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              project={project}
              projectId={id!}
              countryLimits={countryLimits || []}
              hasParticipants={participants.length > 0}
              onDelete={() => {
                if (confirm('Are you sure you want to delete this project? This will also delete all participant data and uploaded documents.')) {
                  deleteMutation.mutate();
                }
              }}
              isDeleting={deleteMutation.isPending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Progress status for participant
type ProgressStatus = 'no_docs' | 'has_docs' | 'missing_items' | 'complete' | 'approved' | 'paid';

function getProgressStatus(participant: OrgParticipant): { status: ProgressStatus; label: string } {
  const { status, reimbursementSummary, _count } = participant;

  if (status === 'PAID') {
    return { status: 'paid', label: 'Paid' };
  }
  if (status === 'ADMIN_APPROVED') {
    return { status: 'approved', label: 'Approved' };
  }
  if (status === 'PARTICIPANT_COMPLETE') {
    if (reimbursementSummary && !reimbursementSummary.aiCheckOk) {
      return { status: 'missing_items', label: 'Needs review' };
    }
    return { status: 'complete', label: 'Complete' };
  }
  // DRAFT status
  if (!_count || _count.documents === 0) {
    return { status: 'no_docs', label: 'No documents' };
  }
  if (reimbursementSummary && !reimbursementSummary.aiCheckOk) {
    return { status: 'missing_items', label: 'Missing items' };
  }
  return { status: 'has_docs', label: 'In progress' };
}

function ProgressIcon({ status }: { status: ProgressStatus }) {
  const iconMap: Record<ProgressStatus, { icon: React.ElementType; bgColor: string; iconColor: string }> = {
    no_docs: { icon: FileX, bgColor: 'bg-gray-100', iconColor: 'text-gray-400' },
    has_docs: { icon: FileText, bgColor: 'bg-blue-100', iconColor: 'text-blue-600' },
    missing_items: { icon: AlertTriangle, bgColor: 'bg-amber-100', iconColor: 'text-amber-600' },
    complete: { icon: CheckCircle, bgColor: 'bg-emerald-100', iconColor: 'text-emerald-600' },
    approved: { icon: ShieldCheck, bgColor: 'bg-purple-100', iconColor: 'text-purple-600' },
    paid: { icon: Banknote, bgColor: 'bg-emerald-100', iconColor: 'text-emerald-600' },
  };

  const { icon: Icon, bgColor, iconColor } = iconMap[status];

  return (
    <div className={clsx('inline-flex items-center justify-center w-7 h-7 rounded-full', bgColor)}>
      <Icon className={clsx('w-4 h-4', iconColor)} />
    </div>
  );
}

function OverviewTab({
  project,
  projectId,
  participants
}: {
  project: any;
  projectId: string;
  participants: OrgParticipant[];
}) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const queryClient = useQueryClient();

  // Form state for adding individual participant
  const [newParticipant, setNewParticipant] = useState({
    firstName: '',
    lastName: '',
    email: '',
    country: '',
  });

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

  // Sort participants
  const sortedParticipants = useMemo(() => {
    const sorted = [...participants].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'name':
          aVal = `${a.lastName} ${a.firstName}`.toLowerCase();
          bVal = `${b.lastName} ${b.firstName}`.toLowerCase();
          break;
        case 'country':
          aVal = a.country.toLowerCase();
          bVal = b.country.toLowerCase();
          break;
        case 'status':
          const statusOrder = { PAID: 0, ADMIN_APPROVED: 1, PARTICIPANT_COMPLETE: 2, DRAFT: 3 };
          aVal = statusOrder[a.status] ?? 4;
          bVal = statusOrder[b.status] ?? 4;
          break;
        case 'check':
          const checkOrder = { paid: 0, approved: 1, complete: 2, missing_items: 3, has_docs: 4, no_docs: 5 };
          aVal = checkOrder[getProgressStatus(a).status];
          bVal = checkOrder[getProgressStatus(b).status];
          break;
        case 'amount':
          aVal = a.reimbursementSummary?.amountToReimburse || 0;
          bVal = b.reimbursementSummary?.amountToReimburse || 0;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return sorted;
  }, [participants, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </div>
    </th>
  );

  const sendMagicLinksMutation = useMutation({
    mutationFn: (ids: string[]) => organisationApi.sendMagicLinksBulk(ids),
    onSuccess: () => {
      toast.success('Magic links sent');
      queryClient.invalidateQueries({ queryKey: ['org-participants'] });
      setSelectedIds([]);
    },
    onError: () => {
      toast.error('Failed to send magic links');
    },
  });

  const createParticipantMutation = useMutation({
    mutationFn: (data: typeof newParticipant) =>
      organisationApi.createParticipant(projectId, data),
    onSuccess: () => {
      toast.success('Participant added successfully');
      queryClient.invalidateQueries({ queryKey: ['org-participants'] });
      queryClient.invalidateQueries({ queryKey: ['org-country-limits'] });
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

  const copyParticipantLink = () => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/reimbursement?project=${projectId}`;
    navigator.clipboard.writeText(link);
    toast.success('Participant link copied to clipboard');
  };

  const disseminationEnabled = project.disseminationEnabled;

  return (
    <div className="space-y-6">
      {/* Participant Registration Link */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Participant Registration Link</p>
              <p className="text-sm text-gray-500">Share with participants to submit reimbursement documents</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyParticipantLink}
                className="p-2 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200 transition-colors"
                title="Copy link"
              >
                <Copy className="w-4 h-4" />
              </button>
              <a
                href={`/reimbursement?project=${projectId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">In Progress</p>
            <p className="text-2xl font-bold text-gray-900">{stats.draft}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Complete</p>
            <p className="text-2xl font-bold text-amber-600">{stats.complete}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Approved</p>
            <p className="text-2xl font-bold text-purple-600">{stats.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Paid</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.paid}</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total to Reimburse</p>
              <p className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(stats.totalAmount)}
              </p>
            </div>
            <div className="text-right">
              <div className="h-2 w-32 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-soft rounded-full"
                  style={{
                    width: `${stats.total > 0 ? (stats.paid / stats.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {stats.paid} of {stats.total} paid
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                      checked={selectedIds.length === participants.length && participants.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <SortHeader field="name">Name</SortHeader>
                  <SortHeader field="country">Country</SortHeader>
                  <SortHeader field="status">Status</SortHeader>
                  <SortHeader field="check">Progress</SortHeader>
                  {disseminationEnabled && (
                    <th className="px-4 py-3 text-center">Dissem.</th>
                  )}
                  <SortHeader field="amount">Amount</SortHeader>
                  <th className="px-4 py-3">Last Email</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedParticipants.map((participant) => {
                  const progress = getProgressStatus(participant);
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
                          to={`/org/participants/${participant.id}`}
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
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressIcon status={progress.status} />
                          <span className="text-xs text-gray-500">{progress.label}</span>
                        </div>
                      </td>
                      {disseminationEnabled && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {participant.disseminationStatus?.hasActivity && (
                              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center" title="Has dissemination activity">
                                <Users className="w-3 h-3 text-emerald-600" />
                              </div>
                            )}
                            {participant.disseminationStatus?.hasSocialMedia && (
                              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center" title="Has social media post">
                                <Share2 className="w-3 h-3 text-blue-600" />
                              </div>
                            )}
                            {!participant.disseminationStatus?.hasActivity && !participant.disseminationStatus?.hasSocialMedia && (
                              <span className="text-gray-300">—</span>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-600">
                        {participant.reimbursementSummary
                          ? new Intl.NumberFormat('de-DE', {
                              style: 'currency',
                              currency: 'EUR',
                            }).format(participant.reimbursementSummary.amountToReimburse)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {participant.lastMagicLinkSentAt
                          ? formatDate(participant.lastMagicLinkSentAt)
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/org/participants/${participant.id}`}
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
            <p className="text-gray-500 mb-4">Add participants or import from a CSV file</p>
            <div className="flex justify-center gap-3">
              <Button onClick={() => setShowAddModal(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Participant
              </Button>
              <Button variant="secondary" onClick={() => setShowImportModal(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </Button>
            </div>
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
    mutationFn: (file: File) => organisationApi.previewImport(projectId, file),
    onSuccess: (data) => {
      setPreview(data);
      setStep('preview');
    },
    onError: () => {
      toast.error('Failed to parse CSV file');
    },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => organisationApi.importParticipants(projectId, file),
    onSuccess: (data) => {
      toast.success(`Imported ${data.created} participants`);
      queryClient.invalidateQueries({ queryKey: ['org-participants'] });
      queryClient.invalidateQueries({ queryKey: ['org-country-limits'] });
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
  projectId,
  countryLimits,
  hasParticipants,
  onDelete,
  isDeleting,
}: {
  project: any;
  projectId: string;
  countryLimits: any[];
  hasParticipants: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const queryClient = useQueryClient();

  const updateLimitMutation = useMutation({
    mutationFn: ({ country, amount, greenTravel }: { country: string; amount: number; greenTravel: boolean }) =>
      organisationApi.setCountryLimit(projectId, { country, maxReimbursementAmount: amount, greenTravel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-country-limits'] });
    },
    onError: () => {
      toast.error('Failed to update country limit');
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
      {/* Country Limits - only show if there are participants */}
      {hasParticipants && countryLimits.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <h3 className="font-semibold text-gray-900">Country Reimbursement Limits</h3>
              <p className="text-sm text-gray-500 mt-1">
                Maximum reimbursement amounts per sending country
              </p>
            </div>
          </CardHeader>
          <CardContent>
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
                        <Input
                          type="number"
                          value={limit.maxReimbursementAmount}
                          className="w-24 text-sm"
                          onChange={(e) => {
                            const amount = parseFloat(e.target.value);
                            if (amount >= 0) {
                              updateLimitMutation.mutate({
                                country: limit.country,
                                amount,
                                greenTravel: limit.greenTravel || false,
                              });
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feature Settings */}
      <FeatureSettingsCard project={project} projectId={projectId} />

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

function FeatureSettingsCard({ project, projectId }: { project: any; projectId: string }) {
  const queryClient = useQueryClient();
  const [carRate, setCarRate] = useState<string>(String(project.carRatePerKm || 0.22));

  const updateProjectMutation = useMutation({
    mutationFn: (data: { disseminationEnabled?: boolean; carRatePerKm?: number }) =>
      organisationApi.updateProject(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-project', projectId] });
      toast.success('Project settings updated');
    },
    onError: () => {
      toast.error('Failed to update project settings');
    },
  });

  const handleCarRateBlur = () => {
    const rate = parseFloat(carRate);
    if (!isNaN(rate) && rate >= 0 && rate !== project.carRatePerKm) {
      updateProjectMutation.mutate({ carRatePerKm: rate });
    }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Feature Settings</h3>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="font-medium text-gray-900">Dissemination Activities</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Allow participants to upload dissemination activities and social media posts
              </p>
            </div>
            <input
              type="checkbox"
              checked={project.disseminationEnabled || false}
              onChange={(e) =>
                updateProjectMutation.mutate({ disseminationEnabled: e.target.checked })
              }
              disabled={updateProjectMutation.isPending}
              className="rounded border-gray-300 w-5 h-5 text-primary-600 focus:ring-primary-500"
            />
          </label>

          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Car Travel Rate</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  EUR per kilometer for car travel reimbursement
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={carRate}
                  onChange={(e) => setCarRate(e.target.value)}
                  onBlur={handleCarRateBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCarRateBlur();
                  }}
                  disabled={updateProjectMutation.isPending}
                  className="w-24 text-sm"
                />
                <span className="text-sm text-gray-500">EUR/km</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
