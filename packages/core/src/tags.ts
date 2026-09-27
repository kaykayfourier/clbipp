// ─── Battery tags and transport-box codes (FV10–FV11 · FD12, FD14) ──────────
// The presentation feedback's §4: a tag on every battery (or lot) linked to its
// pickup, item and box, and a QR on every reusable transport box.
//
// Two code families, one scheme:
//
//     TG-4KX9PQ7   a battery tag      — "TG-" + 6 body + 1 check character
//     BX-7M2QK     a transport box    — "BX-" + 4 body + 1 check character
//
// 🔴 THE CHECK CHARACTER IS THE POINT. A code is printed as a QR, but the
// fallback everywhere is a person typing it off a sticker in a van or a
// warehouse — and a mistyped code that happened to exist would bind the wrong
// battery, silently, on a chain-of-custody record. With a check character a
// single wrong character is ALWAYS rejected (the weights are odd, so coprime to
// 32) and most adjacent swaps are too. The prefix is folded into the sum, so a
// box body can never validate as a tag.
//
// Crockford base-32 (no I, L, O, U): unambiguous on a sticker, and typing
// O/I/L by mistake is forgiven by normalisation rather than rejected.
//
// Pure: no Prisma, no I/O. Imported by the admin console (minting, hub
// check-in), the agent app (binding, scanning) and — restated, never imported —
// by packages/database's seed, which must not depend on this package.
// ⚠ Change the algorithm here and the seed's copy must change with it; the
// pinned codes in tags.test.ts are what catch the drift.

export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type CodeKind = "tag" | "container";

export const CODE_PREFIX: Record<CodeKind, string> = { tag: "TG", container: "BX" };

/** Body characters, excluding the check character. */
export const CODE_BODY_LENGTH: Record<CodeKind, number> = { tag: 6, container: 4 };

/** Folded into the checksum so the two families can never collide. */
const CHECK_SALT: Record<CodeKind, number> = { tag: 7, container: 11 };

export const CODE_KIND_LABELS: Record<CodeKind, string> = {
    tag: "battery tag",
    container: "transport box",
};

function valueOf(ch: string): number {
    return CODE_ALPHABET.indexOf(ch);
}

/** The check character for a body. Throws on a character outside the alphabet —
 *  callers normalise first, so reaching here with one is a programming error. */
export function checkChar(kind: CodeKind, body: string): string {
    let sum = CHECK_SALT[kind];
    for (let i = 0; i < body.length; i += 1) {
        const v = valueOf(body[i]);
        if (v < 0) throw new Error(`"${body[i]}" is not a Crockford base-32 character`);
        sum += v * (2 * i + 1);
    }
    return CODE_ALPHABET[sum % 32];
}

/** Body → the full printed code. */
export function makeCode(kind: CodeKind, body: string): string {
    return `${CODE_PREFIX[kind]}-${body}${checkChar(kind, body)}`;
}

/** A uniformly random integer in [0, max). Uses the platform CSPRNG. */
function defaultRandomInt(max: number): number {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] % max;
}

/**
 * Mint a fresh code. Random rather than sequential: the space is 32⁶ ≈ 1.07bn
 * for tags, so collisions are rare and the unique index catches the rest — the
 * caller retries. `randomInt` is injectable for tests.
 */
export function mintCode(
    kind: CodeKind,
    randomInt: (max: number) => number = defaultRandomInt,
): string {
    let body = "";
    for (let i = 0; i < CODE_BODY_LENGTH[kind]; i += 1) {
        body += CODE_ALPHABET[randomInt(32)];
    }
    return makeCode(kind, body);
}

export type ParsedCode =
    | { ok: true; kind: CodeKind; code: string }
    | { ok: false; error: string };

/**
 * Whatever a scanner or a person produced → a canonical code, or a reason.
 *
 * Accepts the bare code, the code without its dash, lower case, surrounding
 * whitespace, and a code embedded in a longer string (a QR that decodes to a
 * URL or a sentence still yields its code). Forgives the Crockford look-alikes
 * O → 0 and I/L → 1 in the body. Rejects everything else with a message worded
 * for the person holding the sticker, not for a validator.
 */
export function parseCode(raw: string): ParsedCode {
    const s = String(raw ?? "").toUpperCase();
    const m = s.match(/(TG|BX)[\s-]*([0-9A-Z]{3,10})/);
    if (!m) {
        return {
            ok: false,
            error: "That is not a CLBIPP code. Battery tags start TG-, transport boxes start BX-.",
        };
    }

    const kind: CodeKind = m[1] === "TG" ? "tag" : "container";
    const expected = CODE_BODY_LENGTH[kind] + 1;
    const typed = m[2].replace(/O/g, "0").replace(/[IL]/g, "1");

    if (typed.length !== expected) {
        return {
            ok: false,
            error: `A ${CODE_KIND_LABELS[kind]} code has ${expected} characters after ${CODE_PREFIX[kind]}- — this one has ${typed.length}.`,
        };
    }
    if (/U/.test(typed)) {
        return { ok: false, error: "Codes never contain the letter U — check that character again." };
    }

    const body = typed.slice(0, -1);
    const check = typed.slice(-1);
    if (checkChar(kind, body) !== check) {
        return {
            ok: false,
            error: "That code does not check out — a character was misread or mistyped. Scan it again, or re-type it carefully.",
        };
    }

    return { ok: true, kind, code: `${CODE_PREFIX[kind]}-${typed}` };
}

/** True only for a canonical, valid code of this kind. */
export function isValidCode(kind: CodeKind, code: string): boolean {
    const parsed = parseCode(code);
    return parsed.ok && parsed.kind === kind && parsed.code === code;
}

// ─── Issuing sheets ──────────────────────────────────────────────────────────

/** One A4 sheet of 3 × 8 labels — the common 63.5 × 33.9 mm sticker stock. */
export const TAG_LABELS_PER_SHEET = 24;

/** Ten sheets. A larger run is a second click, not a bigger form. */
export const MAX_TAGS_PER_ISSUE = 240;

/** `ISS-YYYYMMDD-XXXX` — the batch a set of tags was printed in. */
export function issueBatchNumber(
    issuedAt: Date,
    randomInt: (max: number) => number = defaultRandomInt,
): string {
    const y = issuedAt.getFullYear();
    const m = String(issuedAt.getMonth() + 1).padStart(2, "0");
    const d = String(issuedAt.getDate()).padStart(2, "0");
    let suffix = "";
    for (let i = 0; i < 4; i += 1) suffix += CODE_ALPHABET[randomInt(32)];
    return `ISS-${y}${m}${d}-${suffix}`;
}

// ─── Reasons ─────────────────────────────────────────────────────────────────

/**
 * FD13 — how much an agent must say when a line leaves WITHOUT a tag. Shorter
 * than an admin override's floor on purpose: this is typed on a phone, in front
 * of a vendor, and "sheet ran out" (15) is a complete answer.
 */
export const MIN_UNTAGGED_REASON_CHARS = 8;
