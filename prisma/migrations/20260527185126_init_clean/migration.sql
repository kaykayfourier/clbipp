-- CreateEnum
CREATE TYPE "Chemistry" AS ENUM ('LFP', 'NMC622', 'NMC811', 'LCO');

-- CreateEnum
CREATE TYPE "Pathway" AS ENUM ('REUSE', 'REFURBISH', 'RECYCLE');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('PENDING', 'EXTRACTED', 'VALIDATED', 'REVIEW', 'FAILED');

-- CreateTable
CREATE TABLE "battery_packs" (
    "id" TEXT NOT NULL,
    "pack_aadhaar" TEXT NOT NULL,
    "weight_kg" DECIMAL(8,2),
    "chemistry" "Chemistry" NOT NULL,
    "manufacturer" TEXT,
    "model_number" TEXT,
    "nominal_capacity_kwh" DECIMAL(8,2),
    "nominal_voltage" DECIMAL(8,2),
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
    "damage_score" DECIMAL(4,2),
    "soh_pct" DECIMAL(5,2),
    "soc_pct" DECIMAL(5,2),
    "entropy_value" DECIMAL(8,4),
    "entropy_anomalies_count" INTEGER NOT NULL DEFAULT 0,
    "ir_imbalance_ratio" DECIMAL(6,3),
    "voltage_imbalance_mv" DECIMAL(6,1),
    "temp_max_c" DECIMAL(5,2),
    "cycle_count" INTEGER,
    "rul_months" INTEGER,
    "notes" TEXT,
    "extracted_inspection_id" TEXT,

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
    "age_cap" INTEGER,
    "cycle_cap" INTEGER,
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
    "cost_breakdown" JSONB,
    "revenue_breakdown" JSONB,
    "net_revenue" DECIMAL(12,2),
    "costs_total" DECIMAL(12,2),
    "p_min" DECIMAL(12,2),
    "p_recommended" DECIMAL(12,2),
    "p_max" DECIMAL(12,2),
    "confidence_score" DECIMAL(4,3),
    "decision_rationale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pathway_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_artifacts" (
    "id" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "upload_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mime_type" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "checksum_sha256" TEXT,
    "parse_status" "ParseStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_inspections" (
    "id" TEXT NOT NULL,
    "source_artifact_id" TEXT NOT NULL,
    "extracted_json" JSONB NOT NULL,
    "validation_errors" JSONB,
    "extraction_warnings" JSONB,
    "confidence_score" DOUBLE PRECISION,
    "is_validated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "battery_packs_pack_aadhaar_key" ON "battery_packs"("pack_aadhaar");

-- CreateIndex
CREATE UNIQUE INDEX "battery_inspections_extracted_inspection_id_key" ON "battery_inspections"("extracted_inspection_id");

-- CreateIndex
CREATE UNIQUE INDEX "extracted_inspections_source_artifact_id_key" ON "extracted_inspections"("source_artifact_id");

-- AddForeignKey
ALTER TABLE "battery_inspections" ADD CONSTRAINT "battery_inspections_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "battery_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_inspections" ADD CONSTRAINT "battery_inspections_extracted_inspection_id_fkey" FOREIGN KEY ("extracted_inspection_id") REFERENCES "extracted_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_diagnostics" ADD CONSTRAINT "battery_diagnostics_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "battery_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathway_decisions" ADD CONSTRAINT "pathway_decisions_factor_config_id_fkey" FOREIGN KEY ("factor_config_id") REFERENCES "pathway_factors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathway_decisions" ADD CONSTRAINT "pathway_decisions_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "battery_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathway_decisions" ADD CONSTRAINT "pathway_decisions_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "battery_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_inspections" ADD CONSTRAINT "extracted_inspections_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "source_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
