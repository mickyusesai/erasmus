const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

export class ApiError extends Error {
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

  deleteTravelItem: async (token: string, itemId: string, deleteDocuments = false) => {
    const params = new URLSearchParams({ token });
    if (deleteDocuments) params.set('deleteDocuments', 'true');
    const res = await fetch(`${API_BASE}/participant/travel-items/${itemId}?${params}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean; deletedDocuments?: number }>(res);
  },

  toggleTravelItemChecked: async (token: string, itemId: string) => {
    const res = await fetch(`${API_BASE}/participant/travel-items/${itemId}/toggle-checked?token=${token}`, {
      method: 'PATCH',
    });
    return handleResponse<TravelItem>(res);
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

  setNoReimbursement: async (token: string, noReimbursement: boolean) => {
    const res = await fetch(`${API_BASE}/participant/no-reimbursement?token=${token}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noReimbursement }),
    });
    return handleResponse<{ noReimbursement: boolean }>(res);
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

  /**
   * Validate if a city is in a given country using geocoding
   */
  validateCityCountry: async (token: string, city: string, country: string) => {
    const params = new URLSearchParams({ city, country });
    const res = await fetch(`${API_BASE}/participant/validate-city-country?token=${token}&${params}`);
    return handleResponse<CityCountryValidationResponse>(res);
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

  unlinkDocumentFromTravelItem: async (token: string, travelItemId: string, documentId: string) => {
    const res = await fetch(`${API_BASE}/participant/travel-items/${travelItemId}/link-document?token=${token}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId }),
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

  updateDeclarationOfTravel: async (token: string, declarationId: string, data: { travelItemId?: string | null }) => {
    const res = await fetch(`${API_BASE}/participant/declarations-of-travel/${declarationId}?token=${token}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<DeclarationOfTravel>(res);
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

// =============================================================================
// Organisation API (for organisation dashboard)
// =============================================================================

function getOrgAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('org-token');
  if (token) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }
  return { 'Content-Type': 'application/json' };
}

export const organisationApi = {
  // Auth
  register: async (data: { name: string; email: string; password: string; oid?: string }) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ message: string; token: string; organisation: OrganisationInfo }>(res);
  },

  login: async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse<{ message: string; token: string; organisation: OrganisationInfo }>(res);
  },

  claimFoundingCredit: async (data: { name: string; email: string; password: string; oid: string }) => {
    const res = await fetch(`${API_BASE}/auth/claim-founding-credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ message: string; token: string; organisation: OrganisationInfo }>(res);
  },

  getMe: async () => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ organisation: OrganisationInfo; stats: { projectCount: number; participantCount: number } }>(res);
  },

  forgotPassword: async (email: string) => {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return handleResponse<{ message: string }>(res);
  },

  resetPassword: async (token: string, newPassword: string) => {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    return handleResponse<{ message: string }>(res);
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return handleResponse<{ message: string }>(res);
  },

  updateProfile: async (data: { name?: string; email?: string; legalName?: string | null; vatNumber?: string | null }) => {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PATCH',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ message: string; organisation: { id: string; name: string; email: string; legalName?: string | null; vatNumber?: string | null } }>(res);
  },

  // Dashboard
  getDashboard: async () => {
    const res = await fetch(`${API_BASE}/organisation/dashboard`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<OrgDashboardData>(res);
  },

  // Projects
  getProjects: async () => {
    const res = await fetch(`${API_BASE}/organisation/projects`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ projects: OrgProject[] }>(res);
  },

  getProject: async (id: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${id}`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ project: OrgProjectDetail }>(res);
  },

  createProject: async (data: CreateOrgProjectData) => {
    const res = await fetch(`${API_BASE}/organisation/projects`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ message: string; project: OrgProject; creditUsed: string }>(res);
  },

  updateProject: async (id: string, data: Partial<CreateOrgProjectData>) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${id}`, {
      method: 'PATCH',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ message: string; project: OrgProject; recalc?: ProjectRecalcResult }>(res);
  },

  // (Re)send the "project ended — build your trips" email to unsubmitted participants
  notifyProjectEnded: async (id: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${id}/notify-ended`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ sent: number }>(res);
  },

  // Exchange-rate per-currency overrides
  getProjectCurrencyRates: async (id: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${id}/currency-rates`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<ProjectCurrencyRates>(res);
  },

  updateProjectCurrencyRates: async (id: string, overrides: { currencyCode: string; rate: number }[]) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${id}/currency-rates`, {
      method: 'PUT',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify({ overrides }),
    });
    return handleResponse<{ message: string; recalc: ProjectRecalcResult }>(res);
  },

  deleteProject: async (id: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${id}`, {
      method: 'DELETE',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },

  // Billing
  getBilling: async () => {
    const res = await fetch(`${API_BASE}/organisation/billing`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<OrgBillingData>(res);
  },

  // Affiliate
  getAffiliate: async () => {
    const res = await fetch(`${API_BASE}/organisation/affiliate`, { headers: getOrgAuthHeaders() });
    return handleResponse<AffiliateDashboardData>(res);
  },

  requestAffiliatePayout: async () => {
    const res = await fetch(`${API_BASE}/organisation/affiliate/request-payout`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean; pendingBalanceCents: number; message: string }>(res);
  },

  // Settings
  getSettings: async () => {
    const res = await fetch(`${API_BASE}/organisation/settings`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ organisation: OrganisationInfo }>(res);
  },

  // Participants
  getProjectParticipants: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/participants`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ participants: OrgParticipant[] }>(res);
  },

  createParticipant: async (projectId: string, data: { firstName: string; lastName: string; email: string; country: string }) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/participants`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ participant: OrgParticipant }>(res);
  },

  previewImport: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('org-token');
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/participants/preview-import`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    return handleResponse<ImportPreview>(res);
  },

  importParticipants: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('org-token');
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/participants/import`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    return handleResponse<ImportResult>(res);
  },

  getParticipant: async (id: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${id}`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ participant: OrgParticipantDetail }>(res);
  },

  updateParticipant: async (id: string, data: Partial<{ firstName: string; lastName: string; email: string; country: string; notesInternal: string }>) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${id}`, {
      method: 'PATCH',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ participant: OrgParticipant }>(res);
  },

  deleteParticipant: async (id: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${id}`, {
      method: 'DELETE',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  resetParticipant: async (id: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${id}/reset`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  bulkDeleteParticipants: async (ids: string[]) => {
    const res = await fetch(`${API_BASE}/organisation/participants/bulk-delete`, {
      method: 'POST',
      headers: { ...getOrgAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return handleResponse<{ success: boolean; deletedCount: number }>(res);
  },

  downloadAuditPdf: async (participantId: string, participantName: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/audit-pdf`, {
      headers: getOrgAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to generate audit PDF');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Audit_${participantName.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  sendMagicLink: async (participantId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/send-magic-link`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  sendMagicLinksBulk: async (participantIds: string[]) => {
    const res = await fetch(`${API_BASE}/organisation/participants/send-magic-links-bulk`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify({ participantIds }),
    });
    return handleResponse<{ results: { id: string; success: boolean }[] }>(res);
  },

  sendReminder: async (participantId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/send-reminder`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  sendRemindersBulk: async (participantIds: string[]) => {
    const res = await fetch(`${API_BASE}/organisation/participants/send-reminders-bulk`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify({ participantIds }),
    });
    return handleResponse<{ results: { id: string; success: boolean }[] }>(res);
  },

  approveParticipant: async (id: string, data?: { amountToReimburse?: number; adminNotes?: string }) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${id}/approve`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify(data || {}),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  markPaid: async (id: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${id}/mark-paid`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  markAiCheckOk: async (id: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${id}/mark-ai-check-ok`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  getDocumentUrl: async (participantId: string, documentId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/documents/${documentId}/url`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ url: string }>(res);
  },

  getReviewFindings: async (participantId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/review-findings`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ findings: ReviewFinding[] }>(res);
  },

  toggleReviewFinding: async (participantId: string, findingId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/review-findings/${findingId}/toggle`, {
      method: 'PATCH',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ finding: ReviewFinding }>(res);
  },

  refreshReviewFindings: async (participantId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/review-findings/refresh`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ findings: ReviewFinding[] }>(res);
  },

  // Travel Item CRUD
  createTravelItem: async (participantId: string, data: CreateTravelItemData) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/travel-items`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<TravelItem>(res);
  },

  updateTravelItem: async (participantId: string, itemId: string, data: Partial<CreateTravelItemData>) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/travel-items/${itemId}`, {
      method: 'PATCH',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<TravelItem>(res);
  },

  deleteTravelItem: async (participantId: string, itemId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/travel-items/${itemId}`, {
      method: 'DELETE',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Document management
  uploadDocument: async (participantId: string, file: File, documentType: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    const token = localStorage.getItem('org-token');
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    return handleResponse<Document>(res);
  },

  deleteDocument: async (participantId: string, documentId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/documents/${documentId}`, {
      method: 'DELETE',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  linkDocument: async (participantId: string, itemId: string, documentId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/travel-items/${itemId}/link-document`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify({ documentId }),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  unlinkDocument: async (participantId: string, itemId: string, documentId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/travel-items/${itemId}/link-document`, {
      method: 'DELETE',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify({ documentId }),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  recalculateSummary: async (participantId: string) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/recalculate-summary`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ summary: ReimbursementSummary }>(res);
  },

  // Reopen reimbursement
  reopenReimbursement: async (participantId: string, data: { message: string; clearAiReview?: boolean; clearTravelItems?: boolean; clearDocuments?: boolean }) => {
    const res = await fetch(`${API_BASE}/organisation/participants/${participantId}/reopen`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Country Limits
  getCountryLimits: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/country-limits`, {
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<CountryLimit[]>(res);
  },

  setCountryLimit: async (projectId: string, data: { country: string; maxReimbursementAmount: number; greenTravel?: boolean }) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/country-limits`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<CountryLimit>(res);
  },

  deleteCountryLimit: async (projectId: string, country: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/country-limits/${country}`, {
      method: 'DELETE',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Stripe
  createCheckoutSession: async (type: 'SINGLE' | 'PACK_5' | 'PACK_10') => {
    const res = await fetch(`${API_BASE}/organisation/stripe/create-checkout-session`, {
      method: 'POST',
      headers: { ...getOrgAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    return handleResponse<{ url: string }>(res);
  },

  upgradeTestProject: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/upgrade-from-test`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  expandProjectCapacity: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/expand-capacity`, {
      method: 'POST',
      headers: getOrgAuthHeaders(),
    });
    return handleResponse<{ success: boolean; newLimit: number; message: string }>(res);
  },

  // Export
  exportProjectCsv: async (projectId: string, projectName: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/export/csv`, {
      headers: getOrgAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to export CSV');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}_participants.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  exportAuditZip: async (projectId: string, projectName: string) => {
    const res = await fetch(`${API_BASE}/organisation/projects/${projectId}/export/audit-zip`, {
      headers: getOrgAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to export audit ZIP');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Audit_${projectName.replace(/[^a-z0-9]/gi, '_')}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// Organisation Types
export interface OrganisationInfo {
  id: string;
  name: string;
  email: string;
  oid?: string;
  legalName?: string | null;
  vatNumber?: string | null;
  projectCredits: number;
  hasAnnualLicense: boolean;
  annualLicenseExpiresAt?: string;
  annualLicenseStartedAt?: string;
  createdAt?: string;
}

export interface OrgCreditStatus {
  available: number;
  canCreateProject: boolean;
  reason?: string;
}

export interface OrgProject {
  id: string;
  name: string;
  description?: string;
  country: string;
  venueAddress?: string;
  startDate: string;
  endDate: string;
  disseminationEnabled: boolean;
  carRatePerKm: number;
  exchangeRateMode?: ExchangeRateMode;
  exchangeRateManualDate?: string | null;
  aiAnalysisUnlocked?: boolean;
  participantCount: number;
  creditSource?: string;
  isTestProject: boolean;
  maxParticipants?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface OrgProjectDetail extends OrgProject {
  countryLimits: { id: string; country: string; maxReimbursementAmount: number; currency: string; greenTravel: boolean }[];
  participants: { id: string; firstName: string; lastName: string; email: string; country: string; status: string; createdAt: string }[];
}

export interface OrgDashboardData {
  organisation: { id: string; name: string; email: string; isAffiliate?: boolean; affiliateActive?: boolean };
  credits: OrgCreditStatus;
  stats: { projectCount: number; totalParticipants: number };
  projects: OrgProject[];
  recentPurchases: OrgPurchase[];
}

export interface OrgPurchase {
  id: string;
  type: string;
  amountCents: number;
  currency: string;
  creditsGranted: number;
  status?: string;
  stripeInvoiceUrl?: string;
  createdAt: string;
  completedAt?: string;
}

export interface OrgBillingData {
  credits: OrgCreditStatus & { projectCredits: number };
  purchases: OrgPurchase[];
  organisation?: { isAffiliate: boolean; affiliateActive: boolean };
}

export interface AffiliateCustomerPurchase {
  purchaseId: string;
  completedAt: string | null;
  purchaseType: string;
  amountCents: number;
  commissionCents: number;
  commissionStatus: 'PENDING' | 'PAID' | 'REVERSED';
}

export interface AffiliateCustomer {
  orgName: string;
  linkedAt: string;
  purchases: AffiliateCustomerPurchase[];
}

export interface AffiliateDashboardData {
  affiliateCode: string | null;
  commissionRate: number | null;
  affiliateActive: boolean;
  linkedCustomers: AffiliateCustomer[];
  totalEarnedCents: number;
  pendingBalanceCents: number;
  minPayoutCents: number;
}

export interface SuperAdminAffiliate {
  id: string;
  name: string;
  email: string;
  affiliateCode: string | null;
  affiliateActive: boolean;
  commissionRate: number | null;
  linkedCustomerCount: number;
  totalEarnedCents: number;
  pendingBalanceCents: number;
  createdAt: string;
}

export type ExchangeRateMode = 'PURCHASE_DATE' | 'PROJECT_END_DATE' | 'MANUAL_DATE';

export interface CreateOrgProjectData {
  name: string;
  description?: string;
  country: string;
  venueAddress?: string;
  startDate: string;
  endDate: string;
  carRatePerKm?: number;
  exchangeRateMode?: ExchangeRateMode;
  exchangeRateManualDate?: string | null;
  aiAnalysisUnlocked?: boolean;
}

export interface ProjectRecalcResult {
  participantsUpdated: number;
  itemsUpdated: number;
  itemsSkippedPaid: number;
  itemsSkippedOverride: number;
}

export interface ProjectCurrencyRates {
  exchangeRateMode: ExchangeRateMode;
  exchangeRateManualDate: string | null;
  overrides: { currencyCode: string; rate: number }[];
  detectedCurrencies: { currencyCode: string; effectiveRate: number; hasOverride: boolean }[];
}

export interface OrgParticipant {
  id: string;
  projectId: string;
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  status: ParticipantStatus;
  lastMagicLinkSentAt?: string;
  createdAt: string;
  reimbursementSummary?: ReimbursementSummary;
  _count?: {
    documents: number;
    travelItems: number;
  };
  disseminationStatus?: {
    hasActivity: boolean;
    hasSocialMedia: boolean;
  };
}

export interface OrgParticipantDetail extends OrgParticipant {
  magicLinkToken: string;
  magicLinkActive: boolean;
  aiReviewStatus: 'NOT_STARTED' | 'PENDING' | 'COMPLETE' | 'FAILED';
  bankAccountIban?: string;
  bankAccountHolderName?: string;
  bankAccountBic?: string;
  bankName?: string;
  personalAddress?: string;
  personalCity?: string;
  personalPostalCode?: string;
  personalCountry?: string;
  notesInternal?: string;
  participantNote?: string;
  documents: Document[];
  travelItems: TravelItem[];
  declarationsOnHonor: Declaration[];
  declarationsOfTravel: DeclarationOfTravel[];
  changeLogEntries: ChangeLogEntry[];
  maxReimbursementForCountry?: number;
  greenTravel?: boolean;
  project: {
    id: string;
    name: string;
    country: string;
    startDate: string;
    endDate: string;
    disseminationEnabled: boolean;
    carRatePerKm: number;
  };
}

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
  noReimbursement?: boolean;
  lastMagicLinkSentAt?: string;
  reopenedAt?: string;
  reopenMessage?: string;
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
  bankName?: string;
  personalAddress?: string;
  personalCity?: string;
  personalPostalCode?: string;
  personalCountry?: string;
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
  additionalDocumentIds?: string;  // JSON array of additional document IDs
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
  consolidationNotes?: string;
  // Edit tracking
  manuallyEdited?: boolean;
  originalAmountFromAi?: number;
  priceMissing?: boolean;
  // Round-trip bookings
  isRoundTrip?: boolean;
  bookingId?: string | null;  // Shared by all legs of the same booking (round-trip / multi-leg)
  tripGroupId?: string;  // Legacy
  priceAllocation?: number;  // Legacy
  totalGroupPrice?: number;  // Legacy
  amountIncludedInRoundTrip?: boolean;  // True if this leg's amount is included in another leg's round-trip price
  // Luggage fee merged into this flight
  luggageAmount?: number;
  luggageAmountEur?: number;
  luggageDocumentId?: string;
  purchaseDateAutoFilled?: boolean;
  // Multi-passenger bookings
  numberOfPassengers?: number;
  participantPortion?: number;
  // Car travel specific
  distanceKm?: number;
  isDriverCarpool?: boolean;
  // Validation
  routeMatchesCountry?: boolean;
  validationWarnings?: string;
  // User confirmation
  checked?: boolean;
  // Exclusion from reimbursement
  excludedFromReimbursement?: boolean;
  // Currency and company info
  originalCurrencyFromAi?: string | null;
  exchangeRateOverride?: number | null;
  companyName?: string | null;
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
  // Document linking (for updates)
  documentId?: string | null;
  additionalDocumentIds?: string | null;  // JSON array string
  // Car travel specific
  distanceKm?: number;
  isDriverCarpool?: boolean;
  // Organisation overrides
  exchangeRateOverride?: number | null;
  companyName?: string | null;
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

export interface ReviewFinding {
  id: string;
  severity: 'critical' | 'important' | 'info';
  message: string;
  category: string;
  checked: boolean;
  travelItemId?: string | null;
  createdAt: string;
}

export interface BankDetails {
  bankAccountIban: string;
  bankAccountHolderName: string;
  bankAccountBic?: string;
  bankName?: string;
  personalAddress?: string;
  personalCity?: string;
  personalPostalCode?: string;
  personalCountry?: string;
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
    bankName?: string;
    personalAddress?: string;
    personalCity?: string;
    personalPostalCode?: string;
    personalCountry?: string;
    participantNote?: string;
    detectedHomeCountry?: string | null;
    homeCountryConfidence?: number | null;
    homeCountryReasoning?: string | null;
    reopenedAt?: string;
    reopenMessage?: string;
    noReimbursement?: boolean;
  };
  project: {
    id: string;
    name: string;
    description?: string;
    country: string;
    startDate: string;
    endDate: string;
    disseminationEnabled?: boolean;
    carRatePerKm?: number;
    aiAnalysisUnlocked?: boolean;
    organisation?: {
      id: string;
      name: string;
      oid?: string;
    } | null;
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

export interface CityCountryValidationResponse {
  city: string;
  expectedCountry: string;
  detectedCountry: string | null;
  matches: boolean;
}

// Declaration on Honor (Declaration of Travel) types
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
  reason?: string | null;
  isCarTravel?: boolean;
  licensePlate?: string | null;
  driverName?: string | null;
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
  reason?: string;
  isCarTravel?: boolean;
  licensePlate?: string;
  driverName?: string;
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

// =============================================================================
// Super Admin API
// =============================================================================

function getSuperAdminHeaders(): HeadersInit {
  const token = localStorage.getItem('super-admin-token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface SuperAdminParticipantSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  magicLinkToken: string;
  magicLinkActive: boolean;
  tokenExpiresAt?: string;
  createdAt: string;
}

export interface SuperAdminProject {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  participants: SuperAdminParticipantSummary[];
}

export interface SuperAdminPurchase {
  id: string;
  type: string;
  amountCents: number;
  currency: string;
  creditsGranted: number;
  status: string;
  completedAt?: string;
  createdAt: string;
}

export interface SuperAdminOrg {
  id: string;
  name: string;
  email: string;
  projectCredits: number;
  hasAnnualLicense: boolean;
  annualLicenseExpiresAt?: string;
  isActive: boolean;
  createdAt: string;
  projects: SuperAdminProject[];
  purchases: SuperAdminPurchase[];
}

export const superAdminApi = {
  getOrganisations: async () => {
    const res = await fetch(`${API_BASE}/super-admin/organisations`, { headers: getSuperAdminHeaders() });
    return handleResponse<{ organisations: SuperAdminOrg[]; stats: { totalOrganisations: number; totalProjects: number; totalCreditsOutstanding: number } }>(res);
  },

  getOrganisation: async (id: string) => {
    const res = await fetch(`${API_BASE}/super-admin/organisations/${id}`, { headers: getSuperAdminHeaders() });
    return handleResponse<{ organisation: SuperAdminOrg }>(res);
  },

  updateOrgEmail: async (id: string, email: string, reason: string) => {
    const res = await fetch(`${API_BASE}/super-admin/organisations/${id}`, {
      method: 'PATCH',
      headers: getSuperAdminHeaders(),
      body: JSON.stringify({ email, reason }),
    });
    return handleResponse<{ message: string; organisation: SuperAdminOrg }>(res);
  },

  grantCredits: async (orgId: string, credits: number) => {
    const res = await fetch(`${API_BASE}/super-admin/organisations/${orgId}/grant-credits`, {
      method: 'POST',
      headers: getSuperAdminHeaders(),
      body: JSON.stringify({ credits }),
    });
    return handleResponse<{ message: string }>(res);
  },

  toggleOrgActive: async (orgId: string) => {
    const res = await fetch(`${API_BASE}/super-admin/organisations/${orgId}/toggle-active`, {
      method: 'POST',
      headers: getSuperAdminHeaders(),
    });
    return handleResponse<{ message: string; organisation: SuperAdminOrg }>(res);
  },

  forceReopenParticipant: async (participantId: string, message?: string) => {
    const res = await fetch(`${API_BASE}/super-admin/participants/${participantId}/force-reopen`, {
      method: 'POST',
      headers: getSuperAdminHeaders(),
      body: JSON.stringify({ message }),
    });
    return handleResponse<{ message: string; previousStatus: string }>(res);
  },

  regenerateParticipantToken: async (participantId: string, sendEmail: boolean) => {
    const res = await fetch(`${API_BASE}/super-admin/participants/${participantId}/regenerate-token`, {
      method: 'POST',
      headers: getSuperAdminHeaders(),
      body: JSON.stringify({ sendEmail }),
    });
    return handleResponse<{ message: string; newToken: string; magicLink: string; tokenExpiresAt: string }>(res);
  },

  mergeParticipants: async (targetId: string, sourceId: string) => {
    const res = await fetch(`${API_BASE}/super-admin/participants/${targetId}/merge-from/${sourceId}`, {
      method: 'POST',
      headers: getSuperAdminHeaders(),
    });
    return handleResponse<{ message: string; targetId: string; sourceDeleted: string }>(res);
  },

  transferParticipant: async (participantId: string, targetProjectId: string) => {
    const res = await fetch(`${API_BASE}/super-admin/participants/${participantId}/transfer-to-project`, {
      method: 'POST',
      headers: getSuperAdminHeaders(),
      body: JSON.stringify({ targetProjectId }),
    });
    return handleResponse<{ message: string }>(res);
  },

  recalculateTokenExpiry: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/super-admin/projects/${projectId}/recalculate-token-expiry`, {
      method: 'POST',
      headers: getSuperAdminHeaders(),
    });
    return handleResponse<{ message: string; participantsUpdated: number; newTokenExpiresAt: string }>(res);
  },

  refundPurchase: async (purchaseId: string, reason: string) => {
    const res = await fetch(`${API_BASE}/super-admin/purchases/${purchaseId}/refund`, {
      method: 'POST',
      headers: getSuperAdminHeaders(),
      body: JSON.stringify({ reason }),
    });
    return handleResponse<{ message: string; creditsRestored: number }>(res);
  },

  // Affiliates
  getAffiliates: async () => {
    const res = await fetch(`${API_BASE}/super-admin/affiliates`, { headers: getSuperAdminHeaders() });
    return handleResponse<{ affiliates: SuperAdminAffiliate[] }>(res);
  },

  createAffiliate: async (data: { organisationId: string; affiliateCode: string; commissionRate: number }) => {
    const res = await fetch(`${API_BASE}/super-admin/affiliates`, {
      method: 'POST',
      headers: getSuperAdminHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ message: string }>(res);
  },

  toggleAffiliateActive: async (orgId: string) => {
    const res = await fetch(`${API_BASE}/super-admin/affiliates/${orgId}/toggle-active`, {
      method: 'PATCH',
      headers: getSuperAdminHeaders(),
    });
    return handleResponse<{ message: string; affiliateActive: boolean }>(res);
  },

  getAffiliatePayoutRequests: async () => {
    const res = await fetch(`${API_BASE}/super-admin/affiliates/payout-requests`, { headers: getSuperAdminHeaders() });
    return handleResponse<{ affiliates: Array<{ id: string; name: string; email: string; affiliateCode: string | null; pendingBalanceCents: number }> }>(res);
  },

  confirmAffiliatePayout: async (orgId: string, notes?: string) => {
    const res = await fetch(`${API_BASE}/super-admin/affiliates/${orgId}/confirm-payout`, {
      method: 'POST',
      headers: getSuperAdminHeaders(),
      body: JSON.stringify({ notes }),
    });
    return handleResponse<{ payout: { id: string; amountCents: number }; commissionsUpdated: number; totalCents: number }>(res);
  },
};
