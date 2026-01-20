// ==UserScript==
// @name         Torn Money Coach PRO
// @namespace    https://torn.com/
// @version      5.0.0
// @description  Full Money Coach with licensing, newbie/trader modes, and auto-disable
// @author       Curtdahurt
// @match        https://www.torn.com/*
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @update     https://raw.githubusercontent.com/curtdahurt/torn-money-coach/3fb94d3e6c06a1cb82e8267366be17fdcf43faa1/money_coach.user.js
// @download   https://raw.githubusercontent.com/curtdahurt/torn-money-coach/3fb94d3e6c06a1cb82e8267366be17fdcf43faa1/money_coach.user.js
// ==/UserScript==

(() => {
    'use strict';

    /***********************
     * HARDENING (light)
     ***********************/
    if (window.__MC_PRO_LOADED__) return;
    Object.defineProperty(window, '__MC_PRO_LOADED__', {
        value: true,
        configurable: false,
        writable: false
    });

    /***********************
     * LICENSE CONFIG
     ***********************/
    const LICENSE_URL =
        'https://raw.githubusercontent.com/curtdahurt/torn-licenses/main/licenses.json';
    const CACHE_HOURS = 6;

    const TIER_PRIORITY = {
        trial: 0,
        newbie: 1,
        trader: 2,
        faction: 3
    };

    /***********************
     * UTIL
     ***********************/
    const todayISO = () => new Date().toISOString().split('T')[0];
    const daysUntil = d =>
        Math.ceil((new Date(d) - new Date(todayISO())) / 86400000);

    const isLicenseValid = l =>
        l && l.status === 'active' && todayISO() <= l.expires;

    const pickBest = list =>
        list.sort(
            (a, b) =>
                (TIER_PRIORITY[b.tier] || 0) -
                    (TIER_PRIORITY[a.tier] || 0) ||
                new Date(b.expires) - new Date(a.expires)
        )[0];

    /***********************
     * LICENSE SYSTEM
     ***********************/
    function resolveLicense(uid, fid, licenses) {
        const faction = [];
        const individual = [];

        for (const l of licenses) {
            if (!isLicenseValid(l)) continue;
            if (l.type === 'faction' && l.faction_id === fid) faction.push(l);
            if (l.type === 'individual' && l.user_id === uid) individual.push(l);
        }

        return faction.length
            ? pickBest(faction)
            : individual.length
            ? pickBest(individual)
            : null;
    }

    function runtimeLicense(lic) {
        if (!lic) {
            return {
                valid: false,
                expired: false,
                tier: 'trial',
                expires: null,
                features: { newbie: true }
            };
        }

        return {
            valid: true,
            expired: todayISO() > lic.expires,
            tier: lic.tier,
            expires: lic.expires,
            features: lic.features || {}
        };
    }

    function cacheGet() {
        try {
            const c = JSON.parse(localStorage.getItem('mc_license_cache'));
            if (!c) return null;
            if ((Date.now() - c.t) / 36e5 > CACHE_HOURS) return null;
            return c.d;
        } catch {
            return null;
        }
    }

    function cacheSet(d) {
        localStorage.setItem(
            'mc_license_cache',
            JSON.stringify({ t: Date.now(), d })
        );
    }

    async function loadLicenses() {
        const cached = cacheGet();
        if (cached) return cached;

        const r = await fetch(LICENSE_URL, { cache: 'no-store' });
        const j = await r.json();
        cacheSet(j);
        return j;
    }

    /***********************
     * CONFIG
     ***********************/
    const API_KEY = 'PUT_YOUR_API_KEY_HERE';

    const TRIAL_DAYS = 7;

    const CRIME_RULES = [
        { name: 'Shoplifting', minCE: 0, maxCE: 20, profit: 120000 },
        { name: 'Pickpocketing', minCE: 20, maxCE: 40, profit: 180000 },
        { name: 'Burglary', minCE: 40, maxCE: 9999, profit: 300000 }
    ];

    const HIGH_VALUE_ITEMS = ['Xanax', 'Drug Pack', 'Erotic DVD'];

    /***********************
     * STORAGE
     ***********************/
    const STORE = {
        settings: 'mc_settings',
        profit: 'mc_profit',
        install: 'mc_install'
    };

    const settings =
        JSON.parse(localStorage.getItem(STORE.settings)) || { mode: 'newbie' };

    let profitSaved = Number(localStorage.getItem(STORE.profit)) || 0;

    if (!localStorage.getItem(STORE.install)) {
        localStorage.setItem(STORE.install, Date.now());
    }

    const daysSinceInstall = () =>
        Math.floor(
            (Date.now() - Number(localStorage.getItem(STORE.install))) /
                86400000
        );

    function saveProfit(n) {
        profitSaved += n;
        localStorage.setItem(STORE.profit, profitSaved);
        updateProfitUI();
    }

    /***********************
     * API
     ***********************/
    async function fetchUser() {
        const r = await fetch(
            `https://api.torn.com/user/?selections=basic,crime&key=${API_KEY}`
        );
        return r.json();
    }

    const getBestCrime = ce =>
        CRIME_RULES.find(c => ce >= c.minCE && ce < c.maxCE);

    /***********************
     * UI
     ***********************/
    GM_addStyle(`
        #mc-box {
            background:#0f172a;
            border:1px solid #334155;
            padding:10px;
            margin:10px 0;
            border-radius:8px;
            color:#e5e7eb;
            font-size:12px;
        }
        #mc-box h3 { margin:0 0 6px; color:#7dd3fc }
        .mc-profit { color:#4ade80; font-weight:600 }
        .mc-muted { color:#94a3b8; font-size:11px }
        .mc-warn { color:#fb7185; font-size:11px }
        .mc-toggle { cursor:pointer; color:#7dd3fc }
        .mc-rec { border-left:4px solid #4ade80; padding-left:6px }
    `);

    function injectBox(bestCrime, license) {
        if (document.getElementById('mc-box')) return;

        const trialLeft = Math.max(0, TRIAL_DAYS - daysSinceInstall());

        const box = document.createElement('div');
        box.id = 'mc-box';
        box.innerHTML = `
            <h3>💰 Money Coach PRO</h3>

            <div>
                Mode:
                <span class="mc-toggle" id="mc-mode">
                    ${settings.mode.toUpperCase()}
                </span>
            </div>

            <div style="margin-top:6px">
                Best crime: <b>${bestCrime.name}</b><br>
                <span class="mc-profit">$${bestCrime.profit.toLocaleString()}/hr</span>
            </div>

            <div id="mc-profit-total" class="mc-muted"></div>

            ${
                license.valid
                    ? `<div class="mc-muted">Tier: ${license.tier} (${daysUntil(
                          license.expires
                      )}d)</div>`
                    : `<div class="mc-muted">Trial: ${trialLeft} day(s)</div>`
            }

            ${
                license.expired
                    ? `<div class="mc-warn">License expired — features disabled</div>`
                    : ''
            }
        `;

        document.querySelector('#column-right')?.prepend(box);

        document.getElementById('mc-mode').onclick = () => {
            settings.mode =
                settings.mode === 'newbie' ? 'trader' : 'newbie';
            localStorage.setItem(STORE.settings, JSON.stringify(settings));
            location.reload();
        };

        updateProfitUI();
    }

    function updateProfitUI() {
        const el = document.getElementById('mc-profit-total');
        if (el)
            el.innerText = `📈 Estimated value gained: $${profitSaved.toLocaleString()}`;
    }

    /***********************
     * ENHANCEMENTS
     ***********************/
    function enhanceCrimes(bestCrime) {
        if (!location.href.includes('crimes.php')) return;

        document.querySelectorAll('.crime').forEach(el => {
            if (el.innerText.includes(bestCrime.name)) {
                el.classList.add('mc-rec');
                if (!el.dataset.mcCounted) {
                    el.dataset.mcCounted = '1';
                    saveProfit(bestCrime.profit * 0.2);
                }
            }
        });
    }

    function warnItems() {
        document.querySelectorAll('body *').forEach(el => {
            if (HIGH_VALUE_ITEMS.includes(el.innerText) && !el.dataset.mcWarn) {
                el.dataset.mcWarn = '1';
                el.insertAdjacentHTML(
                    'afterend',
                    `<div class="mc-warn">⚠️ Check market value before selling</div>`
                );
                if (settings.mode === 'newbie') saveProfit(250000);
            }
        });
    }

    /***********************
     * INIT
     ***********************/
    async function init() {
        if (!API_KEY || API_KEY.includes('PUT_YOUR_API_KEY')) return;

        const uid = unsafeWindow.userID;
        const fid = unsafeWindow.factionID || null;

        const licenses = await loadLicenses();
        const lic = runtimeLicense(resolveLicense(uid, fid, licenses));

        if (lic.expired) {
            injectBox({ name: '—', profit: 0 }, lic);
            return;
        }

        if (!lic.features.trader) settings.mode = 'newbie';

        const user = await fetchUser();
        if (!user || user.error) return;

        const bestCrime = getBestCrime(user.crimeexperience || 0);
        injectBox(bestCrime, lic);

        if (lic.features.profit) {
            enhanceCrimes(bestCrime);
            warnItems();
        }
    }

    setTimeout(init, 1200);
})();
