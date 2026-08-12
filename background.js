"use strict";

// What we've seen per tab. Kept only in memory: the background page is
// persistent under manifest v2, and storage.session wouldn't have outlived it
// anyway, being keyed on the extension instance. These URLs are browsing
// history, so there's every reason not to write them down.
const kexes = {};

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
function classify(kex) {
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
        // An https response without TLS info shouldn't happen: not from the
        // network, not from the cache, and not from a service worker.
        // It has been reported regardless, so add some debugging information
        // in the popup in this case, so a future bug report will be more
        // helpful.
        if (details.url.startsWith("https:")) {
            kex += " (cache=" + (details.fromCache ? 1 : 0)
                + " status=" + details.statusCode
                + (details.ip ? " ip=" + details.ip : " no-ip")
                + (details.proxyInfo && details.proxyInfo.type !== "direct"
                    ? " proxy=" + details.proxyInfo.type : "")
                + ")";
            console.warn("PQSpy: https response without TLS info:",
                details, info);
        }
    } else if (kex) {
        // Serialised into the cache entry along with the rest of the security
        // info, so a cached response says as much about the connection it
        // first arrived on as a fresh one does.
        tp = classify(kex);
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

browser.tabs.onRemoved.addListener(function(tid, info) {
    delete kexes[tid];
});

// The icon set while the main frame's headers were in flight gets dropped
// again when the navigation commits. Usually a subresource comes along and
// sets it back, but a page that requests nothing else -- an image opened on
// its own, say -- would be left showing the default.
browser.tabs.onUpdated.addListener(function(tid, info) {
    if (info.status !== "complete" || !kexes[tid])
        return;
    showIcon(tid, summarize(kexes[tid])[0], kexes[tid]);
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "pqspy") {
    sendResponse(kexes[message.tabId]);
  }
});
