import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from './errorHandler.js';
import prisma from '../utils/prisma.js';
import { Participant } from '../types/prisma.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      admin?: boolean;
      participant?: Participant;
    }
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
