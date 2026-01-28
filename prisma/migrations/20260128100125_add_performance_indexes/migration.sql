-- CreateEnum
CREATE TYPE "Vertical" AS ENUM ('qwik', 'eato', 'bazar', 'star');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SELLER');

-- CreateTable
CREATE TABLE "about_us_content" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "banner_image_url" TEXT,
    "title" VARCHAR DEFAULT 'About Our Company',
    "subtitle" VARCHAR DEFAULT 'About Big&Best',
    "heading" VARCHAR DEFAULT 'Big&Best Mart',
    "content" TEXT,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "about_us_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_banner" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "banner_type" TEXT,
    "description" VARCHAR,
    "link" TEXT,
    "active" BOOLEAN DEFAULT true,
    "position" TEXT,
    "is_mobile" BOOLEAN DEFAULT false,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "add_banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR NOT NULL,
    "subtitle" VARCHAR,
    "description" VARCHAR,
    "image_url" TEXT,
    "link" VARCHAR,
    "banner_type" VARCHAR,
    "position" VARCHAR,
    "bg_color" VARCHAR,
    "button_text" VARCHAR,
    "discount_text" VARCHAR,
    "active" BOOLEAN DEFAULT true,
    "is_mobile" BOOLEAN DEFAULT false,
    "display_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "image_url" TEXT,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_bid_product" BOOLEAN DEFAULT false,
    "locked_bid_id" INTEGER,
    "bid_unit_price" DECIMAL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "featured" BOOLEAN DEFAULT false,
    "icon" TEXT,
    "active" BOOLEAN DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR NOT NULL,
    "image_url" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN DEFAULT true,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "handling_charge" DECIMAL NOT NULL DEFAULT 0,
    "surge_charge" DECIMAL NOT NULL DEFAULT 0,
    "discount_charge" DECIMAL NOT NULL DEFAULT 0,
    "platform_charge" DECIMAL NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_queries" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "email" VARCHAR NOT NULL,
    "phone" VARCHAR,
    "subject" VARCHAR,
    "message" TEXT NOT NULL,
    "status" VARCHAR DEFAULT 'Pending',
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "quantity" TEXT,

    CONSTRAINT "contact_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coupon_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "discount_applied" DECIMAL NOT NULL,
    "order_value" DECIMAL NOT NULL,
    "final_amount" DECIMAL NOT NULL,
    "idempotency_key" VARCHAR NOT NULL,
    "status" VARCHAR DEFAULT 'APPLIED',
    "reserved_at" TIMESTAMPTZ,
    "applied_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "refunded_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR NOT NULL,
    "discount_type" VARCHAR NOT NULL,
    "discount_value" DECIMAL NOT NULL,
    "max_discount" DECIMAL,
    "min_order_value" DECIMAL DEFAULT 0,
    "allowed_brands" JSONB DEFAULT '[]',
    "new_user_only" BOOLEAN DEFAULT false,
    "usage_limit_total" INTEGER,
    "usage_limit_per_user" INTEGER DEFAULT 1,
    "valid_from" TIMESTAMPTZ NOT NULL,
    "valid_to" TIMESTAMPTZ NOT NULL,
    "timezone" VARCHAR DEFAULT 'UTC',
    "status" VARCHAR DEFAULT 'ACTIVE',
    "description" TEXT,
    "terms_conditions" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_testimonials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "image_url" TEXT,
    "comment" TEXT NOT NULL,
    "active" BOOLEAN DEFAULT true,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_deals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR,
    "image_url" TEXT,
    "discount" VARCHAR,
    "badge" VARCHAR,
    "sort_order" INTEGER DEFAULT 0,
    "active" BOOLEAN DEFAULT true,
    "banner_id" UUID,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_deals_product" (
    "daily_deal_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "daily_deals_product_pkey" PRIMARY KEY ("daily_deal_id","product_id")
);

-- CreateTable
CREATE TABLE "delivery_charge_milestones" (
    "id" SERIAL NOT NULL,
    "min_order_value" DECIMAL NOT NULL,
    "delivery_charge" DECIMAL NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_charge_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "display_name" VARCHAR,
    "is_nationwide" BOOLEAN DEFAULT false,
    "is_active" BOOLEAN DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "message" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR DEFAULT 'pending',
    "admin_reply" BOOLEAN DEFAULT false,
    "admin_notes" TEXT,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "type" VARCHAR DEFAULT 'regular',
    "subject" VARCHAR,
    "quantity" VARCHAR,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_bids" (
    "id" SERIAL NOT NULL,
    "enquiry_id" INTEGER NOT NULL,
    "bid_type" VARCHAR DEFAULT 'SINGLE_PRODUCT',
    "base_price" DECIMAL,
    "quantity" INTEGER,
    "validity_hours" INTEGER DEFAULT 24,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP,
    "status" VARCHAR DEFAULT 'ACTIVE',
    "created_by" UUID,
    "terms" TEXT,
    "notes" TEXT,

    CONSTRAINT "enquiry_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_messages" (
    "id" SERIAL NOT NULL,
    "enquiry_id" INTEGER NOT NULL,
    "sender_type" VARCHAR NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_name" VARCHAR,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "attachment_url" TEXT,
    "attachment_type" VARCHAR,

    CONSTRAINT "enquiry_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_elevate" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR NOT NULL,
    "description" VARCHAR,
    "category" VARCHAR,
    "bg_color" VARCHAR DEFAULT 'from-purple-400 to-orange-400',
    "text_color" VARCHAR DEFAULT 'white',
    "badge_text" VARCHAR,
    "badge_color" VARCHAR DEFAULT 'bg-blue-600',
    "position" VARCHAR DEFAULT 'grid',
    "display_order" INTEGER DEFAULT 0,
    "active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_elevate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR NOT NULL,
    "description" TEXT,
    "icon" VARCHAR,
    "image_url" TEXT,
    "subcategory_id" UUID NOT NULL,
    "featured" BOOLEAN DEFAULT false,
    "active" BOOLEAN DEFAULT true,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" SERIAL NOT NULL,
    "variant_id" UUID NOT NULL,
    "stock_qty" INTEGER NOT NULL DEFAULT 0,
    "reserved_qty" INTEGER NOT NULL DEFAULT 0,
    "bulk_stock_threshold" INTEGER DEFAULT 0,
    "bulk_reserved_qty" INTEGER DEFAULT 0,
    "warehouse_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_execution_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduled_order_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "executed_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR NOT NULL,
    "inventory_check_passed" BOOLEAN DEFAULT false,
    "payment_check_passed" BOOLEAN DEFAULT false,
    "error_message" TEXT,
    "error_code" VARCHAR,
    "execution_duration_ms" INTEGER,
    "worker_id" VARCHAR,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "order_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL NOT NULL,
    "is_bulk_order" BOOLEAN DEFAULT false,
    "bulk_range" VARCHAR,
    "original_price" DECIMAL,
    "assigned_warehouse_id" INTEGER,
    "warehouse_name" VARCHAR,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_tracking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID,
    "status" VARCHAR NOT NULL,
    "location" VARCHAR,
    "description" TEXT,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "subtotal" DECIMAL NOT NULL,
    "shipping" DECIMAL NOT NULL,
    "total" DECIMAL NOT NULL,
    "address" TEXT,
    "payment_method" TEXT DEFAULT 'prepaid',
    "status" TEXT DEFAULT 'Pending',
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "razorpay_order_id" VARCHAR,
    "razorpay_payment_id" VARCHAR,
    "tracking_number" VARCHAR,
    "estimated_delivery" TIMESTAMP,
    "is_bulk_order" BOOLEAN DEFAULT false,
    "company_name" VARCHAR,
    "gst_number" VARCHAR,
    "is_deleted" BOOLEAN DEFAULT false,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR NOT NULL,
    "image_url" TEXT NOT NULL,
    "active" BOOLEAN DEFAULT true,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_retry_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduled_order_id" UUID NOT NULL,
    "execution_log_id" UUID,
    "retry_number" INTEGER NOT NULL,
    "attempted_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "payment_method" VARCHAR,
    "amount" DECIMAL,
    "status" VARCHAR,
    "error_code" VARCHAR,
    "error_message" TEXT,
    "next_retry_at" TIMESTAMPTZ,

    CONSTRAINT "payment_retry_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pincode_locations" (
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pincode" VARCHAR NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,

    CONSTRAINT "pincode_locations_pkey" PRIMARY KEY ("pincode")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" UUID,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_brand" (
    "product_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,

    CONSTRAINT "product_brand_pkey" PRIMARY KEY ("product_id","brand_id")
);

-- CreateTable
CREATE TABLE "product_enquiries" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "quantity" INTEGER NOT NULL,
    "message" TEXT,
    "expected_price" DECIMAL,
    "status" VARCHAR DEFAULT 'OPEN',
    "admin_notes" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP + interval '7 days',
    "closed_reason" VARCHAR,
    "closed_by" VARCHAR,
    "company_name" VARCHAR,
    "gst_number" VARCHAR,
    "phone" VARCHAR,
    "delivery_timeline" VARCHAR,

    CONSTRAINT "product_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "media_type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_recommended_store" (
    "product_id" UUID NOT NULL,
    "recommended_store_id" UUID NOT NULL,

    CONSTRAINT "product_recommended_store_pkey" PRIMARY KEY ("product_id","recommended_store_id")
);

-- CreateTable
CREATE TABLE "product_reviews" (
    "id" SERIAL NOT NULL,
    "product_id" UUID NOT NULL,
    "user_id" UUID,
    "user_name" VARCHAR NOT NULL,
    "user_email" VARCHAR,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "is_verified_purchase" BOOLEAN DEFAULT false,
    "helpful_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_section_categories" (
    "id" SERIAL NOT NULL,
    "section_id" INTEGER NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_section_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_section_groups" (
    "id" SERIAL NOT NULL,
    "section_id" INTEGER NOT NULL,
    "group_id" UUID NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_section_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_section_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "section_id" INTEGER NOT NULL,
    "display_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_section_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_sections" (
    "id" SERIAL NOT NULL,
    "section_key" VARCHAR NOT NULL,
    "section_name" VARCHAR NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "display_order" INTEGER DEFAULT 0,
    "component_name" VARCHAR NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "sku" VARCHAR NOT NULL,
    "title" VARCHAR NOT NULL,
    "price" DECIMAL NOT NULL,
    "old_price" DECIMAL,
    "discount_percentage" INTEGER DEFAULT 0,
    "packaging_details" TEXT,
    "gst_rate_override" DECIMAL,
    "cess_rate_override" DECIMAL,
    "features" TEXT,
    "is_default" BOOLEAN DEFAULT false,
    "active" BOOLEAN DEFAULT true,
    "shipping_amount" DECIMAL DEFAULT 0,
    "is_bulk_enabled" BOOLEAN DEFAULT false,
    "bulk_price" DECIMAL,
    "bulk_min_quantity" INTEGER,
    "bulk_discount_percentage" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_warehouse_stock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "warehouse_id" INTEGER NOT NULL,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "cost_per_unit" DECIMAL,
    "minimum_threshold" INTEGER DEFAULT 0,
    "reorder_point" INTEGER DEFAULT 0,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "last_restocked_at" TIMESTAMPTZ,

    CONSTRAINT "product_warehouse_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hsn_or_sac_code" VARCHAR,
    "gst_rate" DECIMAL DEFAULT 0,
    "cess_rate" DECIMAL DEFAULT 0,
    "vertical" "Vertical" NOT NULL DEFAULT 'qwik',
    "category_id" UUID,
    "subcategory_id" UUID,
    "group_id" UUID,
    "store_id" UUID,
    "rating" DECIMAL DEFAULT 0,
    "review_count" INTEGER DEFAULT 0,
    "return_applicable" BOOLEAN DEFAULT false,
    "return_days" INTEGER DEFAULT 0,
    "active" BOOLEAN DEFAULT true,
    "has_variants" BOOLEAN DEFAULT false,
    "faq" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_banners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR NOT NULL,
    "subtitle" VARCHAR,
    "discount" VARCHAR,
    "description" VARCHAR,
    "button_text" VARCHAR DEFAULT 'SHOP NOW',
    "bg_color" VARCHAR DEFAULT 'from-indigo-600 via-purple-600 to-pink-600',
    "accent_color" VARCHAR DEFAULT 'from-pink-400 to-rose-400',
    "icon" VARCHAR DEFAULT '💪',
    "category" VARCHAR,
    "link" VARCHAR,
    "active" BOOLEAN DEFAULT true,
    "display_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotional_media" (
    "id" SERIAL NOT NULL,
    "media_type" VARCHAR NOT NULL,
    "title" VARCHAR,
    "description" TEXT,
    "image_url" TEXT,
    "video_url" TEXT,
    "thumbnail_url" TEXT,
    "link" TEXT,
    "link_type" TEXT DEFAULT 'external',
    "resource_id" TEXT,
    "sub_resource_id" TEXT,
    "position" INTEGER DEFAULT 0,
    "active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotional_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_pick" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "image_url" TEXT,

    CONSTRAINT "quick_pick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_pick_group" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "image_url" TEXT,
    "quick_pick_id" UUID,

    CONSTRAINT "quick_pick_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quickpick_group_product" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quick_pick_group_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "quickpick_group_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommended_store" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "image_url" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN DEFAULT false,
    "banner_id" UUID,

    CONSTRAINT "recommended_store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_order_slots" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "current_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_order_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "cart_items" JSONB NOT NULL,
    "address_id" UUID,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "timezone" VARCHAR NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR NOT NULL DEFAULT 'SCHEDULED',
    "payment_method" VARCHAR NOT NULL,
    "payment_intent_id" VARCHAR,
    "payment_status" VARCHAR DEFAULT 'PENDING',
    "total_amount" DECIMAL NOT NULL,
    "execution_attempts" INTEGER DEFAULT 0,
    "last_execution_attempt" TIMESTAMPTZ,
    "idempotency_key" VARCHAR NOT NULL,
    "lock_token" VARCHAR,
    "lock_expires_at" TIMESTAMPTZ,
    "placed_order_id" UUID,
    "failure_reason" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "warehouse_id" INTEGER,
    "slot_id" INTEGER,
    "scheduled_date" DATE,

    CONSTRAINT "scheduled_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling_time_slots" (
    "id" SERIAL NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "display_name" VARCHAR NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduling_time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_subcategory_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "section_id" INTEGER NOT NULL,
    "subcategory_id" UUID NOT NULL,
    "display_order" INTEGER DEFAULT 0,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "section_subcategory_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID,
    "variant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "address_id" UUID,
    "provider_id" UUID,
    "status" "ServiceStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "service_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "small_promo_cards" (
    "id" SERIAL NOT NULL,
    "image_url" TEXT NOT NULL,
    "link" TEXT,
    "display_order" INTEGER DEFAULT 0,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "link_type" TEXT DEFAULT 'external',
    "resource_id" TEXT,
    "sub_resource_id" TEXT,

    CONSTRAINT "small_promo_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "movement_type" VARCHAR NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previous_stock" INTEGER NOT NULL,
    "new_stock" INTEGER NOT NULL,
    "reference_type" VARCHAR,
    "reference_id" INTEGER,
    "reason" VARCHAR,
    "performed_by" INTEGER,
    "performed_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_section_mappings" (
    "id" SERIAL NOT NULL,
    "store_id" UUID,
    "section_id" INTEGER,
    "product_id" UUID,
    "mapping_type" VARCHAR,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_section_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "link" TEXT,
    "image" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcategories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR NOT NULL,
    "description" TEXT,
    "icon" VARCHAR,
    "image_url" TEXT,
    "category_id" UUID NOT NULL,
    "featured" BOOLEAN DEFAULT false,
    "active" BOOLEAN DEFAULT true,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR NOT NULL,
    "designation" VARCHAR NOT NULL,
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "photo_url" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "password" TEXT,
    "password_reset_token" TEXT,
    "password_reset_expires" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMPTZ,
    "is_active" BOOLEAN DEFAULT true,
    "phone" TEXT,
    "avatar" TEXT,
    "name" TEXT,
    "account_type" TEXT,
    "company_name" TEXT,
    "street_address" VARCHAR,
    "suite_unit_floor" VARCHAR,
    "house_number" VARCHAR,
    "locality" VARCHAR,
    "city" VARCHAR,
    "state" VARCHAR,
    "postal_code" VARCHAR,
    "country" VARCHAR DEFAULT 'India',
    "landmark" VARCHAR,
    "gstin" VARCHAR,
    "pan" VARCHAR,
    "adhaar_no" VARCHAR,
    "first_name" TEXT,
    "last_name" TEXT,
    "business_type" TEXT,
    "user_image" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "address_name" VARCHAR NOT NULL,
    "is_default" BOOLEAN DEFAULT false,
    "street_address" VARCHAR NOT NULL,
    "suite_unit_floor" VARCHAR,
    "house_number" VARCHAR,
    "locality" VARCHAR,
    "city" VARCHAR NOT NULL,
    "state" VARCHAR NOT NULL,
    "postal_code" VARCHAR NOT NULL,
    "country" VARCHAR DEFAULT 'India',
    "landmark" VARCHAR,
    "gstin" VARCHAR,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "type" VARCHAR NOT NULL,
    "title" VARCHAR NOT NULL,
    "message" TEXT NOT NULL,
    "related_id" UUID,
    "related_type" VARCHAR,
    "is_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_attributes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "attribute_name" TEXT NOT NULL,
    "attribute_value" TEXT NOT NULL,

    CONSTRAINT "variant_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_cards" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "video_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "active" BOOLEAN DEFAULT true,
    "position" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "transaction_type" VARCHAR NOT NULL,
    "amount" DECIMAL NOT NULL,
    "balance_before" DECIMAL NOT NULL,
    "balance_after" DECIMAL NOT NULL,
    "reference_type" VARCHAR,
    "reference_id" UUID,
    "razorpay_order_id" VARCHAR,
    "razorpay_payment_id" VARCHAR,
    "description" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "status" VARCHAR DEFAULT 'COMPLETED',
    "idempotency_key" VARCHAR,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "balance" DECIMAL NOT NULL DEFAULT 0.00,
    "is_frozen" BOOLEAN DEFAULT false,
    "frozen_reason" TEXT,
    "frozen_by" UUID,
    "frozen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER DEFAULT 1,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_pincodes" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "pincode" VARCHAR NOT NULL,
    "city" VARCHAR,
    "state" VARCHAR,
    "delivery_days" INTEGER DEFAULT 3,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_pincodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_scheduling_config" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "max_capacity" INTEGER NOT NULL DEFAULT 20,
    "scheduling_window_hours" INTEGER NOT NULL DEFAULT 24,
    "is_active" BOOLEAN DEFAULT true,
    "days_of_week" JSONB DEFAULT '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]',
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_scheduling_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_zones" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "zone_id" INTEGER NOT NULL,
    "priority" INTEGER DEFAULT 1,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "type" VARCHAR NOT NULL,
    "location" VARCHAR,
    "address" TEXT,
    "contact_person" VARCHAR,
    "contact_phone" VARCHAR,
    "contact_email" VARCHAR,
    "is_active" BOOLEAN DEFAULT true,
    "capacity_limit" INTEGER,
    "current_utilization" INTEGER DEFAULT 0,
    "operational_hours" JSONB DEFAULT '{}',
    "facilities" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "parent_warehouse_id" INTEGER,
    "hierarchy_level" INTEGER DEFAULT 0,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "you_may_like" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID,

    CONSTRAINT "you_may_like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_pincodes" (
    "id" SERIAL NOT NULL,
    "zone_id" INTEGER NOT NULL,
    "pincode" VARCHAR NOT NULL,
    "city" VARCHAR,
    "state" VARCHAR,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "district" VARCHAR,
    "location_name" VARCHAR,
    "village" VARCHAR,
    "others" TEXT,

    CONSTRAINT "zone_pincodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cart_items_user_id_idx" ON "cart_items"("user_id");

-- CreateIndex
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");

-- CreateIndex
CREATE INDEX "cart_items_user_id_added_at_idx" ON "cart_items"("user_id", "added_at" DESC);

-- CreateIndex
CREATE INDEX "categories_active_idx" ON "categories"("active");

-- CreateIndex
CREATE INDEX "categories_featured_idx" ON "categories"("featured");

-- CreateIndex
CREATE INDEX "categories_active_featured_idx" ON "categories"("active", "featured");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_usage_order_id_key" ON "coupon_usage"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_usage_idempotency_key_key" ON "coupon_usage"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_charge_milestones_min_order_value_key" ON "delivery_charge_milestones"("min_order_value");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_name_key" ON "delivery_zones"("name");

-- CreateIndex
CREATE INDEX "inventory_warehouse_id_idx" ON "inventory"("warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_stock_qty_idx" ON "inventory"("stock_qty");

-- CreateIndex
CREATE INDEX "inventory_variant_id_idx" ON "inventory"("variant_id");

-- CreateIndex
CREATE INDEX "inventory_warehouse_id_variant_id_idx" ON "inventory"("warehouse_id", "variant_id");

-- CreateIndex
CREATE INDEX "inventory_warehouse_id_stock_qty_idx" ON "inventory"("warehouse_id", "stock_qty");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_variant_id_warehouse_id_key" ON "inventory"("variant_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_user_id_status_idx" ON "orders"("user_id", "status");

-- CreateIndex
CREATE INDEX "orders_payment_method_idx" ON "orders"("payment_method");

-- CreateIndex
CREATE INDEX "orders_is_deleted_idx" ON "orders"("is_deleted");

-- CreateIndex
CREATE INDEX "orders_razorpay_order_id_idx" ON "orders"("razorpay_order_id");

-- CreateIndex
CREATE INDEX "product_media_product_id_idx" ON "product_media"("product_id");

-- CreateIndex
CREATE INDEX "product_media_variant_id_idx" ON "product_media"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_section_categories_section_id_category_id_key" ON "product_section_categories"("section_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_section_groups_section_id_group_id_key" ON "product_section_groups"("section_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_sections_section_key_key" ON "product_sections"("section_key");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_active_idx" ON "product_variants"("active");

-- CreateIndex
CREATE INDEX "product_variants_product_id_is_default_idx" ON "product_variants"("product_id", "is_default");

-- CreateIndex
CREATE INDEX "product_variants_product_id_active_idx" ON "product_variants"("product_id", "active");

-- CreateIndex
CREATE INDEX "product_variants_is_default_active_idx" ON "product_variants"("is_default", "active");

-- CreateIndex
CREATE INDEX "product_warehouse_stock_product_id_idx" ON "product_warehouse_stock"("product_id");

-- CreateIndex
CREATE INDEX "product_warehouse_stock_warehouse_id_idx" ON "product_warehouse_stock"("warehouse_id");

-- CreateIndex
CREATE INDEX "product_warehouse_stock_variant_id_idx" ON "product_warehouse_stock"("variant_id");

-- CreateIndex
CREATE INDEX "product_warehouse_stock_warehouse_id_is_active_idx" ON "product_warehouse_stock"("warehouse_id", "is_active");

-- CreateIndex
CREATE INDEX "product_warehouse_stock_product_id_variant_id_idx" ON "product_warehouse_stock"("product_id", "variant_id");

-- CreateIndex
CREATE INDEX "product_warehouse_stock_warehouse_id_product_id_idx" ON "product_warehouse_stock"("warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "product_warehouse_stock_stock_quantity_idx" ON "product_warehouse_stock"("stock_quantity");

-- CreateIndex
CREATE INDEX "products_vertical_idx" ON "products"("vertical");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_active_idx" ON "products"("active");

-- CreateIndex
CREATE INDEX "products_store_id_idx" ON "products"("store_id");

-- CreateIndex
CREATE INDEX "products_has_variants_idx" ON "products"("has_variants");

-- CreateIndex
CREATE INDEX "products_active_category_id_idx" ON "products"("active", "category_id");

-- CreateIndex
CREATE INDEX "products_active_store_id_idx" ON "products"("active", "store_id");

-- CreateIndex
CREATE INDEX "products_category_id_subcategory_id_idx" ON "products"("category_id", "subcategory_id");

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at" DESC);

-- CreateIndex
CREATE INDEX "products_subcategory_id_idx" ON "products"("subcategory_id");

-- CreateIndex
CREATE INDEX "products_group_id_idx" ON "products"("group_id");

-- CreateIndex
CREATE INDEX "products_rating_idx" ON "products"("rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_orders_idempotency_key_key" ON "scheduled_orders"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "service_bookings_order_item_id_key" ON "service_bookings"("order_item_id");

-- CreateIndex
CREATE INDEX "service_bookings_user_id_idx" ON "service_bookings"("user_id");

-- CreateIndex
CREATE INDEX "service_bookings_provider_id_idx" ON "service_bookings"("provider_id");

-- CreateIndex
CREATE INDEX "service_bookings_scheduled_at_idx" ON "service_bookings"("scheduled_at");

-- CreateIndex
CREATE INDEX "service_bookings_status_idx" ON "service_bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_gstin_key" ON "users"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "users_pan_key" ON "users"("pan");

-- CreateIndex
CREATE UNIQUE INDEX "users_adhaar_no_key" ON "users"("adhaar_no");

-- CreateIndex
CREATE INDEX "variant_attributes_variant_id_idx" ON "variant_attributes"("variant_id");

-- CreateIndex
CREATE INDEX "variant_attributes_attribute_name_idx" ON "variant_attributes"("attribute_name");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_name_key" ON "warehouses"("name");

-- CreateIndex
CREATE INDEX "warehouses_type_idx" ON "warehouses"("type");

-- CreateIndex
CREATE INDEX "warehouses_is_active_idx" ON "warehouses"("is_active");

-- CreateIndex
CREATE INDEX "warehouses_parent_warehouse_id_idx" ON "warehouses"("parent_warehouse_id");

-- CreateIndex
CREATE INDEX "warehouses_type_is_active_idx" ON "warehouses"("type", "is_active");

-- CreateIndex
CREATE INDEX "warehouses_hierarchy_level_idx" ON "warehouses"("hierarchy_level");

-- CreateIndex
CREATE INDEX "wishlist_items_user_id_idx" ON "wishlist_items"("user_id");

-- CreateIndex
CREATE INDEX "wishlist_items_product_id_idx" ON "wishlist_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_user_id_product_id_key" ON "wishlist_items"("user_id", "product_id");

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_deals" ADD CONSTRAINT "daily_deals_banner_id_fkey" FOREIGN KEY ("banner_id") REFERENCES "add_banner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_deals_product" ADD CONSTRAINT "daily_deals_product_daily_deal_id_fkey" FOREIGN KEY ("daily_deal_id") REFERENCES "daily_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_deals_product" ADD CONSTRAINT "daily_deals_product_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_bids" ADD CONSTRAINT "enquiry_bids_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "product_enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_messages" ADD CONSTRAINT "enquiry_messages_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "product_enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_execution_logs" ADD CONSTRAINT "order_execution_logs_scheduled_order_id_fkey" FOREIGN KEY ("scheduled_order_id") REFERENCES "scheduled_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_assigned_warehouse_id_fkey" FOREIGN KEY ("assigned_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_tracking" ADD CONSTRAINT "order_tracking_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_retry_logs" ADD CONSTRAINT "payment_retry_logs_scheduled_order_id_fkey" FOREIGN KEY ("scheduled_order_id") REFERENCES "scheduled_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_retry_logs" ADD CONSTRAINT "payment_retry_logs_execution_log_id_fkey" FOREIGN KEY ("execution_log_id") REFERENCES "order_execution_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_brand" ADD CONSTRAINT "product_brand_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_brand" ADD CONSTRAINT "product_brand_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_enquiries" ADD CONSTRAINT "product_enquiries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recommended_store" ADD CONSTRAINT "product_recommended_store_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recommended_store" ADD CONSTRAINT "product_recommended_store_recommended_store_id_fkey" FOREIGN KEY ("recommended_store_id") REFERENCES "recommended_store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_section_categories" ADD CONSTRAINT "product_section_categories_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "product_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_section_categories" ADD CONSTRAINT "product_section_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_section_groups" ADD CONSTRAINT "product_section_groups_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "product_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_section_groups" ADD CONSTRAINT "product_section_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_section_products" ADD CONSTRAINT "product_section_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_section_products" ADD CONSTRAINT "product_section_products_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "product_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_warehouse_stock" ADD CONSTRAINT "product_warehouse_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_warehouse_stock" ADD CONSTRAINT "product_warehouse_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_warehouse_stock" ADD CONSTRAINT "product_warehouse_stock_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "subcategories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_pick_group" ADD CONSTRAINT "quick_pick_group_quick_pick_id_fkey" FOREIGN KEY ("quick_pick_id") REFERENCES "quick_pick"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quickpick_group_product" ADD CONSTRAINT "quickpick_group_product_quick_pick_group_id_fkey" FOREIGN KEY ("quick_pick_group_id") REFERENCES "quick_pick_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quickpick_group_product" ADD CONSTRAINT "quickpick_group_product_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommended_store" ADD CONSTRAINT "recommended_store_banner_id_fkey" FOREIGN KEY ("banner_id") REFERENCES "banners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_order_slots" ADD CONSTRAINT "scheduled_order_slots_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_order_slots" ADD CONSTRAINT "scheduled_order_slots_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "scheduling_time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_orders" ADD CONSTRAINT "scheduled_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_orders" ADD CONSTRAINT "scheduled_orders_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "scheduling_time_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_subcategory_mappings" ADD CONSTRAINT "section_subcategory_mappings_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "product_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_subcategory_mappings" ADD CONSTRAINT "section_subcategory_mappings_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "user_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_section_mappings" ADD CONSTRAINT "store_section_mappings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "recommended_store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_section_mappings" ADD CONSTRAINT "store_section_mappings_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "product_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_section_mappings" ADD CONSTRAINT "store_section_mappings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_attributes" ADD CONSTRAINT "variant_attributes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_frozen_by_fkey" FOREIGN KEY ("frozen_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_pincodes" ADD CONSTRAINT "warehouse_pincodes_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_scheduling_config" ADD CONSTRAINT "warehouse_scheduling_config_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_scheduling_config" ADD CONSTRAINT "warehouse_scheduling_config_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "scheduling_time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_zones" ADD CONSTRAINT "warehouse_zones_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_zones" ADD CONSTRAINT "warehouse_zones_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_parent_warehouse_id_fkey" FOREIGN KEY ("parent_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "you_may_like" ADD CONSTRAINT "you_may_like_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_pincodes" ADD CONSTRAINT "zone_pincodes_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
