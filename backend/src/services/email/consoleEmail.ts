import { EmailService, EmailOptions, EmailResult, ProjectEmailContext } from './types.js';

import { v4 as uuidv4 } from 'uuid';
import * as templates from './templates.js';
/** Sender display name + Reply-To derived from the project's organisation */
function senderFor(ctx?: ProjectEmailContext): Pick<EmailOptions, 'fromName' | 'replyTo'> {
  if (!ctx) return {};
  return { fromName: `${ctx.organisationName} via EasyReimburse`, replyTo: ctx.replyTo };
}

/**
 * Console email service for development
 * Logs emails to the console instead of actually sending them
 */
export class ConsoleEmailService implements EmailService {
  async send(options: EmailOptions): Promise<EmailResult> {
    const messageId = uuidv4();

    console.log('\n' + '='.repeat(60));
    console.log('EMAIL (Console Mode - Not Actually Sent)');
    console.log('='.repeat(60));
    console.log(`Message ID: ${messageId}`);
    console.log(`To: ${options.to}`);
    if (options.fromName) console.log(`From: "${options.fromName}"`);
    if (options.replyTo) console.log(`Reply-To: ${options.replyTo}`);
    console.log(`Subject: ${options.subject}`);
    console.log('-'.repeat(60));
    console.log('TEXT CONTENT:');
    console.log(options.text);
    if (options.html) {
      console.log('-'.repeat(60));
      console.log('HTML CONTENT: [omitted in console mode]');
    }
    console.log('='.repeat(60) + '\n');

    return { success: true, messageId };
  }

  async sendMagicLink(to: string, participantName: string, projectName: string, magicLink: string, ctx?: ProjectEmailContext): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.magicLinkSubject(projectName),
      text: templates.magicLinkText(participantName, projectName, magicLink, ctx),
      html: templates.magicLinkHtml(participantName, projectName, magicLink, ctx),
      ...senderFor(ctx),
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

  async sendReminder(to: string, participantName: string, projectName: string, magicLink: string, organisationName: string, ctx?: ProjectEmailContext): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.reminderSubject(projectName),
      text: templates.reminderText(participantName, projectName, magicLink, organisationName, ctx),
      html: templates.reminderHtml(participantName, projectName, magicLink, organisationName, ctx),
      ...senderFor(ctx),
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

  async sendProjectEnded(to: string, participantName: string, projectName: string, magicLink: string, ctx?: ProjectEmailContext): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.projectEndedSubject(projectName),
      text: templates.projectEndedText(participantName, projectName, magicLink, ctx),
      html: templates.projectEndedHtml(participantName, projectName, magicLink, ctx),
      ...senderFor(ctx),
    });
  }

  async sendCreditPurchase(to: string, organisationName: string, credits: number, totalCredits: number, dashboardUrl: string, invoiceUrl?: string | null): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.creditPurchaseSubject(credits),
      text: templates.creditPurchaseText(organisationName, credits, totalCredits, dashboardUrl, invoiceUrl),
      html: templates.creditPurchaseHtml(organisationName, credits, totalCredits, dashboardUrl, invoiceUrl),
    });
  }
}
