import { useEffect, useState } from 'react';
import { MailX, X } from 'lucide-react';
import type { EmailPreview, EmailShown } from '../../services/api';
import { Button } from '../ui/Button';

interface Shown {
  email: EmailPreview;
  count: number;
}

let open: ((shown: Shown) => void) | null = null;

/**
 * In the practice project no email is sent: the action answers with the email as it would
 * have gone out. This shows it. Returns true when there was one, so the caller doesn't also
 * say "sent".
 */
export function showEmailInstead(result: EmailShown | null | undefined): boolean {
  if (!result?.emailPreview) return false;
  open?.({ email: result.emailPreview, count: result.emailPreviewCount ?? 1 });
  return true;
}

/** Links in the shown email open in a new tab (the participant's page), never inside the frame */
function emailDocument(html: string): string {
  const base = '<base target="_blank">';
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => head + base) : base + html;
}

/** Mounted once for the whole app; opened with showEmailInstead() */
export function EmailPreviewHost() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    open = setShown;
    return () => {
      open = null;
    };
  }, []);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShown(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown]);

  if (!shown) return null;
  const { email, count } = shown;
  const close = () => setShown(null);

  return (
    <div className="fixed inset-0 z-[70] bg-gray-900/60 flex items-center justify-center p-4 animate-fadeIn" onClick={close}>
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-elevated flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <MailX className="w-5 h-5 text-amber-700" />
            </div>
            <div className="min-w-0">
              <h2 id="email-preview-title" className="text-lg font-semibold text-gray-900">
                This is the email they would get
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Nothing was sent: the participants of the practice project are made up.
                {count > 1 && ` The other ${count - 1} would get the same email, with their own name and link.`}
              </p>
            </div>
          </div>
          <button onClick={close} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <dl className="px-6 py-3 text-sm grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 border-b border-gray-100 bg-gray-50">
          {email.fromName && (
            <>
              <dt className="text-gray-500">From</dt>
              <dd className="text-gray-900 truncate">{email.fromName}</dd>
            </>
          )}
          <dt className="text-gray-500">To</dt>
          <dd className="text-gray-900 truncate">{email.to}</dd>
          <dt className="text-gray-500">Subject</dt>
          <dd className="text-gray-900 font-medium">{email.subject}</dd>
        </dl>

        <div className="flex-1 min-h-0 overflow-hidden bg-gray-100">
          {email.html ? (
            <iframe
              title="The email"
              srcDoc={emailDocument(email.html)}
              // No scripts; a link in the email may open the participant's page in a new tab
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className="w-full h-[52vh] bg-white"
            />
          ) : (
            <pre className="h-[52vh] overflow-auto p-6 text-sm text-gray-800 whitespace-pre-wrap font-sans bg-white">{email.text}</pre>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <Button onClick={close}>Close</Button>
        </div>
      </div>
    </div>
  );
}
