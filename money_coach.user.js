// ==UserScript==
// @name         Torn Money Coach
// @namespace    https://github.com/Curtdahurt/torn-money-coach
// @version      5.0.0
// @description  PDA-first Torn money assistant
// @author       Curtdahurt
// @match        https://www.torn.com/*
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/Curtdahurt/torn-money-coach/main/money_coach.user.js
// @downloadURL  https://raw.githubusercontent.com/Curtdahurt/torn-money-coach/main/money_coach.user.js
// ==/UserScript==

(() => {
    'use strict';

    /***********************
     * HARDENING
     ***********************/
    if (window.__MONEY_COACH_LOADED__) return;
    Object.defineProperty(window, '__MONEY_COACH_LOADED__', { value: true });

    /***********************
     * CONFIG
     ***********************/
    const API_KEY = 'PUT_YOUR_API_KEY_HERE';

    const LICENSE_URL =
        'https://raw.githubusercontent.com/curtdahurt/torn-licenses/main/licenses.json';

    const CACHE_HOURS = 6;
    const TRIAL_DAYS = 7;

    const FACTION_BRAND = {
        name: 'Your Faction Name',
        tag: '[TAG]'
    };

    const TIER_PRIORITY = { trial: 0, newbie: 1, trader: 2, faction: 3 };

    const CRIME_RULES = [
        { name: 'Shoplifting', minCE: 0, maxCE: 20, profit: 120000 },
        { name: 'Pickpocketing', minCE: 20, maxCE: 40, profit: 180000 },
        { name: 'Burglary', minCE: 40, maxCE: 999, profit: 300000 }
    ];

    const HIGH_VALUE_ITEMS = ['Xanax', 'Drug Pack', 'Erotic DVD'];

    const STORE = {
        settings: 'mc_settings',
        profit: 'mc_profit',
        install: 'mc_install'
    };

    const defaultSettings = { mode: 'newbie' };
    const settings =
        JSON.parse(localStorage.getItem(STORE.settings)) || defaultSettings;

    let profitSaved = Number(localStorage.getItem(STORE.profit)) || 0;

    if (!localStorage.getItem(STORE.install)) {
        localStorage.setItem(STORE.install, Date.now());
    }

    /***********************
     * UTILS
     ***********************/
    const todayISO = () => new Date().toISOString().split('T')[0];

    const daysUntil = d =>
        Math.ceil((new Date(d) - new Date(todayISO())) / 86400000);

    const saveProfit = amt => {
        profitSaved += amt;
        localStorage.setItem(STORE.profit, profitSaved);
        updateProfitUI();
    };

    /***********************
     * LICENSE SYSTEM
     ***********************/
    const isLicenseValid = l =>
        l && l.status === 'active' && todayISO() <= l.expires;

    const pickBestLicense = list =>
        list.sort(
            (a, b) =>
                (TIER_PRIORITY[b.tier] || 0) -
                    (TIER_PRIORITY[a.tier] || 0) ||
                new Date(b.expires) - new Date(a.expires)
        )[0];

    function resolveLicense(uid, fid, licenses) {
        const faction = [];
        const individual = [];

        for (const l of licenses) {
            if (!isLicenseValid(l)) continue;
            if (l.type === 'faction' && l.faction_id === fid)
                faction.push(l);
            if (l.type === 'individual' && l.user_id === uid)
                individual.push(l);
        }

        return faction.length
            ? pickBestLicense(faction)
            : individual.length
            ? pickBestLicense(individual)
            : null;
    }

    function runtimeLicense(l) {
        if (!l) {
            return {
                valid: false,
                expired: false,
                tier: 'trial',
                features: { newbie: true, trader: false, profit: false, branding: false }
            };
        }

        return {
            valid: true,
            expired: todayISO() > l.expires,
            tier: l.tier,
            expires: l.expires,
            features: l.features || {}
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
     * API / CRIME LOGIC
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
     * PDA UI
     ***********************/
    GM_addStyle(`
        #mc-pda {
            position: fixed;
            bottom: 80px;
            right: 12px;
            width: 285px;
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 10px;
            color: #e5e7eb;
            font-size: 12px;
            z-index: 99999;
            box-shadow: 0 10px 25px rgba(0,0,0,.6);
        }
        #mc-header {
            padding: 8px;
            font-weight: 600;
            cursor: pointer;
            background: #020617;
            border-bottom: 1px solid #1e293b;
            display: flex;
            justify-content: space-between;
        }
        #mc-body { padding: 8px; display: none; }
        #mc-body.show { display: block; }
        .mc-good { color: #4ade80; }
        .mc-warn { color: #fb7185; }
        .mc-muted { color: #94a3b8; font-size: 11px; }
        .mc-btn {
            margin-top: 6px;
            padding: 4px 6px;
            background: #1e293b;
            border-radius: 6px;
            text-align: center;
            cursor: pointer;
            font-size: 11px;
        }
        .mc-brand {
            margin-top: 6px;
            font-size: 10px;
            color: #64748b;
            text-align: right;
        }
    `);

    function updateProfitUI() {
        const el = document.getElementById('mc-profit');
        if (el) el.innerText = `📈 Value gained: $${profitSaved.toLocaleString()}`;
    }

    function injectUI(license, bestCrime) {
        if (document.getElementById('mc-pda')) return;

        const box = document.createElement('div');
        box.id = 'mc-pda';

        box.innerHTML = `
            <div id="mc-header">
                <span>💰 Money Coach</span>
                <span>▾</span>
            </div>
            <div id="mc-body">
                ${
                    license.expired
                        ? `<div class="mc-warn">License expired</div>`
                        : `<div class="mc-good">Tier: ${license.tier}</div>`
                }
                ${
                    license.expires
                        ? `<div class="mc-muted">Expires in ${daysUntil(
                              license.expires
                          )} day(s)</div>`
                        : `<div class="mc-muted">Trial mode</div>`
                }

                <div style="margin-top:6px">
                    Best crime: <b>${bestCrime.name}</b><br>
                    $${bestCrime.profit.toLocaleString()}/hr
                </div>

                <div id="mc-profit" class="mc-muted"></div>

                ${
                    license.features.trader
                        ? `<div class="mc-btn" id="mc-toggle-mode">
                            Mode: ${settings.mode} (tap to switch)
                           </div>`
                        : ''
                }

                ${
                    license.features.branding
                        ? `<div class="mc-brand">
                            ${FACTION_BRAND.name} ${FACTION_BRAND.tag}
                           </div>`
                        : ''
                }
            </div>
        `;

        document.body.appendChild(box);

        const body = box.querySelector('#mc-body');
        box.querySelector('#mc-header').onclick = () =>
            body.classList.toggle('show');

        const toggle = document.getElementById('mc-toggle-mode');
        if (toggle) {
            toggle.onclick = () => {
                settings.mode =
                    settings.mode === 'newbie' ? 'trader' : 'newbie';
                localStorage.setItem(
                    STORE.settings,
                    JSON.stringify(settings)
                );
                location.reload();
            };
        }

        updateProfitUI();
    }

    /***********************
     * PAGE ENHANCEMENTS
     ***********************/
    function enhanceCrimes(bestCrime) {
        if (!location.href.includes('crimes.php')) return;

        document.querySelectorAll('.crime').forEach(el => {
            if (
                el.innerText.includes(bestCrime.name) &&
                !el.dataset.mc
            ) {
                el.dataset.mc = '1';
                saveProfit(Math.round(bestCrime.profit * 0.2));
            }
        });
    }

    function warnItems() {
        if (
            !location.href.includes('item') &&
            !location.href.includes('bazaar')
        )
            return;

        document.querySelectorAll('body *').forEach(el => {
            HIGH_VALUE_ITEMS.forEach(item => {
                if (el.innerText === item && !el.dataset.mcWarn) {
                    el.dataset.mcWarn = '1';
                    el.insertAdjacentHTML(
                        'afterend',
                        `<div class="mc-muted">⚠️ Check market value</div>`
                    );
                    if (settings.mode === 'newbie') saveProfit(250000);
                }
            });
        });
    }

    /***********************
     * PDA SAFE INIT
     ***********************/
    async function init() {
        if (!API_KEY || API_KEY.includes('PUT_YOUR_API_KEY')) return;

        const uid = unsafeWindow.userID;
        if (!uid) return;

        const fid = unsafeWindow.factionID || null;

        const licenses = await loadLicenses();
        const resolved = resolveLicense(uid, fid, licenses);
        const license = runtimeLicense(resolved);

        const user = await fetchUser();
        if (!user || user.error) return;

        if (!license.features.trader) settings.mode = 'newbie';

        const bestCrime = getBestCrime(user.crimeexperience || 0);

        injectUI(license, bestCrime);

        if (!license.expired && license.features.profit) {
            enhanceCrimes(bestCrime);
            warnItems();
        }
    }

    setTimeout(init, 1500);
    new MutationObserver(() => {
        if (!document.getElementById('mc-pda')) init();
    }).observe(document.body, { childList: true, subtree: true });

})();
