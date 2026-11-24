import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { GraduationCap, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { organisationApi, type OrgDashboardData } from '../../services/api';
import { usePractice } from './PracticeGuidePanel';

/**
 * Said at the top of the practice project's pages: what this is, that nothing in it is real,
 * and how to start it again. On a participant's page it is one line.
 */
export function PracticeBanner({ participantName, backTo }: { participantName?: string; backTo?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { practice } = usePractice();
  const [busy, setBusy] = useState<'restart' | 'remove' | null>(null);

  const startAgain = async () => {
    if (!window.confirm('Start the practice again? Everything you did in the practice project is thrown away, and its participants are back as they were.')) return;
    setBusy('restart');
    try {
      const fresh = await organisationApi.restartPracticeProject();
      queryClient.setQueryData<OrgDashboardData>(['org-dashboard'], (current) => (current ? { ...current, practice: fresh.practice } : current));
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
      toast.success('The practice project is back at the start');
      navigate(`/org/projects/${fresh.projectId}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not start the practice again');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove the practice project from your account? You can bring it back at any time from your dashboard.')) return;
    setBusy('remove');
    try {
      await organisationApi.removePracticeProject();
      queryClient.setQueryData<OrgDashboardData>(['org-dashboard'], (current) => (current ? { ...current, practice: null } : current));
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
      toast.success('The practice project is removed');
      navigate('/org/dashboard');
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not remove the practice project');
    } finally {
      setBusy(null);
    }
  };

  const showGuide = async () => {
    queryClient.setQueryData<OrgDashboardData>(['org-dashboard'], (current) =>
      current?.practice ? { ...current, practice: { ...current.practice, guide: { ...current.practice.guide, closed: false } } } : current
    );
    await organisationApi.setPracticeGuideClosed(false).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
  };

  if (participantName) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-50 border border-primary-100 text-sm text-primary-900" data-practice-banner>
        <GraduationCap className="w-4 h-4 text-primary-600 flex-shrink-0" />
        <p>
          <span className="font-medium">Practice project.</span> {participantName} is made up, and so are the tickets. Where an email would go out, you see it instead.
          {backTo && (
            <>
              {' '}
              <Link to={backTo} className="underline font-medium">
                Back to the practice project
              </Link>
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-primary-50 border border-primary-100 p-4" data-practice-banner>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <GraduationCap className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-primary-900">This is your practice project</h3>
            <p className="text-sm text-primary-900/80 mt-1">
              The exchange, the five participants and their tickets are made up. Try anything: approve, send back, change amounts. No email leaves
              this project: where one would go out, you see it instead. It costs no credit and is not counted as one of your projects.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {practice?.guide.closed && !practice.guide.complete && (
            <button onClick={showGuide} className="px-3 py-1.5 text-sm font-medium text-primary-800 hover:bg-primary-100 rounded-lg transition-colors">
              Show the guide
            </button>
          )}
          <button
            onClick={startAgain}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-primary-200 text-primary-800 text-sm font-medium rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-60"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {busy === 'restart' ? 'Starting again…' : 'Start again'}
          </button>
          <button
            onClick={remove}
            disabled={busy !== null}
            className="px-3 py-1.5 text-sm text-primary-800/80 hover:text-primary-900 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-60"
          >
            {busy === 'remove' ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
