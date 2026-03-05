import prisma from '../config/prisma.js';

// ============ CHECK IN ============
export const checkIn = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        // Guard: Rider must be verified
        if (rider.verification_status !== 'VERIFIED') {
            return res.status(403).json({
                success: false,
                error: 'You must be verified to check in',
                verification_status: rider.verification_status,
            });
        }

        // Guard: Rider must be active (not suspended)
        if (!rider.is_active) {
            return res.status(403).json({ success: false, error: 'Your account is suspended' });
        }

        // Guard: Prevent double check-in
        if (rider.current_shift_id) {
            const activeShift = await prisma.attendance_logs.findUnique({
                where: { id: rider.current_shift_id }
            });
            if (activeShift && !activeShift.check_out_time) {
                return res.status(400).json({
                    success: false,
                    error: 'You are already checked in',
                    active_shift: {
                        id: activeShift.id,
                        check_in_time: activeShift.check_in_time,
                    },
                });
            }
        }

        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        // Create attendance log
        const log = await prisma.attendance_logs.create({
            data: {
                rider_id: rider.id,
                check_in_time: now,
                date: today,
            }
        });

        // Update rider's current shift
        await prisma.riders.update({
            where: { id: rider.id },
            data: {
                current_shift_id: log.id,
                is_available: true,
                updated_at: now,
            }
        });

        res.status(200).json({
            success: true,
            data: {
                shift_id: log.id,
                check_in_time: log.check_in_time,
                date: log.date,
            },
            message: 'Checked in successfully. You can now accept orders.',
        });
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ success: false, error: 'Failed to check in', message: error.message });
    }
};

// ============ CHECK OUT ============
export const checkOut = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        if (!rider.current_shift_id) {
            return res.status(400).json({ success: false, error: 'You are not currently checked in' });
        }

        const shift = await prisma.attendance_logs.findUnique({
            where: { id: rider.current_shift_id }
        });

        if (!shift || shift.check_out_time) {
            return res.status(400).json({ success: false, error: 'No active shift found' });
        }

        const now = new Date();
        const totalMs = now.getTime() - shift.check_in_time.getTime();
        const totalHours = parseFloat((totalMs / (1000 * 60 * 60)).toFixed(2));

        // Close the shift
        await prisma.attendance_logs.update({
            where: { id: shift.id },
            data: {
                check_out_time: now,
                total_hours: totalHours,
                updated_at: now,
            }
        });

        // Clear current shift
        await prisma.riders.update({
            where: { id: rider.id },
            data: {
                current_shift_id: null,
                is_available: false,
                updated_at: now,
            }
        });

        // Update daily wage log
        await updateDailyWageLog(rider.id, shift.date);

        res.status(200).json({
            success: true,
            data: {
                shift_id: shift.id,
                check_in_time: shift.check_in_time,
                check_out_time: now,
                total_hours: totalHours,
            },
            message: `Checked out successfully after ${totalHours} hours.`,
        });
    } catch (error) {
        console.error('Check-out error:', error);
        res.status(500).json({ success: false, error: 'Failed to check out', message: error.message });
    }
};

// ============ GET TODAY'S SUMMARY ============
export const getTodaySummary = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const logs = await prisma.attendance_logs.findMany({
            where: { rider_id: rider.id, date: today },
            orderBy: { check_in_time: 'asc' }
        });

        // Calculate total hours (including in-progress shift)
        let totalHours = 0;
        for (const log of logs) {
            if (log.total_hours) {
                totalHours += parseFloat(log.total_hours);
            } else if (!log.check_out_time) {
                // Active shift — calculate time so far
                const now = new Date();
                const ms = now.getTime() - log.check_in_time.getTime();
                totalHours += ms / (1000 * 60 * 60);
            }
        }

        const activeShift = logs.find(l => !l.check_out_time);

        res.status(200).json({
            success: true,
            data: {
                date: today,
                total_hours: parseFloat(totalHours.toFixed(2)),
                segments: logs.map(l => ({
                    id: l.id,
                    check_in: l.check_in_time,
                    check_out: l.check_out_time,
                    hours: l.total_hours ? parseFloat(l.total_hours) : null,
                    is_active: !l.check_out_time,
                })),
                segments_count: logs.length,
                is_checked_in: !!activeShift,
                is_eligible_for_minimum_wage: totalHours >= 8,
                active_shift: activeShift ? {
                    id: activeShift.id,
                    check_in_time: activeShift.check_in_time,
                } : null,
            },
        });
    } catch (error) {
        console.error('Get today summary error:', error);
        res.status(500).json({ success: false, error: 'Failed to get summary' });
    }
};

// ============ GET ATTENDANCE HISTORY ============
export const getAttendanceHistory = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get wage logs (one per day)
        const wageLogs = await prisma.rider_wage_logs.findMany({
            where: { rider_id: rider.id },
            orderBy: { date: 'desc' },
            skip,
            take: parseInt(limit),
        });

        const total = await prisma.rider_wage_logs.count({ where: { rider_id: rider.id } });

        res.status(200).json({
            success: true,
            data: wageLogs.map(w => ({
                date: w.date,
                total_hours: parseFloat(w.total_hours),
                segments_count: w.segments_count,
                is_eligible_for_minimum_wage: w.is_eligible_for_minimum_wage,
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error('Get attendance history error:', error);
        res.status(500).json({ success: false, error: 'Failed to get history' });
    }
};

// ============ HELPER: UPDATE DAILY WAGE LOG ============
export const updateDailyWageLog = async (riderId, date) => {
    try {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);

        const logs = await prisma.attendance_logs.findMany({
            where: {
                rider_id: riderId,
                date: dayStart,
                check_out_time: { not: null },
            }
        });

        const totalHours = logs.reduce((sum, l) => sum + (l.total_hours ? parseFloat(l.total_hours) : 0), 0);

        await prisma.rider_wage_logs.upsert({
            where: { rider_id_date: { rider_id: riderId, date: dayStart } },
            create: {
                rider_id: riderId,
                date: dayStart,
                total_hours: totalHours,
                segments_count: logs.length,
                is_eligible_for_minimum_wage: totalHours >= 8,
            },
            update: {
                total_hours: totalHours,
                segments_count: logs.length,
                is_eligible_for_minimum_wage: totalHours >= 8,
                updated_at: new Date(),
            }
        });
    } catch (error) {
        console.error('Update daily wage log error:', error);
    }
};
