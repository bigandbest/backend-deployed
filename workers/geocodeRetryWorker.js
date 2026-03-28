// workers/geocodeRetryWorker.js
// Retries failed geocoding jobs every hour (max 3 attempts).
// Started from server.js alongside other scheduled jobs.

import prisma from '../config/prisma.js';
import { geocodeAddress } from '../utils/geocode.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function runRetryQueue() {
    let processed = 0;
    try {
        const pending = await prisma.geocode_retry_queue.findMany({
            where: { resolved: false, attempts: { lt: 3 } },
            orderBy: { created_at: 'asc' },
            take: 20,
        });

        for (const job of pending) {
            const geo = await geocodeAddress(job.address_string);

            if (geo) {
                // Update the source entity
                if (job.entity_type === 'SELLER') {
                    await prisma.sellers.updateMany({
                        where: { id: job.entity_id },
                        data: {
                            latitude: geo.latitude,
                            longitude: geo.longitude,
                            geocode_source: geo.source,
                            geocode_status: 'SUCCESS',
                            geocoded_at: new Date(),
                            geocoded_display_name: geo.display_name,
                        },
                    });
                } else if (job.entity_type === 'CUSTOMER_ADDRESS') {
                    await prisma.customer_addresses.update({
                        where: { id: parseInt(job.entity_id) },
                        data: {
                            latitude: geo.latitude,
                            longitude: geo.longitude,
                            geocode_source: geo.source,
                            geocode_status: 'SUCCESS',
                            geocoded_at: new Date(),
                            geocoded_display_name: geo.display_name,
                            updated_at: new Date(),
                        },
                    });
                } else if (job.entity_type === 'WAREHOUSE') {
                    await prisma.warehouses.update({
                        where: { id: parseInt(job.entity_id) },
                        data: {
                            latitude: geo.latitude,
                            longitude: geo.longitude,
                            geocode_status: 'SUCCESS',
                            updated_at: new Date(),
                        },
                    });
                }

                await prisma.geocode_retry_queue.update({
                    where: { id: job.id },
                    data: { resolved: true },
                });
                processed++;
            } else {
                await prisma.geocode_retry_queue.update({
                    where: { id: job.id },
                    data: { attempts: { increment: 1 } },
                });
            }

            // Respect Nominatim 1 req/sec rate limit
            await delay(1100);
        }

        if (processed > 0) {
            console.log(`[geocodeRetry] Resolved ${processed} addresses`);
        }
    } catch (err) {
        console.error('[geocodeRetry] Worker error:', err.message);
    }
}

let intervalHandle = null;

export function startGeocodeRetryWorker() {
    if (intervalHandle) return;
    intervalHandle = setInterval(runRetryQueue, 60 * 60 * 1000); // every hour
    console.log('[geocodeRetry] Worker started (runs every 60 min)');
}

export function stopGeocodeRetryWorker() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}
