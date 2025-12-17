// services/scheduled-jobs.js
import cron from 'node-cron';
import { supabase } from '../config/supabaseClient.js';

/**
 * Scheduled Jobs Service
 * Handles automatic expiry of enquiries, bids, and stock release
 */

/**
 * Auto-expire old enquiries
 * Runs every 5 minutes
 */
const expireOldEnquiries = cron.schedule('*/5 * * * *', async () => {
    try {
        console.log('[CRON] Running expire_old_enquiries...');

        const { data, error } = await supabase.rpc('expire_old_enquiries');

        if (error) {
            console.error('[CRON] Error expiring enquiries:', error);
        } else {
            const count = data || 0;
            if (count > 0) {
                console.log(`[CRON] Expired ${count} old enquiries`);
            }
        }
    } catch (error) {
        console.error('[CRON] Unexpected error in expireOldEnquiries:', error);
    }
}, {
    scheduled: false // Don't start immediately
});

/**
 * Auto-expire old bids
 * Runs every 5 minutes
 */
const expireOldBids = cron.schedule('*/5 * * * *', async () => {
    try {
        console.log('[CRON] Running expire_old_bids...');

        const { data, error } = await supabase.rpc('expire_old_bids');

        if (error) {
            console.error('[CRON] Error expiring bids:', error);
        } else {
            const count = data || 0;
            if (count > 0) {
                console.log(`[CRON] Expired ${count} old bids`);
            }
        }
    } catch (error) {
        console.error('[CRON] Unexpected error in expireOldBids:', error);
    }
}, {
    scheduled: false
});

/**
 * Release stock from expired locked bids
 * Runs every 2 minutes (more frequent due to 30-min payment deadline)
 */
const releaseExpiredBidStock = cron.schedule('*/2 * * * *', async () => {
    try {
        console.log('[CRON] Running release_expired_bid_stock...');

        const { data, error } = await supabase.rpc('release_expired_bid_stock');

        if (error) {
            console.error('[CRON] Error releasing stock:', error);
        } else {
            const count = data || 0;
            if (count > 0) {
                console.log(`[CRON] Released stock from ${count} expired locked bids`);

                // Also remove expired bid products from carts
                await removeExpiredBidsFromCart();
            }
        }
    } catch (error) {
        console.error('[CRON] Unexpected error in releaseExpiredBidStock:', error);
    }
}, {
    scheduled: false
});

/**
 * Helper function to remove expired bid products from cart
 */
const removeExpiredBidsFromCart = async () => {
    try {
        // Get all expired locked bids
        const { data: expiredBids, error: fetchError } = await supabase
            .from('locked_bids')
            .select('id')
            .eq('status', 'EXPIRED');

        if (fetchError) {
            console.error('[CRON] Error fetching expired bids:', fetchError);
            return;
        }

        if (!expiredBids || expiredBids.length === 0) {
            return;
        }

        // Remove cart items for these expired bids
        const expiredBidIds = expiredBids.map(bid => bid.id);

        const { error: deleteError } = await supabase
            .from('cart_items')
            .delete()
            .in('locked_bid_id', expiredBidIds);

        if (deleteError) {
            console.error('[CRON] Error removing expired bids from cart:', deleteError);
        } else {
            console.log(`[CRON] Removed expired bid products from ${expiredBidIds.length} carts`);
        }
    } catch (error) {
        console.error('[CRON] Error in removeExpiredBidsFromCart:', error);
    }
};

/**
 * Start all scheduled jobs
 */
export const startScheduledJobs = () => {
    console.log('🕐 Starting scheduled jobs...');

    expireOldEnquiries.start();
    console.log('✅ Enquiry expiry job started (runs every 5 minutes)');

    expireOldBids.start();
    console.log('✅ Bid expiry job started (runs every 5 minutes)');

    releaseExpiredBidStock.start();
    console.log('✅ Stock release job started (runs every 2 minutes)');

    console.log('🕐 All scheduled jobs are running');
};

/**
 * Stop all scheduled jobs (for graceful shutdown)
 */
export const stopScheduledJobs = () => {
    console.log('🛑 Stopping scheduled jobs...');

    expireOldEnquiries.stop();
    expireOldBids.stop();
    releaseExpiredBidStock.stop();

    console.log('✅ All scheduled jobs stopped');
};

export default {
    startScheduledJobs,
    stopScheduledJobs,
};
