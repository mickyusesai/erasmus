import { ServerClient } from 'postmark';
import { EmailService, EmailOptions, EmailResult } from './types.js';
import * as templates from './templates.js';

/**
 * Postmark email service for production
 * Sends real emails via the Postmark API
 */
export class PostmarkEmailService implements EmailService {
  private client: ServerClient;
  private from: string;

  constructor(serverToken: string, from: string) {
    this.client = new ServerClient(serverToken);
    this.from = from;
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    try {
      const result = await this.client.sendEmail({
        From: this.from,
        To: options.to,
        Subject: options.subject,
        TextBody: options.text,
        HtmlBody: options.html || undefined,
        MessageStream: 'outbound',
      });

      return {
        success: true,
        messageId: result.MessageID,
      };
    } catch (error: any) {
      console.error('[Postmark] Failed to send email:', error?.message || error);
      return {
        success: false,
        error: error?.message || 'Failed to send email via Postmark',
      };
    }
  }

  async sendMagicLink(to: string, participantName: string, projectName: string, magicLink: string): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.magicLinkSubject(projectName),
      text: templates.magicLinkText(participantName, projectName, magicLink),
      html: templates.magicLinkHtml(participantName, projectName, magicLink),
    });
  }

  async sendWelcome(to: string, organisationName: string, loginUrl: string): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.welcomeSubject(),
      text: templates.welcomeText(organisationName, loginUrl),
      html: templates.welcomeHtml(organisationName, loginUrl),
    });
  }

  async sendPasswordReset(to: string, organisationName: string, resetLink: string): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.passwordResetSubject(),
      text: templates.passwordResetText(organisationName, resetLink),
      html: templates.passwordResetHtml(organisationName, resetLink),
    });
  }

  async sendSubmissionConfirmation(to: string, participantName: string, projectName: string): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.submissionConfirmationSubject(projectName),
      text: templates.submissionConfirmationText(participantName, projectName),
      html: templates.submissionConfirmationHtml(participantName, projectName),
    });
  }

  async sendReminder(to: string, participantName: string, projectName: string, magicLink: string, organisationName: string): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.reminderSubject(projectName),
      text: templates.reminderText(participantName, projectName, magicLink, organisationName),
      html: templates.reminderHtml(participantName, projectName, magicLink, organisationName),
    });
  }

  async sendApprovalNotification(to: string, participantName: string, projectName: string, amountEur: number): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.approvalSubject(projectName),
      text: templates.approvalText(participantName, projectName, amountEur),
      html: templates.approvalHtml(participantName, projectName, amountEur),
    });
  }

  async sendPaymentNotification(to: string, participantName: string, projectName: string, amountEur: number): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.paymentSubject(projectName),
      text: templates.paymentText(participantName, projectName, amountEur),
      html: templates.paymentHtml(participantName, projectName, amountEur),
    });
  }

  async sendReopenNotification(to: string, participantName: string, projectName: string, message: string): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.reopenSubject(projectName),
      text: templates.reopenText(participantName, projectName, message),
      html: templates.reopenHtml(participantName, projectName, message),
    });
  }

  async sendAnalysisComplete(to: string, participantName: string, projectName: string, magicLink: string): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.analysisCompleteSubject(projectName),
      text: templates.analysisCompleteText(participantName, projectName, magicLink),
      html: templates.analysisCompleteHtml(participantName, projectName, magicLink),
    });
  }

  async sendCreditPurchase(to: string, organisationName: string, credits: number, totalCredits: number, dashboardUrl: string): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.creditPurchaseSubject(credits),
      text: templates.creditPurchaseText(organisationName, credits, totalCredits, dashboardUrl),
      html: templates.creditPurchaseHtml(organisationName, credits, totalCredits, dashboardUrl),
    });
  }
}
