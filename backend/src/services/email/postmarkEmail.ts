import { ServerClient } from 'postmark';
import { EmailService, EmailOptions, EmailResult, ProjectEmailContext } from './types.js';

import * as templates from './templates.js';
import { canNeverReceiveMail } from './reservedAddresses.js';
import { SUPPORT_EMAIL, SUPPORT_SENDER_NAME } from './support.js';
/** Sender display name + Reply-To derived from the project's organisation */
function senderFor(ctx?: ProjectEmailContext): Pick<EmailOptions, 'fromName' | 'replyTo'> {
  if (!ctx) return {};
  return { fromName: `${ctx.organisationName} via EasyReimburse`, replyTo: ctx.replyTo };
}

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
    // An example address (the made-up participants of the practice project) can never receive
    // mail: sending would only bounce
    if (canNeverReceiveMail(options.to)) {
      console.log(`[Postmark] Not sent: ${options.to} is an example address ("${options.subject}")`);
      return { success: true, messageId: 'not-sent-example-address' };
    }

    try {
      // The address must stay the verified sender; only the display name varies
      const from = options.fromName
        ? `"${options.fromName.replace(/"/g, '')}" <${this.from}>`
        : this.from;
      const result = await this.client.sendEmail({
        From: from,
        To: options.to,
        ReplyTo: options.replyTo || undefined,
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

  async sendMagicLink(to: string, participantName: string, projectName: string, magicLink: string, ctx?: ProjectEmailContext): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.magicLinkSubject(projectName),
      text: templates.magicLinkText(participantName, projectName, magicLink, ctx),
      html: templates.magicLinkHtml(participantName, projectName, magicLink, ctx),
      ...senderFor(ctx),
    });
  }

  async sendWelcome(to: string, organisationName: string, loginUrl: string, firstName?: string | null): Promise<EmailResult> {
    const details = { organisationName, firstName, loginUrl };
    return this.send({
      to,
      subject: templates.welcomeSubject(firstName),
      text: templates.welcomeText(details),
      html: templates.welcomeHtml(details),
      // From a person: a reply reaches Micky
      fromName: SUPPORT_SENDER_NAME,
      replyTo: SUPPORT_EMAIL,
    });
  }

  async sendOnboardingReminder(
    to: string,
    details: { organisationName: string; firstName?: string | null; loginUrl: string; where: string; button: string }
  ): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.onboardingReminderSubject(details.firstName),
      text: templates.onboardingReminderText(details),
      html: templates.onboardingReminderHtml(details),
      fromName: SUPPORT_SENDER_NAME,
      replyTo: SUPPORT_EMAIL,
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

  async sendSubmissionConfirmation(to: string, participantName: string, projectName: string, ctx?: ProjectEmailContext): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.submissionConfirmationSubject(projectName),
      text: templates.submissionConfirmationText(participantName, projectName, ctx),
      html: templates.submissionConfirmationHtml(participantName, projectName, ctx),
      ...senderFor(ctx),
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

  async sendApprovalNotification(to: string, participantName: string, projectName: string, amountEur: number, ctx?: ProjectEmailContext): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.approvalSubject(projectName),
      text: templates.approvalText(participantName, projectName, amountEur, ctx),
      html: templates.approvalHtml(participantName, projectName, amountEur, ctx),
      ...senderFor(ctx),
    });
  }

  async sendPaymentNotification(to: string, participantName: string, projectName: string, amountEur: number, ctx?: ProjectEmailContext): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.paymentSubject(projectName),
      text: templates.paymentText(participantName, projectName, amountEur, ctx),
      html: templates.paymentHtml(participantName, projectName, amountEur, ctx),
      ...senderFor(ctx),
    });
  }

  async sendReopenNotification(to: string, participantName: string, projectName: string, message: string, ctx?: ProjectEmailContext): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.reopenSubject(projectName),
      text: templates.reopenText(participantName, projectName, message, ctx),
      html: templates.reopenHtml(participantName, projectName, message, ctx),
      ...senderFor(ctx),
    });
  }

  async sendBankDetailsChanged(
    to: string,
    participantName: string,
    projectName: string,
    details: { holderName: string | null; maskedAccount: string; bic: string | null },
    ctx?: ProjectEmailContext
  ): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.bankDetailsChangedSubject(projectName),
      text: templates.bankDetailsChangedText(participantName, projectName, details, ctx),
      html: templates.bankDetailsChangedHtml(participantName, projectName, details, ctx),
      ...senderFor(ctx),
    });
  }

  async sendAnalysisComplete(to: string, participantName: string, projectName: string, magicLink: string, ctx?: ProjectEmailContext): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.analysisCompleteSubject(projectName),
      text: templates.analysisCompleteText(participantName, projectName, magicLink, ctx),
      html: templates.analysisCompleteHtml(participantName, projectName, magicLink, ctx),
      ...senderFor(ctx),
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

  async sendGreenTravelExtra(
    to: string,
    participantName: string,
    projectName: string,
    amounts: { foodEur: number; accommodationEur: number; note: string | null; newTotalEur: number },
    magicLink: string,
    ctx?: ProjectEmailContext
  ): Promise<EmailResult> {
    return this.send({
      to,
      subject: templates.greenTravelExtraSubject(projectName, amounts),
      text: templates.greenTravelExtraText(participantName, projectName, amounts, magicLink, ctx),
      html: templates.greenTravelExtraHtml(participantName, projectName, amounts, magicLink, ctx),
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
