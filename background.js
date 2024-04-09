"use strict";

const kexes = [];

function summarize(data) {
    const pq = data[1].length;
    const npq = data[2].length;
    const unk = data[3].length;
    const tot = pq + npq + unk;

    if (pq == 0 && npq == 0 && unk == 0) {
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

function classify(kex) {
    switch (kex) {
        case "xyber768d00":
            return 0;
        case "x25519":
        case "P256":
        case "P384":
        case "P521":
            return 1;
        default:
            return 2;
    }
}

async function logKex(details) {
    const tid = details.tabId;
    if (tid < 0) return;
    const info = await browser.webRequest.getSecurityInfo(
      details.requestId,
      {},
    );
    if (details.type === "main_frame")
        kexes[tid] = [null, [],[],[]];
    else if (!kexes[tid])
        kexes[tid] = [null, [],[],[]];
    const kex = info.keaGroupName;
    const tp = classify(kex) + 1;
    kexes[tid][tp].push([kex, details.type, details.url]);

    const [icon, summary] = summarize(kexes[tid]);
    kexes[tid][0] = summary;

    browser.browserAction.setIcon({
        tabId: tid,
        path: {
            32: "icons/" + icon + ".png",
        }
    });
}

browser.webRequest.onHeadersReceived.addListener(logKex,
  {urls: ["https://*/*"]},
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
