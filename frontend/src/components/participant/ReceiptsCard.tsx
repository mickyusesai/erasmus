import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BedDouble, Utensils, FileText, ExternalLink, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { participantApi, type ParticipantAuthResponse, type Document } from '../../services/api';
import { isReceiptDocument } from '../../utils/documentKinds';

type ReceiptType = 'HOTEL_INVOICE' | 'MEAL_RECEIPT';

function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

function fmtAmount(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount == null) return null;
  const cur = currency || 'EUR';
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${cur}`;
  }
}

/**
 * Food & accommodation receipts for the green-travel extra. Separate from the
 * trips: the organisation decides this amount, so uploading here never touches
 * the AI-built trips and stays open until the extra is settled.
 */
export function ReceiptsCard({
  data,
  token,
  compact = false,
}: {
  data: ParticipantAuthResponse;
  token: string;
  /** Shorter intro (used after submission) */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const receipts = data.documents.filter(isReceiptDocument);
  const open = data.receiptUploadsOpen !== false;
  const extraSet = !!data.greenTravelExtra;
  const [uploadingType, setUploadingType] = useState<ReceiptType | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const mealInput = useRef<HTMLInputElement>(null);
  const hotelInput = useRef<HTMLInputElement>(null);

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => participantApi.deleteDocument(token, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-auth'] });
      toast.success('Receipt removed');
    },
    onError: () => toast.error('Could not remove the receipt'),
  });

  const handleFiles = async (type: ReceiptType, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploadingType(type);
    setProgress({ current: 0, total: list.length });
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      setProgress({ current: i + 1, total: list.length });
      try {
        await participantApi.uploadDocument(token, list[i], type);
        ok++;
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : `Could not upload ${list[i].name}`);
      }
    }
    await queryClient.refetchQueries({ queryKey: ['participant-auth'] });
    setUploadingType(null);
    setProgress({ current: 0, total: 0 });
    if (ok > 0) toast.success(ok === 1 ? 'Receipt added' : `${ok} receipts added`);
  };

  const viewDocument = async (docId: string) => {
    try {
      const { url } = await participantApi.getDocumentUrl(token, docId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open the receipt');
    }
  };

  const meals = receipts.filter((r) => r.documentType === 'MEAL_RECEIPT').length;
  const hotels = receipts.filter((r) => r.documentType === 'HOTEL_INVOICE').length;
  const accept = 'application/pdf,image/jpeg,image/png,image/webp';
  const busy = uploadingType !== null;

  const uploadButton = (type: ReceiptType) => {
    const isHotel = type === 'HOTEL_INVOICE';
    const Icon = isHotel ? BedDouble : Utensils;
    const ref = isHotel ? hotelInput : mealInput;
    const active = uploadingType === type;
    return (
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className={clsx(
          'flex-1 rounded-2xl border-2 border-dashed py-3 px-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60',
          'border-emerald-300 text-emerald-700 bg-emerald-50/60 hover:bg-emerald-50'
        )}
      >
        {active ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> {progress.total > 1 ? `${progress.current}/${progress.total}` : 'Uploading…'}</>
        ) : (
          <><Icon className="w-4 h-4" /> {isHotel ? 'Add hotel invoice' : 'Add meal receipt'}</>
        )}
        <input
          ref={ref}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => { void handleFiles(type, e.target.files); e.target.value = ''; }}
        />
      </button>
    );
  };

  const renderRow = (doc: Document) => {
    const isHotel = doc.documentType === 'HOTEL_INVOICE';
    const isImage = doc.mimeType?.startsWith('image/');
    const amount = fmtAmount(doc.extraction?.amount, doc.extraction?.currency);
    const date = fmtDate(doc.extraction?.documentDate) || fmtDate(doc.uploadDate);
    return (
      <li key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
        <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', isHotel ? 'bg-sky-50 text-sky-600' : 'bg-amber-50 text-amber-600')}>
          {isHotel ? <BedDouble className="w-4 h-4" /> : <Utensils className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{doc.extraction?.merchantName || doc.renamedFilename}</p>
          <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
            <span>{isHotel ? 'Hotel' : 'Meal'}</span>
            {date && <><span className="text-gray-300">·</span><span>{date}</span></>}
            {amount ? <><span className="text-gray-300">·</span><span className="font-medium text-gray-700">{amount}</span></> : <><span className="text-gray-300">·</span><span className="italic">amount being read…</span></>}
            {isImage ? <ImageIcon className="w-3 h-3 text-gray-300" /> : <FileText className="w-3 h-3 text-gray-300" />}
          </p>
        </div>
        <button type="button" onClick={() => viewDocument(doc.id)} className="p-2 text-gray-400 hover:text-emerald-600" title="View receipt">
          <ExternalLink className="w-4 h-4" />
        </button>
        {open && (
          <button type="button" onClick={() => deleteMutation.mutate(doc.id)} disabled={deleteMutation.isPending} className="p-2 text-gray-400 hover:text-red-500" title="Remove receipt">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-emerald-50 to-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-gray-900 flex items-center gap-2">
              <span className="inline-flex w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 items-center justify-center"><Utensils className="w-3.5 h-3.5" /></span>
              Food &amp; accommodation
            </p>
            <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
              {compact
                ? 'You can still add hotel and meal receipts from your journey until your organisation settles the green travel extra.'
                : 'Green traveller: add the hotel and meal receipts from your journey here. They are kept apart from your trips. Your organisation decides the extra amount and will email you once it is added.'}
            </p>
          </div>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {receipts.length} receipt{receipts.length === 1 ? '' : 's'}
          </span>
        </div>
        {open ? (
          <div className="flex gap-2 mt-3">
            {uploadButton('MEAL_RECEIPT')}
            {uploadButton('HOTEL_INVOICE')}
          </div>
        ) : (
          <p className="text-xs text-emerald-700 mt-3 bg-emerald-50 rounded-xl px-3 py-2">
            {extraSet ? 'The green travel extra has been added to your reimbursement. Receipts are closed.' : 'Receipts are closed.'}
          </p>
        )}
        {open && (
          <p className="text-[11px] text-gray-400 mt-2">
            PDF, JPG, PNG up to 10MB · several files at once is fine · receipts don't count towards your document limit
          </p>
        )}
      </div>
      {receipts.length > 0 ? (
        <>
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {receipts.map(renderRow)}
          </ul>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-500 flex gap-3">
            <span>{meals} meal{meals === 1 ? '' : 's'}</span>
            <span>{hotels} hotel{hotels === 1 ? '' : 's'}</span>
            {extraSet && data.greenTravelExtra && (
              <span className="ml-auto font-medium text-emerald-700">
                Extra added: {fmtAmount(data.greenTravelExtra.foodEur + data.greenTravelExtra.accommodationEur, 'EUR')}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="px-4 py-4 text-sm text-gray-400 border-t border-gray-100 text-center">
          No receipts yet{open ? ' — add them as you go.' : '.'}
        </p>
      )}
    </div>
  );
}
