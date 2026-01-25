import { EmailService } from './types.js';
import { ConsoleEmailService } from './consoleEmail.js';

export * from './types.js';
export { ConsoleEmailService } from './consoleEmail.js';

/**
 * Factory function to create email service based on environment configuration
 *
 * To add SMTP or other providers later:
 * 1. Create SmtpEmailService implementing EmailService
 * 2. Add case here
 * 3. Configure with credentials from environment
 */
export function createEmailService(): EmailService {
  const emailProvider = process.env.EMAIL_PROVIDER || 'console';

  switch (emailProvider) {
    case 'console':
      return new ConsoleEmailService();

    // Future implementations:
    // case 'smtp':
    //   return new SmtpEmailService({
    //     host: process.env.SMTP_HOST!,
    //     port: parseInt(process.env.SMTP_PORT || '587'),
    //     user: process.env.SMTP_USER!,
    //     password: process.env.SMTP_PASSWORD!,
    //     from: process.env.EMAIL_FROM!,
    //   });
    //
    // case 'sendgrid':
    //   return new SendGridEmailService({
    //     apiKey: process.env.SENDGRID_API_KEY!,
    //     from: process.env.EMAIL_FROM!,
    //   });

    default:
      console.warn(`Unknown email provider: ${emailProvider}, falling back to console`);
      return new ConsoleEmailService();
  }
}

// Singleton instance
let emailInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailInstance) {
    emailInstance = createEmailService();
  }
  return emailInstance;
}
