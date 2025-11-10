import express from 'express';
import { uploadImage, uploadMiddleware } from '../controller/uploadController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = express.Router();

// Upload image endpoint - protected
router.post('/image', authenticate, uploadMiddleware, uploadImage);

export default router;