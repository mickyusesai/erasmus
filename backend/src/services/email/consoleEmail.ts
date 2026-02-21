import { EmailService, EmailOptions, EmailResult } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import * as templates from './templates.js';

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
}
