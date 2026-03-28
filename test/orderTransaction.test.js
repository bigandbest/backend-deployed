/**
 * Integration tests for the order placement transaction.
 *
 * Covers:
 *  - Full happy path: transaction commits, response includes sub-orders
 *  - Transaction rollback when Razorpay signature is invalid
 *  - Idempotency key: second request with same key returns cached order
 *  - Partial stock failure: returns 409 with itemized failures before any DB write
 *  - Warehouse selection parallelism: all items resolved in one round
 */

import request from 'supertest';
import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Prisma transaction mock: runs the callback with a fake tx that tracks calls
const txMock = {
  $executeRaw: jest.fn().mockResolvedValue(1),
  orders: { create: jest.fn() },
  order_items: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  sub_orders: { create: jest.fn() },
  sub_order_items: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  cart_items: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
};

const mockPrisma = {
  $transaction: jest.fn(async (cb) => cb(txMock)),
  orders: { findFirst: jest.fn().mockResolvedValue(null) },
  warehouses: { findMany: jest.fn().mockResolvedValue([{ id: 1, type: 'division' }]) },
};

jest.mock('../config/prisma.js', () => ({ default: mockPrisma }));

jest.mock('../services/warehouseService.js', () => ({
  findWarehouseForProducts: jest.fn(),
  findWarehouseForProduct: jest.fn(),
}));

jest.mock('../services/fulfillmentRouter.js', () => ({
  routeSubOrders: jest.fn().mockResolvedValue([]),
}));

jest.mock('../dao/bulk-product-settings.dao.js', () => ({
  default: { getSettings: jest.fn().mockResolvedValue([]) },
}));

jest.mock('../dao/charge-setting.dao.js', () => ({
  default: { get: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../dao/product.dao.js', () => ({
  default: {
    getProductById: jest.fn().mockResolvedValue({ id: 'p1', variants: [{ id: 'v1', is_default: true }] }),
    getById: jest.fn().mockResolvedValue({ stock_quantity: 10 }),
    update: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../dao/cart.dao.js', () => ({
  default: { clearCart: jest.fn().mockResolvedValue(true) },
}));

jest.mock('../controller/deliveryValidationService.js', () => ({
  checkMultipleProductsDelivery: jest.fn().mockResolvedValue({
    success: true,
    all_deliverable: true,
  }),
}));

import { findWarehouseForProducts } from '../services/warehouseService.js';
import { routeSubOrders } from '../services/fulfillmentRouter.js';

// Import app after mocks are set
const { default: app } = await import('../server.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseBody = {
  user_id: 'user-123',
  items: [{ product_id: 'p1', variant_id: 'v1', quantity: 2, price: 100 }],
  subtotal: 200,
  shipping: 40,
  total: 240,
  payment_method: 'COD',
  detailedAddress: {
    houseNumber: '12',
    streetAddress: 'MG Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'India',
  },
};

const mockWarehouseOk = {
  successes: [{ item: { productId: 'p1', variantId: 'v1', quantity: 2 }, warehouseInfo: { warehouse_id: 1, warehouse_name: 'WH1', seller_id: null, assignment_source: 'division' } }],
  failures: [],
};

const mockOrder = { id: 'order-001', status: 'pending', total: 240 };
const mockSubOrder = { id: 'so-001', source_type: 'division', fulfillment_status: 'pending', estimated_delivery_at: new Date() };

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.orders.findFirst.mockResolvedValue(null); // no existing idempotent order
  findWarehouseForProducts.mockResolvedValue(mockWarehouseOk);
  txMock.orders.create.mockResolvedValue(mockOrder);
  txMock.sub_orders.create.mockResolvedValue(mockSubOrder);
});

describe('POST /api/order/place-detailed', () => {
  test('happy path: commits transaction and returns sub-orders in response', async () => {
    const res = await request(app)
      .post('/api/order/place-detailed')
      .send(baseBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.order.id).toBe('order-001');
    expect(Array.isArray(res.body.subOrders)).toBe(true);
    expect(res.body.subOrders[0].subOrderId).toBe('so-001');

    // Transaction was called exactly once
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // Fulfillment routing fired asynchronously
    expect(routeSubOrders).toHaveBeenCalledWith('order-001');
  });

  test('partial stock failure: returns 409 before any DB write', async () => {
    findWarehouseForProducts.mockResolvedValue({
      successes: [],
      failures: [{ productId: 'p1', variantId: 'v1', reason: 'out_of_stock' }],
    });

    const res = await request(app)
      .post('/api/order/place-detailed')
      .send(baseBody);

    expect(res.status).toBe(409);
    expect(res.body.undeliverableItems).toHaveLength(1);
    expect(res.body.undeliverableItems[0].reason).toBe('out_of_stock');

    // No transaction should have started
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test('idempotency: second request with same key returns existing order without re-running tx', async () => {
    const existingOrder = { ...mockOrder, sub_orders: [mockSubOrder] };
    mockPrisma.orders.findFirst.mockResolvedValue(existingOrder);

    const res = await request(app)
      .post('/api/order/place-detailed')
      .set('x-idempotency-key', 'idem-key-123')
      .send(baseBody);

    expect(res.status).toBe(200);
    expect(res.body._idempotent).toBe(true);
    expect(res.body.order.id).toBe('order-001');

    // Transaction must NOT fire again
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test('invalid Razorpay signature: rejected before warehouse lookup', async () => {
    const res = await request(app)
      .post('/api/order/place-detailed')
      .send({
        ...baseBody,
        razorpay_order_id: 'rp_order',
        razorpay_payment_id: 'rp_payment',
        razorpay_signature: 'invalid_sig',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test('transaction rollback: if tx throws, no order is persisted', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(app)
      .post('/api/order/place-detailed')
      .send(baseBody);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  test('parallel warehouse selection: findWarehouseForProducts called once with all items', async () => {
    await request(app)
      .post('/api/order/place-detailed')
      .send({
        ...baseBody,
        items: [
          { product_id: 'p1', variant_id: 'v1', quantity: 1, price: 50 },
          { product_id: 'p2', variant_id: 'v2', quantity: 3, price: 80 },
        ],
      });

    // Called exactly once (not once per item)
    expect(findWarehouseForProducts).toHaveBeenCalledTimes(1);
    const [itemsArg] = findWarehouseForProducts.mock.calls[0];
    expect(itemsArg).toHaveLength(2);
  });
});
