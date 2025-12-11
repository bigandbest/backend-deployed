import express from 'express';
import { getCurrentSession } from '../controller/sessionController.js';
import { authenticateToken } from '../middleware/authenticate.js';

const router = express.Router();

// Get current session and user profile
router.get('/me', authenticateToken, getCurrentSession);

export default router;
