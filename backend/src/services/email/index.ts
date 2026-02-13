import { EmailService } from './types.js';
import { ConsoleEmailService } from './consoleEmail.js';
import { PostmarkEmailService } from './postmarkEmail.js';

export * from './types.js';
export { ConsoleEmailService } from './consoleEmail.js';
export { PostmarkEmailService } from './postmarkEmail.js';

/**
 * Factory function to create email service based on environment configuration
 */
export function createEmailService(): EmailService {
  const emailProvider = process.env.EMAIL_PROVIDER || 'console';

  switch (emailProvider) {
    case 'postmark': {
      const serverToken = process.env.POSTMARK_SERVER_TOKEN;
      const from = process.env.EMAIL_FROM || 'micky@easyreimburse.ai';

      if (!serverToken) {
        console.error('[Email] POSTMARK_SERVER_TOKEN is not set, falling back to console');
        return new ConsoleEmailService();
      }

      console.log(`[Email] Using Postmark provider (from: ${from})`);
      return new PostmarkEmailService(serverToken, from);
    }

    case 'console':
      return new ConsoleEmailService();

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
