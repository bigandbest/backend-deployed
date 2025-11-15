import express from 'express';
import { adminLogin, adminLogout, getAdminMe } from '../controller/adminAuthController.js';

const router = express.Router();

router.post('/login', adminLogin);
router.post('/logout', adminLogout);
router.get('/me', getAdminMe);

export default router;