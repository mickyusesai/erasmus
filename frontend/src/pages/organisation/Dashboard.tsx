import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WelcomeScreen } from '../../components/organisation/WelcomeScreen';
import { NextStepCard } from '../../components/organisation/NextStepCard';
import { FilmModal } from '../../components/organisation/FilmModal';
import { PracticeCard, useOpenPractice } from '../../components/organisation/PracticeCard';
import { openHelp } from '../../components/organisation/Help';
import { organisationApi, OrgDashboardData } from '../../services/api';
import { nextStep, shouldWelcome } from '../../utils/gettingStarted';
import { Plus, Users, FolderKanban, CreditCard, Settings, LogOut, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

// Helper function to format dates as DD-MM-YYYY (European format)
function formatDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export default function OrgDashboard() {
  const navigate = useNavigate();

  // Check if logged in
  useEffect(() => {
    const token = localStorage.getItem('org-token');
    if (!token) {
      navigate('/org/login');
    }
  }, [navigate]);

  const [welcomeClosed, setWelcomeClosed] = useState(false);
  const [showFilm, setShowFilm] = useState(false);
  const practice = useOpenPractice();

  const { data, isLoading, error } = useQuery({
    queryKey: ['org-dashboard'],
    queryFn: organisationApi.getDashboard,
    retry: false,
  });

  const dashboard = data as OrgDashboardData | undefined;
  const queryClient = useQueryClient();

  // The welcome is remembered on the server, so it is the same on every device.
  // Whoever closed the old intro in this browser is not welcomed again.
  const seenOldIntro = !!dashboard && localStorage.getItem(`org-onboarding-${dashboard.organisation.id}`) === 'done';
  const rememberWelcomeSeen = () => {
    setWelcomeClosed(true);
    queryClient.setQueryData<OrgDashboardData>(['org-dashboard'], (current) =>
      current ? { ...current, onboarding: { ...current.onboarding, welcomeSeenAt: new Date().toISOString() } } : current
    );
    organisationApi.markWelcomeSeen().catch(() => { /* it is asked again next time, nothing is lost */ });
  };
  useEffect(() => {
    if (dashboard && seenOldIntro && dashboard.onboarding && !dashboard.onboarding.welcomeSeenAt && !dashboard.supportSession) {
      organisationApi.markWelcomeSeen().catch(() => {});
    }
  }, [dashboard, seenOldIntro]);

  const handleLogout = () => {
    queryClient.clear();
    localStorage.removeItem('org-token');
    navigate('/org/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="animate-pulse space-y-6 max-w-7xl mx-auto px-4 py-8">
          <div className="h-8 w-48 bg-gray-200 rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent>
            <div className="text-center">
              <p className="text-red-600 mb-4">Failed to load dashboard. Please login again.</p>
              <Button onClick={handleLogout}>Go to Login</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Until the first invitations are out, the dashboard points at one next step
  const step = nextStep(dashboard);
  const gettingStarted = !!step;
  const showWelcome = !!step && !welcomeClosed && shouldWelcome(dashboard, seenOldIntro);
  const freeProject = dashboard.freeProject;
  const stepsLeft = dashboard.gettingStarted ? dashboard.gettingStarted.steps.filter((s) => !s.done).length : 0;

  const statCards = [
    {
      label: 'Available Credits',
      value: String(dashboard.credits.available),
      icon: CreditCard,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      to: '/org/billing',
    },
    {
      label: 'Total Projects',
      value: dashboard.stats.projectCount,
      icon: FolderKanban,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: 'Total Participants',
      value: dashboard.stats.totalParticipants,
      icon: Users,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="EasyReimburse" className="w-10 h-10 rounded-xl object-contain" />
            <div>
              <h1 className="font-semibold text-gray-900">EasyReimburse</h1>
              <p className="text-xs text-gray-500">{dashboard.organisation.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dashboard.organisation.isAffiliate && dashboard.organisation.affiliateActive && (
              <Link
                to="/org/affiliate"
                className="px-3 py-2 text-sm text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg transition-colors font-medium"
              >
                Affiliate Program
              </Link>
            )}
            <button
              onClick={openHelp}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Help
            </button>
            <Link
              to="/org/billing"
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Billing
            </Link>
            <Link
              to="/org/settings"
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5" />
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
        {/* Greeting */}
        <div className="flex items-center justify-between gap-4">
          {gettingStarted ? (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Good to have you here{dashboard.organisation.contactFirstName ? `, ${dashboard.organisation.contactFirstName}` : ''}
              </h1>
              <p className="text-gray-500 mt-1">
                {stepsLeft === 1 ? 'One step' : `${stepsLeft} steps`} to go until your participants can send in their tickets.
              </p>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-500 mt-1">Welcome back! Here's your organisation overview.</p>
            </div>
          )}
          {(!gettingStarted || dashboard.projects.length > 0) && (
            <Link to="/org/projects/new" className="flex-shrink-0">
              <Button variant={gettingStarted ? 'secondary' : 'primary'}>
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </Link>
          )}
        </div>

        {/* The one next step, until the first invitations are out */}
        {step && dashboard.gettingStarted && (
          <NextStepCard step={step} progress={dashboard.gettingStarted} onWatchFilm={() => setShowFilm(true)} />
        )}

        {/* The practice project: a made-up exchange to try everything with. For a new organisation
            it is right here; one that is under way finds it as a line below its projects. */}
        {gettingStarted && dashboard.practice !== undefined && <PracticeCard dashboard={dashboard} />}

        {/* Stats Grid (says little before there is anything to count) */}
        {!gettingStarted && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {statCards.map((stat) => {
              const card = (
                <Card key={stat.label}>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">{stat.label}</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                        {stat.to && <p className="text-xs text-primary-600 mt-1">Billing and credits</p>}
                      </div>
                      <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                        <stat.icon className={`w-6 h-6 ${stat.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              return stat.to ? (
                <Link key={stat.label} to={stat.to} className="block hover:opacity-90 transition-opacity">{card}</Link>
              ) : card;
            })}
          </div>
        )}

        {/* Projects List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Your Projects</h2>
              {dashboard.projects.length > 0 && (
                <Link
                  to="/org/projects/new"
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                >
                  Create new <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {dashboard.projects.length === 0 ? (
              freeProject?.available ? (
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-dashed border-primary-200 bg-primary-50/40">
                  <div>
                    <p className="font-medium text-gray-900">Your first project</p>
                    <p className="text-sm text-gray-600">Free for up to {freeProject.maxParticipants} participants · not set up yet</p>
                  </div>
                  <Link to="/org/projects/new" className="flex-shrink-0">
                    <Button variant="secondary">Set up</Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No projects yet</p>
                  <Link
                    to="/org/projects/new"
                    className="text-primary-600 hover:text-primary-700 font-medium text-sm mt-2 inline-block"
                  >
                    Create your first project
                  </Link>
                </div>
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="pb-3">Project</th>
                      <th className="pb-3">Location</th>
                      <th className="pb-3">Dates</th>
                      <th className="pb-3">Participants</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dashboard.projects.map((project) => (
                      <tr key={project.id} className="hover:bg-gray-50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/org/projects/${project.id}`}
                              className="font-medium text-gray-900 hover:text-primary-600"
                            >
                              {project.name}
                            </Link>
                            {project.isTestProject && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                Free
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-gray-600">{project.country}</td>
                        <td className="py-3 text-gray-600 text-sm">
                          {formatDate(project.startDate)} - {formatDate(project.endDate)}
                        </td>
                        <td className="py-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {project.participantCount}
                            {project.maxParticipants ? `/${project.maxParticipants}` : ''} participants
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {!gettingStarted && dashboard.practice !== undefined && <PracticeCard dashboard={dashboard} quiet />}
      </main>

      {showWelcome && step && (
        <WelcomeScreen
          organisationName={dashboard.organisation.name}
          step={step}
          onPractice={async () => {
            // The welcome stays until the practice project is there (making it can take a moment)
            if (await practice.open(dashboard.practice?.projectId)) rememberWelcomeSeen();
          }}
          practiceOpening={practice.opening}
          onStart={() => {
            rememberWelcomeSeen();
            navigate(step.to);
          }}
          onWatchFilm={() => setShowFilm(true)}
          onLookAround={rememberWelcomeSeen}
        />
      )}
      {showFilm && <FilmModal onClose={() => setShowFilm(false)} />}
    </div>
  );
}
