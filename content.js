"use strict";

// Runs in the page to reach the two places the background can't see: web
// storage and the URL fragment (the part after #, which is never sent to the
// server). Tokens are decoded here via the shared jwt.js and only their
// identifier, algorithm, size, and location are sent on -- the token itself
// never leaves the page.
(function () {
    function report(found) {
        if (!found.length)
            return Promise.resolve();
        // Returned so callers can await the report reaching the background.
        // The background's jwt-report handler is synchronous, so once this
        // resolves the findings are recorded.
        return browser.runtime.sendMessage({ action: "jwt-report", found })
            .catch(() => {
                // Background may be momentarily unavailable; nothing to do.
            });
    }

    function fromStorage(store, source, found) {
        let n;
        try {
            n = store.length;
        } catch (e) {
            // Storage can be blocked (e.g. by cookie policy); skip quietly.
            return;
        }
        for (let i = 0; i < n; i++) {
            const key = store.key(i);
            let value;
            try {
                value = store.getItem(key);
            } catch (e) {
                continue;
            }
            // The key itself occasionally holds the token, so scan both.
            for (const jwt of PQSpyJWT.scan(key + " " + value))
                found.push({ id: jwt.id, alg: jwt.alg, bucket: jwt.bucket,
                             size: jwt.size,
                             source, where: key, url: location.href });
        }
    }

    function fromUrl(found) {
        // Split query and fragment so the popup can say which one, and so the
        // fragment (never sent to the server, so only visible here) is called
        // out as such. location.search / location.hash keep the leading ? / #.
        const parts = [
            ["query", location.search],
            ["fragment", location.hash],
        ];
        for (const [where, text] of parts)
            for (const jwt of PQSpyJWT.scan(text))
                found.push({ id: jwt.id, alg: jwt.alg, bucket: jwt.bucket,
                             size: jwt.size,
                             source: "url", where, url: location.href });
    }

    function scan() {
        const found = [];
        try { fromStorage(localStorage, "localStorage", found); } catch (e) {}
        try { fromStorage(sessionStorage, "sessionStorage", found); } catch (e) {}
        fromUrl(found);
        return report(found);
    }

    scan();

    // Returning the scan's promise makes tabs.sendMessage in the popup resolve
    // only once the report has reached the background, so the popup can pull
    // fresh data without racing the report.
    browser.runtime.onMessage.addListener((message) => {
        if (message && message.action === "jwt-rescan")
            return scan();
    });
})();
