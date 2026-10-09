import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileText, Link2, AlertCircle, CheckCircle, Plane, Upload, Loader2, ExternalLink, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { DeclarationOfTravelForm } from './DeclarationOfTravelForm';
import { participantApi, TravelItem, Document } from '../../services/api';
import { isReceiptDocument } from '../../utils/documentKinds';
import { clsx } from 'clsx';

type ProofType = 'FLIGHT_BOARDING_PASS' | 'AIRLINE_DECLARATION';

interface MissingBoardingPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  travelItem: TravelItem;
  documents: Document[];
  participantName: string;
  participantCountry: string;
  organisation?: {
    id: string;
    name: string;
    oid?: string;
  } | null;
  onViewDocument?: (doc: Document) => void;
  /** False when the project doesn't accept a declaration on honour instead of a boarding pass */
  declarationsAllowed?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  FLIGHT_INVOICE: 'Flight invoice',
  FLIGHT_BOARDING_PASS: 'Boarding pass',
  AIRLINE_DECLARATION: 'Airline declaration',
  TRAIN_TICKET: 'Train ticket',
  BUS_TICKET: 'Bus ticket',
  BANK_TRANSACTION: 'Bank transaction',
  LUGGAGE_INVOICE: 'Luggage invoice',
  INTERRAIL_PASS: 'Interrail pass',
  FUEL_RECEIPT: 'Fuel receipt',
  OTHER: 'Other document',
};

/** Image thumbnail via a signed URL (works with any storage), PDF icon otherwise */
function DocThumb({ token, doc }: { token: string; doc: Document }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = !!doc.mimeType && doc.mimeType.startsWith('image/');
  useEffect(() => {
    let cancelled = false;
    if (isImage) {
      participantApi.getDocumentUrl(token, doc.id)
        .then((r) => { if (!cancelled) setUrl(r.url); })
        .catch(() => { /* keep the icon */ });
    }
    return () => { cancelled = true; };
  }, [token, doc.id, isImage]);
  return (
    <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <FileText className="w-6 h-6 text-gray-400" />}
    </div>
  );
}

export function MissingBoardingPassModal({
  isOpen,
  onClose,
  token,
  travelItem,
  documents,
  participantName,
  participantCountry,
  organisation,
  onViewDocument,
  declarationsAllowed = true,
}: MissingBoardingPassModalProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'options' | 'attach' | 'declaration'>('options');
  const [proofType, setProofType] = useState<ProofType>('FLIGHT_BOARDING_PASS');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const orgName = organisation?.name || 'Your organisation';
  const isAirline = proofType === 'AIRLINE_DECLARATION';

  // Any uploaded travel document can be the one the AI didn't recognise. Receipts and
  // generated declarations can't, and a file already marked as this proof needs no action.
  const linkedIds = new Set<string>([
    ...(travelItem.documentId ? [travelItem.documentId] : []),
    ...(() => {
      try {
        return travelItem.additionalDocumentIds ? (JSON.parse(travelItem.additionalDocumentIds) as string[]) : [];
      } catch {
        return [];
      }
    })(),
  ]);
  const candidates = documents.filter(
    (doc) =>
      !isReceiptDocument(doc) &&
      doc.documentType !== 'GREEN_TRAVEL_DECLARATION' &&
      !(linkedIds.has(doc.id) && doc.documentType === proofType)
  );

  const finish = async (message: string) => {
    await queryClient.refetchQueries({ queryKey: ['participant-auth'] });
    toast.success(message);
    setView('options');
    setSelectedDocId(null);
    onClose();
  };

  const linkSelected = async () => {
    if (!selectedDocId) return;
    setBusy(true);
    try {
      await participantApi.linkDocumentToTravelItem(token, travelItem.id, selectedDocId, proofType);
      await finish(isAirline ? 'Airline declaration added to this flight' : 'Boarding pass added to this flight');
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not add the document');
    }
    setBusy(false);
  };

  const uploadNew = async (file: File) => {
    setBusy(true);
    try {
      await participantApi.uploadDocument(token, file, proofType, travelItem.id);
      await finish(isAirline ? 'Airline declaration added to this flight' : 'Boarding pass added to this flight');
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Upload failed');
    }
    setBusy(false);
  };

  // New tab rather than the page's document viewer, which would open behind this modal.
  // The tab is opened before the signed link is fetched so mobile popup blockers allow it.
  const openDocument = async (doc: Document) => {
    const tab = window.open('', '_blank');
    try {
      const { url } = await participantApi.getDocumentUrl(token, doc.id);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      tab?.close();
      toast.error('Could not open the document');
    }
  };

  // Find the linked document for the travel item (if any)
  const linkedDocument = travelItem.documentId
    ? documents.find((d) => d.id === travelItem.documentId) || null
    : null;

  if (view === 'declaration' && declarationsAllowed) {
    return (
      <DeclarationOfTravelForm
        isOpen={isOpen}
        onClose={() => {
          setView('options');
          onClose();
        }}
        token={token}
        travelItem={travelItem}
        participantName={participantName}
        participantCountry={participantCountry}
        linkedDocument={linkedDocument}
        onViewDocument={onViewDocument}
        organisation={organisation}
      />
    );
  }

  if (view === 'attach') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={() => setView('options')}
        title={isAirline ? "Add the airline's declaration" : 'Add your boarding pass'}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {isAirline ? (
              <>
                Upload the letter or email in which the airline confirms you took the flight from{' '}
                <strong>{travelItem.fromLocation}</strong> to <strong>{travelItem.toLocation}</strong>. It should show
                your name, the flight number and the date.
              </>
            ) : (
              <>
                Upload the boarding pass for <strong>{travelItem.fromLocation} → {travelItem.toLocation}</strong>, or
                pick it below if you already uploaded it. We'll mark the file as the boarding pass of this flight.
              </>
            )}
          </p>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="w-full rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/40 py-4 text-primary-700 font-semibold text-sm hover:bg-primary-50 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {isAirline ? 'Upload the declaration' : 'Upload the boarding pass'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadNew(file);
              e.target.value = '';
            }}
          />

          {candidates.length > 0 && (
            <>
              <p className="text-sm font-medium text-gray-700 pt-1">Or pick a file you already uploaded</p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {candidates.map((doc) => (
                  <div
                    key={doc.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDocId(doc.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedDocId(doc.id); }}
                    className={clsx(
                      'w-full p-2.5 rounded-xl border-2 text-left flex items-center gap-3 transition-all cursor-pointer',
                      selectedDocId === doc.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-200'
                    )}
                  >
                    <DocThumb token={token} doc={doc} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm">{doc.renamedFilename || doc.originalFilename}</p>
                      <p className="text-xs text-gray-500">
                        {TYPE_LABELS[doc.documentType] || 'Document'}
                        {linkedIds.has(doc.id) ? ' · already on this trip' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void openDocument(doc); }}
                      className="p-2 text-gray-400 hover:text-primary-600"
                      title="Open document"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    {selectedDocId === doc.id && <CheckCircle className="w-5 h-5 text-primary-500 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={() => { setView('options'); setSelectedDocId(null); }}>
              Back
            </Button>
            {candidates.length > 0 && (
              <Button onClick={linkSelected} disabled={!selectedDocId || busy} loading={busy && !!selectedDocId}>
                <Link2 className="w-4 h-4 mr-2" />
                Use this file
              </Button>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  // Options view
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Missing Boarding Pass">
      <div className="space-y-4">
        {/* Info */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            A boarding pass is required for your flight from <strong>{travelItem.fromLocation}</strong> to{' '}
            <strong>{travelItem.toLocation}</strong>.
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <button
            onClick={() => { setProofType('FLIGHT_BOARDING_PASS'); setSelectedDocId(null); setView('attach'); }}
            className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-primary-200 text-left transition-all flex items-start gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
              <Link2 className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">I have the boarding pass but it wasn't recognized</p>
              <p className="text-sm text-gray-500 mt-1">Pick the file you uploaded, or upload it again</p>
            </div>
          </button>

          <button
            onClick={() => { setProofType('AIRLINE_DECLARATION'); setSelectedDocId(null); setView('attach'); }}
            className={clsx(
              'w-full p-4 rounded-xl border-2 text-left transition-all flex items-start gap-4',
              declarationsAllowed ? 'border-gray-200 hover:border-sky-200' : 'border-sky-200 bg-sky-50/50 hover:border-sky-300'
            )}
          >
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
              <Plane className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">I have a declaration from the airline</p>
              <p className="text-sm text-gray-500 mt-1">A letter or email from the airline confirming you took this flight</p>
            </div>
          </button>

          {declarationsAllowed && (
            <button
              onClick={() => setView('declaration')}
              className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-amber-200 text-left transition-all flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">I don't have the boarding pass</p>
                <p className="text-sm text-gray-500 mt-1">Sign a Declaration on Honor as a substitute</p>
              </div>
            </button>
          )}
        </div>

        {!declarationsAllowed && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong>Lost your boarding pass?</strong> {orgName} can't accept a declaration on honour for flights. Ask the
              airline for a written confirmation that you took this flight, often called a certificate of travel or flight
              confirmation, and upload it with the option above.
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose} className="w-full">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
