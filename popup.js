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

// The origin part of a URL, for the Storage panel breadcrumbs which are keyed
// by origin. Falls back to the raw string if it doesn't parse.
function originOf(url) {
    try {
        return new URL(url).origin;
    } catch (e) {
        return url || "";
    }
}

// A location -> the DevTools trail we show pointing at where the token lives.
// We can't open DevTools from here -- no API for it -- so this is a pointer,
// not a jump.
function describe(s) {
    const origin = originOf(s.url);
    switch (s.source) {
        case "localStorage":
            return "Storage \u25b8 Local Storage \u25b8 " + origin +
                   " \u25b8 " + s.where;
        case "sessionStorage":
            return "Storage \u25b8 Session Storage \u25b8 " + origin +
                   " \u25b8 " + s.where;
        case "cookie":
            return "Storage \u25b8 Cookies \u25b8 " + origin +
                   " \u25b8 " + s.where;
        case "req-header":
            return "Network \u25b8 " + s.url +
                   " \u25b8 Request Headers \u25b8 " + s.where;
        case "url":
            return "URL \u25b8 " + s.where;
        default:
            return s.source + " \u25b8 " + s.where;
    }
}

// Render one bucket of JWTs. Mirrors fill() above, but the entries carry no
// token -- only the identifier, algorithm, and where each was seen.
function fillJwt(sel, entries) {
    document.querySelector(sel + " .counter").innerText = entries.length;
    document.querySelector(sel).classList.toggle("hidden", entries.length == 0);
    let ul = document.querySelector(sel + " ul");
    ul.innerHTML = "";
    for (let entry of entries) {
        let li = document.createElement("li");
        let salg = document.createElement("span");
        salg.classList.add("kex");
        salg.innerText = entry.alg;
        let sid = document.createElement("span");
        sid.classList.add("jwt-id");
        sid.innerText = "#" + entry.id;
        li.append(salg);
        li.appendChild(document.createTextNode(" "));
        li.append(sid);

        let locs = document.createElement("ul");
        locs.classList.add("jwt-locs");
        for (const s of entry.sources) {
            let lli = document.createElement("li");
            let scrumb = document.createElement("span");
            scrumb.classList.add("url");
            scrumb.innerText = describe(s);
            lli.append(scrumb);
            locs.appendChild(lli);
        }
        if (entry.more) {
            let lli = document.createElement("li");
            lli.classList.add("jwt-more");
            lli.innerText = "5+ more locations";
            locs.appendChild(lli);
        }
        li.append(locs);
        ul.appendChild(li);
    }
}

function updateJwts(list) {
    list = list || [];
    const pq = list.filter(j => j.bucket === "pq");
    const nonpq = list.filter(j => j.bucket === "nonpq");
    const unknown = list.filter(j => j.bucket === "unknown");

    const summary = list.length == 0
        ? "No JWTs seen"
        : list.length + (list.length == 1 ? " JWT seen" : " JWTs seen");
    document.querySelector("#jwt-summary").innerText = summary;

    fillJwt("#jwt-pq", pq);
    fillJwt("#jwt-not-pq", nonpq);
    fillJwt("#jwt-unknown", unknown);
}

function update(data, tabId) {
    // Undefined for tabs the background script hasn't seen requests for,
    // for instance after it was restarted. The encryption fields can also be
    // absent while JWTs are present -- a tab whose only finding came from the
    // content script -- so fill in defaults per field rather than wholesale.
    data = data || {};
    data = Object.assign({
        summary: "No resources",
        pq: [], nonpq: [], unknown: [],
        jwts: [],
    }, data);

    document.querySelector("#summary").innerText = data.summary;

    document.querySelector("#page").classList.toggle(
        "hidden", data.main !== "nonpq");

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

    updateJwts(data.jwts);
}

// Toggle which panel is shown. The verdict keeps updating in the background
// either way; only its visibility changes.
function setupTabs() {
    const tabs = document.querySelectorAll(".tab");
    for (const tab of tabs) {
        tab.addEventListener("click", () => {
            for (const other of tabs) {
                const on = other === tab;
                other.classList.toggle("active", on);
                other.setAttribute("aria-selected", on);
                document.getElementById(
                    other.getAttribute("aria-controls"))
                    .classList.toggle("hidden", !on);
            }
        });
    }
}

async function activeTabId() {
    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });
    return tabs[0].id;
}

async function pull() {
    const tid = await activeTabId();
    update(await browser.runtime.sendMessage({
        action: "pqspy",
        tabId: tid,
    }), tid);
}

// Ask the active tab's content script to re-read its storage and URL, and the
// background to re-read the tab's cookie jar (which the content script can't
// reach), then pull the refreshed data. Run on popup open so the JWT view is
// fresh without the user having to ask for it.
async function rescan() {
    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });
    const tid = tabs[0].id;

    // Cookies: handled in the background, which replies when done.
    const cookies = browser.runtime.sendMessage({
        action: "jwt-rescan-cookies",
        tabId: tid,
        url: tabs[0].url,
    }).catch(() => {});

    // Storage and URL: handled by the content script. Its listener
    // returns the report's promise, so awaiting sendMessage here waits
    // until the findings have reached the background (whose handler is
    // synchronous) -- no need to guess with a timer.
    try {
        await browser.tabs.sendMessage(tid, { action: "jwt-rescan" });
    } catch (e) {
        // No content script on this page (e.g. about: pages); nothing to
        // rescan there, just refresh from what the background has.
    }

    await cookies;
    await pull();
}

setupTabs();
// Paint immediately from what the background already has, then kick off a
// rescan whose own pull() lands a moment later with fresh storage/URL/cookies.
pull();
rescan();
