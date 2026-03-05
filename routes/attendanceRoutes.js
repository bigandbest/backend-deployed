import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    checkIn,
    checkOut,
    getTodaySummary,
    getAttendanceHistory,
} from '../controller/attendanceController.js';

const router = express.Router();

// All attendance routes require authentication
router.post('/check-in', authenticateToken, checkIn);
router.post('/check-out', authenticateToken, checkOut);
router.get('/today', authenticateToken, getTodaySummary);
router.get('/history', authenticateToken, getAttendanceHistory);

export default router;
