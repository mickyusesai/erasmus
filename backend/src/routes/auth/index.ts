import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../utils/prisma.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ValidationError, UnauthorizedError, ConflictError } from '../../middleware/errorHandler.js';
import {
  generateOrganisationToken,
  generateSuperAdminToken,
  organisationAuth,
} from '../../middleware/auth.js';
import { getEmailService } from '../../services/email/index.js';

const router = Router();

// =============================================================================
// CONSTANTS
// =============================================================================

const TEST_PROJECT_MAX_PARTICIPANTS = 10;

// =============================================================================
// ORGANISATION AUTH ROUTES
// =============================================================================

const registerSchema = z.object({
  name: z.string().min(2, 'Organisation name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  oid: z.string().optional(), // Organisation ID - optional identifier
});

/**
 * POST /api/auth/register
 * Register a new organisation account
 * Automatically creates a free test project with max 10 participants
 */
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { name, email, password, oid } = result.data;

  // Check if email already exists
  const existingOrg = await prisma.organisation.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingOrg) {
    throw new ConflictError('An account with this email already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create organisation with test project in a transaction
  const organisation = await prisma.$transaction(async (tx) => {
    // Create organisation
    const org = await tx.organisation.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        oid: oid || null,
      },
    });

    // Create free test project
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1); // 1 year from now

    await tx.project.create({
      data: {
        organisationId: org.id,
        name: 'Test Project',
        description: 'A free test project to try out the platform. Limited to 10 participants.',
        country: 'Test',
        startDate,
        endDate,
        isTestProject: true,
        maxParticipants: TEST_PROJECT_MAX_PARTICIPANTS,
        creditSource: null, // No credit consumed for test projects
      },
    });

    return org;
  });

  // Generate token
  const token = generateOrganisationToken(organisation);

  // Send welcome email (fire and forget)
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const emailService = getEmailService();
  emailService.sendWelcome(
    organisation.email,
    organisation.name,
    `${frontendUrl}/org/login`
  ).catch((err) => console.error('[Email] Failed to send welcome email:', err));

  res.status(201).json({
    message: 'Registration successful! A free test project has been created for you with up to 10 participants.',
    token,
    organisation: {
      id: organisation.id,
      name: organisation.name,
      email: organisation.email,
      projectCredits: organisation.projectCredits,
      hasAnnualLicense: organisation.hasAnnualLicense,
    },
  });
}));

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/login
 * Login to organisation account
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { email, password } = result.data;

  // Find organisation
  const organisation = await prisma.organisation.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!organisation) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!organisation.isActive) {
    throw new UnauthorizedError('Account is deactivated. Please contact support.');
  }

  // Verify password
  const passwordValid = await bcrypt.compare(password, organisation.passwordHash);

  if (!passwordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Generate token
  const token = generateOrganisationToken(organisation);

  res.json({
    message: 'Login successful',
    token,
    organisation: {
      id: organisation.id,
      name: organisation.name,
      email: organisation.email,
      projectCredits: organisation.projectCredits,
      hasAnnualLicense: organisation.hasAnnualLicense,
      annualLicenseExpiresAt: organisation.annualLicenseExpiresAt,
    },
  });
}));

/**
 * GET /api/auth/me
 * Get current organisation info
 */
router.get('/me', organisationAuth, asyncHandler(async (req: Request, res: Response) => {
  const organisation = req.organisation!;

  // Get project count
  const projectCount = await prisma.project.count({
    where: { organisationId: organisation.id },
  });

  // Get active participant count
  const participantCount = await prisma.participant.count({
    where: {
      project: { organisationId: organisation.id },
    },
  });

  res.json({
    organisation: {
      id: organisation.id,
      name: organisation.name,
      email: organisation.email,
      oid: organisation.oid,
      projectCredits: organisation.projectCredits,
      hasAnnualLicense: organisation.hasAnnualLicense,
      annualLicenseExpiresAt: organisation.annualLicenseExpiresAt,
      annualLicenseStartedAt: organisation.annualLicenseStartedAt,
      createdAt: organisation.createdAt,
    },
    stats: {
      projectCount,
      participantCount,
    },
  });
}));

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

/**
 * POST /api/auth/change-password
 * Change organisation password
 */
router.post('/change-password', organisationAuth, asyncHandler(async (req: Request, res: Response) => {
  const organisation = req.organisation!;
  const result = changePasswordSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { currentPassword, newPassword } = result.data;

  // Verify current password
  const passwordValid = await bcrypt.compare(currentPassword, organisation.passwordHash);

  if (!passwordValid) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update password
  await prisma.organisation.update({
    where: { id: organisation.id },
    data: { passwordHash },
  });

  res.json({ message: 'Password changed successfully' });
}));

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Organisation name must be at least 2 characters').optional(),
  email: z.string().email('Invalid email address').optional(),
});

/**
 * PATCH /api/auth/profile
 * Update organisation profile
 */
router.patch('/profile', organisationAuth, asyncHandler(async (req: Request, res: Response) => {
  const organisation = req.organisation!;
  const result = updateProfileSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { name, email } = result.data;

  // If email is being changed, check it's not already taken
  if (email && email.toLowerCase() !== organisation.email) {
    const existingOrg = await prisma.organisation.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingOrg) {
      throw new ConflictError('An account with this email already exists');
    }
  }

  // Update organisation
  const updated = await prisma.organisation.update({
    where: { id: organisation.id },
    data: {
      ...(name && { name }),
      ...(email && { email: email.toLowerCase() }),
    },
  });

  res.json({
    message: 'Profile updated successfully',
    organisation: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
    },
  });
}));

// =============================================================================
// PASSWORD RESET
// =============================================================================

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

/**
 * POST /api/auth/forgot-password
 * Request a password reset link (sent via email)
 */
router.post('/forgot-password', asyncHandler(async (req: Request, res: Response) => {
  const result = forgotPasswordSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { email } = result.data;

  // Always return success to prevent email enumeration
  const organisation = await prisma.organisation.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (organisation) {
    // Generate reset token (expires in 1 hour)
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.organisation.update({
      where: { id: organisation.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpiresAt: expiresAt,
      },
    });

    // Send reset email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/org/reset-password?token=${resetToken}`;

    const emailService = getEmailService();
    emailService.sendPasswordReset(
      organisation.email,
      organisation.name,
      resetLink
    ).catch((err) => console.error('[Email] Failed to send password reset email:', err));
  }

  res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
}));

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

/**
 * POST /api/auth/reset-password
 * Reset password using a valid reset token
 */
router.post('/reset-password', asyncHandler(async (req: Request, res: Response) => {
  const result = resetPasswordSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { token, newPassword } = result.data;

  // Find organisation with valid (non-expired) token
  const organisation = await prisma.organisation.findUnique({
    where: { passwordResetToken: token },
  });

  if (!organisation || !organisation.passwordResetExpiresAt || organisation.passwordResetExpiresAt < new Date()) {
    throw new ValidationError('Invalid or expired reset link. Please request a new one.');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update password and clear reset token
  await prisma.organisation.update({
    where: { id: organisation.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
  });

  res.json({ message: 'Password has been reset successfully. You can now log in with your new password.' });
}));

// =============================================================================
// SUPER ADMIN AUTH ROUTES
// =============================================================================

/**
 * POST /api/auth/super-admin/login
 * Login as super admin
 */
router.post('/super-admin/login', asyncHandler(async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { email, password } = result.data;

  // Find super admin
  const admin = await prisma.superAdmin.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!admin) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Verify password
  const passwordValid = await bcrypt.compare(password, admin.passwordHash);

  if (!passwordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Generate token
  const token = generateSuperAdminToken(admin);

  res.json({
    message: 'Login successful',
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
  });
}));

export default router;
