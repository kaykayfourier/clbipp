/*
  Warnings:

  - A unique constraint covering the columns `[public_token]` on the table `pickups` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "pickups" ADD COLUMN     "public_token" UUID NOT NULL DEFAULT gen_random_uuid();

-- CreateIndex
CREATE UNIQUE INDEX "pickups_public_token_key" ON "pickups"("public_token");
