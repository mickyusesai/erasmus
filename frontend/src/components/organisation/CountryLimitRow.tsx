import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Input } from '../ui/Input';

interface CountryLimitRowProps {
  limit: { id: string; country: string; maxReimbursementAmount: number; greenTravel?: boolean };
  /** Participants in the project from this country; the row can only be removed when 0 */
  participantCount: number;
  onSaveAmount: (amount: number) => void;
  onToggleGreen: () => void;
  onDelete: () => void;
}

/**
 * One editable country-limit row. The amount lives in local state and is only
 * saved on blur / Enter, so typing is never overwritten by a refetch.
 */
export function CountryLimitRow({ limit, participantCount, onSaveAmount, onToggleGreen, onDelete }: CountryLimitRowProps) {
  const needsAmount = limit.maxReimbursementAmount === 0;
  const serverValue = needsAmount ? '' : String(limit.maxReimbursementAmount);
  const [value, setValue] = useState(serverValue);
  const [focused, setFocused] = useState(false);

  // Resync from the server only while the user isn't editing
  useEffect(() => {
    if (!focused) setValue(serverValue);
  }, [serverValue, focused]);

  const commit = () => {
    const amount = parseFloat(value);
    if (isNaN(amount) || amount < 0) {
      setValue(serverValue);
      return;
    }
    if (amount !== limit.maxReimbursementAmount) onSaveAmount(amount);
  };

  return (
    <div
      className={clsx(
        'flex items-center justify-between p-3 rounded-xl',
        needsAmount ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900">{limit.country}</span>
          {limit.greenTravel && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              Green travel
            </span>
          )}
          {needsAmount && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              Set amount
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={limit.greenTravel || false}
            onChange={onToggleGreen}
            className="rounded border-gray-300 w-3.5 h-3.5"
          />
          Green
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-24 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-xs text-gray-400">EUR</span>
        </div>
        {participantCount === 0 ? (
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
            title="Remove this country (no participants use it)"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <span
            className="p-1.5 text-gray-300 cursor-not-allowed"
            title={`${participantCount} participant(s) use this country — change their country first to remove it`}
          >
            <Trash2 className="w-4 h-4" />
          </span>
        )}
      </div>
    </div>
  );
}
