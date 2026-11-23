import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { organisationApi } from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export interface CountryWithoutAmount {
  country: string;
  /** How many of the participants concerned travel from this country */
  participants: number;
}

/**
 * Sending countries that have no maximum amount yet, to fill in on the spot. Used where an
 * invitation would otherwise go out without the participant seeing what they can get back:
 * the amounts are asked for right there and the invitation goes out afterwards.
 */
export function SetAmountsModal({
  projectId,
  countries,
  saveLabel,
  onSaved,
  onClose,
}: {
  projectId: string;
  countries: CountryWithoutAmount[];
  /** What the button does besides saving, e.g. "Save and send" */
  saveLabel: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const parsed = countries.map((c) => ({ ...c, amount: parseFloat((amounts[c.country] ?? '').replace(',', '.')) }));
  const complete = parsed.every((c) => Number.isFinite(c.amount) && c.amount > 0);

  const save = async () => {
    if (!complete || saving) return;
    setSaving(true);
    try {
      for (const c of parsed) {
        await organisationApi.setCountryLimit(projectId, { country: c.country, maxReimbursementAmount: c.amount });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['org-country-limits', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['org-participants', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['org-project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['org-dashboard'] }),
      ]);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not save the amounts');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={saving ? () => {} : onClose} title="Set the maximum amounts">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="text-sm text-gray-600">
          Participants see their maximum as soon as they open their link. Enter one maximum per sending country: you find it in the travel
          budget of your grant agreement. You can change it later in Settings.
        </p>
        <div className="space-y-2">
          {countries.map((c, index) => (
            <label key={c.country} className="flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-xl">
              <span className="min-w-0">
                <span className="block font-medium text-gray-900 truncate">{c.country}</span>
                <span className="block text-xs text-gray-500">
                  {c.participants} participant{c.participants === 1 ? '' : 's'}
                </span>
              </span>
              <span className="relative flex-shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus={index === 0}
                  value={amounts[c.country] ?? ''}
                  onChange={(e) => setAmounts((current) => ({ ...current, [c.country]: e.target.value }))}
                  placeholder="0"
                  aria-label={`Maximum amount for ${c.country} in euro`}
                  className="w-32 pl-7 pr-3 py-2 rounded-lg border border-gray-300 text-right focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!complete}>
            {saveLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
