import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, RefreshCw, Mail, CreditCard, Users, ChevronDown, ChevronRight,
  RotateCcw, Key, Copy, Check, ArrowRight, GitMerge, AlertTriangle,
} from 'lucide-react';
import {
  superAdminApi,
  SuperAdminOrg,
  SuperAdminProject,
  SuperAdminParticipantSummary,
  SuperAdminPurchase,
} from '../../services/api';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-600/20 text-gray-300',
    PARTICIPANT_COMPLETE: 'bg-blue-600/20 text-blue-300',
    ADMIN_APPROVED: 'bg-green-600/20 text-green-300',
    PAID: 'bg-emerald-600/20 text-emerald-300',
  };
  const cls = map[status] ?? 'bg-gray-600/20 text-gray-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function purchaseStatusBadge(status: string) {
  const map: Record<string, string> = {
    COMPLETED: 'bg-green-600/20 text-green-300',
    PENDING: 'bg-yellow-600/20 text-yellow-300',
    REFUNDED: 'bg-purple-600/20 text-purple-300',
    FAILED: 'bg-red-600/20 text-red-300',
    EXPIRED: 'bg-gray-600/20 text-gray-400',
  };
  const cls = map[status] ?? 'bg-gray-600/20 text-gray-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ---- Force Reopen Modal ----
function ForceReopenModal({
  participant,
  onConfirm,
  onClose,
  isPending,
}: {
  participant: SuperAdminParticipantSummary;
  onConfirm: (msg: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [msg, setMsg] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-2">Force Reopen Participant</h3>
        <p className="text-gray-400 text-sm mb-4">
          This will set <span className="text-white font-medium">{participant.firstName} {participant.lastName}</span> back to DRAFT status, clearing any AI review findings and approvals.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Message to participant <span className="text-gray-500">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="e.g., Please correct your bank details and resubmit."
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(msg)}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isPending ? 'Reopening...' : 'Force Reopen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Regenerate Token Result Modal ----
function TokenResultModal({
  result,
  onClose,
}: {
  result: { newToken: string; magicLink: string; tokenExpiresAt: string };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(result.magicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 max-w-lg w-full mx-4 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-2">Token Regenerated</h3>
        <p className="text-gray-400 text-sm mb-4">
          New token expires: <span className="text-white">{new Date(result.tokenExpiresAt).toLocaleDateString()}</span>
        </p>
        <div className="bg-gray-900 rounded-lg p-3 mb-4 break-all">
          <p className="text-xs text-gray-400 mb-1">Magic link URL:</p>
          <p className="text-green-400 text-xs font-mono">{result.magicLink}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={copy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Project Accordion Row ----
function ProjectSection({
  project,
  orgId,
}: {
  project: SuperAdminProject;
  orgId: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<SuperAdminParticipantSummary | null>(null);
  const [tokenResult, setTokenResult] = useState<{ newToken: string; magicLink: string; tokenExpiresAt: string } | null>(null);

  const forceReopenMutation = useMutation({
    mutationFn: ({ id, msg }: { id: string; msg: string }) =>
      superAdminApi.forceReopenParticipant(id, msg),
    onSuccess: (data) => {
      toast.success(`Participant reopened (was ${data.previousStatus})`);
      queryClient.invalidateQueries({ queryKey: ['super-admin-org', orgId] });
      setReopenTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: (id: string) => superAdminApi.regenerateParticipantToken(id, false),
    onSuccess: (data) => {
      toast.success('Token regenerated');
      queryClient.invalidateQueries({ queryKey: ['super-admin-org', orgId] });
      setTokenResult({ newToken: data.newToken, magicLink: data.magicLink, tokenExpiresAt: data.tokenExpiresAt });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recalcExpiryMutation = useMutation({
    mutationFn: () => superAdminApi.recalculateTokenExpiry(project.id),
    onSuccess: (data) => {
      toast.success(`Updated ${data.participantsUpdated} participant(s). New expiry: ${new Date(data.newTokenExpiresAt).toLocaleDateString()}`);
      queryClient.invalidateQueries({ queryKey: ['super-admin-org', orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-750 hover:bg-gray-700 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <div>
            <span className="text-white font-medium">{project.name}</span>
            <span className="ml-3 text-gray-400 text-sm">
              {new Date(project.startDate).toLocaleDateString()} – {new Date(project.endDate).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">{project.participants.length} participants</span>
          <button
            onClick={(e) => { e.stopPropagation(); recalcExpiryMutation.mutate(); }}
            disabled={recalcExpiryMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-gray-200 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${recalcExpiryMutation.isPending ? 'animate-spin' : ''}`} />
            Recalc Expiry
          </button>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          {project.participants.length === 0 ? (
            <p className="px-5 py-4 text-gray-500 text-sm">No participants in this project.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-gray-700 bg-gray-800">
                  <th className="px-5 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-5 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token</th>
                  <th className="px-5 py-2 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {project.participants.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-750">
                    <td className="px-5 py-3 text-gray-200">{p.firstName} {p.lastName}</td>
                    <td className="px-5 py-3 text-gray-400">{p.email}</td>
                    <td className="px-5 py-3">{statusBadge(p.status)}</td>
                    <td className="px-5 py-3">
                      {p.magicLinkActive ? (
                        <span className="text-green-400 text-xs">Active</span>
                      ) : (
                        <span className="text-red-400 text-xs">Inactive</span>
                      )}
                      {p.tokenExpiresAt && (
                        <span className="ml-2 text-gray-500 text-xs">
                          exp. {new Date(p.tokenExpiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setReopenTarget(p)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-orange-700/60 hover:bg-orange-700 text-orange-200 text-xs font-medium rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reopen
                        </button>
                        <button
                          onClick={() => regenerateTokenMutation.mutate(p.id)}
                          disabled={regenerateTokenMutation.isPending && regenerateTokenMutation.variables === p.id}
                          className="flex items-center gap-1 px-2.5 py-1 bg-blue-700/60 hover:bg-blue-700 text-blue-200 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Key className="w-3 h-3" />
                          New Token
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modals */}
      {reopenTarget && (
        <ForceReopenModal
          participant={reopenTarget}
          onConfirm={(msg) => forceReopenMutation.mutate({ id: reopenTarget.id, msg })}
          onClose={() => setReopenTarget(null)}
          isPending={forceReopenMutation.isPending}
        />
      )}
      {tokenResult && (
        <TokenResultModal result={tokenResult} onClose={() => setTokenResult(null)} />
      )}
    </div>
  );
}

// ---- Main Page ----
export default function SuperAdminOrgDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem('super-admin-token');
    if (!token) navigate('/super-admin/login');
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['super-admin-org', id],
    queryFn: () => superAdminApi.getOrganisation(id!),
    enabled: !!id,
    retry: false,
  });

  // ---- Form state ----
  const [emailInput, setEmailInput] = useState('');
  const [emailReason, setEmailReason] = useState('');
  const [refundReason, setRefundReason] = useState<Record<string, string>>({});
  const [transferParticipantId, setTransferParticipantId] = useState('');
  const [transferProjectId, setTransferProjectId] = useState('');
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [confirmMerge, setConfirmMerge] = useState(false);

  // Populate email input once data loads
  useEffect(() => {
    if (data?.organisation && !emailInput) {
      setEmailInput(data.organisation.email);
    }
  }, [data?.organisation?.email]);

  const updateEmailMutation = useMutation({
    mutationFn: () => superAdminApi.updateOrgEmail(id!, emailInput, emailReason),
    onSuccess: () => {
      toast.success('Email updated');
      setEmailReason('');
      queryClient.invalidateQueries({ queryKey: ['super-admin-org', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refundMutation = useMutation({
    mutationFn: ({ purchaseId, reason }: { purchaseId: string; reason: string }) =>
      superAdminApi.refundPurchase(purchaseId, reason),
    onSuccess: (data) => {
      toast.success(`Refunded. Credits restored: ${data.creditsRestored}`);
      queryClient.invalidateQueries({ queryKey: ['super-admin-org', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transferMutation = useMutation({
    mutationFn: () => superAdminApi.transferParticipant(transferParticipantId, transferProjectId),
    onSuccess: () => {
      toast.success('Participant transferred');
      setTransferParticipantId('');
      setTransferProjectId('');
      queryClient.invalidateQueries({ queryKey: ['super-admin-org', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mergeMutation = useMutation({
    mutationFn: () => superAdminApi.mergeParticipants(mergeTargetId, mergeSourceId),
    onSuccess: () => {
      toast.success('Participants merged');
      setMergeSourceId('');
      setMergeTargetId('');
      setConfirmMerge(false);
      queryClient.invalidateQueries({ queryKey: ['super-admin-org', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Failed to load organisation</p>
          <Link to="/super-admin/dashboard" className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 inline-block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const org: SuperAdminOrg = data.organisation;

  // Flat list of all participants across projects
  const allParticipants: Array<SuperAdminParticipantSummary & { projectId: string; projectName: string }> =
    org.projects.flatMap((proj) =>
      proj.participants.map((p) => ({ ...p, projectId: proj.id, projectName: proj.name }))
    );

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            to="/super-admin/dashboard"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Dashboard
          </Link>
          <span className="text-gray-600">/</span>
          <h1 className="text-xl font-bold text-white">{org.name}</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* Org summary */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex-1 min-w-48">
              <p className="text-gray-400 text-sm">Email</p>
              <p className="text-white font-medium">{org.email}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Credits</p>
              <p className="text-yellow-400 font-bold text-2xl">{org.projectCredits}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">License</p>
              <p className="text-white">{org.hasAnnualLicense ? 'Annual' : 'Per-project'}</p>
              {org.annualLicenseExpiresAt && (
                <p className="text-gray-500 text-xs">Expires {new Date(org.annualLicenseExpiresAt).toLocaleDateString()}</p>
              )}
            </div>
            <div>
              <p className="text-gray-400 text-sm">Status</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium ${org.isActive ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                {org.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Created</p>
              <p className="text-white">{new Date(org.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        {/* Force Update Email */}
        <section className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Update Organisation Email</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="New email address"
              className="sm:col-span-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
            />
            <input
              type="text"
              value={emailReason}
              onChange={(e) => setEmailReason(e.target.value)}
              placeholder="Reason (required)"
              className="sm:col-span-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
            />
            <button
              onClick={() => updateEmailMutation.mutate()}
              disabled={!emailInput || !emailReason || updateEmailMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {updateEmailMutation.isPending ? 'Updating...' : 'Update Email'}
            </button>
          </div>
        </section>

        {/* Purchases */}
        {org.purchases.length > 0 && (
          <section className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-700">
              <CreditCard className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-semibold text-white">Purchases</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Credits</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {org.purchases.map((purchase: SuperAdminPurchase) => (
                    <tr key={purchase.id} className="hover:bg-gray-750">
                      <td className="px-6 py-3 text-gray-300">{purchase.type}</td>
                      <td className="px-6 py-3 text-gray-300">
                        {(purchase.amountCents / 100).toFixed(2)} {purchase.currency}
                      </td>
                      <td className="px-6 py-3 text-gray-300">{purchase.creditsGranted}</td>
                      <td className="px-6 py-3">{purchaseStatusBadge(purchase.status)}</td>
                      <td className="px-6 py-3 text-gray-400">
                        {purchase.completedAt
                          ? new Date(purchase.completedAt).toLocaleDateString()
                          : new Date(purchase.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {purchase.status === 'COMPLETED' && (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="text"
                              value={refundReason[purchase.id] ?? ''}
                              onChange={(e) => setRefundReason((prev) => ({ ...prev, [purchase.id]: e.target.value }))}
                              placeholder="Reason"
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs w-36"
                            />
                            <button
                              onClick={() => refundMutation.mutate({ purchaseId: purchase.id, reason: refundReason[purchase.id] ?? '' })}
                              disabled={!refundReason[purchase.id] || refundMutation.isPending}
                              className="px-2.5 py-1 bg-red-700/70 hover:bg-red-700 text-red-200 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                            >
                              Refund
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Projects + Participants */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">Projects &amp; Participants</h2>
          </div>
          <div className="space-y-3">
            {org.projects.length === 0 ? (
              <p className="text-gray-500">No projects yet.</p>
            ) : (
              org.projects.map((project: SuperAdminProject) => (
                <ProjectSection
                  key={project.id}
                  project={project}
                  orgId={org.id}
                />
              ))
            )}
          </div>
        </section>

        {/* Transfer Participant */}
        {allParticipants.length > 0 && org.projects.length > 1 && (
          <section className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowRight className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Transfer Participant to Different Project</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={transferParticipantId}
                onChange={(e) => setTransferParticipantId(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
              >
                <option value="">Select participant…</option>
                {allParticipants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} ({p.projectName})
                  </option>
                ))}
              </select>
              <select
                value={transferProjectId}
                onChange={(e) => setTransferProjectId(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
              >
                <option value="">Select target project…</option>
                {org.projects
                  .filter((proj) => {
                    const chosen = allParticipants.find((p) => p.id === transferParticipantId);
                    return !chosen || proj.id !== chosen.projectId;
                  })
                  .map((proj) => (
                    <option key={proj.id} value={proj.id}>{proj.name}</option>
                  ))}
              </select>
              <button
                onClick={() => transferMutation.mutate()}
                disabled={!transferParticipantId || !transferProjectId || transferMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {transferMutation.isPending ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
          </section>
        )}

        {/* Merge Participants */}
        {allParticipants.length > 1 && (
          <section className="bg-gray-800 rounded-xl border border-red-900/50 p-6">
            <div className="flex items-center gap-2 mb-1">
              <GitMerge className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-semibold text-white">Merge Participants</h2>
            </div>
            <p className="text-gray-500 text-sm mb-4 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              This permanently deletes the source participant. Target participant's personal data is kept.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Source (will be deleted)</label>
                <select
                  value={mergeSourceId}
                  onChange={(e) => { setMergeSourceId(e.target.value); setConfirmMerge(false); }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                >
                  <option value="">Select source participant…</option>
                  {allParticipants
                    .filter((p) => p.id !== mergeTargetId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} — {p.projectName}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Target (kept)</label>
                <select
                  value={mergeTargetId}
                  onChange={(e) => { setMergeTargetId(e.target.value); setConfirmMerge(false); }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                >
                  <option value="">Select target participant…</option>
                  {allParticipants
                    .filter((p) => p.id !== mergeSourceId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} — {p.projectName}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {mergeSourceId && mergeTargetId && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmMerge}
                    onChange={(e) => setConfirmMerge(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  I understand this will permanently delete the source participant
                </label>
                <button
                  onClick={() => mergeMutation.mutate()}
                  disabled={!confirmMerge || mergeMutation.isPending}
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                  {mergeMutation.isPending ? 'Merging...' : 'Merge'}
                </button>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
