"use strict";

// Firefox exposes certificate metadata but not the algorithms inside the
// certificate. This reads only the two X.509 AlgorithmIdentifiers PQSpy needs.
const PQSpyCertificate = (function () {
    const experimentalMtcProof = "1.3.6.1.4.1.44363.47.0";
    const signatures = {
        "1.2.840.113549.1.1.2": ["RSA with MD2", "nonpq"],
        "1.2.840.113549.1.1.3": ["RSA with MD4", "nonpq"],
        "1.2.840.113549.1.1.4": ["RSA with MD5", "nonpq"],
        "1.2.840.113549.1.1.5": ["RSA with SHA-1", "nonpq"],
        "1.2.840.113549.1.1.10": ["RSA-PSS", "nonpq"],
        "1.2.840.113549.1.1.11": ["RSA with SHA-256", "nonpq"],
        "1.2.840.113549.1.1.12": ["RSA with SHA-384", "nonpq"],
        "1.2.840.113549.1.1.13": ["RSA with SHA-512", "nonpq"],
        "1.2.840.113549.1.1.14": ["RSA with SHA-224", "nonpq"],
        "1.2.840.113549.1.1.15": ["RSA with SHA-512/224", "nonpq"],
        "1.2.840.113549.1.1.16": ["RSA with SHA-512/256", "nonpq"],
        "1.2.840.10040.4.3": ["DSA with SHA-1", "nonpq"],
        "2.16.840.1.101.3.4.3.1": ["DSA with SHA-224", "nonpq"],
        "2.16.840.1.101.3.4.3.2": ["DSA with SHA-256", "nonpq"],
        "1.2.840.10045.4.1": ["ECDSA with SHA-1", "nonpq"],
        "1.2.840.10045.4.3.1": ["ECDSA with SHA-224", "nonpq"],
        "1.2.840.10045.4.3.2": ["ECDSA with SHA-256", "nonpq"],
        "1.2.840.10045.4.3.3": ["ECDSA with SHA-384", "nonpq"],
        "1.2.840.10045.4.3.4": ["ECDSA with SHA-512", "nonpq"],
        "1.3.101.112": ["Ed25519", "nonpq"],
        "1.3.101.113": ["Ed448", "nonpq"],
        "2.16.840.1.101.3.4.3.5": ["DSA with SHA3-224", "nonpq"],
        "2.16.840.1.101.3.4.3.6": ["DSA with SHA3-256", "nonpq"],
        "2.16.840.1.101.3.4.3.7": ["DSA with SHA3-384", "nonpq"],
        "2.16.840.1.101.3.4.3.8": ["DSA with SHA3-512", "nonpq"],
        "2.16.840.1.101.3.4.3.9": ["ECDSA with SHA3-224", "nonpq"],
        "2.16.840.1.101.3.4.3.10": ["ECDSA with SHA3-256", "nonpq"],
        "2.16.840.1.101.3.4.3.11": ["ECDSA with SHA3-384", "nonpq"],
        "2.16.840.1.101.3.4.3.12": ["ECDSA with SHA3-512", "nonpq"],
        "2.16.840.1.101.3.4.3.13": ["RSA with SHA3-224", "nonpq"],
        "2.16.840.1.101.3.4.3.14": ["RSA with SHA3-256", "nonpq"],
        "2.16.840.1.101.3.4.3.15": ["RSA with SHA3-384", "nonpq"],
        "2.16.840.1.101.3.4.3.16": ["RSA with SHA3-512", "nonpq"],
        "2.16.840.1.101.3.4.3.17": ["ML-DSA-44", "pq"],
        "2.16.840.1.101.3.4.3.18": ["ML-DSA-65", "pq"],
        "2.16.840.1.101.3.4.3.19": ["ML-DSA-87", "pq"],
    };
    const publicKeys = {
        "1.2.840.113549.1.1.1": ["RSA", "nonpq"],
        "1.2.840.113549.1.1.10": ["RSA-PSS", "nonpq"],
        "1.2.840.113549.1.3.1": ["Diffie-Hellman", "nonpq"],
        "1.2.840.10040.4.1": ["DSA", "nonpq"],
        "1.2.840.10046.2.1": ["Diffie-Hellman", "nonpq"],
        "1.3.14.7.2.1.1": ["Diffie-Hellman", "nonpq"],
        "1.2.840.10045.2.1": ["EC", "nonpq"],
        "1.3.101.110": ["X25519", "nonpq"],
        "1.3.101.111": ["X448", "nonpq"],
        "1.3.101.112": ["Ed25519", "nonpq"],
        "1.3.101.113": ["Ed448", "nonpq"],
        "2.16.840.1.101.3.4.3.17": ["ML-DSA-44", "pq"],
        "2.16.840.1.101.3.4.3.18": ["ML-DSA-65", "pq"],
        "2.16.840.1.101.3.4.3.19": ["ML-DSA-87", "pq"],
    };
    const slhDsa = [
        "SHA2-128s", "SHA2-128f", "SHA2-192s", "SHA2-192f",
        "SHA2-256s", "SHA2-256f", "SHAKE-128s", "SHAKE-128f",
        "SHAKE-192s", "SHAKE-192f", "SHAKE-256s", "SHAKE-256f",
    ];
    slhDsa.forEach((name, i) => {
        const oid = "2.16.840.1.101.3.4.3." + (20 + i);
        signatures[oid] = ["SLH-DSA-" + name, "pq"];
        publicKeys[oid] = ["SLH-DSA-" + name, "pq"];
    });

    function node(bytes, offset) {
        if (offset + 2 > bytes.length)
            throw new Error("truncated DER node");
        const tag = bytes[offset++];
        let length = bytes[offset++];
        if (length & 0x80) {
            const count = length & 0x7f;
            if (count === 0 || count > 4 || offset + count > bytes.length)
                throw new Error("invalid DER length");
            length = 0;
            for (let i = 0; i < count; i++)
                length = length * 256 + bytes[offset++];
        }
        const end = offset + length;
        if (end > bytes.length)
            throw new Error("truncated DER value");
        return { tag, start: offset, end, next: end };
    }

    function children(bytes, parent) {
        const out = [];
        let offset = parent.start;
        while (offset < parent.end) {
            const child = node(bytes, offset);
            if (child.end > parent.end)
                throw new Error("DER child exceeds its parent");
            out.push(child);
            offset = child.next;
        }
        return out;
    }

    function oid(bytes, value) {
        if (!value || value.tag !== 0x06 || value.start === value.end)
            throw new Error("missing algorithm OID");
        const parts = [];
        let part = 0;
        for (let i = value.start; i < value.end; i++) {
            part = part * 128 + (bytes[i] & 0x7f);
            if (!Number.isSafeInteger(part))
                throw new Error("oversized OID");
            if (!(bytes[i] & 0x80)) {
                parts.push(part);
                part = 0;
            }
        }
        if (bytes[value.end - 1] & 0x80)
            throw new Error("truncated OID");
        const first = Math.min(2, Math.floor(parts[0] / 40));
        return [first, parts[0] - first * 40].concat(parts.slice(1)).join(".");
    }

    function algorithmOid(bytes, algorithm) {
        return oid(bytes, children(bytes, algorithm)[0]);
    }

    function parse(rawDER) {
        try {
            const bytes = Uint8Array.from(rawDER || []);
            const certificate = node(bytes, 0);
            if (certificate.tag !== 0x30 || certificate.next !== bytes.length)
                throw new Error("invalid certificate sequence");
            const fields = children(bytes, certificate);
            if (fields.length !== 3)
                throw new Error("invalid certificate fields");
            const signatureOid = algorithmOid(bytes, fields[1]);
            const tbs = children(bytes, fields[0]);
            const first = tbs[0] && tbs[0].tag === 0xa0 ? 1 : 0;
            const tbsSignatureOid = algorithmOid(bytes, tbs[first + 1]);
            const spki = tbs[first + 5];
            if (!spki || spki.tag !== 0x30)
                throw new Error("missing public key info");
            const publicKeyOid = algorithmOid(bytes, children(bytes, spki)[0]);
            const publicKey = publicKeys[publicKeyOid];
            if (signatureOid === experimentalMtcProof
                && tbsSignatureOid === experimentalMtcProof)
                return {
                    signature: "Merkle Tree proof (experimental)",
                    bucket: "pq",
                    publicKey: publicKey ? publicKey[0] : publicKeyOid,
                    publicKeyBucket: publicKey ? publicKey[1] : "unknown",
                };
            const signature = signatures[signatureOid];
            return {
                signature: signature ? signature[0] : signatureOid,
                bucket: signature ? signature[1] : "unknown",
                publicKey: publicKey ? publicKey[0] : publicKeyOid,
                publicKeyBucket: publicKey ? publicKey[1] : "unknown",
            };
        } catch (e) {
            return {
                signature: "unknown",
                bucket: "unknown",
                publicKey: "unknown",
                publicKeyBucket: "unknown",
            };
        }
    }

    return { parse };
})();

if (typeof globalThis !== "undefined")
    globalThis.PQSpyCertificate = PQSpyCertificate;
