import cron from 'node-cron';
import { executeScheduledOrders } from './orderExecutor.js';

/**
 * Cron Job Scheduler for Scheduled Orders
 * Runs every minute to check and execute due orders
 */

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '* * * * *'; // Every minute
let cronJob = null;

/**
 * Start the cron job
 */
export const startScheduledOrderCron = () => {
    if (cronJob) {
        console.log('Cron job already running');
        return;
    }

    console.log(`Starting scheduled order cron job with schedule: ${CRON_SCHEDULE}`);

    cronJob = cron.schedule(CRON_SCHEDULE, async () => {
        try {
            await executeScheduledOrders();
        } catch (error) {
            console.error('Error in scheduled order cron job:', error);
        }
    }, {
        scheduled: true,
        timezone: "UTC"
    });

    console.log('Scheduled order cron job started successfully');
};

/**
 * Stop the cron job
 */
export const stopScheduledOrderCron = () => {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        console.log('Scheduled order cron job stopped');
    }
};

/**
 * Get cron job status
 */
export const getCronStatus = () => {
    return {
        running: cronJob !== null,
        schedule: CRON_SCHEDULE
    };
};
