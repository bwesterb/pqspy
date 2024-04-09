"use strict";

function fill(sel, entries) {
    if (entries.length == 0) {
        document.querySelector(sel).classList.add("hidden");
    } else {
        document.querySelector(sel).classList.remove("hidden");
    }
    let ul = document.querySelector(sel + " ul");
    ul.innerHTML = "";
    for (let entry of entries) {
        let li = document.createElement("li");
        li.innerText = entry[1] + " " + entry[2] + " (" + entry[0] + ")";
        ul.appendChild(li);
    }
}

function update(data, tabId) {
    document.querySelector("#summary").innerText = data.summary;
    console.info(data);
    
    fill("#pq", data.pq);
    fill("#not-pq", data.nonpq);
    fill("#unknown", data.unknown);
    fill("#cache", data.cache);
}

function pull() {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tid = tabs[0].id;
        browser.runtime.sendMessage({ action: "pqspy", tabId: tid }, response => {
            update(response, tid);
        });
    });
}

pull();
