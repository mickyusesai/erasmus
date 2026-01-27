import { Router } from 'express';
import { adminAuth } from '../../middleware/auth.js';
import authRoutes from './auth.js';
import dashboardRoutes from './dashboard.js';
import projectRoutes from './projects.js';
import participantRoutes from './participants.js';
import exchangeRatesRoutes from './exchangeRates.js';

const router = Router();

// Auth routes (no auth required)
router.use('/auth', authRoutes);

// Protected admin routes
router.use('/dashboard', adminAuth, dashboardRoutes);
router.use('/projects', adminAuth, projectRoutes);
router.use('/participants', adminAuth, participantRoutes);
router.use('/exchange-rates', adminAuth, exchangeRatesRoutes);

export default router;
