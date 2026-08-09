-- Immutable Asset Identity
CREATE TABLE battery_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_aadhaar VARCHAR(100) UNIQUE NOT NULL,
    chemistry VARCHAR(20) NOT NULL
        CHECK (chemistry IN ('LFP', 'NMC622', 'NMC811', 'LCO')),

    manufacturer VARCHAR(100),
    model_number VARCHAR(100),

    nominal_capacity_kwh DECIMAL(8,2),
    nominal_voltage DECIMAL(8,2),

    manufacture_date DATE,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Battery Inspection 
CREATE TABLE battery_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pack_id UUID NOT NULL
        REFERENCES battery_packs(id)
        ON DELETE CASCADE,

    inspection_timestamp TIMESTAMP DEFAULT NOW(),

    inspector_id VARCHAR(50),

    visual_score INT CHECK (visual_score BETWEEN 0 AND 3),
    leakage_score INT CHECK (leakage_score BETWEEN 0 AND 3),
    thermal_score INT CHECK (thermal_score BETWEEN 0 AND 3),

    damage_score DECIMAL(4,2),

    soh_pct DECIMAL(5,2)
        CHECK (soh_pct BETWEEN 0 AND 100),

    soc_pct DECIMAL(5,2)
        CHECK (soc_pct BETWEEN 0 AND 100),

    entropy_value DECIMAL(8,4),

    entropy_anomalies_count INTEGER DEFAULT 0,

    ir_imbalance_ratio DECIMAL(6,3),

    voltage_imbalance_mv DECIMAL(6,1),

    temp_max_c DECIMAL(5,2),

    cycle_count INTEGER,

    rul_months INTEGER,

    notes TEXT
);
-- Raw battery diagnostics
CREATE TABLE battery_diagnostics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    inspection_id UUID NOT NULL
        REFERENCES battery_inspections(id)
        ON DELETE CASCADE,

    cell_data_snapshot JSONB,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE pathway_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_version VARCHAR(20) NOT NULL, --  'v2026-Q2'
    processing_rate_per_kg DECIMAL(10,2),
    refurb_labor_rate_per_kg DECIMAL(10,2),
    cell_replacement_rate DECIMAL(10,2), -- Cost per anomalous cell
    testing_rate_per_kg DECIMAL(10,2),
    hydromet_rate_per_kg DECIMAL(10,2),
    metal_prices JSONB, -- {"Li": 15000, "Co": 25000}
    chemistry_composition JSONB, -- {"NMC622": {"Li": 0.07, "Ni": 0.12}}
    is_active BOOLEAN DEFAULT TRUE,
    effective_from DATE,
    effective_to DATE
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE pathway_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pack_id UUID NOT NULL
        REFERENCES battery_packs(id),

    inspection_id UUID NOT NULL
        REFERENCES battery_inspections(id),

    factor_config_id UUID NOT NULL
        REFERENCES pathway_factors(id),

    pathway TEXT NOT NULL
        CHECK (pathway IN ('REUSE', 'REFURBISH', 'RECYCLE')),

    net_revenue DECIMAL(12,2),

    costs_total DECIMAL(12,2),

    p_min DECIMAL(12,2),
    p_recommended DECIMAL(12,2),
    p_max DECIMAL(12,2),

    confidence_score DECIMAL(4,3),

    decision_rationale TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);