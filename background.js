"use strict";

// What we've seen per tab. Kept only in memory: the background page is
// persistent under manifest v2, and storage.session wouldn't have outlived it
// anyway, being keyed on the extension instance. These URLs are browsing
// history, so there's every reason not to write them down.
const kexes = {};

// JWTs seen per tab, kept in memory only for the same reasons as kexes above.
// Keyed by tab id, each a Map from a token's identifier to its record, so the
// same token seen many times (every request resends its Authorization header)
// collapses to one entry that just accrues more sources.
const jwts = {};

// Request headers we're willing to look inside; matched case-insensitively.
// Deliberately a short allow-list rather than every header, to keep false
// positives down. Cookie headers are deliberately left out: scanCookies reads
// the jar directly, which gives real cookie names (a Cookie header only lists
// name=value pairs we'd have to re-parse) and also sees HttpOnly cookies.
const jwtRequestHeaders = new Set([
    "authorization",
    "proxy-authorization",
]);

function freshJwts(tid) {
    if (!jwts[tid])
        jwts[tid] = new Map();
    return jwts[tid];
}

// How many distinct locations to keep per token before we stop adding more.
// A chatty page can resend the same header on hundreds of requests; the popup
// shows a "5+" hint once this is reached, so there's no value in growing the
// list without bound.
const maxSources = 5;

// The origin of a URL, or the raw string if it doesn't parse. Cookies and web
// storage belong to an origin's jar/area rather than to any one request, so
// their locations are keyed and displayed by origin.
function originOf(url) {
    try {
        return new URL(url).origin;
    } catch (e) {
        return url || "";
    }
}

// A URL stripped to origin + pathname, dropping the query string. Header
// locations point at a Network entry, which is identified by its path; the
// query is not needed for that and a token can ride in a query parameter, so
// keeping it would store the very token we promise never to keep.
function pathOf(url) {
    try {
        const u = new URL(url);
        return u.origin + u.pathname;
    } catch (e) {
        return url || "";
    }
}

// Fold a found token into the tab's map, adding where it was seen to an
// existing record rather than listing the same token twice. Only the
// identifier, algorithm, bucket, and locations are kept -- never the token.
// A location carries enough to point the user at it in DevTools: the source
// kind, the header/cookie/storage name (where), and the request or page URL.
//
// Headers keep the request URL (minus its query, see pathOf): each request is
// a distinct, separately inspectable Network entry. But a cookie rides on
// every request to its domain, so keeping per-request URLs would list the same
// cookie dozens of times over -- once per URL -- even though the popup only
// ever shows its origin. So for cookies, storage, and the URL bar we reduce to
// the origin, which collapses those to one row per name per origin.
function recordJwt(tid, jwt, loc) {
    const map = freshJwts(tid);
    let rec = map.get(jwt.id);
    if (!rec) {
        rec = {
            id: jwt.id,
            alg: jwt.alg,
            bucket: jwt.bucket,
            sources: [],
            more: false,
        };
        map.set(jwt.id, rec);
    }
    if (loc.source === "req-header")
        loc = Object.assign({}, loc, { url: pathOf(loc.url) });
    else
        loc = Object.assign({}, loc, { url: originOf(loc.url) });
    const dup = rec.sources.some(s =>
        s.source === loc.source && s.where === loc.where && s.url === loc.url);
    if (dup)
        return;
    if (rec.sources.length >= maxSources) {
        rec.more = true;
        return;
    }
    rec.sources.push(loc);
}

// Read the tab's cookies straight from the cookie store and scan them. The
// Cookie header is only seen when the browser actually sends a request, so a
// page that's already loaded won't reveal its cookies to us again until it
// makes one. This lets the popup's Rescan pick them up on demand, and unlike
// document.cookie it also sees HttpOnly cookies -- which is where auth tokens
// usually live.
async function scanCookies(tid, url) {
    if (!url)
        return;
    let cookies;
    try {
        cookies = await browser.cookies.getAll({ url });
    } catch (e) {
        console.error("PQSpy: could not read cookies", e);
        return;
    }
    for (const c of cookies) {
        for (const jwt of PQSpyJWT.scan(c.value))
            recordJwt(tid, jwt, {
                source: "cookie",
                where: c.name,
                url,
            });
    }
}

// source is "req-header"; the token's location is the header it rode in.
function scanHeaders(tid, headers, allow, source, url, detail) {
    if (!headers) return;
    for (const h of headers) {
        if (!allow.has(h.name.toLowerCase()))
            continue;
        for (const jwt of PQSpyJWT.scan(h.value)) {
            recordJwt(tid, jwt, {
                source,
                where: h.name,
                url,
                detail,
            });
        }
    }
}

function summarize(data) {
    const pq = data.pq.length;
    const npq = data.nonpq.length;
    const unk = data.unknown.length;
    const tot = pq + npq + unk;

    // Cached responses are counted above too, so this really is nothing seen.
    if (tot == 0) {
        return ["unk", "No resources"];
    }

    // Nothing we recognised either way, so we can't claim it isn't
    // post-quantum. Has to come before the pq == 0 case below.
    if (pq == 0 && npq == 0) {
        return ["unk", "❓ unknown"];
    }

    if (pq == 0) {
        return ["no", "❌ not post-quantum encrypted"];
    }

    if (npq == 0 && unk == 0) {
        return ["yes", "⚛️  post-quantum encrypted"];
    }

    // Some of it is, so the icon becomes a pie chart of the proportions --
    // unless the page itself isn't, which the popup spells out.
    return [data.main === "nonpq" ? "no" : "warn",
            "⚠️  partially post-quantum encrypted (" + pq + "/" + tot + ")"];
}

// Names come from getKeaGroupName() in nsNSSCallbacks.cpp; which of them
// Firefox offers is set by namedGroups in nsNSSIOLayer.cpp.
function classifyKex(kex) {
    switch (kex) {
        case "mlkem768x25519":
        case "mlkem1024":
        case "xyber768d00":
        case "secp256r1mlkem768":
        case "secp384r1mlkem1024":
            return "pq";
        case "x25519":
        case "P256":
        case "P384":
        case "P521":
        case "FF 2048":
        case "FF 3072":
        case "custom":
            return "nonpq";
        default:
            return "unknown";
    }
}

// JWT algorithm classification lives in jwt.js (PQSpyJWT.classifySig), shared
// with the content script.

// Order the wedges are drawn in, clockwise from twelve o'clock. Muted, so
// they don't drown out the atom drawn on top of them.
const wedges = [
    ["pq", "#a848be"],
    ["unknown", "#c7c7c7"],
    ["nonpq", "#f7d7d7"],
];

// The fully post-quantum icon is a white atom on purple. This keeps both, and
// pales the share that isn't post-quantum to pink. The atom and the icon's
// edge are then each drawn twice: in their plain colours, and again in yellow
// clipped to the post-quantum wedge. So both fade out along with the
// protection, and at 16px the edge shows the ratio even when the wedge itself
// is too thin to make out, there being more of it to see.
//
// Yellow on purple is legible (3.5:1) where it matters; white on pink is
// barely there (1.3:1), which is the intent rather than a problem.
const atomColour = "#ffffff";
const borderColour = "#e8352f";
const pqColour = "#fdda4f";
const borderWidth = 0.055;

// A wedge much narrower than this can't be made out at 16px, so every
// category present gets at least this share of the circle and the remainder
// is divided proportionally. Keeps one non-PQ resource among hundreds
// visible, at the cost of the pie not being to scale; the popup has the
// exact counts.
const minWedge = 0.125;

// Corner radius of the tile in icons/*.png, as a fraction of its width.
const cornerRadius = 21 / 114;

// The atom of icons/*.png, which are the ⚛️ emoji: they have it composited
// over a gradient, so it can't be lifted back out of them cleanly. Drawn to
// the proportions measured off the emoji -- upright orbit first, small
// nucleus -- but it is an approximation, not the same glyph.
function atom(ctx, size, colour) {
    const c = size / 2;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = size * 0.055;

    for (const turn of [90, 150, 210]) {
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(turn * Math.PI / 180);
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.4, size * 0.16, 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(c, c, size * 0.028, 0, 2 * Math.PI);
    ctx.fill();
}

// Stroked at twice the width we want: the rounded square is still clipping, so
// the half of the line falling outside it is dropped and what remains sits
// flush against the edge, corners included.
function border(ctx, size, colour) {
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * cornerRadius);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2 * size * borderWidth;
    ctx.stroke();
}

function pie(size, data) {
    const present = wedges.filter(([bucket]) => data[bucket].length);
    const total = present.reduce((n, [bucket]) => n + data[bucket].length, 0);
    const rest = 1 - present.length * minWedge;

    const ctx = new OffscreenCanvas(size, size).getContext("2d");
    const c = size / 2;
    let from = -Math.PI / 2;

    // Same rounded square as the PNG icons.
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * cornerRadius);
    ctx.clip();

    // Where the post-quantum wedge ends, to clip the yellow atom to it. It's
    // first in wedges and the pie is only drawn when there is some, so it
    // always starts at twelve o'clock.
    let pqTo = -Math.PI / 2;

    present.forEach(([bucket, colour], i) => {
        // Close the circle exactly on the last wedge, rather than leave a
        // hairline gap where the fractions don't quite add up. The radius
        // reaches past the corners, since we're filling a square.
        const to = i == present.length - 1
            ? 1.5 * Math.PI
            : from + 2 * Math.PI *
              (minWedge + rest * data[bucket].length / total);
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, size, from, to);
        ctx.fillStyle = colour;
        ctx.fill();
        if (bucket === "pq")
            pqTo = to;
        from = to;
    });

    atom(ctx, size, atomColour);
    border(ctx, size, borderColour);

    // Both again in yellow, over the post-quantum wedge only.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, size, -Math.PI / 2, pqTo);
    ctx.clip();
    atom(ctx, size, pqColour);
    border(ctx, size, pqColour);
    ctx.restore();

    return ctx.getImageData(0, 0, size, size);
}

function iconKey(icon, data) {
    if (icon != "warn")
        return icon;
    // Quantised, so a ratio shift too small to see doesn't redraw the pie.
    const total = data.pq.length + data.nonpq.length + data.unknown.length;
    return "pie:" + wedges.map(([bucket]) =>
        Math.round(32 * data[bucket].length / total)).join(",");
}

// Pies already drawn, keyed by their quantised proportions. Drawing one per
// request would be wasteful, but skipping the setIcon call itself is not an
// option: Firefox drops a tab's icon back to the manifest default whenever it
// navigates, so it has to be set again even when the verdict hasn't changed.
const drawn = new Map();

function pieFor(data) {
    const key = iconKey("warn", data);
    let images = drawn.get(key);
    if (!images) {
        images = { 16: pie(16, data), 32: pie(32, data) };
        // Bounded by the quantisation, but no reason to let it creep.
        if (drawn.size > 64)
            drawn.clear();
        drawn.set(key, images);
    }
    return images;
}

function showIcon(tid, icon, data) {
    if (icon == "warn") {
        try {
            browser.browserAction.setIcon({
                tabId: tid,
                imageData: pieFor(data),
            });
            return;
        } catch (e) {
            console.error("PQSpy: could not draw the pie:", e);
        }
    }

    browser.browserAction.setIcon({
        tabId: tid,
        path: {
            114: "icons/" + icon + ".png",
        }
    });
}

async function record(details) {
    const tid = details.tabId;
    if (tid < 0) return;
    if (details.type === "beacon")
        return;

    const info = await browser.webRequest.getSecurityInfo(
      details.requestId,
      {},
    );
    if (details.type === "main_frame" || !kexes[tid])
        kexes[tid] = {
            summary: null,
            main: null,
            pq: [],
            nonpq: [],
            unknown: [],
        };
    let kex = info.keaGroupName;
    let tp;
    if (info.state === "insecure") {
        tp = "nonpq";
        kex = "no encryption";
    } else if (kex) {
        // Serialised into the cache entry along with the rest of the security
        // info, so a cached response says as much about the connection it
        // first arrived on as a fresh one does.
        tp = classifyKex(kex);
    } else {
        // No group to report: a resumed TLS session, for one. Encrypted, but
        // we can't say with what.
        tp = "unknown";
        kex = "unknown key exchange";
    }

    // Cached or not is a property of the response, not a bucket of its own:
    // it still counts towards the totals, and the popup splits the lists on
    // this flag so nothing gets listed twice.
    kexes[tid][tp].push([kex, details.type, details.url, details.fromCache]);

    if (details.type === "main_frame")
        kexes[tid].main = tp;

    const [icon, summary] = summarize(kexes[tid]);
    kexes[tid].summary = summary;

    showIcon(tid, icon, kexes[tid]);
}

// getSecurityInfo() returns undefined if the channel is no longer registered,
// and there are other ways this can throw. Left unhandled it's a silent
// rejection that leaves the tab on the icon it already had -- which for a
// fresh tab is the manifest's unk.png, indistinguishable from a real answer.
async function logKex(details) {
    try {
        await record(details);
    } catch (e) {
        console.error("PQSpy: could not check", details.url, e);
    }
}

browser.webRequest.onHeadersReceived.addListener(logKex,
  {urls: ["*://*/*"]},
  ["blocking"]
);

// Outgoing request headers carry the Authorization tokens. Read-only for our
// purposes, but the listener still has to be registered blocking to be handed
// requestHeaders.
browser.webRequest.onBeforeSendHeaders.addListener(function(details) {
    const tid = details.tabId;
    if (tid < 0 || details.type === "beacon")
        return;
    try {
        // A new top-level page is a new set of JWTs; reset before scanning
        // this request so the navigation's own Authorization header lands in
        // the fresh map rather than being wiped by a later reset. The content
        // script will re-report storage and URL tokens once it loads.
        if (details.type === "main_frame")
            jwts[tid] = new Map();
        scanHeaders(tid, details.requestHeaders, jwtRequestHeaders,
            "req-header", details.url, details.method);
    } catch (e) {
        console.error("PQSpy: could not scan request headers", e);
    }
  },
  {urls: ["*://*/*"]},
  ["blocking", "requestHeaders"]
);

browser.tabs.onRemoved.addListener(function(tid, info) {
    delete kexes[tid];
    delete jwts[tid];
});

// The icon set while the main frame's headers were in flight gets dropped
// again when the navigation commits. Usually a subresource comes along and
// sets it back, but a page that requests nothing else -- an image opened on
// its own, say -- would be left showing the default.
browser.tabs.onUpdated.addListener(function(tid, info, tab) {
    if (info.status !== "complete")
        return;
    // Read the cookie jar once the page has settled, so cookie JWTs show up
    // without waiting for the next request to resend the Cookie header.
    if (tab && tab.url)
        scanCookies(tid, tab.url);
    if (kexes[tid])
        showIcon(tid, summarize(kexes[tid])[0], kexes[tid]);
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "pqspy") {
    const data = kexes[message.tabId] || null;
    const list = jwts[message.tabId]
        ? [...jwts[message.tabId].values()]
        : [];
    // Widen the encryption response with the tab's JWTs so the popup only
    // makes one round-trip. kexes[] may be undefined for an unseen tab; the
    // popup already copes with that.
    sendResponse(Object.assign({ jwts: list }, data));
    return;
  }

  // Findings from the content script (web storage and the URL fragment),
  // already decoded there so tokens never cross the boundary. The sender's
  // tab is authoritative -- don't trust a tab id from the message.
  if (message.action === "jwt-report" && sender.tab) {
    for (const f of message.found || []) {
        if (f && f.id && f.alg)
            recordJwt(sender.tab.id,
                { id: f.id, alg: f.alg, bucket: f.bucket },
                { source: f.source, where: f.where, url: f.url });
    }
  }

  // The popup's Rescan asks us to re-read the tab's cookie jar, which the
  // content script can't reach. Answer once the scan is done so the popup
  // knows when to re-pull. This trusts message.tabId/message.url, so it must
  // only come from the popup: a page's content script has a sender.tab and
  // could otherwise steer cookie reads into another tab's map.
  if (message.action === "jwt-rescan-cookies" && !sender.tab) {
    scanCookies(message.tabId, message.url).then(() => sendResponse(true));
    return true;
  }
});
