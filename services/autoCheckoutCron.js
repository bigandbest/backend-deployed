import cron from 'node-cron';
import prisma from '../config/prisma.js';
import { updateDailyWageLog } from '../controller/attendanceController.js';

const MAX_SHIFT_HOURS = 14;

let autoCheckoutJob = null;

/**
 * Auto-checkout cron job
 * Runs at 2:00 AM daily (IST)
 * - Forces checkout for all riders with open shifts
 * - Also forces checkout for any shift > 14 consecutive hours
 */
export const startAutoCheckoutCron = () => {
    if (autoCheckoutJob) {
        console.log('Auto-checkout cron already running');
        return;
    }

    // Run every hour to catch 14-hour shifts, and the main sweep at 2:00 AM
    autoCheckoutJob = cron.schedule('0 * * * *', async () => {
        try {
            const now = new Date();
            const currentHour = now.getHours();

            console.log(`[AutoCheckout] Running check at ${now.toISOString()}`);

            // Find all open shifts (no check_out_time)
            const openShifts = await prisma.attendance_logs.findMany({
                where: { check_out_time: null },
                include: { riders: true },
            });

            if (openShifts.length === 0) {
                console.log('[AutoCheckout] No open shifts found');
                return;
            }

            let autoCheckedOut = 0;

            for (const shift of openShifts) {
                const shiftDurationMs = now.getTime() - shift.check_in_time.getTime();
                const shiftHours = shiftDurationMs / (1000 * 60 * 60);

                // Force checkout if:
                // 1. Shift > 14 hours (safety cap), OR
                // 2. It's 2:00 AM (daily sweep)
                const shouldForceCheckout = shiftHours >= MAX_SHIFT_HOURS || currentHour === 2;

                if (shouldForceCheckout) {
                    const totalHours = parseFloat(shiftHours.toFixed(2));

                    // Close the shift
                    await prisma.attendance_logs.update({
                        where: { id: shift.id },
                        data: {
                            check_out_time: now,
                            total_hours: totalHours,
                            auto_checkout: true,
                            updated_at: now,
                        }
                    });

                    // Clear rider's current shift
                    await prisma.riders.update({
                        where: { id: shift.rider_id },
                        data: {
                            current_shift_id: null,
                            is_available: false,
                            updated_at: now,
                        }
                    });

                    // Update daily wage log
                    await updateDailyWageLog(shift.rider_id, shift.date);

                    autoCheckedOut++;
                    console.log(
                        `[AutoCheckout] Forced checkout for rider ${shift.rider_id} ` +
                        `(shift ${shift.id}, ${totalHours}h, reason: ${shiftHours >= MAX_SHIFT_HOURS ? '14h cap' : '2AM sweep'})`
                    );
                }
            }

            console.log(`[AutoCheckout] Completed. Auto-checked-out ${autoCheckedOut}/${openShifts.length} open shifts.`);
        } catch (error) {
            console.error('[AutoCheckout] Error in cron job:', error);
        }
    }, {
        timezone: 'Asia/Kolkata',
    });

    console.log('✅ Auto-checkout cron job started (hourly check, force at 2:00 AM IST or after 14h)');
};

export const stopAutoCheckoutCron = () => {
    if (autoCheckoutJob) {
        autoCheckoutJob.stop();
        autoCheckoutJob = null;
        console.log('Auto-checkout cron job stopped');
    }
};

export const getAutoCheckoutStatus = () => ({
    running: autoCheckoutJob !== null,
    max_shift_hours: MAX_SHIFT_HOURS,
    schedule: 'Every hour (force at 2:00 AM IST or after 14h)',
});
