/*
  Warnings:

  - You are about to alter the column `damage_score` on the `battery_inspections` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(4,2)`.
  - You are about to alter the column `soh_pct` on the `battery_inspections` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(5,2)`.
  - You are about to alter the column `soc_pct` on the `battery_inspections` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(5,2)`.
  - You are about to alter the column `entropy_value` on the `battery_inspections` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(8,4)`.
  - You are about to alter the column `ir_imbalance_ratio` on the `battery_inspections` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(6,3)`.
  - You are about to alter the column `voltage_imbalance_mv` on the `battery_inspections` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(6,1)`.
  - You are about to alter the column `temp_max_c` on the `battery_inspections` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(5,2)`.
  - You are about to drop the column `nominal_capacity_kwh` on the `battery_packs` table. All the data in the column will be lost.
  - You are about to alter the column `nominal_voltage` on the `battery_packs` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(8,2)`.
  - You are about to alter the column `net_revenue` on the `pathway_decisions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `costs_total` on the `pathway_decisions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `p_min` on the `pathway_decisions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `p_recommended` on the `pathway_decisions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `p_max` on the `pathway_decisions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `confidence_score` on the `pathway_decisions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(4,3)`.

*/
-- AlterTable
ALTER TABLE "battery_inspections" ALTER COLUMN "damage_score" SET DATA TYPE DECIMAL(4,2),
ALTER COLUMN "soh_pct" SET DATA TYPE DECIMAL(5,2),
ALTER COLUMN "soc_pct" SET DATA TYPE DECIMAL(5,2),
ALTER COLUMN "entropy_value" SET DATA TYPE DECIMAL(8,4),
ALTER COLUMN "ir_imbalance_ratio" SET DATA TYPE DECIMAL(6,3),
ALTER COLUMN "voltage_imbalance_mv" SET DATA TYPE DECIMAL(6,1),
ALTER COLUMN "temp_max_c" SET DATA TYPE DECIMAL(5,2);

-- AlterTable
ALTER TABLE "battery_packs" DROP COLUMN "nominal_capacity_kwh",
ADD COLUMN     "nominal_capacity" DECIMAL(8,2),
ALTER COLUMN "nominal_voltage" SET DATA TYPE DECIMAL(8,2);

-- AlterTable
ALTER TABLE "pathway_decisions" ALTER COLUMN "net_revenue" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "costs_total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "p_min" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "p_recommended" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "p_max" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "confidence_score" SET DATA TYPE DECIMAL(4,3);
