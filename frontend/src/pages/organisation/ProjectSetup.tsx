import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle, Eye, Hand, Send, UserPlus } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { organisationApi, type OrgParticipant } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { PasteParticipants } from '../../components/organisation/PasteParticipants';
import { SetupSteps, type SetupStep } from '../../components/organisation/SetupSteps';
import { showEmailBeforeSending } from '../../components/organisation/EmailPreview';
import { longDay } from '../../utils/longDay';

interface CountryLimit {
  country: string;
  maxReimbursementAmount: number;
  greenTravel?: boolean;
}

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * Setting up a project after it was created: who takes part, what each sending country can
 * get back at most, and when the invitations go out. Three short steps (the project itself was
 * the first), each of which can also be left for later.
 */
export default function ProjectSetup() {
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (!localStorage.getItem('org-token')) navigate('/org/login');
  }, [navigate]);

  const { data: projectData, isLoading: loadingProject } = useQuery({
    queryKey: ['org-project', projectId],
    queryFn: () => organisationApi.getProject(projectId),
    retry: false,
  });
  const { data: participantsData, isLoading: loadingParticipants } = useQuery({
    queryKey: ['org-participants', projectId],
    queryFn: () => organisationApi.getProjectParticipants(projectId),
  });
  const { data: limitsData, isLoading: loadingLimits } = useQuery({
    queryKey: ['org-country-limits', projectId],
    queryFn: () => organisationApi.getCountryLimits(projectId),
  });

  const project = projectData?.project;
  const participants: OrgParticipant[] = participantsData?.participants ?? [];
  const limits = (limitsData ?? []) as CountryLimit[];
  const loading = loadingProject || loadingParticipants || loadingLimits;

  // The sending countries of the participants, with what is set for them so far
  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of participants) counts.set(p.country, (counts.get(p.country) ?? 0) + 1);
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([country, count]) => ({ country, count, max: limits.find((l) => l.country === country)?.maxReimbursementAmount ?? 0 }));
  }, [participants, limits]);
  const withoutAmount = countries.filter((c) => !(c.max > 0));
  const notInvited = participants.filter((p) => !p.lastMagicLinkSentAt);
  const planned = project?.inviteAt ?? null;

  const done: SetupStep[] = [1];
  if (participants.length > 0) done.push(2);
  if (participants.length > 0 && withoutAmount.length === 0) done.push(3);
  if (participants.length > 0 && (notInvited.length === 0 || planned)) done.push(4);
  const firstOpen: SetupStep = participants.length === 0 ? 2 : withoutAmount.length > 0 ? 3 : 4;

  // Opens at the first step that is still to do (or the one asked for in the address)
  const asked = Number(searchParams.get('step'));
  const [step, setStep] = useState<SetupStep | null>(null);
  useEffect(() => {
    if (step !== null || loading || !project) return;
    setStep(asked === 2 || asked === 3 || asked === 4 ? (Math.min(asked, firstOpen) as SetupStep) : firstOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, !!project]);
  const [finished, setFinished] = useState<null | { kind: 'sent'; sent: number; failed: number } | { kind: 'planned'; on: string } | { kind: 'later' }>(null);

  const go = (next: SetupStep) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading || step === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center">
          <p className="text-red-600 mb-4">Project not found or access denied.</p>
          <Link to="/org/dashboard" className="text-primary-600 hover:text-primary-700 font-medium">
            Back to your dashboard
          </Link>
        </div>
      </div>
    );
  }
  // The practice project has nothing to set up
  if (project.isPracticeProject) {
    navigate(`/org/projects/${projectId}`, { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to={`/org/projects/${projectId}`} className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" />
          {project.name}
        </Link>

        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          <SetupSteps current={finished ? 4 : step} done={finished ? [1, 2, 3, 4] : done} onGo={finished ? undefined : go} />
          <div className="mt-6 pt-6 border-t border-gray-100">
            {finished ? (
              <Finished finished={finished} projectId={projectId} />
            ) : step === 2 ? (
              <ParticipantsStep projectId={projectId} participants={participants} maxParticipants={project.maxParticipants ?? null} onNext={() => go(3)} />
            ) : step === 3 ? (
              <AmountsStep
                projectId={projectId}
                countries={countries}
                onBack={() => go(2)}
                onSaved={async () => {
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['org-country-limits', projectId] }),
                    queryClient.invalidateQueries({ queryKey: ['org-participants', projectId] }),
                    queryClient.invalidateQueries({ queryKey: ['org-dashboard'] }),
                  ]);
                  go(4);
                }}
              />
            ) : (
              <InvitationsStep
                projectId={projectId}
                notInvited={notInvited.length}
                total={participants.length}
                planned={planned}
                missingAmounts={withoutAmount.map((c) => c.country)}
                onBack={() => go(3)}
                onDone={async (result) => {
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['org-project', projectId] }),
                    queryClient.invalidateQueries({ queryKey: ['org-participants', projectId] }),
                    queryClient.invalidateQueries({ queryKey: ['org-dashboard'] }),
                  ]);
                  setFinished(result);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: who takes part ────────────────────────────────────────────────────

function ParticipantsStep({
  projectId,
  participants,
  maxParticipants,
  onNext,
}: {
  projectId: string;
  participants: OrgParticipant[];
  maxParticipants: number | null;
  onNext: () => void;
}) {
  const queryClient = useQueryClient();
  const [byHand, setByHand] = useState(false);
  const [one, setOne] = useState({ firstName: '', lastName: '', email: '', country: '' });
  const addOne = useMutation({
    mutationFn: () => organisationApi.createParticipant(projectId, one),
    onSuccess: () => {
      toast.success(`${one.firstName} added`);
      setOne({ firstName: '', lastName: '', email: '', country: one.country });
      queryClient.invalidateQueries({ queryKey: ['org-participants', projectId] });
      queryClient.invalidateQueries({ queryKey: ['org-country-limits', projectId] });
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not add the participant'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Who takes part?</h1>
        <p className="text-gray-600 mt-1">
          Paste your list of participants: name, email and the country they travel from.
          {maxParticipants ? ` This project has room for ${maxParticipants}.` : ''} You can add more at any time.
        </p>
      </div>

      <PasteParticipants projectId={projectId} onAdded={() => undefined} />

      <div className="border-t border-gray-100 pt-4">
        {byHand ? (
          <form
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              addOne.mutate();
            }}
          >
            {(
              [
                ['firstName', 'First name', 'text'],
                ['lastName', 'Last name', 'text'],
                ['email', 'Email', 'email'],
                ['country', 'Sending country', 'text'],
              ] as const
            ).map(([field, label, type]) => (
              <label key={field} className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
                <input
                  type={type}
                  required
                  value={one[field]}
                  onChange={(e) => setOne({ ...one, [field]: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </label>
            ))}
            <div className="sm:col-span-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setByHand(false)}>
                Close
              </Button>
              <Button type="submit" loading={addOne.isPending}>
                Add this participant
              </Button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setByHand(true)} className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
            <UserPlus className="w-4 h-4" /> Or add one participant by hand
          </button>
        )}
      </div>

      {participants.length > 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4" data-setup-participants>
          <p className="text-sm font-medium text-gray-900">
            {participants.length} participant{participants.length === 1 ? '' : 's'} in this project
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {participants
              .slice(0, 12)
              .map((p) => `${p.firstName} ${p.lastName} (${p.country})`)
              .join(' · ')}
            {participants.length > 12 && ` · and ${participants.length - 12} more`}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
        <Link to="/org/dashboard" className="text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2">
          I'll add them later
        </Link>
        <Button onClick={onNext} disabled={participants.length === 0}>
          Next: the amounts <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: what each sending country gets back at most ───────────────────────

function AmountsStep({
  projectId,
  countries,
  onBack,
  onSaved,
}: {
  projectId: string;
  countries: { country: string; count: number; max: number }[];
  onBack: () => void;
  onSaved: () => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(countries.filter((c) => c.max > 0).map((c) => [c.country, String(c.max)])));
  const [saving, setSaving] = useState(false);
  const parsed = countries.map((c) => ({ ...c, amount: parseFloat((amounts[c.country] ?? '').replace(',', '.')) }));
  const complete = parsed.every((c) => Number.isFinite(c.amount) && c.amount > 0);

  const save = async () => {
    if (!complete || saving) return;
    setSaving(true);
    try {
      for (const c of parsed) {
        if (c.amount !== c.max) await organisationApi.setCountryLimit(projectId, { country: c.country, maxReimbursementAmount: c.amount });
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not save the amounts');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900">What can they get back at most?</h1>
        <p className="text-gray-600 mt-1">
          One maximum per sending country, as in the travel budget of your grant agreement. Participants see their maximum when they open their
          link, and the app never pays out more.
        </p>
      </div>

      <div className="space-y-2">
        {countries.map((c, index) => (
          <label key={c.country} className="flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-xl">
            <span className="min-w-0">
              <span className="block font-medium text-gray-900 truncate">{c.country}</span>
              <span className="block text-xs text-gray-500">
                {c.count} participant{c.count === 1 ? '' : 's'}
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
      <p className="text-xs text-gray-500">
        Do some of them travel green (train, bus) with a higher maximum? You can mark that per country or per participant afterwards, in the
        project's settings.
      </p>

      <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
        <button type="button" onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2">
          Back to the participants
        </button>
        <Button type="submit" loading={saving} disabled={!complete}>
          Next: the invitations <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </form>
  );
}

// ── Step 4: when the invitations go out ───────────────────────────────────────

type InvitationResult = { kind: 'sent'; sent: number; failed: number } | { kind: 'planned'; on: string } | { kind: 'later' };

function InvitationsStep({
  projectId,
  notInvited,
  total,
  planned,
  missingAmounts,
  onBack,
  onDone,
}: {
  projectId: string;
  notInvited: number;
  total: number;
  planned: string | null;
  missingAmounts: string[];
  onBack: () => void;
  onDone: (result: InvitationResult) => void;
}) {
  const [when, setWhen] = useState<'now' | 'date' | 'later'>(planned ? 'date' : 'now');
  const [date, setDate] = useState(planned ? planned.slice(0, 10) : tomorrow());
  const [busy, setBusy] = useState(false);
  const [showing, setShowing] = useState(false);
  const people = `${notInvited} participant${notInvited === 1 ? '' : 's'}`;

  const showInvitation = async () => {
    setShowing(true);
    try {
      const { emailPreview } = await organisationApi.getInvitationPreview(projectId);
      showEmailBeforeSending(emailPreview, 'This is the invitation', 'Every participant gets it with their own name and their own link. Nothing has been sent yet.');
    } catch {
      toast.error('The invitation could not be shown');
    } finally {
      setShowing(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await organisationApi.setInvitations(projectId, when === 'date' ? { when, date } : { when });
      if (when === 'now') {
        if (result.failed.length > 0) toast.error(`${result.failed.length} invitation${result.failed.length === 1 ? '' : 's'} could not be sent. They are still marked "Send Link" in the list.`, { duration: 8000 });
        onDone({ kind: 'sent', sent: result.sent, failed: result.failed.length });
      } else if (when === 'date') {
        onDone({ kind: 'planned', on: result.inviteAt ?? date });
      } else {
        onDone({ kind: 'later' });
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (notInvited === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Everybody has their invitation</h1>
          <p className="text-gray-600 mt-1">All {total} participants were sent their link. You follow what they hand in on the project's page.</p>
        </div>
        <Link to={`/org/projects/${projectId}`} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-soft text-white font-medium hover:opacity-90">
          Go to the project <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const options = [
    { id: 'now' as const, icon: Send, title: 'Send them now', text: `${people} get an email with their own link right away.` },
    { id: 'date' as const, icon: CalendarClock, title: 'On a day', text: 'They go out by themselves in the morning of the day you choose, for example the day the exchange ends.' },
    { id: 'later' as const, icon: Hand, title: 'Later', text: 'You send them yourself from the list of participants when you are ready.' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">When do the invitations go out?</h1>
        <p className="text-gray-600 mt-1">
          Each participant gets an email with a personal link. With it they upload their tickets, no account or password needed.{' '}
          <button type="button" onClick={showInvitation} disabled={showing} className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium disabled:opacity-60">
            <Eye className="w-4 h-4" /> See the invitation
          </button>
        </p>
      </div>

      {missingAmounts.length > 0 && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          No maximum amount yet for {missingAmounts.join(', ')}: those participants won't see what they can get back.{' '}
          <button type="button" onClick={onBack} className="underline font-medium">
            Set the amounts first
          </button>
        </p>
      )}

      <div className="space-y-3" role="radiogroup" aria-label="When the invitations go out">
        {options.map((option) => (
          <div
            key={option.id}
            role="radio"
            tabIndex={0}
            aria-checked={when === option.id}
            onClick={() => setWhen(option.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setWhen(option.id);
              }
            }}
            className={clsx(
              'rounded-xl border-2 p-4 cursor-pointer transition-colors',
              when === option.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
            )}
          >
            <div className="flex items-center gap-2">
              <option.icon className={clsx('w-4 h-4', when === option.id ? 'text-primary-600' : 'text-gray-400')} />
              <span className="font-semibold text-gray-900">{option.title}</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{option.text}</p>
            {option.id === 'date' && when === 'date' && (
              <label className="block mt-3" onClick={(e) => e.stopPropagation()}>
                <span className="block text-sm font-medium text-gray-700 mb-1">The day</span>
                <input
                  type="date"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <span className="block text-xs text-gray-500 mt-1">Around 8 in the morning, Central European Time. Participants you add before then are invited with the rest.</span>
              </label>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
        <button type="button" onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2">
          Back to the amounts
        </button>
        <Button onClick={confirm} loading={busy} disabled={when === 'date' && !date}>
          {when === 'now' ? `Send ${people} their invitation` : when === 'date' ? 'Plan the invitations' : 'Finish, I send them later'}
        </Button>
      </div>
    </div>
  );
}

function Finished({ finished, projectId }: { finished: InvitationResult; projectId: string }) {
  return (
    <div className="text-center py-6" data-setup-finished>
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="w-8 h-8 text-emerald-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900">Your project is set up</h1>
      <p className="text-gray-600 mt-2 max-w-md mx-auto">
        {finished.kind === 'sent' &&
          `${finished.sent} invitation${finished.sent === 1 ? ' is' : 's are'} on ${finished.sent === 1 ? 'its' : 'their'} way. As soon as participants upload their tickets, you see it on the project's page.`}
        {finished.kind === 'planned' && `The invitations go out on ${longDay(finished.on)}, in the morning. You can change that on the project's page until then.`}
        {finished.kind === 'later' && 'Nothing was sent. When you are ready, send the invitations from the list of participants on the project\'s page.'}
      </p>
      <Link to={`/org/projects/${projectId}`} className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-soft text-white font-medium hover:opacity-90">
        Go to the project <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
