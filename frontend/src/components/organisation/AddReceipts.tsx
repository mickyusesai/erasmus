import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BedDouble, Loader2, Utensils } from 'lucide-react';
import { acceptWithIphonePhotos } from '../../utils/iphonePhotos';
import { reportUploadRun, uploadForParticipantInTurn } from '../../utils/uploadInTurn';

type ReceiptType = 'MEAL_RECEIPT' | 'HOTEL_INVOICE';

/**
 * The organiser adds a participant's meal receipts or hotel invoices, several files at once:
 * for the participant who sent their receipts by email, WhatsApp or a shared folder.
 */
export function AddReceipts({ participantId, firstName }: { participantId: string; firstName: string }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<ReceiptType | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const mealInput = useRef<HTMLInputElement>(null);
  const hotelInput = useRef<HTMLInputElement>(null);
  const accept = acceptWithIphonePhotos('application/pdf,image/jpeg,image/png,image/webp');

  const add = async (type: ReceiptType, list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setUploading(type);
    setProgress({ current: 0, total: files.length });
    const run = await uploadForParticipantInTurn(participantId, files, type, (current, total) => setProgress({ current, total }));
    setUploading(null);
    const isHotel = type === 'HOTEL_INVOICE';
    reportUploadRun(run, isHotel ? 'hotel invoice' : 'meal receipt', isHotel ? 'hotel invoices' : 'meal receipts', '. The AI is reading the amounts now.');
    queryClient.invalidateQueries({ queryKey: ['org-participant', participantId] });
  };

  const button = (type: ReceiptType) => {
    const isHotel = type === 'HOTEL_INVOICE';
    const Icon = isHotel ? BedDouble : Utensils;
    const ref = isHotel ? hotelInput : mealInput;
    const active = uploading === type;
    return (
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading !== null}
        className="rounded-xl border border-dashed border-emerald-300 bg-white/70 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-white flex items-center gap-1.5 disabled:opacity-60"
      >
        {active ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding {progress.current} of {progress.total}…</>
        ) : (
          <><Icon className="w-3.5 h-3.5" /> {isHotel ? 'Add hotel invoices' : 'Add meal receipts'}</>
        )}
        <input
          ref={ref}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => { void add(type, e.target.files); e.target.value = ''; }}
        />
      </button>
    );
  };

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      {button('MEAL_RECEIPT')}
      {button('HOTEL_INVOICE')}
      <p className="text-[11px] text-emerald-800/70">
        Did {firstName} send you the receipts? Add them here, several files at once. PDF, JPG, PNG or iPhone photo.
      </p>
    </div>
  );
}
