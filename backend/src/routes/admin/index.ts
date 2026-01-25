import { Router } from 'express';
import { adminAuth } from '../../middleware/auth.js';
import authRoutes from './auth.js';
import dashboardRoutes from './dashboard.js';
import projectRoutes from './projects.js';
import participantRoutes from './participants.js';

const router = Router();

// Auth routes (no auth required)
router.use('/auth', authRoutes);

// Protected admin routes
router.use('/dashboard', adminAuth, dashboardRoutes);
router.use('/projects', adminAuth, projectRoutes);
router.use('/participants', adminAuth, participantRoutes);

export default router;
