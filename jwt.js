"use strict";

// Shared by the background page and the content script. Loaded as a plain
// script in both, so everything here hangs off a single global to avoid
// leaking names into the page the content script runs in.
const PQSpyJWT = (function () {
    // The header of every JWT is base64url("{"...), which always begins
    // "eyJ". Three dot-separated base64url segments; the signature (third)
    // may be empty for unsigned tokens. Kept deliberately loose -- decode()
    // is the real filter, this only finds candidates to hand it.
    const CANDIDATE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

    // Names as they appear in a JWT header's "alg". These match the JOSE
    // registry, which is also what Firefox reports, so no translation needed.
    function classifySig(alg) {
        switch (alg) {
            case "ML-DSA-44":
            case "ML-DSA-65":
            case "ML-DSA-87":
            case "HS256":
            case "HS384":
            case "HS512":
                return "pq";
            case "RS256":
            case "RS384":
            case "RS512":
            case "ES256":
            case "ES384":
            case "ES512":
            case "PS256":
            case "PS384":
            case "PS512":
            case "EdDSA":
            case "Ed25519":
            case "Ed448":
                return "nonpq";
            default:
                return "unknown";
        }
    }

    // base64url -> string, tolerant of missing padding. Returns null on
    // anything that doesn't decode, so callers can treat it as "not a JWT".
    function b64urlToString(seg) {
        try {
            let b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
            while (b64.length % 4)
                b64 += "=";
            return atob(b64);
        } catch (e) {
            return null;
        }
    }

    // A short, stable identifier so the popup can tell tokens apart and we can
    // de-duplicate, without ever keeping the token itself. Uses the tail of
    // the signature, which is high-entropy and reveals nothing decodable. An
    // unsigned token (empty signature) has none, so fall back to the payload
    // tail there.
    function identify(token) {
        const parts = token.split(".");
        const sig = parts[2] || "";
        const src = sig.length >= 4 ? sig : (parts[1] || "");
        return src.slice(-8) || "unknown";
    }

    // Decode a single candidate into { id, alg, bucket }, or null if it isn't
    // actually a JWT. Requires a parseable header object carrying an "alg":
    // that's what rules out random "eyJ..."-looking strings.
    function decode(token) {
        const parts = token.split(".");
        if (parts.length < 2)
            return null;
        const headerJson = b64urlToString(parts[0]);
        if (headerJson === null)
            return null;
        let header;
        try {
            header = JSON.parse(headerJson);
        } catch (e) {
            return null;
        }
        if (!header || typeof header !== "object" || !("alg" in header))
            return null;
        // A five-segment JWE also starts with three base64url segments, so
        // CANDIDATE matches its first three and the header parses -- but its
        // "alg" names a key-management scheme, not a signature. The "enc"
        // member is what marks it a JWE; skip those, we only classify the
        // signatures of signed JWTs (JWS).
        if ("enc" in header)
            return null;
        const alg = String(header.alg);
        return { id: identify(token), alg, bucket: classifySig(alg) };
    }

    // Pull every JWT out of an arbitrary string (a header value, cookie jar,
    // URL, or storage entry), decoded and de-duplicated by id.
    function scan(text) {
        const out = new Map();
        if (!text)
            return [];
        const matches = String(text).match(CANDIDATE);
        if (!matches)
            return [];
        for (const m of matches) {
            const jwt = decode(m);
            if (jwt && !out.has(jwt.id))
                out.set(jwt.id, jwt);
        }
        return [...out.values()];
    }

    return { classifySig, decode, identify, scan };
})();

// Make it reachable when loaded via importScripts/background too.
if (typeof globalThis !== "undefined")
    globalThis.PQSpyJWT = PQSpyJWT;
