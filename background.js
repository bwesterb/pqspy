"use strict";

const kexes = [];

function summarize(data) {
    const pq = data.pq.length;
    const npq = data.nonpq.length;
    const unk = data.unknown.length;
    const tot = pq + npq + unk;
    const cached = data.cache.length;


    if (pq == 0 && npq == 0 && unk == 0) {
        if (cached > 0)
            return ["unk", "all from cache"];
        return ["unk", "No resources"];
    }

    if (pq > 0 && npq == 0 && unk == 0) {
        return ["yes", "⚛️  post-quantum encrypted"];
    }

    if (pq == 0) {
        return ["no", "❌ not post-quantum encrypted"];
    }

    if (pq > 0 && npq > 0) {
        return ["warn", "⚠️  partially post-quantum encrypted (" + pq + "/" + tot + ")"];
    }

    return ["unk", "❓ unknown"];
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

async function logKex(details) {
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
            pq: [],
            nonpq: [],
            unknown: [],
            cache: [],
        };
    let kex = info.keaGroupName;
    let tp;
    if (info.state === "insecure") {
        tp = "nonpq";
        kex = "no encryption";
    } else {
        tp = classify(kex);
    }
    if (details.fromCache)
        tp = "cache";
    kexes[tid][tp].push([kex, details.type, details.url]);

    const [icon, summary] = summarize(kexes[tid]);
    kexes[tid].summary = summary;

    browser.browserAction.setIcon({
        tabId: tid,
        path: {
            114: "icons/" + icon + ".png",
        }
    });
}

browser.webRequest.onHeadersReceived.addListener(logKex,
  {urls: ["*://*/*"]},
  ["blocking"]
);

browser.tabs.onRemoved.addListener(function(tid, info) {
    delete kexes[tid];
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "pqspy") {
    sendResponse(kexes[message.tabId]);
  }
});
