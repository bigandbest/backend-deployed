/**
 * Unit tests for stockReservationService
 *
 * Covers:
 *  - Concurrent reservation attempts on the same variant
 *  - Partial failure → full rollback
 *  - Idempotency (same sessionId → no double-reserve)
 *  - TTL expiry cleanup
 */

import { jest } from '@jest/globals';

// ── Mock Prisma ───────────────────────────────────────────────────────────────
// We simulate atomic SQL outcomes without hitting a real DB.
const mockExecuteRaw = jest.fn();

jest.mock('../config/prisma.js', () => ({
  default: { $executeRaw: mockExecuteRaw },
}));

// Re-import after mock setup
const { reserveStock, releaseReservation, releaseExpiredSessions, hasValidReservation } =
  await import('../services/stockReservationService.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeItems = (n = 1) =>
  Array.from({ length: n }, (_, i) => ({
    variantId: `variant-${i + 1}`,
    warehouseId: 1,
    qty: 5,
    source: 'inventory',
    productId: `product-${i + 1}`,
  }));

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockExecuteRaw.mockReset();
});

describe('reserveStock', () => {
  test('succeeds when all items have sufficient stock (rows affected = 1)', async () => {
    mockExecuteRaw.mockResolvedValue(1); // every UPDATE affects 1 row

    const result = await reserveStock(makeItems(3), 'session-ok');
    expect(result.success).toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
  });

  test('fails and rolls back when any item has insufficient stock (rows = 0)', async () => {
    // First item OK, second fails (0 rows), third never attempted
    mockExecuteRaw
      .mockResolvedValueOnce(1) // item 1 reserved
      .mockResolvedValueOnce(0) // item 2 insufficient
      .mockResolvedValue(1);    // rollback calls

    const result = await reserveStock(makeItems(2), 'session-fail');

    expect(result.success).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toBe('out_of_stock');

    // Should have called executeRaw for: reserve item1, check item2, rollback item1
    expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
  });

  test('is idempotent: same sessionId within TTL returns success without re-reserving', async () => {
    mockExecuteRaw.mockResolvedValue(1);

    const sessionId = 'session-idempotent';
    await reserveStock(makeItems(1), sessionId, 15);
    const callCountAfterFirst = mockExecuteRaw.mock.calls.length;

    // Second call with same session — should short-circuit
    const result = await reserveStock(makeItems(1), sessionId, 15);
    expect(result.success).toBe(true);
    // No additional executeRaw calls
    expect(mockExecuteRaw.mock.calls.length).toBe(callCountAfterFirst);

    await releaseReservation(sessionId);
  });

  test('concurrent reservations: only some succeed for stock=8 with qty=5 per session', async () => {
    // Simulate: first request gets stock, second doesn't (0 rows)
    let stockRemaining = 8;
    mockExecuteRaw.mockImplementation(async (query, ...params) => {
      // params[2] is qty (3rd tagged-template param)
      const qty = 5;
      if (stockRemaining >= qty) {
        stockRemaining -= qty;
        return 1; // success
      }
      return 0; // insufficient
    });

    const [r1, r2] = await Promise.all([
      reserveStock(makeItems(1), 'concurrent-1'),
      reserveStock(makeItems(1), 'concurrent-2'),
    ]);

    const successes = [r1, r2].filter(r => r.success).length;
    const failures  = [r1, r2].filter(r => !r.success).length;

    // Only 1 can succeed (8 stock, 5 per session → 1 fits, 2nd doesn't)
    expect(successes).toBe(1);
    expect(failures).toBe(1);

    // Cleanup
    await releaseReservation('concurrent-1');
    await releaseReservation('concurrent-2');
  });
});

describe('releaseReservation', () => {
  test('decrements reserved_qty and removes session', async () => {
    mockExecuteRaw.mockResolvedValue(1);
    const sessionId = 'session-release';

    await reserveStock(makeItems(1), sessionId, 15);
    expect(hasValidReservation(sessionId)).toBe(true);

    await releaseReservation(sessionId);
    expect(hasValidReservation(sessionId)).toBe(false);
  });

  test('is a no-op for unknown sessionId', async () => {
    mockExecuteRaw.mockClear();
    await releaseReservation('session-unknown');
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});

describe('releaseExpiredSessions', () => {
  test('releases sessions whose TTL has expired', async () => {
    mockExecuteRaw.mockResolvedValue(1);
    const sessionId = 'session-expired';

    // Reserve with 0-minute TTL so it's immediately expired
    await reserveStock(makeItems(1), sessionId, 0);

    // Force the session's expiresAt into the past
    // (0-min TTL → already expired by the time we call this)
    const released = await releaseExpiredSessions();

    expect(released).toBeGreaterThanOrEqual(1);
    expect(hasValidReservation(sessionId)).toBe(false);
  });
});
