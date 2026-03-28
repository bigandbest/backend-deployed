import prisma from '../config/prisma.js';

/**
 * Stock Reservation Service
 *
 * Provides session-scoped, atomic stock locking so stock is held
 * before the Prisma transaction commits the order.
 *
 * Lifecycle per order attempt:
 *   reserveStock()       — soft-lock stock for TTL (increments reserved_qty)
 *   confirmReservation() — called inside the order transaction; moves
 *                          reserved_qty → actual stock deduction
 *   releaseReservation() — called on cancel / payment failure / TTL expiry
 *
 * In-memory session map: sessionId → { items, expiresAt }
 * The cron (softReserveCron.js) calls releaseExpiredSessions() every 60 s.
 */

// ── In-memory session store ───────────────────────────────────────────────────
// Maps sessionId → { items: [{variantId, warehouseId, qty, source}], expiresAt }
const _sessions = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Atomically increment reserved_qty for one inventory row.
 * Uses a conditional UPDATE (CAS-style) to prevent overselling.
 * Returns the number of rows updated (0 = insufficient stock).
 */
const _reserveInventoryRow = async (variantId, warehouseId, qty) => {
    const result = await prisma.$executeRaw`
        UPDATE inventory
        SET    reserved_qty = reserved_qty + ${qty},
               updated_at   = NOW()
        WHERE  variant_id   = ${variantId}::uuid
          AND  warehouse_id = ${warehouseId}
          AND  (stock_qty - reserved_qty - soft_reserved_qty) >= ${qty}
    `;
    return result; // rows affected
};

/**
 * Atomically increment reserved_quantity for a seller_products row.
 */
const _reserveSellerRow = async (sellerId, variantId, warehouseId, qty) => {
    const result = await prisma.$executeRaw`
        UPDATE seller_products
        SET    reserved_quantity = reserved_quantity + ${qty},
               updated_at        = NOW()
        WHERE  seller_id    = ${sellerId}::uuid
          AND  variant_id   = ${variantId}::uuid
          AND  warehouse_id = ${warehouseId}
          AND  status       = 'APPROVED'
          AND  is_active    = true
          AND  (stock_quantity - reserved_quantity) >= ${qty}
    `;
    return result;
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Reserve stock for all items in a cart session.
 *
 * @param {Array<{variantId, warehouseId, qty, source: 'inventory'|'seller', sellerId?}>} items
 * @param {string} sessionId  — client-generated idempotency UUID
 * @param {number} ttlMinutes — how long to hold the reserve (default 15)
 * @returns {{ success: boolean, failures?: Array<{variantId, reason}> }}
 */
export const reserveStock = async (items, sessionId, ttlMinutes = 15) => {
    // Idempotency: if this session already has a valid reservation, return OK
    if (_sessions.has(sessionId)) {
        const existing = _sessions.get(sessionId);
        if (existing.expiresAt > new Date()) {
            return { success: true };
        }
        // Expired — release and re-reserve
        await releaseReservation(sessionId);
    }

    const reserved = [];
    const failures = [];

    for (const item of items) {
        try {
            let rowsAffected;
            if (item.source === 'seller') {
                rowsAffected = await _reserveSellerRow(item.sellerId, item.variantId, item.warehouseId, item.qty);
            } else {
                rowsAffected = await _reserveInventoryRow(item.variantId, item.warehouseId, item.qty);
            }

            if (rowsAffected === 0) {
                failures.push({ variantId: item.variantId, productId: item.productId, reason: 'out_of_stock' });
            } else {
                reserved.push(item);
            }
        } catch (err) {
            failures.push({ variantId: item.variantId, productId: item.productId, reason: err.message || 'reservation_error' });
        }
    }

    if (failures.length > 0) {
        // Rollback all successful reservations in this session
        await _rollbackReservations(reserved);
        return { success: false, failures };
    }

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    _sessions.set(sessionId, { items: reserved, expiresAt });
    return { success: true };
};

/**
 * Confirm reservation inside the order Prisma transaction.
 * Converts reserved_qty → actual stock deduction.
 * Must be called with a Prisma transaction client (tx).
 *
 * @param {string} sessionId
 * @param {object} tx — Prisma transaction client
 */
export const confirmReservation = async (sessionId, tx) => {
    const session = _sessions.get(sessionId);
    if (!session) return; // nothing to confirm (reservation may have been skipped)

    const client = tx || prisma;

    for (const item of session.items) {
        if (item.source === 'seller') {
            await client.$executeRaw`
                UPDATE seller_products
                SET    stock_quantity     = stock_quantity     - ${item.qty},
                       reserved_quantity = reserved_quantity - ${item.qty},
                       updated_at        = NOW()
                WHERE  seller_id    = ${item.sellerId}::uuid
                  AND  variant_id   = ${item.variantId}::uuid
                  AND  warehouse_id = ${item.warehouseId}
            `;
        } else {
            await client.$executeRaw`
                UPDATE inventory
                SET    stock_qty    = stock_qty    - ${item.qty},
                       reserved_qty = reserved_qty - ${item.qty},
                       updated_at   = NOW()
                WHERE  variant_id   = ${item.variantId}::uuid
                  AND  warehouse_id = ${item.warehouseId}
            `;
        }
    }

    // Session consumed — remove it
    _sessions.delete(sessionId);
};

/**
 * Release a reservation (e.g. payment failed, cart expired, user cancelled).
 *
 * @param {string} sessionId
 */
export const releaseReservation = async (sessionId) => {
    const session = _sessions.get(sessionId);
    if (!session) return;
    await _rollbackReservations(session.items);
    _sessions.delete(sessionId);
};

/**
 * Release all expired sessions. Called by softReserveCron every 60 s.
 *
 * @returns {number} number of sessions released
 */
export const releaseExpiredSessions = async () => {
    const now = new Date();
    const expiredIds = [];

    for (const [id, session] of _sessions.entries()) {
        if (session.expiresAt <= now) {
            expiredIds.push(id);
        }
    }

    for (const id of expiredIds) {
        await releaseReservation(id);
    }

    return expiredIds.length;
};

/**
 * Check whether a session reservation is still valid.
 *
 * @param {string} sessionId
 * @returns {boolean}
 */
export const hasValidReservation = (sessionId) => {
    const session = _sessions.get(sessionId);
    return !!(session && session.expiresAt > new Date());
};

// ── Internal helpers ──────────────────────────────────────────────────────────

const _rollbackReservations = async (items) => {
    for (const item of items) {
        try {
            if (item.source === 'seller') {
                await prisma.$executeRaw`
                    UPDATE seller_products
                    SET    reserved_quantity = GREATEST(0, reserved_quantity - ${item.qty}),
                           updated_at        = NOW()
                    WHERE  seller_id    = ${item.sellerId}::uuid
                      AND  variant_id   = ${item.variantId}::uuid
                      AND  warehouse_id = ${item.warehouseId}
                `;
            } else {
                await prisma.$executeRaw`
                    UPDATE inventory
                    SET    reserved_qty = GREATEST(0, reserved_qty - ${item.qty}),
                           updated_at   = NOW()
                    WHERE  variant_id   = ${item.variantId}::uuid
                      AND  warehouse_id = ${item.warehouseId}
                `;
            }
        } catch (err) {
            console.error('[StockReservation] rollback error:', err.message);
        }
    }
};

export default { reserveStock, confirmReservation, releaseReservation, releaseExpiredSessions, hasValidReservation };
