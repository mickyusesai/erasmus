import { useState, useEffect, useCallback, useMemo } from 'react';
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

// Loading screen component with rotating Erasmus quotes
function ConsolidationLoading() {
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % erasmusQuotes.length);
    }, 4000); // Change quote every 4 seconds

    return () => clearInterval(interval);
  }, []);

  const currentQuote = erasmusQuotes[quoteIndex];

  return (
    <div className="fixed inset-0 bg-white/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="max-w-lg mx-auto text-center px-6">
        {/* Loading spinner */}
        <div className="relative w-20 h-20 mx-auto mb-8">
          <div className="absolute inset-0 border-4 border-primary-100 rounded-full" />
          <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin" />
          <FileText className="absolute inset-0 m-auto w-8 h-8 text-primary-600" />
        </div>

        {/* Loading message */}
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Analyzing your documents...
        </h3>
        <p className="text-gray-500 mb-8">
          We're extracting travel information from your documents. This may take a moment.
        </p>

        {/* Erasmus quote */}
        <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-2xl p-6 border border-primary-100">
          <p className="text-lg italic text-gray-700 mb-3">
            "{currentQuote.quote}"
          </p>
          <p className="text-sm text-primary-600 font-medium">
            — {currentQuote.author}
          </p>
        </div>

        {/* Progress hint */}
        <p className="text-xs text-gray-400 mt-6">
          Please don't close this page while we process your documents
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('reimbursement');

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

          {/* Privacy Notice */}
          <div className="mt-6 p-4 bg-white/10 rounded-xl flex items-start gap-3">
            <Shield className="w-5 h-5 text-white/80 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-white/80">
              Your data is handled according to GDPR regulations. Only the project team will have access to your information. Data will be stored for reimbursement and auditing purposes and will be removed after a reasonable period.
            </p>
          </div>

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
  const [consolidating, setConsolidating] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => participantApi.uploadDocument(token, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      toast.success('Document uploaded and analyzed');
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
  const handleContinue = async () => {
    setConsolidating(true);
    try {
      const result = await participantApi.consolidateJourney(token);

      if (result.warnings && result.warnings.length > 0) {
        // Show warnings but still proceed
        result.warnings.forEach((warning: string) => {
          toast(warning, { icon: '⚠️', duration: 5000 });
        });
      }

      if (result.success) {
        toast.success(result.message || 'Journey analyzed successfully');
      }

      // Refresh data and move to next step
      await queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      onNext();
    } catch (error) {
      console.error('Consolidation error:', error);
      toast.error('Failed to analyze journey. Please try again.');
    }
    setConsolidating(false);
  };

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
    HOTEL_INVOICE: 'Hotel Invoice',
    OTHER: 'Other',
  };

  const isGreenTravel = data.greenTravel || false;

  return (
    <>
      {/* Show loading screen with Erasmus quotes during consolidation */}
      {consolidating && <ConsolidationLoading />}

      <Card>
        <CardHeader>
          <h2 className="text-xl font-bold text-gray-900">Upload Your Travel Documents</h2>
        <p className="text-gray-500 mt-1">
          {isGreenTravel ? (
            <>Upload all your travel tickets, invoices, boarding passes, and <strong>hotel invoices</strong> (for green travel). We'll automatically extract the information.</>
          ) : (
            'Upload all your travel tickets, invoices, and boarding passes. We\'ll automatically extract the information.'
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
              {data.documents.map((doc) => {
                const isUnclear = doc.documentType === 'OTHER';
                return (
                  <div key={doc.id} className={clsx(
                    "p-4 rounded-xl",
                    isUnclear ? "bg-amber-50 border border-amber-200" : "bg-gray-50"
                  )}>
                    <div className="flex items-start gap-3">
                      <div className={clsx(
                        "w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0",
                        isUnclear ? "bg-amber-100 border-amber-300" : "bg-white border-gray-200"
                      )}>
                        <FileText className={clsx("w-5 h-5", isUnclear ? "text-amber-600" : "text-gray-400")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate text-sm">
                          {doc.renamedFilename}
                        </p>
                        <p className={clsx("text-xs", isUnclear ? "text-amber-600" : "text-gray-500")}>
                          {docTypeLabels[doc.documentType]}
                        </p>
                      </div>
                    </div>
                    {isUnclear && (
                      <div className="mt-2 p-2 bg-amber-100 rounded-lg">
                        <p className="text-xs text-amber-800">
                          <strong>Note:</strong> This document couldn't be fully analyzed (image may be unclear).
                          You can add the travel details manually in the next step.
                        </p>
                      </div>
                    )}
                    <div className="flex gap-3 mt-3">
                      <a
                        href={`/api/uploads/${doc.storedFilePath}`}
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
                );
              })}
            </div>
          </div>
        )}

        {/* Next Button */}
        <div className="mt-8 flex justify-end">
          <Button
            onClick={handleContinue}
            disabled={data.documents.length === 0 || consolidating}
            loading={consolidating}
          >
            {consolidating ? 'Analyzing your journey...' : 'Continue to Check Data'}
            {!consolidating && <ChevronRight className="w-4 h-4 ml-2" />}
          </Button>
        </div>
      </CardContent>
    </Card>
    </>
  );
}

// Warning type for the persistent warnings system
interface PersistentWarning {
  id: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  dismissible: boolean;
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
  const [showAddTravelModal, setShowAddTravelModal] = useState(false);
  const [showBoardingPassUpload, setShowBoardingPassUpload] = useState(false);
  const [participantNote, setParticipantNote] = useState(data.participant.participantNote || '');
  const [noteEdited, setNoteEdited] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [missingBoardingPassItem, setMissingBoardingPassItem] = useState<TravelItem | null>(null);

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

  // Generate persistent warnings based on data analysis
  const warnings = useMemo((): PersistentWarning[] => {
    const w: PersistentWarning[] = [];
    const participantCountry = data.participant.country?.toLowerCase();

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

    // Check if participant traveled from their registered country
    if (participantCountry && data.travelItems.length > 0) {
      // Find the first outbound travel item (earliest departure)
      const sortedItems = [...data.travelItems].sort(
        (a, b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime()
      );
      const firstTravelItem = sortedItems[0];

      if (firstTravelItem) {
        const originLocation = firstTravelItem.fromLocation?.toLowerCase() || '';
        // Check if the origin doesn't match the participant's country
        const countryDoesNotMatch = !originLocation.includes(participantCountry) &&
          !participantCountry.includes(originLocation.split(',')[0]?.trim() || '');

        // List of common city-to-country mappings for better matching
        const cityCountryMap: Record<string, string[]> = {
          'poland': ['warsaw', 'krakow', 'poznan', 'gdansk', 'wroclaw', 'lodz', 'katowice'],
          'germany': ['berlin', 'munich', 'frankfurt', 'hamburg', 'cologne', 'dusseldorf', 'stuttgart'],
          'spain': ['madrid', 'barcelona', 'valencia', 'seville', 'malaga', 'bilbao'],
          'italy': ['rome', 'milan', 'naples', 'turin', 'florence', 'venice', 'bologna'],
          'france': ['paris', 'lyon', 'marseille', 'toulouse', 'nice', 'bordeaux'],
          'netherlands': ['amsterdam', 'rotterdam', 'the hague', 'utrecht', 'eindhoven'],
          'czech republic': ['prague', 'brno', 'ostrava', 'plzen'],
          'czechia': ['prague', 'brno', 'ostrava', 'plzen'],
          'hungary': ['budapest', 'debrecen', 'szeged', 'miskolc'],
          'romania': ['bucharest', 'cluj', 'timisoara', 'iasi', 'brasov'],
          'bulgaria': ['sofia', 'plovdiv', 'varna', 'burgas'],
          'greece': ['athens', 'thessaloniki', 'patras', 'heraklion'],
          'portugal': ['lisbon', 'porto', 'faro', 'braga'],
          'croatia': ['zagreb', 'split', 'dubrovnik', 'rijeka'],
          'slovenia': ['ljubljana', 'maribor'],
          'slovakia': ['bratislava', 'kosice'],
          'austria': ['vienna', 'salzburg', 'graz', 'linz', 'innsbruck'],
          'belgium': ['brussels', 'antwerp', 'ghent', 'bruges', 'liege'],
          'sweden': ['stockholm', 'gothenburg', 'malmo', 'uppsala'],
          'denmark': ['copenhagen', 'aarhus', 'odense'],
          'finland': ['helsinki', 'tampere', 'turku', 'oulu'],
          'norway': ['oslo', 'bergen', 'trondheim', 'stavanger'],
          'ireland': ['dublin', 'cork', 'galway', 'limerick'],
          'uk': ['london', 'manchester', 'birmingham', 'glasgow', 'liverpool', 'edinburgh'],
          'united kingdom': ['london', 'manchester', 'birmingham', 'glasgow', 'liverpool', 'edinburgh'],
        };

        // Check if origin city matches participant's country
        const countryKey = Object.keys(cityCountryMap).find(
          k => participantCountry.includes(k) || k.includes(participantCountry)
        );
        const matchingCities = countryKey ? cityCountryMap[countryKey] : [];
        const originMatchesCountry = matchingCities.some(city => originLocation.includes(city));

        if (countryDoesNotMatch && !originMatchesCountry) {
          w.push({
            id: 'country-mismatch',
            type: 'warning',
            message: `Your first travel origin (${firstTravelItem.fromLocation}) appears to be different from your registered country (${data.participant.country}). Please verify this is correct.`,
            dismissible: true,
          });
        }
      }
    }

    // Check for non-EUR currencies without purchase date
    const itemsNeedingPurchaseDate = data.travelItems.filter(
      t => t.currencyOriginal !== 'EUR' && !t.purchaseDate
    );
    if (itemsNeedingPurchaseDate.length > 0) {
      w.push({
        id: 'missing-purchase-date',
        type: 'warning',
        message: `${itemsNeedingPurchaseDate.length} travel item(s) with non-EUR currency need a purchase date for exchange rate conversion.`,
        dismissible: true,
      });
    }

    return w;
  }, [data]);

  // Filter out dismissed warnings
  const visibleWarnings = warnings.filter(w => !dismissedWarnings.has(w.id));

  const dismissWarning = (id: string) => {
    setDismissedWarnings(prev => new Set([...prev, id]));
  };

  return (
    <div className="space-y-6">
      {/* Persistent Warnings Section */}
      {visibleWarnings.length > 0 && (
        <div className="space-y-3">
          {visibleWarnings.map((warning) => (
            <div
              key={warning.id}
              className={clsx(
                'p-4 rounded-xl flex items-start gap-3 border',
                warning.type === 'error' && 'bg-red-50 border-red-200',
                warning.type === 'warning' && 'bg-amber-50 border-amber-200',
                warning.type === 'info' && 'bg-blue-50 border-blue-200'
              )}
            >
              <AlertTriangle
                className={clsx(
                  'w-5 h-5 flex-shrink-0 mt-0.5',
                  warning.type === 'error' && 'text-red-500',
                  warning.type === 'warning' && 'text-amber-500',
                  warning.type === 'info' && 'text-blue-500'
                )}
              />
              <div className="flex-1">
                <p
                  className={clsx(
                    'text-sm font-medium',
                    warning.type === 'error' && 'text-red-800',
                    warning.type === 'warning' && 'text-amber-800',
                    warning.type === 'info' && 'text-blue-800'
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
                    warning.type === 'info' && 'text-blue-400 hover:text-blue-600'
                  )}
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
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
              variant="secondary"
              onClick={() => setShowAddTravelModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Travel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
                  onDelete={() => deleteMutation.mutate(item.id)}
                  onUploadBoardingPass={() => setShowBoardingPassUpload(true)}
                  onViewDocument={setViewingDocument}
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
            />
            {noteEdited && (
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => noteMutation.mutate(participantNote)}
                  loading={noteMutation.isPending}
                >
                  Save Note
                </Button>
              </div>
            )}
          </div>

          {/* Summary with Itemized Breakdown */}
          <div className="mt-8 p-6 bg-gray-50 rounded-2xl">
            <h4 className="font-semibold text-gray-900 mb-4">Cost Breakdown</h4>

            {/* Itemized List */}
            <div className="space-y-2 mb-4">
              {data.travelItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {item.fromLocation} → {item.toLocation}
                    <span className="text-gray-400 ml-2">({item.modeOfTransport.toLowerCase()})</span>
                    {item.comment && <span className="text-gray-400 ml-1">*</span>}
                  </span>
                  <span className="text-gray-900 font-medium">{formatCurrency(item.amountEur)}</span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-300 my-4" />

            {/* Total with max reimbursement inline */}
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-3">
                <div>
                  <p className="text-sm text-gray-500">Total Travel Costs</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(data.reimbursementSummary?.totalEur || data.travelItems.reduce((sum, item) => sum + item.amountEur, 0))}
                  </p>
                </div>
                {data.maxReimbursementForCountry !== undefined && data.maxReimbursementForCountry !== null && (
                  <span className="text-sm text-blue-600 font-medium">
                    (max: {formatCurrency(data.maxReimbursementForCountry)})
                  </span>
                )}
              </div>
              {/* Show actual amount to receive if over limit */}
              {data.maxReimbursementForCountry &&
               (data.reimbursementSummary?.totalEur || data.travelItems.reduce((sum, item) => sum + item.amountEur, 0)) > data.maxReimbursementForCountry && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">You will receive</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {formatCurrency(data.maxReimbursementForCountry)}
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

      {/* Add Travel Modal */}
      <AddTravelModal
        isOpen={showAddTravelModal}
        onClose={() => setShowAddTravelModal(false)}
        token={token}
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
        />
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
  // Sort items by departure date
  const sortedItems = [...items].sort((a, b) =>
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

  const renderJourneySection = (sectionItems: TravelItem[], label: string, isReturn: boolean) => {
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
                    bgColor
                  )}>
                    <Icon className={clsx('w-5 h-5', iconColor)} />
                  </div>
                  <p className="text-xs text-gray-600 mt-1 font-medium max-w-[70px] truncate text-center">
                    {item.fromLocation}
                  </p>
                  <p className="text-[10px] text-gray-400">{formatDate(item.departureDate)}</p>
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
                    <p className="text-[10px] text-gray-400">{formatDate(item.departureDate)}</p>
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
  onUploadBoardingPass,
  onViewDocument,
  onMissingBoardingPass,
}: {
  item: TravelItem;
  documents: Document[];
  declarationsOfTravel: DeclarationOfTravel[];
  token: string;
  onUpdate: (updates: Partial<TravelItem>) => void;
  onDelete: () => void;
  onUploadBoardingPass: () => void;
  onViewDocument: (doc: Document) => void;
  onMissingBoardingPass: () => void;
}) {
  const Icon = transportIcons[item.modeOfTransport];
  const isPlane = item.modeOfTransport === 'PLANE';
  const hasBoardingPass = documents.some(d => d.documentType === 'FLIGHT_BOARDING_PASS');
  const hasDeclaration = declarationsOfTravel.some(dec => dec.travelItemId === item.id);
  const linkedDocument = documents.find(d => d.id === item.documentId);
  const isNonEurCurrency = item.currencyOriginal !== 'EUR';
  const [isConverting, setIsConverting] = useState(false);
  const [conversionInfo, setConversionInfo] = useState<{ rate: number; month: number; year: number } | null>(null);

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

  // Trigger conversion when relevant fields change
  useEffect(() => {
    if (isNonEurCurrency && item.purchaseDate && item.amountOriginal) {
      handleCurrencyConversion();
    }
  }, [item.currencyOriginal, item.amountOriginal, item.purchaseDate]);

  return (
    <div className="p-6 bg-gray-50 rounded-2xl">
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
                  value={item.participantPortion || ''}
                  onChange={(e) => onUpdate({ participantPortion: parseFloat(e.target.value) || 0 })}
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
          <p className="font-semibold text-gray-900">
            {formatCurrency(item.amountEur)}
          </p>
          {item.currencyOriginal !== 'EUR' && (
            <p className="text-xs text-gray-500">
              {formatCurrency(item.amountOriginal, item.currencyOriginal)}
            </p>
          )}
        </div>
        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Linked Document */}
      {linkedDocument && (
        <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200 flex items-center gap-3">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-600 flex-1 truncate">{linkedDocument.renamedFilename}</span>
          <button
            onClick={() => onViewDocument(linkedDocument)}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            View
          </button>
        </div>
      )}

      {!linkedDocument && (
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
              onChange={(e) => onUpdate({ purchaseDate: e.target.value })}
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
        {isPlane && (
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
                value={item.distanceKm || ''}
                onChange={(e) => onUpdate({ distanceKm: parseFloat(e.target.value) || 0 })}
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
  );
}

// Add Travel Modal
function AddTravelModal({
  isOpen,
  onClose,
  token,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
}) {
  const queryClient = useQueryClient();
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

  const uploadAndCreateMutation = useMutation({
    mutationFn: async () => {
      // First upload document if selected
      let documentId: string | undefined;
      if (selectedFile) {
        const uploadResult = await participantApi.uploadDocument(token, selectedFile);
        documentId = uploadResult.document.id;
      }

      // Then create travel item
      return participantApi.createTravelItem(token, {
        ...formData,
        amountEur: formData.amountOriginal, // Will be converted by backend
        documentId,
      });
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
    },
    onError: () => {
      toast.error('Failed to add travel item');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    uploadAndCreateMutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Travel Manually" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-4 bg-blue-50 rounded-xl">
          <p className="text-sm text-blue-800">
            Please upload a supporting document (ticket, invoice, receipt) for this travel item.
            If you don't have a document, you'll need to provide a declaration later.
          </p>
        </div>

        {/* File Upload */}
        <div>
          <label className="label">Supporting Document</label>
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
                <span className="text-sm text-gray-600">Click to upload document</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </label>
            )}
          </div>
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
  });
  const [confirmations, setConfirmations] = useState({
    dataCorrect: false,
    erasmusRules: false,
  });
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [selectedMissingDoc, setSelectedMissingDoc] = useState<DocumentType | null>(null);
  const [declarationTravelItem, setDeclarationTravelItem] = useState<TravelItem | null>(null);

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
                    one or sign a declaration of travel.
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
        onSubmit={(decData) => createDeclarationMutation.mutate(decData)}
        isLoading={createDeclarationMutation.isPending}
      />

      {/* Declaration of Travel Modal (for missing boarding pass) */}
      {declarationTravelItem && (
        <MissingBoardingPassModal
          isOpen={true}
          onClose={() => setDeclarationTravelItem(null)}
          token={token}
          travelItem={declarationTravelItem}
          documents={data.documents}
          participantName={`${data.participant.firstName} ${data.participant.lastName}`}
          participantCountry={data.participant.country}
        />
      )}
    </>
  );
}

// Document View Modal - shows document in a popup
function DocumentViewModal({
  document,
  onClose,
}: {
  document: Document | null;
  onClose: () => void;
}) {
  if (!document) return null;

  const isImage = document.mimeType.startsWith('image/');
  const isPdf = document.mimeType === 'application/pdf';
  const fileUrl = `/api/uploads/${document.storedFilePath}`;

  return (
    <Modal isOpen={!!document} onClose={onClose} title={document.renamedFilename}>
      <div className="max-h-[70vh] overflow-auto">
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
      </div>
      <div className="mt-4 flex justify-end">
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
