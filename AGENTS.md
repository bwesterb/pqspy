# AGENTS.md

## Project

PQSpy is a Firefox-specific Manifest V2 extension written in plain JavaScript. Keep changes small and dependency-free unless a dependency is clearly necessary.

- `background.js`: request/security state and message handling
- `content.js`: page storage and URL scanning
- `jwt.js`: shared JWT detection and decoding
- `popup.html`, `popup.js`, `popup.css`: browser-action UI
- `restricted.js`: restricted-domain handling
- `manifest.json`: extension metadata, permissions, and version

## Development

- Install tooling with `npm ci`.
- Run `npm run lint` after changes.
- Run `npm run build` for packaging-related changes.
- There are no automated tests; run `npx web-ext run` to open a test Firefox for behavioral checks.

## Conventions

- Match the existing JavaScript style and browser API usage.
- Preserve script load order and the shared `PQSpyJWT` and `PQSpyRestricted` globals.
- Keep per-tab findings in memory and clear them on navigation, tab removal, and restricted pages to avoid stale state and unbounded growth. Never send or persist raw tokens; report metadata only.
- Minimize user impact: avoid polling and repeated work, and defer optional scans or rendering until the user views the relevant UI.
- Prioritize clear, immediate visibility over technical detail. Expose deeper details where convenient; add concise caveats when simplification could mislead without obscuring the main result.
- Keep unknown results distinct from non-PQ results; the main document determines the page verdict.
- AES-128 is post-quantum; Grover's algorithm is not a threat.
- Describe findings as connection encryption, not certificate or general page security.
- Avoid broadening extension permissions without explicit justification.
- Do not edit or commit `node_modules/` or generated `web-ext-artifacts/` files.
- Releases use bare version tags (for example, `0.1.8`) on `main`; the GitHub workflow verifies `manifest.json`'s version, lints, builds, signs through AMO, and creates the GitHub release.
