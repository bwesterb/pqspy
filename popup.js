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
    data = data || { summary: "No resources", pq: [], nonpq: [], unknown: [],
                     cache: [] };

    document.querySelector("#summary").innerText = data.summary;

    fill("#pq", data.pq);
    fill("#not-pq", data.nonpq);
    fill("#unknown", data.unknown);
    fill("#cache", data.cache);
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
