import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    registerRider,
    loginRider,
    getRiderMe,
    uploadDocument,
    documentUploadMiddleware,
    verifyRiderToken,
    logoutRider,
} from '../controller/riderAuthController.js';

const router = express.Router();

// Public routes
router.post('/register', registerRider);
router.post('/login', loginRider);
router.post('/verify-token', verifyRiderToken);

// Protected routes
router.get('/me', authenticateToken, getRiderMe);
router.post('/documents', authenticateToken, documentUploadMiddleware, uploadDocument);
router.post('/logout', logoutRider);

export default router;
