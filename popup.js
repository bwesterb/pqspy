"use strict";

function fill(sel, entries) {
    document.querySelector(sel + " .counter").innerText = entries.length;
    if (entries.length == 0) {
        document.querySelector(sel).classList.add("hidden");
    } else {
        document.querySelector(sel).classList.remove("hidden");
    }
    let ul = document.querySelector(sel + " ul");
    ul.innerHTML = "";
    for (let entry of entries) {
        let li = document.createElement("li");
        let stype = document.createElement("span");
        stype.innerText = entry[1];
        stype.classList.add("type");
        let surl = document.createElement("span");
        surl.classList.add("url");
        surl.innerText = entry[2];
        let skex = document.createElement("span");
        skex.classList.add("kex");
        skex.innerText = entry[0];
        li.append(stype);
        li.appendChild(document.createTextNode(" using "));
        li.appendChild(skex);
        li.appendChild(document.createElement("br"));
        li.appendChild(surl);
        ul.appendChild(li);
    }
}

function update(data, tabId) {
    // Undefined for tabs the background script hasn't seen requests for,
    // for instance after it was restarted.
    data = data || { summary: "No resources", pq: [], nonpq: [], unknown: [] };

    document.querySelector("#summary").innerText = data.summary;

    // Cached responses count towards the same totals, but get their own list
    // so that nothing shows up under two headings at once.
    const fresh = entries => entries.filter(e => !e[3]);
    const cached = entries => entries.filter(e => e[3]);

    fill("#pq", fresh(data.pq));
    fill("#pq-cached", cached(data.pq));
    fill("#not-pq", fresh(data.nonpq));
    fill("#not-pq-cached", cached(data.nonpq));
    fill("#unknown", fresh(data.unknown));
    fill("#unknown-cached", cached(data.unknown));
}

async function pull() {
    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });
    const tid = tabs[0].id;
    update(await browser.runtime.sendMessage({
        action: "pqspy",
        tabId: tid,
    }), tid);
}

pull();
