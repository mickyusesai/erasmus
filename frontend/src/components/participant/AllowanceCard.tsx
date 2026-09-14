import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Receipt, Plus, Trash2, Loader2, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import {
  participantApi,
  AllowanceRule,
  ParticipantAllowance,
  Document,
} from '../../services/api';

interface AllowanceCardProps {
  token: string;
  rule: AllowanceRule;
  allowance?: ParticipantAllowance;
  documents: Document[];
  suggestedTravelDays: number;
  /** Country/individual maximum, only used for the "on top / inside" hint */
  maxReimbursement?: number | null;
}

const NON_TRANSPORT_TYPES = new Set(['HOTEL_INVOICE', 'MEAL_RECEIPT', 'FUEL_RECEIPT', 'OTHER', 'BANK_TRANSACTION']);

const fmt = (n: number, currency = 'EUR') =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n);

/**
 * One organisation-defined allowance the participant can claim: either a
 * number of extra travel days (× a daily rate) or a set of tagged receipts.
 */
export function AllowanceCard({ token, rule, allowance, documents, suggestedTravelDays, maxReimbursement }: AllowanceCardProps) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPerDay = rule.mode === 'PER_TRAVEL_DAY';
  const maxDays = rule.maxDays ?? undefined;
  const serverDays = allowance?.days ?? null;
  // Pre-fill from the tickets until the participant has saved a value
  const initialDays = serverDays ?? Math.min(suggestedTravelDays, maxDays ?? suggestedTravelDays);
  const [days, setDays] = useState<number>(initialDays);
  useEffect(() => {
    if (serverDays != null) setDays(serverDays);
  }, [serverDays]);

  const daysMutation = useMutation({
    mutationFn: (value: number) => participantApi.setAllowanceDays(token, rule.id, value),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || 'Could not save'),
  });
  const addReceiptMutation = useMutation({
    mutationFn: (documentId: string) => participantApi.addAllowanceReceipt(token, rule.id, { documentId }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || 'Could not add receipt'),
  });
  const updateReceiptMutation = useMutation({
    mutationFn: ({ id, amountOriginal, currencyOriginal }: { id: string; amountOriginal: number | null; currencyOriginal?: string }) =>
      participantApi.updateAllowanceReceipt(token, id, { amountOriginal, currencyOriginal }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || 'Could not save amount'),
  });
  const removeReceiptMutation = useMutation({
    mutationFn: (id: string) => participantApi.deleteAllowanceReceipt(token, id),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || 'Could not remove receipt'),
  });
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await participantApi.uploadDocument(token, file);
      return participantApi.addAllowanceReceipt(token, rule.id, { documentId: uploaded.document.id });
    },
    onSuccess: () => {
      toast.success('Receipt added — please check the amount');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || 'Upload failed'),
  });

  const saveDays = (value: number) => {
    const clamped = Math.max(0, maxDays != null ? Math.min(value, maxDays) : value);
    setDays(clamped);
    if (clamped !== serverDays) daysMutation.mutate(clamped);
  };

  // Persist the pre-filled suggestion once so the server total includes it
  useEffect(() => {
    if (isPerDay && serverDays == null && initialDays > 0 && !daysMutation.isPending) {
      daysMutation.mutate(initialDays);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const receipts = allowance?.receipts ?? [];
  const receiptsEur = receipts.reduce((s, r) => s + (r.amountEur ?? 0), 0);
  const candidateDocs = documents.filter(
    (d) => !d.allowanceReceipt && d.documentType !== 'GREEN_TRAVEL_DECLARATION' && d.documentType !== 'FLIGHT_BOARDING_PASS'
  ).sort((a, b) => Number(NON_TRANSPORT_TYPES.has(b.documentType)) - Number(NON_TRANSPORT_TYPES.has(a.documentType)));
  const showReceipts = !isPerDay || rule.receiptsRequired || receipts.length > 0;
  const busy = daysMutation.isPending || addReceiptMutation.isPending || uploadMutation.isPending;
  const lineAmount = allowance?.amountEur ?? 0;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-gray-900">{rule.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {isPerDay
              ? `${fmt(rule.amountPerDay ?? 0)} per extra travel day${maxDays != null ? ` · max ${maxDays} days` : ''}`
              : `Actual receipts${rule.capPerDay != null ? ` · max ${fmt(rule.capPerDay)} per day` : ''}${rule.capTotal != null ? ` · max ${fmt(rule.capTotal)} total` : ''}`}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-bold text-gray-900">{fmt(lineAmount)}</p>
          <p className="text-[10px] font-semibold tracking-wide uppercase text-gray-400">
            {rule.countsTowardMax ? 'within your max' : (maxReimbursement ? 'on top of your max' : 'allowance')}
          </p>
        </div>
      </div>

      {/* Days */}
      {(isPerDay || rule.capPerDay != null) && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Extra travel days</p>
            {serverDays == null && suggestedTravelDays > 0 && (
              <p className="text-xs text-gray-400">We counted {suggestedTravelDays} from your tickets — adjust if needed</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => saveDays(days - 1)}
              disabled={busy || days <= 0}
              className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-40"
              aria-label="Fewer days"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center font-bold text-gray-900">{days}</span>
            <button
              type="button"
              onClick={() => saveDays(days + 1)}
              disabled={busy || (maxDays != null && days >= maxDays)}
              className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-40"
              aria-label="More days"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Receipts */}
      {showReceipts && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">
              {isPerDay ? 'Receipts (evidence)' : 'Receipts'}
              {!isPerDay && receipts.length > 0 && (
                <span className="text-gray-400 font-normal"> · {fmt(receiptsEur)}</span>
              )}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMutation.mutate(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 disabled:opacity-50"
            >
              {uploadMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Upload receipt
            </button>
          </div>

          {receipts.length === 0 && (
            <p className="text-xs text-gray-400 mb-2">
              {isPerDay ? 'Optional: add hotel or meal receipts as evidence.' : 'Upload a receipt or pick one of your uploaded files below.'}
            </p>
          )}

          <ul className="space-y-1.5">
            {receipts.map((r) => (
              <ReceiptRow
                key={r.id}
                receipt={r}
                busy={updateReceiptMutation.isPending || removeReceiptMutation.isPending}
                onSave={(amountOriginal, currencyOriginal) => updateReceiptMutation.mutate({ id: r.id, amountOriginal, currencyOriginal })}
                onRemove={() => removeReceiptMutation.mutate(r.id)}
              />
            ))}
          </ul>

          {candidateDocs.length > 0 && (
            <div className="mt-2">
              <select
                className="w-full text-xs px-2.5 py-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-600"
                value=""
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) addReceiptMutation.mutate(e.target.value);
                }}
              >
                <option value="">+ Use an already uploaded file…</option>
                {candidateDocs.map((d) => (
                  <option key={d.id} value={d.id}>{d.renamedFilename}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReceiptRow({
  receipt,
  busy,
  onSave,
  onRemove,
}: {
  receipt: ParticipantAllowance['receipts'][number];
  busy: boolean;
  onSave: (amountOriginal: number | null, currencyOriginal?: string) => void;
  onRemove: () => void;
}) {
  const [amount, setAmount] = useState(receipt.amountOriginal != null ? String(receipt.amountOriginal) : '');
  const [currency, setCurrency] = useState(receipt.currencyOriginal || 'EUR');
  useEffect(() => {
    setAmount(receipt.amountOriginal != null ? String(receipt.amountOriginal) : '');
    setCurrency(receipt.currencyOriginal || 'EUR');
  }, [receipt.amountOriginal, receipt.currencyOriginal]);

  const commit = () => {
    const parsed = amount.trim() === '' ? null : parseFloat(amount);
    if (parsed != null && (isNaN(parsed) || parsed < 0)) return;
    if (parsed !== receipt.amountOriginal || currency !== receipt.currencyOriginal) onSave(parsed, currency);
  };

  return (
    <li className={clsx('flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-2.5 py-2', receipt.amountOriginal == null && 'ring-1 ring-amber-300')}>
      <Receipt className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <span className="text-gray-600 truncate flex-1">{receipt.document.renamedFilename}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={amount}
        placeholder="Amount"
        onChange={(e) => setAmount(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        disabled={busy}
        className="w-20 px-2 py-1 rounded border border-gray-200 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <select
        value={currency}
        onChange={(e) => { setCurrency(e.target.value); }}
        onBlur={commit}
        disabled={busy}
        className="px-1 py-1 rounded border border-gray-200 bg-white"
      >
        {['EUR', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'SEK', 'DKK', 'NOK', 'GBP', 'CHF', 'TRY', 'USD'].map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {receipt.amountEur != null && receipt.currencyOriginal !== 'EUR' && (
        <span className="text-gray-400 whitespace-nowrap">= {fmt(receipt.amountEur)}</span>
      )}
      <button type="button" onClick={onRemove} disabled={busy} className="p-1 text-gray-400 hover:text-red-500" title="Remove">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
