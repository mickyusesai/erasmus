import { ConsoleEmailService } from './consoleEmail.js';
import { getEmailService } from './index.js';
import type { EmailOptions, EmailResult, EmailService } from './types.js';

/** An email as it would have been sent, to show instead of sending it */
export interface EmailPreview {
  to: string;
  fromName: string | null;
  subject: string;
  text: string;
  html: string | null;
}

/**
 * Writes every email exactly as the real service would, and keeps it instead of sending it.
 * Used in the practice project, where the participants are made up: the organiser gets to see
 * what a participant would have received.
 */
export class PreviewEmailService extends ConsoleEmailService {
  readonly written: EmailPreview[] = [];

  async send(options: EmailOptions): Promise<EmailResult> {
    this.written.push({
      to: options.to,
      fromName: options.fromName ?? null,
      subject: options.subject,
      text: options.text,
      html: options.html ?? null,
    });
    return { success: true, messageId: 'preview-only' };
  }
}

export interface Mailer {
  service: EmailService;
  /** True when nothing is sent and the emails are kept to be shown */
  previewOnly: boolean;
  /** The first email that was written instead of sent (undefined when emails are really sent) */
  preview(): EmailPreview | undefined;
  /** How many emails were written instead of sent */
  previewCount(): number;
}

/** The email service for a project: the real one, or in the practice project one that only shows */
export function mailerFor(project: { isPracticeProject: boolean }): Mailer {
  if (!project.isPracticeProject) {
    return { service: getEmailService(), previewOnly: false, preview: () => undefined, previewCount: () => 0 };
  }
  const service = new PreviewEmailService();
  return { service, previewOnly: true, preview: () => service.written[0], previewCount: () => service.written.length };
}
