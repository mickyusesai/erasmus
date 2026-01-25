/**
 * Email service interface
 * Abstraction layer for email sending that can be implemented for different providers
 * (console logging, SMTP, SendGrid, AWS SES, etc.)
 */

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailService {
  /**
   * Send an email
   */
  send(options: EmailOptions): Promise<EmailResult>;

  /**
   * Send a magic link email to a participant
   */
  sendMagicLink(
    to: string,
    participantName: string,
    projectName: string,
    magicLink: string
  ): Promise<EmailResult>;
}
