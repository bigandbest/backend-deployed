// scripts/seed-marketing-demo.js
//
// Seeds a realistic, end-to-end Marketing-module demo dataset: a real Noida fulfillment
// warehouse + serviceable pincodes, products with real stock in that warehouse, customers
// with real Noida addresses, a completed referral (default rate) and a campaign-boosted
// referral, a withdrawal, an approved affiliate partner with a generated product link,
// a converted click, campaign-boosted + default-rate commissions, and a completed payout —
// so every Marketing admin page (Dashboard, Campaigns, Activity Logs) and every user-facing
// Refer & Earn / Affiliate screen (web + bbm-app) has real rows to render.
//
// Idempotent: every entity is looked up by a unique key first (email/phone/sku/name) and
// reused if it already exists, so this is safe to run more than once.
//
// Usage: node scripts/seed-marketing-demo.js
import prisma from "../config/prisma.js";
import { hashPassword } from "../utils/passwordUtils.js";
import crypto from "crypto";

const log = (...args) => console.log("🌱", ...args);
const rand = (n) => crypto.randomBytes(n).toString("hex");
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000);
const round2 = (n) => Math.round(n * 100) / 100;

// ─── Real Noida geography ───────────────────────────────────────────────────
const NOIDA_WAREHOUSE = {
  name: "BigBestMart Noida Sector 63 FC",
  address: "Plot No. 15, Sector 63 Industrial Area, Noida, Gautam Buddh Nagar, Uttar Pradesh 201301",
  location: "Sector 63, Noida, Uttar Pradesh",
  latitude: 28.6270,
  longitude: 77.3720,
};

const NOIDA_PINCODES = [
  { pincode: "201301", city: "Noida", state: "Uttar Pradesh", lat: 28.5921, lng: 77.3183 }, // Sector 18
  { pincode: "201304", city: "Noida", state: "Uttar Pradesh", lat: 28.6108, lng: 77.3910 }, // Sector 62
  { pincode: "201307", city: "Noida", state: "Uttar Pradesh", lat: 28.4998, lng: 77.4116 }, // Sector 137
  { pincode: "201305", city: "Noida", state: "Uttar Pradesh", lat: 28.5710, lng: 77.3260 }, // Sector 78
];

async function upsertWarehouse() {
  let wh = await prisma.warehouses.findUnique({ where: { name: NOIDA_WAREHOUSE.name } });
  if (!wh) {
    wh = await prisma.warehouses.create({
      data: {
        name: NOIDA_WAREHOUSE.name,
        type: "WAREHOUSE",
        location: NOIDA_WAREHOUSE.location,
        address: NOIDA_WAREHOUSE.address,
        contact_person: "Suresh Kumar",
        contact_phone: "+919810012345",
        contact_email: "noida.fc@bigbestmart.com",
        is_active: true,
        capacity_limit: 50000,
        latitude: NOIDA_WAREHOUSE.latitude,
        longitude: NOIDA_WAREHOUSE.longitude,
        geocode_status: "SUCCESS",
      },
    });
    log(`Created warehouse "${wh.name}" (id ${wh.id})`);
  } else {
    log(`Reusing warehouse "${wh.name}" (id ${wh.id})`);
  }

  for (const p of NOIDA_PINCODES) {
    await prisma.pincode_locations.upsert({
      where: { pincode: p.pincode },
      update: {},
      create: { pincode: p.pincode, latitude: p.lat, longitude: p.lng },
    });
    const existing = await prisma.warehouse_pincodes.findFirst({
      where: { warehouse_id: wh.id, pincode: p.pincode },
    });
    if (!existing) {
      await prisma.warehouse_pincodes.create({
        data: { warehouse_id: wh.id, pincode: p.pincode, city: p.city, state: p.state, delivery_days: 1, is_active: true },
      });
    }
  }
  log(`Warehouse serves pincodes: ${NOIDA_PINCODES.map((p) => p.pincode).join(", ")}`);
  return wh;
}

async function upsertCategory() {
  let category = await prisma.categories.findFirst({ where: { name: { equals: "Groceries", mode: "insensitive" } } });
  if (!category) {
    category = await prisma.categories.create({
      data: { name: "Groceries", description: "Daily grocery essentials", active: true, featured: true },
    });
    log(`Created category "Groceries" (id ${category.id})`);
  } else {
    log(`Reusing category "${category.name}" (id ${category.id})`);
  }
  return category;
}

// Real, recognizable Indian grocery SKUs with realistic MRPs.
const DEMO_PRODUCTS = [
  { sku: "DEMO-ATTA-5KG", name: "Aashirvaad Shudh Chakki Atta 5kg", price: 289, stock: 500 },
  { sku: "DEMO-SALT-1KG", name: "Tata Salt 1kg", price: 28, stock: 800 },
  { sku: "DEMO-OIL-SUN-1L", name: "Fortune Sunflower Oil 1L", price: 175, stock: 400 },
  { sku: "DEMO-BUTTER-500G", name: "Amul Butter 500g", price: 275, stock: 250 },
];

async function upsertProducts(warehouse, category) {
  const created = {};
  for (const p of DEMO_PRODUCTS) {
    let variant = await prisma.product_variants.findUnique({ where: { sku: p.sku }, include: { products: true } });
    let product;
    if (!variant) {
      product = await prisma.products.create({
        data: {
          name: p.name,
          description: `${p.name} — everyday grocery essential.`,
          category_id: category.id,
          vertical: "qwik",
          active: true,
          has_variants: false,
          gst_rate: 5,
        },
      });
      variant = await prisma.product_variants.create({
        data: {
          product_id: product.id,
          sku: p.sku,
          title: p.name,
          price: p.price,
          old_price: round2(p.price * 1.08),
          discount_percentage: 8,
          net_quantity: p.name.match(/[\d.]+\s?(kg|g|L)/i)?.[0] || "",
          is_default: true,
          active: true,
          updated_at: new Date(),
        },
      });
      log(`Created product "${p.name}" (variant ${variant.id}, SKU ${p.sku})`);
    } else {
      product = variant.products;
      log(`Reusing product "${p.name}" (variant ${variant.id}, SKU ${p.sku})`);
    }

    // Authoritative stock table (read by cart-availability / order placement).
    const existingInv = await prisma.inventory.findUnique({
      where: { variant_id_warehouse_id: { variant_id: variant.id, warehouse_id: warehouse.id } },
    }).catch(() => null); // composite unique name may differ across generated clients; fall back below
    if (!existingInv) {
      const found = await prisma.inventory.findFirst({ where: { variant_id: variant.id, warehouse_id: warehouse.id } });
      if (!found) {
        await prisma.inventory.create({
          data: {
            variant_id: variant.id,
            warehouse_id: warehouse.id,
            stock_qty: p.stock,
            admin_stock: p.stock,
            seller_stock: 0,
            reserved_qty: 0,
            updated_at: new Date(),
          },
        });
      }
    }

    // Admin-facing stock table (Products/Inventory pages).
    const existingPWS = await prisma.product_warehouse_stock.findFirst({
      where: { product_id: product.id, variant_id: variant.id, warehouse_id: warehouse.id },
    });
    if (!existingPWS) {
      await prisma.product_warehouse_stock.create({
        data: {
          product_id: product.id,
          variant_id: variant.id,
          warehouse_id: warehouse.id,
          stock_quantity: p.stock,
          reserved_quantity: 0,
          cost_per_unit: round2(p.price * 0.75),
          minimum_threshold: 50,
          reorder_point: 100,
          is_active: true,
          last_restocked_at: daysAgo(2),
        },
      });
    }

    created[p.sku] = { product, variant, price: p.price };
  }
  log(`Stocked ${DEMO_PRODUCTS.length} products at "${warehouse.name}" (${DEMO_PRODUCTS.map((p) => p.stock).join("/")} units)`);
  return created;
}

// ─── Customers with real Noida addresses ────────────────────────────────────
async function upsertCustomer({ name, phone, sector, pincode }) {
  const email = `phone_91${phone}@bbm.local`; // matches the app's phone-auth placeholder pattern
  let user = await prisma.users.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.users.create({
      data: { email, name, phone: `+91${phone}`, role: "USER", is_active: true, country: "India" },
    });
    log(`Created customer "${name}" (${user.id})`);
  } else {
    log(`Reusing customer "${name}" (${user.id})`);
  }

  let address = await prisma.customer_addresses.findFirst({ where: { user_id: user.id } });
  if (!address) {
    address = await prisma.customer_addresses.create({
      data: {
        user_id: user.id,
        label: "Home",
        address_line1: `H-${100 + Math.floor(Math.random() * 800)}, ${sector}`,
        address_line2: "Noida, Gautam Buddh Nagar",
        city: "Noida",
        state: "Uttar Pradesh",
        pincode,
        is_default: true,
        geocode_status: "SUCCESS",
      },
    });
  }
  return { user, address };
}

async function upsertReferralProfile(userId, { referredByCode = null, referredByUserId = null } = {}) {
  let profile = await prisma.user_referral_profiles.findUnique({ where: { user_id: userId } });
  if (!profile) {
    profile = await prisma.user_referral_profiles.create({
      data: {
        user_id: userId,
        referral_code: `BBM${rand(3).toUpperCase()}`,
        was_referred: !!referredByCode,
        referred_by_code: referredByCode,
        referred_by_user_id: referredByUserId,
        referred_at: referredByCode ? daysAgo(14) : null,
        current_tier: "Bronze",
      },
    });
  }
  return profile;
}

async function placeOrder({ user, address, items, warehouse, daysAgoPlaced = 5 }) {
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.qty, 0));
  const shipping = 0;
  const total = round2(subtotal + shipping);
  const placedAt = daysAgo(daysAgoPlaced);

  const order = await prisma.orders.create({
    data: {
      user_id: user.id,
      subtotal,
      shipping,
      total,
      address: `${address.address_line1}, ${address.address_line2}, ${address.city}, ${address.state} ${address.pincode}`,
      payment_method: "prepaid",
      status: "Delivered",
      created_at: placedAt,
      updated_at: placedAt,
      delivery_pincode: address.pincode,
      customer_address_id: address.id,
      mobile: user.phone,
      receiver_name: user.name,
    },
  });

  for (const item of items) {
    await prisma.order_items.create({
      data: {
        order_id: order.id,
        variant_id: item.variant.id,
        quantity: item.qty,
        price: item.price,
        original_price: item.price,
        assigned_warehouse_id: warehouse.id,
        warehouse_name: warehouse.name,
      },
    });
  }
  return { order, subtotal, total, placedAt };
}

async function main() {
  log("Starting Marketing demo seed...\n");

  // ── 1. Warehouse, pincodes, products, stock ──────────────────────────────
  const warehouse = await upsertWarehouse();
  const category = await upsertCategory();
  const products = await upsertProducts(warehouse, category);

  const atta = products["DEMO-ATTA-5KG"];
  const salt = products["DEMO-SALT-1KG"];
  const oil = products["DEMO-OIL-SUN-1L"];
  const butter = products["DEMO-BUTTER-500G"];

  // ── 2. Referral config sanity (ensure a config row exists so public-config works) ──
  let refConfig = await prisma.referral_configs.findFirst();
  if (!refConfig) {
    refConfig = await prisma.referral_configs.create({ data: {} });
    log("Created default referral_configs row");
  }

  // ── 3. Referral pair #1 — default rate, fully completed ──────────────────
  const rohit = await upsertCustomer({ name: "Rohit Sharma", phone: "9876543210", sector: "Sector 62", pincode: "201304" });
  const priya = await upsertCustomer({ name: "Priya Verma", phone: "9812345678", sector: "Sector 78", pincode: "201305" });

  const rohitProfile = await upsertReferralProfile(rohit.user.id);
  const priyaProfile = await upsertReferralProfile(priya.user.id, {
    referredByCode: rohitProfile.referral_code,
    referredByUserId: rohit.user.id,
  });

  let tx1 = await prisma.referral_transactions.findUnique({ where: { referee_id: priya.user.id } });
  if (!tx1) {
    const { order, total, placedAt } = await placeOrder({
      user: priya.user,
      address: priya.address,
      warehouse,
      daysAgoPlaced: 10,
      items: [
        { variant: atta.variant, price: atta.price, qty: 1 },
        { variant: salt.variant, price: salt.price, qty: 2 },
      ],
    });
    const deliveredAt = daysAgo(7);
    tx1 = await prisma.referral_transactions.create({
      data: {
        referrer_id: rohit.user.id,
        referrer_profile_id: rohitProfile.id,
        referral_code_used: rohitProfile.referral_code,
        referee_id: priya.user.id,
        referee_name: priya.user.name,
        referee_phone: priya.user.phone,
        status: "COMPLETED",
        order_id: order.id,
        order_number: order.id.slice(0, 8).toUpperCase(),
        order_amount: total,
        order_date: placedAt,
        delivered_at: deliveredAt,
        return_window_starts_at: deliveredAt,
        return_window_ends_at: daysFromNow(0), // return window just closed
        referrer_reward_amount: Number(refConfig.referrer_reward_amount),
        referee_reward_amount: Number(refConfig.referee_reward_amount),
        reward_credited_at: new Date(),
        status_history: [
          { status: "SIGNUP_COMPLETED", timestamp: daysAgo(14) },
          { status: "ORDER_PLACED", timestamp: placedAt },
          { status: "ORDER_DELIVERED", timestamp: deliveredAt },
          { status: "COMPLETED", timestamp: new Date() },
        ],
      },
    });

    const referrerReward = await prisma.referral_rewards.create({
      data: {
        user_id: rohit.user.id,
        user_profile_id: rohitProfile.id,
        referral_transaction_id: tx1.id,
        amount: tx1.referrer_reward_amount,
        original_amount: tx1.referrer_reward_amount,
        remaining_amount: round2(Number(tx1.referrer_reward_amount) * 0.4), // partly spent
        used_amount: round2(Number(tx1.referrer_reward_amount) * 0.6),
        reward_type: "REFERRER_REWARD",
        source_type: "REFERRAL",
        source_description: `Referral reward for ${priya.user.name}'s first order`,
        status: "PARTIALLY_USED",
        credited_at: deliveredAt,
        expires_at: daysFromNow(refConfig.reward_validity_days),
      },
    });
    const refereeReward = await prisma.referral_rewards.create({
      data: {
        user_id: priya.user.id,
        user_profile_id: priyaProfile.id,
        referral_transaction_id: tx1.id,
        amount: tx1.referee_reward_amount,
        original_amount: tx1.referee_reward_amount,
        remaining_amount: tx1.referee_reward_amount,
        used_amount: 0,
        reward_type: "REFEREE_BONUS",
        source_type: "REFERRAL",
        source_description: "Welcome bonus for signing up with a referral code",
        status: "ACTIVE",
        credited_at: deliveredAt,
        expires_at: daysFromNow(refConfig.reward_validity_days),
      },
    });

    await prisma.user_referral_profiles.update({
      where: { id: rohitProfile.id },
      data: {
        total_referrals: 1, successful_referrals: 1,
        total_earnings: tx1.referrer_reward_amount,
        available_balance: referrerReward.remaining_amount,
        used_for_purchase: referrerReward.used_amount,
        referrer_reward_id: undefined,
      },
    });
    await prisma.referral_transactions.update({
      where: { id: tx1.id },
      data: { referrer_reward_id: referrerReward.id, referee_reward_id: refereeReward.id },
    });
    await prisma.user_referral_profiles.update({
      where: { id: priyaProfile.id },
      data: {
        total_earnings: tx1.referee_reward_amount,
        available_balance: tx1.referee_reward_amount,
        referral_bonus_received: true,
      },
    });
    log(`Referral #1 completed: Rohit → Priya, order ₹${total}, rewards credited`);
  } else {
    log("Referral #1 (Rohit → Priya) already seeded");
  }

  // A completed withdrawal for Rohit, showing the full payout lifecycle.
  const existingWithdrawal = await prisma.referral_withdrawals.findFirst({ where: { user_id: rohit.user.id } });
  if (!existingWithdrawal) {
    await prisma.referral_withdrawals.create({
      data: {
        user_id: rohit.user.id,
        user_profile_id: rohitProfile.id,
        requested_amount: 45,
        processed_amount: 45,
        payment_method: "UPI",
        status: "COMPLETED",
        upi_id: "rohit.sharma@okhdfcbank",
        processed_at: daysAgo(5),
        status_history: [
          { status: "PENDING", timestamp: daysAgo(6) },
          { status: "COMPLETED", timestamp: daysAgo(5) },
        ],
      },
    });
    log("Seeded a completed referral withdrawal for Rohit");
  }

  // ── 4. Referral campaign + campaign-boosted referral pair #2 ─────────────
  let referralCampaign = await prisma.campaigns.findFirst({ where: { name: "Noida Launch Bonus" } });
  if (!referralCampaign) {
    referralCampaign = await prisma.campaigns.create({
      data: {
        name: "Noida Launch Bonus",
        description: "Boosted flat referral reward for the Noida service-area launch.",
        channel: "REFERRAL",
        starts_at: daysAgo(20),
        ends_at: daysFromNow(20),
        usage_limit: 500,
        used_count: 0,
        is_active: true,
        campaign_rule: {
          create: { scope_type: "STORE_WIDE", reward_type: "FIXED", reward_value: 100, min_order_value: 200 },
        },
      },
      include: { campaign_rule: true },
    });
    log(`Created referral campaign "${referralCampaign.name}"`);
  } else {
    log(`Reusing referral campaign "${referralCampaign.name}"`);
  }

  const neha = await upsertCustomer({ name: "Neha Gupta", phone: "9900112233", sector: "Sector 18", pincode: "201301" });
  const karan = await upsertCustomer({ name: "Karan Mehta", phone: "9911223344", sector: "Sector 137", pincode: "201307" });
  const nehaProfile = await upsertReferralProfile(neha.user.id);
  const karanProfile = await upsertReferralProfile(karan.user.id, {
    referredByCode: nehaProfile.referral_code,
    referredByUserId: neha.user.id,
  });

  let tx2 = await prisma.referral_transactions.findUnique({ where: { referee_id: karan.user.id } });
  if (!tx2) {
    const { order, total, placedAt } = await placeOrder({
      user: karan.user,
      address: karan.address,
      warehouse,
      daysAgoPlaced: 3,
      items: [{ variant: oil.variant, price: oil.price, qty: 3 }],
    });
    const deliveredAt = daysAgo(1);
    tx2 = await prisma.referral_transactions.create({
      data: {
        referrer_id: neha.user.id,
        referrer_profile_id: nehaProfile.id,
        referral_code_used: nehaProfile.referral_code,
        referee_id: karan.user.id,
        referee_name: karan.user.name,
        referee_phone: karan.user.phone,
        status: "ORDER_DELIVERED", // still inside the return window — not yet COMPLETED
        order_id: order.id,
        order_number: order.id.slice(0, 8).toUpperCase(),
        order_amount: total,
        order_date: placedAt,
        delivered_at: deliveredAt,
        return_window_starts_at: deliveredAt,
        return_window_ends_at: daysFromNow(6),
        campaign_id: referralCampaign.id,
        campaign_name: referralCampaign.name,
        applied_reward_type: "FIXED",
        applied_reward_value: 100,
        status_history: [
          { status: "SIGNUP_COMPLETED", timestamp: daysAgo(4) },
          { status: "ORDER_PLACED", timestamp: placedAt },
          { status: "ORDER_DELIVERED", timestamp: deliveredAt },
        ],
      },
    });

    await prisma.campaign_usage.create({
      data: { campaign_id: referralCampaign.id, order_id: order.id, channel: "REFERRAL" },
    });
    await prisma.campaigns.update({ where: { id: referralCampaign.id }, data: { used_count: { increment: 1 } } });

    log(`Referral #2 (campaign-boosted) in progress: Neha → Karan, order ₹${total}, ₹100 campaign reward pending completion`);
  } else {
    log("Referral #2 (Neha → Karan) already seeded");
  }

  // ── 5. Affiliate campaign ─────────────────────────────────────────────────
  let affiliateCampaign = await prisma.campaigns.findFirst({ where: { name: "Festive Oil Commission Boost" } });
  if (!affiliateCampaign) {
    affiliateCampaign = await prisma.campaigns.create({
      data: {
        name: "Festive Oil Commission Boost",
        description: "Higher affiliate commission on Fortune Sunflower Oil for the festive season.",
        channel: "AFFILIATE",
        starts_at: daysAgo(10),
        ends_at: daysFromNow(30),
        usage_limit: 200,
        used_count: 0,
        is_active: true,
        campaign_rule: {
          create: { scope_type: "PRODUCT", scope_id: oil.product.id, reward_type: "PERCENTAGE", reward_value: 8 },
        },
      },
    });
    log(`Created affiliate campaign "${affiliateCampaign.name}"`);
  } else {
    log(`Reusing affiliate campaign "${affiliateCampaign.name}"`);
  }

  // ── 6. Affiliate partner: application → approval → profile ───────────────
  const amit = await upsertCustomer({ name: "Amit Verma", phone: "9922334455", sector: "Sector 50", pincode: "201301" });

  let application = await prisma.affiliate_applications.findFirst({ where: { user_id: amit.user.id } });
  if (!application) {
    application = await prisma.affiliate_applications.create({
      data: {
        user_id: amit.user.id,
        email: amit.user.email,
        full_name: amit.user.name,
        phone: amit.user.phone,
        primary_platform: "YOUTUBE",
        youtube_channel: "youtube.com/@amitvermaeats",
        estimated_audience: 45000,
        niche_categories: ["Groceries", "Food"],
        promotion_strategy: "Weekly grocery haul videos and Instagram reels featuring BigBestMart staples.",
        payment_method: "UPI",
        upi_id: "amitverma@okicici",
        status: "APPROVED",
        reviewed_at: daysAgo(15),
        agreed_to_terms: true,
        agreed_at: daysAgo(16),
        submitted_at: daysAgo(16),
      },
    });
    log(`Created affiliate application for Amit Verma (APPROVED)`);
  }

  let affProfile = await prisma.affiliate_profiles.findUnique({ where: { user_id: amit.user.id } });
  if (!affProfile) {
    affProfile = await prisma.affiliate_profiles.create({
      data: {
        user_id: amit.user.id,
        application_id: application.id,
        affiliate_code: `AMITV${rand(2).toUpperCase()}`,
        display_name: amit.user.name,
        email: amit.user.email,
        phone: amit.user.phone,
        tier_name: "Silver",
        tier_bonus: 1,
        primary_platform: "YOUTUBE",
        payment_method: "UPI",
        upi_id: "amitverma@okicici",
        status: "ACTIVE",
        approved_at: daysAgo(15),
      },
    });
    log(`Created affiliate profile, code ${affProfile.affiliate_code}`);
  } else {
    log(`Reusing affiliate profile, code ${affProfile.affiliate_code}`);
  }

  // ── 7. Generated product link, converted click, campaign-boosted order/commission ──
  let link = await prisma.affiliate_links.findFirst({ where: { affiliate_id: affProfile.id, product_id: oil.product.id } });
  if (!link) {
    const linkCode = `LNK${rand(4).toUpperCase()}`;
    link = await prisma.affiliate_links.create({
      data: {
        affiliate_id: affProfile.id,
        affiliate_code: affProfile.affiliate_code,
        link_code: linkCode,
        full_url: `https://bigbestmart.com/product/fortune-sunflower-oil-1l?ref=${affProfile.affiliate_code}`,
        destination_type: "PRODUCT",
        destination_url: "/product/fortune-sunflower-oil-1l",
        product_id: oil.product.id,
        product_name: oil.product.name,
      },
    });
    log(`Generated affiliate product link ${link.link_code} for Fortune Sunflower Oil`);
  }

  const sana = await upsertCustomer({ name: "Sana Khan", phone: "9933445566", sector: "Sector 137", pincode: "201307" });

  let click = await prisma.affiliate_clicks.findFirst({ where: { affiliate_id: affProfile.id, user_id: sana.user.id } });
  let commission1 = null;
  if (!click) {
    click = await prisma.affiliate_clicks.create({
      data: {
        affiliate_id: affProfile.id,
        link_id: link.id,
        link_code: link.link_code,
        affiliate_code: affProfile.affiliate_code,
        visitor_id: `visitor_${rand(4)}`,
        user_id: sana.user.id,
        device_type: "mobile",
        country: "India",
        destination_url: link.destination_url,
        cookie_expires_at: daysFromNow(1),
        clicked_at: daysAgo(9),
        is_converted: true,
        converted_at: daysAgo(8),
      },
    });

    const { order, subtotal, total, placedAt } = await placeOrder({
      user: sana.user,
      address: sana.address,
      warehouse,
      daysAgoPlaced: 8,
      items: [
        { variant: oil.variant, price: oil.price, qty: 3 },
        { variant: butter.variant, price: butter.price, qty: 1 },
      ],
    });
    await prisma.affiliate_clicks.update({ where: { id: click.id }, data: { order_id: order.id } });

    const deliveredAt = daysAgo(4);
    const commissionRate = 5; // affiliate_configs.default_commission_rate
    const tierBonus = Number(affProfile.tier_bonus); // Silver tier bonus
    const campaignRate = 8; // Festive Oil Commission Boost — replaces default, no stacking (Q3)
    // Oil (₹525) priced under the campaign; butter (₹275) at default+tier rate — matches the
    // engine's real per-item matching (campaignEngine.matchRuleForItem), computed by hand here.
    const oilValue = round2(oil.price * 3);
    const butterValue = butter.price;
    const oilCommission = round2(oilValue * (campaignRate / 100));
    const butterCommission = round2(butterValue * ((commissionRate + tierBonus) / 100));
    const grossCommission = round2(oilCommission + butterCommission);
    const effectiveRate = round2((grossCommission / total) * 100);

    const affOrder = await prisma.affiliate_orders.create({
      data: {
        affiliate_id: affProfile.id,
        affiliate_code: affProfile.affiliate_code,
        click_id: click.id,
        order_id: order.id,
        order_number: order.id.slice(0, 8).toUpperCase(),
        customer_id: sana.user.id,
        customer_email: sana.user.email,
        order_date: placedAt,
        order_status: "DELIVERED",
        gross_order_value: subtotal,
        net_order_value: subtotal,
        final_order_value: total,
        delivered_at: deliveredAt,
        return_window_ends_at: daysFromNow(0),
        commission_status: "PAID",
        commission_rate: commissionRate,
        commission_amount: grossCommission,
        tier_bonus: tierBonus,
        final_commission: grossCommission,
        processed_at: daysAgo(2),
        campaign_id: affiliateCampaign.id,
        campaign_name: affiliateCampaign.name,
        campaign_breakdown: { oil: { value: oilValue, rate: campaignRate, commission: oilCommission }, butter: { value: butterValue, rate: commissionRate + tierBonus, commission: butterCommission } },
      },
    });

    await prisma.campaign_usage.create({
      data: { campaign_id: affiliateCampaign.id, order_id: order.id, channel: "AFFILIATE" },
    });
    await prisma.campaigns.update({ where: { id: affiliateCampaign.id }, data: { used_count: { increment: 1 } } });

    commission1 = await prisma.affiliate_commissions.create({
      data: {
        affiliate_id: affProfile.id,
        affiliate_order_id: affOrder.id,
        order_id: order.id,
        order_value: total,
        base_commission_rate: commissionRate,
        tier_bonus: tierBonus,
        effective_rate: effectiveRate,
        gross_commission: grossCommission,
        net_commission: grossCommission,
        tds_applicable: false,
        final_amount: grossCommission,
        status: "PAID",
        order_date: placedAt,
        qualified_at: deliveredAt,
        approved_at: daysAgo(3),
        paid_at: daysAgo(2),
        campaign_id: affiliateCampaign.id,
        campaign_name: affiliateCampaign.name,
      },
    });

    await prisma.affiliate_links.update({
      where: { id: link.id },
      data: { total_clicks: { increment: 1 }, total_orders: { increment: 1 }, total_revenue: { increment: total }, total_commission: { increment: grossCommission } },
    });

    log(`Converted click → order ₹${total} → commission ₹${grossCommission} (campaign-boosted, PAID)`);
  } else {
    log("Affiliate click/order/commission for Sana already seeded");
  }

  // ── 8. A second, default-rate commission left PENDING (pipeline variety) ──
  const vikram = await upsertCustomer({ name: "Vikram Rao", phone: "9944556677", sector: "Sector 62", pincode: "201304" });
  let affOrder2 = await prisma.affiliate_orders.findFirst({ where: { affiliate_id: affProfile.id, customer_id: vikram.user.id } });
  if (!affOrder2) {
    const { order, subtotal, total, placedAt } = await placeOrder({
      user: vikram.user,
      address: vikram.address,
      warehouse,
      daysAgoPlaced: 1,
      items: [{ variant: butter.variant, price: butter.price, qty: 2 }],
    });

    const commissionRate = 5;
    const tierBonus = Number(affProfile.tier_bonus);
    const grossCommission = round2(subtotal * ((commissionRate + tierBonus) / 100));

    affOrder2 = await prisma.affiliate_orders.create({
      data: {
        affiliate_id: affProfile.id,
        affiliate_code: affProfile.affiliate_code,
        order_id: order.id,
        order_number: order.id.slice(0, 8).toUpperCase(),
        customer_id: vikram.user.id,
        customer_email: vikram.user.email,
        order_date: placedAt,
        order_status: "PLACED",
        gross_order_value: subtotal,
        net_order_value: subtotal,
        final_order_value: total,
        commission_status: "PENDING",
        commission_rate: commissionRate,
        commission_amount: grossCommission,
        tier_bonus: tierBonus,
        final_commission: grossCommission,
      },
    });

    await prisma.affiliate_commissions.create({
      data: {
        affiliate_id: affProfile.id,
        affiliate_order_id: affOrder2.id,
        order_id: order.id,
        order_value: total,
        base_commission_rate: commissionRate,
        tier_bonus: tierBonus,
        effective_rate: commissionRate + tierBonus,
        gross_commission: grossCommission,
        net_commission: grossCommission,
        tds_applicable: false,
        final_amount: grossCommission,
        status: "PENDING",
        order_date: placedAt,
      },
    });
    log(`Seeded a second, default-rate commission (₹${grossCommission}, still PENDING) for pipeline variety`);
  }

  // ── 9. Completed payout covering the PAID commission ──────────────────────
  const existingPayout = await prisma.affiliate_payouts.findFirst({ where: { affiliate_id: affProfile.id } });
  let payout = existingPayout;
  if (!payout && commission1) {
    payout = await prisma.affiliate_payouts.create({
      data: {
        affiliate_id: affProfile.id,
        payout_number: `PAYOUT-${new Date().getFullYear()}-${rand(3).toUpperCase()}`,
        payout_period: `${new Date(daysAgo(30)).toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
        gross_amount: commission1.gross_commission,
        net_amount: commission1.net_commission,
        commission_count: 1,
        payment_method: "UPI",
        upi_id: "amitverma@okicici",
        status: "COMPLETED",
        processed_at: daysAgo(2),
        completed_at: daysAgo(2),
        transaction_id: `UPI${rand(6)}`,
      },
    });
    await prisma.affiliate_commissions.update({ where: { id: commission1.id }, data: { payout_id: payout.id } });
    log(`Created completed payout ${payout.payout_number} for ₹${payout.net_amount}`);
  }

  // Roll up affiliate_profiles totals from the seeded orders/commissions.
  const allCommissions = await prisma.affiliate_commissions.findMany({ where: { affiliate_id: affProfile.id } });
  const totalEarned = round2(allCommissions.reduce((s, c) => s + Number(c.gross_commission), 0));
  const totalPaid = round2(allCommissions.filter((c) => c.status === "PAID").reduce((s, c) => s + Number(c.final_amount), 0));
  const pendingBalance = round2(totalEarned - totalPaid);
  const allOrders = await prisma.affiliate_orders.findMany({ where: { affiliate_id: affProfile.id } });
  const totalSales = round2(allOrders.reduce((s, o) => s + Number(o.final_order_value), 0));

  await prisma.affiliate_profiles.update({
    where: { id: affProfile.id },
    data: {
      total_clicks: 1,
      total_orders: allOrders.length,
      total_sales: totalSales,
      total_commission_earned: totalEarned,
      total_commission_paid: totalPaid,
      available_balance: 0,
      pending_balance: pendingBalance,
      last_active_at: new Date(),
    },
  });

  log("\n✅ Marketing demo seed complete.\n");
  log("Summary:");
  log(`  Warehouse:        ${warehouse.name} — ${NOIDA_WAREHOUSE.address}`);
  log(`  Serviceable PINs: ${NOIDA_PINCODES.map((p) => p.pincode).join(", ")}`);
  log(`  Products stocked: ${DEMO_PRODUCTS.map((p) => p.sku).join(", ")}`);
  log(`  Referral #1:      Rohit Sharma (${rohitProfile.referral_code}) → Priya Verma — COMPLETED, default ₹75/₹75`);
  log(`  Referral #2:      Neha Gupta (${nehaProfile.referral_code}) → Karan Mehta — campaign "${referralCampaign.name}", ₹100 flat`);
  log(`  Affiliate:        Amit Verma, code ${affProfile.affiliate_code} — 1 PAID (campaign) + 1 PENDING (default) commission, 1 completed payout`);
  log(`  Campaigns:        "${referralCampaign.name}" (REFERRAL), "${affiliateCampaign.name}" (AFFILIATE)`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
