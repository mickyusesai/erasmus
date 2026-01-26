import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { adminApi, TravelItem, Document, TransportMode } from '../../services/api';
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

export default function ParticipantDetail() {
  const { id } = useParams<{ id: string }>();
  const [showChangeLog, setShowChangeLog] = useState(false);
  const queryClient = useQueryClient();

  const { data: participant, isLoading } = useQuery({
    queryKey: ['participant', id],
    queryFn: () => adminApi.getParticipant(id!),
    enabled: !!id,
  });

  const sendMagicLinkMutation = useMutation({
    mutationFn: () => adminApi.sendMagicLink(id!),
    onSuccess: () => {
      toast.success('Magic link sent');
      queryClient.invalidateQueries({ queryKey: ['participant', id] });
    },
    onError: () => {
      toast.error('Failed to send magic link');
    },
  });

  const markAiCheckOkMutation = useMutation({
    mutationFn: () => adminApi.markAiCheckOk(id!),
    onSuccess: () => {
      toast.success('AI check marked as OK');
      queryClient.invalidateQueries({ queryKey: ['participant', id] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => adminApi.approveParticipant(id!),
    onSuccess: () => {
      toast.success('Participant approved');
      queryClient.invalidateQueries({ queryKey: ['participant', id] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: () => adminApi.markPaid(id!),
    onSuccess: () => {
      toast.success('Marked as paid');
      queryClient.invalidateQueries({ queryKey: ['participant', id] });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => adminApi.deleteDocument(id!, docId),
    onSuccess: () => {
      toast.success('Document deleted');
      queryClient.invalidateQueries({ queryKey: ['participant', id] });
    },
  });

  const deleteTravelItemMutation = useMutation({
    mutationFn: (itemId: string) => adminApi.deleteTravelItem(id!, itemId),
    onSuccess: () => {
      toast.success('Travel item deleted');
      queryClient.invalidateQueries({ queryKey: ['participant', id] });
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

  if (!participant) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Participant not found</p>
      </div>
    );
  }

  const summary = participant.reimbursementSummary;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          to={`/admin/projects/${participant.projectId}`}
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
                      onDelete={() => deleteDocMutation.mutate(doc.id)}
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
                      onDelete={() => deleteTravelItemMutation.mutate(item.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-6">No travel items</p>
              )}
            </CardContent>
          </Card>

          {/* Change Log */}
          <Card>
            <CardHeader>
              <button
                onClick={() => setShowChangeLog(!showChangeLog)}
                className="flex items-center justify-between w-full"
              >
                <h3 className="font-semibold text-gray-900">Change Log</h3>
                {showChangeLog ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
            </CardHeader>
            {showChangeLog && (
              <CardContent>
                {participant.changeLogEntries.length > 0 ? (
                  <div className="space-y-3">
                    {participant.changeLogEntries.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 text-sm">
                        <span
                          className={clsx(
                            'px-2 py-0.5 rounded text-xs font-medium',
                            entry.userType === 'ADMIN'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          )}
                        >
                          {entry.userType}
                        </span>
                        <div className="flex-1">
                          <p className="text-gray-900">
                            Changed <span className="font-medium">{entry.fieldName}</span>
                          </p>
                          <p className="text-gray-500 text-xs mt-0.5">
                            {entry.previousValue || '(empty)'} → {entry.newValue || '(empty)'}
                          </p>
                        </div>
                        <span className="text-gray-400 text-xs">
                          {new Date(entry.changedAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No changes recorded</p>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Bank Details */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Bank Details</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-500">IBAN</p>
                  <p className="font-mono text-gray-900">
                    {participant.bankAccountIban || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Account Holder</p>
                  <p className="text-gray-900">
                    {participant.bankAccountHolderName || '-'}
                  </p>
                </div>
                {participant.bankAccountBic && (
                  <div>
                    <p className="text-gray-500">BIC</p>
                    <p className="font-mono text-gray-900">{participant.bankAccountBic}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

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

          {/* Internal Notes */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Internal Notes</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm">
                {participant.notesInternal || 'No notes'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DocumentCard({ document, onDelete }: { document: Document; onDelete: () => void }) {
  const docTypeLabels: Record<string, string> = {
    FLIGHT_INVOICE: 'Flight Invoice',
    FLIGHT_BOARDING_PASS: 'Boarding Pass',
    TRAIN_TICKET: 'Train Ticket',
    BUS_TICKET: 'Bus Ticket',
    FUEL_RECEIPT: 'Fuel Receipt',
    GREEN_TRAVEL_DECLARATION: 'Green Travel Declaration',
    OTHER: 'Other',
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
            {docTypeLabels[document.documentType]} &middot;{' '}
            {(document.fileSize / 1024).toFixed(1)} KB
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <a
          href={`/uploads/${document.storedFilePath}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          View
        </a>
        <button
          onClick={onDelete}
          className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </div>
    </div>
  );
}

function TravelItemCard({ item, onDelete }: { item: TravelItem; onDelete: () => void }) {
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
            <span className="text-gray-400">→</span>
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
        </div>
      </div>
      <div className="flex justify-end mt-2">
        <button
          onClick={onDelete}
          className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </div>
    </div>
  );
}
