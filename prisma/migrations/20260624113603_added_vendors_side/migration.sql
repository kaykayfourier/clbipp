/*
  Warnings:

  - You are about to drop the column `extracted_inspection_id` on the `battery_inspections` table. All the data in the column will be lost.
  - You are about to drop the `extracted_inspections` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `source_artifacts` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('individual', 'fleet');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('pending', 'submitted', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('requested', 'scheduled', 'collected', 'tested', 'processed', 'recovered', 'certified', 'cancelled');

-- CreateEnum
CREATE TYPE "BatteryType" AS ENUM ('li_ion_nmc', 'li_ion_lfp', 'li_ion_nca', 'lead_acid', 'nimh', 'other');

-- CreateEnum
CREATE TYPE "RecoveryPathway" AS ENUM ('recycle', 'refurbish', 'reuse', 'dispose');

-- DropForeignKey
ALTER TABLE "battery_inspections" DROP CONSTRAINT "battery_inspections_extracted_inspection_id_fkey";

-- DropForeignKey
ALTER TABLE "extracted_inspections" DROP CONSTRAINT "extracted_inspections_source_artifact_id_fkey";

-- DropIndex
DROP INDEX "battery_inspections_extracted_inspection_id_key";

-- AlterTable
ALTER TABLE "battery_inspections" DROP COLUMN "extracted_inspection_id";

-- DropTable
DROP TABLE "extracted_inspections";

-- DropTable
DROP TABLE "source_artifacts";

-- DropEnum
DROP TYPE "ParseStatus";

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "vendor_type" "VendorType" NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company_name" TEXT,
    "gst_number" TEXT,
    "pan_number" TEXT,
    "business_address" TEXT,
    "epr_reg_id" TEXT,
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'pending',
    "kyc_doc_urls" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickups" (
    "id" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "battery_type" "BatteryType" NOT NULL,
    "approx_quantity" TEXT NOT NULL,
    "approx_weight_kg" DECIMAL(65,30),
    "location" TEXT NOT NULL,
    "preferred_date" DATE,
    "notes" TEXT,
    "photo_urls" TEXT[],
    "status" "PickupStatus" NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_events" (
    "id" BIGSERIAL NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "status" "PickupStatus" NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT,
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" BIGSERIAL NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "pathway" "RecoveryPathway" NOT NULL,
    "estimated_price" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "material_breakdown" JSONB NOT NULL DEFAULT '[]',
    "deductions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" BIGSERIAL NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "pdf_url" TEXT NOT NULL,
    "public_token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "total_weight_kg" DECIMAL(65,30) NOT NULL,
    "material_summary" JSONB NOT NULL DEFAULT '[]',
    "certified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pickups_vendor_id_idx" ON "pickups"("vendor_id");

-- CreateIndex
CREATE INDEX "pickups_status_idx" ON "pickups"("status");

-- CreateIndex
CREATE INDEX "pickups_created_at_idx" ON "pickups"("created_at" DESC);

-- CreateIndex
CREATE INDEX "status_events_pickup_id_idx" ON "status_events"("pickup_id");

-- CreateIndex
CREATE INDEX "status_events_occurred_at_idx" ON "status_events"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "offers_pickup_id_key" ON "offers"("pickup_id");

-- CreateIndex
CREATE INDEX "offers_vendor_id_idx" ON "offers"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_pickup_id_key" ON "certificates"("pickup_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_public_token_key" ON "certificates"("public_token");

-- CreateIndex
CREATE INDEX "certificates_vendor_id_idx" ON "certificates"("vendor_id");

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
