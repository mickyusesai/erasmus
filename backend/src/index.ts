import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

import { prisma } from './utils/prisma.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth/index.js';
import organisationRoutes from './routes/organisation/index.js';
import adminRoutes from './routes/admin/index.js';
import participantRoutes from './routes/participant/index.js';
import superAdminRoutes from './routes/superadmin/index.js';
import stripeWebhookRoutes from './routes/stripe/webhook.js';
import inboundRoutes from './routes/inbound/index.js';
import supportRoutes from './routes/support/index.js';
import { getStorageService } from './services/storage/index.js';
import { PLACEHOLDER_PROJECT } from './services/organisation/onboarding.js';
import type { DocumentType } from '@prisma/client';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (required for Railway/Heroku/etc to get correct client IP)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', limiter);

// Stripe webhook — must be registered BEFORE express.json() (needs raw body)
app.use('/api/stripe', stripeWebhookRoutes);

// Participants' email replies (Postmark inbound) — parses its own, larger JSON body
app.use('/api/inbound', inboundRoutes);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (only for development)
if (process.env.NODE_ENV === 'development') {
  const uploadsPath = process.env.STORAGE_LOCAL_PATH || './uploads';
  app.use('/uploads', express.static(path.resolve(uploadsPath)));
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Storage health check
app.get('/api/health/storage', async (_req, res) => {
  try {
    const storage = getStorageService();
    const testPath = `_health-check/${Date.now()}.txt`;
    const testContent = `Storage health check at ${new Date().toISOString()}`;

    // Test write
    await storage.store(
      {
        buffer: Buffer.from(testContent),
        originalname: 'health-check.txt',
        mimetype: 'text/plain',
        size: testContent.length,
      },
      testPath
    );

    // Test exists
    const exists = await storage.exists(testPath);
    if (!exists) {
      throw new Error('File was stored but exists check failed');
    }

    // Test delete
    await storage.delete(testPath);

    res.json({
      status: 'ok',
      storageType: process.env.STORAGE_TYPE || 'local',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Health] Storage check failed:', error);
    res.status(500).json({
      status: 'error',
      storageType: process.env.STORAGE_TYPE || 'local',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/organisation', organisationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/participant', participantRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/support', supportRoutes);

// Error handling
app.use(errorHandler);

// Project-end notifications: when a project's end date has passed, email every
// participant who hasn't submitted yet that they can now build their trips.
// Only projects that ended within the last 72h are picked up (no retroactive
// blast for long-ended projects; tolerant of short downtime). endEmailSentAt
// is set BEFORE sending so a mid-batch failure can never cause a double blast.
async function notifyEndedProjects() {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    const projects = await prisma.project.findMany({
      where: {
        endDate: { lte: now, gt: windowStart },
        endEmailSentAt: null,
        isTestProject: false,
      },
      include: {
        participants: {
          where: { status: 'DRAFT', magicLinkActive: true },
          select: { id: true, email: true, firstName: true, magicLinkToken: true },
        },
      },
    });

    if (projects.length === 0) return;

    const { getEmailService } = await import('./services/email/index.js');
    const { projectEmailContext } = await import('./services/email/context.js');
    const emailService = getEmailService();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    for (const project of projects) {
      await prisma.project.update({
        where: { id: project.id },
        data: { endEmailSentAt: now },
      });
      for (const p of project.participants) {
        const magicLink = `${frontendUrl}/reimbursement?token=${p.magicLinkToken}`;
        const emailCtx = await projectEmailContext(project, p.id);
        emailService
          .sendProjectEnded(p.email, p.firstName, project.name, magicLink, emailCtx)
          .catch((err) => console.error(`[Project End] Failed to email ${p.email}:`, err));
      }
      console.log(`[Project End] Notified ${project.participants.length} participant(s) of "${project.name}"`);
    }
  } catch (err) {
    console.error('[Project End] Error notifying ended projects:', err);
  }
}
// Run on startup and then every hour
notifyEndedProjects();
setInterval(notifyEndedProjects, 60 * 60 * 1000);

// Invitations an organiser planned for a day go out when their moment has come
async function sendPlannedInvitations() {
  try {
    const { sendDueInvitations } = await import('./services/organisation/invitations.js');
    await sendDueInvitations();
  } catch (err) {
    console.error('[Invitations] Error sending planned invitations:', err);
  }
}
// Run on startup and then every 10 minutes
sendPlannedInvitations();
setInterval(sendPlannedInvitations, 10 * 60 * 1000);

// One reminder for an organisation that has not got going three days after signing up
async function sendOnboardingReminders() {
  try {
    const { sendOnboardingReminders: send } = await import('./services/organisation/onboardingReminder.js');
    await send();
  } catch (err) {
    console.error('[Onboarding] Error sending reminders:', err);
  }
}
// Run on startup and then every hour
sendOnboardingReminders();
setInterval(sendOnboardingReminders, 60 * 60 * 1000);

// Stripe cleanup: mark abandoned PENDING purchases as EXPIRED after 24h
async function expireAbandonedPurchases() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { count } = await prisma.purchase.updateMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      data: { status: 'EXPIRED' },
    });
    if (count > 0) console.log(`[Stripe Cleanup] Expired ${count} abandoned purchase(s)`);
  } catch (err) {
    console.error('[Stripe Cleanup] Error expiring purchases:', err);
  }
}
// Run on startup and then every hour
expireAbandonedPurchases();
setInterval(expireAbandonedPurchases, 60 * 60 * 1000);

// The automatic "Test Project" older sign-ups got ends a year after sign-up, so its participants
// could never let the AI build their trips. As long as it is untouched (placeholder name and
// country), the AI is open in it.
async function openAiInPlaceholderTestProjects() {
  try {
    const { count } = await prisma.project.updateMany({
      where: { isTestProject: true, name: PLACEHOLDER_PROJECT.name, country: PLACEHOLDER_PROJECT.country, aiAnalysisUnlocked: false },
      data: { aiAnalysisUnlocked: true },
    });
    if (count > 0) console.log(`[Onboarding] Opened the AI in ${count} placeholder test project(s)`);
  } catch (err) {
    console.error('[Onboarding] Error opening the AI in placeholder test projects:', err);
  }
}
openAiInPlaceholderTestProjects();

// A participant asked for a boarding pass sometimes uploads the flight's invoice and calls it the
// boarding pass or the airline's declaration. Such a file was counted as proof that they flew.
// Where the AI is sure a file is something else, it gets its real type back, once.
async function correctFlightProofThatIsNot() {
  try {
    const { readAsNotFlightProof } = await import('./utils/flightProof.js');
    const documents = await prisma.document.findMany({
      where: { documentType: { in: ['FLIGHT_BOARDING_PASS', 'AIRLINE_DECLARATION'] }, extraction: { isNot: null } },
      select: {
        id: true,
        participantId: true,
        renamedFilename: true,
        documentType: true,
        extraction: { select: { id: true, detectedDocumentType: true, confidence: true, rawAiResponse: true } },
      },
    });
    let corrected = 0;
    for (const doc of documents) {
      const readAs = readAsNotFlightProof(doc.extraction);
      if (!readAs) continue;
      await prisma.$transaction([
        prisma.document.update({ where: { id: doc.id }, data: { documentType: readAs as DocumentType } }),
        prisma.documentExtraction.update({ where: { id: doc.extraction!.id }, data: { detectedDocumentType: readAs as DocumentType } }),
        prisma.changeLogEntry.create({
          data: {
            participantId: doc.participantId,
            userType: 'SUPPORT',
            fieldName: 'document.type',
            previousValue: `${doc.renamedFilename}: ${doc.documentType}`,
            newValue: `${doc.renamedFilename}: ${readAs} (read by the AI: not proof of the flight)`,
          },
        }),
      ]);
      corrected++;
      console.log(`[Startup] ${doc.renamedFilename} (${doc.id}) was counted as ${doc.documentType} but is a ${readAs}`);
    }
    if (corrected > 0) console.log(`[Startup] ${corrected} file(s) no longer counted as proof of a flight`);
  } catch (err) {
    console.error('[Startup] Could not check the files counted as proof of a flight:', err);
  }
}
correctFlightProofThatIsNot();

// Participants who don't need reimbursement are paid nothing; amounts stored before that rule
// are set to 0 once (not for reimbursements that are already approved or paid)
async function zeroNoReimbursementAmounts() {
  try {
    const { count } = await prisma.reimbursementSummary.updateMany({
      where: {
        amountToReimburse: { not: 0 },
        participant: { noReimbursement: true, status: { notIn: ['ADMIN_APPROVED', 'PAID'] } },
      },
      data: { amountToReimburse: 0 },
    });
    if (count > 0) console.log(`[Startup] Amount to pay set to 0 for ${count} participant(s) who don't need reimbursement`);
  } catch (err) {
    console.error('[Startup] Could not update the amounts of participants who don\'t need reimbursement:', err);
  }
}
zeroNoReimbursementAmounts();

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
