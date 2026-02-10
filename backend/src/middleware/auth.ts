import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from './errorHandler.js';
import prisma from '../utils/prisma.js';
import { Participant, Organisation, SuperAdmin } from '@prisma/client';

// JWT token payload types
export interface OrganisationTokenPayload {
  type: 'organisation';
  organisationId: string;
  email: string;
}

export interface SuperAdminTokenPayload {
  type: 'superadmin';
  adminId: string;
  email: string;
}

export type TokenPayload = OrganisationTokenPayload | SuperAdminTokenPayload;

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      admin?: boolean;
      participant?: Participant;
      organisation?: Organisation;
      superAdmin?: SuperAdmin;
      tokenPayload?: TokenPayload;
    }
  }
}

// JWT secret from environment
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable not set');
  }
  return secret;
};

// JWT token generation
export function generateOrganisationToken(organisation: Organisation): string {
  const payload: OrganisationTokenPayload = {
    type: 'organisation',
    organisationId: organisation.id,
    email: organisation.email,
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function generateSuperAdminToken(admin: SuperAdmin): string {
  const payload: SuperAdminTokenPayload = {
    type: 'superadmin',
    adminId: admin.id,
    email: admin.email,
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

// Verify and decode JWT token
export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Admin authentication middleware
 * Uses a simple password from environment variables
 * In production, replace with proper session-based auth
 */
export function adminAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError('No authorization header');
  }

  // Support Bearer token format
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Invalid authorization format');
  }

  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD environment variable not set');
    throw new UnauthorizedError('Server configuration error');
  }

  if (token !== adminPassword) {
    throw new UnauthorizedError('Invalid credentials');
  }

  req.admin = true;
  next();
}

/**
 * Participant authentication middleware
 * Validates magic link token from query parameter or header
 */
export async function participantAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.query.token as string || req.headers['x-magic-token'] as string;

  if (!token) {
    throw new UnauthorizedError('No magic link token provided');
  }

  const participant = await prisma.participant.findUnique({
    where: { magicLinkToken: token },
    include: {
      project: true,
    },
  });

  if (!participant) {
    throw new UnauthorizedError('Invalid magic link');
  }

  if (!participant.magicLinkActive) {
    throw new ForbiddenError('Magic link has been deactivated');
  }

  req.participant = participant;
  next();
}

/**
 * Ensure participant can only access their own data
 */
export function ensureOwnParticipant(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const participantId = req.params.participantId;

  if (!req.participant) {
    throw new UnauthorizedError('Not authenticated');
  }

  if (participantId && participantId !== req.participant.id) {
    throw new ForbiddenError('You can only access your own data');
  }

  next();
}

/**
 * Organisation authentication middleware
 * Validates JWT token from Authorization header
 */
export async function organisationAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError('No authorization header');
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Invalid authorization format');
  }

  const payload = verifyToken(token);

  if (payload.type !== 'organisation') {
    throw new UnauthorizedError('Invalid token type');
  }

  const organisation = await prisma.organisation.findUnique({
    where: { id: payload.organisationId },
  });

  if (!organisation) {
    throw new UnauthorizedError('Organisation not found');
  }

  if (!organisation.isActive) {
    throw new ForbiddenError('Organisation account is deactivated');
  }

  req.organisation = organisation;
  req.tokenPayload = payload;
  next();
}

/**
 * Super Admin authentication middleware
 * Validates JWT token from Authorization header
 */
export async function superAdminAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError('No authorization header');
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Invalid authorization format');
  }

  const payload = verifyToken(token);

  if (payload.type !== 'superadmin') {
    throw new UnauthorizedError('Invalid token type');
  }

  const admin = await prisma.superAdmin.findUnique({
    where: { id: payload.adminId },
  });

  if (!admin) {
    throw new UnauthorizedError('Admin not found');
  }

  req.superAdmin = admin;
  req.tokenPayload = payload;
  next();
}

/**
 * Ensure organisation can only access their own projects
 */
export function ensureOwnProject(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.organisation) {
    throw new UnauthorizedError('Not authenticated as organisation');
  }

  // The project check will be done in the route handler
  // This middleware just ensures organisation is present
  next();
}
