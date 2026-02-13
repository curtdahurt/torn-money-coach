// ==UserScript==
// @name         Torn Money Coach PRO
// @version      6.0.0
// @description  Full Desktop Money Coach with CE tracking
// @match        https://www.torn.com/*
// @grant        none
// ==/UserScript==

(function () {
'use strict';

/* ==============================
   🔐 CONFIG
   ============================== */

const API_KEY = "PUT_YOUR_API_KEY_HERE";

/* ==============================
   🔐 EMBEDDED LICENSE
   ============================== */

const LICENSE_BLOB = "eyJ1c2VycyI6eyIxMjM0NTYiOnsidGllciI6InBybyIsImV4cGlyZXMiOiIyMDI2LTEyLTMxIn19LCJmYWN0aW9ucyI6e319";

function decodeLicense(blob) {
    try { return JSON.parse(atob(blob)); }
    catch { return { users:{}, factions:{} }; }
}

const LICENSE_DATA = decodeLicense(LICENSE_BLOB);

/* ==============================
   🎯 LICENSE CHECK
   ============================== */

function checkLicense(userId) {
    const today = new Date();
    const lic = LICENSE_DATA.users[userId];

    if (!lic) return { tier: "trial", active: false };

    if (new Date(lic.expires) < today)
        return { tier: "expired", active: false };

    return { tier: lic.tier, active: true, expires: lic.expires };
}

/* ==============================
   📊 CE FETCH
   ============================== */

async function fetchCrimeExp() {
    if (!API_KEY || API_KEY.includes("PUT")) return null;

    const res = await fetch(
        `https://api.torn.com/user/?selections=criminalrecord&key=${API_KEY}`
    );
    const data = await res.json();
    return data.criminalrecord?.total || 0;
}

/* ==============================
   💡 CRIME LOGIC
   ============================== */

function getCrimeFromCE(ce) {
    if (ce < 1000) return "Shoplift";
    if (ce < 5000) return "Warehouse Arson";
    return "Bank Heist";
}

/* ==============================
   🖥️ UI
   ============================== */

function buildUI(license, ce) {

    const panel = document.createElement("div");
    panel.style.cssText = `
        background:#111;
        color:#0f0;
        padding:10px;
        margin:10px;
        border-radius:6px;
        font-size:13px;
    `;

    const tierText = license.active
        ? `Tier: ${license.tier.toUpperCase()} (Expires ${license.expires})`
        : `Tier: TRIAL`;

    panel.innerHTML = `
        <b>💰 Money Coach PRO</b><br>
        ${tierText}<br><br>
        Crime Experience: ${ce ?? "N/A"}<br>
        Recommended Crime:<br>
        <b>${ce !== null ? getCrimeFromCE(ce) : "API Required"}</b>
    `;

    document.body.prepend(panel);
}

/* ==============================
   🚀 INIT
   ============================== */

async function init() {

    const userId =
        document.querySelector("body")?.dataset?.uid ||
        prompt("Enter your Torn User ID:");

    const license = checkLicense(userId);
    const ce = await fetchCrimeExp();

    buildUI(license, ce);
}

init();

})();