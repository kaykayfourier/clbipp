/*
  Warnings:

  - The values [REVIEW] on the enum `ParseStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `metal_prices` on the `pathway_factors` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ParseStatus_new" AS ENUM ('EXTRACTED', 'VALIDATED', 'PENDING', 'UPLOADED', 'PROCESSING', 'PARSED', 'FAILED');
ALTER TABLE "public"."source_artifacts" ALTER COLUMN "parse_status" DROP DEFAULT;
ALTER TABLE "source_artifacts" ALTER COLUMN "parse_status" TYPE "ParseStatus_new" USING ("parse_status"::text::"ParseStatus_new");
ALTER TYPE "ParseStatus" RENAME TO "ParseStatus_old";
ALTER TYPE "ParseStatus_new" RENAME TO "ParseStatus";
DROP TYPE "public"."ParseStatus_old";
ALTER TABLE "source_artifacts" ALTER COLUMN "parse_status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "pathway_factors" DROP COLUMN "metal_prices";

-- CreateTable
CREATE TABLE "market_prices" (
    "id" TEXT NOT NULL,
    "Li_price" DECIMAL(65,30) NOT NULL,
    "Co_price" DECIMAL(65,30) NOT NULL,
    "Ni_price" DECIMAL(65,30) NOT NULL,
    "Mn_price" DECIMAL(65,30) NOT NULL,
    "Cu_price" DECIMAL(65,30) NOT NULL,
    "Al_price" DECIMAL(65,30) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_prices_pkey" PRIMARY KEY ("id")
);
