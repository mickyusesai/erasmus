import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { organisationApi, TravelItem, Document, TransportMode, ReviewFinding } from '../../services/api';
import { clsx } from 'clsx';

// Helper function to format dates as DD-MM-YYYY (European format)
function formatDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

const transportIcons: Record<TransportMode, React.ElementType> = {
  PLANE: Plane,
  TRAIN: Train,
  BUS: Bus,
  CAR: Car,
  FERRY: Ship,
  OTHER: HelpCircle,
};

export default function OrgParticipantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [internalNotes, setInternalNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(false);

  // Check if logged in
  useEffect(() => {
    const token = localStorage.getItem('org-token');
    if (!token) {
      navigate('/org/login');
    }
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['org-participant', id],
    queryFn: () => organisationApi.getParticipant(id!),
    enabled: !!id,
    retry: false,
  });

  // Initialize internal notes from participant data
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
    onError: () => {
      toast.error('Failed to update finding');
    },
  });

  const refreshReviewMutation = useMutation({
    mutationFn: () => organisationApi.refreshReviewFindings(id!),
    onSuccess: (result) => {
      queryClient.setQueryData(['participant-review', id], { findings: result.findings });
      toast.success('AI review refreshed');
    },
    onError: () => {
      toast.error('Failed to refresh AI review');
    },
  });

  const sendMagicLinkMutation = useMutation({
    mutationFn: () => organisationApi.sendMagicLink(id!),
    onSuccess: () => {
      toast.success('Magic link sent');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
    onError: () => {
      toast.error('Failed to send magic link');
    },
  });

  const markAiCheckOkMutation = useMutation({
    mutationFn: () => organisationApi.markAiCheckOk(id!),
    onSuccess: () => {
      toast.success('AI check marked as OK');
      queryClient.invalidateQueries({ queryKey: ['org-participant', id] });
    },
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
    onSuccess: () => {
      toast.success('Notes saved');
    },
    onError: () => {
      toast.error('Failed to save notes');
    },
  });

  const deleteParticipantMutation = useMutation({
    mutationFn: () => organisationApi.deleteParticipant(id!),
    onSuccess: () => {
      toast.success('Participant deleted');
      if (participant?.project?.id) {
        navigate(`/org/projects/${participant.project.id}`);
      } else {
        navigate('/org/dashboard');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete participant');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
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

  const participant = data.participant;
  const summary = participant.reimbursementSummary;
  const findings = reviewData?.findings || [];
  const allChecked = findings.length > 0 && findings.every((f: ReviewFinding) => f.checked);
  const checkedCount = findings.filter((f: ReviewFinding) => f.checked).length;

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
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="space-y-6 animate-fadeIn">
          {/* Header */}
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Summary Card */}
              <Card variant="gradient">
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <p className="text-white/70 text-sm">Total (EUR)</p>
                      <p className="text-2xl font-bold text-white">
                        {new Intl.NumberFormat('de-DE', {
                          style: 'currency',
                          currency: 'EUR',
                        }).format(summary?.totalEur || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/70 text-sm">Max Allowed</p>
                      <p className="text-2xl font-bold text-white">
                        {new Intl.NumberFormat('de-DE', {
                          style: 'currency',
                          currency: 'EUR',
                        }).format(participant.maxReimbursementForCountry || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/70 text-sm">To Reimburse</p>
                      <p className="text-2xl font-bold text-white">
                        {new Intl.NumberFormat('de-DE', {
                          style: 'currency',
                          currency: 'EUR',
                        }).format(summary?.amountToReimburse || 0)}
                      </p>
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

              {/* Documents */}
              <Card>
                <CardHeader>
                  <h3 className="font-semibold text-gray-900">Documents</h3>
                </CardHeader>
                <CardContent>
                  {participant.documents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {participant.documents.map((doc) => (
                        <DocumentCard
                          key={doc.id}
                          document={doc}
                          participantId={participant.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-6">No documents uploaded</p>
                  )}
                </CardContent>
              </Card>

              {/* Travel Items */}
              <Card>
                <CardHeader>
                  <h3 className="font-semibold text-gray-900">Travel Items</h3>
                </CardHeader>
                <CardContent>
                  {participant.travelItems.length > 0 ? (
                    <div className="space-y-4">
                      {participant.travelItems.map((item) => (
                        <TravelItemCard
                          key={item.id}
                          item={item}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-6">No travel items</p>
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
                    {/* Bank Account */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                        <CreditCard className="w-4 h-4" />
                        Bank Account
                      </div>
                      <div className="text-sm">
                        <p className="text-gray-500">IBAN</p>
                        <p className="font-mono text-gray-900">
                          {participant.bankAccountIban || '-'}
                        </p>
                      </div>
                      <div className="text-sm">
                        <p className="text-gray-500">Account Holder</p>
                        <p className="text-gray-900">
                          {participant.bankAccountHolderName || '-'}
                        </p>
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

                    {/* Personal Address */}
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

            {/* Sidebar */}
            <div className="space-y-6">
              {/* AI Review Findings */}
              {participant.status !== 'DRAFT' && (
                <Card className={clsx(
                  'border',
                  allChecked ? 'border-emerald-300' : findings.length > 0 ? 'border-indigo-200' : 'border-gray-200'
                )}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className={clsx(
                          'w-4 h-4',
                          allChecked ? 'text-emerald-500' : 'text-indigo-500'
                        )} />
                        <h3 className="font-semibold text-gray-900">AI Review</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {findings.length > 0 && (
                          <span className={clsx(
                            'text-xs font-medium px-2 py-0.5 rounded-full',
                            allChecked
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-600'
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
                          <RefreshCw className={clsx(
                            'w-3.5 h-3.5',
                            refreshReviewMutation.isPending && 'animate-spin'
                          )} />
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
                    ) : allChecked && findings.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg text-sm text-emerald-700 mb-3">
                          <CheckCircle className="w-4 h-4 flex-shrink-0" />
                          <span className="font-medium">All items reviewed</span>
                        </div>
                        <div className="space-y-1.5">
                          {findings.map((finding: ReviewFinding) => (
                            <FindingItem
                              key={finding.id}
                              finding={finding}
                              onToggle={() => toggleFindingMutation.mutate({ findingId: finding.id })}
                            />
                          ))}
                        </div>
                      </>
                    ) : findings.length > 0 ? (
                      <div className="space-y-1.5">
                        {findings.map((finding: ReviewFinding) => (
                          <FindingItem
                            key={finding.id}
                            finding={finding}
                            onToggle={() => toggleFindingMutation.mutate({ findingId: finding.id })}
                          />
                        ))}
                      </div>
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
                    {!summary?.aiCheckOk && (
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => markAiCheckOkMutation.mutate()}
                        loading={markAiCheckOkMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Mark AI Check OK
                      </Button>
                    )}

                    {participant.status === 'PARTICIPANT_COMPLETE' && (
                      <Button
                        className="w-full"
                        onClick={() => approveMutation.mutate()}
                        loading={approveMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve Reimbursement
                      </Button>
                    )}

                    {participant.status === 'ADMIN_APPROVED' && !summary?.paid && (
                      <Button
                        className="w-full"
                        onClick={() => markPaidMutation.mutate()}
                        loading={markPaidMutation.isPending}
                      >
                        <Euro className="w-4 h-4 mr-2" />
                        Mark as Paid
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Participant Note (from the participant) */}
              {participant.participantNote && (
                <Card className="border-blue-200 bg-blue-50">
                  <CardHeader>
                    <h3 className="font-semibold text-blue-800">Note from Participant</h3>
                  </CardHeader>
                  <CardContent>
                    <p className="text-blue-700 text-sm whitespace-pre-wrap">
                      {participant.participantNote}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Internal Notes (organisation-only) */}
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
                    <p className="text-gray-600 text-sm mb-3">
                      Delete this participant and all their data.
                    </p>
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
      </div>
    </div>
  );
}

function FindingItem({ finding, onToggle }: { finding: ReviewFinding; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={clsx(
        'flex items-start gap-2 p-2 rounded-lg text-sm w-full text-left transition-colors',
        finding.checked
          ? 'bg-gray-50 opacity-60'
          : finding.severity === 'critical'
            ? 'bg-red-50 hover:bg-red-100'
            : finding.severity === 'important'
              ? 'bg-amber-50 hover:bg-amber-100'
              : 'bg-gray-50 hover:bg-gray-100',
      )}
    >
      <div className={clsx(
        'w-4 h-4 rounded border mt-0.5 flex-shrink-0 flex items-center justify-center transition-colors',
        finding.checked
          ? 'bg-emerald-500 border-emerald-500'
          : finding.severity === 'critical'
            ? 'border-red-300'
            : finding.severity === 'important'
              ? 'border-amber-300'
              : 'border-gray-300',
      )}>
        {finding.checked && <Check className="w-3 h-3 text-white" />}
      </div>
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
    </button>
  );
}

function DocumentCard({ document, participantId }: { document: Document; participantId: string }) {
  const docTypeLabels: Record<string, string> = {
    FLIGHT_INVOICE: 'Flight Invoice',
    FLIGHT_BOARDING_PASS: 'Boarding Pass',
    TRAIN_TICKET: 'Train Ticket',
    BUS_TICKET: 'Bus Ticket',
    FUEL_RECEIPT: 'Fuel Receipt',
    GREEN_TRAVEL_DECLARATION: 'Green Travel Declaration',
    HOTEL_INVOICE: 'Hotel Invoice',
    OTHER: 'Other',
  };

  const handleViewDocument = async () => {
    try {
      const { url } = await organisationApi.getDocumentUrl(participantId, document.id);
      window.open(url, '_blank');
    } catch {
      toast.error('Failed to get document URL');
    }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{document.renamedFilename}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {docTypeLabels[document.documentType] || document.documentType} &middot;{' '}
            {(document.fileSize / 1024).toFixed(1)} KB
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleViewDocument}
          className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          View
        </button>
      </div>
    </div>
  );
}

function TravelItemCard({ item }: { item: TravelItem }) {
  const Icon = transportIcons[item.modeOfTransport];

  return (
    <div className="p-4 bg-gray-50 rounded-xl">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-gray-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{item.fromLocation}</span>
            <span className="text-gray-400">&rarr;</span>
            <span className="font-medium text-gray-900">{item.toLocation}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
            <span>{formatDate(item.departureDate)}</span>
            {item.flightNumber && <span>Flight: {item.flightNumber}</span>}
            {item.bookingReference && <span>Ref: {item.bookingReference}</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold text-gray-900">
            {new Intl.NumberFormat('de-DE', {
              style: 'currency',
              currency: 'EUR',
            }).format(item.amountEur)}
          </p>
          {item.currencyOriginal !== 'EUR' && (
            <p className="text-xs text-gray-500">
              {item.amountOriginal} {item.currencyOriginal}
            </p>
          )}
          {item.luggageAmountEur != null && item.luggageAmountEur > 0 && (
            <p className="text-xs text-sky-600">
              +{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(item.luggageAmountEur)} luggage
            </p>
          )}
        </div>
      </div>
      {item.excludedFromReimbursement && (
        <div className="mt-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
          Excluded from reimbursement
        </div>
      )}
    </div>
  );
}
