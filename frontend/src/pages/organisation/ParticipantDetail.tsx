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
  Clock,
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
  Repeat,
  BedDouble,
  Utensils,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Mail,
  Paperclip,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { organisationApi, TravelItem, Document, TransportMode, ReviewFinding, CreateTravelItemData, type OrgParticipantDetail as OrgParticipantDetailData, type GreenTravelCalculation, type GreenTravelNotCountedReason, type OtherProjectOverlap } from '../../services/api';
import { clsx } from 'clsx';
import { tripHasNoPrice, tripPriceTypedIn } from '../../utils/tripPrice';
import { isFlightProof } from '../../utils/flightProof';

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
  AIRLINE_DECLARATION: 'Airline Declaration',
  TRAIN_TICKET: 'Train Ticket',
  BUS_TICKET: 'Bus Ticket',
  FUEL_RECEIPT: 'Fuel Receipt',
  GREEN_TRAVEL_DECLARATION: 'Green Travel',
  HOTEL_INVOICE: 'Hotel Invoice',
  MEAL_RECEIPT: 'Meal Receipt',
  LUGGAGE_INVOICE: 'Luggage Invoice',
  BANK_TRANSACTION: 'Bank Transaction',
  INTERRAIL_PASS: 'Interrail Pass',
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

/**
 * The delete confirmation for a file: which trips use it, and a warning when it is the
 * only file of a trip or the only boarding pass of a flight. Deleting is permanent.
 */
function deleteDocumentMessage(doc: Document, travelItems: TravelItem[], documents: Document[]): string {
  const docsById = new Map(documents.map((d) => [d.id, d]));
  const lines = [`Delete "${doc.renamedFilename}"?`];
  const linked = travelItems.filter((t) => getLinkedDocIds(t).includes(doc.id));
  if (linked.length > 0) {
    lines.push('', 'It is linked to:');
    for (const t of linked) {
      const others = getLinkedDocIds(t)
        .filter((id) => id !== doc.id)
        .map((id) => docsById.get(id))
        .filter((d): d is Document => !!d);
      const trip = `${t.fromLocation} → ${t.toLocation}${t.flightNumber ? ` (${t.flightNumber})` : ''}, ${formatDate(t.departureDate)}`;
      const warning =
        others.length === 0
          ? ' ⚠ the only file for this trip'
          : t.modeOfTransport === 'PLANE' && isFlightProof(doc) && !others.some(isFlightProof)
            ? ' ⚠ the only boarding pass for this flight'
            : '';
      lines.push(`• ${trip}${warning}`);
    }
  }
  lines.push('', 'The file is deleted for good and cannot be restored.');
  return lines.join('\n');
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
  const [showBankModal, setShowBankModal] = useState(false);
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
  const [downloadingAuditPdf, setDownloadingAuditPdf] = useState(false);
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
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
      toast.success('AI review refreshed');
    },
    onError: () => toast.error('Failed to refresh AI review'),
  });

  const rebuildTripsMutation = useMutation({
    mutationFn: () => organisationApi.rebuildParticipantTrips(id!),
    onSuccess: (r) => {
      toast.success(`Rebuilt ${r.travelItems} trip(s) from the documents${r.unreadableDocuments.length ? ` — ${r.unreadableDocuments.length} file(s) could not be read` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
    onError: (err: Error) => toast.error(err.message || 'Rebuild failed'),
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

  // Individual limit overrides — the server recalculates the payable amount
  const updateLimitOverrideMutation = useMutation({
    mutationFn: (data: { maxReimbursementOverride?: number | null; greenTravelOverride?: boolean | null }) =>
      organisationApi.updateParticipant(id!, data),
    onSuccess: () => {
      toast.success('Limit updated');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
      if (participant?.project?.id) {
        queryClient.invalidateQueries({ queryKey: ['org-participants', participant.project.id] });
      }
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update limit'),
  });

  const noReimbursementMutation = useMutation({
    mutationFn: (value: boolean) => organisationApi.setNoReimbursement(id!, value),
    onSuccess: (result) => {
      toast.success(result.noReimbursement ? 'Marked as not needing reimbursement' : 'This participant will be paid');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
      if (participant?.project?.id) {
        queryClient.invalidateQueries({ queryKey: ['org-participants', participant.project.id] });
      }
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update'),
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

  const resetParticipantMutation = useMutation({
    mutationFn: () => organisationApi.resetParticipant(id!),
    onSuccess: () => {
      toast.success('Participant reset — magic link re-sent');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to reset participant'),
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

  // Move a trip one place up or down within its day
  const moveTravelItemMutation = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: 'up' | 'down' }) =>
      organisationApi.moveTravelItem(id!, itemId, direction),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org-participant', id] }),
    onError: (error: Error) => toast.error(error.message || 'Could not move the trip'),
  });

  // The organisation decides not to reimburse a trip (or reimburses it again); the trip stays visible
  const excludeTravelItemMutation = useMutation({
    mutationFn: async ({ itemId, exclude }: { itemId: string; exclude: boolean }) => {
      await organisationApi.updateTravelItem(
        id!,
        itemId,
        exclude
          ? { excludedFromReimbursement: true, exclusionReason: 'ORGANISATION' }
          : { excludedFromReimbursement: false, exclusionReason: null }
      );
      await organisationApi.recalculateSummary(id!);
    },
    onSuccess: (_r, { exclude }) => {
      toast.success(exclude ? 'This trip is no longer reimbursed' : 'This trip is reimbursed again');
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
    mutationFn: async ({ file, docType }: { file: File; docType: string }) =>
      organisationApi.uploadDocument(id!, file, docType),
    onSuccess: (doc) => {
      if (doc.duplicate) toast(`"${doc.renamedFilename}" is already in this participant's documents, so it was not added twice`, { icon: 'ℹ️' });
      else toast.success('Document uploaded');
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

  // Documents a finding is about: highlighted while hovering, scrolled to on click
  const [highlightedDocIds, setHighlightedDocIds] = useState<string[]>([]);
  const docHighlightTimer = useRef<number | undefined>(undefined);
  const showFindingDocuments = useCallback((ids: string[], scroll: boolean) => {
    window.clearTimeout(docHighlightTimer.current);
    docHighlightTimer.current = undefined;
    setHighlightedDocIds(ids);
    if (scroll && ids[0]) {
      document.getElementById(`document-${ids[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // After a click the files stay lit for a moment, even when the mouse moves away
      docHighlightTimer.current = window.setTimeout(() => {
        docHighlightTimer.current = undefined;
        setHighlightedDocIds([]);
      }, 4000);
    }
  }, []);
  const hideFindingDocuments = useCallback(() => {
    if (docHighlightTimer.current === undefined) setHighlightedDocIds([]);
  }, []);

  const [draftingMessage, setDraftingMessage] = useState(false);
  const draftReopenMessage = async () => {
    if (reopenMessage.trim() && !window.confirm('Replace your message with a draft written by the AI?')) return;
    setDraftingMessage(true);
    try {
      const { message } = await organisationApi.draftMessage(id!);
      setReopenMessage(message);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not write a draft');
    } finally {
      setDraftingMessage(false);
    }
  };

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

  // The open findings as a numbered list, e.g. to paste into an email
  const copyOpenFindings = async () => {
    const tripLabel = (itemId?: string | null) => {
      const t = itemId ? participant.travelItems.find((i) => i.id === itemId) : null;
      return t ? ` (${t.fromLocation} → ${t.toLocation}, ${formatDate(t.departureDate)})` : '';
    };
    const open = findings.filter((f: ReviewFinding) => !f.checked && f.category !== 'All Clear');
    const text = [
      `Open points for ${participant.firstName} ${participant.lastName}:`,
      ...open.map((f: ReviewFinding, i: number) => `${i + 1}. ${f.category}: ${f.message}${tripLabel(f.travelItemId)}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${open.length} open finding${open.length === 1 ? '' : 's'}`);
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

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
              {participant.status !== 'ADMIN_APPROVED' && participant.status !== 'PAID' && participant.documents.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (window.confirm('Rebuild this participant\'s trips from their documents? Current trips (including edits) are replaced; documents are kept. This can take a few minutes.')) {
                      rebuildTripsMutation.mutate();
                    }
                  }}
                  loading={rebuildTripsMutation.isPending}
                  title="Delete the current trips and let the AI rebuild them from the uploaded documents"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Rebuild trips
                </Button>
              )}
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
                  <p className="text-white/70 text-sm">
                    Max Allowed
                    {participant.maxReimbursementOverride != null && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-semibold uppercase tracking-wide">Individual</span>
                    )}
                  </p>
                  <p className="text-2xl font-bold text-white">{participant.maxReimbursementForCountry ? formatCurrency(participant.maxReimbursementForCountry) : 'Not set'}</p>
                </div>
                <div>
                  <p className="text-white/70 text-sm">To Reimburse</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(summary?.amountToReimburse || 0)}</p>
                  {participant.noReimbursement ? (
                    <p className="text-white/70 text-xs">doesn't need reimbursement</p>
                  ) : (summary?.greenTravelExtraEur || 0) > 0 && (
                    <p className="text-white/70 text-xs">incl. {formatCurrency(summary?.greenTravelExtraEur || 0)} green travel extra</p>
                  )}
                </div>
                <div title="Checks that bank details, trip details, amounts and proof documents are all there. This is not the AI review: see the AI Review panel for its findings.">
                  <p className="text-white/70 text-sm">Details</p>
                  <div className="flex items-center gap-2 mt-1">
                    {summary?.aiCheckOk ? (
                      <CheckCircle className="w-5 h-5 text-emerald-300" />
                    ) : (
                      <HelpCircle className="w-5 h-5 text-amber-300" />
                    )}
                    <span className="text-white font-medium">
                      {summary?.aiCheckOk ? 'All filled in' : 'Something missing'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── The participant doesn't need reimbursement ── */}
          {participant.noReimbursement && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <Info className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-900 flex-1">
                <strong>Doesn't need reimbursement.</strong>{' '}
                {participant.noReimbursementSetBy === 'ORGANISATION'
                  ? 'Switched on by your organisation, so nothing is paid.'
                  : `${participant.firstName} ticked "I don't need reimbursement", so nothing is paid${participant.bankAccountIban ? '' : ' and no bank details were asked'}.`}
              </p>
              {participant.status !== 'ADMIN_APPROVED' && participant.status !== 'PAID' && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={noReimbursementMutation.isPending}
                  onClick={() => {
                    const bank = participant.bankAccountIban ? '' : ' You will also need their bank details (pencil on "Bank & Payment Details").';
                    if (window.confirm(`Pay ${participant.firstName} after all? The amount to pay is calculated from the trips again.${bank}`)) {
                      noReimbursementMutation.mutate(false);
                    }
                  }}
                >
                  Pay anyway
                </Button>
              )}
            </div>
          )}

          {/* ── The same person's trips in another project clash with these ── */}
          {participant.otherProjects && participant.otherProjects.length > 0 && (
            <OtherProjectsWarning firstName={participant.firstName} overlaps={participant.otherProjects} />
          )}

          {/* ── Individual limit (overrides the country default) ── */}
          <IndividualLimitCard
            participant={participant}
            saving={updateLimitOverrideMutation.isPending}
            onSave={(data) => updateLimitOverrideMutation.mutate(data)}
          />

          {/* ── Green travel extra (decided by the organiser) ── */}
          <GreenTravelExtraCard participant={participant} />

          {/* ── Email replies from the participant (via the inbox) ── */}
          {participant.messages && participant.messages.length > 0 && (
            <MessagesCard participant={participant} onGoToTrip={scrollToTravelItem} />
          )}

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
                      {participant.travelItems.map((item, index, all) => {
                        // Trips are listed in travel order; legs of one booking keep their own place
                        const bookingLegs = item.bookingId ? all.filter((t) => t.bookingId === item.bookingId) : [];
                        const bookingLabel =
                          bookingLegs.length > 1
                            ? `${bookingLegs.some((t) => t.amountIncludedInRoundTrip) ? 'Round trip' : 'Multi-leg booking'} · ${item.amountIncludedInRoundTrip ? 'price on the outbound leg' : 'one purchase'}`
                            : null;
                        // The arrows move a trip within its day; the dates order the days
                        const day = (t: typeof item) => String(t.departureDate).slice(0, 10);
                        const prev = all[index - 1];
                        const next = all[index + 1];
                        const canMoveUp = !!prev && day(prev) === day(item);
                        const canMoveDown = !!next && day(next) === day(item);
                        return (
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
                            onToggleExcluded={(itemId, exclude) => excludeTravelItemMutation.mutate({ itemId, exclude })}
                            onLinkDocument={(itemId, docId) => linkDocumentMutation.mutate({ itemId, docId })}
                            onUnlinkDocument={(itemId, docId) => unlinkDocumentMutation.mutate({ itemId, docId })}
                            isMutating={updateTravelItemMutation.isPending || deleteTravelItemMutation.isPending || excludeTravelItemMutation.isPending}
                            bookingLabel={bookingLabel}
                            onMoveUp={canMoveUp ? () => moveTravelItemMutation.mutate({ itemId: item.id, direction: 'up' }) : undefined}
                            onMoveDown={canMoveDown ? () => moveTravelItemMutation.mutate({ itemId: item.id, direction: 'down' }) : undefined}
                            showMoveArrows={canMoveUp || canMoveDown}
                            moving={moveTravelItemMutation.isPending}
                            carRatePerKm={participant.project.carRatePerKm}
                            onShowFindingDocuments={showFindingDocuments}
                            onHideFindingDocuments={hideFindingDocuments}
                          />
                        );
                      })}
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
                          highlighted={highlightedDocIds.includes(doc.id)}
                          onDelete={() => {
                            if (confirm(deleteDocumentMessage(doc, participant.travelItems, participant.documents))) {
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
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Bank & Payment Details</h3>
                    {participant.status !== 'PAID' && (
                      <button
                        onClick={() => setShowBankModal(true)}
                        className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Correct the bank details (the participant gets an email about it)"
                        aria-label="Correct bank details"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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
                  {participant.status !== 'ADMIN_APPROVED' && participant.status !== 'PAID' && (
                    <label className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-600 cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        checked={!!participant.noReimbursement}
                        disabled={noReimbursementMutation.isPending}
                        onChange={(e) => noReimbursementMutation.mutate(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      Doesn't need reimbursement (nothing is paid)
                    </label>
                  )}
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
                          <span
                            className={clsx(
                              'text-xs font-medium px-2 py-0.5 rounded-full',
                              allChecked ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                            )}
                            title={`${checkedCount} of ${findings.length} findings ticked as checked`}
                          >
                            {checkedCount}/{findings.length}
                          </span>
                        )}
                        {findings.some((f: ReviewFinding) => !f.checked && f.category !== 'All Clear') && (
                          <button
                            onClick={copyOpenFindings}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Copy the open findings as text"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={handleRefreshReview}
                          disabled={refreshReviewMutation.isPending}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                          title="Run the AI review again (your ticks are removed)"
                        >
                          <RefreshCw className={clsx('w-3.5 h-3.5', refreshReviewMutation.isPending && 'animate-spin')} />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Trips or files changed after the review looked at them */}
                    {participant.reviewOutdated && participant.aiReviewStatus === 'COMPLETE' && !reviewLoading && !refreshReviewMutation.isPending && (
                      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                        <Clock className="w-4 h-4 flex-shrink-0 text-amber-500" />
                        <p className="flex-1">
                          <strong>Out of date:</strong> {joinWithAnd(participant.reviewOutdated.changes)} after this review ({formatDate(participant.reviewOutdated.reviewedAt)}).{' '}
                          <button type="button" onClick={handleRefreshReview} className="font-semibold underline hover:text-amber-700">
                            Refresh the review
                          </button>
                        </p>
                      </div>
                    )}
                    {reviewLoading || refreshReviewMutation.isPending || participant.aiReviewStatus === 'PENDING' ? (
                      <div className="flex items-center gap-2 text-sm text-indigo-600 py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{refreshReviewMutation.isPending ? 'Regenerating review...' : participant.aiReviewStatus === 'PENDING' ? 'AI review in progress…' : 'Loading review...'}</span>
                      </div>
                    ) : participant.aiReviewStatus === 'FAILED' ? (
                      <div className="flex items-center justify-between gap-2 p-2 bg-red-50 rounded-lg text-sm text-red-700">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>AI review failed — click refresh to retry</span>
                        </div>
                      </div>
                    ) : findings.length > 0 ? (
                      <>
                        <p className="text-xs text-gray-500 mb-3">
                          Tick a finding once you've checked it. Ticking changes nothing in the reimbursement.
                          To change a trip, open it and use <strong>Edit</strong>, <strong>Don't reimburse</strong> or <strong>Delete</strong>.
                        </p>
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
                              onShowDocuments={showFindingDocuments}
                              onHideDocuments={hideFindingDocuments}
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
                    {(participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') && (
                      <Button
                        variant="secondary"
                        className="w-full"
                        loading={downloadingAuditPdf}
                        onClick={async () => {
                          setDownloadingAuditPdf(true);
                          try {
                            await organisationApi.downloadAuditPdf(
                              participant.id,
                              `${participant.firstName} ${participant.lastName}`
                            );
                          } catch (err: unknown) {
                            toast.error(err instanceof Error ? err.message : 'Failed to generate audit PDF');
                          } finally {
                            setDownloadingAuditPdf(false);
                          }
                        }}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Download Audit PDF
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
              {(participant.status === 'DRAFT' || participant.status === 'PARTICIPANT_COMPLETE') && (
                <Card className="border-red-200">
                  <CardHeader>
                    <h3 className="font-semibold text-red-600">Danger Zone</h3>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-gray-700 text-sm font-medium mb-1">Start Over</p>
                      <p className="text-gray-500 text-xs mb-2">
                        Deletes all uploaded files, travel items, and extracted data for this participant, resets their status to Draft, and re-sends their magic link so they can start from scratch.
                      </p>
                      <Button
                        variant="secondary"
                        className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                        onClick={() => {
                          if (confirm(`Are you sure you want to reset ${participant.firstName} ${participant.lastName}? All their uploaded files, travel items, and bank details will be deleted. Their magic link will be re-sent so they can start fresh. This cannot be undone.`)) {
                            resetParticipantMutation.mutate();
                          }
                        }}
                        loading={resetParticipantMutation.isPending}
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Start Over (Reset &amp; Re-send Link)
                      </Button>
                    </div>
                    {participant.status === 'DRAFT' && (
                      <div>
                        <p className="text-gray-700 text-sm font-medium mb-1">Delete Participant</p>
                        <p className="text-gray-500 text-xs mb-2">Permanently removes this participant and all their data from the project.</p>
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
                      </div>
                    )}
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
              <div className="flex items-center justify-between gap-2">
                <label className="label">Message to participant *</label>
                <button
                  type="button"
                  onClick={draftReopenMessage}
                  disabled={draftingMessage}
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 mb-1"
                  title="Drafts a short, friendly message from the open AI review findings. You can edit it before sending."
                >
                  {draftingMessage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {draftingMessage ? 'Writing…' : 'Write with AI'}
                </button>
              </div>
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

        {/* ── Correct bank details ── */}
        {showBankModal && <BankDetailsModal participant={participant} onClose={() => setShowBankModal(false)} />}

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
  const update = (field: string, value: string | number | null | undefined) => {
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
        <div>
          <label className="label">Luggage / extras (€)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={data.luggageAmountEur ?? ''}
            onChange={(e) => update('luggageAmountEur', e.target.value === '' ? null : parseFloat(e.target.value))}
            className="input"
            placeholder="Bought separately, e.g. bags"
          />
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
  onShowDocuments,
  onHideDocuments,
}: {
  finding: ReviewFinding;
  onToggle: () => void;
  onNavigate?: () => void;
  onShowDocuments?: (ids: string[], scroll: boolean) => void;
  onHideDocuments?: () => void;
}) {
  const docIds = finding.documentIds ?? [];
  const hasDocs = docIds.length > 0 && !!onShowDocuments;
  return (
    <div
      onMouseEnter={hasDocs ? () => onShowDocuments!(docIds, false) : undefined}
      onMouseLeave={hasDocs ? onHideDocuments : undefined}
      className={clsx(
      'flex items-start gap-2 p-2 rounded-lg text-sm w-full text-left transition-colors',
      finding.checked
        ? 'bg-gray-50 opacity-60'
        : finding.category === 'All Clear'
          ? 'bg-emerald-50'
          : finding.severity === 'critical'
            ? 'bg-red-50'
            : finding.severity === 'important'
              ? 'bg-amber-50'
              : 'bg-gray-50',
    )}>
      {/* Checkbox: a to-do tick only, it changes nothing in the reimbursement */}
      <button
        onClick={onToggle}
        title={finding.checked ? 'Ticked as checked. Click to untick' : 'Tick when checked (changes nothing in the reimbursement)'}
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
            finding.category === 'All Clear' ? (
              <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
            ) : finding.severity === 'critical' ? (
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
              : finding.category === 'All Clear'
                ? 'bg-emerald-100 text-emerald-700'
                : finding.severity === 'critical'
                  ? 'bg-red-100 text-red-700'
                  : finding.severity === 'important'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-600',
          )}>
            {finding.category}
          </span>
          {hasDocs && !finding.checked && (
            <button
              onClick={(e) => { e.stopPropagation(); onShowDocuments!(docIds, true); }}
              className="flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-amber-700"
              title="Show these files in the documents list"
            >
              <Paperclip className="w-3 h-3" />
              {docIds.length} file{docIds.length === 1 ? '' : 's'}
            </button>
          )}
          {/* Navigate arrow for item-linked findings */}
          {onNavigate && !finding.checked && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(); }}
              className="ml-auto p-0.5 rounded hover:bg-white/60 text-gray-400 hover:text-indigo-600 transition-colors"
              title="Go to this trip"
            >
              <Navigation className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className={clsx(
          'mt-1',
          finding.checked
            ? 'text-gray-400 line-through'
            : finding.category === 'All Clear'
              ? 'text-emerald-700'
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

function DocumentChip({ document, participantId, onDelete, highlighted }: { document: Document; participantId: string; onDelete?: () => void; highlighted?: boolean }) {
  const handleView = async () => {
    try {
      const { url } = await organisationApi.getDocumentUrl(participantId, document.id);
      window.open(url, '_blank');
    } catch {
      toast.error('Failed to get document URL');
    }
  };

  return (
    <div
      id={`document-${document.id}`}
      className={clsx(
        'flex items-center gap-2 p-2.5 rounded-lg transition-colors text-left group',
        highlighted ? 'bg-amber-50 ring-2 ring-amber-400' : 'bg-gray-50 hover:bg-gray-100',
      )}
    >
      <button onClick={handleView} className="flex items-center gap-2 flex-1 min-w-0">
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{document.renamedFilename}</p>
          <p className="text-xs text-gray-500">{docTypeLabels[document.documentType] || document.documentType}</p>
          {document.sharedWith && document.sharedWith.length > 0 && (
            <p className="text-[11px] text-amber-700 truncate" title={document.sharedWith.map((s) => `${s.name}: ${s.filename} (${s.how})`).join('\n')}>
              Also claimed by {document.sharedWith.map((s) => s.name).join(', ')}
            </p>
          )}
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
  onToggleExcluded,
  onLinkDocument,
  onUnlinkDocument,
  isMutating,
  bookingLabel,
  onMoveUp,
  onMoveDown,
  showMoveArrows,
  moving,
  onShowFindingDocuments,
  onHideFindingDocuments,
  carRatePerKm,
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
  onToggleExcluded: (itemId: string, exclude: boolean) => void;
  onLinkDocument: (itemId: string, docId: string) => void;
  onUnlinkDocument: (itemId: string, docId: string) => void;
  isMutating: boolean;
  /** "Round trip · price on the outbound leg" when the trip belongs to a booking with several legs */
  bookingLabel?: string | null;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  showMoveArrows?: boolean;
  moving?: boolean;
  onShowFindingDocuments?: (ids: string[], scroll: boolean) => void;
  onHideFindingDocuments?: () => void;
  /** The project's car rate, to explain car trips priced by the kilometre */
  carRatePerKm?: number;
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
    luggageAmountEur: item.luggageAmountEur ?? null,
  });
  const [showLinkDropdown, setShowLinkDropdown] = useState(false);
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const [editingExchangeRate, setEditingExchangeRate] = useState(false);
  const [editingCompanyName, setEditingCompanyName] = useState(false);
  // Purchase date: decides the exchange rate (without one, the travel date is used)
  const [editingPurchaseDate, setEditingPurchaseDate] = useState(false);
  const [purchaseDateInput, setPurchaseDateInput] = useState('');
  const savePurchaseDate = () => {
    setEditingPurchaseDate(false);
    const before = item.purchaseDate ? String(item.purchaseDate).slice(0, 10) : '';
    if (purchaseDateInput !== before) onEdit(item.id, { purchaseDate: purchaseDateInput || null });
  };
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
      {/* Collapsed header (always visible), with the order arrows beside it */}
      <div className="flex items-stretch">
      <button
        onClick={onToggleExpand}
        className="flex-1 min-w-0 p-4 flex items-start gap-4 text-left"
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
            {(item.manuallyEdited || tripPriceTypedIn(item)) && (
              <span
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700"
                title={item.originalAmountFromAi != null
                  ? `AI detected ${formatAiOriginalAmount(item.originalAmountFromAi, item.originalCurrencyFromAi, item.currencyOriginal)}`
                  : 'The AI found no price in the documents; the amount was typed in by hand'}
              >
                <Pencil className="w-2.5 h-2.5 inline mr-0.5" />Edited
              </span>
            )}
            {tripHasNoPrice(item) && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">No price</span>
            )}
            {bookingLabel && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 flex items-center gap-1" title="Several legs bought together; the price is counted once">
                <Repeat className="w-3 h-3" />
                {bookingLabel}
              </span>
            )}
            {item.routeMatchesCountry === false && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Route mismatch</span>
            )}
            {item.excludedFromReimbursement && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">
                {item.exclusionReason === 'HOSTING_ORG_PAID'
                  ? 'Excluded · hosting org paid'
                  : item.exclusionReason === 'ORGANISATION'
                    ? 'Not reimbursed · your decision'
                    : 'Excluded by participant'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
            <span>{formatDate(item.departureDate)}{item.departureTime ? ` ${item.departureTime}` : ''}{item.arrivalDate ? ` - ${formatDate(item.arrivalDate)}` : ''}</span>
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
          <p
            className={clsx('font-semibold', item.excludedFromReimbursement ? 'text-gray-400 line-through' : 'text-gray-900')}
            title={item.excludedFromReimbursement ? 'Not counted in the reimbursement' : undefined}
          >
            {formatCurrency(item.amountEur)}
          </p>
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
      {showMoveArrows && (
        <div className="flex flex-col justify-center gap-1 pr-2">
          <button
            onClick={onMoveUp}
            disabled={!onMoveUp || moving}
            className="p-1 rounded-md text-gray-400 hover:text-primary-600 hover:bg-white disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-gray-400"
            title="Move up (earlier that day)"
            aria-label="Move trip up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={!onMoveDown || moving}
            className="p-1 rounded-md text-gray-400 hover:text-primary-600 hover:bg-white disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-gray-400"
            title="Move down (later that day)"
            aria-label="Move trip down"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      </div>

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
              onClick={() => onToggleExcluded(item.id, !item.excludedFromReimbursement)}
              disabled={isMutating}
              className={clsx(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
                item.excludedFromReimbursement
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
              title={item.excludedFromReimbursement
                ? 'Count this trip in the reimbursement again'
                : 'Keep this trip in the file but leave its amount out of the reimbursement'}
            >
              {item.excludedFromReimbursement ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {item.excludedFromReimbursement ? 'Reimburse again' : "Don't reimburse"}
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
                <div>
                  <p className="text-gray-400 text-xs">Purchase Date</p>
                  {editingPurchaseDate ? (
                    <input
                      type="date"
                      autoFocus
                      value={purchaseDateInput}
                      onChange={(e) => setPurchaseDateInput(e.target.value)}
                      onBlur={savePurchaseDate}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingPurchaseDate(false);
                      }}
                      className="input py-1 text-sm"
                    />
                  ) : (
                    <p
                      className={clsx('font-medium text-sm cursor-pointer hover:text-primary-600', item.purchaseDate ? 'text-gray-900' : 'text-gray-400 italic')}
                      onClick={() => {
                        setPurchaseDateInput(item.purchaseDate ? String(item.purchaseDate).slice(0, 10) : '');
                        setEditingPurchaseDate(true);
                      }}
                      title={item.currencyOriginal !== 'EUR'
                        ? 'Click to edit. The exchange rate follows this date; without it, the travel date is used.'
                        : 'Click to edit'}
                    >
                      {item.purchaseDate
                        ? `${formatDate(item.purchaseDate)}${item.purchaseDateAutoFilled ? ' (travel date)' : ''}`
                        : 'Not set'}
                    </p>
                  )}
                </div>
                {item.flightNumber && <DetailField label="Flight #" value={item.flightNumber} />}
                {item.bookingReference && <DetailField label="Booking Ref" value={item.bookingReference} />}
                <DetailField label="Amount (EUR)" value={formatCurrency(item.amountEur)} />
                {item.currencyOriginal !== 'EUR' && (
                  <DetailField label={`Amount (${item.currencyOriginal})`} value={`${item.amountOriginal}`} />
                )}
                {item.manuallyEdited && item.originalAmountFromAi != null && (
                  <DetailField label="AI Original Amount" value={formatAiOriginalAmount(item.originalAmountFromAi, item.originalCurrencyFromAi, item.currencyOriginal)} highlight="orange" />
                )}
                {tripPriceTypedIn(item) && item.originalAmountFromAi == null && (
                  <DetailField label="AI Original Amount" value="None found · typed in by hand" highlight="orange" />
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
                {item.modeOfTransport === 'CAR' && (() => {
                  // How a car trip's amount came about: kilometres × the car rate (trips added by the
                  // participant), fuel receipts (trips built by the AI), or typed in
                  const fuel = linkedDocs.filter((d) => d.documentType === 'FUEL_RECEIPT').length;
                  const byKm = !!item.distanceKm && !!carRatePerKm
                    && Math.abs(item.distanceKm * carRatePerKm - item.amountEur) < 0.01;
                  const how = byKm
                    ? `${item.distanceKm!.toLocaleString('de-DE')} km × ${formatCurrency(carRatePerKm!)}/km${fuel > 0 ? ' (fuel receipts are proof only)' : ''}`
                    : item.isDriverCarpool === false && item.amountEur === 0
                      ? 'Passenger in a shared car (not paid)'
                      : fuel > 0 && !item.manuallyEdited && !tripPriceTypedIn(item)
                        ? `${fuel} fuel receipt${fuel === 1 ? '' : 's'}`
                        : 'Typed in';
                  return <DetailField label="Amount from" value={how} />;
                })()}
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
                          onEdit(item.id, { companyName: val });
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
                            onEdit(item.id, { exchangeRateOverride: val });
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
                      onClick={() => onEdit(item.id, { exchangeRateOverride: null })}
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
                    onShowDocuments={onShowFindingDocuments}
                    onHideDocuments={onHideFindingDocuments}
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

/**
 * Lets the organisation give one participant their own maximum and/or
 * green-travel status. Blank / "country default" clears the override.
 */
function IndividualLimitCard({
  participant,
  saving,
  onSave,
}: {
  participant: OrgParticipantDetailData;
  saving: boolean;
  onSave: (data: { maxReimbursementOverride?: number | null; greenTravelOverride?: boolean | null }) => void;
}) {
  const serverMax = participant.maxReimbursementOverride != null ? String(participant.maxReimbursementOverride) : '';
  const [maxValue, setMaxValue] = useState(serverMax);
  useEffect(() => setMaxValue(serverMax), [serverMax]);

  const countryMax = participant.countryMaxReimbursement || 0;
  const countryGreen = participant.countryGreenTravel || false;
  const greenValue =
    participant.greenTravelOverride == null ? 'default' : participant.greenTravelOverride ? 'yes' : 'no';

  const commitMax = () => {
    const trimmed = maxValue.trim();
    if (trimmed === '') {
      if (participant.maxReimbursementOverride != null) onSave({ maxReimbursementOverride: null });
      return;
    }
    const amount = parseFloat(trimmed);
    if (isNaN(amount) || amount < 0) {
      setMaxValue(serverMax);
      return;
    }
    if (amount !== participant.maxReimbursementOverride) onSave({ maxReimbursementOverride: amount });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Individual limit</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Overrides the {participant.country} country limit for this participant only. Leave blank to use the country default.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Maximum (EUR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={maxValue}
                placeholder={countryMax > 0 ? `Country: ${countryMax}` : 'Country: not set'}
                onChange={(e) => setMaxValue(e.target.value)}
                onBlur={commitMax}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                disabled={saving}
                className="w-36 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Green travel</label>
              <select
                value={greenValue}
                onChange={(e) => {
                  const v = e.target.value;
                  onSave({ greenTravelOverride: v === 'default' ? null : v === 'yes' });
                }}
                disabled={saving}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              >
                <option value="default">Country default ({countryGreen ? 'yes' : 'no'})</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The organiser decides the green travel extra (food + accommodation) for this
 * participant. Highlighted with a suggestion for green travellers; allowed at
 * every stage except PAID; saving emails the participant.
 */
type SuggestionReceipt = NonNullable<OrgParticipantDetailData['greenTravelSuggestion']>['receipts'][number];

function sumByCurrency(list: SuggestionReceipt[]): string {
  const sums = new Map<string, number>();
  let unclear = 0;
  for (const r of list) {
    if (r.amount == null) { unclear++; continue; }
    const cur = r.currency || 'EUR';
    sums.set(cur, (sums.get(cur) || 0) + r.amount);
  }
  const parts = [...sums.entries()].map(([cur, v]) => (cur === 'EUR' ? formatCurrency(v) : `${v.toFixed(2)} ${cur}`));
  if (unclear > 0) parts.push(`${unclear} unclear`);
  return parts.length > 0 ? parts.join(' + ') : '—';
}

/** Total in EUR when every receipt with an amount could be converted (other currencies included) */
function eurTotal(list: SuggestionReceipt[]): number | null {
  const withAmount = list.filter((r) => r.amount != null);
  if (withAmount.length === 0 || withAmount.some((r) => r.amountEur == null)) return null;
  if (withAmount.every((r) => (r.currency || 'EUR') === 'EUR')) return null; // already shown in EUR
  return withAmount.reduce((sum, r) => sum + (r.amountEur ?? 0), 0);
}

/** One receipt tile: image thumbnail (signed URL fetched lazily) or a PDF icon; click opens the file, the pencil corrects it */
function ReceiptThumb({ participantId, receipt, onEdit }: { participantId: string; receipt: SuggestionReceipt; onEdit?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = !!receipt.mimeType && receipt.mimeType.startsWith('image/');
  const isHotel = receipt.documentType === 'HOTEL_INVOICE';
  useEffect(() => {
    let cancelled = false;
    if (isImage) {
      organisationApi.getDocumentUrl(participantId, receipt.id)
        .then((r) => { if (!cancelled) setUrl(r.url); })
        .catch(() => { /* fall back to the icon */ });
    }
    return () => { cancelled = true; };
  }, [participantId, receipt.id, isImage]);

  const openFile = async () => {
    try {
      const r = await organisationApi.getDocumentUrl(participantId, receipt.id);
      window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open the receipt');
    }
  };

  const amount = receipt.amount != null
    ? (receipt.currency && receipt.currency !== 'EUR' ? `${receipt.amount.toFixed(2)} ${receipt.currency}` : formatCurrency(receipt.amount))
    : 'amount unclear';

  return (
    <div className="w-24 flex-shrink-0 relative group">
      <button type="button" onClick={openFile} title={`${receipt.renamedFilename} — open`} className="text-left w-full">
        <div className={`w-24 h-24 rounded-xl overflow-hidden border bg-white flex items-center justify-center ${isHotel ? 'border-sky-200' : 'border-amber-200'} group-hover:ring-2 group-hover:ring-emerald-400`}>
          {url ? (
            <img src={url} alt={receipt.renamedFilename} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className={`flex flex-col items-center gap-1 ${isHotel ? 'text-sky-500' : 'text-amber-500'}`}>
              {isHotel ? <BedDouble className="w-6 h-6" /> : <Utensils className="w-6 h-6" />}
              <span className="text-[10px] uppercase tracking-wide">{isImage ? 'photo' : 'PDF'}</span>
            </div>
          )}
        </div>
        <p className="text-[11px] mt-1 font-medium text-gray-800 truncate">{amount}</p>
        <p className="text-[10px] text-gray-500 truncate">
          {isHotel ? 'Hotel' : 'Meal'}
          {receipt.amountEur != null && receipt.currency && receipt.currency !== 'EUR' && ` · ${formatCurrency(receipt.amountEur)}`}
          {receipt.corrected && ' · corrected'}
        </p>
        {receipt.duplicateOf && (
          <p className="text-[10px] text-orange-600 truncate" title={`Same receipt as ${receipt.duplicateOf}`}>Uploaded twice</p>
        )}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-gray-500 hover:text-primary-600 shadow-sm"
          title="Correct the amount, currency or date"
          aria-label="Correct this receipt"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/** Receipts grouped by the date on them, with meal and hotel totals, for deciding the green travel extra */
function ReceiptGallery({ participantId, receipts, onEdit }: { participantId: string; receipts: SuggestionReceipt[]; onEdit?: (r: SuggestionReceipt) => void }) {
  if (receipts.length === 0) {
    return <p className="mt-1">Receipts uploaded: none yet — the participant can still add them.</p>;
  }
  // A receipt uploaded twice is shown twice but added up once
  const counted = receipts.filter((r) => !r.duplicateOf);
  const meals = counted.filter((r) => r.documentType === 'MEAL_RECEIPT');
  const hotels = counted.filter((r) => r.documentType === 'HOTEL_INVOICE');
  const twice = receipts.length - counted.length;
  // Grouped by the date on the receipt; the upload date says nothing about when the money was spent
  const dayKey = (r: SuggestionReceipt) => (r.documentDate ? new Date(r.documentDate).toISOString().slice(0, 10) : 'unknown');
  const groups = new Map<string, SuggestionReceipt[]>();
  for (const r of receipts) {
    const k = dayKey(r);
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === 'unknown' ? 1 : b === 'unknown' ? -1 : a.localeCompare(b)));
  const mealsEur = eurTotal(meals);
  const hotelsEur = eurTotal(hotels);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          <Utensils className="inline w-3.5 h-3.5 mr-1 text-amber-500" />{meals.length} meal receipt{meals.length === 1 ? '' : 's'} · <strong>{sumByCurrency(meals)}</strong>
          {mealsEur != null && <> ≈ <strong>{formatCurrency(mealsEur)}</strong></>}
        </span>
        <span>
          <BedDouble className="inline w-3.5 h-3.5 mr-1 text-sky-500" />{hotels.length} hotel invoice{hotels.length === 1 ? '' : 's'} · <strong>{sumByCurrency(hotels)}</strong>
          {hotelsEur != null && <> ≈ <strong>{formatCurrency(hotelsEur)}</strong></>}
        </span>
        {twice > 0 && <span className="text-gray-500">{twice} uploaded twice (not added up)</span>}
      </div>
      <div className="mt-2 space-y-2">
        {ordered.map(([day, list]) => (
          <div key={day}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80 mb-1">
              {day === 'unknown' ? 'Date unclear' : formatDate(day)} · {list.length}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {list.map((r) => <ReceiptThumb key={r.id} participantId={participantId} receipt={r} onEdit={onEdit ? () => onEdit(r) : undefined} />)}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-emerald-800/70 mt-1">
        Amounts are read by the AI from the receipts; click a tile to open the file, or the pencil to correct what was read.
      </p>
    </div>
  );
}

const RECEIPT_CURRENCIES = ['EUR', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'SEK', 'DKK', 'NOK', 'ISK', 'CHF', 'GBP', 'TRY', 'RSD', 'MKD', 'ALL', 'BAM', 'GEL', 'AMD', 'AZN', 'UAH', 'MDL'];

/** Correct what the AI read from one receipt */
function ReceiptEditModal({ participantId, receipt, onClose }: { participantId: string; receipt: SuggestionReceipt; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<'MEAL_RECEIPT' | 'HOTEL_INVOICE'>(receipt.documentType === 'HOTEL_INVOICE' ? 'HOTEL_INVOICE' : 'MEAL_RECEIPT');
  const [amount, setAmount] = useState(receipt.amount != null ? String(receipt.amount) : '');
  const [currency, setCurrency] = useState((receipt.currency || 'EUR').toUpperCase());
  const [date, setDate] = useState(receipt.documentDate ? new Date(receipt.documentDate).toISOString().slice(0, 10) : '');
  const currencies = RECEIPT_CURRENCIES.includes(currency) ? RECEIPT_CURRENCIES : [currency, ...RECEIPT_CURRENCIES];

  const mutation = useMutation({
    mutationFn: () =>
      organisationApi.correctReceipt(participantId, receipt.id, {
        amount: amount.trim() === '' ? null : parseFloat(amount.replace(',', '.')),
        currency,
        documentDate: date || null,
        documentType: type,
      }),
    onSuccess: () => {
      toast.success('Receipt corrected');
      queryClient.invalidateQueries({ queryKey: ['org-participant', participantId] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save the correction'),
  });
  const parsed = amount.trim() === '' ? null : parseFloat(amount.replace(',', '.'));
  const invalid = parsed != null && (isNaN(parsed) || parsed < 0);

  const openFile = async () => {
    try {
      const r = await organisationApi.getDocumentUrl(participantId, receipt.id);
      window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open the receipt');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Correct receipt">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          <button type="button" onClick={openFile} className="text-primary-600 hover:underline">{receipt.renamedFilename}</button>
          {' '}— fix what the AI read. Your correction is kept, also when the receipts are read again.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as 'MEAL_RECEIPT' | 'HOTEL_INVOICE')} className="input">
              <option value="MEAL_RECEIPT">Meal / food</option>
              <option value="HOTEL_INVOICE">Hotel / accommodation</option>
            </select>
          </div>
          <div>
            <label className="label">Date on the receipt</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Amount</label>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={invalid}>Save correction</Button>
        </div>
      </div>
    </Modal>
  );
}

/** 'YYYY-MM-DD' → 'DD-MM-YYYY' without time-zone shifts */
/** "a, b and c" */
function joinWithAnd(parts: string[]): string {
  const text = parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Trips grouped by day, e.g. "07-09-2026: Suwałki → Białystok, Białystok → Warszawa" */
function tripsPerDay(trips: { date: string; trip: string }[]): string {
  const byDay = new Map<string, string[]>();
  for (const t of trips) byDay.set(t.date, [...(byDay.get(t.date) || []), t.trip]);
  return [...byDay.entries()].map(([day, list]) => `${formatIsoDay(day)}: ${list.join(', ')}`).join(' · ');
}

/** The same person claims trips in another project of the organisation that clash with these */
function OtherProjectsWarning({ firstName, overlaps }: { firstName: string; overlaps: OtherProjectOverlap[] }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 space-y-3">
      {overlaps.map((o) => (
        <div key={o.participantId} className="flex items-start gap-3 text-sm text-rose-900">
          <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p>
              <strong>{firstName} also claims trips in "{o.projectName}"</strong> ({formatIsoDay(o.projectStart)} → {formatIsoDay(o.projectEnd)}
              {o.matchedBy === 'name' ? ', same name' : ''}). These trips can't all have happened, so ask which tickets were really used before paying.
            </p>
            <ul className="mt-1.5 space-y-1 text-xs text-rose-800">
              {o.sameDays.map((d) => (
                <li key={d.date}>
                  <strong>{formatIsoDay(d.date)}, trips in both:</strong> here {d.here.join(', ')} · there {d.there.join(', ')}
                </li>
              ))}
              {o.hereDuringOther.length > 0 && (
                <li><strong>Here, while that project was running:</strong> {tripsPerDay(o.hereDuringOther)}</li>
              )}
              {o.thereDuringThis.length > 0 && (
                <li><strong>There, while this project was running:</strong> {tripsPerDay(o.thereDuringThis)}</li>
              )}
            </ul>
          </div>
          <Link to={`/org/participants/${o.participantId}`} className="text-xs font-medium text-rose-700 hover:underline whitespace-nowrap">
            Open the other file →
          </Link>
        </div>
      ))}
    </div>
  );
}

function formatIsoDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}-${m}-${y}`;
}

const NOT_COUNTED_LABELS: Record<GreenTravelNotCountedReason, string> = {
  NO_AMOUNT: 'no amount could be read',
  NO_RATE: 'no exchange rate found',
  NO_DATE: 'no date could be read',
  DURING_PROJECT: 'during the project',
  NOT_AN_EXTRA_DAY: 'not on an extra night',
  DUPLICATE: 'uploaded twice',
};

/** Food counts on every travel day; accommodation on the extra nights */
function notCountedLabel(n: GreenTravelCalculation['notCounted'][number]): string {
  if (n.kind === 'FOOD' && n.reason === 'DURING_PROJECT') return 'a project day without travel';
  if (n.kind === 'FOOD' && n.reason === 'NOT_AN_EXTRA_DAY') return 'not on a travel day';
  return NOT_COUNTED_LABELS[n.reason];
}

/**
 * What the project's green travel rule suggests, step by step. The organiser can pay a day or the
 * hotels in full, or count a left-out receipt anyway, before filling in the amounts.
 */
function GreenTravelCalculationBox({
  calc,
  onFillIn,
  current,
  disabled,
}: {
  calc: GreenTravelCalculation;
  onFillIn: (foodEur: number, accommodationEur: number) => void;
  current: { food: number; accommodation: number };
  disabled: boolean;
}) {
  const [payFullDays, setPayFullDays] = useState<Set<string>>(new Set());
  const [payFullHotels, setPayFullHotels] = useState(false);
  const [countAnyway, setCountAnyway] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  };

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const noLimits = calc.foodPerDayEur === 0 && calc.accommodationPerNightEur === 0;
  const listDays = (days: string[]) => (days.length > 0 ? days.map(formatIsoDay).join(', ') : 'none');
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // The suggestion after the organiser's own choices
  const extraFood = calc.notCounted.filter((n) => n.kind === 'FOOD' && countAnyway.has(n.id)).reduce((s, n) => s + (n.amountEur ?? 0), 0);
  const extraHotels = calc.notCounted.filter((n) => n.kind === 'ACCOMMODATION' && countAnyway.has(n.id)).reduce((s, n) => s + (n.amountEur ?? 0), 0);
  const food = calc.mode === 'FIXED'
    ? calc.foodEur
    : round2(calc.foodDays.reduce((s, d) => s + (payFullDays.has(d.date) ? d.spentEur : d.countedEur), 0) + extraFood);
  const accommodation = calc.mode === 'FIXED'
    ? calc.accommodationEur
    : round2((payFullHotels ? calc.accommodationSpentEur : Math.min(calc.accommodationSpentEur, calc.accommodationCapEur)) + extraHotels);
  const filledIn = current.food === food && current.accommodation === accommodation;

  return (
    <div className="mt-3 p-3 rounded-xl bg-white border border-emerald-200 text-sm text-gray-700">
      <p className="font-medium text-gray-900">
        {calc.mode === 'RECEIPTS'
          ? `Project rule: receipts, up to ${formatCurrency(calc.foodPerDayEur)} food per day and ${formatCurrency(calc.accommodationPerNightEur)} accommodation per night`
          : `Project rule: ${formatCurrency(calc.foodPerDayEur)} food per extra day and ${formatCurrency(calc.accommodationPerNightEur)} accommodation per extra night`}
      </p>
      <p className="text-xs text-gray-500 mt-1">
        Extra travel days: {listDays(calc.extraDays)}
        {calc.mode === 'RECEIPTS' && (calc.projectTravelDays?.length ?? 0) > 0 && (
          <> · Project days with travel (food only): {listDays(calc.projectTravelDays!)}</>
        )}
        {' '}· Extra nights: {listDays(calc.extraNights)}
      </p>

      {calc.mode === 'FIXED' ? (
        <div className="mt-2 space-y-1">
          <p className="flex justify-between gap-3">
            <span>Food: {plural(calc.extraDays.length, 'day', 'days')} × {formatCurrency(calc.foodPerDayEur)}</span>
            <strong>{formatCurrency(calc.foodEur)}</strong>
          </p>
          <p className="flex justify-between gap-3">
            <span>Accommodation: {plural(calc.extraNights.length, 'night', 'nights')} × {formatCurrency(calc.accommodationPerNightEur)}</span>
            <strong>{formatCurrency(calc.accommodationEur)}</strong>
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700/80">Food</p>
          {calc.foodDays.length === 0 && <p className="text-gray-500">No meal receipts on the travel days.</p>}
          {calc.foodDays.map((d) => {
            const overLimit = d.countedEur < d.spentEur;
            const full = payFullDays.has(d.date);
            return (
              <div key={d.date} className="flex justify-between gap-3">
                <span>
                  {formatIsoDay(d.date)}: spent {formatCurrency(d.spentEur)}
                  {overLimit && !full && <span className="text-gray-500"> (limit {formatCurrency(calc.foodPerDayEur)})</span>}
                  {overLimit && (
                    <label className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={full} onChange={() => setPayFullDays((s) => toggle(s, d.date))} className="rounded border-gray-300 w-3 h-3" />
                      pay in full
                    </label>
                  )}
                </span>
                <span>{formatCurrency(full ? d.spentEur : d.countedEur)}</span>
              </div>
            );
          })}
          <p className="flex justify-between gap-3 border-t border-gray-100 pt-1">
            <span>Food total</span>
            <strong>{formatCurrency(food)}</strong>
          </p>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700/80 pt-1">Accommodation</p>
          <div className="flex justify-between gap-3">
            <span>
              Hotel receipts {formatCurrency(calc.accommodationSpentEur)}, limit {plural(calc.extraNights.length, 'night', 'nights')} ×{' '}
              {formatCurrency(calc.accommodationPerNightEur)} = {formatCurrency(calc.accommodationCapEur)}
              {calc.accommodationSpentEur > calc.accommodationCapEur && (
                <label className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={payFullHotels} onChange={() => setPayFullHotels((v) => !v)} className="rounded border-gray-300 w-3 h-3" />
                  pay in full
                </label>
              )}
            </span>
            <strong>{formatCurrency(accommodation)}</strong>
          </div>
          {calc.correctedDates.length > 0 && (
            <p className="text-xs text-gray-500 pt-1">
              Date corrected to the trip year: {calc.correctedDates.map((c) => `${c.filename} (${formatIsoDay(c.from)} → ${formatIsoDay(c.to)})`).join(', ')}
            </p>
          )}
          {calc.notCounted.length > 0 && (
            <div className="pt-1">
              <p className="text-xs text-gray-500">Not counted ({calc.notCounted.length}). Tick one to count it anyway (in full):</p>
              <ul className="text-xs text-gray-600 space-y-0.5 mt-0.5">
                {calc.notCounted.map((n) => (
                  <li key={n.id} className="flex items-center gap-1.5">
                    {n.amountEur != null ? (
                      <input
                        type="checkbox"
                        checked={countAnyway.has(n.id)}
                        onChange={() => setCountAnyway((s) => toggle(s, n.id))}
                        className="rounded border-gray-300 w-3 h-3"
                        aria-label={`Count ${n.filename} anyway`}
                      />
                    ) : (
                      <span className="w-3" />
                    )}
                    <span>
                      {n.filename}
                      {n.date ? ` (${formatIsoDay(n.date)})` : ''}
                      {n.amountEur != null ? ` · ${formatCurrency(n.amountEur)}` : ''}: {notCountedLabel(n)}
                      {n.duplicateOf ? ` (same receipt as ${n.duplicateOf})` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {noLimits && (
        <p className="mt-2 text-xs text-amber-700">
          No limits are set yet. Add them in the project settings under Feature Settings → Green travel extra.
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">Suggested: {formatCurrency(food + accommodation)}</p>
        <Button size="sm" variant="secondary" onClick={() => onFillIn(food, accommodation)} disabled={disabled || filledIn}>
          {filledIn ? 'Filled in below' : 'Fill in these amounts'}
        </Button>
      </div>
    </div>
  );
}

/** A short explanation of how green travel works in the app */
function GreenTravelGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
        <Info className="w-3.5 h-3.5" />
        How green travel works
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <ul className="mt-2 p-3 rounded-xl bg-emerald-50/60 text-xs text-gray-700 space-y-1.5 list-disc pl-6">
          <li><strong>Who is a green traveller:</strong> participants whose country row is marked green (or named like "Poland GREEN"), or set to "Yes" under Individual limit → Green travel.</li>
          <li><strong>Max Allowed</strong> is the amount of their country row; their travel costs are paid up to that maximum.</li>
          <li><strong>Green travel extra</strong> is paid on top of the maximum: food and accommodation for the longer journey. That's the extra travel days and nights outside the project dates. With receipts, food bought on the first or last project day also counts when they travel that day. What you save here is paid in full.</li>
          <li><strong>How it's worked out</strong> is set per project (Settings → Green travel extra): you decide per participant, receipts up to a limit per day/night, or a fixed amount per day/night. With a rule, this card shows the calculation; you can pay a day in full or count a left-out receipt before filling in.</li>
          <li><strong>Receipts:</strong> participants add them on their own page until they are paid. If the AI read an amount, currency or date wrongly, click the pencil on the receipt.</li>
          <li><strong>Saving</strong> updates "To Reimburse" straight away. Untick "Email the participant" to save without sending an email.</li>
        </ul>
      )}
    </div>
  );
}

function GreenTravelExtraCard({ participant }: { participant: OrgParticipantDetailData }) {
  const queryClient = useQueryClient();
  const s = participant.greenTravelSuggestion;
  const isGreen = !!participant.greenTravel;
  const calc = isGreen ? s?.calculation ?? null : null;
  const asText = (n: number | null | undefined) => (n != null ? String(n) : '');
  // Nothing saved yet: start from what the project's rule suggests (still to be saved by the organiser)
  const neverSaved =
    participant.greenTravelFoodEur == null && participant.greenTravelAccommodationEur == null && !participant.greenTravelExtraUpdatedAt;
  const initialFood = neverSaved && calc ? asText(calc.foodEur) : asText(participant.greenTravelFoodEur);
  const initialAccommodation = neverSaved && calc ? asText(calc.accommodationEur) : asText(participant.greenTravelAccommodationEur);

  const [food, setFood] = useState(initialFood);
  const [accommodation, setAccommodation] = useState(initialAccommodation);
  const [note, setNote] = useState(participant.greenTravelExtraNote || '');
  const [notify, setNotify] = useState(true);
  const [editingReceipt, setEditingReceipt] = useState<SuggestionReceipt | null>(null);
  useEffect(() => {
    setFood(initialFood);
    setAccommodation(initialAccommodation);
    setNote(participant.greenTravelExtraNote || '');
  }, [initialFood, initialAccommodation, participant.greenTravelExtraNote]);

  const mutation = useMutation({
    mutationFn: () =>
      organisationApi.setGreenTravelExtra(participant.id, {
        foodEur: food.trim() === '' ? null : parseFloat(food),
        accommodationEur: accommodation.trim() === '' ? null : parseFloat(accommodation),
        note: note.trim() || null,
        notify,
      }),
    onSuccess: (r) => {
      toast.success(r.emailed ? `Green travel extra saved — ${participant.firstName} has been emailed` : 'Green travel extra saved (no email sent)');
      queryClient.invalidateQueries({ queryKey: ['org-participant', participant.id] });
      if (participant.project?.id) queryClient.invalidateQueries({ queryKey: ['org-participants', participant.project.id] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save'),
  });

  const rereadMutation = useMutation({
    mutationFn: () => organisationApi.rereadReceipts(participant.id),
    onSuccess: (r) => {
      toast.success(`${r.read} receipt${r.read === 1 ? '' : 's'} read again${r.skippedCorrected ? ` (${r.skippedCorrected} corrected by you kept as they are)` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['org-participant', participant.id] });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not read the receipts again'),
  });

  const isPaid = participant.status === 'PAID';
  const current = (participant.greenTravelFoodEur ?? 0) + (participant.greenTravelAccommodationEur ?? 0);
  const parsedFood = food.trim() === '' ? 0 : parseFloat(food);
  const parsedAcc = accommodation.trim() === '' ? 0 : parseFloat(accommodation);
  const invalid = isNaN(parsedFood) || isNaN(parsedAcc) || parsedFood < 0 || parsedAcc < 0;
  const dirty =
    parsedFood !== (participant.greenTravelFoodEur ?? 0) ||
    parsedAcc !== (participant.greenTravelAccommodationEur ?? 0) ||
    (note.trim() || '') !== (participant.greenTravelExtraNote || '');

  const handleSave = () => {
    if (invalid) { toast.error('Amounts must be numbers of 0 or more'); return; }
    const email = notify ? ' and the participant will receive an email' : ' (no email will be sent)';
    if (window.confirm(`Save a green travel extra of ${formatCurrency(parsedFood + parsedAcc)}? This amount is paid on top of the travel maximum${email}.`)) {
      mutation.mutate();
    }
  };

  return (
    <Card className={isGreen ? 'border-emerald-200' : undefined}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold text-gray-900">
              Green travel extra
              {isGreen && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Green traveller</span>}
              {participant.greenTravelDeclaration?.signedAt && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Declaration signed {formatDate(participant.greenTravelDeclaration.signedAt)}</span>
              )}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              Food and accommodation you pay on top of the travel maximum. The amounts you save are paid in full, so
              enter what the participant should receive (not a budget).
            </p>
            <GreenTravelGuide />
          </div>
          {current > 0 && participant.greenTravelExtraUpdatedAt && (
            <p className="text-xs text-gray-400">Set {formatDate(participant.greenTravelExtraUpdatedAt)} · {formatCurrency(current)}</p>
          )}
        </div>

        {isGreen && s && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 text-sm text-emerald-900">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p>
                Travelled <strong>{s.totalTravelDays} day{s.totalTravelDays === 1 ? '' : 's'}</strong> in total
                {s.firstTravelDate && s.lastTravelDate && ` (${formatDate(s.firstTravelDate)} → ${formatDate(s.lastTravelDate)})`},
                {' '}<strong>{s.extraTravelDays}</strong> beyond the project dates.
              </p>
              {s.receipts.length > 0 && !isPaid && (
                <button
                  type="button"
                  onClick={() => rereadMutation.mutate()}
                  disabled={rereadMutation.isPending}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-900 flex items-center gap-1 disabled:opacity-50"
                  title="Let the AI read the receipts again, knowing the trip's dates and countries. Receipts you corrected stay as they are."
                >
                  {rereadMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {rereadMutation.isPending ? 'Reading…' : 'Read receipts again'}
                </button>
              )}
            </div>
            <ReceiptGallery participantId={participant.id} receipts={s.receipts} onEdit={isPaid ? undefined : setEditingReceipt} />
            {calc ? (
              <GreenTravelCalculationBox
                calc={calc}
                current={{ food: invalid ? -1 : parsedFood, accommodation: invalid ? -1 : parsedAcc }}
                disabled={isPaid || mutation.isPending}
                onFillIn={(f, a) => {
                  setFood(String(f));
                  setAccommodation(String(a));
                }}
              />
            ) : (
              <p className="mt-2 text-emerald-700">Fill in the amounts for green travel you wish to add to their reimbursement.</p>
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Food to pay (€)" type="number" min="0" step="0.01" value={food} onChange={(e) => setFood(e.target.value)} disabled={isPaid || mutation.isPending} placeholder="0" />
          <Input label="Accommodation to pay (€)" type="number" min="0" step="0.01" value={accommodation} onChange={(e) => setAccommodation(e.target.value)} disabled={isPaid || mutation.isPending} placeholder="0" />
          <Input label="Note to participant (optional)" value={note} onChange={(e) => setNote(e.target.value)} disabled={isPaid || mutation.isPending} placeholder="e.g. 2 nights, as agreed" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-400">
            {isPaid
              ? 'This participant has been paid — the extra can no longer be changed.'
              : `Total extra: ${formatCurrency(invalid ? 0 : parsedFood + parsedAcc)}${dirty ? ' · not saved yet' : ''}`}
          </p>
          <div className="flex items-center gap-3">
            {!isPaid && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="rounded border-gray-300 w-3.5 h-3.5" />
                Email the participant
              </label>
            )}
            <Button size="sm" onClick={handleSave} loading={mutation.isPending} disabled={isPaid || !dirty || invalid}>
              Save
            </Button>
          </div>
        </div>
      </CardContent>
      {editingReceipt && (
        <ReceiptEditModal participantId={participant.id} receipt={editingReceipt} onClose={() => setEditingReceipt(null)} />
      )}
    </Card>
  );
}

/** Emails the participant sent in reply to ours, with the AI summary, suggested steps and their files */
function MessagesCard({ participant, onGoToTrip }: { participant: OrgParticipantDetailData; onGoToTrip: (travelItemId: string) => void }) {
  const queryClient = useQueryClient();
  const messages = participant.messages ?? [];
  const [openId, setOpenId] = useState<string | null>(messages[0]?.id ?? null);
  const [showEmail, setShowEmail] = useState<Record<string, boolean>>({});

  const addMutation = useMutation({
    mutationFn: ({ messageId, index }: { messageId: string; index: number }) =>
      organisationApi.addMessageAttachment(participant.id, messageId, index),
    onSuccess: (r) => {
      toast.success(r.duplicate ? 'This file was already in the documents' : 'Added to the documents. The AI is reading it now.');
      queryClient.invalidateQueries({ queryKey: ['org-participant', participant.id] });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not add the file'),
  });

  const viewAttachment = async (messageId: string, index: number) => {
    try {
      const { url } = await organisationApi.getMessageAttachmentUrl(participant.id, messageId, index);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open the file');
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary-500" />
          <p className="font-semibold text-gray-900">Emails from {participant.firstName}</p>
          <span className="text-xs text-gray-400">{messages.length}</span>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          Replies to our emails arrive here and in your inbox. The summary and the suggested steps are written by AI; check them against the email.
        </p>
        <div className="mt-3 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="rounded-xl border border-gray-200 p-3">
              <button className="w-full text-left flex items-start justify-between gap-3" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.subject || '(no subject)'}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(m.receivedAt)} · {m.fromName || m.fromEmail}
                    {m.attachments.length > 0 && ` · ${m.attachments.length} file${m.attachments.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                {openId === m.id ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              </button>
              {m.aiSummary && (
                <p className="mt-2 text-sm text-gray-700 flex items-start gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <span>{m.aiSummary}</span>
                </p>
              )}
              {openId === m.id && (
                <div className="mt-2 space-y-3">
                  {m.aiSuggestions.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500">Suggested next steps</p>
                      <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1 mt-1">
                        {m.aiSuggestions.map((s, i) => (
                          <li key={i}>
                            {s.text}
                            {s.travelItemId && (
                              <button onClick={() => onGoToTrip(s.travelItemId!)} className="ml-1.5 text-xs text-primary-600 hover:underline">
                                Go to trip
                              </button>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {m.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.attachments.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg text-xs">
                          <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <button onClick={() => viewAttachment(m.id, i)} className="truncate max-w-[200px] text-gray-800 hover:text-primary-600" title="Open the file">
                            {a.name}
                          </button>
                          {a.documentId ? (
                            <span className="text-emerald-600 flex items-center gap-1 whitespace-nowrap"><Check className="w-3 h-3" />In documents</span>
                          ) : (
                            <button
                              onClick={() => addMutation.mutate({ messageId: m.id, index: i })}
                              disabled={addMutation.isPending}
                              className="text-primary-600 font-medium hover:underline whitespace-nowrap disabled:opacity-50"
                            >
                              Add to documents
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setShowEmail((s) => ({ ...s, [m.id]: !s[m.id] }))} className="text-xs text-gray-500 hover:text-gray-700 underline">
                    {showEmail[m.id] ? 'Hide the email' : 'Show the email'}
                  </button>
                  {showEmail[m.id] && (
                    <pre className="whitespace-pre-wrap break-words text-sm text-gray-700 bg-gray-50 rounded-lg p-3 font-sans">{m.textBody}</pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Correct a participant's bank details; deliberate on purpose (confirmation, email to the participant) */
function BankDetailsModal({ participant, onClose }: { participant: OrgParticipantDetailData; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [iban, setIban] = useState(participant.bankAccountIban || '');
  const [holder, setHolder] = useState(participant.bankAccountHolderName || `${participant.firstName} ${participant.lastName}`);
  const [bic, setBic] = useState(participant.bankAccountBic || '');
  const [bankName, setBankName] = useState(participant.bankName || '');

  const mutation = useMutation({
    mutationFn: () =>
      organisationApi.updateBankDetails(participant.id, {
        bankAccountIban: iban,
        bankAccountHolderName: holder,
        bankAccountBic: bic || null,
        bankName: bankName || null,
      }),
    onSuccess: () => {
      toast.success(`Bank details saved — ${participant.firstName} has been emailed`);
      queryClient.invalidateQueries({ queryKey: ['org-participant', participant.id] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save the bank details'),
  });

  const save = () => {
    if (window.confirm(`Change ${participant.firstName}'s bank details? ${participant.firstName} will get an email about this change.`)) {
      mutation.mutate();
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Correct bank details">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Only change these when the participant gave you the right details. The change is logged, and {participant.firstName} gets an email about it.
        </p>
        <Input label="IBAN / account number" value={iban} onChange={(e) => setIban(e.target.value)} className="font-mono" />
        <Input label="Account holder" value={holder} onChange={(e) => setHolder(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="BIC (optional)" value={bic} onChange={(e) => setBic(e.target.value)} className="font-mono" />
          <Input label="Bank name (optional)" value={bankName} onChange={(e) => setBankName(e.target.value)} />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={mutation.isPending} disabled={!iban.trim() || !holder.trim()}>Save bank details</Button>
        </div>
      </div>
    </Modal>
  );
}
