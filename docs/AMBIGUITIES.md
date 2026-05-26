# Decision Engine — Open Ambiguities

Tracking list of every assumption baked into the engine that needs confirmation from either Entroview (BMS hardware output) or Zypp / the commercial team (business config). Each ambiguity is tagged in the source code as `AMBIGUITY: <code>` so you can `grep -r "AMBIGUITY:" src/` to surface them.

When real batteries arrive for testing, run through this list and update the engine defaults / contracts.

---

## A. Hardware / BMS input ambiguities

*Resolution source: **Entroview email**, plus the first batch of real BMS dumps once batteries arrive.*

### A1. RUL availability and reliability
**Field:** `remaining_useful_life_months`
**Question:** Does Entroview reliably output RUL? If present, is the value trustworthy enough to drive the Reuse revenue multiplier directly, or should we force the age/cycle fallback?
**Engine behaviour:** Auto-fallback to age × cycle discount when field is absent.
**To confirm:** Compare RUL values against age/cycle-derived estimates on first real batch. If they consistently disagree by >20%, force fallback.

### A2. SoH confidence band
**Fields:** `soh_confidence_low`, `soh_confidence_high`
**Question:** Does Entroview emit a confidence band, or only a point estimate?
**Engine behaviour:** RETEST_SOH flag raised when band > 0.10. If fields absent, no flag — engine quietly skips the check.
**To confirm:** Whether Entroview's output includes any confidence/uncertainty metric. If point-estimate only, this guard is dead code.

### A3. `entropy_anomalies_count` semantics
**Question:** Is this the count of anomaly **events**, or unique **cells** flagged as weak?
**Engine assumption:** Unique weak cells (used directly as `replacement_cost = count × cell_replacement_rate`).
**Impact if wrong:** 5 anomalies in 1 cell vs 5 different cells → wildly different refurb cost.
**To confirm:** Documentation from Entroview, or inspection of `entropy_anomalies_cell_ids` length vs count.

### A4. `cells_per_pack`
**Question:** Is this in the BMS output, or do we derive it from chemistry/pack design lookup?
**Engine behaviour:** Optional input; only used for `weak_cell_fraction` (informational, not yet used in math).
**To confirm:** Whether Entroview includes pack metadata, or if we maintain a lookup table keyed by chemistry × capacity.

### A5. IR imbalance units
**Field:** `ir_imbalance_ratio`, threshold `> 1.5`
**Question:** Ratio of max/min, max/mean, or stdev/mean? Spec doesn't specify.
**Impact if wrong:** Threshold becomes meaningless — could trigger on safe packs or miss dangerous ones.
**To confirm:** Entroview docs.

### A6. Temperature history scope
**Field:** `temperature_history_max_c`, threshold `> 55°C`
**Question:** Lifetime max, recent (last 30 days) max, or test-bench max?
**To confirm:** Entroview docs.

### A7. Voltage imbalance units
**Field:** `voltage_imbalance_mv`, threshold `> 150`
**Question:** Raw millivolts, or % of nominal? Different BMS vendors use different conventions.
**To confirm:** Entroview docs or first real data dump.

### A8. Chemistry naming
**Field:** `chemistry`
**Question:** Does Entroview emit `"NMC622"`, `"NMC"` (unspecified subtype), an enum code, or vendor-specific string?
**Engine behaviour:** Forces RECYCLE on `"unknown"`. Grey zone: `"NMC"` without subtype.
**To confirm:** Examine real output. May need a small adapter / mapping table at the input boundary.

---

## B. Business config ambiguities

*Resolution source: **Zypp / commercial team / ops team**.*

### B1. Cost composition mode
**Spec Open Q #1.** Engine supports both lump-sum and component-rate per cost field (admin picks per field). Default ships with **component** mode using the spec's worked-example rates.
**To confirm:** Which mode the admin UI defaults to.

### B2. Sourcing scope
**Spec Open Q #2.** Engine supports both internal and external via `inflow_type`. Internal produces no `pricing` band (returns recovered value + HOLD/PROCESS gate via `hurdle_rate`). External produces full price band.
**To confirm:** Whether v1 needs both or just one. Currently configured for both.

### B3. Vendor input defaults
**Spec Open Q #4.** Engine ships with placeholders from the spec's worked example:
- `second_life_rate_per_kWh` NMC622: ₹8,500
- `refurb_pack_rate_per_kWh` NMC622: ₹6,000
- `hydromet_rate_per_kg`: ₹60
- `refining_rate_pct`: 5%
**To confirm:** Who owns the canonical numbers — Operations or Commercial?

### B4. Chemistry composition tables
**Engine ships with:** NMC622 derived from spec's worked example (Li 7%, Co 5%, Ni 15%, Mn 5%, Cu 12%, Al 15%). All other chemistries (NMC811, LFP, LCO, NCA) use industry-typical placeholder values.
**To confirm:** Commercial / metallurgy team needs to bless the full table before production.

### B5. `flat_repackaging_fee` default
**Used in:** Reuse pathway cost.
**Engine ships with:** ₹0 (not given in spec).
**To confirm:** Real number from operations.

### B6. `cell_replacement_rate` default
**Used in:** Refurb pathway cost (`anomalies_count × rate`).
**Engine ships with:** ₹400/cell (from spec's worked example, but not stated as canonical).
**To confirm:** Commercial team.

### B7. `soh_restoration_delta` per chemistry
**Spec:** "default delta ≈ 15%, configurable per chemistry."
**Engine ships with:** 15% universal default.
**To confirm:** Whether per-chemistry table is needed before production (different chemistries may have different refurb recovery profiles).

### B8. `hurdle_rate` value
**Used in:** REVIEW flag trigger (`if winner.net_value < hurdle_rate`).
**Engine ships with:** ₹500.
**To confirm:** Real threshold from commercial / finance team.

### B9. Margin tier per-supplier overrides
**Spec Open Q #5.** Engine supports `supplier_margin_overrides` map (supplier_id → tier). Until the workflow exists in the admin UI, every external quote uses the standard 20% tier.
**To confirm:** Override workflow and authority.

---

## E. Edge-case ambiguities

*Resolution source: **First batches of real batteries**.*

### E1. Unknown chemistry on high-SoH packs
A 90% SoH pack with `chemistry = "unknown"` currently gets force-recycled. This may be revenue-destroying — a perfectly reusable pack whose chemistry wasn't recorded.
**Decision needed:** Force recycle (current), or HOLD for manual chemistry identification?

### E2. Negative net value on already-shipped external packs
HOLD doesn't really work if the supplier has already shipped (logistics costs sunk). Need an admin escalation path.

### E3. SoH at exact boundaries (50.0%, 75.0%)
Spec uses strict `>` and `≤`. 75.0% goes to the lower band (no Reuse). With sensor noise, a tiny grace zone may make sense.
**Decision needed:** Add ±0.5% grace zone, or keep strict?

### E4. Cycle count missing
**Engine behaviour:** Treats absent cycle_count as 0 (best case — Reuse stays eligible).
**Decision needed:** Best-case (current) or worst-case (cap-exceeded → drop Reuse)?

### E5. Distance defaults
If field agent skips distance input, do we use a per-supplier default? Per-region average? Currently engine treats absent `out_*` distances as 0.

### E6. FX rate sourcing
**Spec Open Q #7.** Engine receives `fx_rate_usd_inr` in market input. Need to confirm:
- Is FX locked at quote time?
- Does it float until purchase?
- What's quote validity (24/48/72 h)?

### E7. Market freshness on failure
Engine currently **fails closed** when market data is > 24h old (throws `StaleMarketDataError`).
**Decision needed:** Should we instead fail open with a warning flag? Failing closed means the platform stops quoting when LME has an outage.

---

## Tables we need from the team

These need to be populated as actual reference data (likely as a seeded DB table or static config file). Engine has placeholders shipped today — they're functional but must be replaced before production.

| Table | What's needed | Owner | Status |
|---|---|---|---|
| `chemistry_composition` | Full breakdown per chemistry (Li/Co/Ni/Mn/Cu/Al %) for NMC811, LFP, LCO, NCA | Commercial / metallurgy | Placeholder values shipped |
| `second_life_rate_per_kWh` | Per-chemistry rate (ESS resale market) | Commercial | Placeholder values shipped |
| `refurb_pack_rate_per_kWh` | Per-chemistry rate (refurb pack resale) | Commercial | Placeholder values shipped |
| `chemistry_mult` | Application-fit multiplier per chemistry | Commercial | Defaults to 1.0 |
| `soh_restoration_delta` | Per-chemistry refurb SoH lift | Operations / R&D | Universal 15% used |
| `supplier_margin_overrides` | Per-supplier tier mapping | Commercial | Empty map |
| `cells_per_pack` lookup | If not on BMS output, lookup by chemistry × capacity | Engineering | Optional input |
| Rate cards | `processing_rate_per_kg`, `qa_rate_per_kg` (per pathway), `refurb_labor_rate_per_kg`, `cell_replacement_rate`, `hydromet_rate_per_kg`, `refining_rate_pct`, `yield_loss_pct`, `overhead_rate_pct`, `logistics_rate_per_km`, `flat_repackaging_fee` | Operations / Finance | Worked-example values shipped |
| Eligibility caps | `cycle_cap`, `age_cap`, `hurdle_rate` | Operations / Finance | Placeholder values shipped |

---

## How to use this document

1. **As real BMS dumps arrive**: walk through section A. For each ambiguity, either confirm the engine's current assumption is correct, or update the relevant constant / threshold in `src/lib/decisionEngine/` and add a regression test.
2. **As commercial confirms numbers**: walk through section B. Replace the placeholder in `defaults.ts` and remove the `AMBIGUITY: Bx` comment.
3. **As test batteries flow through the system**: watch for the edge cases in section E. If any of them fire in the wild, the resolution becomes urgent.

Each `AMBIGUITY: <code>` comment in the codebase should be removed once that ambiguity has been confirmed.

---

*Last updated: engine v0.1.0 — initial scaffolding, awaiting Entroview + commercial team inputs.*
