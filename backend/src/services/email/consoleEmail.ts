import { EmailService, EmailOptions, EmailResult } from './types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Console email service for development
 * Logs emails to the console instead of actually sending them
 */
export class ConsoleEmailService implements EmailService {
  async send(options: EmailOptions): Promise<EmailResult> {
    const messageId = uuidv4();

    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL (Console Mode - Not Actually Sent)');
    console.log('='.repeat(60));
    console.log(`Message ID: ${messageId}`);
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log('-'.repeat(60));
    console.log('TEXT CONTENT:');
    console.log(options.text);
    if (options.html) {
      console.log('-'.repeat(60));
      console.log('HTML CONTENT:');
      console.log(options.html);
    }
    console.log('='.repeat(60) + '\n');

    return {
      success: true,
      messageId,
    };
  }

  async sendMagicLink(
    to: string,
    participantName: string,
    projectName: string,
    magicLink: string
  ): Promise<EmailResult> {
    const subject = `Your Reimbursement Link for ${projectName}`;

    const text = `
Hello ${participantName},

You have been invited to submit your travel reimbursement for the Erasmus+ project "${projectName}".

Please use the following link to access your personal reimbursement page:

${magicLink}

IMPORTANT: Keep this link safe! This is your personal link - do not share it with anyone else.
You can use this link multiple times to return to your reimbursement page.

What you'll need:
- Your travel documents (tickets, invoices, boarding passes)
- Your bank account details (IBAN)

If you have any questions, please contact the project organizers.

Best regards,
The ${projectName} Team

---
This email was sent automatically. Please do not reply directly to this email.
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #8b5cf6 0%, #d946ef 50%, #f472b6 100%); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Travel Reimbursement</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${projectName}</p>
  </div>

  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
    <p>Hello <strong>${participantName}</strong>,</p>

    <p>You have been invited to submit your travel reimbursement for the Erasmus+ project "${projectName}".</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Access Your Reimbursement Page</a>
    </div>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <strong>Important:</strong> Keep this link safe! This is your personal link - do not share it with anyone else.
    </div>

    <h3 style="color: #6b21a8; margin-top: 25px;">What you'll need:</h3>
    <ul style="padding-left: 20px;">
      <li>Your travel documents (tickets, invoices, boarding passes)</li>
      <li>Your bank account details (IBAN)</li>
    </ul>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      If you have any questions, please contact the project organizers.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
      This email was sent automatically. Please do not reply directly to this email.
    </p>
  </div>
</body>
</html>
    `.trim();

    return this.send({ to, subject, text, html });
  }
}
