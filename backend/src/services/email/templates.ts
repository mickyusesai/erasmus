/**
 * Shared email templates used by all email service providers
 */

function wrapInLayout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #8b5cf6 0%, #d946ef 50%, #f472b6 100%); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">EasyReimburse</h1>
  </div>
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
    ${content}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
      This email was sent automatically by EasyReimburse. Please do not reply directly to this email.
    </p>
  </div>
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `<div style="text-align: center; margin: 30px 0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" fillcolor="#8b5cf6" stroke="false">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:600;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${url}" style="display: inline-block; background-color: #8b5cf6; background: linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%); color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;" target="_blank"><span style="color: #ffffff;">${label}</span></a>
      <!--<![endif]-->
    </div>`;
}

function warningBox(text: string): string {
  return `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <strong>Important:</strong> ${text}
    </div>`;
}

function infoBox(text: string): string {
  return `<div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      ${text}
    </div>`;
}

function successBox(text: string): string {
  return `<div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      ${text}
    </div>`;
}

// =============================================================================
// MAGIC LINK
// =============================================================================

export function magicLinkSubject(projectName: string): string {
  return `Your Reimbursement Link for ${projectName}`;
}

export function magicLinkText(participantName: string, projectName: string, magicLink: string): string {
  return `Hello ${participantName},

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
This email was sent automatically by EasyReimburse. Please do not reply directly to this email.`;
}

export function magicLinkHtml(participantName: string, projectName: string, magicLink: string): string {
  return wrapInLayout(`
    <p>Hello <strong>${participantName}</strong>,</p>
    <p>You have been invited to submit your travel reimbursement for the Erasmus+ project "${projectName}".</p>
    ${button(magicLink, 'Access Your Reimbursement Page')}
    ${warningBox('Keep this link safe! This is your personal link - do not share it with anyone else.')}
    <h3 style="color: #6b21a8; margin-top: 25px;">What you'll need:</h3>
    <ul style="padding-left: 20px;">
      <li>Your travel documents (tickets, invoices, boarding passes)</li>
      <li>Your bank account details (IBAN)</li>
    </ul>
    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      If you have any questions, please contact the project organizers.
    </p>
  `);
}

// =============================================================================
// WELCOME (Organisation Registration)
// =============================================================================

export function welcomeSubject(): string {
  return 'Welcome to EasyReimburse!';
}

export function welcomeText(organisationName: string, loginUrl: string): string {
  return `Welcome to EasyReimburse, ${organisationName}!

Your organisation account has been created successfully. A free test project (up to 10 participants) has been set up for you to explore the platform.

Here's how to get started:

1. LOG IN to your dashboard: ${loginUrl}
2. Go to your Test Project and configure the country reimbursement limits in Settings
3. Add participants (manually or via CSV import)
4. Send magic links to your participants so they can upload their travel documents
5. Once participants submit, review their reimbursements with AI-assisted checks

Need more than 10 participants? You can purchase project credits or an annual license from the Billing page.

Best regards,
The EasyReimburse Team

---
This email was sent automatically by EasyReimburse. Please do not reply directly to this email.`;
}

export function welcomeHtml(organisationName: string, loginUrl: string): string {
  return wrapInLayout(`
    <p>Welcome to EasyReimburse, <strong>${organisationName}</strong>!</p>
    <p>Your organisation account has been created successfully. A free test project (up to 10 participants) has been set up for you to explore the platform.</p>
    ${button(loginUrl, 'Go to Your Dashboard')}
    <h3 style="color: #6b21a8; margin-top: 25px;">How to get started:</h3>
    <ol style="padding-left: 20px;">
      <li>Go to your <strong>Test Project</strong> and configure the country reimbursement limits in <strong>Settings</strong></li>
      <li>Add participants (manually or via CSV import)</li>
      <li>Send <strong>magic links</strong> to your participants so they can upload their travel documents</li>
      <li>Once participants submit, review their reimbursements with AI-assisted checks</li>
    </ol>
    ${infoBox('Need more than 10 participants? You can purchase project credits or an annual license from the <strong>Billing</strong> page.')}
  `);
}

// =============================================================================
// PASSWORD RESET
// =============================================================================

export function passwordResetSubject(): string {
  return 'Reset Your EasyReimburse Password';
}

export function passwordResetText(organisationName: string, resetLink: string): string {
  return `Hello ${organisationName},

We received a request to reset your password. Click the link below to set a new password:

${resetLink}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

Best regards,
The EasyReimburse Team

---
This email was sent automatically by EasyReimburse. Please do not reply directly to this email.`;
}

export function passwordResetHtml(organisationName: string, resetLink: string): string {
  return wrapInLayout(`
    <p>Hello <strong>${organisationName}</strong>,</p>
    <p>We received a request to reset your password. Click the button below to set a new password:</p>
    ${button(resetLink, 'Reset Your Password')}
    ${warningBox('This link will expire in <strong>1 hour</strong> for security reasons.')}
    <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
      If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
    </p>
  `);
}

// =============================================================================
// SUBMISSION CONFIRMATION
// =============================================================================

export function submissionConfirmationSubject(projectName: string): string {
  return `Reimbursement Submitted - ${projectName}`;
}

export function submissionConfirmationText(participantName: string, projectName: string): string {
  return `Hello ${participantName},

Your travel reimbursement for "${projectName}" has been submitted successfully!

What happens next:
- Your documents and travel data are now being reviewed
- The project organisation will review your submission with AI-assisted checks
- You will receive an email once your reimbursement has been approved
- After approval, payment will be processed to your bank account

You do not need to take any further action. If the organisation needs additional information, they will contact you.

Best regards,
The ${projectName} Team

---
This email was sent automatically by EasyReimburse. Please do not reply directly to this email.`;
}

export function submissionConfirmationHtml(participantName: string, projectName: string): string {
  return wrapInLayout(`
    <p>Hello <strong>${participantName}</strong>,</p>
    ${successBox('Your travel reimbursement for <strong>"' + projectName + '"</strong> has been submitted successfully!')}
    <h3 style="color: #6b21a8; margin-top: 25px;">What happens next:</h3>
    <ol style="padding-left: 20px;">
      <li>Your documents and travel data are now being reviewed</li>
      <li>The project organisation will review your submission with AI-assisted checks</li>
      <li>You will receive an email once your reimbursement has been approved</li>
      <li>After approval, payment will be processed to your bank account</li>
    </ol>
    ${infoBox('You do not need to take any further action. If the organisation needs additional information, they will contact you.')}
  `);
}

// =============================================================================
// REMINDER
// =============================================================================

export function reminderSubject(projectName: string): string {
  return `Reminder: Submit Your Reimbursement for ${projectName}`;
}

export function reminderText(
  participantName: string,
  projectName: string,
  magicLink: string,
  organisationName: string
): string {
  return `Hello ${participantName},

This is a friendly reminder from ${organisationName} that your travel reimbursement for "${projectName}" hasn't been submitted yet.

Please use the following link to access your reimbursement page and complete your submission:

${magicLink}

What you'll need:
- Your travel documents (tickets, invoices, boarding passes)
- Your bank account details (IBAN)

If you have already submitted or if you have any questions, please contact the project organizers.

Best regards,
The ${projectName} Team

---
This email was sent automatically by EasyReimburse on behalf of ${organisationName}. Please do not reply directly to this email.`;
}

export function reminderHtml(
  participantName: string,
  projectName: string,
  magicLink: string,
  organisationName: string
): string {
  return wrapInLayout(`
    <p>Hello <strong>${participantName}</strong>,</p>
    <p>This is a friendly reminder from <strong>${organisationName}</strong> that your travel reimbursement for "${projectName}" hasn't been submitted yet.</p>
    ${button(magicLink, 'Complete Your Reimbursement')}
    <h3 style="color: #6b21a8; margin-top: 25px;">What you'll need:</h3>
    <ul style="padding-left: 20px;">
      <li>Your travel documents (tickets, invoices, boarding passes)</li>
      <li>Your bank account details (IBAN)</li>
    </ul>
    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      If you have already submitted or have any questions, please contact the project organizers.
    </p>
  `);
}

// =============================================================================
// APPROVAL NOTIFICATION
// =============================================================================

export function approvalSubject(projectName: string): string {
  return `Reimbursement Approved - ${projectName}`;
}

export function approvalText(participantName: string, projectName: string, amountEur: number): string {
  const formatted = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amountEur);
  return `Hello ${participantName},

Great news! Your travel reimbursement for "${projectName}" has been approved.

Approved amount: ${formatted}

Payment will be processed to the bank account you provided. The timing depends on the project organisation's payment schedule.

Best regards,
The ${projectName} Team

---
This email was sent automatically by EasyReimburse. Please do not reply directly to this email.`;
}

export function approvalHtml(participantName: string, projectName: string, amountEur: number): string {
  const formatted = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amountEur);
  return wrapInLayout(`
    <p>Hello <strong>${participantName}</strong>,</p>
    ${successBox('Your travel reimbursement for <strong>"' + projectName + '"</strong> has been approved!')}
    <div style="text-align: center; margin: 25px 0;">
      <p style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">Approved amount</p>
      <p style="font-size: 28px; font-weight: 700; color: #059669; margin: 0;">${formatted}</p>
    </div>
    ${infoBox('Payment will be processed to the bank account you provided. The timing depends on the project organisation\'s payment schedule.')}
  `);
}

// =============================================================================
// PAYMENT NOTIFICATION
// =============================================================================

export function paymentSubject(projectName: string): string {
  return `Payment Processed - ${projectName}`;
}

export function paymentText(participantName: string, projectName: string, amountEur: number): string {
  const formatted = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amountEur);
  return `Hello ${participantName},

Your travel reimbursement for "${projectName}" has been marked as paid.

Amount: ${formatted}

The payment has been initiated to the bank account you provided. Please allow a few business days for it to appear in your account.

Best regards,
The ${projectName} Team

---
This email was sent automatically by EasyReimburse. Please do not reply directly to this email.`;
}

export function paymentHtml(participantName: string, projectName: string, amountEur: number): string {
  const formatted = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amountEur);
  return wrapInLayout(`
    <p>Hello <strong>${participantName}</strong>,</p>
    ${successBox('Your reimbursement for <strong>"' + projectName + '"</strong> has been paid!')}
    <div style="text-align: center; margin: 25px 0;">
      <p style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">Amount paid</p>
      <p style="font-size: 28px; font-weight: 700; color: #059669; margin: 0;">${formatted}</p>
    </div>
    ${infoBox('The payment has been initiated to the bank account you provided. Please allow a few business days for it to appear in your account.')}
  `);
}

// =============================================================================
// REOPEN NOTIFICATION
// =============================================================================

export function reopenSubject(projectName: string): string {
  return `Action Required - Your Reimbursement Needs Changes - ${projectName}`;
}

export function reopenText(participantName: string, projectName: string, message: string): string {
  return `Hello ${participantName},

Your travel reimbursement for "${projectName}" has been reopened by the organisation.

Message from the organisation:
"${message}"

Please log in using your original link and make the requested changes, then submit again.

Best regards,
The ${projectName} Team

---
This email was sent automatically by EasyReimburse. Please do not reply directly to this email.`;
}

export function reopenHtml(participantName: string, projectName: string, message: string): string {
  return wrapInLayout(`
    <p>Hello <strong>${participantName}</strong>,</p>
    ${warningBox('Your reimbursement for <strong>"' + projectName + '"</strong> has been reopened and needs changes.')}
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="font-size: 13px; color: #6b7280; margin: 0 0 8px 0; font-weight: 600;">Message from the organisation:</p>
      <p style="margin: 0; color: #374151; white-space: pre-wrap;">${message}</p>
    </div>
    ${infoBox('Please open your original reimbursement link and make the requested changes, then submit again.')}
  `);
}
