-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('customer', 'agent', 'admin');

-- CreateEnum
CREATE TYPE "BatteryCategory" AS ENUM ('portable', 'automotive', 'industrial', 'ev');

-- CreateEnum
CREATE TYPE "BatteryCondition" AS ENUM ('healthy', 'swollen', 'leaking', 'dead');

-- CreateEnum
CREATE TYPE "AddressStatus" AS ENUM ('operational', 'not_operational');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'processing', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('upi', 'bank_transfer', 'wallet', 'cash');

-- CreateEnum
CREATE TYPE "WalletTxnKind" AS ENUM ('payout', 'redemption', 'adjustment');

-- CreateEnum
CREATE TYPE "ManifestStatus" AS ENUM ('draft', 'dispatched', 'received', 'reconciled');

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "co2_avoided_kg" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "pickups" ADD COLUMN     "address_id" TEXT,
ADD COLUMN     "agent_id" UUID,
ADD COLUMN     "category" "BatteryCategory" NOT NULL DEFAULT 'portable',
ADD COLUMN     "condition_flags" "BatteryCondition"[],
ADD COLUMN     "eta_minutes" INTEGER,
ADD COLUMN     "indicative_quote_paise" INTEGER,
ADD COLUMN     "scheduled_slot" TIMESTAMP(3),
ALTER COLUMN "battery_type" DROP NOT NULL,
ALTER COLUMN "approx_quantity" DROP NOT NULL;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "agent_rating" DECIMAL(3,2),
ADD COLUMN     "agent_vehicle" TEXT,
ADD COLUMN     "agent_zone" TEXT,
ADD COLUMN     "phone_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'customer',
ADD COLUMN     "safety_trained_at" TIMESTAMP(3),
ADD COLUMN     "wallet_balance_paise" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "status_events" ADD COLUMN     "lat" DECIMAL(10,7),
ADD COLUMN     "lng" DECIMAL(10,7),
ADD COLUMN     "photo_urls" TEXT[];

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "status" "AddressStatus" NOT NULL DEFAULT 'operational',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battery_items" (
    "id" TEXT NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "category" "BatteryCategory" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "weight_kg" DECIMAL(8,2),
    "condition" "BatteryCondition" NOT NULL DEFAULT 'healthy',
    "photo_urls" TEXT[],
    "chemistry" "BatteryType",
    "confirmed_weight_kg" DECIMAL(8,2),
    "confirmed_condition" "BatteryCondition",
    "agent_photo_urls" TEXT[],
    "recorded_by" UUID,
    "recorded_at" TIMESTAMP(3),
    "unit_price_paise" INTEGER,
    "line_price_paise" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rates" (
    "id" TEXT NOT NULL,
    "category" "BatteryCategory" NOT NULL,
    "chemistry" "BatteryType",
    "condition" "BatteryCondition",
    "rate_per_kg_paise" INTEGER NOT NULL,
    "rate_per_unit_paise" INTEGER,
    "condition_multiplier_bp" INTEGER NOT NULL DEFAULT 10000,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'upi',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "gateway_ref" TEXT,
    "gateway_order" TEXT,
    "paid_at" TIMESTAMP(3),
    "failure_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_txns" (
    "id" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "delta_paise" INTEGER NOT NULL,
    "kind" "WalletTxnKind" NOT NULL,
    "balance_after_paise" INTEGER NOT NULL,
    "pickup_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_txns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_receipts" (
    "id" TEXT NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "pdf_url" TEXT,
    "public_token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "total_weight_kg" DECIMAL(10,2) NOT NULL,
    "item_count" INTEGER NOT NULL,
    "amount_paise" INTEGER,
    "agent_id" UUID,
    "captured_lat" DECIMAL(10,7),
    "captured_lng" DECIMAL(10,7),
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "pickup_id" TEXT,
    "number" TEXT NOT NULL,
    "period_start" DATE,
    "period_end" DATE,
    "subtotal_paise" INTEGER NOT NULL,
    "tax_paise" INTEGER NOT NULL DEFAULT 0,
    "total_paise" INTEGER NOT NULL,
    "pdf_url" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "capacity_kg" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recyclers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpcb_reg_no" TEXT NOT NULL,
    "accepted_chemistries" "BatteryType"[],
    "capacity_kg" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recyclers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_manifests" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "recycler_id" TEXT NOT NULL,
    "manifest_no" TEXT NOT NULL,
    "status" "ManifestStatus" NOT NULL DEFAULT 'draft',
    "item_ids" JSONB NOT NULL DEFAULT '[]',
    "total_weight_kg" DECIMAL(10,2),
    "dispatched_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_checklists" (
    "id" TEXT NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "items" JSONB NOT NULL DEFAULT '{}',
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "addresses_profile_id_idx" ON "addresses"("profile_id");

-- CreateIndex
CREATE INDEX "battery_items_pickup_id_idx" ON "battery_items"("pickup_id");

-- CreateIndex
CREATE INDEX "pricing_rates_category_is_active_idx" ON "pricing_rates"("category", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "payments_pickup_id_key" ON "payments"("pickup_id");

-- CreateIndex
CREATE INDEX "payments_vendor_id_idx" ON "payments"("vendor_id");

-- CreateIndex
CREATE INDEX "wallet_txns_profile_id_created_at_idx" ON "wallet_txns"("profile_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pickup_receipts_pickup_id_key" ON "pickup_receipts"("pickup_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_receipts_receipt_no_key" ON "pickup_receipts"("receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_receipts_public_token_key" ON "pickup_receipts"("public_token");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_pickup_id_key" ON "invoices"("pickup_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_vendor_id_idx" ON "invoices"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "recyclers_cpcb_reg_no_key" ON "recyclers"("cpcb_reg_no");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_manifests_manifest_no_key" ON "dispatch_manifests"("manifest_no");

-- CreateIndex
CREATE INDEX "dispatch_manifests_status_idx" ON "dispatch_manifests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "safety_checklists_pickup_id_key" ON "safety_checklists"("pickup_id");

-- CreateIndex
CREATE INDEX "pickups_agent_id_idx" ON "pickups"("agent_id");

-- CreateIndex
CREATE INDEX "profiles_role_idx" ON "profiles"("role");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_items" ADD CONSTRAINT "battery_items_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_txns" ADD CONSTRAINT "wallet_txns_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_receipts" ADD CONSTRAINT "pickup_receipts_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_manifests" ADD CONSTRAINT "dispatch_manifests_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_manifests" ADD CONSTRAINT "dispatch_manifests_recycler_id_fkey" FOREIGN KEY ("recycler_id") REFERENCES "recyclers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_checklists" ADD CONSTRAINT "safety_checklists_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
