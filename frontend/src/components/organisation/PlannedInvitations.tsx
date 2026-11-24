import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { organisationApi } from '../../services/api';
import { longDay } from '../../utils/longDay';

/**
 * Said on the project's page while its invitations are planned for a day: when they go out,
 * for how many participants, and the ways to change that (send now, another day, not at all).
 */
export function PlannedInvitations({ projectId, inviteAt, waiting }: { projectId: string; inviteAt: string; waiting: number }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'now' | 'cancel' | null>(null);
  const day = longDay(inviteAt);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['org-project', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['org-participants', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] }),
    ]);

  const sendNow = async () => {
    if (!window.confirm(`Send the invitation to ${waiting} participant${waiting === 1 ? '' : 's'} now, instead of on ${day}?`)) return;
    setBusy('now');
    try {
      const result = await organisationApi.setInvitations(projectId, { when: 'now' });
      await refresh();
      if (result.failed.length > 0) toast.error(`${result.sent} sent, ${result.failed.length} could not be sent: ${result.failed.map((f) => f.name).join(', ')}`, { duration: 8000 });
      else toast.success(`${result.sent} invitation${result.sent === 1 ? '' : 's'} sent`);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'The invitations could not be sent');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!window.confirm('Take the plan away? Nothing is sent until you send the invitations yourself.')) return;
    setBusy('cancel');
    try {
      await organisationApi.setInvitations(projectId, { when: 'later' });
      await refresh();
      toast.success('The plan is off: nothing will be sent by itself');
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'That did not work. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4" data-planned-invitations>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <CalendarClock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">The invitations go out on {day}</h3>
            <p className="text-sm text-blue-800 mt-1">
              In the morning (around 8, Central European Time),{' '}
              {waiting === 0
                ? 'to everybody who has no link by then. Right now nobody is waiting for one.'
                : `to the ${waiting} participant${waiting === 1 ? '' : 's'} who ${waiting === 1 ? 'has' : 'have'} no link yet, and to anyone you add before then.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {waiting > 0 && (
            <button onClick={sendNow} disabled={busy !== null} className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60">
              {busy === 'now' ? 'Sending…' : 'Send them now'}
            </button>
          )}
          <Link to={`/org/projects/${projectId}/setup?step=4`} className="px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100 rounded-lg transition-colors">
            Another day
          </Link>
          <button onClick={cancel} disabled={busy !== null} className="px-3 py-1.5 text-sm text-blue-800/80 hover:text-blue-900 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-60">
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel the plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
