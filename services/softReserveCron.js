import inventoryDao from '../dao/inventory.dao.js';
import { routeSubOrders } from './fulfillmentRouter.js';
import subOrderDao from '../dao/sub-order.dao.js';
import { notifyAtRiskOrders } from './slaTrackingService.js';
import { releaseExpiredSessions } from './stockReservationService.js';

/**
 * Soft Reserve & Fulfillment Cron
 * 
 * Runs every 60 seconds and handles:
 * 1. Release expired soft reserves (15-min cart TTL)
 * 2. Retry rider assignment for rider_pending sub-orders (every 3 min)
 * 3. Check SLA status for at-risk orders (every 5 min)
 */

const RIDER_RETRY_INTERVAL_MS = 3 * 60 * 1000;  // 3 minutes
const SLA_CHECK_INTERVAL_MS = 5 * 60 * 1000;     // 5 minutes
const CRON_INTERVAL_MS = 60 * 1000;               // 1 minute

let cronInterval = null;
let lastRiderRetry = 0;
let lastSLACheck = 0;
let isRunning = false;

const runCronTasks = async () => {
    if (isRunning) {
        console.warn('[Cron] Previous tick still running — skipping this interval');
        return;
    }
    isRunning = true;
    const now = Date.now();

    try {
        // 1. Release expired soft reserves (DB-level) + expired in-memory sessions
        try {
            const [dbReleased, sessionReleased] = await Promise.all([
                inventoryDao.releaseExpiredSoftReserves(),
                releaseExpiredSessions(),
            ]);
            const total = dbReleased + sessionReleased;
            if (total > 0) {
                console.log(`[SoftReserveCron] Released ${dbReleased} DB soft reserves, ${sessionReleased} sessions`);
            }
        } catch (err) {
            console.error('[SoftReserveCron] Error releasing soft reserves:', err.message);
        }

        // 2. Retry rider assignment every 3 minutes
        if (now - lastRiderRetry >= RIDER_RETRY_INTERVAL_MS) {
            lastRiderRetry = now;
            try {
                const pendingSubOrders = await subOrderDao.listPendingRiderAssignment();
                if (pendingSubOrders.length > 0) {
                    console.log(`[RiderRetryCron] Found ${pendingSubOrders.length} sub-orders pending rider assignment`);

                    // Group by parent order and retry
                    const orderIds = [...new Set(pendingSubOrders.map((so) => so.parent_order_id))];
                    for (const orderId of orderIds) {
                        try {
                            await routeSubOrders(orderId);
                        } catch (err) {
                            console.error(`[RiderRetryCron] Retry failed for order ${orderId}:`, err.message);
                        }
                    }
                }
            } catch (err) {
                console.error('[RiderRetryCron] Error retrying rider assignments:', err.message);
            }
        }

        // 3. Check SLA status every 5 minutes
        if (now - lastSLACheck >= SLA_CHECK_INTERVAL_MS) {
            lastSLACheck = now;
            try {
                const slaResult = await notifyAtRiskOrders();
                if (slaResult.at_risk > 0 || slaResult.delayed > 0) {
                    console.log(`[SLACron] Checked ${slaResult.checked} sub-orders: ${slaResult.at_risk} at risk, ${slaResult.delayed} delayed`);
                }
            } catch (err) {
                console.error('[SLACron] Error checking SLA:', err.message);
            }
        }
    } finally {
        isRunning = false;
    }
};

/**
 * Start the cron job
 */
export const startSoftReserveCron = () => {
    if (cronInterval) {
        console.log('[Cron] Soft reserve cron already running');
        return;
    }

    console.log('[Cron] Starting soft reserve & fulfillment cron (every 60s)');
    lastRiderRetry = Date.now();
    lastSLACheck = Date.now();

    cronInterval = setInterval(runCronTasks, CRON_INTERVAL_MS);
};

/**
 * Stop the cron job
 */
export const stopSoftReserveCron = () => {
    if (cronInterval) {
        clearInterval(cronInterval);
        cronInterval = null;
        console.log('[Cron] Soft reserve & fulfillment cron stopped');
    }
};

export default { startSoftReserveCron, stopSoftReserveCron };
