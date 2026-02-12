import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileText, Link2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { DeclarationOfTravelForm } from './DeclarationOfTravelForm';
import { participantApi, TravelItem, Document } from '../../services/api';
import { clsx } from 'clsx';

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
}: MissingBoardingPassModalProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'options' | 'link-document' | 'declaration'>('options');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Filter documents that are not already linked to a travel item
  // and that could potentially be a boarding pass (images, PDFs)
  const unlinkedDocuments = documents.filter(
    (doc) =>
      !doc.documentType?.includes('INVOICE') &&
      doc.mimeType &&
      (doc.mimeType.includes('image') || doc.mimeType.includes('pdf'))
  );

  const linkMutation = useMutation({
    mutationFn: () =>
      participantApi.linkDocumentToTravelItem(token, travelItem.id, selectedDocId!),
    onSuccess: () => {
      toast.success('Document linked to travel item');
      queryClient.invalidateQueries({ queryKey: ['participant'] });
      onClose();
    },
    onError: () => {
      toast.error('Failed to link document');
    },
  });

  const handleLinkDocument = () => {
    if (selectedDocId) {
      linkMutation.mutate();
    }
  };

  const apiBase = import.meta.env.VITE_API_URL || '';

  // Find the linked document for the travel item (if any)
  const linkedDocument = travelItem.documentId
    ? documents.find((d) => d.id === travelItem.documentId) || null
    : null;

  if (view === 'declaration') {
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

  if (view === 'link-document') {
    return (
      <Modal isOpen={isOpen} onClose={() => setView('options')} title="Link Existing Document">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Select a document to link to this flight. This is useful if the AI didn't
            recognize your boarding pass.
          </p>

          {unlinkedDocuments.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {unlinkedDocuments.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className={clsx(
                    'w-full p-3 rounded-xl border-2 text-left flex items-center gap-3 transition-all',
                    selectedDocId === doc.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-200'
                  )}
                >
                  {doc.mimeType?.includes('image') ? (
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      <img
                        src={`${apiBase}/uploads/${doc.storedFilePath}`}
                        alt={doc.originalFilename}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {doc.renamedFilename || doc.originalFilename}
                    </p>
                    <p className="text-sm text-gray-500">
                      {doc.documentType?.replace(/_/g, ' ').toLowerCase() || 'Unknown type'}
                    </p>
                  </div>
                  {selectedDocId === doc.id && (
                    <CheckCircle className="w-5 h-5 text-primary-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No unlinked documents available</p>
              <p className="text-sm text-gray-400 mt-1">
                Upload your boarding pass first, then come back here to link it
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setView('options')}>
              Back
            </Button>
            <Button
              onClick={handleLinkDocument}
              disabled={!selectedDocId}
              loading={linkMutation.isPending}
            >
              <Link2 className="w-4 h-4 mr-2" />
              Link Document
            </Button>
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
          <div>
            <p className="text-sm text-blue-800">
              A boarding pass is required for your flight from{' '}
              <strong>{travelItem.fromLocation}</strong> to{' '}
              <strong>{travelItem.toLocation}</strong>.
            </p>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <button
            onClick={() => setView('link-document')}
            className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-primary-200 text-left transition-all flex items-start gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
              <Link2 className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">
                I have the boarding pass but it wasn't recognized
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Link an existing uploaded document to this flight
              </p>
            </div>
          </button>

          <button
            onClick={() => setView('declaration')}
            className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-amber-200 text-left transition-all flex items-start gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">
                I don't have the boarding pass
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Sign a Declaration of Travel as a substitute
              </p>
            </div>
          </button>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose} className="w-full">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
