-- CreateEnum
CREATE TYPE "Chemistry" AS ENUM ('LFP', 'NMC622', 'NMC811', 'LCO');

-- CreateEnum
CREATE TYPE "Pathway" AS ENUM ('REUSE', 'REFURBISH', 'RECYCLE');

-- CreateTable
CREATE TABLE "battery_packs" (
    "id" TEXT NOT NULL,
    "pack_aadhaar" TEXT NOT NULL,
    "chemistry" "Chemistry" NOT NULL,
    "manufacturer" TEXT,
    "model_number" TEXT,
    "nominal_capacity_kwh" DECIMAL(65,30),
    "nominal_voltage" DECIMAL(65,30),
    "manufacture_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battery_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battery_inspections" (
    "id" TEXT NOT NULL,
    "pack_id" TEXT NOT NULL,
    "inspection_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspector_id" TEXT,
    "visual_score" INTEGER,
    "leakage_score" INTEGER,
    "thermal_score" INTEGER,
    "damage_score" DECIMAL(65,30),
    "soh_pct" DECIMAL(65,30),
    "soc_pct" DECIMAL(65,30),
    "entropy_value" DECIMAL(65,30),
    "entropy_anomalies_count" INTEGER NOT NULL DEFAULT 0,
    "ir_imbalance_ratio" DECIMAL(65,30),
    "voltage_imbalance_mv" DECIMAL(65,30),
    "temp_max_c" DECIMAL(65,30),
    "cycle_count" INTEGER,
    "rul_months" INTEGER,
    "notes" TEXT,

    CONSTRAINT "battery_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battery_diagnostics" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "cell_data_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battery_diagnostics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathway_factors" (
    "id" TEXT NOT NULL,
    "config_version" TEXT NOT NULL,
    "processing_rate_per_kg" DECIMAL(65,30),
    "refurb_labor_rate_per_kg" DECIMAL(65,30),
    "cell_replacement_rate" DECIMAL(65,30),
    "testing_rate_per_kg" DECIMAL(65,30),
    "hydromet_rate_per_kg" DECIMAL(65,30),
    "metal_prices" JSONB,
    "chemistry_composition" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pathway_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathway_decisions" (
    "id" TEXT NOT NULL,
    "pack_id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "factor_config_id" TEXT NOT NULL,
    "pathway" "Pathway" NOT NULL,
    "net_revenue" DECIMAL(65,30),
    "costs_total" DECIMAL(65,30),
    "p_min" DECIMAL(65,30),
    "p_recommended" DECIMAL(65,30),
    "p_max" DECIMAL(65,30),
    "confidence_score" DECIMAL(65,30),
    "decision_rationale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pathway_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "battery_packs_pack_aadhaar_key" ON "battery_packs"("pack_aadhaar");

-- AddForeignKey
ALTER TABLE "battery_inspections" ADD CONSTRAINT "battery_inspections_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "battery_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_diagnostics" ADD CONSTRAINT "battery_diagnostics_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "battery_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathway_decisions" ADD CONSTRAINT "pathway_decisions_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "battery_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathway_decisions" ADD CONSTRAINT "pathway_decisions_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "battery_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathway_decisions" ADD CONSTRAINT "pathway_decisions_factor_config_id_fkey" FOREIGN KEY ("factor_config_id") REFERENCES "pathway_factors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
