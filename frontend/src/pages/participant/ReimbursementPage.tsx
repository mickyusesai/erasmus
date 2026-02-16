import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Loader2,
  Plus,
  AlertTriangle,
  MapPin,
  Ticket,
  X,
  Share2,
  Info,
  FileCheck,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { MissingBoardingPassModal } from '../../components/participant/MissingBoardingPassModal';
import DisseminationPage from './DisseminationPage';
import {
  participantApi,
  ParticipantAuthResponse,
  TravelItem,
  TransportMode,
  DocumentType,
  Document,
  DeclarationOfTravel,
} from '../../services/api';
import { clsx } from 'clsx';

// Helper function to format dates as DD-MM-YYYY (European format)
function formatDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

// Helper function to format currency with always 2 decimals
function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

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

// Inspiring quotes from Erasmus of Rotterdam for the loading screen
const erasmusQuotes = [
  { quote: "The desire to write grows with writing.", author: "Erasmus of Rotterdam" },
  { quote: "In the land of the blind, the one-eyed man is king.", author: "Erasmus of Rotterdam" },
  { quote: "Give light, and the darkness will disappear of itself.", author: "Erasmus of Rotterdam" },
  { quote: "When I get a little money I buy books; and if any is left I buy food and clothes.", author: "Erasmus of Rotterdam" },
  { quote: "It is the chiefest point of happiness that a man is willing to be what he is.", author: "Erasmus of Rotterdam" },
  { quote: "The more ignorant, the more bold.", author: "Erasmus of Rotterdam" },
  { quote: "Prevention is better than cure.", author: "Erasmus of Rotterdam" },
  { quote: "Fortune favors the audacious.", author: "Erasmus of Rotterdam" },
  { quote: "A good portion of speaking will consist in knowing how to lie.", author: "Erasmus of Rotterdam" },
  { quote: "Man's mind is so formed that it is far more susceptible to falsehood than to truth.", author: "Erasmus of Rotterdam" },
  { quote: "By a Carpenter mankind was made, and only by that Carpenter can mankind be remade.", author: "Erasmus of Rotterdam" },
  { quote: "No one is injured save by himself.", author: "Erasmus of Rotterdam" },
  { quote: "Your library is your paradise.", author: "Erasmus of Rotterdam" },
  { quote: "Time takes away the grief of men.", author: "Erasmus of Rotterdam" },
  { quote: "Whether a party can have much success without a woman present I must ask others to decide.", author: "Erasmus of Rotterdam" },
];

// Loading screen component with travel animation, progress stages, and rotating Erasmus quotes
function ConsolidationLoading() {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const quoteInterval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % erasmusQuotes.length);
    }, 4000);
    return () => clearInterval(quoteInterval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentQuote = erasmusQuotes[quoteIndex];

  // Progress stages based on elapsed time
  const getProgressStage = () => {
    if (elapsed < 15) return { label: 'Analyzing your documents...', progress: 20 };
    if (elapsed < 40) return { label: 'Extracting travel details...', progress: 45 };
    if (elapsed < 70) return { label: 'Building your travel journey...', progress: 70 };
    return { label: 'Almost done, finalizing...', progress: 90 };
  };
  const stage = getProgressStage();

  return (
    <div className="fixed inset-0 bg-white/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <style>{`
        @keyframes fly-plane {
          0% { left: -10%; }
          100% { left: 110%; }
        }
        .plane-animation {
          animation: fly-plane 6s linear infinite;
        }
        @keyframes dash-travel {
          to { stroke-dashoffset: -20; }
        }
        .dotted-path {
          stroke-dasharray: 8 6;
          animation: dash-travel 1.5s linear infinite;
        }
      `}</style>
      <div className="max-w-lg mx-auto text-center px-6">
        {/* Travel-themed animation: plane flying along dotted path */}
        <div className="relative w-full h-24 mb-6 overflow-hidden">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 80" preserveAspectRatio="none">
            <path
              d="M 0 40 Q 100 10, 200 40 Q 300 70, 400 40"
              fill="none"
              stroke="#c7d2fe"
              strokeWidth="2"
              className="dotted-path"
            />
          </svg>
          <div className="plane-animation absolute top-1/2 -translate-y-1/2" style={{ position: 'absolute' }}>
            <Plane className="w-8 h-8 text-primary-600 -rotate-12" />
          </div>
        </div>

        {/* Progress stage label */}
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {stage.label}
        </h3>

        {/* Progress bar */}
        <div className="w-64 h-2 bg-gray-200 rounded-full mx-auto mb-2">
          <div
            className="h-2 bg-primary-500 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${stage.progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mb-6">
          This usually takes 1-2 minutes
        </p>

        {/* Erasmus quote (secondary) */}
        <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-2xl p-5 border border-primary-100">
          <p className="text-base italic text-gray-700 mb-2">
            &ldquo;{currentQuote.quote}&rdquo;
          </p>
          <p className="text-xs text-primary-600 font-medium">
            &mdash; {currentQuote.author}
          </p>
        </div>

        {/* Progress hint */}
        <p className="text-xs text-gray-400 mt-6">
          Please don&apos;t close this page while we process your documents
        </p>
      </div>
    </div>
  );
}

// Supported currencies from InforEuro
const currencyOptions = [
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'PLN', label: 'PLN - Polish Zloty' },
  { value: 'CZK', label: 'CZK - Czech Koruna' },
  { value: 'HUF', label: 'HUF - Hungarian Forint' },
  { value: 'RON', label: 'RON - Romanian Leu' },
  { value: 'BGN', label: 'BGN - Bulgarian Lev' },
  { value: 'SEK', label: 'SEK - Swedish Krona' },
  { value: 'DKK', label: 'DKK - Danish Krone' },
  { value: 'NOK', label: 'NOK - Norwegian Krone' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'CHF', label: 'CHF - Swiss Franc' },
  { value: 'TRY', label: 'TRY - Turkish Lira' },
  { value: 'UAH', label: 'UAH - Ukrainian Hryvnia' },
  { value: 'RSD', label: 'RSD - Serbian Dinar' },
  { value: 'MKD', label: 'MKD - Macedonian Denar' },
  { value: 'ALL', label: 'ALL - Albanian Lek' },
  { value: 'BAM', label: 'BAM - Bosnian Mark' },
  { value: 'GEL', label: 'GEL - Georgian Lari' },
  { value: 'MDL', label: 'MDL - Moldovan Leu' },
  { value: 'ISK', label: 'ISK - Icelandic Krona' },
];

// Subtle icon colors (without background circles)
const transportIconColors: Record<TransportMode, string> = {
  PLANE: 'text-blue-600',
  TRAIN: 'text-emerald-600',
  BUS: 'text-amber-600',
  CAR: 'text-purple-600',
  FERRY: 'text-cyan-600',
  OTHER: 'text-gray-500',
};

// Background colors for the container (subtle)
const transportBgColors: Record<TransportMode, string> = {
  PLANE: 'bg-blue-50 border-blue-200',
  TRAIN: 'bg-emerald-50 border-emerald-200',
  BUS: 'bg-amber-50 border-amber-200',
  CAR: 'bg-purple-50 border-purple-200',
  FERRY: 'bg-cyan-50 border-cyan-200',
  OTHER: 'bg-gray-50 border-gray-200',
};

type ActiveTab = 'reimbursement' | 'dissemination';

export default function ReimbursementPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [hasSetInitialStep, setHasSetInitialStep] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('reimbursement');
  const [aiConsolidationWarnings, setAiConsolidationWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!token) {
      navigate('/invalid-link');
    }
  }, [token, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['participant-auth'],
    queryFn: () => participantApi.authenticate(token!),
    enabled: !!token,
    retry: false,
  });

  // Set initial step based on whether travel items already exist
  // If they have items, land on Step 2 (Check Data), otherwise Step 1 (Upload)
  useEffect(() => {
    if (data && !hasSetInitialStep && data.participant.status === 'DRAFT') {
      const shouldStartOnStep2 = data.travelItems.length > 0;
      if (shouldStartOnStep2) {
        setCurrentStep(2);
      }
      setHasSetInitialStep(true);
    }
  }, [data, hasSetInitialStep]);

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
  const disseminationEnabled = data.project.disseminationEnabled;

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

          {/* Tabs (when dissemination is enabled) */}
          {disseminationEnabled && (
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setActiveTab('reimbursement')}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  activeTab === 'reimbursement'
                    ? 'bg-white text-primary-600'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                )}
              >
                <Ticket className="w-4 h-4 inline-block mr-2" />
                Reimbursement
              </button>
              <button
                onClick={() => setActiveTab('dissemination')}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                  activeTab === 'dissemination'
                    ? 'bg-white text-primary-600'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                )}
              >
                <Share2 className="w-4 h-4" />
                Dissemination
                {data.disseminationStatus && (
                  <span
                    className={clsx(
                      'w-2 h-2 rounded-full',
                      data.disseminationStatus.hasDisseminationActivity &&
                        data.disseminationStatus.hasSocialMediaPost
                        ? 'bg-green-400'
                        : 'bg-amber-400'
                    )}
                  />
                )}
              </button>
            </div>
          )}

          {/* Progress Steps (only for reimbursement tab) */}
          {!isComplete && activeTab === 'reimbursement' && (
            <div className="mt-8">
              <ProgressSteps currentStep={currentStep} />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 -mt-6">
        {/* Reopen banner - shown when organisation reopened the reimbursement */}
        {data.participant.reopenMessage && data.participant.status === 'DRAFT' && (
          <div className="mb-4 mt-2 bg-amber-50 border border-amber-300 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800">Your reimbursement was reopened</p>
                <p className="text-amber-700 text-sm mt-1">The organisation has asked you to make changes:</p>
                <div className="mt-2 bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">
                  {data.participant.reopenMessage}
                </div>
                <p className="text-amber-600 text-xs mt-2">Please make the requested changes and submit again.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dissemination' ? (
          <Card className="mt-6">
            <CardContent className="p-6">
              <DisseminationPage
                token={token}
                participantCountry={data.participant.country}
              />
            </CardContent>
          </Card>
        ) : isComplete ? (
          <CompletedView data={data} />
        ) : (
          <>
            {currentStep === 1 && (
              <Step1Upload
                data={data}
                token={token}
                onNext={() => setCurrentStep(2)}
                onAiWarnings={setAiConsolidationWarnings}
              />
            )}
            {currentStep === 2 && (
              <Step2CheckData
                data={data}
                token={token}
                onBack={() => setCurrentStep(1)}
                onNext={() => setCurrentStep(3)}
                aiWarnings={aiConsolidationWarnings}
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

        {/* GDPR Notice - always visible at bottom */}
        <p className="mt-8 mb-4 text-xs text-gray-400 text-center">
          Your data is handled according to GDPR regulations. Only the project team will have access to your information. Data will be stored for reimbursement and auditing purposes and will be removed after a reasonable period.
        </p>
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
  onAiWarnings,
}: {
  data: ParticipantAuthResponse;
  token: string;
  onNext: () => void;
  onAiWarnings: (warnings: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, filename: '' });
  const [consolidating, setConsolidating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => participantApi.uploadDocument(token, file),
    onSuccess: async () => {
      // Use refetchQueries to immediately show the uploaded file
      // (invalidateQueries only marks stale, doesn't wait for refetch)
      await queryClient.refetchQueries({ queryKey: ['participant-auth'] });
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

  // Consolidation: AI analyzes all documents together to build the journey
  const consolidatingRef = useRef(false);
  const handleContinue = async () => {
    // Guard against double-clicks / race conditions
    if (consolidatingRef.current || consolidating) {
      console.log('[UI] Consolidation already in progress, ignoring');
      return;
    }
    consolidatingRef.current = true;
    setConsolidating(true);
    try {
      const result = await participantApi.consolidateJourney(token);

      // Store AI warnings to display on the next step as persistent banners
      if (result.warnings && result.warnings.length > 0) {
        onAiWarnings(result.warnings);
      } else {
        onAiWarnings([]);
      }

      // Refresh data and move to next step
      // Use refetchQueries instead of invalidateQueries to ensure fresh data is loaded
      // before advancing to step 2 (invalidateQueries only marks as stale, doesn't wait for refetch)
      await queryClient.refetchQueries({ queryKey: ['participant-auth'] });
      onNext();
    } catch (error) {
      console.error('Consolidation error:', error);
      toast.error('Failed to analyze journey. Please try again.');
    } finally {
      setConsolidating(false);
      consolidatingRef.current = false;
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: acceptedFiles.length, filename: '' });

    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      setUploadProgress({ current: i + 1, total: acceptedFiles.length, filename: file.name });
      try {
        await uploadMutation.mutateAsync(file);
      } catch {
        // Error already handled by mutation
      }
    }

    setUploading(false);
    setUploadProgress({ current: 0, total: 0, filename: '' });
    if (acceptedFiles.length > 1) {
      toast.success(`${acceptedFiles.length} documents uploaded`);
    } else {
      toast.success('Document uploaded');
    }
  }, [uploadMutation]);

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
    HOTEL_INVOICE: 'Hotel Invoice',
    OTHER: 'Other',
  };

  const isGreenTravel = data.greenTravel || false;

  // Handler to view document using signed URL
  const handleViewDocument = async (docId: string) => {
    try {
      const result = await participantApi.getDocumentUrl(token, docId);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to get document URL:', error);
      toast.error('Failed to open document');
    }
  };

  return (
    <>
      {/* Show loading screen with Erasmus quotes during consolidation */}
      {consolidating && <ConsolidationLoading />}

      <Card>
        <CardHeader>
          <h2 className="text-xl font-bold text-gray-900">Upload Your Travel Documents</h2>
        <p className="text-gray-500 mt-1">
          {isGreenTravel ? (
            <>Upload all your travel tickets, invoices, boarding passes, and <strong>hotel invoices</strong> (for green travel). For best results, upload everything at once so our AI can understand your complete journey and link related documents together.</>
          ) : (
            'Upload all your travel tickets, invoices, and boarding passes. For best results, upload everything at once so our AI can understand your complete journey and link related documents together.'
          )}
        </p>
        {isGreenTravel && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-sm text-emerald-700">
              <strong>Green Travel:</strong> Since you're traveling by train/bus (eco-friendly), you can also upload hotel invoices for overnight stays that were needed due to the longer travel time.
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={clsx('dropzone', isDragActive && 'active')}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-primary-400 animate-spin mx-auto mb-4" />
              {uploadProgress.total > 1 ? (
                <>
                  <p className="text-gray-600 font-medium">
                    Uploading {uploadProgress.current} of {uploadProgress.total}
                  </p>
                  <p className="text-sm text-gray-500 mt-1 truncate max-w-xs mx-auto">
                    {uploadProgress.filename}
                  </p>
                  <div className="w-48 h-2 bg-gray-200 rounded-full mx-auto mt-3">
                    <div
                      className="h-2 bg-primary-500 rounded-full transition-all duration-300"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-gray-600">Uploading document...</p>
              )}
            </div>
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
              {data.documents.map((doc) => {
                return (
                  <div key={doc.id} className="p-4 rounded-xl bg-gray-50">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 bg-white border-gray-200">
                        <FileText className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate text-sm">
                          {doc.renamedFilename}
                        </p>
                        <p className="text-xs text-gray-500">
                          {docTypeLabels[doc.documentType] || 'Document'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-3">
                      <button
                        onClick={() => handleViewDocument(doc.id)}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(doc.id)}
                        className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Next Button */}
        <div className="mt-8 flex justify-end">
          <Button
            onClick={() => setShowConfirmModal(true)}
            disabled={data.documents.length === 0 || consolidating}
            loading={consolidating}
          >
            {consolidating ? 'Analyzing your journey...' : 'Continue to Check Data'}
            {!consolidating && <ChevronRight className="w-4 h-4 ml-2" />}
          </Button>
        </div>

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Before you continue</h3>
              <p className="text-sm text-gray-600 mb-6">
                Did you upload all documents you have? If you also have documents on another device, it's better to upload them first before continuing so the AI has the best possible understanding of your whole journey.
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowConfirmModal(false)}>
                  Go back
                </Button>
                <Button onClick={() => { setShowConfirmModal(false); handleContinue(); }}>
                  Yes, continue
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}

// Warning type for the persistent warnings system
interface PersistentWarning {
  id: string;
  type: 'error' | 'warning' | 'info' | 'notification' | 'success';
  message: string;
  dismissible: boolean;
}

function Step2CheckData({
  data,
  token,
  onBack,
  onNext,
  aiWarnings = [],
}: {
  data: ParticipantAuthResponse;
  token: string;
  onBack: () => void;
  onNext: () => void;
  aiWarnings?: string[];
}) {
  const queryClient = useQueryClient();
  const [showAddTravelModal, setShowAddTravelModal] = useState(false);
  const [showBoardingPassUpload, setShowBoardingPassUpload] = useState(false);
  const [participantNote, setParticipantNote] = useState(data.participant.participantNote || '');
  const [noteEdited, setNoteEdited] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [missingBoardingPassItem, setMissingBoardingPassItem] = useState<TravelItem | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<TravelItem | null>(null);
  const [deleteWithDocuments, setDeleteWithDocuments] = useState(false);
  const [showReuploadWarning, setShowReuploadWarning] = useState(false);

  // Calculate unlinked documents (uploaded but not connected to any travel item)
  // Exclude FLIGHT_BOARDING_PASS since they're associated with flights by type, not direct link
  // Include both primary documentId and additionalDocumentIds in the linked set
  const linkedDocIds = useMemo(() => {
    const ids = new Set<string>();
    data.travelItems.forEach(t => {
      if (t.documentId) ids.add(t.documentId);
      if (t.additionalDocumentIds) {
        try {
          const additionalIds = JSON.parse(t.additionalDocumentIds) as string[];
          additionalIds.forEach(id => ids.add(id));
        } catch {
          // Ignore invalid JSON
        }
      }
    });
    return ids;
  }, [data.travelItems]);
  const unlinkedDocs = data.documents.filter(d =>
    !linkedDocIds.has(d.id) && d.documentType !== 'FLIGHT_BOARDING_PASS'
  );
  const hasUnlinkedDocs = unlinkedDocs.length > 0;

  const noteMutation = useMutation({
    mutationFn: (note: string) => participantApi.updateNote(token, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      setNoteEdited(false);
      toast.success('Note saved');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TravelItem> }) =>
      participantApi.updateTravelItem(token, id, updates),
    // Optimistic update for instant UI feedback
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['participant-auth'] });
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['participant-auth']);
      // Optimistically update the cache
      queryClient.setQueryData(['participant-auth'], (old: typeof data | undefined) => {
        if (!old) return old;
        return {
          ...old,
          travelItems: old.travelItems.map((item: TravelItem) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        };
      });
      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // Revert to previous data on error
      if (context?.previousData) {
        queryClient.setQueryData(['participant-auth'], context.previousData);
      }
      toast.error('Failed to update travel item');
    },
    // No onSettled refetch - optimistic update is sufficient
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, deleteDocuments }: { id: string; deleteDocuments: boolean }) =>
      participantApi.deleteTravelItem(token, id, deleteDocuments),
    // Optimistic delete for instant UI feedback
    onMutate: async ({ id, deleteDocuments: shouldDeleteDocs }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['participant-auth'] });
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['participant-auth']);

      // Get the item to find linked document IDs
      const itemToDelete = data.travelItems.find(t => t.id === id);
      const docIdsToRemove: string[] = [];
      if (shouldDeleteDocs && itemToDelete) {
        if (itemToDelete.documentId) docIdsToRemove.push(itemToDelete.documentId);
        if (itemToDelete.additionalDocumentIds) {
          try {
            const additionalIds = JSON.parse(itemToDelete.additionalDocumentIds) as string[];
            docIdsToRemove.push(...additionalIds);
          } catch { /* ignore */ }
        }
      }

      // Optimistically remove from the cache
      queryClient.setQueryData(['participant-auth'], (old: typeof data | undefined) => {
        if (!old) return old;

        // Also optimistically update reimbursement summary
        const deletedItem = old.travelItems.find((item: TravelItem) => item.id === id);
        const deletedAmount = (!deletedItem?.excludedFromReimbursement && deletedItem?.amountEur) ? deletedItem.amountEur : 0;
        const newTotalEur = (old.reimbursementSummary?.totalEur || 0) - deletedAmount;
        const maxAllowed = old.reimbursementSummary?.maxReimbursementAllowed || 0;
        const newAmountToReimburse = maxAllowed > 0 ? Math.min(newTotalEur, maxAllowed) : newTotalEur;

        return {
          ...old,
          travelItems: old.travelItems.filter((item: TravelItem) => item.id !== id),
          // Also remove documents if requested
          documents: shouldDeleteDocs
            ? old.documents.filter((doc: Document) => !docIdsToRemove.includes(doc.id))
            : old.documents,
          reimbursementSummary: old.reimbursementSummary ? { ...old.reimbursementSummary, totalEur: newTotalEur, amountToReimburse: newAmountToReimburse } : null,
        };
      });
      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // Revert to previous data on error
      if (context?.previousData) {
        queryClient.setQueryData(['participant-auth'], context.previousData);
      }
      toast.error('Failed to remove travel item');
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.deleteDocuments
        ? 'Travel item and linked documents removed'
        : 'Travel item removed');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
    },
  });

  const toggleCheckedMutation = useMutation({
    mutationFn: (id: string) => {
      console.log('[Mutation] toggleCheckedMutation called with id:', id, 'token:', token ? 'present' : 'missing');
      return participantApi.toggleTravelItemChecked(token, id);
    },
    // Optimistic update for instant UI feedback
    onMutate: async (id) => {
      console.log('[Mutation] onMutate called for id:', id);
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['participant-auth'] });
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['participant-auth']) as ParticipantAuthResponse | undefined;
      // Optimistically toggle the checked state
      queryClient.setQueryData(['participant-auth'], (old: ParticipantAuthResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          travelItems: old.travelItems.map((item: TravelItem) =>
            item.id === id ? { ...item, checked: !item.checked } : item
          ),
        };
      });
      return { previousData };
    },
    onError: (_err, _id, context) => {
      // Revert to previous data on error
      if (context?.previousData) {
        queryClient.setQueryData(['participant-auth'], context.previousData);
      }
      toast.error('Failed to update confirmation status');
    },
    onSuccess: (updatedItem) => {
      // Update the cache with the server response to ensure consistency
      queryClient.setQueryData(['participant-auth'], (old: ParticipantAuthResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          travelItems: old.travelItems.map((item: TravelItem) =>
            item.id === updatedItem.id ? { ...item, checked: updatedItem.checked } : item
          ),
        };
      });
    },
  });

  const unlinkDocumentMutation = useMutation({
    mutationFn: ({ travelItemId, documentId }: { travelItemId: string; documentId: string }) =>
      participantApi.unlinkDocumentFromTravelItem(token, travelItemId, documentId),
    // Optimistic update for instant UI feedback
    onMutate: async ({ travelItemId, documentId }) => {
      await queryClient.cancelQueries({ queryKey: ['participant-auth'] });
      const previousData = queryClient.getQueryData(['participant-auth']);
      // Optimistically remove the document link from the travel item
      queryClient.setQueryData(['participant-auth'], (old: typeof data | undefined) => {
        if (!old) return old;
        return {
          ...old,
          travelItems: old.travelItems.map((item: TravelItem) => {
            if (item.id !== travelItemId) return item;
            // Check if it's the primary document
            if (item.documentId === documentId) {
              return { ...item, documentId: null };
            }
            // Check if it's an additional document
            if (item.additionalDocumentIds) {
              try {
                const ids = JSON.parse(item.additionalDocumentIds) as string[];
                const newIds = ids.filter(id => id !== documentId);
                return {
                  ...item,
                  additionalDocumentIds: newIds.length > 0 ? JSON.stringify(newIds) : null,
                };
              } catch {
                return item;
              }
            }
            return item;
          }),
        };
      });
      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['participant-auth'], context.previousData);
      }
      toast.error('Failed to unlink document');
    },
    onSuccess: () => {
      toast.success('Document unlinked');
    },
  });

  // Generate persistent warnings based on data analysis
  const warnings = useMemo((): PersistentWarning[] => {
    const w: PersistentWarning[] = [];

    // Add confirmation guidance notification if there are unconfirmed items
    const unconfirmedCount = data.travelItems.filter(item => !item.checked).length;
    if (data.travelItems.length > 0 && unconfirmedCount > 0) {
      w.push({
        id: 'confirmation-guidance',
        type: 'success',
        message: `Please review each travel item below and click "Confirm" when the information is correct. (${data.travelItems.length - unconfirmedCount}/${data.travelItems.length} confirmed)`,
        dismissible: true,
      });
    }

    // Add AI consolidation warnings as notifications (friendlier style)
    // Filter out warnings meant for reviewers/organisation, not for participants
    aiWarnings
      .filter(warning => {
        const lower = warning.toLowerCase();
        // Skip round-trip warnings (shown at travel item level)
        if (lower.includes('round-trip') || lower.includes('round trip')) return false;
        // Skip reviewer/auditor-specific messages
        if (lower.includes('reviewer') || lower.includes('auditor') || lower.includes('verify')) return false;
        // Skip conflicting totals (internal detail for AI review)
        if (lower.includes('conflicting total')) return false;
        return true;
      })
      .forEach((warning, index) => {
        w.push({
          id: `ai-warning-${index}`,
          type: 'notification',
          message: warning,
          dismissible: true,
        });
      });

    // Check for missing boarding passes for flights
    const hasFlights = data.travelItems.some(t => t.modeOfTransport === 'PLANE');
    const hasBoardingPass = data.documents.some(d => d.documentType === 'FLIGHT_BOARDING_PASS');
    if (hasFlights && !hasBoardingPass) {
      w.push({
        id: 'missing-boarding-pass',
        type: 'warning',
        message: 'You have flight travel items but no boarding pass uploaded. Please upload your boarding pass(es) or add a declaration.',
        dismissible: true,
      });
    }

    // Check for travel items without documents
    const itemsWithoutDocs = data.travelItems.filter(t => !t.documentId);
    if (itemsWithoutDocs.length > 0) {
      w.push({
        id: 'items-without-docs',
        type: 'warning',
        message: `${itemsWithoutDocs.length} travel item(s) don't have a corresponding document. Please upload supporting documents.`,
        dismissible: true,
      });
    }

    // Check if AI-detected home country differs from registered country
    // This uses AI reasoning based on travel patterns (return flights, round-trip origins, etc.)
    if (data.participant.detectedHomeCountry &&
        data.participant.detectedHomeCountry.toLowerCase() !== data.participant.country?.toLowerCase()) {
      w.push({
        id: 'country-mismatch',
        type: 'warning',
        message: `Based on your travel documents, it appears you traveled from ${data.participant.detectedHomeCountry}, but your registered country is ${data.participant.country}. ${data.participant.homeCountryReasoning ? `(${data.participant.homeCountryReasoning})` : ''} Please verify this is correct.`,
        dismissible: true,
      });
    }

    // Check for non-EUR currencies without purchase date (skip amountIncludedInRoundTrip items)
    const itemsNeedingPurchaseDate = data.travelItems.filter(
      t => t.currencyOriginal !== 'EUR' && !t.purchaseDate && !t.amountIncludedInRoundTrip
    );
    if (itemsNeedingPurchaseDate.length > 0) {
      w.push({
        id: 'missing-purchase-date',
        type: 'warning',
        message: `${itemsNeedingPurchaseDate.length} travel item(s) with non-EUR currency need a purchase date for exchange rate conversion.`,
        dismissible: true,
      });
    }

    // Notify about auto-filled purchase dates
    const autoFilledItems = data.travelItems.filter(t => t.purchaseDateAutoFilled);
    if (autoFilledItems.length > 0) {
      w.push({
        id: 'auto-filled-purchase-date',
        type: 'info',
        message: `The purchase date for ${autoFilledItems.length} item(s) was automatically set to the flight date because no purchase date was found. You can change this manually if the actual purchase date was different.`,
        dismissible: true,
      });
    }

    return w;
  }, [data, aiWarnings]);

  // Filter out dismissed warnings
  const visibleWarnings = warnings.filter(w => !dismissedWarnings.has(w.id));

  const dismissWarning = (id: string) => {
    setDismissedWarnings(prev => new Set([...prev, id]));
  };

  // Auto-dismiss AI warnings when issues are fixed
  useEffect(() => {
    // Check if there are any "Unknown" locations or 0 amounts left
    const hasUnknownLocations = data.travelItems.some(
      t => t.fromLocation?.toLowerCase() === 'unknown' || t.toLocation?.toLowerCase() === 'unknown'
    );
    const hasZeroAmounts = data.travelItems.some(t => t.amountOriginal === 0);

    // Auto-dismiss AI warnings about unknown locations if all are filled
    if (!hasUnknownLocations) {
      aiWarnings.forEach((warning, index) => {
        const warningLower = warning.toLowerCase();
        if (warningLower.includes('unknown') || warningLower.includes('location') || warningLower.includes('could not determine')) {
          dismissWarning(`ai-warning-${index}`);
        }
      });
    }

    // Auto-dismiss AI warnings about amounts if all are filled
    if (!hasZeroAmounts) {
      aiWarnings.forEach((warning, index) => {
        const warningLower = warning.toLowerCase();
        if (warningLower.includes('amount') || warningLower.includes('price') || warningLower.includes('€0') || warningLower.includes('0 eur')) {
          dismissWarning(`ai-warning-${index}`);
        }
      });
    }
  }, [data.travelItems, aiWarnings]);

  return (
    <div className="space-y-6">
      {/* Persistent Warnings Section */}
      {visibleWarnings.length > 0 && (
        <div className="space-y-3">
          {visibleWarnings.map((warning) => {
            // Use different icons based on type
            const IconComponent = warning.type === 'success' ? CheckCircle
              : warning.type === 'notification' ? Info
              : AlertTriangle;

            return (
              <div
                key={warning.id}
                className={clsx(
                  'p-4 rounded-xl flex items-start gap-3 border',
                  warning.type === 'error' && 'bg-red-50 border-red-200',
                  warning.type === 'warning' && 'bg-amber-50 border-amber-200',
                  warning.type === 'info' && 'bg-blue-50 border-blue-200',
                  warning.type === 'notification' && 'bg-indigo-50 border-indigo-200',
                  warning.type === 'success' && 'bg-emerald-50 border-emerald-200'
                )}
              >
                <IconComponent
                  className={clsx(
                    'w-5 h-5 flex-shrink-0 mt-0.5',
                    warning.type === 'error' && 'text-red-500',
                    warning.type === 'warning' && 'text-amber-500',
                    warning.type === 'info' && 'text-blue-500',
                    warning.type === 'notification' && 'text-indigo-500',
                    warning.type === 'success' && 'text-emerald-500'
                  )}
                />
                <div className="flex-1">
                  <p
                    className={clsx(
                      'text-sm font-medium',
                      warning.type === 'error' && 'text-red-800',
                      warning.type === 'warning' && 'text-amber-800',
                      warning.type === 'info' && 'text-blue-800',
                      warning.type === 'notification' && 'text-indigo-800',
                      warning.type === 'success' && 'text-emerald-800'
                    )}
                  >
                    {warning.message}
                  </p>
                </div>
                {warning.dismissible && (
                  <button
                    onClick={() => dismissWarning(warning.id)}
                    className={clsx(
                      'p-1 rounded-full hover:bg-white/50 transition-colors',
                      warning.type === 'error' && 'text-red-400 hover:text-red-600',
                      warning.type === 'warning' && 'text-amber-400 hover:text-amber-600',
                      warning.type === 'info' && 'text-blue-400 hover:text-blue-600',
                      warning.type === 'notification' && 'text-indigo-400 hover:text-indigo-600',
                      warning.type === 'success' && 'text-emerald-400 hover:text-emerald-600'
                    )}
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Journey Visualization */}
      {data.travelItems.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Your Journey</h3>
          </CardHeader>
          <CardContent>
            <JourneyVisualization
              items={data.travelItems}
              projectStartDate={data.project.startDate}
              projectEndDate={data.project.endDate}
            />
          </CardContent>
        </Card>
      )}

      {/* Main Data Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Check Your Travel Data</h2>
              <p className="text-gray-500 mt-1">
                We've extracted the following information from your documents. Please verify and correct if needed.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => setShowAddTravelModal(true)}
              className={hasUnlinkedDocs ? "ring-2 ring-amber-400 ring-offset-2 animate-pulse" : ""}
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Travel or Link Documents
              {hasUnlinkedDocs && (
                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                  {unlinkedDocs.length}
                </span>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Eligibility guidance */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Important:</strong> Please only add travel items that are eligible for Erasmus+ reimbursement. This includes travel from your home country to the project location and back, within the approved project and travel dates. Do not add trips to other destinations, extra days, or personal travel. If a travel item is not eligible for reimbursement, it should not be added here.
            </p>
          </div>

          {data.travelItems.length > 0 ? (
            <div className="space-y-6">
              {data.travelItems.map((item) => (
                <TravelItemCard
                  key={item.id}
                  item={item}
                  documents={data.documents}
                  declarationsOfTravel={data.declarationsOfTravel || []}
                  token={token}
                  onUpdate={(updates) =>
                    updateMutation.mutate({ id: item.id, updates })
                  }
                  onDelete={() => {
                    setDeleteConfirmItem(item);
                    setDeleteWithDocuments(false);
                  }}
                  onToggleChecked={() => toggleCheckedMutation.mutate(item.id)}
                  onUploadBoardingPass={() => setShowBoardingPassUpload(true)}
                  onViewDocument={setViewingDocument}
                  onUnlinkDocument={(docId) =>
                    unlinkDocumentMutation.mutate({ travelItemId: item.id, documentId: docId })
                  }
                  onMissingBoardingPass={() => setMissingBoardingPassItem(item)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">
                No travel items detected. Please upload your travel documents or add them manually.
              </p>
              <Button onClick={() => setShowAddTravelModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Travel Manually
              </Button>
            </div>
          )}

          {/* Participant Note */}
          <div className="mt-8 p-4 border border-blue-200 bg-blue-50 rounded-xl">
            <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Add a Note (Optional)
            </h4>
            <p className="text-sm text-blue-700 mb-3">
              If you have any special circumstances to explain (e.g., missed a bus and had to rebook, lost a ticket,
              had to take an alternative route), please add a note here. The project team will see this.
            </p>
            <textarea
              className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Example: I missed the 08:00 bus due to train delay, so I had to book the 09:30 bus. Only submitting the second ticket as that's what I actually used."
              value={participantNote}
              onChange={(e) => {
                setParticipantNote(e.target.value);
                setNoteEdited(true);
              }}
              onBlur={() => {
                if (noteEdited) {
                  noteMutation.mutate(participantNote);
                }
              }}
            />
            {noteMutation.isPending && (
              <p className="mt-1 text-xs text-blue-500">Saving...</p>
            )}
          </div>

          {/* Summary with Itemized Breakdown */}
          <div className="mt-8 p-6 bg-gray-50 rounded-2xl">
            <h4 className="font-semibold text-gray-900 mb-4">Cost Breakdown</h4>

            {/* Itemized List */}
            <div className="space-y-2 mb-4">
              {data.travelItems.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between text-sm"
                >
                  <span className="text-gray-600">
                    {item.fromLocation} → {item.toLocation}
                    <span className="text-gray-400 ml-2">({item.modeOfTransport.toLowerCase()})</span>
                    {item.comment && <span className="text-gray-400 ml-1">*</span>}
                  </span>
                  <span className="font-medium text-gray-900">
                    {item.amountIncludedInRoundTrip ? (
                      <span className="text-gray-400 text-xs italic">— (incl. in outbound)</span>
                    ) : (
                      <>
                        {formatCurrency((item.amountEur || 0) + (item.luggageAmountEur || 0))}
                        {item.luggageAmountEur ? <span className="text-xs text-sky-600 ml-1">(incl. luggage)</span> : null}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-300 my-4" />

            {/* Total with max reimbursement inline */}
            {(() => {
              const total = data.travelItems.reduce((sum, item) => sum + (item.amountEur || 0) + (item.luggageAmountEur || 0), 0);

              return (
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-3">
                    <div>
                      <p className="text-sm text-gray-500">Total Travel Costs</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(total)}
                      </p>
                    </div>
                    {data.maxReimbursementForCountry !== undefined && data.maxReimbursementForCountry !== null && (
                      <span className="text-sm text-blue-600 font-medium">
                        (max: {formatCurrency(data.maxReimbursementForCountry)})
                      </span>
                    )}
                  </div>
                  {/* Show actual amount to receive if over limit */}
                  {data.maxReimbursementForCountry && total > data.maxReimbursementForCountry && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500">You will receive</p>
                      <p className="text-lg font-bold text-emerald-600">
                        {formatCurrency(data.maxReimbursementForCountry)}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
            <p className="text-xs text-gray-400 mt-3">
              Final reimbursement is subject to project rules and cannot exceed the maximum allowed for your country.
            </p>
          </div>

          {/* Navigation */}
          <div className="mt-8">
            {/* Check if all travel items are confirmed */}
            {data.travelItems.length > 0 && !data.travelItems.every(item => item.checked) && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-amber-700">
                  Please check all travel items to confirm they are correct before continuing.
                  ({data.travelItems.filter(item => item.checked).length} of {data.travelItems.length} confirmed)
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <Button
                variant="secondary"
                onClick={() => {
                  // Show warning if there are existing travel items
                  if (data.travelItems.length > 0) {
                    setShowReuploadWarning(true);
                  } else {
                    onBack();
                  }
                }}
              >
                Back to Upload
              </Button>
              <Button
                onClick={() => {
                  if (data.travelItems.length > 0 && !data.travelItems.every(item => item.checked)) {
                    toast.error('Please confirm all travel items by checking the checkbox on each one.');
                    return;
                  }
                  onNext();
                }}
                disabled={data.travelItems.length === 0}
              >
                Continue to Confirm
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Travel Modal */}
      <AddTravelModal
        isOpen={showAddTravelModal}
        onClose={() => setShowAddTravelModal(false)}
        token={token}
        documents={data.documents}
        travelItems={data.travelItems}
        onViewDocument={setViewingDocument}
        carRatePerKm={data.project.carRatePerKm || 0.22}
      />

      {/* Boarding Pass Upload Modal */}
      <BoardingPassUploadModal
        isOpen={showBoardingPassUpload}
        onClose={() => setShowBoardingPassUpload(false)}
        token={token}
      />

      {/* Document View Modal */}
      <DocumentViewModal
        document={viewingDocument}
        token={token}
        onClose={() => setViewingDocument(null)}
      />

      {/* Missing Boarding Pass Modal */}
      {missingBoardingPassItem && (
        <MissingBoardingPassModal
          isOpen={true}
          onClose={() => setMissingBoardingPassItem(null)}
          token={token}
          travelItem={missingBoardingPassItem}
          documents={data.documents}
          participantName={`${data.participant.firstName} ${data.participant.lastName}`}
          participantCountry={data.participant.country}
          organisation={data.project.organisation}
          onViewDocument={setViewingDocument}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Travel Item?</h3>
            </div>

            <p className="text-gray-600 mb-4">
              Are you sure you want to delete this travel item?
            </p>

            {/* Show travel item details */}
            <div className="p-3 bg-gray-50 rounded-lg mb-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{deleteConfirmItem.fromLocation}</span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <span className="font-medium">{deleteConfirmItem.toLocation}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {deleteConfirmItem.modeOfTransport} • {new Date(deleteConfirmItem.departureDate).toLocaleDateString()}
              </p>
            </div>

            {/* Show linked documents option if there are any */}
            {(() => {
              const linkedDocs: Document[] = [];
              if (deleteConfirmItem.documentId) {
                const doc = data.documents.find(d => d.id === deleteConfirmItem.documentId);
                if (doc) linkedDocs.push(doc);
              }
              if (deleteConfirmItem.additionalDocumentIds) {
                try {
                  const additionalIds = JSON.parse(deleteConfirmItem.additionalDocumentIds) as string[];
                  additionalIds.forEach(id => {
                    const doc = data.documents.find(d => d.id === id);
                    if (doc) linkedDocs.push(doc);
                  });
                } catch { /* ignore */ }
              }

              if (linkedDocs.length > 0) {
                return (
                  <div className="mb-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteWithDocuments}
                        onChange={(e) => setDeleteWithDocuments(e.target.checked)}
                        className="mt-1 rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">
                          Also delete linked document{linkedDocs.length > 1 ? 's' : ''}
                        </span>
                        <div className="mt-1 space-y-1">
                          {linkedDocs.map(doc => (
                            <div key={doc.id} className="flex items-center gap-2 text-xs text-gray-500">
                              <FileText className="w-3 h-3" />
                              <span className="truncate">{doc.renamedFilename}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </label>
                  </div>
                );
              }
              return null;
            })()}

            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setDeleteConfirmItem(null);
                  setDeleteWithDocuments(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  deleteMutation.mutate({
                    id: deleteConfirmItem.id,
                    deleteDocuments: deleteWithDocuments,
                  });
                  setDeleteConfirmItem(null);
                  setDeleteWithDocuments(false);
                }}
                loading={deleteMutation.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Re-upload Warning Modal */}
      {showReuploadWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Re-upload Documents?</h3>
            </div>

            <p className="text-gray-600 mb-4">
              Going back to the upload page will allow you to upload additional documents.
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> This will restart the AI analysis and may modify your current travel items.
                If you just want to add a new travel item manually, you can do that here using the "Add Travel" button.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setShowReuploadWarning(false)}
              >
                Stay Here
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowReuploadWarning(false);
                  onBack();
                }}
              >
                Go to Upload
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Journey Visualization Component - Clean transport-focused design
function JourneyVisualization({ items, projectStartDate, projectEndDate }: {
  items: TravelItem[];
  projectStartDate?: string;
  projectEndDate?: string;
}) {
  // Create visual journey items - expand round-trips into two entries
  interface VisualJourneyItem {
    id: string;
    modeOfTransport: TravelItem['modeOfTransport'];
    fromLocation: string;
    toLocation: string;
    departureDate: string;
    isReturnLeg?: boolean;  // True if this is the return portion of a round-trip
    originalItemId: string; // Reference to the actual travel item
  }

  const visualItems: VisualJourneyItem[] = [];

  items.forEach(item => {
    // Add the outbound/original leg
    visualItems.push({
      id: item.id,
      modeOfTransport: item.modeOfTransport,
      fromLocation: item.fromLocation,
      toLocation: item.toLocation,
      departureDate: item.departureDate,
      isReturnLeg: false,
      originalItemId: item.id,
    });

    // If it's a round-trip, add a virtual return leg
    if (item.isRoundTrip) {
      // For return date, use project end date + 1 day, or estimate from departure
      let returnDate: string;
      if (projectEndDate) {
        const endDate = new Date(projectEndDate);
        endDate.setDate(endDate.getDate() + 1);
        returnDate = endDate.toISOString();
      } else {
        // Fallback: assume return is 7 days after departure
        const depDate = new Date(item.departureDate);
        depDate.setDate(depDate.getDate() + 7);
        returnDate = depDate.toISOString();
      }

      visualItems.push({
        id: `${item.id}-return`,
        modeOfTransport: item.modeOfTransport,
        fromLocation: item.toLocation,  // Swap locations for return
        toLocation: item.fromLocation,
        departureDate: returnDate,
        isReturnLeg: true,
        originalItemId: item.id,
      });
    }
  });

  // Sort items by departure date
  const sortedItems = [...visualItems].sort((a, b) =>
    new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime()
  );

  if (sortedItems.length === 0) return null;

  // Determine midpoint date to separate outbound vs return
  // Use project dates if available, otherwise use median of travel dates
  let midpointDate: Date;
  if (projectStartDate && projectEndDate) {
    const start = new Date(projectStartDate);
    const end = new Date(projectEndDate);
    midpointDate = new Date((start.getTime() + end.getTime()) / 2);
  } else {
    const dates = sortedItems.map(i => new Date(i.departureDate).getTime());
    midpointDate = new Date(dates[Math.floor(dates.length / 2)]);
  }

  // Split into outbound (before/during midpoint) and return (after midpoint)
  const outboundItems = sortedItems.filter(item =>
    new Date(item.departureDate) <= midpointDate
  );
  const returnItems = sortedItems.filter(item =>
    new Date(item.departureDate) > midpointDate
  );

  const renderJourneySection = (sectionItems: VisualJourneyItem[], label: string, isReturn: boolean) => {
    if (sectionItems.length === 0) return null;

    return (
      <div className={clsx("flex-1", isReturn && "border-l-2 border-gray-200 pl-4")}>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{label}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {sectionItems.map((item, index) => {
            const Icon = transportIcons[item.modeOfTransport];
            const iconColor = transportIconColors[item.modeOfTransport];
            const bgColor = transportBgColors[item.modeOfTransport];
            const isLast = index === sectionItems.length - 1;

            return (
              <div key={item.id} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  {/* Subtle icon container - no heavy colored circle */}
                  <div className={clsx(
                    'w-10 h-10 rounded-xl flex items-center justify-center border transition-all hover:scale-105',
                    bgColor,
                    item.isReturnLeg && 'ring-2 ring-purple-300 ring-offset-1'  // Highlight return legs
                  )}>
                    <Icon className={clsx('w-5 h-5', iconColor)} />
                  </div>
                  <p className="text-xs text-gray-600 mt-1 font-medium max-w-[70px] truncate text-center">
                    {item.fromLocation}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {item.isReturnLeg ? 'Return' : formatDate(item.departureDate)}
                  </p>
                </div>

                {/* Connector line with arrow */}
                <div className="flex flex-col items-center px-1">
                  <div className="flex items-center">
                    <div className="w-6 h-0.5 bg-gray-300" />
                    <div className="w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-gray-300" />
                  </div>
                </div>

                {isLast && (
                  <div className="flex flex-col items-center">
                    {/* Destination marker - subtle styling */}
                    <div className={clsx(
                      'w-10 h-10 rounded-xl flex items-center justify-center border transition-all',
                      isReturn
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                        : 'bg-gray-50 border-gray-300 text-gray-500'
                    )}>
                      {isReturn ? <CheckCircle className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                    </div>
                    <p className="text-xs text-gray-600 mt-1 font-medium max-w-[70px] truncate text-center">
                      {item.toLocation}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {item.isReturnLeg ? 'Return' : formatDate(item.departureDate)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-6">
      {renderJourneySection(outboundItems, "Outbound Journey", false)}
      {renderJourneySection(returnItems, "Return Journey", true)}
    </div>
  );
}

// Travel Item Card with boarding pass status
function TravelItemCard({
  item,
  documents,
  declarationsOfTravel,
  token,
  onUpdate,
  onDelete,
  onToggleChecked,
  onUploadBoardingPass,
  onViewDocument,
  onUnlinkDocument,
  onMissingBoardingPass,
}: {
  item: TravelItem;
  documents: Document[];
  declarationsOfTravel: DeclarationOfTravel[];
  token: string;
  onUpdate: (updates: Partial<TravelItem>) => void;
  onDelete: () => void;
  onToggleChecked: () => void;
  onUploadBoardingPass: () => void;
  onViewDocument: (doc: Document) => void;
  onUnlinkDocument: (docId: string) => void;
  onMissingBoardingPass: () => void;
}) {
  const Icon = transportIcons[item.modeOfTransport];
  const isPlane = item.modeOfTransport === 'PLANE';
  const hasDeclaration = declarationsOfTravel.some(dec => dec.travelItemId === item.id);
  const linkedDocument = documents.find(d => d.id === item.documentId);
  const isNonEurCurrency = item.currencyOriginal !== 'EUR';

  // Get additional linked documents
  const additionalDocuments = useMemo(() => {
    if (!item.additionalDocumentIds) return [];
    try {
      const ids = JSON.parse(item.additionalDocumentIds) as string[];
      return documents.filter(d => ids.includes(d.id));
    } catch {
      return [];
    }
  }, [item.additionalDocumentIds, documents]);

  // All linked documents (primary + additional)
  const allLinkedDocuments = useMemo(() => {
    const docs: Document[] = [];
    if (linkedDocument) docs.push(linkedDocument);
    docs.push(...additionalDocuments);
    return docs;
  }, [linkedDocument, additionalDocuments]);

  // Check if THIS travel item has a boarding pass linked (not just any boarding pass in all documents)
  const hasBoardingPass = useMemo(() => {
    return allLinkedDocuments.some(d => d.documentType === 'FLIGHT_BOARDING_PASS');
  }, [allLinkedDocuments]);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionInfo, setConversionInfo] = useState<{ rate: number; month: number; year: number } | null>(null);

  // Local state for text inputs - prevents re-renders on every keystroke
  const [localFrom, setLocalFrom] = useState(item.fromLocation);
  const [localTo, setLocalTo] = useState(item.toLocation);
  const [localFlightNumber, setLocalFlightNumber] = useState(item.flightNumber || '');
  const [localBookingRef, setLocalBookingRef] = useState(item.bookingReference || '');
  const [localCompanyName, setLocalCompanyName] = useState(item.companyName || '');
  const [localAmount, setLocalAmount] = useState(String(item.amountOriginal || ''));
  const [localDistanceKm, setLocalDistanceKm] = useState(String(item.distanceKm || ''));
  const [localParticipantPortion, setLocalParticipantPortion] = useState(String(item.participantPortion || ''));

  // Sync local state when item changes from external source
  useEffect(() => {
    setLocalFrom(item.fromLocation);
    setLocalTo(item.toLocation);
    setLocalFlightNumber(item.flightNumber || '');
    setLocalBookingRef(item.bookingReference || '');
    setLocalCompanyName(item.companyName || '');
    setLocalAmount(String(item.amountOriginal || ''));
    setLocalDistanceKm(String(item.distanceKm || ''));
    setLocalParticipantPortion(String(item.participantPortion || ''));
  }, [item.id]); // Only sync when switching to a different item

  // Helper to check if a value needs attention (unknown or empty)
  const needsAttention = (value: string) => {
    const v = value?.toLowerCase().trim() || '';
    return v === 'unknown' || v === '' || v === 'n/a' || v === '-';
  };

  // Check if amount needs attention (0 or very low, but NOT if it's part of a round-trip where amount is on the other leg)
  const amountNeedsAttention = (item.amountOriginal === 0 || item.amountOriginal === null) && !item.amountIncludedInRoundTrip;

  // Highlight style for fields that need attention
  const attentionInputClass = 'ring-2 ring-amber-400 bg-amber-50';

  // Auto-convert when currency, amount, or purchase date changes for non-EUR currencies
  const handleCurrencyConversion = useCallback(async () => {
    if (!isNonEurCurrency || !item.amountOriginal) return;

    // Purchase date is required for non-EUR
    if (!item.purchaseDate) return;

    setIsConverting(true);
    try {
      const result = await participantApi.convertCurrency(
        token,
        item.amountOriginal,
        item.currencyOriginal,
        item.purchaseDate
      );
      setConversionInfo({
        rate: result.rateToEur,
        month: result.month,
        year: result.year,
      });
      // Update the EUR amount
      if (result.eurAmount !== item.amountEur) {
        onUpdate({ amountEur: result.eurAmount });
      }
    } catch (error) {
      console.error('Currency conversion error:', error);
      toast.error('Failed to convert currency');
    }
    setIsConverting(false);
  }, [item.currencyOriginal, item.amountOriginal, item.purchaseDate, isNonEurCurrency, token, onUpdate, item.amountEur]);

  // Track previous conversion inputs to avoid re-converting on re-mount when data hasn't changed
  const lastConversionKey = useRef('');
  const conversionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced conversion: only triggers after 5 seconds of inactivity or on blur
  const triggerConversionIfNeeded = useCallback(() => {
    if (!isNonEurCurrency || !item.purchaseDate || !item.amountOriginal) return;

    const conversionKey = `${item.currencyOriginal}|${item.amountOriginal}|${item.purchaseDate}`;
    if (conversionKey === lastConversionKey.current) return;

    // If we already have a EUR amount and this is just a re-mount (not a value change), skip
    if (lastConversionKey.current === '' && item.amountEur && item.amountEur > 0) {
      lastConversionKey.current = conversionKey;
      return;
    }

    lastConversionKey.current = conversionKey;
    handleCurrencyConversion();
  }, [isNonEurCurrency, item.purchaseDate, item.amountOriginal, item.currencyOriginal, item.amountEur, handleCurrencyConversion]);

  // Set up 5-second debounce timer when inputs change
  useEffect(() => {
    if (!isNonEurCurrency || !item.purchaseDate || !item.amountOriginal) return;

    const conversionKey = `${item.currencyOriginal}|${item.amountOriginal}|${item.purchaseDate}`;
    if (conversionKey === lastConversionKey.current) return;

    // Clear previous timer
    if (conversionTimerRef.current) clearTimeout(conversionTimerRef.current);

    // Set new 5-second debounce timer
    conversionTimerRef.current = setTimeout(() => {
      triggerConversionIfNeeded();
    }, 5000);

    return () => {
      if (conversionTimerRef.current) clearTimeout(conversionTimerRef.current);
    };
  }, [isNonEurCurrency, item.purchaseDate, item.amountOriginal, item.currencyOriginal, triggerConversionIfNeeded]);

  return (
    <div className={clsx(
      'bg-gray-50 rounded-2xl relative overflow-hidden',
      item.checked && 'ring-2 ring-emerald-500'
    )}>
      <div className="p-6">
      {/* Boarding Pass / Declaration Status Bar for Flights */}
      {isPlane && (
        <div className={clsx(
          'mb-4 p-3 rounded-xl flex items-center justify-between',
          (hasBoardingPass || hasDeclaration) ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
        )}>
          <div className="flex items-center gap-2">
            {hasBoardingPass ? (
              <>
                <Ticket className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700">
                  Boarding Pass Added
                </span>
              </>
            ) : hasDeclaration ? (
              <>
                <FileCheck className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700">
                  Declaration Created
                </span>
              </>
            ) : (
              <>
                <Ticket className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">
                  Boarding Pass Missing
                </span>
              </>
            )}
          </div>
          {!hasBoardingPass && !hasDeclaration && (
            <div className="flex items-center gap-3">
              <button
                onClick={onUploadBoardingPass}
                className="text-sm text-amber-700 hover:text-amber-800 font-medium underline"
              >
                Upload now
              </button>
              <button
                onClick={onMissingBoardingPass}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                title="Can't find your boarding pass?"
              >
                <Info className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Missing?</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Multi-passenger booking alert */}
      {item.numberOfPassengers && item.numberOfPassengers > 1 && (
        <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">
                Multi-passenger booking ({item.numberOfPassengers} passengers)
              </p>
              <p className="text-xs text-blue-700 mt-1">
                This booking was for multiple people. Please enter your share of the cost below.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <label className="text-sm text-blue-800">My portion:</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={item.amountOriginal}
                  value={localParticipantPortion}
                  onChange={(e) => setLocalParticipantPortion(e.target.value)}
                  onBlur={() => {
                    const parsed = parseFloat(localParticipantPortion);
                    if (!isNaN(parsed) && parsed !== item.participantPortion) {
                      onUpdate({ participantPortion: parsed });
                    }
                  }}
                  className="w-28"
                  placeholder={`Max: ${item.amountOriginal}`}
                />
                <span className="text-sm text-blue-700">{item.currencyOriginal}</span>
                <span className="text-xs text-blue-600 ml-2">
                  (Total: {formatCurrency(item.amountOriginal, item.currencyOriginal)})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Round-trip indicator */}
      {item.isRoundTrip && (
        <div className="mb-4 p-2 rounded-lg bg-purple-50 border border-purple-200 flex items-center gap-2">
          <span className="text-xs font-medium text-purple-700">
            Round-trip booking
          </span>
          <span className="text-xs text-purple-600">
            (Requires 2 boarding passes: outbound and return)
          </span>
        </div>
      )}

      {/* Luggage fee indicator */}
      {item.luggageAmount != null && item.luggageAmount > 0 && (
        <div className="mb-4 p-2 rounded-lg bg-sky-50 border border-sky-200 flex items-center gap-2">
          <span className="text-xs font-medium text-sky-700">
            Luggage fee included
          </span>
          <span className="text-xs text-sky-600">
            ({formatCurrency(item.luggageAmountEur || item.luggageAmount)} added from separate luggage invoice)
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className={clsx(
          'w-12 h-12 rounded-xl border flex items-center justify-center',
          transportBgColors[item.modeOfTransport]
        )}>
          <Icon className={clsx('w-6 h-6', transportIconColors[item.modeOfTransport])} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">
            {item.fromLocation} → {item.toLocation}
          </p>
          <p className="text-sm text-gray-500">
            {formatDate(item.departureDate)}
            {item.flightNumber && ` • ${item.flightNumber}`}
          </p>
        </div>
        <div className="text-right">
          {item.amountIncludedInRoundTrip ? (
            <p className="text-xs text-purple-600 italic">incl. in outbound</p>
          ) : (
            <>
              <p className="font-semibold text-gray-900">
                {formatCurrency((item.amountEur || 0) + (item.luggageAmountEur || 0))}
              </p>
              {item.currencyOriginal !== 'EUR' && (
                <p className="text-xs text-gray-500">
                  {formatCurrency(item.amountOriginal, item.currencyOriginal)}
                </p>
              )}
            </>
          )}
        </div>
        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Linked Documents */}
      {allLinkedDocuments.length > 0 ? (
        <div className="mb-4 space-y-2">
          {allLinkedDocuments.map((doc, index) => (
            <div
              key={doc.id}
              className="p-3 bg-white rounded-lg border border-gray-200 flex items-center gap-3"
            >
              <FileText className="w-4 h-4 text-gray-400" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-gray-600 truncate block">{doc.renamedFilename}</span>
                {index > 0 && (
                  <span className="text-xs text-gray-400">Additional document</span>
                )}
              </div>
              <button
                onClick={() => onViewDocument(doc)}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                View
              </button>
              <button
                onClick={() => onUnlinkDocument(doc.id)}
                className="text-xs text-red-500 hover:text-red-600 font-medium"
              >
                Unlink
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-sm text-amber-700">No document linked to this travel item</span>
        </div>
      )}

      {/* Editable Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Select
          label="Mode of Transport"
          value={item.modeOfTransport}
          options={transportOptions}
          onChange={(e) => onUpdate({ modeOfTransport: e.target.value as TransportMode })}
        />
        <Input
          label={<span className="flex items-center gap-1">From {needsAttention(localFrom) && <span className="text-amber-500 text-xs">(needs input)</span>}</span>}
          value={localFrom}
          onChange={(e) => setLocalFrom(e.target.value)}
          onBlur={() => localFrom !== item.fromLocation && onUpdate({ fromLocation: localFrom })}
          className={needsAttention(localFrom) ? attentionInputClass : ''}
        />
        <Input
          label={<span className="flex items-center gap-1">To {needsAttention(localTo) && <span className="text-amber-500 text-xs">(needs input)</span>}</span>}
          value={localTo}
          onChange={(e) => setLocalTo(e.target.value)}
          onBlur={() => localTo !== item.toLocation && onUpdate({ toLocation: localTo })}
          className={needsAttention(localTo) ? attentionInputClass : ''}
        />
        <Input
          label="Departure Date"
          type="date"
          value={item.departureDate.split('T')[0]}
          onChange={(e) => onUpdate({ departureDate: e.target.value })}
        />
        {item.amountIncludedInRoundTrip ? null : (
          <>
            <Input
              label={<span className="flex items-center gap-1">Amount {amountNeedsAttention && <span className="text-amber-500 text-xs">(needs input)</span>}</span>}
              type="number"
              step="0.01"
              value={localAmount}
              onChange={(e) => setLocalAmount(e.target.value)}
              onBlur={() => {
                const parsed = parseFloat(localAmount);
                if (!isNaN(parsed) && parsed !== item.amountOriginal) {
                  onUpdate({ amountOriginal: parsed });
                }
                // Trigger currency conversion on blur
                setTimeout(() => triggerConversionIfNeeded(), 100);
              }}
              className={amountNeedsAttention ? attentionInputClass : ''}
            />
            <Select
              label="Currency"
              value={item.currencyOriginal}
              options={currencyOptions}
              onChange={(e) => onUpdate({ currencyOriginal: e.target.value })}
            />
            {/* Purchase Date - required for non-EUR currencies */}
            {isNonEurCurrency && (
              <div className="col-span-1">
                <Input
                  label={
                    <span className="flex items-center gap-1">
                      Purchase Date
                      <span className="text-red-500">*</span>
                      <span className="text-xs text-gray-400 ml-1">(for exchange rate)</span>
                    </span>
                  }
                  type="date"
                  value={item.purchaseDate?.split('T')[0] || ''}
                  min={`${new Date().getFullYear() - 3}-01-01`}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => onUpdate({ purchaseDate: e.target.value })}
                  onBlur={() => triggerConversionIfNeeded()}
                  required
                />
                {conversionInfo && !isConverting && (
                  <p className="text-xs text-gray-500 mt-1">
                    Rate ({conversionInfo.month}/{conversionInfo.year}): 1 {item.currencyOriginal} = {conversionInfo.rate.toFixed(4)} EUR
                  </p>
                )}
                {isConverting && (
                  <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Converting...
                  </p>
                )}
                {isNonEurCurrency && !item.purchaseDate && (
                  <p className="text-xs text-amber-600 mt-1">
                    Purchase date is required for currency conversion
                  </p>
                )}
              </div>
            )}
          </>
        )}
        {isPlane && (
          <>
            <Input
              label={<span className="flex items-center gap-1">Flight Number {needsAttention(localFlightNumber) && <span className="text-amber-500 text-xs">(needs input)</span>}</span>}
              value={localFlightNumber}
              onChange={(e) => setLocalFlightNumber(e.target.value)}
              onBlur={() => localFlightNumber !== (item.flightNumber || '') && onUpdate({ flightNumber: localFlightNumber })}
              className={needsAttention(localFlightNumber) ? attentionInputClass : ''}
            />
            <Input
              label="Booking Reference"
              value={localBookingRef}
              onChange={(e) => setLocalBookingRef(e.target.value)}
              onBlur={() => localBookingRef !== (item.bookingReference || '') && onUpdate({ bookingReference: localBookingRef })}
            />
          </>
        )}
        <Input
          label="Company / Airline"
          value={localCompanyName}
          onChange={(e) => setLocalCompanyName(e.target.value)}
          onBlur={() => localCompanyName !== (item.companyName || '') && onUpdate({ companyName: localCompanyName })}
          placeholder="e.g., Ryanair, Deutsche Bahn"
        />
        {/* Car travel specific fields */}
        {item.modeOfTransport === 'CAR' && (
          <>
            <div className="col-span-1">
              <Input
                label={
                  <span className="flex items-center gap-1">
                    Distance (km)
                    <span className="text-xs text-gray-400 ml-1">(one-way)</span>
                  </span>
                }
                type="number"
                step="1"
                min="0"
                value={localDistanceKm}
                onChange={(e) => setLocalDistanceKm(e.target.value)}
                onBlur={() => {
                  const parsed = parseFloat(localDistanceKm);
                  if (!isNaN(parsed) && parsed !== item.distanceKm) {
                    onUpdate({ distanceKm: parsed });
                  }
                }}
                placeholder="e.g., 350"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the distance driven. Reimbursement = distance × rate per km.
              </p>
            </div>
            <div className="col-span-1">
              <label className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={item.isDriverCarpool || false}
                  onChange={(e) => onUpdate({ isDriverCarpool: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">I was the driver</span>
                  <p className="text-xs text-gray-500">Check if you drove (not a passenger)</p>
                </div>
              </label>
            </div>
          </>
        )}
      </div>

      </div>

      {/* Confirmation Bottom Bar */}
      <div className={clsx(
        'px-6 py-4 flex items-center justify-between border-t transition-colors',
        item.checked
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center gap-3">
          {item.checked ? (
            <>
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">
                This travel item is confirmed
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <span className="text-sm text-gray-600">
                Please verify the information above is correct
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            console.log('[Confirm] Button clicked for item:', item.id);
            onToggleChecked();
          }}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            item.checked
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          )}
        >
          {item.checked ? 'Edit' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}

// Add Travel Modal
function AddTravelModal({
  isOpen,
  onClose,
  token,
  documents,
  travelItems,
  onViewDocument,
  carRatePerKm = 0.22,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  documents: Document[];
  travelItems: TravelItem[];
  onViewDocument: (doc: Document) => void;
  carRatePerKm?: number;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [formData, setFormData] = useState({
    modeOfTransport: 'PLANE' as TransportMode,
    fromLocation: '',
    toLocation: '',
    departureDate: '',
    amountOriginal: 0,
    currencyOriginal: 'EUR',
    flightNumber: '',
    bookingReference: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedExistingDocId, setSelectedExistingDocId] = useState<string>('');
  const [selectedTravelItemId, setSelectedTravelItemId] = useState<string>('');

  // Car travel specific state
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [isCarpooling, setIsCarpooling] = useState(false);
  const [carpoolRole, setCarpoolRole] = useState<'driver' | 'passenger'>('driver');

  // Calculate car travel amount
  const carAmount = isCarpooling && carpoolRole === 'passenger' ? 0 : distanceKm * carRatePerKm;

  // Find documents that are not linked to any travel item
  // Exclude FLIGHT_BOARDING_PASS since they're associated with flights by type, not direct link
  // Include both primary documentId and additionalDocumentIds in the linked set
  const linkedDocIds = useMemo(() => {
    const ids = new Set<string>();
    travelItems.forEach(t => {
      if (t.documentId) ids.add(t.documentId);
      if (t.additionalDocumentIds) {
        try {
          const additionalIds = JSON.parse(t.additionalDocumentIds) as string[];
          additionalIds.forEach(id => ids.add(id));
        } catch {
          // Ignore invalid JSON
        }
      }
    });
    return ids;
  }, [travelItems]);
  const unlinkedDocs = documents.filter(d =>
    !linkedDocIds.has(d.id) && d.documentType !== 'FLIGHT_BOARDING_PASS'
  );

  const uploadAndCreateMutation = useMutation({
    mutationFn: async () => {
      let documentId: string | undefined;

      // Use existing document if selected
      if (selectedExistingDocId) {
        documentId = selectedExistingDocId;
      } else if (selectedFile) {
        // Upload new document if file selected
        const uploadResult = await participantApi.uploadDocument(token, selectedFile);
        documentId = uploadResult.document.id;
      }

      // Prepare travel item data
      const travelItemData = {
        ...formData,
        amountEur: formData.modeOfTransport === 'CAR' ? carAmount : formData.amountOriginal,
        amountOriginal: formData.modeOfTransport === 'CAR' ? carAmount : formData.amountOriginal,
        documentId,
        // Car travel specific fields
        distanceKm: formData.modeOfTransport === 'CAR' ? distanceKm : undefined,
        isDriverCarpool: formData.modeOfTransport === 'CAR' && isCarpooling ? carpoolRole === 'driver' : undefined,
      };

      return participantApi.createTravelItem(token, travelItemData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      toast.success('Travel item added');
      onClose();
      // Reset form
      setFormData({
        modeOfTransport: 'PLANE',
        fromLocation: '',
        toLocation: '',
        departureDate: '',
        amountOriginal: 0,
        currencyOriginal: 'EUR',
        flightNumber: '',
        bookingReference: '',
      });
      setSelectedFile(null);
      setSelectedExistingDocId('');
      // Reset car-specific state
      setDistanceKm(0);
      setIsCarpooling(false);
      setCarpoolRole('driver');
    },
    onError: () => {
      toast.error('Failed to add travel item');
    },
  });

  // Mutation to link a document to an existing travel item
  const linkDocumentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedExistingDocId || !selectedTravelItemId) {
        throw new Error('Please select both a document and a travel item');
      }

      const targetItem = travelItems.find(t => t.id === selectedTravelItemId);
      if (!targetItem) throw new Error('Travel item not found');

      // Get existing additional document IDs
      let additionalIds: string[] = [];
      if (targetItem.additionalDocumentIds) {
        try {
          additionalIds = JSON.parse(targetItem.additionalDocumentIds) as string[];
        } catch {
          additionalIds = [];
        }
      }

      // Add new document ID (avoid duplicates)
      if (!additionalIds.includes(selectedExistingDocId) && targetItem.documentId !== selectedExistingDocId) {
        additionalIds.push(selectedExistingDocId);
      }

      // Update the travel item with new additional documents
      return participantApi.updateTravelItem(token, selectedTravelItemId, {
        additionalDocumentIds: additionalIds.length > 0 ? JSON.stringify(additionalIds) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      toast.success('Document linked to travel item');
      onClose();
      setSelectedExistingDocId('');
      setSelectedTravelItemId('');
      setMode('create');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to link document');
    },
  });

  // Mutation to delete an unlinked document
  const deleteUnlinkedDocMutation = useMutation({
    mutationFn: (docId: string) => participantApi.deleteDocument(token, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      toast.success('Document deleted');
    },
    onError: () => {
      toast.error('Failed to delete document');
    },
  });

  const handleDeleteUnlinkedDoc = (e: React.MouseEvent, docId: string, docName: string) => {
    e.stopPropagation();
    if (window.confirm(`Delete document "${docName}"? This cannot be undone.`)) {
      if (selectedExistingDocId === docId) setSelectedExistingDocId('');
      deleteUnlinkedDocMutation.mutate(docId);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'link') {
      linkDocumentMutation.mutate();
    } else {
      uploadAndCreateMutation.mutate();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={unlinkedDocs.length > 0 ? "Manage Documents" : "Add Travel Manually"} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Mode tabs - only show if there are unlinked documents */}
        {unlinkedDocs.length > 0 && (
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                mode === 'create'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              Create New Travel Item
            </button>
            <button
              type="button"
              onClick={() => setMode('link')}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                mode === 'link'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              Link to Existing Travel Item
            </button>
          </div>
        )}

        {mode === 'link' ? (
          /* Link mode - connect document to existing travel item */
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-xl">
              <p className="text-sm text-blue-800">
                Select a document and an existing travel item to link them together.
              </p>
            </div>

            {/* Document selection */}
            <div>
              <label className="label">Select Document</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {unlinkedDocs.map(doc => (
                  <div
                    key={doc.id}
                    className={clsx(
                      'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                      selectedExistingDocId === doc.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                    onClick={() => setSelectedExistingDocId(selectedExistingDocId === doc.id ? '' : doc.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">{doc.originalFilename}</span>
                      {selectedExistingDocId === doc.id && (
                        <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDocument(doc);
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteUnlinkedDoc(e, doc.id, doc.originalFilename)}
                        className="p-1 text-red-400 hover:text-red-600 transition-colors"
                        title="Delete document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Travel item selection */}
            <div>
              <label className="label">Select Travel Item to Link</label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {travelItems.map(item => (
                  <div
                    key={item.id}
                    className={clsx(
                      'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                      selectedTravelItemId === item.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                    onClick={() => setSelectedTravelItemId(selectedTravelItemId === item.id ? '' : item.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {React.createElement(transportIcons[item.modeOfTransport] || HelpCircle, {
                        className: 'w-5 h-5 text-gray-500 flex-shrink-0',
                      })}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {item.fromLocation} → {item.toLocation}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(item.departureDate)}
                          {item.flightNumber && ` • ${item.flightNumber}`}
                        </div>
                      </div>
                    </div>
                    {selectedTravelItemId === item.id && (
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={linkDocumentMutation.isPending}
                disabled={!selectedExistingDocId || !selectedTravelItemId}
              >
                Link Document
              </Button>
            </div>
          </div>
        ) : (
          /* Create mode - existing functionality */
          <>
            <div className="p-4 bg-blue-50 rounded-xl">
              <p className="text-sm text-blue-800">
                Please upload a supporting document (ticket, invoice, receipt) for this travel item.
                If you don't have a document, you'll need to provide a declaration later.
              </p>
            </div>

            {/* Document Selection - Existing or New Upload */}
            <div>
              <label className="label">Supporting Document</label>

              {/* Option to link existing unlinked document */}
              {unlinkedDocs.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm text-amber-700 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    You have {unlinkedDocs.length} uploaded document(s) not linked to any travel item
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {unlinkedDocs.map(doc => (
                      <div
                        key={doc.id}
                        className={clsx(
                          'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                          selectedExistingDocId === doc.id
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        )}
                        onClick={() => {
                          setSelectedExistingDocId(selectedExistingDocId === doc.id ? '' : doc.id);
                          if (selectedExistingDocId !== doc.id) setSelectedFile(null);
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-700 truncate">{doc.originalFilename}</span>
                          {selectedExistingDocId === doc.id && (
                            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewDocument(doc);
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteUnlinkedDoc(e, doc.id, doc.originalFilename)}
                            className="p-1 text-red-400 hover:text-red-600 transition-colors"
                            title="Delete document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Or upload new file */}
          {!selectedExistingDocId && (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
              {selectedFile ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-700">{selectedFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-red-500 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600">
                    {unlinkedDocs.length > 0 ? 'Or upload a new document' : 'Click to upload document'}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>
          )}

              {selectedExistingDocId && (
                <button
                  type="button"
                  onClick={() => setSelectedExistingDocId('')}
                  className="text-sm text-blue-600 hover:text-blue-700 mt-2"
                >
                  Clear selection and upload new instead
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Mode of Transport"
                value={formData.modeOfTransport}
                options={transportOptions}
                onChange={(e) => setFormData({ ...formData, modeOfTransport: e.target.value as TransportMode })}
              />
              <Input
                label="Departure Date"
                type="date"
                value={formData.departureDate}
                onChange={(e) => setFormData({ ...formData, departureDate: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="From"
                value={formData.fromLocation}
                onChange={(e) => setFormData({ ...formData, fromLocation: e.target.value })}
                placeholder="e.g., Amsterdam"
                required
              />
              <Input
                label="To"
                value={formData.toLocation}
                onChange={(e) => setFormData({ ...formData, toLocation: e.target.value })}
                placeholder="e.g., Barcelona"
                required
              />
            </div>

            {/* Amount section - different for CAR mode */}
            {formData.modeOfTransport === 'CAR' ? (
              <>
                {/* Kilometer input for car */}
                <div>
                  <Input
                    label="Distance (km)"
                    type="number"
                    step="1"
                    min="0"
                    value={distanceKm || ''}
                    onChange={(e) => setDistanceKm(parseFloat(e.target.value) || 0)}
                    placeholder="Enter distance in kilometers"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Rate: €{carRatePerKm.toFixed(2)}/km = <strong>€{carAmount.toFixed(2)}</strong>
                  </p>
                </div>

                {/* Carpool option */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isCarpooling}
                      onChange={(e) => setIsCarpooling(e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-gray-700">I carpooled with another participant</span>
                  </label>

                  {isCarpooling && (
                    <div className="ml-6 space-y-2 p-3 bg-gray-50 rounded-lg">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="carpoolRole"
                          checked={carpoolRole === 'driver'}
                          onChange={() => setCarpoolRole('driver')}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-gray-700">I was the driver (full reimbursement: €{(distanceKm * carRatePerKm).toFixed(2)})</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="carpoolRole"
                          checked={carpoolRole === 'passenger'}
                          onChange={() => setCarpoolRole('passenger')}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-gray-700">I was a passenger (no reimbursement)</span>
                      </label>
                      {carpoolRole === 'passenger' && (
                        <p className="text-xs text-amber-600 mt-1">
                          As a passenger, your reimbursement will be €0 (you had no travel costs).
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Info about supporting documents */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Optional:</strong> You may upload gasoline receipts or toll receipts as supporting documents above.
                  </p>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Amount"
                  type="number"
                  step="0.01"
                  value={formData.amountOriginal || ''}
                  onChange={(e) => setFormData({ ...formData, amountOriginal: parseFloat(e.target.value) || 0 })}
                  required
                />
                <Select
                  label="Currency"
                  value={formData.currencyOriginal}
                  options={[
                    { value: 'EUR', label: 'EUR' },
                    { value: 'USD', label: 'USD' },
                    { value: 'GBP', label: 'GBP' },
                    { value: 'PLN', label: 'PLN' },
                    { value: 'CZK', label: 'CZK' },
                    { value: 'HUF', label: 'HUF' },
                    { value: 'RON', label: 'RON' },
                  ]}
                  onChange={(e) => setFormData({ ...formData, currencyOriginal: e.target.value })}
                />
              </div>
            )}

            {formData.modeOfTransport === 'PLANE' && (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Flight Number"
                  value={formData.flightNumber}
                  onChange={(e) => setFormData({ ...formData, flightNumber: e.target.value })}
                  placeholder="e.g., KL1234"
                />
                <Input
                  label="Booking Reference"
                  value={formData.bookingReference}
                  onChange={(e) => setFormData({ ...formData, bookingReference: e.target.value })}
                  placeholder="e.g., ABC123"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={uploadAndCreateMutation.isPending}>
                Add Travel Item
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

// Boarding Pass Upload Modal
function BoardingPassUploadModal({
  isOpen,
  onClose,
  token,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await participantApi.uploadDocument(token, file);
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      toast.success('Boarding pass uploaded');
      onClose();
    } catch {
      toast.error('Failed to upload boarding pass');
    }
    setUploading(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload Boarding Pass">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Please upload your boarding pass. This can be a screenshot, photo, or PDF of your boarding pass.
        </p>

        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8">
          {uploading ? (
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-600">Uploading...</p>
            </div>
          ) : (
            <label className="cursor-pointer flex flex-col items-center">
              <Ticket className="w-12 h-12 text-gray-400 mb-3" />
              <span className="text-gray-700 font-medium">Click to upload boarding pass</span>
              <span className="text-sm text-gray-500 mt-1">PDF, JPG, PNG up to 10MB</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
            </label>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
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
    bankName: data.participant.bankName || '',
    personalAddress: data.participant.personalAddress || '',
    personalCity: data.participant.personalCity || '',
    personalPostalCode: data.participant.personalPostalCode || '',
    personalCountry: data.participant.personalCountry || '',
  });
  const [confirmations, setConfirmations] = useState({
    dataCorrect: false,
    erasmusRules: false,
  });
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [selectedMissingDoc, setSelectedMissingDoc] = useState<DocumentType | null>(null);
  const [declarationTravelItem, setDeclarationTravelItem] = useState<TravelItem | null>(null);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);

  // Find flights missing boarding passes (no linked boarding pass document and no declaration of travel)
  const declarationsOfTravel = data.declarationsOfTravel || [];
  const flightsMissingBoardingPass = data.travelItems.filter((item) => {
    if (item.modeOfTransport !== 'PLANE') return false;

    // Check if there's a linked boarding pass document
    const linkedDoc = data.documents.find((d) => d.id === item.documentId);
    const hasBoardingPass =
      linkedDoc?.documentType === 'FLIGHT_BOARDING_PASS' ||
      data.documents.some((d) => d.documentType === 'FLIGHT_BOARDING_PASS');

    // Check if there's a declaration of travel for this item
    const hasDeclaration = declarationsOfTravel.some((dec) => dec.travelItemId === item.id);

    return !hasBoardingPass && !hasDeclaration;
  });

  const updateBankMutation = useMutation({
    mutationFn: () => participantApi.updateBankDetails(token, bankDetails),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
    },
  });

  const createDeclarationMutation = useMutation({
    mutationFn: (decData: { missingDocumentType: DocumentType; description: string; reason: string; place: string }) =>
      participantApi.createDeclaration(token, decData),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['participant-auth'] });
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

  const canSubmit =
    validation.isComplete &&
    confirmations.dataCorrect &&
    confirmations.erasmusRules &&
    bankDetails.bankAccountIban &&
    bankDetails.bankAccountHolderName &&
    bankDetails.bankAccountBic;

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

          {/* Flights Missing Boarding Pass Warning */}
          {flightsMissingBoardingPass.length > 0 && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Plane className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-800">
                    Flights Without Boarding Pass
                  </h4>
                  <p className="text-sm text-blue-700 mt-1">
                    The following flights don't have a boarding pass. You can either upload
                    one or sign a declaration on honor.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {flightsMissingBoardingPass.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between bg-white p-3 rounded-lg border border-blue-100"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {item.fromLocation} → {item.toLocation}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(item.departureDate).toLocaleDateString()}
                            {item.flightNumber && ` • ${item.flightNumber}`}
                          </p>
                        </div>
                        <button
                          onClick={() => setDeclarationTravelItem(item)}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Sign Declaration
                        </button>
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
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="block text-sm font-medium text-gray-700">
                    BIC/SWIFT Code
                  </label>
                  <div className="relative group">
                    <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10">
                      The BIC (Bank Identifier Code) is an 8-11 character code. You can find it on your bank statement, in your banking app, or by searching &quot;[your bank name] BIC code&quot;.
                      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
                <Input
                  value={bankDetails.bankAccountBic}
                  onChange={(e) =>
                    setBankDetails({ ...bankDetails, bankAccountBic: e.target.value })
                  }
                  onBlur={() => updateBankMutation.mutate()}
                  placeholder="COBADEFFXXX"
                  required
                />
              </div>
              <Input
                label="Bank Name"
                value={bankDetails.bankName}
                onChange={(e) =>
                  setBankDetails({ ...bankDetails, bankName: e.target.value })
                }
                onBlur={() => updateBankMutation.mutate()}
                placeholder="e.g., Deutsche Bank"
              />
            </div>
          </div>

          {/* Personal Address */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Personal Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Street Address"
                  value={bankDetails.personalAddress}
                  onChange={(e) =>
                    setBankDetails({ ...bankDetails, personalAddress: e.target.value })
                  }
                  onBlur={() => updateBankMutation.mutate()}
                  placeholder="e.g., Hauptstrasse 1"
                />
              </div>
              <Input
                label="City"
                value={bankDetails.personalCity}
                onChange={(e) =>
                  setBankDetails({ ...bankDetails, personalCity: e.target.value })
                }
                onBlur={() => updateBankMutation.mutate()}
                placeholder="e.g., Berlin"
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Postal Code"
                  value={bankDetails.personalPostalCode}
                  onChange={(e) =>
                    setBankDetails({ ...bankDetails, personalPostalCode: e.target.value })
                  }
                  onBlur={() => updateBankMutation.mutate()}
                  placeholder="e.g., 10115"
                />
                <Input
                  label="Country"
                  value={bankDetails.personalCountry}
                  onChange={(e) =>
                    setBankDetails({ ...bankDetails, personalCountry: e.target.value })
                  }
                  onBlur={() => updateBankMutation.mutate()}
                  placeholder="e.g., Germany"
                />
              </div>
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

          {/* GDPR Notice */}
          <p className="mt-6 text-xs text-gray-400 text-center">
            Your data is handled according to GDPR regulations. Only the project team will have access to your information. Data will be stored for reimbursement and auditing purposes and will be removed after a reasonable period.
          </p>
        </CardContent>
      </Card>

      {/* Declaration Modal */}
      <DeclarationModal
        isOpen={showDeclarationModal}
        onClose={() => setShowDeclarationModal(false)}
        documentType={selectedMissingDoc}
        participantName={`${data.participant.firstName} ${data.participant.lastName}`}
        projectName={data.project.name}
        onSubmit={(decData) => createDeclarationMutation.mutate(decData)}
        isLoading={createDeclarationMutation.isPending}
      />

      {/* Declaration on Honor Modal (for missing boarding pass) */}
      {declarationTravelItem && (
        <MissingBoardingPassModal
          isOpen={true}
          onClose={() => setDeclarationTravelItem(null)}
          token={token}
          travelItem={declarationTravelItem}
          documents={data.documents}
          participantName={`${data.participant.firstName} ${data.participant.lastName}`}
          participantCountry={data.participant.country}
          organisation={data.project.organisation}
          onViewDocument={setViewingDocument}
        />
      )}

      {/* Document Viewer Modal for Step 3 */}
      {viewingDocument && (
        <DocumentViewModal
          document={viewingDocument}
          token={token}
          onClose={() => setViewingDocument(null)}
        />
      )}
    </>
  );
}

// Document View Modal - shows document in a popup
function DocumentViewModal({
  document,
  token,
  onClose,
}: {
  document: Document | null;
  token: string;
  onClose: () => void;
}) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch signed URL when document changes
  useEffect(() => {
    if (!document) {
      setFileUrl(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    participantApi.getDocumentUrl(token, document.id)
      .then((result) => {
        setFileUrl(result.url);
      })
      .catch((err) => {
        console.error('Failed to get document URL:', err);
        setError('Failed to load document. Please try again.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [document?.id, token]);

  if (!document) return null;

  const isImage = document.mimeType.startsWith('image/');
  const isPdf = document.mimeType === 'application/pdf';

  return (
    <Modal isOpen={!!document} onClose={onClose} title={document.renamedFilename} zIndex={60}>
      <div className="max-h-[70vh] overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            <span className="ml-3 text-gray-600">Loading document...</span>
          </div>
        )}
        {error && (
          <div className="text-center py-8">
            <AlertCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
            <p className="text-red-600">{error}</p>
          </div>
        )}
        {!isLoading && !error && fileUrl && (
          <>
            {isImage && (
              <img
                src={fileUrl}
                alt={document.renamedFilename}
                className="w-full h-auto rounded-lg"
              />
            )}
            {isPdf && (
              <iframe
                src={fileUrl}
                title={document.renamedFilename}
                className="w-full h-[60vh] rounded-lg border border-gray-200"
              />
            )}
            {!isImage && !isPdf && (
              <div className="text-center py-8">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">This file type cannot be previewed.</p>
                <a
                  href={fileUrl}
                  download={document.originalFilename}
                  className="text-primary-600 hover:text-primary-700 mt-2 inline-block"
                >
                  Download File
                </a>
              </div>
            )}
          </>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {isPdf && fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open in New Tab
          </a>
        )}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
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
    HOTEL_INVOICE: 'Hotel Invoice',
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
          Date: {formatDate(new Date())}
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
