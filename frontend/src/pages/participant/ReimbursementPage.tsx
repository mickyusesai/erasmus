import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Trash2,
  ExternalLink,
  Plane,
  Train,
  Bus,
  Car,
  Ship,
  HelpCircle,
  Shield,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import {
  participantApi,
  ParticipantAuthResponse,
  TravelItem,
  Document,
  TransportMode,
  DocumentType,
} from '../../services/api';
import { clsx } from 'clsx';

type Step = 1 | 2 | 3;

const transportIcons: Record<TransportMode, React.ElementType> = {
  PLANE: Plane,
  TRAIN: Train,
  BUS: Bus,
  CAR: Car,
  FERRY: Ship,
  OTHER: HelpCircle,
};

const transportOptions = [
  { value: 'PLANE', label: 'Plane' },
  { value: 'TRAIN', label: 'Train' },
  { value: 'BUS', label: 'Bus' },
  { value: 'CAR', label: 'Car' },
  { value: 'FERRY', label: 'Ferry' },
  { value: 'OTHER', label: 'Other' },
];

export default function ReimbursementPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) {
      navigate('/invalid-link');
    }
  }, [token, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['participant-auth', token],
    queryFn: () => participantApi.authenticate(token!),
    enabled: !!token,
    retry: false,
  });

  if (!token) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin mx-auto" />
          <p className="text-gray-500 mt-4">Loading your reimbursement page...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-8">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h1>
            <p className="text-gray-500">
              This magic link is invalid or has expired. Please contact the project organizers for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isComplete = data.participant.status !== 'DRAFT';

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <div className="bg-gradient-header text-white">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
          <h1 className="text-2xl sm:text-3xl font-bold">
            Hello {data.participant.firstName}!
          </h1>
          <p className="text-white/80 mt-2">
            Travel reimbursement for {data.project.name}
          </p>

          {/* Privacy Notice */}
          <div className="mt-6 p-4 bg-white/10 rounded-xl flex items-start gap-3">
            <Shield className="w-5 h-5 text-white/80 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-white/80">
              Your data is handled according to GDPR regulations. Only the project team will have access to your information. Data will be stored for reimbursement and auditing purposes and will be removed after a reasonable period.
            </p>
          </div>

          {/* Progress Steps */}
          {!isComplete && (
            <div className="mt-8">
              <ProgressSteps currentStep={currentStep} />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 -mt-6">
        {isComplete ? (
          <CompletedView data={data} />
        ) : (
          <>
            {currentStep === 1 && (
              <Step1Upload
                data={data}
                token={token}
                onNext={() => setCurrentStep(2)}
              />
            )}
            {currentStep === 2 && (
              <Step2CheckData
                data={data}
                token={token}
                onBack={() => setCurrentStep(1)}
                onNext={() => setCurrentStep(3)}
              />
            )}
            {currentStep === 3 && (
              <Step3Confirm
                data={data}
                token={token}
                onBack={() => setCurrentStep(2)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProgressSteps({ currentStep }: { currentStep: Step }) {
  const steps = [
    { num: 1, label: 'Upload Documents' },
    { num: 2, label: 'Check Data' },
    { num: 3, label: 'Confirm & Submit' },
  ];

  return (
    <div className="flex items-center justify-between">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center flex-1">
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                currentStep >= step.num
                  ? 'bg-white text-primary-600'
                  : 'bg-white/20 text-white/60'
              )}
            >
              {currentStep > step.num ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                step.num
              )}
            </div>
            <span
              className={clsx(
                'text-sm hidden sm:block',
                currentStep >= step.num ? 'text-white' : 'text-white/60'
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={clsx(
                'flex-1 h-0.5 mx-4',
                currentStep > step.num ? 'bg-white' : 'bg-white/20'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function CompletedView({ data }: { data: ParticipantAuthResponse }) {
  return (
    <Card className="mt-6">
      <CardContent className="py-12 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Your reimbursement file is complete!
        </h2>
        <p className="text-gray-500 max-w-md mx-auto">
          Thank you for submitting your travel documents. The project team will review your submission and process your reimbursement.
        </p>

        <div className="mt-8 p-6 bg-gray-50 rounded-2xl max-w-sm mx-auto">
          <p className="text-sm text-gray-500 mb-1">Amount to reimburse</p>
          <p className="text-3xl font-bold text-gray-900">
            {new Intl.NumberFormat('de-DE', {
              style: 'currency',
              currency: 'EUR',
            }).format(data.reimbursementSummary?.amountToReimburse || 0)}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Status: {data.participant.status.replace('_', ' ')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Step1Upload({
  data,
  token,
  onNext,
}: {
  data: ParticipantAuthResponse;
  token: string;
  onNext: () => void;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => participantApi.uploadDocument(token, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      toast.success('Document uploaded');
    },
    onError: () => {
      toast.error('Failed to upload document');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => participantApi.deleteDocument(token, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      toast.success('Document deleted');
    },
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true);
    for (const file of acceptedFiles) {
      await uploadMutation.mutateAsync(file);
    }
    setUploading(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: 10 * 1024 * 1024,
  });

  const docTypeLabels: Record<string, string> = {
    FLIGHT_INVOICE: 'Flight Invoice',
    FLIGHT_BOARDING_PASS: 'Boarding Pass',
    TRAIN_TICKET: 'Train Ticket',
    BUS_TICKET: 'Bus Ticket',
    FUEL_RECEIPT: 'Fuel Receipt',
    GREEN_TRAVEL_DECLARATION: 'Green Travel',
    OTHER: 'Other',
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-gray-900">Upload Your Travel Documents</h2>
        <p className="text-gray-500 mt-1">
          Upload all your travel tickets, invoices, and boarding passes. We'll automatically extract the information.
        </p>
      </CardHeader>
      <CardContent>
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={clsx('dropzone', isDragActive && 'active')}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <>
              <Loader2 className="w-12 h-12 text-primary-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Uploading and analyzing document...</p>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {isDragActive
                  ? 'Drop the files here'
                  : 'Drag and drop files here, or click to select'}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                PDF, JPG, PNG up to 10MB
              </p>
            </>
          )}
        </div>

        {/* Uploaded Documents */}
        {data.documents.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-900 mb-4">Uploaded Documents</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.documents.map((doc) => (
                <div key={doc.id} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm">
                        {doc.renamedFilename}
                      </p>
                      <p className="text-xs text-gray-500">
                        {docTypeLabels[doc.documentType]}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-3">
                    <a
                      href={`/uploads/${doc.storedFilePath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View
                    </a>
                    <button
                      onClick={() => deleteMutation.mutate(doc.id)}
                      className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Button */}
        <div className="mt-8 flex justify-end">
          <Button onClick={onNext} disabled={data.documents.length === 0}>
            Continue to Check Data
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Step2CheckData({
  data,
  token,
  onBack,
  onNext,
}: {
  data: ParticipantAuthResponse;
  token: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TravelItem> }) =>
      participantApi.updateTravelItem(token, id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => participantApi.deleteTravelItem(token, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      toast.success('Travel item removed');
    },
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-gray-900">Check Your Travel Data</h2>
        <p className="text-gray-500 mt-1">
          We've extracted the following information from your documents. Please verify and correct if needed.
        </p>
      </CardHeader>
      <CardContent>
        {data.travelItems.length > 0 ? (
          <div className="space-y-6">
            {data.travelItems.map((item) => (
              <TravelItemForm
                key={item.id}
                item={item}
                onUpdate={(updates) =>
                  updateMutation.mutate({ id: item.id, updates })
                }
                onDelete={() => deleteMutation.mutate(item.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <p className="text-gray-600">
              No travel items detected. Please go back and upload your travel documents.
            </p>
          </div>
        )}

        {/* Summary */}
        <div className="mt-8 p-6 bg-gray-50 rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Calculated Total</p>
              <p className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(data.reimbursementSummary?.totalEur || 0)}
              </p>
            </div>
            {data.maxReimbursementForCountry && (
              <div className="text-right">
                <p className="text-sm text-gray-500">Maximum for {data.participant.country}</p>
                <p className="text-lg font-semibold text-gray-700">
                  {new Intl.NumberFormat('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(data.maxReimbursementForCountry)}
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Final reimbursement is subject to project rules and cannot exceed the maximum allowed for your country.
          </p>
        </div>

        {/* Navigation */}
        <div className="mt-8 flex justify-between">
          <Button variant="secondary" onClick={onBack}>
            Back to Upload
          </Button>
          <Button onClick={onNext} disabled={data.travelItems.length === 0}>
            Continue to Confirm
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TravelItemForm({
  item,
  onUpdate,
  onDelete,
}: {
  item: TravelItem;
  onUpdate: (updates: Partial<TravelItem>) => void;
  onDelete: () => void;
}) {
  const Icon = transportIcons[item.modeOfTransport];

  return (
    <div className="p-6 bg-gray-50 rounded-2xl">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center">
          <Icon className="w-6 h-6 text-gray-500" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">
            {item.fromLocation} → {item.toLocation}
          </p>
          <p className="text-sm text-gray-500">
            {new Date(item.departureDate).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Select
          label="Mode of Transport"
          value={item.modeOfTransport}
          options={transportOptions}
          onChange={(e) => onUpdate({ modeOfTransport: e.target.value as TransportMode })}
        />
        <Input
          label="From"
          value={item.fromLocation}
          onChange={(e) => onUpdate({ fromLocation: e.target.value })}
        />
        <Input
          label="To"
          value={item.toLocation}
          onChange={(e) => onUpdate({ toLocation: e.target.value })}
        />
        <Input
          label="Departure Date"
          type="date"
          value={item.departureDate.split('T')[0]}
          onChange={(e) => onUpdate({ departureDate: e.target.value })}
        />
        <Input
          label="Amount"
          type="number"
          step="0.01"
          value={item.amountOriginal}
          onChange={(e) => onUpdate({ amountOriginal: parseFloat(e.target.value) })}
        />
        <Select
          label="Currency"
          value={item.currencyOriginal}
          options={[
            { value: 'EUR', label: 'EUR' },
            { value: 'USD', label: 'USD' },
            { value: 'GBP', label: 'GBP' },
            { value: 'PLN', label: 'PLN' },
            { value: 'CZK', label: 'CZK' },
            { value: 'HUF', label: 'HUF' },
            { value: 'RON', label: 'RON' },
            { value: 'SEK', label: 'SEK' },
          ]}
          onChange={(e) => onUpdate({ currencyOriginal: e.target.value })}
        />
        {item.modeOfTransport === 'PLANE' && (
          <>
            <Input
              label="Flight Number"
              value={item.flightNumber || ''}
              onChange={(e) => onUpdate({ flightNumber: e.target.value })}
            />
            <Input
              label="Booking Reference"
              value={item.bookingReference || ''}
              onChange={(e) => onUpdate({ bookingReference: e.target.value })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Step3Confirm({
  data,
  token,
  onBack,
}: {
  data: ParticipantAuthResponse;
  token: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [bankDetails, setBankDetails] = useState({
    bankAccountIban: data.participant.bankAccountIban || '',
    bankAccountHolderName: data.participant.bankAccountHolderName || '',
    bankAccountBic: data.participant.bankAccountBic || '',
  });
  const [confirmations, setConfirmations] = useState({
    dataCorrect: false,
    erasmusRules: false,
  });
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [selectedMissingDoc, setSelectedMissingDoc] = useState<DocumentType | null>(null);

  const updateBankMutation = useMutation({
    mutationFn: () => participantApi.updateBankDetails(token, bankDetails),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
    },
  });

  const createDeclarationMutation = useMutation({
    mutationFn: (data: { missingDocumentType: DocumentType; description: string; reason: string; place: string }) =>
      participantApi.createDeclaration(token, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      toast.success('Declaration submitted');
      setShowDeclarationModal(false);
    },
  });

  const markCompleteMutation = useMutation({
    mutationFn: () => participantApi.markComplete(token),
    onSuccess: (result) => {
      if ('success' in result && result.success) {
        queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
        toast.success('Reimbursement submitted successfully!');
      } else if ('missingItems' in result) {
        toast.error('Please complete all required items');
      }
    },
    onError: () => {
      toast.error('Failed to submit. Please check all required fields.');
    },
  });

  const validation = data.validation;
  const missingDocs = validation.missingItems.filter((i) => i.type === 'document');
  const missingFields = validation.missingItems.filter((i) => i.type === 'field');

  const canSubmit =
    validation.isComplete &&
    confirmations.dataCorrect &&
    confirmations.erasmusRules &&
    bankDetails.bankAccountIban &&
    bankDetails.bankAccountHolderName;

  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="text-xl font-bold text-gray-900">Confirm & Submit</h2>
          <p className="text-gray-500 mt-1">
            Please provide your bank details and confirm your submission.
          </p>
        </CardHeader>
        <CardContent>
          {/* Missing Items Warning */}
          {!validation.isComplete && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-amber-800">Missing Items</h4>
                  <ul className="mt-2 space-y-1">
                    {validation.missingItems.map((item, i) => (
                      <li key={i} className="text-sm text-amber-700 flex items-center gap-2">
                        <span>• {item.description}</span>
                        {item.type === 'document' && item.documentType && (
                          <button
                            onClick={() => {
                              setSelectedMissingDoc(item.documentType!);
                              setShowDeclarationModal(true);
                            }}
                            className="text-xs text-amber-600 hover:text-amber-800 underline"
                          >
                            Sign declaration
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Bank Details */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Bank Account Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="IBAN"
                value={bankDetails.bankAccountIban}
                onChange={(e) =>
                  setBankDetails({ ...bankDetails, bankAccountIban: e.target.value })
                }
                onBlur={() => updateBankMutation.mutate()}
                placeholder="DE89 3704 0044 0532 0130 00"
              />
              <Input
                label="Account Holder Name"
                value={bankDetails.bankAccountHolderName}
                onChange={(e) =>
                  setBankDetails({ ...bankDetails, bankAccountHolderName: e.target.value })
                }
                onBlur={() => updateBankMutation.mutate()}
                placeholder="John Doe"
              />
              <Input
                label="BIC (Optional)"
                value={bankDetails.bankAccountBic}
                onChange={(e) =>
                  setBankDetails({ ...bankDetails, bankAccountBic: e.target.value })
                }
                onBlur={() => updateBankMutation.mutate()}
                placeholder="COBADEFFXXX"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="mt-8 p-6 bg-gradient-header rounded-2xl text-white">
            <h3 className="font-semibold mb-4">Reimbursement Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-white/70 text-sm">Total Travel Costs</p>
                <p className="text-2xl font-bold">
                  {new Intl.NumberFormat('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(data.reimbursementSummary?.totalEur || 0)}
                </p>
              </div>
              <div>
                <p className="text-white/70 text-sm">Amount to Receive</p>
                <p className="text-2xl font-bold">
                  {new Intl.NumberFormat('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(data.reimbursementSummary?.amountToReimburse || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Confirmations */}
          <div className="mt-8 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmations.dataCorrect}
                onChange={(e) =>
                  setConfirmations({ ...confirmations, dataCorrect: e.target.checked })
                }
                className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                I confirm that the above information is correct to the best of my knowledge.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmations.erasmusRules}
                onChange={(e) =>
                  setConfirmations({ ...confirmations, erasmusRules: e.target.checked })
                }
                className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                I understand that the reimbursement rules follow Erasmus+ guidelines.
              </span>
            </label>
          </div>

          {/* Navigation */}
          <div className="mt-8 flex justify-between">
            <Button variant="secondary" onClick={onBack}>
              Back to Check Data
            </Button>
            <Button
              onClick={() => markCompleteMutation.mutate()}
              loading={markCompleteMutation.isPending}
              disabled={!canSubmit}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Submit Reimbursement
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Declaration Modal */}
      <DeclarationModal
        isOpen={showDeclarationModal}
        onClose={() => setShowDeclarationModal(false)}
        documentType={selectedMissingDoc}
        participantName={`${data.participant.firstName} ${data.participant.lastName}`}
        projectName={data.project.name}
        onSubmit={(data) => createDeclarationMutation.mutate(data)}
        isLoading={createDeclarationMutation.isPending}
      />
    </>
  );
}

function DeclarationModal({
  isOpen,
  onClose,
  documentType,
  participantName,
  projectName,
  onSubmit,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  documentType: DocumentType | null;
  participantName: string;
  projectName: string;
  onSubmit: (data: { missingDocumentType: DocumentType; description: string; reason: string; place: string }) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    description: '',
    reason: '',
    place: '',
  });

  if (!documentType) return null;

  const docTypeLabels: Record<DocumentType, string> = {
    FLIGHT_INVOICE: 'Flight Invoice',
    FLIGHT_BOARDING_PASS: 'Boarding Pass',
    TRAIN_TICKET: 'Train Ticket',
    BUS_TICKET: 'Bus Ticket',
    FUEL_RECEIPT: 'Fuel Receipt',
    GREEN_TRAVEL_DECLARATION: 'Green Travel Declaration',
    OTHER: 'Other Document',
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      missingDocumentType: documentType,
      ...formData,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Declaration on Honor" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="p-4 bg-amber-50 rounded-xl">
          <p className="text-sm text-amber-800">
            I, <strong>{participantName}</strong>, participating in the project <strong>{projectName}</strong>,
            hereby declare that I cannot provide the following document:
          </p>
          <p className="font-semibold text-amber-900 mt-2">
            {docTypeLabels[documentType]}
          </p>
        </div>

        <Input
          label="Description of the missing document"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="e.g., Boarding pass for flight KL1234 on September 15"
          required
        />

        <div>
          <label className="label">Reason why it cannot be provided</label>
          <textarea
            className="input min-h-[100px]"
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            placeholder="e.g., I lost the physical boarding pass and the airline's website no longer allows downloading it after the flight"
            required
          />
        </div>

        <Input
          label="Place of declaration"
          value={formData.place}
          onChange={(e) => setFormData({ ...formData, place: e.target.value })}
          placeholder="e.g., Warsaw, Poland"
          required
        />

        <p className="text-xs text-gray-500">
          Date: {new Date().toLocaleDateString()}
        </p>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isLoading}>
            Sign Declaration
          </Button>
        </div>
      </form>
    </Modal>
  );
}
