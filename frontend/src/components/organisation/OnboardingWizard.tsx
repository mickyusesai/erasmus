import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Users,
  Mail,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  FileSpreadsheet,
  UserPlus,
  Sparkles,
  Link,
} from 'lucide-react';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const slides = [
  {
    id: 'welcome',
    icon: Sparkles,
    iconColor: 'text-primary-600',
    iconBg: 'bg-primary-100',
    title: 'Welcome to EasyReimburse!',
    content: (
      <div className="space-y-3 text-gray-600 text-sm leading-relaxed">
        <p>
          EasyReimburse handles the full lifecycle of Erasmus+ travel reimbursements — from collecting documents to paying participants.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {[
            { step: '1', label: 'Create a project' },
            { step: '2', label: 'Add participants' },
            { step: '3', label: 'They upload documents' },
            { step: '4', label: 'AI reviews + you approve' },
          ].map(({ step, label }) => (
            <div key={step} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
              <span className="w-5 h-5 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                {step}
              </span>
              <span className="text-xs text-gray-700">{label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          This short guide walks you through everything. It takes about 2 minutes.
        </p>
      </div>
    ),
  },
  {
    id: 'project',
    icon: FolderKanban,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    title: 'Create your first project',
    content: (
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
        <p>
          A <strong className="text-gray-800">project</strong> represents one Erasmus+ mobility (e.g. a youth exchange or training course).
          Each project uses <strong className="text-gray-800">1 credit</strong>.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">You'll fill in:</p>
          {['Project name', 'Host country', 'Venue address (helps the AI)', 'Arrival & departure dates'].map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs text-blue-700">
              <CheckCircle className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          No credits yet? You can create a <strong>free test project</strong> (limited to a small number of participants) to explore the platform first.
        </p>
      </div>
    ),
  },
  {
    id: 'participants',
    icon: Users,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    title: 'Add participants',
    content: (
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
        <p>Once your project is created, add the participants travelling to the event.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-gray-200 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-gray-800">CSV Upload</span>
            </div>
            <p className="text-xs text-gray-500">
              Download the template, fill in the spreadsheet, and upload it. Fastest for large groups.
            </p>
            <div className="text-xs text-gray-400 font-mono bg-gray-50 rounded p-1.5">
              first_name, last_name,<br />email, country
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <UserPlus className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-gray-800">Manual Add</span>
            </div>
            <p className="text-xs text-gray-500">
              Use the <strong>+ Add</strong> button in your project to add participants one by one.
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          You can set reimbursement limits per country in the project's <strong>Settings</strong> tab.
        </p>
      </div>
    ),
  },
  {
    id: 'magic-links',
    icon: Mail,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
    title: 'Send magic links',
    content: (
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
        <p>
          Participants don't need an account. You send each one a <strong className="text-gray-800">magic link</strong> — a unique, secure URL they click to access their personal reimbursement page.
        </p>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-purple-800">What participants do with their link:</p>
          {[
            'Upload travel documents (tickets, boarding passes, receipts)',
            'Review AI-extracted travel items and correct any mistakes',
            'Enter their bank details',
            'Submit for your review',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2 text-xs text-purple-700">
              <Link className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
              {item}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          You'll receive a notification when someone submits. Then you review the AI findings and approve or send back for corrections.
        </p>
      </div>
    ),
  },
  {
    id: 'done',
    icon: CheckCircle,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    title: "You're all set!",
    content: (
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
        <p>
          That's everything you need to know to run your first reimbursement cycle. Here's a quick recap:
        </p>
        <ol className="space-y-1.5 list-none">
          {[
            'Create a project',
            'Add participants (CSV or manual)',
            'Send magic links',
            'Participants upload docs & submit',
            'You review AI findings & approve',
            'Mark as paid — done!',
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-bold flex-shrink-0">
                {i + 1}
              </span>
              <span className="text-gray-700">{item}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-500 mt-2">
          Need help later? Reach us at{' '}
          <a href="mailto:support@easyreimburse.ai" className="text-primary-600 hover:underline">
            support@easyreimburse.ai
          </a>
        </p>
      </div>
    ),
  },
];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [current, setCurrent] = useState(0);
  const navigate = useNavigate();
  const slide = slides[current];
  const isLast = current === slides.length - 1;
  const Icon = slide.icon;

  const handleNext = () => {
    if (isLast) return;
    setCurrent((c) => c + 1);
  };

  const handleBack = () => {
    if (current === 0) return;
    setCurrent((c) => c - 1);
  };

  const handleCreateProject = () => {
    onComplete();
    navigate('/org/projects/new');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Skip link — hidden on last slide */}
        {!isLast && (
          <button
            onClick={onComplete}
            className="absolute top-4 right-4 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Skip intro
          </button>
        )}

        {/* Slide content */}
        <div className="p-8">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-xl ${slide.iconBg} flex items-center justify-center mb-5`}>
            <Icon className={`w-6 h-6 ${slide.iconColor}`} />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-gray-900 mb-3">{slide.title}</h2>

          {/* Body */}
          <div>{slide.content}</div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-6">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`rounded-full transition-all duration-200 ${
                  i === current
                    ? 'w-5 h-2 bg-primary-600'
                    : 'w-2 h-2 bg-gray-200 hover:bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          {isLast ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleCreateProject}
                className="w-full py-2.5 px-4 bg-primary-600 text-white rounded-xl font-medium text-sm hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
              >
                Create my first project
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={onComplete}
                className="w-full py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
              >
                Explore dashboard
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {current > 0 && (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex-1 py-2.5 px-4 bg-primary-600 text-white rounded-xl font-medium text-sm hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
