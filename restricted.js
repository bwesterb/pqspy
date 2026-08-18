"use strict";

// Pages no extension is allowed to look at, and pages that never came off the
// network. Either way we see no requests and inject no content script, so we
// have nothing to report -- and must not report what the tab held before.
//
// Shared by the background page and the popup, as a plain script in both, so
// everything hangs off a single global.
const PQSpyRestricted = (function () {
    // The default value of extensions.webextensions.restrictedDomains, from
    // modules/libpref/init/all.js. On these hosts host permissions are refused
    // outright: no webRequest events, no content script, not even for
    // <all_urls>.
    //
    // Extensions can't read prefs, so this is a copy of the default rather
    // than the value in force; a user who has edited the pref sees the stock
    // "No resources" where it no longer applies, which is what they'd get
    // today anyway. Matched on the exact host, no subdomains, as Firefox does:
    // the pref is split into an AtomSet (ExtensionPolicyService::
    // UpdateRestrictedDomains) which WebExtensionPolicy::IsRestrictedURI then
    // asks for the URL's host.
    //
    // IsRestrictedURI also restricts whatever AddonManagerWebAPI::IsValidSite
    // accepts, but that's addons.mozilla.org (already here) plus the AMO
    // staging hosts, and those only when extensions.webapi.testing is set.
    const domains = new Set([
        "accounts-static.cdn.mozilla.net",
        "accounts.firefox.com",
        "addons.cdn.mozilla.net",
        "addons.mozilla.org",
        "api.accounts.firefox.com",
        "content.cdn.mozilla.net",
        "discovery.addons.mozilla.org",
        // Gone from the pref on mozilla-central, but still in it on the
        // esr115, esr128 and esr140 branches, so keep it for as long as
        // strict_min_version reaches back that far.
        "install.mozilla.org",
        "oauth.accounts.firefox.com",
        "profile.accounts.firefox.com",
        "support.mozilla.org",
        "sync.services.mozilla.com",
    ]);

    // Why we can't say anything about a URL, as a short line for the summary
    // and a sentence explaining it, or null if it's a page we can see. The
    // caller wants both the reason to show and the fact that the tab's stored
    // findings cannot be about this page.
    //
    // about:blank is deliberately not covered: it's the placeholder a tab
    // opened by window.open sits on while the real page loads, so treating it
    // as unobservable would throw away findings that have already arrived for
    // that page.
    function reason(url) {
        let u;
        try {
            u = new URL(url);
        } catch (e) {
            return null;
        }

        if (domains.has(u.hostname))
            return {
                summary: "\u26d4 not visible to extensions",
                detail: "Firefox refuses every extension access to " +
                    u.hostname + " (its " +
                    "extensions.webextensions.restrictedDomains preference), " +
                    "so PQSpy sees none of this page's connections.",
            };

        // Our listeners are registered for *://*/*, which is http and https
        // (and ws/wss, which no tab is ever on). Anything else -- about:,
        // file:, moz-extension:, view-source: -- we never hear about.
        if (u.protocol !== "http:" && u.protocol !== "https:"
            && url !== "about:blank")
            return {
                summary: "\u26d4 nothing to report",
                detail: "PQSpy only sees http and https pages, so there is " +
                    "nothing for it to report on this " + u.protocol +
                    " page.",
            };

        return null;
    }

    return { reason };
})();

// Make it reachable when loaded via importScripts/background too.
if (typeof globalThis !== "undefined")
    globalThis.PQSpyRestricted = PQSpyRestricted;
