import { describe, expect, it } from "vitest";
import {
  isFutureCollection,
  offerState,
  parseCollectionDate,
  MAX_COLLECTION_DAYS_AHEAD,
  OFFER_VALIDITY_DAYS,
} from "./collection";

// FV3 · FD0. `offered` carries three sub-states and this is the only place that
// decides which one a pickup is in — these tests are what stop a fourth reader
// re-deriving it slightly differently, which is how the two-state version broke.

const NOW = new Date("2026-09-12T10:00:00");
const d = (iso: string) => new Date(iso);

describe("offerState", () => {
  it("is awaiting_vendor until the offer is accepted", () => {
    const t = offerState({
      offerCreatedAt: d("2026-09-10T09:00:00"),
      acceptedAt: null,
      collectionScheduledAt: null,
      now: NOW,
    });
    expect(t.state).toBe("awaiting_vendor");
  });

  it("is collect_now once accepted with no later date", () => {
    const t = offerState({
      offerCreatedAt: d("2026-09-10T09:00:00"),
      acceptedAt: d("2026-09-11T09:00:00"),
      collectionScheduledAt: null,
      now: NOW,
    });
    expect(t.state).toBe("collect_now");
  });

  it("is collection_scheduled once a date is set", () => {
    const t = offerState({
      offerCreatedAt: d("2026-09-10T09:00:00"),
      acceptedAt: d("2026-09-11T09:00:00"),
      collectionScheduledAt: d("2026-09-20T09:00:00"),
      now: NOW,
    });
    expect(t.state).toBe("collection_scheduled");
  });

  it("expires an undecided offer after the validity window", () => {
    const stale = offerState({
      offerCreatedAt: d("2026-09-01T09:00:00"), // 11 days before NOW
      acceptedAt: null,
      collectionScheduledAt: null,
      now: NOW,
    });
    expect(stale.expired).toBe(true);
    expect(stale.daysRemaining).toBeLessThan(0);
  });

  it("🔴 never expires an ACCEPTED offer, however old", () => {
    // The vendor agreed a price; we owe them that price. Re-pricing a load
    // somebody already said yes to is exactly what this feedback round removed
    // from the booking screen.
    const t = offerState({
      offerCreatedAt: d("2026-01-01T09:00:00"),
      acceptedAt: d("2026-01-02T09:00:00"),
      collectionScheduledAt: null,
      now: NOW,
    });
    expect(t.expired).toBe(false);
  });

  it("reports the expiry date and days remaining", () => {
    const t = offerState({
      offerCreatedAt: d("2026-09-10T10:00:00"),
      acceptedAt: null,
      collectionScheduledAt: null,
      now: NOW,
    });
    expect(t.daysRemaining).toBe(OFFER_VALIDITY_DAYS - 2);
    expect(t.expiresAt?.toISOString().slice(0, 10)).toBe("2026-09-17");
  });

  it("handles a pickup with no offer at all", () => {
    const t = offerState({
      offerCreatedAt: null,
      acceptedAt: null,
      collectionScheduledAt: null,
      now: NOW,
    });
    expect(t.state).toBe("awaiting_vendor");
    expect(t.expiresAt).toBeNull();
    expect(t.expired).toBe(false);
  });
});

describe("isFutureCollection", () => {
  it("compares calendar days, not elapsed hours", () => {
    // Monday 23:00; a collection booked for Tuesday 09:00 is 10 hours away but
    // is unambiguously a different day, and must not read as "today".
    const monday2300 = new Date("2026-09-14T23:00:00");
    const tuesday0900 = new Date("2026-09-15T09:00:00");
    expect(isFutureCollection(tuesday0900, monday2300)).toBe(true);
  });

  it("is false for today and for null", () => {
    expect(isFutureCollection(new Date("2026-09-12T18:00:00"), NOW)).toBe(false);
    expect(isFutureCollection(null, NOW)).toBe(false);
  });
});

describe("parseCollectionDate", () => {
  it("accepts a valid future date", () => {
    const r = parseCollectionDate("2026-09-20", NOW);
    expect(r.error).toBeNull();
    expect(r.value?.getFullYear()).toBe(2026);
    expect(r.value?.getMonth()).toBe(8);
    expect(r.value?.getDate()).toBe(20);
  });

  it("allows today — 'later in the round' is a real answer", () => {
    expect(parseCollectionDate("2026-09-12", NOW).error).toBeNull();
  });

  it("rejects a past date", () => {
    expect(parseCollectionDate("2026-09-11", NOW).error).toBe("past");
  });

  it("rejects a missing or malformed date", () => {
    expect(parseCollectionDate(null, NOW).error).toBe("missing");
    expect(parseCollectionDate("", NOW).error).toBe("missing");
    expect(parseCollectionDate("20/09/2026", NOW).error).toBe("unparseable");
  });

  it("rejects a date the Date constructor would silently roll forward", () => {
    // new Date(2026, 1, 31) is 3 March. Without the round-trip check this would
    // be accepted and the agent would see a date they never picked.
    expect(parseCollectionDate("2026-02-31", NOW).error).toBe("unparseable");
  });

  it("rejects a mis-typed year via the look-ahead rail", () => {
    expect(parseCollectionDate("2027-09-20", NOW).error).toBe("too_far");
    const ok = new Date(NOW.getTime() + (MAX_COLLECTION_DAYS_AHEAD - 1) * 86400000);
    const iso = `${ok.getFullYear()}-${String(ok.getMonth() + 1).padStart(2, "0")}-${String(ok.getDate()).padStart(2, "0")}`;
    expect(parseCollectionDate(iso, NOW).error).toBeNull();
  });
});
