const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data.error?.message || 'An error occurred');
  }
  return response.json();
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('admin-auth');
  if (token) {
    try {
      const parsed = JSON.parse(token);
      if (parsed.state?.token) {
        return { Authorization: `Bearer ${parsed.state.token}` };
      }
    } catch {
      // ignore
    }
  }
  return {};
}

// Admin API
export const adminApi = {
  // Auth
  login: async (password: string) => {
    const res = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return handleResponse<{ success: boolean; token: string }>(res);
  },

  // Dashboard
  getDashboardStats: async () => {
    const res = await fetch(`${API_BASE}/admin/dashboard/stats`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<DashboardStats>(res);
  },

  // Projects
  getProjects: async () => {
    const res = await fetch(`${API_BASE}/admin/projects`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<Project[]>(res);
  },

  getProject: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/projects/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<ProjectDetail>(res);
  },

  createProject: async (data: CreateProjectData) => {
    const res = await fetch(`${API_BASE}/admin/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    return handleResponse<ProjectDetail>(res);
  },

  updateProject: async (id: string, data: Partial<CreateProjectData>) => {
    const res = await fetch(`${API_BASE}/admin/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    return handleResponse<ProjectDetail>(res);
  },

  deleteProject: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/projects/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Country Limits
  getCountryLimits: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/admin/projects/${projectId}/country-limits`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<CountryLimit[]>(res);
  },

  setCountryLimit: async (projectId: string, data: { country: string; maxReimbursementAmount: number; greenTravel?: boolean }) => {
    const res = await fetch(`${API_BASE}/admin/projects/${projectId}/country-limits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    return handleResponse<CountryLimit>(res);
  },

  getParticipantCountries: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/admin/projects/${projectId}/participant-countries`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<string[]>(res);
  },

  autoPopulateCountryLimits: async (projectId: string, defaultAmount: number = 0) => {
    const res = await fetch(`${API_BASE}/admin/projects/${projectId}/country-limits/auto-populate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ defaultAmount }),
    });
    return handleResponse<{ message: string; created: CountryLimit[]; totalCountries: number }>(res);
  },

  checkMissingCountryLimits: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/admin/projects/${projectId}/country-limits/check-missing`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{
      hasMissingCountries: boolean;
      missingCountries: string[];
      totalParticipantCountries: number;
      totalExistingLimits: number;
    }>(res);
  },

  deleteCountryLimit: async (projectId: string, country: string) => {
    const res = await fetch(`${API_BASE}/admin/projects/${projectId}/country-limits/${country}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Participants
  getParticipants: async (filters?: { projectId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.status) params.set('status', filters.status);

    const res = await fetch(`${API_BASE}/admin/participants?${params}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<Participant[]>(res);
  },

  createParticipant: async (data: {
    projectId: string;
    firstName: string;
    lastName: string;
    email: string;
    country: string;
  }) => {
    const res = await fetch(`${API_BASE}/admin/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    return handleResponse<Participant>(res);
  },

  getParticipant: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/participants/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<ParticipantDetail>(res);
  },

  updateParticipant: async (id: string, data: Partial<UpdateParticipantData>) => {
    const res = await fetch(`${API_BASE}/admin/participants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    return handleResponse<Participant>(res);
  },

  deleteParticipant: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/participants/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  previewImport: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/admin/participants/preview-import`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
    return handleResponse<ImportPreview>(res);
  },

  importParticipants: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);

    const res = await fetch(`${API_BASE}/admin/participants/import`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
    return handleResponse<ImportResult>(res);
  },

  sendMagicLink: async (participantId: string) => {
    const res = await fetch(`${API_BASE}/admin/participants/${participantId}/send-magic-link`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  sendMagicLinksBulk: async (participantIds: string[]) => {
    const res = await fetch(`${API_BASE}/admin/participants/send-magic-links-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ participantIds }),
    });
    return handleResponse<{ results: { id: string; success: boolean }[] }>(res);
  },

  approveParticipant: async (id: string, data?: { amountToReimburse?: number; adminNotes?: string }) => {
    const res = await fetch(`${API_BASE}/admin/participants/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data || {}),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  markAiCheckOk: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/participants/${id}/mark-ai-check-ok`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  markPaid: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/participants/${id}/mark-paid`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  recalculateSummary: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/participants/${id}/recalculate`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean; summary: ReimbursementSummary }>(res);
  },

  // Travel Items (Admin)
  createTravelItem: async (participantId: string, data: CreateTravelItemData) => {
    const res = await fetch(`${API_BASE}/admin/participants/${participantId}/travel-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    return handleResponse<TravelItem>(res);
  },

  updateTravelItem: async (participantId: string, itemId: string, data: Partial<CreateTravelItemData>) => {
    const res = await fetch(`${API_BASE}/admin/participants/${participantId}/travel-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    return handleResponse<TravelItem>(res);
  },

  deleteTravelItem: async (participantId: string, itemId: string) => {
    const res = await fetch(`${API_BASE}/admin/participants/${participantId}/travel-items/${itemId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Documents (Admin)
  deleteDocument: async (participantId: string, documentId: string) => {
    const res = await fetch(`${API_BASE}/admin/participants/${participantId}/documents/${documentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Export
  exportProjectCsv: (projectId: string) => {
    window.open(`${API_BASE}/admin/projects/${projectId}/export/csv`, '_blank');
  },
};

// Participant API
export const participantApi = {
  authenticate: async (token: string) => {
    const res = await fetch(`${API_BASE}/participant/auth?token=${token}`);
    return handleResponse<ParticipantAuthResponse>(res);
  },

  uploadDocument: async (token: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/participant/documents?token=${token}`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<DocumentUploadResponse>(res);
  },

  deleteDocument: async (token: string, documentId: string) => {
    const res = await fetch(`${API_BASE}/participant/documents/${documentId}?token=${token}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },

  getDocumentUrl: async (token: string, documentId: string) => {
    const res = await fetch(`${API_BASE}/participant/documents/${documentId}/url?token=${token}`);
    return handleResponse<{ url: string }>(res);
  },

  updateTravelItem: async (token: string, itemId: string, data: Partial<CreateTravelItemData>) => {
    const res = await fetch(`${API_BASE}/participant/travel-items/${itemId}?token=${token}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<TravelItem>(res);
  },

  deleteTravelItem: async (token: string, itemId: string) => {
    const res = await fetch(`${API_BASE}/participant/travel-items/${itemId}?token=${token}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },

  createTravelItem: async (token: string, data: CreateTravelItemData & { documentId?: string }) => {
    const res = await fetch(`${API_BASE}/participant/travel-items?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<TravelItem>(res);
  },

  updateBankDetails: async (token: string, data: BankDetails) => {
    const res = await fetch(`${API_BASE}/participant/bank-details?token=${token}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<BankDetails>(res);
  },

  updateNote: async (token: string, note: string) => {
    const res = await fetch(`${API_BASE}/participant/note?token=${token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    return handleResponse<{ participantNote: string }>(res);
  },

  createDeclaration: async (token: string, data: CreateDeclarationData) => {
    const res = await fetch(`${API_BASE}/participant/declarations?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Declaration>(res);
  },

  deleteDeclaration: async (token: string, declarationId: string) => {
    const res = await fetch(`${API_BASE}/participant/declarations/${declarationId}?token=${token}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },

  markComplete: async (token: string) => {
    const res = await fetch(`${API_BASE}/participant/mark-complete?token=${token}`, {
      method: 'POST',
    });
    return handleResponse<{ success: boolean } | { success: false; missingItems: MissingItem[] }>(res);
  },

  validate: async (token: string) => {
    const res = await fetch(`${API_BASE}/participant/validate?token=${token}`);
    return handleResponse<ValidationResult>(res);
  },

  /**
   * Consolidate all uploaded documents into a coherent journey
   * This should be called when moving from Step 1 (Upload) to Step 2 (Review)
   */
  consolidateJourney: async (token: string) => {
    const res = await fetch(`${API_BASE}/participant/consolidate?token=${token}`, {
      method: 'POST',
    });
    return handleResponse<ConsolidationResult>(res);
  },

  /**
   * Get exchange rate for a currency at a specific purchase date
   */
  getExchangeRate: async (token: string, currency: string, purchaseDate?: string) => {
    const params = new URLSearchParams({ currency });
    if (purchaseDate) params.set('purchaseDate', purchaseDate);

    const res = await fetch(`${API_BASE}/participant/exchange-rate?token=${token}&${params}`);
    return handleResponse<ExchangeRateResponse>(res);
  },

  /**
   * Convert amount from a currency to EUR using InforEuro rates
   */
  convertCurrency: async (token: string, amount: number, currency: string, purchaseDate?: string) => {
    const res = await fetch(`${API_BASE}/participant/convert-currency?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency, purchaseDate }),
    });
    return handleResponse<CurrencyConversionResponse>(res);
  },

  // Document linking
  linkDocumentToTravelItem: async (token: string, travelItemId: string, documentId: string) => {
    const res = await fetch(`${API_BASE}/participant/travel-items/${travelItemId}/link-document?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId }),
    });
    return handleResponse<TravelItem>(res);
  },

  unlinkDocumentFromTravelItem: async (token: string, travelItemId: string) => {
    const res = await fetch(`${API_BASE}/participant/travel-items/${travelItemId}/link-document?token=${token}`, {
      method: 'DELETE',
    });
    return handleResponse<TravelItem>(res);
  },

  // Declarations of Travel (with signature)
  getDeclarationsOfTravel: async (token: string) => {
    const res = await fetch(`${API_BASE}/participant/declarations-of-travel?token=${token}`);
    return handleResponse<{ declarations: DeclarationOfTravel[] }>(res);
  },

  createDeclarationOfTravel: async (token: string, data: CreateDeclarationOfTravelData) => {
    const res = await fetch(`${API_BASE}/participant/declarations-of-travel?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<DeclarationOfTravel>(res);
  },

  deleteDeclarationOfTravel: async (token: string, declarationId: string) => {
    const res = await fetch(`${API_BASE}/participant/declarations-of-travel/${declarationId}?token=${token}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Dissemination Activities
  getDisseminationStatus: async (token: string) => {
    const res = await fetch(`${API_BASE}/participant/dissemination/status?token=${token}`);
    return handleResponse<DisseminationStatus>(res);
  },

  getDisseminationActivities: async (token: string) => {
    const res = await fetch(`${API_BASE}/participant/dissemination/activities?token=${token}`);
    return handleResponse<{ activities: DisseminationActivity[]; disseminationEnabled: boolean }>(res);
  },

  createDisseminationActivity: async (token: string, data: CreateDisseminationActivityData) => {
    const res = await fetch(`${API_BASE}/participant/dissemination/activities?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<DisseminationActivity>(res);
  },

  updateDisseminationActivity: async (token: string, activityId: string, data: Partial<CreateDisseminationActivityData>) => {
    const res = await fetch(`${API_BASE}/participant/dissemination/activities/${activityId}?token=${token}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<DisseminationActivity>(res);
  },

  deleteDisseminationActivity: async (token: string, activityId: string) => {
    const res = await fetch(`${API_BASE}/participant/dissemination/activities/${activityId}?token=${token}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },

  uploadDisseminationPhotos: async (token: string, activityId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach(file => formData.append('photos', file));

    const res = await fetch(`${API_BASE}/participant/dissemination/activities/${activityId}/photos?token=${token}`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<{ photos: DisseminationPhoto[]; message: string }>(res);
  },

  deleteDisseminationPhoto: async (token: string, activityId: string, photoId: string) => {
    const res = await fetch(`${API_BASE}/participant/dissemination/activities/${activityId}/photos/${photoId}?token=${token}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Social Media Posts
  getSocialMediaPosts: async (token: string) => {
    const res = await fetch(`${API_BASE}/participant/dissemination/social-media?token=${token}`);
    return handleResponse<{ posts: SocialMediaPost[] }>(res);
  },

  uploadSocialMediaPost: async (token: string, file: File) => {
    const formData = new FormData();
    formData.append('screenshot', file);

    const res = await fetch(`${API_BASE}/participant/dissemination/social-media?token=${token}`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<SocialMediaPost>(res);
  },

  deleteSocialMediaPost: async (token: string, postId: string) => {
    const res = await fetch(`${API_BASE}/participant/dissemination/social-media/${postId}?token=${token}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },
};

export interface ConsolidationResult {
  success: boolean;
  message: string;
  travelItems: TravelItem[];
  warnings: string[];
  missingDocuments?: { type: string; description: string }[];
  documentLinks?: { invoiceDocId: string; boardingPassDocId: string; reason: string }[];
}

// Types
export interface DashboardStats {
  totalProjects: number;
  totalParticipants: number;
  statusCounts: {
    draft: number;
    participantComplete: number;
    adminApproved: number;
    paid: number;
  };
  totalReimbursementEur: number;
  totalToReimburse: number;
  recentProjects: {
    id: string;
    name: string;
    country: string;
    startDate: string;
    endDate: string;
    participantStats: {
      total: number;
      complete: number;
      approved: number;
      paid: number;
    };
  }[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  country: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  stats: {
    totalParticipants: number;
    complete: number;
    approved: number;
    paid: number;
    totalAmount: number;
    allPaid: boolean;
  };
}

export interface ProjectDetail {
  id: string;
  name: string;
  description?: string;
  country: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  countryLimits: CountryLimit[];
}

export interface CountryLimit {
  id: string;
  projectId: string;
  country: string;
  maxReimbursementAmount: number;
  currency: string;
  greenTravel: boolean;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  country: string;
  startDate: string;
  endDate: string;
  disseminationEnabled?: boolean;
}

export interface Participant {
  id: string;
  projectId: string;
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  status: ParticipantStatus;
  lastMagicLinkSentAt?: string;
  project?: {
    name: string;
    country: string;
    disseminationEnabled?: boolean;
  };
  reimbursementSummary?: ReimbursementSummary;
  _count?: {
    documents: number;
    travelItems: number;
    socialMediaPosts?: number;
  };
  disseminationStatus?: {
    hasActivity: boolean;
    hasSocialMedia: boolean;
  };
}

export interface ParticipantDetail extends Participant {
  magicLinkToken: string;
  bankAccountIban?: string;
  bankAccountHolderName?: string;
  bankAccountBic?: string;
  notesInternal?: string;
  participantNote?: string;
  documents: Document[];
  travelItems: TravelItem[];
  declarationsOnHonor: Declaration[];
  changeLogEntries: ChangeLogEntry[];
  maxReimbursementForCountry?: number;
  disseminationStatus?: {
    hasActivity: boolean;
    hasSocialMedia: boolean;
  };
}

export type ParticipantStatus = 'DRAFT' | 'PARTICIPANT_COMPLETE' | 'ADMIN_APPROVED' | 'PAID';

export interface UpdateParticipantData {
  firstName?: string;
  lastName?: string;
  email?: string;
  country?: string;
  notesInternal?: string;
}

export interface ReimbursementSummary {
  id: string;
  participantId: string;
  totalEur: number;
  maxReimbursementAllowed: number;
  amountToReimburse: number;
  adminNotes?: string;
  aiCheckOk: boolean;
  adminApproved: boolean;
  paid: boolean;
}

export interface Document {
  id: string;
  participantId: string;
  storedFilePath: string;
  originalFilename: string;
  renamedFilename: string;
  mimeType: string;
  fileSize: number;
  uploadDate: string;
  documentType: DocumentType;
  ocrText?: string;
}

export type DocumentType =
  | 'FLIGHT_INVOICE'
  | 'FLIGHT_BOARDING_PASS'
  | 'TRAIN_TICKET'
  | 'BUS_TICKET'
  | 'FUEL_RECEIPT'
  | 'GREEN_TRAVEL_DECLARATION'
  | 'HOTEL_INVOICE'
  | 'OTHER';

export interface TravelItem {
  id: string;
  participantId: string;
  documentId?: string;
  modeOfTransport: TransportMode;
  fromLocation: string;
  toLocation: string;
  departureDate: string;
  arrivalDate?: string;
  bookingReference?: string;
  flightNumber?: string;
  amountOriginal: number;
  currencyOriginal: string;
  purchaseDate?: string;
  amountEur: number;
  comment?: string;
  // Round-trip and price allocation
  tripGroupId?: string;
  priceAllocation?: number;
  totalGroupPrice?: number;
  // Multi-passenger bookings
  numberOfPassengers?: number;
  participantPortion?: number;
  // Car travel specific
  distanceKm?: number;
  isDriverCarpool?: boolean;
  // Validation
  routeMatchesCountry?: boolean;
  validationWarnings?: string;
}

export type TransportMode = 'PLANE' | 'TRAIN' | 'BUS' | 'CAR' | 'FERRY' | 'OTHER';

export interface CreateTravelItemData {
  modeOfTransport: TransportMode;
  fromLocation: string;
  toLocation: string;
  departureDate: string;
  arrivalDate?: string;
  bookingReference?: string;
  flightNumber?: string;
  amountOriginal: number;
  currencyOriginal: string;
  purchaseDate?: string;
  amountEur: number;
  comment?: string;
}

export interface Declaration {
  id: string;
  participantId: string;
  missingDocumentType: DocumentType;
  description: string;
  reason: string;
  place: string;
  declarationDate: string;
}

export interface CreateDeclarationData {
  missingDocumentType: DocumentType;
  description: string;
  reason: string;
  place: string;
}

export interface ChangeLogEntry {
  id: string;
  participantId: string;
  userType: 'PARTICIPANT' | 'ADMIN';
  fieldName: string;
  previousValue?: string;
  newValue?: string;
  changedAt: string;
}

export interface BankDetails {
  bankAccountIban: string;
  bankAccountHolderName: string;
  bankAccountBic?: string;
}

export interface ImportPreview {
  totalRows: number;
  columns: string[];
  preview: {
    firstName: string;
    lastName: string;
    email: string;
    country: string;
  }[];
}

export interface ImportResult {
  success: boolean;
  created: number;
  errors: { row: number; error: string }[];
  participants: Participant[];
}

export interface MissingItem {
  type: 'document' | 'field' | 'data';
  description: string;
  travelItemId?: string;
  documentType?: DocumentType;
}

export interface ValidationResult {
  isComplete: boolean;
  missingItems: MissingItem[];
  warnings: string[];
  aiCheckPassed: boolean;
}

export interface ParticipantAuthResponse {
  participant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    country: string;
    status: ParticipantStatus;
    bankAccountIban?: string;
    bankAccountHolderName?: string;
    bankAccountBic?: string;
    participantNote?: string;
  };
  project: {
    id: string;
    name: string;
    description?: string;
    country: string;
    startDate: string;
    endDate: string;
    disseminationEnabled?: boolean;
  };
  documents: Document[];
  travelItems: TravelItem[];
  reimbursementSummary?: ReimbursementSummary;
  declarationsOnHonor: Declaration[];
  declarationsOfTravel?: DeclarationOfTravel[];
  maxReimbursementForCountry?: number;
  greenTravel?: boolean;
  validation: ValidationResult;
  disseminationStatus?: {
    hasDisseminationActivity: boolean;
    hasSocialMediaPost: boolean;
  };
}

export interface DocumentUploadResponse {
  document: Document;
  extractedTravelItems: TravelItem[];
  analysis: {
    confidence: number;
    warnings: string[];
  };
}

export interface ExchangeRateResponse {
  currency: string;
  rateToEur: number;
  year?: number;
  month?: number;
  supportedCurrencies: string[];
}

export interface CurrencyConversionResponse {
  originalAmount: number;
  originalCurrency: string;
  eurAmount: number;
  rateToEur: number;
  purchaseDate: string;
  year: number;
  month: number;
}

// Declaration of Travel types
export interface DeclarationOfTravel {
  id: string;
  participantId: string;
  travelItemId?: string;
  name: string;
  modeOfTransport: TransportMode;
  fromPlace: string;
  toPlace: string;
  travelDate: string;
  flightNumber?: string;
  bookingReference?: string;
  dateOfBirth: string;
  idNumber: string;
  sendingOrgName: string;
  sendingOrgOid?: string;
  sendingOrgAddress: string;
  signatureDataUrl: string;
  signedAt: string;
  generatedPdfPath?: string;
  travelItem?: {
    id: string;
    modeOfTransport: TransportMode;
    fromLocation: string;
    toLocation: string;
    departureDate: string;
    flightNumber?: string;
  };
}

export interface CreateDeclarationOfTravelData {
  travelItemId?: string;
  name: string;
  modeOfTransport: TransportMode;
  fromPlace: string;
  toPlace: string;
  travelDate: string;
  flightNumber?: string;
  bookingReference?: string;
  dateOfBirth: string;
  idNumber: string;
  sendingOrgName: string;
  sendingOrgOid?: string;
  sendingOrgAddress: string;
  signatureDataUrl: string;
}

// Dissemination types
export interface DisseminationStatus {
  disseminationEnabled: boolean;
  hasDisseminationActivity: boolean;
  hasSocialMediaPost: boolean;
  activityCount: number;
  socialMediaCount: number;
}

export interface DisseminationActivity {
  id: string;
  projectId: string;
  country: string;
  title: string;
  description: string;
  activityDate?: string;
  createdById: string;
  createdAt: string;
  photos: DisseminationPhoto[];
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  isOwner: boolean;
}

export interface DisseminationPhoto {
  id: string;
  disseminationActivityId: string;
  storedFilePath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface CreateDisseminationActivityData {
  title: string;
  description: string;
  activityDate?: string;
}

export interface SocialMediaPost {
  id: string;
  participantId: string;
  storedFilePath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  description?: string;
  uploadedAt: string;
}
