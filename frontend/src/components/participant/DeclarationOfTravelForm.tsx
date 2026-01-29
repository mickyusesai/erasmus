import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileText, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SignaturePad, SignaturePadRef } from './SignaturePad';
import {
  participantApi,
  TravelItem,
  TransportMode,
  CreateDeclarationOfTravelData,
} from '../../services/api';

interface DeclarationOfTravelFormProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  travelItem?: TravelItem;
  participantName: string;
  participantCountry: string;
}

const transportModeLabels: Record<TransportMode, string> = {
  PLANE: 'flight',
  TRAIN: 'train',
  BUS: 'bus',
  CAR: 'car',
  FERRY: 'ferry',
  OTHER: 'transport',
};

export function DeclarationOfTravelForm({
  isOpen,
  onClose,
  token,
  travelItem,
  participantName,
}: DeclarationOfTravelFormProps) {
  const queryClient = useQueryClient();
  const signatureRef = useRef<SignaturePadRef>(null);

  // Pre-fill form with travel item data if available
  const [formData, setFormData] = useState({
    name: participantName,
    modeOfTransport: travelItem?.modeOfTransport || ('PLANE' as TransportMode),
    fromPlace: travelItem?.fromLocation || '',
    toPlace: travelItem?.toLocation || '',
    travelDate: travelItem?.departureDate
      ? new Date(travelItem.departureDate).toISOString().split('T')[0]
      : '',
    flightNumber: travelItem?.flightNumber || '',
    bookingReference: travelItem?.bookingReference || '',
    dateOfBirth: '',
    idNumber: '',
    sendingOrgName: '',
    sendingOrgOid: '',
    sendingOrgAddress: '',
  });

  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateDeclarationOfTravelData) =>
      participantApi.createDeclarationOfTravel(token, data),
    onSuccess: () => {
      toast.success('Declaration created and PDF generated');
      queryClient.invalidateQueries({ queryKey: ['participant'] });
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create declaration');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!signatureDataUrl) {
      toast.error('Please sign the declaration');
      return;
    }

    createMutation.mutate({
      travelItemId: travelItem?.id,
      name: formData.name,
      modeOfTransport: formData.modeOfTransport,
      fromPlace: formData.fromPlace,
      toPlace: formData.toPlace,
      travelDate: formData.travelDate,
      flightNumber: formData.flightNumber || undefined,
      bookingReference: formData.bookingReference || undefined,
      dateOfBirth: formData.dateOfBirth,
      idNumber: formData.idNumber,
      sendingOrgName: formData.sendingOrgName,
      sendingOrgOid: formData.sendingOrgOid || undefined,
      sendingOrgAddress: formData.sendingOrgAddress,
      signatureDataUrl,
    });
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Declaration of Travel" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Warning */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-800 font-medium">
              Only use this if you cannot find your boarding pass
            </p>
            <p className="text-xs text-amber-700 mt-1">
              This declaration is a substitute for a missing boarding pass. Please try to
              locate your boarding pass first.
            </p>
          </div>
        </div>

        {/* Declaration Preview */}
        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <p className="text-sm text-gray-700 italic">
              "I, <strong>{formData.name || '___'}</strong>, hereby declare that I took
              the{' '}
              <strong>
                {transportModeLabels[formData.modeOfTransport] || '___'}
              </strong>{' '}
              from <strong>{formData.fromPlace || '___'}</strong> to{' '}
              <strong>{formData.toPlace || '___'}</strong> on{' '}
              <strong>
                {formData.travelDate
                  ? new Date(formData.travelDate).toLocaleDateString()
                  : '___'}
              </strong>
              {formData.flightNumber &&
                formData.modeOfTransport === 'PLANE' &&
                ` with flight number ${formData.flightNumber}`}
              {formData.bookingReference &&
                ` and booking reference ${formData.bookingReference}`}
              ."
            </p>
          </CardContent>
        </Card>

        {/* Travel Details */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Travel Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Your Name"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mode of Transport
              </label>
              <select
                value={formData.modeOfTransport}
                onChange={(e) => updateField('modeOfTransport', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
                required
              >
                <option value="PLANE">Flight</option>
                <option value="TRAIN">Train</option>
                <option value="BUS">Bus</option>
                <option value="CAR">Car</option>
                <option value="FERRY">Ferry</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <Input
              label="From (Place)"
              value={formData.fromPlace}
              onChange={(e) => updateField('fromPlace', e.target.value)}
              placeholder="e.g., Warsaw"
              required
            />
            <Input
              label="To (Place)"
              value={formData.toPlace}
              onChange={(e) => updateField('toPlace', e.target.value)}
              placeholder="e.g., Barcelona"
              required
            />
            <Input
              label="Travel Date"
              type="date"
              value={formData.travelDate}
              onChange={(e) => updateField('travelDate', e.target.value)}
              required
            />
            {formData.modeOfTransport === 'PLANE' && (
              <Input
                label="Flight Number"
                value={formData.flightNumber}
                onChange={(e) => updateField('flightNumber', e.target.value)}
                placeholder="e.g., FR1234"
              />
            )}
            <Input
              label="Booking Reference"
              value={formData.bookingReference}
              onChange={(e) => updateField('bookingReference', e.target.value)}
              placeholder="e.g., ABC123"
            />
          </div>
        </div>

        {/* Personal Details */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Personal Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date of Birth"
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => updateField('dateOfBirth', e.target.value)}
              required
            />
            <Input
              label="ID/Passport Number"
              value={formData.idNumber}
              onChange={(e) => updateField('idNumber', e.target.value)}
              placeholder="e.g., AB1234567"
              required
            />
          </div>
        </div>

        {/* Sending Organisation */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Sending Organisation</h4>
          <div className="space-y-4">
            <Input
              label="Organisation Name"
              value={formData.sendingOrgName}
              onChange={(e) => updateField('sendingOrgName', e.target.value)}
              placeholder="e.g., Youth Association Poland"
              required
            />
            <Input
              label="Organisation OID (optional)"
              value={formData.sendingOrgOid}
              onChange={(e) => updateField('sendingOrgOid', e.target.value)}
              placeholder="e.g., E10012345"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organisation Address
              </label>
              <textarea
                value={formData.sendingOrgAddress}
                onChange={(e) => updateField('sendingOrgAddress', e.target.value)}
                placeholder="Full address of the sending organisation"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all resize-none"
                rows={2}
                required
              />
            </div>
          </div>
        </div>

        {/* Signature */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Signature</h4>
          <SignaturePad
            ref={signatureRef}
            onSignatureChange={setSignatureDataUrl}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={createMutation.isPending}
            disabled={!signatureDataUrl}
          >
            <FileText className="w-4 h-4 mr-2" />
            Sign & Generate PDF
          </Button>
        </div>
      </form>
    </Modal>
  );
}
