// backend-deployed/test/wallet.test.js
const request = require("supertest");
const { app } = require("../server");
const supabase = require("../config/supabaseClient");

// Test configuration
const TEST_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Test User",
  email: "test@example.com",
  phone: "9999999999",
};

const TEST_ADMIN = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "admin@example.com",
};

describe("Wallet System Tests", () => {
  let userToken, adminToken, testWalletId;

  beforeAll(async () => {
    // Clean up existing test data
    await cleanupTestData();

    // Create test user and admin
    await createTestUser();
    await createTestAdmin();

    // Generate tokens
    userToken = generateTestToken(TEST_USER.id);
    adminToken = generateTestAdminToken(TEST_ADMIN.id);
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
  });

  beforeEach(async () => {
    // Reset wallet state before each test
    await resetWalletState();
  });

  describe("Wallet Creation", () => {
    test("Should automatically create wallet for new user", async () => {
      const newUserId = "00000000-0000-0000-0000-000000000003";

      // Create a new user
      const { error } = await supabase.from("users").insert({
        id: newUserId,
        name: "New Test User",
        email: "newtest@example.com",
        phone: "9999999998",
      });

      expect(error).toBeNull();

      // Check if wallet was auto-created
      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", newUserId)
        .single();

      expect(wallet).toBeDefined();
      expect(wallet.balance).toBe("0.00");
      expect(wallet.is_frozen).toBe(false);
    });
  });

  describe("Wallet Top-up", () => {
    test("Should create pending topup request", async () => {
      const response = await request(app)
        .post("/api/wallet/topup")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          amount: 100.0,
          payment_method: "razorpay",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order).toBeDefined();
      expect(response.body.order.amount).toBe(10000); // Razorpay amount in paisa
      expect(response.body.payment_id).toBeDefined();
    });

    test("Should reject invalid topup amounts", async () => {
      const response = await request(app)
        .post("/api/wallet/topup")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          amount: -10,
          payment_method: "razorpay",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid amount/i);
    });

    test("Should handle Razorpay webhook correctly", async () => {
      // Create a pending topup first
      const { data: pendingTopup } = await supabase
        .from("wallet_topups_pending")
        .insert({
          payment_id: "pay_test123",
          user_id: TEST_USER.id,
          amount: 100.0,
          status: "pending",
        })
        .select()
        .single();

      // Mock Razorpay webhook payload
      const webhookPayload = {
        entity: "event",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_test123",
              amount: 10000,
              status: "captured",
            },
          },
        },
      };

      const response = await request(app)
        .post("/api/wallet/webhook")
        .send(webhookPayload);

      expect(response.status).toBe(200);

      // Verify wallet balance was updated
      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", TEST_USER.id)
        .single();

      expect(parseFloat(wallet.balance)).toBe(100.0);
    });
  });

  describe("Wallet Spending", () => {
    beforeEach(async () => {
      // Add balance to wallet for spending tests
      await supabase
        .from("wallets")
        .update({ balance: 500.0 })
        .eq("user_id", TEST_USER.id);
    });

    test("Should deduct amount for valid purchase", async () => {
      const response = await request(app)
        .post("/api/wallet/spend")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          amount: 100.0,
          description: "Test purchase",
          order_id: "order_test_123",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.new_balance).toBe("400.00");

      // Verify transaction was recorded
      const { data: transaction } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("wallet_id", response.body.transaction.wallet_id)
        .eq("type", "spend")
        .single();

      expect(transaction).toBeDefined();
      expect(parseFloat(transaction.amount)).toBe(-100.0);
    });

    test("Should reject spending when insufficient balance", async () => {
      const response = await request(app)
        .post("/api/wallet/spend")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          amount: 1000.0,
          description: "Large purchase",
          order_id: "order_test_456",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/insufficient balance/i);
    });

    test("Should reject spending from frozen wallet", async () => {
      // Freeze the wallet
      await supabase
        .from("wallets")
        .update({
          is_frozen: true,
          frozen_reason: "Test freeze",
          frozen_at: new Date().toISOString(),
        })
        .eq("user_id", TEST_USER.id);

      const response = await request(app)
        .post("/api/wallet/spend")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          amount: 50.0,
          description: "Test purchase from frozen wallet",
          order_id: "order_test_789",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/frozen/i);
    });
  });

  describe("Admin Operations", () => {
    beforeEach(async () => {
      // Reset wallet to known state
      await supabase
        .from("wallets")
        .update({
          balance: 100.0,
          is_frozen: false,
          frozen_reason: null,
          frozen_at: null,
        })
        .eq("user_id", TEST_USER.id);
    });

    test("Should allow admin to credit wallet", async () => {
      const response = await request(app)
        .post("/api/admin/wallet/credit")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          user_id: TEST_USER.id,
          amount: 200.0,
          reason: "Test credit for good customer",
          notify_user: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.new_balance).toBe("300.00");

      // Verify audit log was created
      const { data: auditLog } = await supabase
        .from("wallet_audit_logs")
        .select("*")
        .eq("wallet_id", response.body.transaction.wallet_id)
        .eq("action", "manual_credit")
        .single();

      expect(auditLog).toBeDefined();
      expect(auditLog.admin_user_id).toBe(TEST_ADMIN.id);
      expect(auditLog.details.reason).toBe("Test credit for good customer");
    });

    test("Should allow admin to debit wallet", async () => {
      const response = await request(app)
        .post("/api/admin/wallet/debit")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          user_id: TEST_USER.id,
          amount: 50.0,
          reason: "Test debit for refund adjustment",
          notify_user: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.new_balance).toBe("50.00");
    });

    test("Should allow admin to freeze wallet", async () => {
      const response = await request(app)
        .post("/api/admin/wallet/freeze")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          user_id: TEST_USER.id,
          reason: "Suspicious activity detected",
          notify_user: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify wallet is frozen
      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", TEST_USER.id)
        .single();

      expect(wallet.is_frozen).toBe(true);
      expect(wallet.frozen_reason).toBe("Suspicious activity detected");
    });

    test("Should allow admin to unfreeze wallet", async () => {
      // First freeze the wallet
      await supabase
        .from("wallets")
        .update({
          is_frozen: true,
          frozen_reason: "Test freeze",
          frozen_at: new Date().toISOString(),
        })
        .eq("user_id", TEST_USER.id);

      const response = await request(app)
        .post("/api/admin/wallet/unfreeze")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          user_id: TEST_USER.id,
          reason: "Issues resolved, unfreezing wallet",
          notify_user: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify wallet is unfrozen
      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", TEST_USER.id)
        .single();

      expect(wallet.is_frozen).toBe(false);
      expect(wallet.frozen_reason).toBeNull();
    });

    test("Should fetch wallet transactions for admin", async () => {
      // Create some test transactions
      const walletId = await getWalletId(TEST_USER.id);
      await createTestTransactions(walletId);

      const response = await request(app)
        .get("/api/admin/wallet/transactions")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({
          page: 1,
          limit: 10,
          user_id: TEST_USER.id,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.transactions)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });
  });

  describe("Concurrency Tests", () => {
    beforeEach(async () => {
      // Set wallet balance to 100 for concurrency tests
      await supabase
        .from("wallets")
        .update({ balance: 100.0 })
        .eq("user_id", TEST_USER.id);
    });

    test("Should handle concurrent spending attempts correctly", async () => {
      // Attempt multiple simultaneous spending operations
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .post("/api/wallet/spend")
            .set("Authorization", `Bearer ${userToken}`)
            .send({
              amount: 25.0,
              description: `Concurrent purchase ${i}`,
              order_id: `concurrent_order_${i}`,
            })
        );
      }

      const results = await Promise.allSettled(promises);

      // Only 4 should succeed (4 * 25 = 100), 1 should fail due to insufficient balance
      const successes = results.filter(
        (r) => r.status === "fulfilled" && r.value.status === 200
      );
      const failures = results.filter(
        (r) => r.status === "fulfilled" && r.value.status !== 200
      );

      expect(successes.length).toBe(4);
      expect(failures.length).toBe(1);

      // Final balance should be 0
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", TEST_USER.id)
        .single();

      expect(parseFloat(wallet.balance)).toBe(0.0);
    });
  });

  describe("Edge Cases", () => {
    test("Should handle very small amounts correctly", async () => {
      await supabase
        .from("wallets")
        .update({ balance: 10.0 })
        .eq("user_id", TEST_USER.id);

      const response = await request(app)
        .post("/api/wallet/spend")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          amount: 0.01,
          description: "Minimum amount purchase",
          order_id: "min_amount_test",
        });

      expect(response.status).toBe(200);
      expect(response.body.new_balance).toBe("9.99");
    });

    test("Should handle large amounts correctly", async () => {
      await supabase
        .from("wallets")
        .update({ balance: 100000.0 })
        .eq("user_id", TEST_USER.id);

      const response = await request(app)
        .post("/api/wallet/spend")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          amount: 50000.0,
          description: "Large amount purchase",
          order_id: "large_amount_test",
        });

      expect(response.status).toBe(200);
      expect(response.body.new_balance).toBe("50000.00");
    });

    test("Should handle duplicate payment webhook", async () => {
      // Create pending topup
      const { data: pendingTopup } = await supabase
        .from("wallet_topups_pending")
        .insert({
          payment_id: "pay_duplicate_test",
          user_id: TEST_USER.id,
          amount: 100.0,
          status: "pending",
        })
        .select()
        .single();

      const webhookPayload = {
        entity: "event",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_duplicate_test",
              amount: 10000,
              status: "captured",
            },
          },
        },
      };

      // Send webhook twice
      await request(app).post("/api/wallet/webhook").send(webhookPayload);

      const secondResponse = await request(app)
        .post("/api/wallet/webhook")
        .send(webhookPayload);

      expect(secondResponse.status).toBe(200); // Should not fail

      // Balance should only be credited once
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", TEST_USER.id)
        .single();

      expect(parseFloat(wallet.balance)).toBe(100.0);
    });
  });
});

// Helper functions
async function cleanupTestData() {
  // Delete in correct order due to foreign key constraints
  await supabase
    .from("wallet_audit_logs")
    .delete()
    .in("wallet_id", await getTestWalletIds());
  await supabase
    .from("wallet_transactions")
    .delete()
    .in("wallet_id", await getTestWalletIds());
  await supabase
    .from("wallet_topups_pending")
    .delete()
    .in("user_id", [TEST_USER.id]);
  await supabase
    .from("wallets")
    .delete()
    .in("user_id", [TEST_USER.id, "00000000-0000-0000-0000-000000000003"]);
  await supabase
    .from("users")
    .delete()
    .in("id", [
      TEST_USER.id,
      TEST_ADMIN.id,
      "00000000-0000-0000-0000-000000000003",
    ]);
}

async function getTestWalletIds() {
  const { data } = await supabase
    .from("wallets")
    .select("id")
    .in("user_id", [TEST_USER.id, "00000000-0000-0000-0000-000000000003"]);

  return data ? data.map((w) => w.id) : [];
}

async function createTestUser() {
  const { error } = await supabase.from("users").insert(TEST_USER);

  if (error && !error.message.includes("duplicate")) {
    throw error;
  }
}

async function createTestAdmin() {
  const { error } = await supabase.from("admin_users").insert(TEST_ADMIN);

  if (error && !error.message.includes("duplicate")) {
    throw error;
  }
}

function generateTestToken(userId) {
  const jwt = require("jsonwebtoken");
  return jwt.sign({ user_id: userId }, process.env.JWT_SECRET || "test_secret");
}

function generateTestAdminToken(adminId) {
  const jwt = require("jsonwebtoken");
  return jwt.sign(
    { admin_id: adminId },
    process.env.JWT_SECRET || "test_secret"
  );
}

async function resetWalletState() {
  await supabase
    .from("wallets")
    .update({
      balance: 0.0,
      is_frozen: false,
      frozen_reason: null,
      frozen_at: null,
    })
    .eq("user_id", TEST_USER.id);

  // Clear test transactions
  const walletId = await getWalletId(TEST_USER.id);
  if (walletId) {
    await supabase
      .from("wallet_transactions")
      .delete()
      .eq("wallet_id", walletId);

    await supabase.from("wallet_audit_logs").delete().eq("wallet_id", walletId);
  }
}

async function getWalletId(userId) {
  const { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .single();

  return wallet?.id;
}

async function createTestTransactions(walletId) {
  const transactions = [
    {
      wallet_id: walletId,
      type: "topup",
      amount: 100.0,
      status: "completed",
      description: "Test topup",
    },
    {
      wallet_id: walletId,
      type: "spend",
      amount: -50.0,
      status: "completed",
      description: "Test purchase",
    },
    {
      wallet_id: walletId,
      type: "refund",
      amount: 25.0,
      status: "completed",
      description: "Test refund",
    },
  ];

  await supabase.from("wallet_transactions").insert(transactions);
}
