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
  UserPlus,
  ChevronUp,
  ChevronDown,
  Users,
  Share2,
  Search,
  Bell,
  Download,
  X,
  Archive,
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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

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

  const upgradeProjectMutation = useMutation({
    mutationFn: () => organisationApi.upgradeTestProject(id!),
    onSuccess: () => {
      toast.success('Project upgraded! Participant limit removed.');
      queryClient.invalidateQueries({ queryKey: ['org-project', id] });
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upgrade project');
    },
  });

  const expandCapacityMutation = useMutation({
    mutationFn: () => organisationApi.expandProjectCapacity(id!),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ['org-project', id] });
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to expand capacity');
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

  const settingsNeedsAttention = (countryLimits || []).some((limit: any) => limit.maxReimbursementAmount === 0);

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
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                loading={isDownloadingZip}
                onClick={async () => {
                  setIsDownloadingZip(true);
                  try {
                    await organisationApi.exportAuditZip(id!, project.name);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'No approved participants to export');
                  } finally {
                    setIsDownloadingZip(false);
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Audit ZIPs
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await organisationApi.exportProjectCsv(id!, project.name);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to export CSV');
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Test Project Banner */}
          {project.isTestProject && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-amber-800">Test Project</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      This is a free test project limited to {project.maxParticipants || 10} participants.
                      Upgrade to a full project using 1 credit to get 60 participant slots, or{' '}
                      <Link to="/org/billing" className="underline font-medium">purchase credits</Link> first.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('Upgrade this test project to a full project? This will use 1 credit and give you 60 participant slots.')) {
                      upgradeProjectMutation.mutate();
                    }
                  }}
                  disabled={upgradeProjectMutation.isPending}
                  className="flex-shrink-0 px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60"
                >
                  {upgradeProjectMutation.isPending ? 'Upgrading…' : 'Upgrade (1 credit)'}
                </button>
              </div>
            </div>
          )}

          {/* Capacity Banner for full projects near or at limit */}
          {!project.isTestProject && project.maxParticipants && participants.length >= project.maxParticipants - 5 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-blue-800">
                      {participants.length >= project.maxParticipants ? 'Participant limit reached' : 'Approaching participant limit'}
                    </h3>
                    <p className="text-sm text-blue-700 mt-1">
                      {participants.length} of {project.maxParticipants} slots used. Use 1 credit to add 60 more slots.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('Expand this project\'s capacity by 60 participants? This will use 1 credit.')) {
                      expandCapacityMutation.mutate();
                    }
                  }}
                  disabled={expandCapacityMutation.isPending}
                  className="flex-shrink-0 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {expandCapacityMutation.isPending ? 'Expanding…' : '+60 slots (1 credit)'}
                </button>
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
                  {tab.id === 'settings' && settingsNeedsAttention && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  )}
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
              countryLimits={countryLimits || []}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              project={project}
              projectId={id!}
              countryLimits={countryLimits || []}
              hasParticipants={participants.length > 0}
              approvedCount={participants.filter(p => p.status === 'ADMIN_APPROVED' || p.status === 'PAID').length}
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

function OverviewTab({
  project,
  projectId,
  participants,
  countryLimits
}: {
  project: any;
  projectId: string;
  participants: OrgParticipant[];
  countryLimits: any[];
}) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDownloadingAuditZip, setIsDownloadingAuditZip] = useState(false);
  const auditNudgeKey = `audit-nudge-dismissed-${projectId}`;
  const [showAuditNudge, setShowAuditNudge] = useState(
    () => !localStorage.getItem(auditNudgeKey)
  );
  const queryClient = useQueryClient();
  const sortStorageKey = `participant-sort-${projectId}`;
  const [sortField, setSortField] = useState<SortField>(() => {
    try {
      const saved = localStorage.getItem(sortStorageKey);
      if (saved) return (JSON.parse(saved).field as SortField) || 'name';
    } catch { /* ignore */ }
    return 'name';
  });
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    try {
      const saved = localStorage.getItem(sortStorageKey);
      if (saved) return (JSON.parse(saved).direction as SortDirection) || 'asc';
    } catch { /* ignore */ }
    return 'asc';
  });
  useEffect(() => {
    localStorage.setItem(sortStorageKey, JSON.stringify({ field: sortField, direction: sortDirection }));
  }, [sortField, sortDirection, sortStorageKey]);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Filter participants by search
  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return participants;
    const q = searchQuery.toLowerCase();
    return participants.filter((p) =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.country.toLowerCase().includes(q)
    );
  }, [participants, searchQuery]);

  // Sort participants
  const sortedParticipants = useMemo(() => {
    const sorted = [...filteredParticipants].sort((a, b) => {
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
  }, [filteredParticipants, sortField, sortDirection]);

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

  const sendRemindersMutation = useMutation({
    mutationFn: (ids: string[]) => organisationApi.sendRemindersBulk(ids),
    onSuccess: () => {
      toast.success('Reminders sent');
      queryClient.invalidateQueries({ queryKey: ['org-participants'] });
      setSelectedIds([]);
    },
    onError: () => {
      toast.error('Failed to send reminders');
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

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showReimbursementWarning, setShowReimbursementWarning] = useState(false);

  const deleteParticipantMutation = useMutation({
    mutationFn: (participantId: string) => organisationApi.deleteParticipant(participantId),
    onSuccess: () => {
      toast.success('Participant deleted');
      queryClient.invalidateQueries({ queryKey: ['org-project'] });
      queryClient.invalidateQueries({ queryKey: ['org-participants'] });
      queryClient.invalidateQueries({ queryKey: ['org-country-limits'] });
      setShowDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete participant');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => organisationApi.bulkDeleteParticipants(ids),
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deletedCount} participants`);
      queryClient.invalidateQueries({ queryKey: ['org-project'] });
      queryClient.invalidateQueries({ queryKey: ['org-participants'] });
      queryClient.invalidateQueries({ queryKey: ['org-country-limits'] });
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete participants');
    },
  });

  const checkReimbursementWarning = (ids: string[], _type: 'magic' | 'reminder') => {
    const targetParticipants = participants.filter((p) => ids.includes(p.id));
    const countriesWithNoLimit = (countryLimits || [])
      .filter((limit: any) => limit.maxReimbursementAmount === 0)
      .map((limit: any) => limit.country);
    const hasUnconfigured = targetParticipants.some((p) => countriesWithNoLimit.includes(p.country));
    if (hasUnconfigured) {
      setShowReimbursementWarning(true);
      return true;
    }
    return false;
  };

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


  const disseminationEnabled = project.disseminationEnabled;

  return (
    <div className="space-y-6">
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

      {/* Audit Archive Nudge */}
      {showAuditNudge && stats.total > 0 && stats.paid + stats.approved === stats.total && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Archive className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-emerald-900">Project complete — save your audit archive</h3>
                <p className="text-emerald-800 text-sm mt-0.5">
                  All participants have been processed. Download a ZIP of all audit PDFs to keep a personal backup — national agencies can request Erasmus+ records for up to 7 years.
                </p>
                <button
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
                  disabled={isDownloadingAuditZip}
                  onClick={async () => {
                    setIsDownloadingAuditZip(true);
                    try {
                      await organisationApi.exportAuditZip(projectId, project.name);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed to export audit ZIPs');
                    } finally {
                      setIsDownloadingAuditZip(false);
                    }
                  }}
                >
                  <Download className="w-4 h-4" />
                  {isDownloadingAuditZip ? 'Generating…' : 'Download Audit ZIPs'}
                </button>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.setItem(auditNudgeKey, 'dismissed');
                setShowAuditNudge(false);
              }}
              className="p-1 text-emerald-500 hover:text-emerald-700 rounded transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Actions & Search */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setShowAddModal(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Add Participant
        </Button>
        <Button variant="secondary" onClick={() => setShowImportModal(true)}>
          <Upload className="w-4 h-4 mr-2" />
          Import CSV
        </Button>
        <div className="relative group">
          <a href="/Reimbursement_List_TEMPLATE.csv" download>
            <button
              type="button"
              className="inline-flex items-center justify-center font-medium transition-all duration-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-[0.98] focus:ring-gray-400 px-4 py-2 text-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </button>
          </a>
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
            This is a CSV file you can open with Excel or Google Sheets. Copy-paste your participant data (first name, last name, email, country) into the template, then save/export as CSV. Upload it here and your participant list will appear automatically.
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
          </div>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search participants..."
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent w-56"
          />
        </div>
        {selectedIds.length > 0 && (() => {
          // Determine which selected participants need magic links vs reminders
          const selectedParticipants = participants.filter((p) => selectedIds.includes(p.id));
          const needsMagicLink = selectedParticipants.filter((p) => !p.lastMagicLinkSentAt);
          const needsReminder = selectedParticipants.filter((p) => p.lastMagicLinkSentAt && p.status === 'DRAFT');
          return (
            <>
              {needsMagicLink.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const ids = needsMagicLink.map((p) => p.id);
                    if (!checkReimbursementWarning(ids, 'magic')) {
                      sendMagicLinksMutation.mutate(ids);
                    }
                  }}
                  loading={sendMagicLinksMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Magic Links ({needsMagicLink.length})
                </Button>
              )}
              {needsReminder.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const ids = needsReminder.map((p) => p.id);
                    if (!checkReimbursementWarning(ids, 'reminder')) {
                      sendRemindersMutation.mutate(ids);
                    }
                  }}
                  loading={sendRemindersMutation.isPending}
                >
                  <Bell className="w-4 h-4 mr-2" />
                  Send Reminders ({needsReminder.length})
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => setShowBulkDeleteConfirm(true)}
                loading={bulkDeleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedIds.length})
              </Button>
            </>
          );
        })()}
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
                  {disseminationEnabled && (
                    <th className="px-4 py-3 text-center">Dissem.</th>
                  )}
                  <SortHeader field="amount">Amount</SortHeader>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedParticipants.map((participant) => {
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
                          ? participant.reimbursementSummary.maxReimbursementAllowed === 0
                            ? <span className="text-gray-400 italic">Not set</span>
                            : new Intl.NumberFormat('de-DE', {
                                style: 'currency',
                                currency: 'EUR',
                              }).format(participant.reimbursementSummary.amountToReimburse)
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {participant.lastMagicLinkSentAt && participant.status === 'DRAFT' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (checkReimbursementWarning([participant.id], 'reminder')) return;
                              organisationApi.sendReminder(participant.id).then(() => {
                                toast.success(`Reminder sent to ${participant.firstName}`);
                              }).catch(() => {
                                toast.error('Failed to send reminder');
                              });
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors"
                            title={`Last email: ${formatDate(participant.lastMagicLinkSentAt)}`}
                          >
                            <Bell className="w-3 h-3" />
                            Remind
                          </button>
                        ) : !participant.lastMagicLinkSentAt ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (checkReimbursementWarning([participant.id], 'magic')) return;
                              organisationApi.sendMagicLink(participant.id).then(() => {
                                toast.success(`Magic link sent to ${participant.firstName}`);
                                queryClient.invalidateQueries({ queryKey: ['org-participants'] });
                              }).catch(() => {
                                toast.error('Failed to send magic link');
                              });
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-full transition-colors"
                          >
                            <Send className="w-3 h-3" />
                            Send Link
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {formatDate(participant.lastMagicLinkSentAt)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/org/participants/${participant.id}`}
                            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                          >
                            View
                          </Link>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteConfirm(participant.id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                            title="Delete participant"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(null)}
        title="Delete Participant"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete this participant? This will permanently remove all their data, uploaded documents, and reimbursement records. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => showDeleteConfirm && deleteParticipantMutation.mutate(showDeleteConfirm)}
              loading={deleteParticipantMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Delete Confirmation Modal */}
      <Modal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        title="Delete Selected Participants"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete {selectedIds.length} selected participant{selectedIds.length !== 1 ? 's' : ''}? This will permanently remove all their data, uploaded documents, and reimbursement records. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowBulkDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => bulkDeleteMutation.mutate(selectedIds)}
              loading={bulkDeleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete {selectedIds.length} Participant{selectedIds.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reimbursement Warning Modal */}
      <Modal
        isOpen={showReimbursementWarning}
        onClose={() => setShowReimbursementWarning(false)}
        title="Reimbursement Not Configured"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Some countries don't have a maximum reimbursement amount configured yet. Please go to the Settings tab to configure the reimbursement limits before sending emails, otherwise participants will not see their reimbursement amount.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowReimbursementWarning(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
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
  approvedCount,
  onDelete,
  isDeleting,
}: {
  project: any;
  projectId: string;
  countryLimits: any[];
  hasParticipants: boolean;
  approvedCount: number;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const queryClient = useQueryClient();
  const editLocked = approvedCount >= 2;

  // Project detail edit state
  const [editName, setEditName] = useState(project.name);
  const [editCountry, setEditCountry] = useState(project.country);
  const [editVenueAddress, setEditVenueAddress] = useState(project.venueAddress || '');
  const [editStartDate, setEditStartDate] = useState(project.startDate ? project.startDate.slice(0, 10) : '');
  const [editEndDate, setEditEndDate] = useState(project.endDate ? project.endDate.slice(0, 10) : '');

  const updateProjectMutation = useMutation({
    mutationFn: () => organisationApi.updateProject(projectId, {
      name: editName,
      country: editCountry,
      venueAddress: editVenueAddress,
      startDate: editStartDate,
      endDate: editEndDate,
    }),
    onSuccess: () => {
      toast.success('Project details updated');
      queryClient.invalidateQueries({ queryKey: ['org-project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update project');
    },
  });

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
      {/* Project Details Edit */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Project Details</h3>
              <p className="text-sm text-gray-500 mt-1">Edit the basic information for this project.</p>
            </div>
            {editLocked && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">
                Locked — 2+ participants approved
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Project Name"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                disabled={editLocked}
              />
            </div>
            <Input
              label="Country / Location"
              value={editCountry}
              onChange={e => setEditCountry(e.target.value)}
              disabled={editLocked}
            />
            <Input
              label="Venue Address"
              value={editVenueAddress}
              onChange={e => setEditVenueAddress(e.target.value)}
              disabled={editLocked}
            />
            <Input
              label="Start Date"
              type="date"
              value={editStartDate}
              onChange={e => setEditStartDate(e.target.value)}
              disabled={editLocked}
            />
            <Input
              label="End Date"
              type="date"
              value={editEndDate}
              onChange={e => setEditEndDate(e.target.value)}
              disabled={editLocked}
            />
          </div>
          {!editLocked && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => updateProjectMutation.mutate()}
                loading={updateProjectMutation.isPending}
                disabled={!editName.trim() || !editCountry.trim()}
              >
                Save Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
                            className="w-24 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                          className="w-24 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
