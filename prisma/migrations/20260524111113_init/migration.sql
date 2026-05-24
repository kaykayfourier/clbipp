/*
  Warnings:

  - You are about to drop the column `nominal_capacity` on the `battery_packs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "battery_packs" DROP COLUMN "nominal_capacity",
ADD COLUMN     "nominal_capacity_kwh" DECIMAL(8,2);
