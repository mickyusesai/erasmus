import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Send,
  Copy,
  CheckCircle,
  Euro,
  FileText,
  Plane,
  Train,
  Bus,
  Car,
  Ship,
  HelpCircle,
  ExternalLink,
  Trash2,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
  Loader2,
  RefreshCw,
  CreditCard,
  MapPin,
  Building2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Users,
  Navigation,
  Plus,
  RotateCcw,
  Upload,
  X,
  Link2,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { organisationApi, TravelItem, Document, TransportMode, ReviewFinding, CreateTravelItemData } from '../../services/api';
import { clsx } from 'clsx';

// ── Helpers ────────────────────────────────────────────────────

function formatDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatAiOriginalAmount(amount: number, originalCurrencyFromAi?: string | null, currencyOriginal?: string): string {
  const currency = originalCurrencyFromAi || currencyOriginal || 'EUR';
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);
  } catch {
    return `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${currency}`;
  }
}

const transportIcons: Record<TransportMode, React.ElementType> = {
  PLANE: Plane,
  TRAIN: Train,
  BUS: Bus,
  CAR: Car,
  FERRY: Ship,
  OTHER: HelpCircle,
};

const docTypeLabels: Record<string, string> = {
  FLIGHT_INVOICE: 'Flight Invoice',
  FLIGHT_BOARDING_PASS: 'Boarding Pass',
  TRAIN_TICKET: 'Train Ticket',
  BUS_TICKET: 'Bus Ticket',
  FUEL_RECEIPT: 'Fuel Receipt',
  GREEN_TRAVEL_DECLARATION: 'Green Travel',
  HOTEL_INVOICE: 'Hotel Invoice',
  LUGGAGE_INVOICE: 'Luggage Invoice',
  BANK_TRANSACTION: 'Bank Transaction',
  OTHER: 'Other',
};

function getLinkedDocIds(item: TravelItem): string[] {
  const ids: string[] = [];
  if (item.documentId) ids.push(item.documentId);
  if (item.additionalDocumentIds) {
    try {
      const parsed = JSON.parse(item.additionalDocumentIds);
      if (Array.isArray(parsed)) ids.push(...parsed);
    } catch { /* ignore */ }
  }
  if (item.luggageDocumentId && !ids.includes(item.luggageDocumentId)) {
    ids.push(item.luggageDocumentId);
  }
  return ids;
}

function parseValidationWarnings(warnings?: string): string[] {
  if (!warnings || warnings === '[]') return [];
  try {
    const parsed = JSON.parse(warnings);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Main Component ─────────────────────────────────────────────

export default function OrgParticipantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [internalNotes, setInternalNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  // CRUD modal states
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenMessage, setReopenMessage] = useState('');
  const [reopenClearAi, setReopenClearAi] = useState(false);
  const [reopenClearItems, setReopenClearItems] = useState(false);
  const [reopenClearDocs, setReopenClearDocs] = useState(false);

  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const emptyItem: CreateTravelItemData = { modeOfTransport: 'PLANE', fromLocation: '', toLocation: '', departureDate: '', amountOriginal: 0, currencyOriginal: 'EUR', amountEur: 0 };
  const [newItemData, setNewItemData] = useState<CreateTravelItemData>(emptyItem);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocType, setUploadDocType] = useState('OTHER');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('org-token');
    if (!token) navigate('/org/login');
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['org-participant', id],
    queryFn: () => organisationApi.getParticipant(id!),
    enabled: !!id,
    retry: false,
  });

  useEffect(() => {
    if (data?.participant && !notesLoaded) {
      setInternalNotes(data.participant.notesInternal || '');
      setNotesLoaded(true);
    }
  }, [data, notesLoaded]);

  const { data: reviewData, isLoading: reviewLoading } = useQuery({
    queryKey: ['participant-review', id],
    queryFn: () => organisationApi.getReviewFindings(id!),
    enabled: !!id && data?.participant?.status !== 'DRAFT',
    staleTime: 5 * 60 * 1000,
  });

  // Auto-expand travel items that have critical findings
  useEffect(() => {
    if (reviewData?.findings) {
      const criticalItemIds = new Set<string>();
      for (const f of reviewData.findings) {
        if (f.travelItemId && (f.severity === 'critical' || f.severity === 'important') && !f.checked) {
          criticalItemIds.add(f.travelItemId);
        }
      }
      if (criticalItemIds.size > 0) {
        setExpandedItems(prev => {
          const next = new Set(prev);
          criticalItemIds.forEach(id => next.add(id));
          return next;
        });
      }
    }
  }, [reviewData?.findings]);

  const toggleFindingMutation = useMutation({
    mutationFn: ({ findingId }: { findingId: string }) =>
      organisationApi.toggleReviewFinding(id!, findingId),
    onSuccess: (result) => {
      queryClient.setQueryData(['participant-review', id], (old: { findings: ReviewFinding[] } | undefined) => {
        if (!old) return old;
        return {
          findings: old.findings.map((f) =>
            f.id === result.finding.id ? { ...f, checked: result.finding.checked } : f
          ),
        };
      });
    },
    onError: () => toast.error('Failed to update finding'),
  });

  const refreshReviewMutation = useMutation({
    mutationFn: () => organisationApi.refreshReviewFindings(id!),
    onSuccess: (result) => {
      queryClient.setQueryData(['participant-review', id], { findings: result.findings });
      toast.success('AI review refreshed');
    },
    onError: () => toast.error('Failed to refresh AI review'),
  });

  const sendMagicLinkMutation = useMutation({
    mutationFn: () => organisationApi.sendMagicLink(id!),
    onSuccess: () => {
      toast.success('Magic link sent');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
    onError: () => toast.error('Failed to send magic link'),
  });

  const approveMutation = useMutation({
    mutationFn: () => organisationApi.approveParticipant(id!),
    onSuccess: () => {
      toast.success('Participant approved');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: () => organisationApi.markPaid(id!),
    onSuccess: () => {
      toast.success('Marked as paid');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: (notes: string) => organisationApi.updateParticipant(id!, { notesInternal: notes }),
    onSuccess: () => toast.success('Notes saved'),
    onError: () => toast.error('Failed to save notes'),
  });

  const deleteParticipantMutation = useMutation({
    mutationFn: () => organisationApi.deleteParticipant(id!),
    onSuccess: () => {
      toast.success('Participant deleted');
      if (participant?.project?.id) navigate(`/org/projects/${participant.project.id}`);
      else navigate('/org/dashboard');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to delete participant'),
  });

  // ── CRUD Mutations ──

  const reopenMutation = useMutation({
    mutationFn: () => organisationApi.reopenReimbursement(id!, {
      message: reopenMessage,
      clearAiReview: reopenClearAi,
      clearTravelItems: reopenClearItems,
      clearDocuments: reopenClearDocs,
    }),
    onSuccess: () => {
      toast.success('Reimbursement reopened');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
      queryClient.invalidateQueries({ queryKey: ['participant-review', id] });
      setShowReopenModal(false);
      setReopenMessage('');
      setReopenClearAi(false);
      setReopenClearItems(false);
      setReopenClearDocs(false);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to reopen'),
  });

  const createTravelItemMutation = useMutation({
    mutationFn: async (data: CreateTravelItemData) => {
      await organisationApi.createTravelItem(id!, data);
      await organisationApi.recalculateSummary(id!);
    },
    onSuccess: () => {
      toast.success('Travel item added');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
      setShowAddItemModal(false);
      setNewItemData(emptyItem);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to create travel item'),
  });

  const updateTravelItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<CreateTravelItemData> }) => {
      await organisationApi.updateTravelItem(id!, itemId, data);
      await organisationApi.recalculateSummary(id!);
    },
    onSuccess: () => {
      toast.success('Travel item updated');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update travel item'),
  });

  const deleteTravelItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await organisationApi.deleteTravelItem(id!, itemId);
      await organisationApi.recalculateSummary(id!);
    },
    onSuccess: () => {
      toast.success('Travel item deleted');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to delete travel item'),
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async ({ file, docType }: { file: File; docType: string }) => {
      await organisationApi.uploadDocument(id!, file, docType);
    },
    onSuccess: () => {
      toast.success('Document uploaded');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadDocType('OTHER');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to upload document'),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (docId: string) => organisationApi.deleteDocument(id!, docId),
    onSuccess: () => {
      toast.success('Document deleted');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to delete document'),
  });

  const linkDocumentMutation = useMutation({
    mutationFn: ({ itemId, docId }: { itemId: string; docId: string }) =>
      organisationApi.linkDocument(id!, itemId, docId),
    onSuccess: () => {
      toast.success('Document linked');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to link document'),
  });

  const unlinkDocumentMutation = useMutation({
    mutationFn: ({ itemId, docId }: { itemId: string; docId: string }) =>
      organisationApi.unlinkDocument(id!, itemId, docId),
    onSuccess: () => {
      toast.success('Document unlinked');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to unlink document'),
  });

  const toggleExpand = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const scrollToTravelItem = useCallback((travelItemId: string) => {
    // Expand the item first
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.add(travelItemId);
      return next;
    });
    // Highlight and scroll
    setHighlightedItemId(travelItemId);
    setTimeout(() => {
      const el = document.getElementById(`travel-item-${travelItemId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    // Remove highlight after animation
    setTimeout(() => setHighlightedItemId(null), 2500);
  }, []);

  // ── Loading / Error states ──

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

  if (error || !data?.participant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <p className="text-red-600 mb-4">Participant not found or access denied.</p>
          <Link to="/org/dashboard" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const participant = data.participant;
  const summary = participant.reimbursementSummary;
  const findings = reviewData?.findings || [];
  const allChecked = findings.length > 0 && findings.every((f: ReviewFinding) => f.checked);
  const checkedCount = findings.filter((f: ReviewFinding) => f.checked).length;

  // Build a lookup: travelItemId -> findings for that item
  const findingsByItem: Record<string, ReviewFinding[]> = {};
  for (const f of findings) {
    if (f.travelItemId) {
      if (!findingsByItem[f.travelItemId]) findingsByItem[f.travelItemId] = [];
      findingsByItem[f.travelItemId].push(f);
    }
  }

  // Build a document lookup
  const docsById: Record<string, Document> = {};
  for (const doc of participant.documents) {
    docsById[doc.id] = doc;
  }

  const handleRefreshReview = () => {
    if (checkedCount > 0) {
      if (!confirm('This will delete all current review findings and your check progress, and generate a new AI review. Are you sure?')) {
        return;
      }
    }
    refreshReviewMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-6 animate-fadeIn">
          {/* ── Header ── */}
          <div className="flex items-start gap-4">
            <Link
              to={`/org/projects/${participant.project.id}`}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors mt-1"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {participant.firstName} {participant.lastName}
                </h1>
                <StatusBadge status={participant.status} />
              </div>
              <p className="text-gray-500 mt-1">
                {participant.email} &middot; {participant.country}
              </p>
              <p className="text-sm text-gray-400">
                Project: {participant.project.name}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const baseUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
                  const magicLink = `${baseUrl}/reimbursement?token=${participant.magicLinkToken}`;
                  navigator.clipboard.writeText(magicLink);
                  toast.success('Magic link copied to clipboard');
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Link
              </Button>
              <Button
                variant="secondary"
                onClick={() => sendMagicLinkMutation.mutate()}
                loading={sendMagicLinkMutation.isPending}
              >
                <Send className="w-4 h-4 mr-2" />
                Send Magic Link
              </Button>
            </div>
          </div>

          {/* ── Summary Card ── */}
          <Card variant="gradient">
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-white/70 text-sm">Total (EUR)</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(summary?.totalEur || 0)}</p>
                </div>
                <div>
                  <p className="text-white/70 text-sm">Max Allowed</p>
                  <p className="text-2xl font-bold text-white">{participant.maxReimbursementForCountry ? formatCurrency(participant.maxReimbursementForCountry) : 'Not set'}</p>
                </div>
                <div>
                  <p className="text-white/70 text-sm">To Reimburse</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(summary?.amountToReimburse || 0)}</p>
                </div>
                <div>
                  <p className="text-white/70 text-sm">Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    {summary?.aiCheckOk ? (
                      <CheckCircle className="w-5 h-5 text-emerald-300" />
                    ) : (
                      <HelpCircle className="w-5 h-5 text-amber-300" />
                    )}
                    <span className="text-white font-medium">
                      {summary?.aiCheckOk ? 'AI Check OK' : 'Needs Review'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Two Column Layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Main Column (2/3) ── */}
            <div className="lg:col-span-2 space-y-6">
              {/* Travel Items */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Travel Items</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">{participant.travelItems.length} items</span>
                      <button
                        onClick={() => setShowAddItemModal(true)}
                        className="p-1.5 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 transition-colors"
                        title="Add travel item"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {participant.travelItems.length > 0 ? (
                    <div className="space-y-3">
                      {participant.travelItems.map((item) => (
                        <TravelItemCard
                          key={item.id}
                          item={item}
                          expanded={expandedItems.has(item.id)}
                          highlighted={highlightedItemId === item.id}
                          onToggleExpand={() => toggleExpand(item.id)}
                          findings={findingsByItem[item.id] || []}
                          onToggleFinding={(findingId) => toggleFindingMutation.mutate({ findingId })}
                          docsById={docsById}
                          participantId={participant.id}
                          allDocuments={participant.documents}
                          onEdit={(itemId, data) => updateTravelItemMutation.mutate({ itemId, data })}
                          onDelete={(itemId) => {
                            if (confirm('Delete this travel item? This cannot be undone.')) {
                              deleteTravelItemMutation.mutate(itemId);
                            }
                          }}
                          onLinkDocument={(itemId, docId) => linkDocumentMutation.mutate({ itemId, docId })}
                          onUnlinkDocument={(itemId, docId) => unlinkDocumentMutation.mutate({ itemId, docId })}
                          isMutating={updateTravelItemMutation.isPending || deleteTravelItemMutation.isPending}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-6">No travel items</p>
                  )}
                </CardContent>
              </Card>

              {/* All Documents (collapsed overview) */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">All Documents</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">{participant.documents.length} files</span>
                      <button
                        onClick={() => setShowUploadModal(true)}
                        className="p-1.5 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 transition-colors"
                        title="Upload document"
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {participant.documents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {participant.documents.map((doc) => (
                        <DocumentChip
                          key={doc.id}
                          document={doc}
                          participantId={participant.id}
                          onDelete={() => {
                            if (confirm(`Delete "${doc.renamedFilename}"? This cannot be undone.`)) {
                              deleteDocumentMutation.mutate(doc.id);
                            }
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-6">No documents uploaded</p>
                  )}
                </CardContent>
              </Card>

              {/* Bank & Payment Details */}
              <Card>
                <CardHeader>
                  <h3 className="font-semibold text-gray-900">Bank & Payment Details</h3>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                        <CreditCard className="w-4 h-4" />
                        Bank Account
                      </div>
                      <div className="text-sm">
                        <p className="text-gray-500">IBAN</p>
                        <p className="font-mono text-gray-900">{participant.bankAccountIban || '-'}</p>
                      </div>
                      <div className="text-sm">
                        <p className="text-gray-500">Account Holder</p>
                        <p className="text-gray-900">{participant.bankAccountHolderName || '-'}</p>
                      </div>
                      {participant.bankAccountBic && (
                        <div className="text-sm">
                          <p className="text-gray-500">BIC</p>
                          <p className="font-mono text-gray-900">{participant.bankAccountBic}</p>
                        </div>
                      )}
                      {participant.bankName && (
                        <div className="text-sm">
                          <p className="text-gray-500">Bank Name</p>
                          <p className="text-gray-900">{participant.bankName}</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                        <MapPin className="w-4 h-4" />
                        Personal Address
                      </div>
                      {participant.personalAddress || participant.personalCity || participant.personalPostalCode || participant.personalCountry ? (
                        <>
                          {participant.personalAddress && (
                            <div className="text-sm">
                              <p className="text-gray-500">Street</p>
                              <p className="text-gray-900">{participant.personalAddress}</p>
                            </div>
                          )}
                          {(participant.personalPostalCode || participant.personalCity) && (
                            <div className="text-sm">
                              <p className="text-gray-500">City</p>
                              <p className="text-gray-900">
                                {[participant.personalPostalCode, participant.personalCity].filter(Boolean).join(' ')}
                              </p>
                            </div>
                          )}
                          {participant.personalCountry && (
                            <div className="text-sm">
                              <p className="text-gray-500">Country</p>
                              <p className="text-gray-900">{participant.personalCountry}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-400 text-sm">Not provided</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Sidebar (1/3) ── */}
            <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
              {/* AI Review Findings */}
              {participant.status !== 'DRAFT' && (
                <Card className={clsx(
                  'border',
                  allChecked ? 'border-emerald-300' : findings.length > 0 ? 'border-indigo-200' : 'border-gray-200'
                )}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className={clsx('w-4 h-4', allChecked ? 'text-emerald-500' : 'text-indigo-500')} />
                        <h3 className="font-semibold text-gray-900">AI Review</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {findings.length > 0 && (
                          <span className={clsx(
                            'text-xs font-medium px-2 py-0.5 rounded-full',
                            allChecked ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          )}>
                            {checkedCount}/{findings.length}
                          </span>
                        )}
                        <button
                          onClick={handleRefreshReview}
                          disabled={refreshReviewMutation.isPending}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                          title="Regenerate AI review"
                        >
                          <RefreshCw className={clsx('w-3.5 h-3.5', refreshReviewMutation.isPending && 'animate-spin')} />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {reviewLoading || refreshReviewMutation.isPending ? (
                      <div className="flex items-center gap-2 text-sm text-indigo-600 py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{refreshReviewMutation.isPending ? 'Regenerating review...' : 'Loading review...'}</span>
                      </div>
                    ) : findings.length > 0 ? (
                      <>
                        {allChecked && (
                          <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg text-sm text-emerald-700 mb-3">
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                            <span className="font-medium">All items reviewed</span>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          {findings.map((finding: ReviewFinding) => (
                            <FindingItem
                              key={finding.id}
                              finding={finding}
                              onToggle={() => toggleFindingMutation.mutate({ findingId: finding.id })}
                              onNavigate={finding.travelItemId ? () => scrollToTravelItem(finding.travelItemId!) : undefined}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-500 text-sm py-2">
                        No review findings yet. Findings are generated when the participant submits.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <Card>
                <CardHeader>
                  <h3 className="font-semibold text-gray-900">Actions</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {participant.status === 'PARTICIPANT_COMPLETE' && (
                      <Button className="w-full" onClick={() => approveMutation.mutate()} loading={approveMutation.isPending}>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve Reimbursement
                      </Button>
                    )}
                    {participant.status === 'ADMIN_APPROVED' && !summary?.paid && (
                      <Button className="w-full" onClick={() => markPaidMutation.mutate()} loading={markPaidMutation.isPending}>
                        <Euro className="w-4 h-4 mr-2" />
                        Mark as Paid
                      </Button>
                    )}
                    {(participant.status === 'PARTICIPANT_COMPLETE' || participant.status === 'ADMIN_APPROVED') && (
                      <Button variant="secondary" className="w-full" onClick={() => setShowReopenModal(true)}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reopen Reimbursement
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Participant Note */}
              {participant.participantNote && (
                <Card className="border-blue-200 bg-blue-50">
                  <CardHeader>
                    <h3 className="font-semibold text-blue-800">Note from Participant</h3>
                  </CardHeader>
                  <CardContent>
                    <p className="text-blue-700 text-sm whitespace-pre-wrap">{participant.participantNote}</p>
                  </CardContent>
                </Card>
              )}

              {/* Internal Notes */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-500" />
                    <h3 className="font-semibold text-gray-900">Internal Notes</h3>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Only visible to your organisation</p>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    onBlur={() => {
                      if (internalNotes !== (participant.notesInternal || '')) {
                        updateNotesMutation.mutate(internalNotes);
                      }
                    }}
                    placeholder="Add internal notes about this participant..."
                    className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y min-h-[80px]"
                    rows={3}
                  />
                </CardContent>
              </Card>

              {/* Danger Zone */}
              {participant.status === 'DRAFT' && (
                <Card className="border-red-200">
                  <CardHeader>
                    <h3 className="font-semibold text-red-600">Danger Zone</h3>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 text-sm mb-3">Delete this participant and all their data.</p>
                    <Button
                      variant="danger"
                      className="w-full"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this participant? This action cannot be undone.')) {
                          deleteParticipantMutation.mutate();
                        }
                      }}
                      loading={deleteParticipantMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Participant
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>

        {/* ── Reopen Modal ── */}
        <Modal isOpen={showReopenModal} onClose={() => setShowReopenModal(false)} title="Reopen Reimbursement">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This will set the participant's status back to Draft and allow them to edit and resubmit their reimbursement.
            </p>
            <div>
              <label className="label">Message to participant *</label>
              <textarea
                value={reopenMessage}
                onChange={(e) => setReopenMessage(e.target.value)}
                placeholder="Explain what needs to be changed..."
                className="input min-h-[100px] resize-y"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Optionally clear data:</p>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={reopenClearAi} onChange={(e) => setReopenClearAi(e.target.checked)} className="rounded border-gray-300" />
                Clear AI review findings
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={reopenClearItems} onChange={(e) => setReopenClearItems(e.target.checked)} className="rounded border-gray-300" />
                Clear travel items
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={reopenClearDocs} onChange={(e) => setReopenClearDocs(e.target.checked)} className="rounded border-gray-300" />
                Clear documents
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowReopenModal(false)}>Cancel</Button>
              <Button
                onClick={() => reopenMutation.mutate()}
                loading={reopenMutation.isPending}
                disabled={!reopenMessage.trim()}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reopen
              </Button>
            </div>
          </div>
        </Modal>

        {/* ── Add Travel Item Modal ── */}
        <Modal isOpen={showAddItemModal} onClose={() => setShowAddItemModal(false)} title="Add Travel Item" size="lg">
          <TravelItemForm
            data={newItemData}
            onChange={setNewItemData}
            onSubmit={() => createTravelItemMutation.mutate(newItemData)}
            onCancel={() => { setShowAddItemModal(false); setNewItemData(emptyItem); }}
            loading={createTravelItemMutation.isPending}
            submitLabel="Add Travel Item"
          />
        </Modal>

        {/* ── Upload Document Modal ── */}
        <Modal isOpen={showUploadModal} onClose={() => { setShowUploadModal(false); setUploadFile(null); }} title="Upload Document">
          <div className="space-y-4">
            <div>
              <label className="label">Document type</label>
              <select
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value)}
                className="input"
              >
                {Object.entries(docTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="input text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              />
            </div>
            {uploadFile && (
              <p className="text-sm text-gray-500">
                Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(0)} KB)
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => { setShowUploadModal(false); setUploadFile(null); }}>Cancel</Button>
              <Button
                onClick={() => uploadFile && uploadDocumentMutation.mutate({ file: uploadFile, docType: uploadDocType })}
                loading={uploadDocumentMutation.isPending}
                disabled={!uploadFile}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}

// ── TravelItemForm (shared between Add and Edit) ──────────────

function TravelItemForm({
  data,
  onChange,
  onSubmit,
  onCancel,
  loading,
  submitLabel,
}: {
  data: CreateTravelItemData;
  onChange: (data: CreateTravelItemData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading: boolean;
  submitLabel: string;
}) {
  const update = (field: string, value: string | number | undefined) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Mode of transport *</label>
          <select value={data.modeOfTransport} onChange={(e) => update('modeOfTransport', e.target.value)} className="input">
            <option value="PLANE">Plane</option>
            <option value="TRAIN">Train</option>
            <option value="BUS">Bus</option>
            <option value="CAR">Car</option>
            <option value="FERRY">Ferry</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="label">Currency</label>
          <input type="text" value={data.currencyOriginal} onChange={(e) => update('currencyOriginal', e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">From *</label>
          <input type="text" value={data.fromLocation} onChange={(e) => update('fromLocation', e.target.value)} className="input" required />
        </div>
        <div>
          <label className="label">To *</label>
          <input type="text" value={data.toLocation} onChange={(e) => update('toLocation', e.target.value)} className="input" required />
        </div>
        <div>
          <label className="label">Departure date *</label>
          <input type="date" value={data.departureDate} onChange={(e) => update('departureDate', e.target.value)} className="input" required />
        </div>
        <div>
          <label className="label">Arrival date</label>
          <input type="date" value={data.arrivalDate || ''} onChange={(e) => update('arrivalDate', e.target.value || undefined)} className="input" />
        </div>
        <div>
          <label className="label">Amount (EUR) *</label>
          <input type="number" step="0.01" value={data.amountEur} onChange={(e) => update('amountEur', parseFloat(e.target.value) || 0)} className="input" required />
        </div>
        <div>
          <label className="label">Amount (original currency)</label>
          <input type="number" step="0.01" value={data.amountOriginal} onChange={(e) => update('amountOriginal', parseFloat(e.target.value) || 0)} className="input" />
        </div>
        {data.modeOfTransport === 'PLANE' && (
          <div>
            <label className="label">Flight number</label>
            <input type="text" value={data.flightNumber || ''} onChange={(e) => update('flightNumber', e.target.value || undefined)} className="input" />
          </div>
        )}
        <div>
          <label className="label">Booking reference</label>
          <input type="text" value={data.bookingReference || ''} onChange={(e) => update('bookingReference', e.target.value || undefined)} className="input" />
        </div>
        {data.modeOfTransport === 'CAR' && (
          <div>
            <label className="label">Distance (km)</label>
            <input type="number" value={data.distanceKm || ''} onChange={(e) => update('distanceKm', parseFloat(e.target.value) || undefined)} className="input" />
          </div>
        )}
      </div>
      <div>
        <label className="label">Comment</label>
        <textarea value={data.comment || ''} onChange={(e) => update('comment', e.target.value || undefined)} className="input resize-y min-h-[60px]" rows={2} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={loading} disabled={!data.fromLocation || !data.toLocation || !data.departureDate}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ── FindingItem ────────────────────────────────────────────────

function FindingItem({
  finding,
  onToggle,
  onNavigate,
}: {
  finding: ReviewFinding;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className={clsx(
      'flex items-start gap-2 p-2 rounded-lg text-sm w-full text-left transition-colors',
      finding.checked
        ? 'bg-gray-50 opacity-60'
        : finding.severity === 'critical'
          ? 'bg-red-50'
          : finding.severity === 'important'
            ? 'bg-amber-50'
            : 'bg-gray-50',
    )}>
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={clsx(
          'w-4 h-4 rounded border mt-0.5 flex-shrink-0 flex items-center justify-center transition-colors',
          finding.checked
            ? 'bg-emerald-500 border-emerald-500'
            : finding.severity === 'critical'
              ? 'border-red-300 hover:bg-red-100'
              : finding.severity === 'important'
                ? 'border-amber-300 hover:bg-amber-100'
                : 'border-gray-300 hover:bg-gray-100',
        )}
      >
        {finding.checked && <Check className="w-3 h-3 text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {!finding.checked && (
            finding.severity === 'critical' ? (
              <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
            ) : finding.severity === 'important' ? (
              <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
            ) : (
              <Info className="w-3 h-3 text-gray-400 flex-shrink-0" />
            )
          )}
          <span className={clsx(
            'px-1.5 py-0.5 rounded text-xs font-medium',
            finding.checked
              ? 'bg-gray-100 text-gray-500'
              : finding.severity === 'critical'
                ? 'bg-red-100 text-red-700'
                : finding.severity === 'important'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600',
          )}>
            {finding.category}
          </span>
          {/* Navigate arrow for item-linked findings */}
          {onNavigate && !finding.checked && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(); }}
              className="ml-auto p-0.5 rounded hover:bg-white/60 text-gray-400 hover:text-indigo-600 transition-colors"
              title="Jump to travel item"
            >
              <Navigation className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className={clsx(
          'mt-1',
          finding.checked
            ? 'text-gray-400 line-through'
            : finding.severity === 'critical'
              ? 'text-red-800'
              : finding.severity === 'important'
                ? 'text-amber-800'
                : 'text-gray-600',
        )}>
          {finding.message}
        </p>
      </div>
    </div>
  );
}

// ── DocumentChip (compact view for All Documents section) ─────

function DocumentChip({ document, participantId, onDelete }: { document: Document; participantId: string; onDelete?: () => void }) {
  const handleView = async () => {
    try {
      const { url } = await organisationApi.getDocumentUrl(participantId, document.id);
      window.open(url, '_blank');
    } catch {
      toast.error('Failed to get document URL');
    }
  };

  return (
    <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left group">
      <button onClick={handleView} className="flex items-center gap-2 flex-1 min-w-0">
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{document.renamedFilename}</p>
          <p className="text-xs text-gray-500">{docTypeLabels[document.documentType] || document.documentType}</p>
        </div>
        <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-primary-500 flex-shrink-0" />
      </button>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded hover:bg-red-100 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
          title="Delete document"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ── InlineDocumentCard (inside expanded travel item) ──────────

function InlineDocumentCard({ document, participantId, onUnlink }: { document: Document; participantId: string; onUnlink?: () => void }) {
  const handleView = async () => {
    try {
      const { url } = await organisationApi.getDocumentUrl(participantId, document.id);
      window.open(url, '_blank');
    } catch {
      toast.error('Failed to get document URL');
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors text-left group">
      <button onClick={handleView} className="flex items-center gap-2 flex-1 min-w-0">
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800 truncate">{document.renamedFilename}</p>
          <p className="text-xs text-gray-400">{docTypeLabels[document.documentType] || document.documentType}</p>
        </div>
        <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-primary-500 flex-shrink-0" />
      </button>
      {onUnlink && (
        <button
          onClick={(e) => { e.stopPropagation(); onUnlink(); }}
          className="p-0.5 rounded hover:bg-red-100 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
          title="Unlink from travel item"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── TravelItemCard (enhanced, expandable, with linked docs) ──

function TravelItemCard({
  item,
  expanded,
  highlighted,
  onToggleExpand,
  findings,
  onToggleFinding,
  docsById,
  participantId,
  allDocuments,
  onEdit,
  onDelete,
  onLinkDocument,
  onUnlinkDocument,
  isMutating,
}: {
  item: TravelItem;
  expanded: boolean;
  highlighted: boolean;
  onToggleExpand: () => void;
  findings: ReviewFinding[];
  onToggleFinding: (findingId: string) => void;
  docsById: Record<string, Document>;
  participantId: string;
  allDocuments: Document[];
  onEdit: (itemId: string, data: Partial<CreateTravelItemData>) => void;
  onDelete: (itemId: string) => void;
  onLinkDocument: (itemId: string, docId: string) => void;
  onUnlinkDocument: (itemId: string, docId: string) => void;
  isMutating: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<CreateTravelItemData>({
    modeOfTransport: item.modeOfTransport,
    fromLocation: item.fromLocation,
    toLocation: item.toLocation,
    departureDate: item.departureDate ? new Date(item.departureDate).toISOString().split('T')[0] : '',
    arrivalDate: item.arrivalDate ? new Date(item.arrivalDate).toISOString().split('T')[0] : undefined,
    amountOriginal: item.amountOriginal,
    currencyOriginal: item.currencyOriginal,
    amountEur: item.amountEur,
    flightNumber: item.flightNumber || undefined,
    bookingReference: item.bookingReference || undefined,
    distanceKm: item.distanceKm || undefined,
    comment: item.comment || undefined,
  });
  const [showLinkDropdown, setShowLinkDropdown] = useState(false);
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const [editingExchangeRate, setEditingExchangeRate] = useState(false);
  const [editingCompanyName, setEditingCompanyName] = useState(false);
  const [companyNameInput, setCompanyNameInput] = useState(item.companyName || '');

  const Icon = transportIcons[item.modeOfTransport];
  const linkedDocIds = getLinkedDocIds(item);
  const linkedDocs = linkedDocIds.map(id => docsById[id]).filter(Boolean);
  const unlinkedDocs = allDocuments.filter(d => !linkedDocIds.includes(d.id));
  const warnings = parseValidationWarnings(item.validationWarnings);

  const uncheckedCriticalCount = findings.filter(f => f.severity === 'critical' && !f.checked).length;
  const uncheckedImportantCount = findings.filter(f => f.severity === 'important' && !f.checked).length;
  const hasUncheckedFindings = uncheckedCriticalCount > 0 || uncheckedImportantCount > 0;

  // Determine left border color based on worst unchecked finding severity
  const borderColor = uncheckedCriticalCount > 0
    ? 'border-l-red-500'
    : uncheckedImportantCount > 0
      ? 'border-l-amber-500'
      : '';

  return (
    <div
      id={`travel-item-${item.id}`}
      className={clsx(
        'rounded-xl border transition-all duration-300',
        borderColor ? `border-l-4 ${borderColor}` : 'border-gray-200',
        highlighted && 'ring-2 ring-indigo-400 ring-offset-2 bg-indigo-50/50',
        !highlighted && 'bg-gray-50',
      )}
    >
      {/* Collapsed header (always visible) */}
      <button
        onClick={onToggleExpand}
        className="w-full p-4 flex items-start gap-4 text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">{item.fromLocation}</span>
            <span className="text-gray-400">&rarr;</span>
            <span className="font-medium text-gray-900">{item.toLocation}</span>
            {/* Status badges inline */}
            {item.manuallyEdited && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700" title={`AI detected ${formatAiOriginalAmount(item.originalAmountFromAi || 0, item.originalCurrencyFromAi, item.currencyOriginal)}`}>
                <Pencil className="w-2.5 h-2.5 inline mr-0.5" />Edited
              </span>
            )}
            {item.priceMissing && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">No price</span>
            )}
            {item.routeMatchesCountry === false && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Route mismatch</span>
            )}
            {item.excludedFromReimbursement && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">Excluded</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
            <span>{formatDate(item.departureDate)}{item.arrivalDate ? ` - ${formatDate(item.arrivalDate)}` : ''}</span>
            {item.flightNumber && <span>Flight: {item.flightNumber}</span>}
            {item.bookingReference && <span>Ref: {item.bookingReference}</span>}
            {item.companyName && <span>{item.companyName}</span>}
            {item.distanceKm && <span>{item.distanceKm} km</span>}
            {item.numberOfPassengers && item.numberOfPassengers > 1 && (
              <span className="text-amber-600">
                <Users className="w-3 h-3 inline mr-0.5" />
                {item.numberOfPassengers} passengers
              </span>
            )}
          </div>
          {/* Inline finding count badges */}
          {hasUncheckedFindings && (
            <div className="flex gap-1.5 mt-1.5">
              {uncheckedCriticalCount > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">
                  <AlertTriangle className="w-3 h-3" /> {uncheckedCriticalCount}
                </span>
              )}
              {uncheckedImportantCount > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700">
                  <AlertCircle className="w-3 h-3" /> {uncheckedImportantCount}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-gray-900">{formatCurrency(item.amountEur)}</p>
          {item.currencyOriginal !== 'EUR' && (
            <p className="text-xs text-gray-500">{item.amountOriginal} {item.currencyOriginal}</p>
          )}
          {item.luggageAmountEur != null && item.luggageAmountEur > 0 && (
            <p className="text-xs text-sky-600">+{formatCurrency(item.luggageAmountEur)} luggage</p>
          )}
        </div>
        <div className="flex-shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-200 pt-4">
          {/* Action buttons */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={clsx(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                isEditing ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              <Pencil className="w-3 h-3" />
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
            <button
              onClick={() => onDelete(item.id)}
              disabled={isMutating}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>

          {isEditing ? (
            <TravelItemForm
              data={editData}
              onChange={setEditData}
              onSubmit={() => {
                onEdit(item.id, editData);
                setIsEditing(false);
              }}
              onCancel={() => setIsEditing(false)}
              loading={isMutating}
              submitLabel="Save Changes"
            />
          ) : (
            <>
              {/* Detail grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <DetailField label="Mode" value={item.modeOfTransport} />
                <DetailField label="Departure" value={formatDate(item.departureDate)} />
                {item.arrivalDate && <DetailField label="Arrival" value={formatDate(item.arrivalDate)} />}
                {item.purchaseDate && (
                  <DetailField
                    label="Purchase Date"
                    value={`${formatDate(item.purchaseDate)}${item.purchaseDateAutoFilled ? ' (auto)' : ''}`}
                  />
                )}
                {item.flightNumber && <DetailField label="Flight #" value={item.flightNumber} />}
                {item.bookingReference && <DetailField label="Booking Ref" value={item.bookingReference} />}
                <DetailField label="Amount (EUR)" value={formatCurrency(item.amountEur)} />
                {item.currencyOriginal !== 'EUR' && (
                  <DetailField label={`Amount (${item.currencyOriginal})`} value={`${item.amountOriginal}`} />
                )}
                {item.manuallyEdited && item.originalAmountFromAi != null && (
                  <DetailField label="AI Original Amount" value={formatAiOriginalAmount(item.originalAmountFromAi, item.originalCurrencyFromAi, item.currencyOriginal)} highlight="orange" />
                )}
                {item.numberOfPassengers && item.numberOfPassengers > 1 && (
                  <>
                    <DetailField label="Passengers" value={`${item.numberOfPassengers}`} />
                    {item.participantPortion != null && (
                      <DetailField label="Claimed Portion" value={`${(item.participantPortion * 100).toFixed(0)}%`} />
                    )}
                  </>
                )}
                {item.distanceKm && <DetailField label="Distance" value={`${item.distanceKm} km`} />}
                {item.isDriverCarpool && <DetailField label="Driver/Carpool" value="Yes" />}
                {item.luggageAmountEur != null && item.luggageAmountEur > 0 && (
                  <DetailField label="Luggage Fee" value={formatCurrency(item.luggageAmountEur)} />
                )}
                {item.amountIncludedInRoundTrip && (
                  <DetailField label="Round-trip" value="Price on outbound leg" />
                )}
                {item.companyName && !editingCompanyName && (
                  <div>
                    <p className="text-gray-400 text-xs">Company</p>
                    <p
                      className="font-medium text-sm text-gray-900 cursor-pointer hover:text-primary-600"
                      onClick={() => { setCompanyNameInput(item.companyName || ''); setEditingCompanyName(true); }}
                      title="Click to edit"
                    >
                      {item.companyName}
                    </p>
                  </div>
                )}
                {!item.companyName && !editingCompanyName && (
                  <div>
                    <p className="text-gray-400 text-xs">Company</p>
                    <p
                      className="font-medium text-sm text-gray-400 cursor-pointer hover:text-primary-600 italic"
                      onClick={() => { setCompanyNameInput(''); setEditingCompanyName(true); }}
                      title="Click to add"
                    >
                      Not set
                    </p>
                  </div>
                )}
                {editingCompanyName && (
                  <div>
                    <p className="text-gray-400 text-xs">Company</p>
                    <input
                      type="text"
                      value={companyNameInput}
                      onChange={(e) => setCompanyNameInput(e.target.value)}
                      onBlur={() => {
                        const val = companyNameInput.trim() || null;
                        if (val !== (item.companyName || null)) {
                          onEdit(item.id, { companyName: val } as Partial<CreateTravelItemData>);
                        }
                        setEditingCompanyName(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingCompanyName(false);
                      }}
                      autoFocus
                      className="font-medium text-sm text-gray-900 bg-white border border-gray-300 rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                )}
              </div>

              {/* Exchange Rate Override (non-EUR items only) */}
              {item.currencyOriginal !== 'EUR' && (
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 text-sm">
                  <span className="text-gray-500 whitespace-nowrap">Exchange rate ({item.currencyOriginal} &rarr; EUR):</span>
                  <span className="font-medium text-gray-900">
                    {(() => {
                      const rate = item.exchangeRateOverride ?? (item.amountOriginal && item.amountOriginal > 0 ? item.amountEur / item.amountOriginal : null);
                      return rate != null ? rate.toFixed(6) : '-';
                    })()}
                  </span>
                  {item.exchangeRateOverride != null && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">manual</span>
                  )}
                  {!editingExchangeRate ? (
                    <button
                      onClick={() => {
                        const currentRate = item.exchangeRateOverride ?? (item.amountOriginal && item.amountOriginal > 0 ? item.amountEur / item.amountOriginal : 0);
                        setExchangeRateInput(currentRate ? currentRate.toFixed(6) : '');
                        setEditingExchangeRate(true);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      Override
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.000001"
                        value={exchangeRateInput}
                        onChange={(e) => setExchangeRateInput(e.target.value)}
                        onBlur={() => {
                          const val = parseFloat(exchangeRateInput);
                          if (!isNaN(val) && val > 0) {
                            onEdit(item.id, { exchangeRateOverride: val } as Partial<CreateTravelItemData>);
                          }
                          setEditingExchangeRate(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setEditingExchangeRate(false);
                        }}
                        autoFocus
                        className="w-28 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  )}
                  {item.exchangeRateOverride != null && (
                    <button
                      onClick={() => onEdit(item.id, { exchangeRateOverride: null } as Partial<CreateTravelItemData>)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                      title="Reset to automatic rate"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  )}
                </div>
              )}

              {/* Comment */}
              {item.comment && (
                <div className="text-sm">
                  <p className="text-gray-500 text-xs mb-1">Participant comment</p>
                  <p className="text-gray-700 italic bg-white rounded-lg px-3 py-2 border border-gray-100">{item.comment}</p>
                </div>
              )}

              {/* Consolidation notes (from AI) */}
              {item.consolidationNotes && (
                <div className="text-sm">
                  <p className="text-gray-500 text-xs mb-1">AI consolidation note</p>
                  <p className="text-gray-500 italic text-xs bg-gray-100 rounded-lg px-3 py-2">{item.consolidationNotes}</p>
                </div>
              )}

              {/* Validation warnings */}
              {warnings.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {warnings.map((w, i) => (
                    <span key={i} className="px-2 py-1 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">
                      {w}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Linked Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500">
                Linked Documents ({linkedDocs.length})
              </p>
              <div className="relative">
                <button
                  onClick={() => setShowLinkDropdown(!showLinkDropdown)}
                  disabled={unlinkedDocs.length === 0}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={unlinkedDocs.length === 0 ? 'All documents are already linked' : 'Link a document'}
                >
                  <Link2 className="w-3 h-3" />
                  Link
                </button>
                {showLinkDropdown && unlinkedDocs.length > 0 && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowLinkDropdown(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-64 max-h-48 overflow-y-auto">
                      {unlinkedDocs.map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => {
                            onLinkDocument(item.id, doc.id);
                            setShowLinkDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-sm"
                        >
                          <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-gray-900 truncate text-xs">{doc.renamedFilename}</p>
                            <p className="text-gray-400 text-xs">{docTypeLabels[doc.documentType] || doc.documentType}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            {linkedDocs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {linkedDocs.map((doc) => (
                  <InlineDocumentCard
                    key={doc.id}
                    document={doc}
                    participantId={participantId}
                    onUnlink={() => onUnlinkDocument(item.id, doc.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg text-xs text-red-600 border border-red-200">
                <AlertTriangle className="w-3 h-3" />
                No documents linked to this travel item
              </div>
            )}
          </div>

          {/* Inline findings for this item */}
          {findings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                AI Findings for this item ({findings.filter(f => !f.checked).length} open)
              </p>
              <div className="space-y-1.5">
                {findings.map((finding) => (
                  <FindingItem
                    key={finding.id}
                    finding={finding}
                    onToggle={() => onToggleFinding(finding.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DetailField helper ─────────────────────────────────────────

function DetailField({ label, value, highlight }: { label: string; value: string; highlight?: 'orange' | 'red' }) {
  return (
    <div>
      <p className="text-gray-400 text-xs">{label}</p>
      <p className={clsx(
        'font-medium text-sm',
        highlight === 'orange' ? 'text-orange-600' : highlight === 'red' ? 'text-red-600' : 'text-gray-900',
      )}>{value}</p>
    </div>
  );
}
