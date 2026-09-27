import { describe, expect, it } from "vitest";

import {
    CODE_ALPHABET,
    checkChar,
    isValidCode,
    issueBatchNumber,
    makeCode,
    mintCode,
    parseCode,
} from "./tags";

describe("makeCode / checkChar", () => {
    it("builds the printed shape for both families", () => {
        expect(makeCode("tag", "DM0001")).toMatch(/^TG-DM0001[0-9A-Z]$/);
        expect(makeCode("container", "A001")).toMatch(/^BX-A001[0-9A-Z]$/);
    });

    it("🔴 pins the codes the seed restates (packages/database cannot import this)", () => {
        // reset-demo.ts carries its own copy of checkChar. If either copy changes,
        // these literals stop matching and the seeded tags stop validating.
        expect(makeCode("tag", "DM0001")).toBe("TG-DM0001V");
        expect(makeCode("tag", "DM0002")).toBe("TG-DM00026");
        expect(makeCode("tag", "DM0024")).toBe("TG-DM0024E");
        expect(makeCode("tag", "DM0048")).toBe("TG-DM0048C");
        expect(makeCode("container", "A001")).toBe("BX-A001W");
        expect(makeCode("container", "A004")).toBe("BX-A004H");
    });

    it("folds the prefix in, so a box body never validates as a tag", () => {
        expect(checkChar("tag", "A0010")).not.toBe(checkChar("container", "A0010"));
    });

    it("throws on a character outside the alphabet", () => {
        expect(() => checkChar("tag", "ABCDEU")).toThrow();
    });
});

describe("parseCode", () => {
    const good = makeCode("tag", "4KX9PQ");

    it("accepts the canonical code", () => {
        expect(parseCode(good)).toEqual({ ok: true, kind: "tag", code: good });
    });

    it("accepts lower case, no dash and surrounding whitespace", () => {
        const loose = `  ${good.replace("-", "").toLowerCase()} `;
        expect(parseCode(loose)).toEqual({ ok: true, kind: "tag", code: good });
    });

    it("finds a code inside a longer scanned string", () => {
        const r = parseCode(`https://example.test/lookup/${good}`);
        expect(r.ok && r.code).toBe(good);
    });

    it("forgives the Crockford look-alikes O and I/L when typed", () => {
        const code = makeCode("tag", "0110K2");
        const typed = code.replace("0110", "OIlO".toUpperCase());
        expect(parseCode(typed)).toEqual({ ok: true, kind: "tag", code });
    });

    it("🔴 rejects EVERY single-character substitution", () => {
        const body = good.slice(3);
        for (let pos = 0; pos < body.length; pos += 1) {
            for (const ch of CODE_ALPHABET) {
                if (ch === body[pos]) continue;
                const mutated = `TG-${body.slice(0, pos)}${ch}${body.slice(pos + 1)}`;
                const r = parseCode(mutated);
                expect(r.ok, `${mutated} should not validate`).toBe(false);
            }
        }
    });

    it("rejects a wrong length with a count the person can act on", () => {
        const r = parseCode("TG-4KX9P");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/7 characters/);
    });

    it("rejects the letter U outright", () => {
        const r = parseCode("TG-4KX9PU7");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/letter U/);
    });

    it("rejects something that is not a CLBIPP code at all", () => {
        const r = parseCode("PKP-2026-000101");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/TG-/);
    });

    it("recognises a box code as a box", () => {
        const box = makeCode("container", "7M2Q");
        expect(parseCode(box)).toEqual({ ok: true, kind: "container", code: box });
    });
});

describe("mintCode / isValidCode", () => {
    it("mints codes that validate, for both families", () => {
        for (let i = 0; i < 200; i += 1) {
            expect(isValidCode("tag", mintCode("tag"))).toBe(true);
            expect(isValidCode("container", mintCode("container"))).toBe(true);
        }
    });

    it("is deterministic with an injected source", () => {
        const zero = () => 0;
        expect(mintCode("tag", zero)).toBe(makeCode("tag", "000000"));
    });

    it("isValidCode is strict about kind and canonical form", () => {
        const tag = makeCode("tag", "4KX9PQ");
        expect(isValidCode("container", tag)).toBe(false);
        expect(isValidCode("tag", tag.toLowerCase())).toBe(false);
    });
});

describe("issueBatchNumber", () => {
    it("dates the batch and suffixes it", () => {
        const n = issueBatchNumber(new Date(2026, 8, 27), () => 1);
        expect(n).toBe("ISS-20260927-1111");
    });
});
