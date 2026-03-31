// utils/roadDistance.js
// Road-network distance via OSRM (free public server or self-hosted).
// Falls back to Haversine × circuity factor if OSRM is unavailable.
//
// Primary:  GET /route/v1/driving/{lon},{lat};... (OSRM)
// Fallback: Haversine × HAVERSINE_CIRCUITY_FACTOR (default 1.4)
//
// For getTwoLegDistance, a single 3-waypoint OSRM call is made instead of two separate calls.
// Results are cached in-memory (keyed on coords rounded to 3 decimal places ≈ 111m).

import axios from 'axios';
import cache from './cache.js';
import { calculateDistanceKm } from './distanceUtils.js';

const OSRM_BASE_URL = (process.env.OSRM_BASE_URL || 'http://router.project-osrm.org').replace(/\/$/, '');
const OSRM_TIMEOUT_MS = parseInt(process.env.OSRM_TIMEOUT_MS || '3000', 10);
const DISTANCE_CACHE_TTL = parseInt(process.env.DISTANCE_CACHE_TTL_SECONDS || '86400', 10);
const CIRCUITY_FACTOR = parseFloat(process.env.HAVERSINE_CIRCUITY_FACTOR || '1.4');

function roundTo3(n) {
    return Math.round(n * 1000) / 1000;
}

function buildCacheKey(...coords) {
    return 'osrm:' + coords.map(roundTo3).join(',');
}

function haversineFallback(lat1, lon1, lat2, lon2) {
    const raw = calculateDistanceKm(lat1, lon1, lat2, lon2);
    return parseFloat((raw * CIRCUITY_FACTOR).toFixed(2));
}

function isValidCoord(lat, lon) {
    return lat != null && lon != null && lat !== 0 && lon !== 0;
}

/**
 * Get road distance between two GPS points.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {Promise<{ distanceKm: number, source: 'osrm'|'haversine_fallback'|'no_gps', durationMinutes: number|null }>}
 */
export async function getRoadDistance(lat1, lon1, lat2, lon2) {
    if (!isValidCoord(lat1, lon1) || !isValidCoord(lat2, lon2)) {
        return { distanceKm: 0, source: 'no_gps', durationMinutes: null };
    }

    const key = buildCacheKey(lat1, lon1, lat2, lon2);
    const cached = cache.get(key);
    if (cached) {
        console.info('[DistanceCalc] Cache hit for route');
        return cached;
    }

    try {
        const url = `${OSRM_BASE_URL}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
        const response = await axios.get(url, { timeout: OSRM_TIMEOUT_MS });

        if (response.data?.code === 'Ok' && response.data.routes?.[0]) {
            const route = response.data.routes[0];
            const distanceKm = parseFloat((route.distance / 1000).toFixed(2));
            const durationMinutes = route.duration != null
                ? parseFloat((route.duration / 60).toFixed(1))
                : null;

            const result = { distanceKm, source: 'osrm', durationMinutes };
            cache.set(key, result, DISTANCE_CACHE_TTL);
            return result;
        }

        throw new Error('OSRM returned no valid route');
    } catch {
        console.warn('[DistanceCalc] OSRM unavailable. Using Haversine * 1.4 fallback');
        const distanceKm = haversineFallback(lat1, lon1, lat2, lon2);
        const result = { distanceKm, source: 'haversine_fallback', durationMinutes: null };
        cache.set(key, result, DISTANCE_CACHE_TTL);
        return result;
    }
}

/**
 * Get two-leg road distance in a SINGLE OSRM call (3-waypoint route).
 * Leg 1: rider → pickup/source
 * Leg 2: pickup/source → customer
 *
 * If riderLat/riderLon are unavailable, leg1Km is returned as null
 * and totalKm is also null (triggering MANUAL_REVIEW in payoutService).
 *
 * @returns {Promise<{
 *   leg1Km: number|null,
 *   leg2Km: number|null,
 *   totalKm: number|null,
 *   source: 'osrm'|'haversine_fallback'|'no_gps',
 *   durationMinutes: number|null
 * }>}
 */
export async function getTwoLegDistance(riderLat, riderLon, pickupLat, pickupLon, customerLat, customerLon) {
    const pickupValid = isValidCoord(pickupLat, pickupLon);
    const customerValid = isValidCoord(customerLat, customerLon);
    const riderValid = isValidCoord(riderLat, riderLon);

    // If we can't calculate at least leg2, return no_gps
    if (!pickupValid || !customerValid) {
        return { leg1Km: null, leg2Km: null, totalKm: null, source: 'no_gps', durationMinutes: null };
    }

    const key = buildCacheKey(
        riderValid ? riderLat : 0, riderValid ? riderLon : 0,
        pickupLat, pickupLon,
        customerLat, customerLon
    );
    const cached = cache.get(key);
    if (cached) {
        console.info('[DistanceCalc] Cache hit for route');
        return cached;
    }

    try {
        let url;
        if (riderValid) {
            // Single 3-waypoint call — 1 request instead of 2
            url = `${OSRM_BASE_URL}/route/v1/driving/${riderLon},${riderLat};${pickupLon},${pickupLat};${customerLon},${customerLat}?overview=false`;
        } else {
            // Only leg2 calculable via OSRM; leg1 will be null
            url = `${OSRM_BASE_URL}/route/v1/driving/${pickupLon},${pickupLat};${customerLon},${customerLat}?overview=false`;
        }

        const response = await axios.get(url, { timeout: OSRM_TIMEOUT_MS });

        if (response.data?.code === 'Ok' && response.data.routes?.[0]) {
            const route = response.data.routes[0];
            let leg1Km = null;
            let leg2Km = null;

            if (riderValid && route.legs?.length >= 2) {
                leg1Km = parseFloat((route.legs[0].distance / 1000).toFixed(2));
                leg2Km = parseFloat((route.legs[1].distance / 1000).toFixed(2));
            } else {
                // Rider GPS unknown — only leg2
                leg2Km = parseFloat((route.distance / 1000).toFixed(2));
            }

            const totalKm = (leg1Km !== null && leg2Km !== null)
                ? parseFloat((leg1Km + leg2Km).toFixed(2))
                : null;

            const durationMinutes = route.duration != null
                ? parseFloat((route.duration / 60).toFixed(1))
                : null;

            const result = { leg1Km, leg2Km, totalKm, source: 'osrm', durationMinutes };
            cache.set(key, result, DISTANCE_CACHE_TTL);
            return result;
        }

        throw new Error('OSRM returned no valid route');
    } catch {
        console.warn('[DistanceCalc] OSRM unavailable. Using Haversine * 1.4 fallback');

        const leg1Km = riderValid
            ? haversineFallback(riderLat, riderLon, pickupLat, pickupLon)
            : null;
        const leg2Km = haversineFallback(pickupLat, pickupLon, customerLat, customerLon);
        const totalKm = leg1Km !== null ? parseFloat((leg1Km + leg2Km).toFixed(2)) : null;

        const result = { leg1Km, leg2Km, totalKm, source: 'haversine_fallback', durationMinutes: null };
        cache.set(key, result, DISTANCE_CACHE_TTL);
        return result;
    }
}
