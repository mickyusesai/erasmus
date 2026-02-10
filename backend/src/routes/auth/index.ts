import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import prisma from '../../utils/prisma.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ValidationError, UnauthorizedError, ConflictError } from '../../middleware/errorHandler.js';
import {
  generateOrganisationToken,
  generateSuperAdminToken,
  organisationAuth,
} from '../../middleware/auth.js';

const router = Router();

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
  oid: z.string().optional(), // Organisation ID - optional for regular registration
});

/**
 * POST /api/auth/register
 * Register a new organisation account
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

  // Create organisation
  const organisation = await prisma.organisation.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      oid: oid || null,
    },
  });

  // Generate token
  const token = generateOrganisationToken(organisation);

  res.status(201).json({
    message: 'Registration successful',
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
      foundingCreditClaimed: organisation.foundingCreditClaimed,
      foundingCreditUsed: organisation.foundingCreditUsed,
      foundingCreditExpiresAt: organisation.foundingCreditExpiresAt,
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
      foundingCreditClaimed: organisation.foundingCreditClaimed,
      foundingCreditUsed: organisation.foundingCreditUsed,
      foundingCreditExpiresAt: organisation.foundingCreditExpiresAt,
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

// =============================================================================
// FOUNDING CREDIT ROUTES
// =============================================================================

const claimFoundingCreditSchema = z.object({
  name: z.string().min(2, 'Organisation name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  oid: z.string().min(1, 'Organisation ID (OID) is required'),
});

/**
 * POST /api/auth/claim-founding-credit
 * Register and claim founding credit (free first project)
 */
router.post('/claim-founding-credit', asyncHandler(async (req: Request, res: Response) => {
  const result = claimFoundingCreditSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { name, email, password, oid } = result.data;

  // Check if email already exists
  const existingByEmail = await prisma.organisation.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingByEmail) {
    throw new ConflictError('An account with this email already exists. Please login instead.');
  }

  // Check if OID has already claimed a founding credit
  const existingByOid = await prisma.organisation.findFirst({
    where: {
      oid: oid,
      foundingCreditClaimed: true,
    },
  });

  if (existingByOid) {
    throw new ConflictError('This Organisation ID has already claimed a founding credit');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Calculate expiration date (1 month from now)
  const foundingCreditExpiresAt = new Date();
  foundingCreditExpiresAt.setMonth(foundingCreditExpiresAt.getMonth() + 1);

  // Create organisation with founding credit
  const organisation = await prisma.organisation.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      oid,
      foundingCreditClaimed: true,
      foundingCreditClaimedAt: new Date(),
      foundingCreditExpiresAt,
      foundingCreditUsed: false,
    },
  });

  // Record the founding credit as a purchase for audit trail
  await prisma.purchase.create({
    data: {
      organisationId: organisation.id,
      type: 'FOUNDING',
      amountCents: 0,
      currency: 'EUR',
      creditsGranted: 1,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  // Generate token
  const token = generateOrganisationToken(organisation);

  res.status(201).json({
    message: 'Founding credit claimed successfully! You have 1 month to start your first project.',
    token,
    organisation: {
      id: organisation.id,
      name: organisation.name,
      email: organisation.email,
      projectCredits: 0, // Founding credit is tracked separately
      foundingCreditClaimed: true,
      foundingCreditExpiresAt,
    },
  });
}));

export default router;
