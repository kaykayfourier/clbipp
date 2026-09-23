import { describe, expect, it } from "vitest";
import {
  availabilityOf,
  formatKm,
  formatLocationAge,
  haversineKm,
  rankAgents,
  BUSY_JOBS_TODAY,
  LOCATION_STALE_MINUTES,
  type AgentSignals,
} from "./dispatch-ranking";

// FV8. The company's field-agent selection notes. The two ordering mistakes
// they name explicitly — closest-but-unavailable winning, and closest-but-
// overloaded winning — are the ones these tests exist to prevent.

const NOW = new Date("2026-09-23T12:00:00");
const TRAINED = new Date("2026-01-01T00:00:00");

// Roughly Saket and Nehru Place, ~4 km apart in reality.
const SAKET = { lat: 28.5245, lng: 77.2066 };
const NEHRU_PLACE = { lat: 28.5494, lng: 77.2501 };

function agent(over: Partial<AgentSignals> = {}): AgentSignals {
  return {
    agentId: "a1",
    fullName: "Agent One",
    zone: null,
    vehicle: null,
    safetyTrainedAt: TRAINED,
    liveJobs: 0,
    jobsOnTargetDay: 0,
    lastLocation: null,
    ...over,
  };
}

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(SAKET, SAKET)).toBeCloseTo(0);
  });

  it("gives a sane Delhi-scale distance", () => {
    const d = haversineKm(SAKET, NEHRU_PLACE);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(7);
  });

  it("is symmetric", () => {
    expect(haversineKm(SAKET, NEHRU_PLACE)).toBeCloseTo(haversineKm(NEHRU_PLACE, SAKET));
  });
});

describe("availabilityOf", () => {
  it("marks an untrained agent unavailable", () => {
    // Real in this codebase: requireSafetyChecklist gates every intake screen,
    // so an untrained agent cannot progress a job they are given.
    const r = availabilityOf(agent({ safetyTrainedAt: null }));
    expect(r.availability).toBe("unavailable");
    expect(r.reason).toBe("not_safety_trained");
  });

  it("marks a full day busy, not unavailable", () => {
    const r = availabilityOf(agent({ jobsOnTargetDay: BUSY_JOBS_TODAY }));
    expect(r.availability).toBe("busy");
    expect(r.reason).toBe("at_capacity");
  });

  it("flags one other job that day as a conflict, still assignable", () => {
    const r = availabilityOf(agent({ jobsOnTargetDay: 1 }));
    expect(r.availability).toBe("busy");
    expect(r.reason).toBe("schedule_conflict");
  });

  it("is available with a clear day", () => {
    const r = availabilityOf(agent({ jobsOnTargetDay: 0, liveJobs: 2 }));
    expect(r.availability).toBe("available");
    expect(r.reason).toBeNull();
  });
});

describe("rankAgents", () => {
  it("🔴 never puts an unavailable agent first, however close", () => {
    // The notes' first named failure: "Ahmed shouldn't automatically become
    // first because he's closest, because he's unavailable."
    const ranked = rankAgents(
      [
        agent({
          agentId: "near-unavailable",
          fullName: "Ramesh",
          safetyTrainedAt: null,
          lastLocation: { ...SAKET, at: NOW },
        }),
        agent({
          agentId: "far-available",
          fullName: "Ali",
          lastLocation: { ...NEHRU_PLACE, at: NOW },
        }),
      ],
      SAKET,
      NOW,
    );
    expect(ranked[0].agentId).toBe("far-available");
    expect(ranked[1].availability).toBe("unavailable");
  });

  it("🔴 never puts an overloaded agent first just for being close", () => {
    // The notes' second: "Khalid shouldn't necessarily become first just
    // because he's 1.2 km away—he already has four jobs today."
    const ranked = rankAgents(
      [
        agent({
          agentId: "near-busy",
          fullName: "Khalid",
          jobsOnTargetDay: 4,
          lastLocation: { ...SAKET, at: NOW },
        }),
        agent({
          agentId: "far-free",
          fullName: "Aamir",
          jobsOnTargetDay: 0,
          lastLocation: { ...NEHRU_PLACE, at: NOW },
        }),
      ],
      SAKET,
      NOW,
    );
    expect(ranked[0].agentId).toBe("far-free");
  });

  it("uses distance only as a tie-breaker within a band", () => {
    const ranked = rankAgents(
      [
        agent({ agentId: "far", fullName: "Far", lastLocation: { ...NEHRU_PLACE, at: NOW } }),
        agent({ agentId: "near", fullName: "Near", lastLocation: { ...SAKET, at: NOW } }),
      ],
      SAKET,
      NOW,
    );
    expect(ranked.map((r) => r.agentId)).toEqual(["near", "far"]);
  });

  it("prefers fewer jobs on the day before fewer total live jobs", () => {
    const ranked = rankAgents(
      [
        agent({ agentId: "busy-today", fullName: "A", jobsOnTargetDay: 2, liveJobs: 2 }),
        agent({ agentId: "free-today", fullName: "B", jobsOnTargetDay: 0, liveJobs: 9 }),
      ],
      null,
      NOW,
    );
    // Nine jobs spread over a fortnight beats two this afternoon.
    expect(ranked[0].agentId).toBe("free-today");
  });

  it("keeps a locationless agent assignable, ranked inside its own band", () => {
    const ranked = rankAgents(
      [
        agent({ agentId: "no-loc", fullName: "NoLoc", lastLocation: null }),
        agent({ agentId: "has-loc", fullName: "HasLoc", lastLocation: { ...NEHRU_PLACE, at: NOW } }),
      ],
      SAKET,
      NOW,
    );
    expect(ranked.map((r) => r.agentId)).toEqual(["has-loc", "no-loc"]);
    // Still available, still selectable — not demoted out of the band.
    expect(ranked[1].availability).toBe("available");
    expect(ranked[1].summary).toContain("location unknown");
  });

  it("marks a stale position stale and never hides its age", () => {
    const old = new Date(NOW.getTime() - (LOCATION_STALE_MINUTES + 20) * 60000);
    const [r] = rankAgents([agent({ lastLocation: { ...SAKET, at: old } })], SAKET, NOW);
    expect(r.locationStale).toBe(true);
    expect(r.locationAgeMinutes).toBeGreaterThan(LOCATION_STALE_MINUTES);
  });

  it("does not mark a fresh position stale", () => {
    const recent = new Date(NOW.getTime() - 6 * 60000);
    const [r] = rankAgents([agent({ lastLocation: { ...SAKET, at: recent } })], SAKET, NOW);
    expect(r.locationStale).toBe(false);
    expect(r.locationAgeMinutes).toBe(6);
  });

  it("separates today's jobs from total live jobs in the summary", () => {
    // The notes: "That's more useful than simply saying 4 live jobs."
    const [r] = rankAgents([agent({ jobsOnTargetDay: 1, liveJobs: 3 })], null, NOW);
    expect(r.summary).toContain("1 job that day");
    expect(r.summary).toContain("3 live jobs");
  });

  it("explains an unavailable agent instead of listing their workload", () => {
    const [r] = rankAgents([agent({ safetyTrainedAt: null, liveJobs: 2 })], null, NOW);
    expect(r.summary).toBe("No safety training on file");
  });

  it("handles a pickup with no coordinates at all", () => {
    const ranked = rankAgents([agent({ lastLocation: { ...SAKET, at: NOW } })], null, NOW);
    expect(ranked[0].distanceKm).toBeNull();
  });
});

describe("formatting", () => {
  it("uses metres under a kilometre", () => {
    expect(formatKm(0.42)).toBe("420 m");
    expect(formatKm(2.44)).toBe("2.4 km");
  });

  it("describes location age in human units", () => {
    expect(formatLocationAge(0)).toBe("just now");
    expect(formatLocationAge(6)).toBe("6 min ago");
    expect(formatLocationAge(120)).toBe("2 h ago");
  });
});
