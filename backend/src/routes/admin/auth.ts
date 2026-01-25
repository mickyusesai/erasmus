import { Router, Request, Response } from 'express';
import { UnauthorizedError } from '../../middleware/errorHandler.js';

const router = Router();

/**
 * POST /api/admin/auth/login
 * Simple password-based admin login
 * Returns the password as a token for subsequent requests
 */
router.post('/login', (req: Request, res: Response) => {
  const { password } = req.body;

  if (!password) {
    throw new UnauthorizedError('Password is required');
  }

  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD environment variable not set');
    throw new UnauthorizedError('Server configuration error');
  }

  if (password !== adminPassword) {
    throw new UnauthorizedError('Invalid password');
  }

  // Return the password as a simple token
  // In production, use proper JWT or session-based auth
  res.json({
    success: true,
    token: password,
    message: 'Login successful',
  });
});

/**
 * POST /api/admin/auth/verify
 * Verify if a token is valid
 */
router.post('/verify', (req: Request, res: Response) => {
  const { token } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (token && token === adminPassword) {
    res.json({ valid: true });
  } else {
    res.json({ valid: false });
  }
});

export default router;
