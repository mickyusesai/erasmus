/**
 * Email service interface
 * Abstraction layer for email sending that can be implemented for different providers
 * (console logging, Postmark, SMTP, SendGrid, AWS SES, etc.)
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
   * Send a raw email
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

  /**
   * Send a welcome email to a newly registered organisation
   */
  sendWelcome(
    to: string,
    organisationName: string,
    loginUrl: string
  ): Promise<EmailResult>;

  /**
   * Send a password reset email to an organisation
   */
  sendPasswordReset(
    to: string,
    organisationName: string,
    resetLink: string
  ): Promise<EmailResult>;

  /**
   * Send a submission confirmation email to a participant
   */
  sendSubmissionConfirmation(
    to: string,
    participantName: string,
    projectName: string
  ): Promise<EmailResult>;

  /**
   * Send a reminder email to a participant who hasn't submitted yet
   */
  sendReminder(
    to: string,
    participantName: string,
    projectName: string,
    magicLink: string,
    organisationName: string
  ): Promise<EmailResult>;

  /**
   * Send a reimbursement approved notification to a participant
   */
  sendApprovalNotification(
    to: string,
    participantName: string,
    projectName: string,
    amountEur: number
  ): Promise<EmailResult>;

  /**
   * Send a payment confirmation notification to a participant
   */
  sendPaymentNotification(
    to: string,
    participantName: string,
    projectName: string,
    amountEur: number
  ): Promise<EmailResult>;

  /**
   * Send a notification that reimbursement has been reopened
   */
  sendReopenNotification(
    to: string,
    participantName: string,
    projectName: string,
    message: string
  ): Promise<EmailResult>;

  /**
   * Send a notification that AI has finished analysing all documents
   * and the participant can now review and complete their reimbursement
   */
  sendAnalysisComplete(
    to: string,
    participantName: string,
    projectName: string,
    magicLink: string
  ): Promise<EmailResult>;

  /**
   * Send a notification that the project has ended and the participant
   * can now let AI build their trips and complete the reimbursement
   */
  sendProjectEnded(
    to: string,
    participantName: string,
    projectName: string,
    magicLink: string
  ): Promise<EmailResult>;

  /**
   * Send a credit purchase confirmation email to an organisation
   */
  sendCreditPurchase(
    to: string,
    organisationName: string,
    credits: number,
    totalCredits: number,
    dashboardUrl: string,
    invoiceUrl?: string | null
  ): Promise<EmailResult>;
}
