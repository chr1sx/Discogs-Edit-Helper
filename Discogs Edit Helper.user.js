// ==UserScript==
// @name         Discogs Edit Helper
// @namespace    https://github.com/chr1sx/Discogs-Edit-Helper
// @version      1.4
// @description  Streamlines the editing process by importing tracklists, extracting info from titles, and assigning data to the appropriate fields
// @author       chr1sx
// @match        https://www.discogs.com/release/edit/*
// @match        https://www.discogs.com/release/add
// @grant        none
// @run-at       document-idle
// @license      MIT
// @icon         https://www.google.com/s2/favicons?domain=discogs.com&sz=64
// @downloadURL https://update.greasyfork.org/scripts/562100/Discogs%20Edit%20Helper.user.js
// @updateURL https://update.greasyfork.org/scripts/562100/Discogs%20Edit%20Helper.meta.js
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        INACTIVITY_TIMEOUT_MS: 60 * 1000,
        MAX_LOG_MESSAGES: 200,
        MAX_HISTORY_STATES: 50,
        RETRY_ATTEMPTS: 4,
        RETRY_DELAY_MS: 140,
        PROCESSING_DELAY_MS: 300,
        INFO_TEXT_COLOR: '#28a745',
        ARTIST_SPLITTER_PATTERNS: ['vs', 'v', '&', '+', ',', '/', '\\'],
        FEATURING_PATTERNS: ['featuring', 'feat', 'ft', 'f/', 'w/'],
        REMIX_PATTERNS: ['remix', 'rmx'],
        REMIX_BY_PATTERNS: ['remixed by', 'remix by', 'rmx by', 'rebuild by', 'rebuilt by', 'reworked by', 'rework by', 'edited by', 'edit by', 'mixed by', 'mix by', 'version by'],
        REMIX_PATTERNS_OPTIONAL: ['edit', 'rework', 'mix', 'version'],
        CAPITALIZE_KEEP_UPPER: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'AM', 'DJ', 'EP', 'FM', 'MC', 'PM', 'RMX', 'VIP'],
        CAPITALIZE_KEEP_LOWER: ['da', 'de', 'del', 'des', 'di', 'du', 'la', 'van', 'von'],
        CLEAN_TITLE_PATTERNS: ['original mix', 'digital bonus track', 'digital bonus', 'bonus track', 'bonus']
    };
    const CONFIG_RAW = {
        REMIX_PATTERNS: ['remix', 'rmx'],
        REMIX_BY_PATTERNS: ['remixed by', 'remix by', 'rmx by', 'rebuild by', 'rebuilt by', 'reworked by', 'rework by', 'edited by', 'edit by', 'mixed by', 'mix by', 'version by'],
        REMIX_PATTERNS_OPTIONAL: ['edit', 'rework', 'mix', 'version'],
    };
    const CONFIG_DEFAULTS = {
        INACTIVITY_TIMEOUT_MS:    60 * 1000,
        ARTIST_SPLITTER_PATTERNS: ['vs', 'v', '&', '+', ',', '/', '\\'],
        FEATURING_PATTERNS:       ['featuring', 'feat', 'ft', 'f/', 'w/'],
        REMIX_PATTERNS:           ['remix', 'rmx'],
        REMIX_BY_PATTERNS:        ['remixed by', 'remix by', 'rmx by', 'rebuild by', 'rebuilt by', 'reworked by', 'rework by', 'edited by', 'edit by', 'mixed by', 'mix by', 'version by'],
        REMIX_PATTERNS_OPTIONAL:  ['edit', 'rework', 'mix', 'version'],
        CAPITALIZE_KEEP_UPPER:    ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'AM', 'DJ', 'EP', 'FM', 'MC', 'PM', 'RMX', 'VIP'],
        CAPITALIZE_KEEP_LOWER:    ['da', 'de', 'del', 'des', 'di', 'du', 'la', 'van', 'von'],
        CLEAN_TITLE_PATTERNS:     ['original mix', 'digital bonus track', 'digital bonus', 'bonus track', 'bonus'],
    };

    const STORAGE_KEYS = {
        THEME_KEY:          'discogs_helper_theme_v2',
        FEAT_REMOVE_KEY:    'discogs_helper_removeFeat',
        MAIN_REMOVE_KEY:    'discogs_helper_removeMain',
        REMIX_OPTIONAL_KEY: 'discogs_helper_remix_optional',
        CFG_TIMEOUT:        'discogs_helper_cfg_timeout',
        CFG_START_COLLAPSED:'discogs_helper_cfg_start_collapsed',
        CFG_SPLITTER:       'discogs_helper_cfg_splitter',
        CFG_FEATURING:      'discogs_helper_cfg_featuring',
        CFG_REMIX:          'discogs_helper_cfg_remix',
        CFG_REMIX_BY:       'discogs_helper_cfg_remix_by',
        CFG_REMIX_OPT:      'discogs_helper_cfg_remix_opt',
        CFG_KEEP_UPPER:     'discogs_helper_cfg_keep_upper',
        CFG_KEEP_LOWER:     'discogs_helper_cfg_keep_lower',
        CFG_CLEAN_TITLE:    'discogs_helper_cfg_clean_title',
    };

    const state = {
        logMessages: [],
        hideTimeout: null,
        processingTimeout: null,
        processingStartTime: null,
        actionHistory: [],
        isCollapsed: false,
        startCollapsed: false,
        removeMainFromTitle: true,
        removeFeatFromTitle: false,
        remixOptionalEnabled: false,
        importerText: ''
    };

    function expandPattern(pattern, context = 'default') {
        if (!pattern) return pattern;
        if (pattern === 'mix' && context === 'optional') {
            return '(?:(?<!\\w)(?<!re-)mix)';
        }
        const reMatch = pattern.match(/^(re)([a-z]+)(ed)?(\s+by)?$/i);
        if (reMatch) {
            const prefix = reMatch[1];
            const word = reMatch[2];
            const ed = reMatch[3] || '';
            const by = reMatch[4] || '';
            return `${prefix}(?:\\-)?${word}${ed}${by}`;
        }
        return pattern;
    }

    function applyPatternExpansions() {
        CONFIG.REMIX_PATTERNS          = CONFIG_RAW.REMIX_PATTERNS.map(p => expandPattern(p, 'remix'));
        CONFIG.REMIX_PATTERNS_OPTIONAL = CONFIG_RAW.REMIX_PATTERNS_OPTIONAL.map(p => expandPattern(p, 'optional'));
        CONFIG.REMIX_BY_PATTERNS       = CONFIG_RAW.REMIX_BY_PATTERNS.map(p => expandPattern(p, 'by'));
    }

    function parseStoredArray(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const delimiter = raw.includes(';') ? /;\s*/ : /,\s*/;
            const arr = raw.split(delimiter).map(s => s.trim()).filter(Boolean);
            return arr.length ? arr : null;
        } catch (e) { return null; }
    }

    function saveArrayToStorage(key, arr) {
        try { localStorage.setItem(key, arr.join('; ')); } catch (e) {}
    }

    function loadConfigFromStorage() {
        const featuring = parseStoredArray(STORAGE_KEYS.CFG_FEATURING);
        if (featuring) CONFIG.FEATURING_PATTERNS = featuring;

        const remixRaw = parseStoredArray(STORAGE_KEYS.CFG_REMIX);
        if (remixRaw) CONFIG_RAW.REMIX_PATTERNS = remixRaw;

        const remixByRaw = parseStoredArray(STORAGE_KEYS.CFG_REMIX_BY);
        if (remixByRaw) CONFIG_RAW.REMIX_BY_PATTERNS = remixByRaw;

        const remixOptRaw = parseStoredArray(STORAGE_KEYS.CFG_REMIX_OPT);
        if (remixOptRaw) CONFIG_RAW.REMIX_PATTERNS_OPTIONAL = remixOptRaw;

        const splitter = parseStoredArray(STORAGE_KEYS.CFG_SPLITTER);
        if (splitter) CONFIG.ARTIST_SPLITTER_PATTERNS = splitter;

        const keepUpper = parseStoredArray(STORAGE_KEYS.CFG_KEEP_UPPER);
        if (keepUpper) CONFIG.CAPITALIZE_KEEP_UPPER = keepUpper;

        const keepLower = parseStoredArray(STORAGE_KEYS.CFG_KEEP_LOWER);
        if (keepLower) CONFIG.CAPITALIZE_KEEP_LOWER = keepLower;

        const cleanTitle = parseStoredArray(STORAGE_KEYS.CFG_CLEAN_TITLE);
        if (cleanTitle) CONFIG.CLEAN_TITLE_PATTERNS = cleanTitle;
        try {
            const storedTimeout = localStorage.getItem(STORAGE_KEYS.CFG_TIMEOUT);
            if (storedTimeout) { const t = parseInt(storedTimeout, 10); if (t > 0) CONFIG.INACTIVITY_TIMEOUT_MS = t * 1000; }
            const storedCollapsed = localStorage.getItem(STORAGE_KEYS.CFG_START_COLLAPSED);
            if (storedCollapsed !== null) state.startCollapsed = (storedCollapsed === '1');
        } catch(e) {}
    }

    function getRemixByRegex() {
        const patterns = CONFIG.REMIX_BY_PATTERNS.map(p => patternToRegex(p)).join('|');
        return new RegExp(`^(?:${patterns})\\s+`, 'i');
    }

    function getAllRemixTokensRegex() {
        const all = [
            ...CONFIG.REMIX_PATTERNS,
            ...CONFIG.REMIX_PATTERNS_OPTIONAL,
            ...CONFIG.REMIX_BY_PATTERNS
        ].map(p => patternToRegex(p)).join('|');
        return all;
    }

    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        state.logMessages.push({ timestamp, message, type });
        if (state.logMessages.length > CONFIG.MAX_LOG_MESSAGES) {
            state.logMessages = state.logMessages.slice(-CONFIG.MAX_LOG_MESSAGES);
        }
        updatePanelLog();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function escapeRegExp(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function patternToRegex(pattern) {
        if (pattern.includes('(?:') || pattern.includes('[')) {
            return pattern;
        }
        return escapeRegExp(pattern);
    }

    function patternToDisplay(pattern) {
        pattern = pattern.replace(/\(\?[<!=][^)]*\)/g, '');
        pattern = pattern.replace(/\(\?:\\-\)\?/g, '');
        pattern = pattern.replace(/\(\?:([^)]+)\)/g, '$1');
        return pattern;
    }

    function setReactValue(element, value) {
        if (!element) return;
        try {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(element, value);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.focus();
            element.blur();
        } catch (e) {
            log(`Error setting value: ${e.message}`, 'error');
        }
    }

    function updatePanelLog() {
        const logContainer = document.getElementById('log-container');
        if (!logContainer) return;
        const colors = { info: '#9aa0a6', success: '#28a745', warning: '#ffc107', error: '#dc3545' };
        logContainer.innerHTML = state.logMessages
            .slice(-CONFIG.MAX_LOG_MESSAGES)
            .map(entry => `<div style="color: ${colors[entry.type]}; margin: 2px 0;">[${entry.timestamp}] ${escapeHtml(entry.message)}</div>`)
            .join('');
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function setInfoSingleLine(text, success = true) {
        const infoDiv = document.getElementById('track-info');
        if (!infoDiv) return;
        infoDiv.style.display = 'block';
        infoDiv.style.whiteSpace = 'nowrap';
        infoDiv.style.overflow = 'hidden';
        infoDiv.style.textOverflow = 'ellipsis';
        infoDiv.style.padding = '8px';
        infoDiv.style.borderRadius = '4px';
        infoDiv.style.fontSize = '12px';
        infoDiv.style.textAlign = 'center';
        infoDiv.style.color = CONFIG.INFO_TEXT_COLOR;
        infoDiv.textContent = text;
    }

    async function setInfoProcessing() {
        if (state.processingTimeout) {
            clearTimeout(state.processingTimeout);
            state.processingTimeout = null;
        }
        setInfoSingleLine('Processing...');
        state.processingStartTime = Date.now();
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }

    async function clearInfoProcessing() {
        if (state.processingStartTime) {
            const elapsed = Date.now() - state.processingStartTime;
            if (elapsed < CONFIG.PROCESSING_DELAY_MS) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.PROCESSING_DELAY_MS - elapsed));
            }
            state.processingStartTime = null;
        }
        resetHideTimer();
    }

    function initializeState() {
        loadConfigFromStorage();
        applyPatternExpansions();

        try {
            const storedFeat = localStorage.getItem(STORAGE_KEYS.FEAT_REMOVE_KEY);
            if (storedFeat === '0' || storedFeat === '1') {
                state.removeFeatFromTitle = (storedFeat === '1');
            }
        } catch (e) {}
        try {
            const storedMain = localStorage.getItem(STORAGE_KEYS.MAIN_REMOVE_KEY);
            if (storedMain === '0' || storedMain === '1') {
                state.removeMainFromTitle = (storedMain === '1');
            }
        } catch (e) {}
        try {
            const storedRemixOpt = localStorage.getItem(STORAGE_KEYS.REMIX_OPTIONAL_KEY);
            if (storedRemixOpt === '0' || storedRemixOpt === '1') {
                state.remixOptionalEnabled = (storedRemixOpt === '1');
            }
        } catch (e) {}
    }

    function cleanupArtistName(str, preserveWrapping = false) {
        if (!str) return '';
        let s = String(str).trim();

        s = s.replace(getRemixByRegex(), '');
        s = s.replace(/^by\s+/i, '');

        if (preserveWrapping) {
            if (s.startsWith('[') && s.endsWith(']')) {
                return s;
            }
            if (s.startsWith('(') && s.endsWith(')')) {
                const inner = s.slice(1, -1).trim();
                return '(' + inner + ')';
            }
            s = s.replace(/^[\s\(\-:\.]+/, '');
            s = s.replace(/[\s\-\:;,\.]+$/g, '');
            return s;
        }
        if (s.startsWith('[') && s.endsWith(']')) {
            return s;
        }
        if (s.startsWith('(') && s.endsWith(')')) {
            s = s.slice(1, -1).trim();
        }
        s = s.replace(/^[\s\(\-:\.]+/, '');
        s = s.replace(/[\s\-\:;,\.]+$/g, '');
        if (s.startsWith('(') && s.endsWith(')')) {
            s = s.slice(1, -1).trim();
        }
        return s;
    }

    function isAlphaToken(tok) {
        return /^[A-Za-z]+$/.test(tok);
    }

    function buildFeaturingPattern() {
        const alphaAlts = CONFIG.FEATURING_PATTERNS
            .filter(isAlphaToken)
            .map(t => escapeRegExp(t) + '\\.?');
        const nonAlphaAlts = CONFIG.FEATURING_PATTERNS
            .filter(t => !isAlphaToken(t))
            .map(t => escapeRegExp(t));
        const parts = [];
        if (alphaAlts.length) parts.push(`(?<![A-Za-z])(?:${alphaAlts.join('|')})(?![A-Za-z])`);
        if (nonAlphaAlts.length) parts.push(`(?:${nonAlphaAlts.join('|')})`);
        return parts.join('|');
    }

    function buildSplitterCaptureRegex(includeFeaturing = false) {
        const parts = [];
        if (includeFeaturing) parts.push(buildFeaturingPattern());
        for (const s of CONFIG.ARTIST_SPLITTER_PATTERNS) {
            if (isAlphaToken(s)) {
                parts.push(`(?<!\\S)(?:${escapeRegExp(s)}\\.?)(?!\\S)`);
            } else {
                parts.push(`(?:${escapeRegExp(s)})`);
            }
        }
        const pattern = parts.join('|');
        return new RegExp(`\\s*(${pattern})\\s*`, 'gi');
    }

    function buildSplitterRegex() {
        const parts = CONFIG.ARTIST_SPLITTER_PATTERNS.map(s => {
            if (isAlphaToken(s)) {
                return `(?<!\\S)(?:${escapeRegExp(s)}\\.?)(?!\\S)`;
            }
            return `(?:${escapeRegExp(s)})`;
        });
        const pattern = parts.join('|');
        return new RegExp(`\\s*(?:${pattern})\\s*`, 'gi');
    }

    function buildSplitterRegexNoGlobal() {
        const parts = CONFIG.ARTIST_SPLITTER_PATTERNS.map(s => {
            if (isAlphaToken(s)) {
                return `(?<!\\S)(?:${escapeRegExp(s)}\\.?)(?!\\S)`;
            }
            return `(?:${escapeRegExp(s)})`;
        });
        const pattern = parts.join('|');
        return new RegExp(`\\s*(?:${pattern})\\s*`, 'i');
    }

    function splitArtistsByConfiguredPatterns(raw) {
        if (!raw) return [];
        const splitter = buildSplitterRegexNoGlobal();
        const parts = raw.split(splitter).map(p => cleanupArtistName(p, true)).filter(Boolean);
        return parts;
    }

    function findRemoveButtonIn(container) {
        if (!container) return null;
        const selectors = ['button.editable_input_remove', 'button[aria-label="Remove"]', 'button[title="Remove"]'];
        for (const selector of selectors) {
            const button = container.querySelector(selector);
            if (button) return button;
        }
        const icon = container.querySelector('i.icon.icon-times, svg.icon-times');
        if (icon) return icon.closest('button') || icon;
        return null;
    }

    function findRemoveNear(node) {
        if (!node) return null;
        const row = node.closest('tr');
        if (!row) return null;
        const selectors = ['button.editable_input_remove', 'button[aria-label="Remove"]', 'i.icon.icon-times'];
        for (const selector of selectors) {
            const el = row.querySelector(selector);
            if (el) return el.closest('button') || el;
        }
        return null;
    }

    function getSavedCreditsInRow(row, creditType = 'extra') {
        const saved = [];
        let creditElements;
        if (creditType === 'main') {
            creditElements = row.querySelectorAll('td.subform_track_artists li.editable_item');
        } else {
            creditElements = row.querySelectorAll('td.subform_track_title li.editable_item');
        }

        creditElements.forEach(elem => {
            if (creditType === 'main') {
                const artistInput = elem.querySelector('input[data-type="artist-name"], input.credit-artist-name-input');
                if (artistInput && artistInput.value && artistInput.value.trim()) {
                    return;
                }
                const artistLink = elem.querySelector('a.rollover_link, span.rollover_link');
                if (artistLink) {
                    const artist = artistLink.textContent.trim();
                    if (artist) {
                        saved.push({ role: '', artist, element: elem });
                    }
                } else {
                    const text = elem.textContent.trim();
                    if (text && !text.match(/^\s*\+\s*$/)) {
                        saved.push({ role: '', artist: text, element: elem });
                    }
                }
                return;
            }

            const creditRole = elem.querySelector('span.credit_role');
            if (!creditRole) return;

            const artistLink = creditRole.querySelector('a.rollover_link, span.rollover_link');
            const inputs = creditRole.querySelectorAll('input');

            if (inputs.length > 0) return;

            if (artistLink) {
                let role = '';
                const roleSpan = creditRole.querySelector('span:first-child');
                if (roleSpan) {
                    role = roleSpan.textContent.trim().replace(/[\s\-]+$/g, '').trim();
                } else {
                    const fullText = creditRole.textContent.trim();
                    const artistText = artistLink.textContent.trim();
                    role = fullText.replace(artistText, '').replace(/\s*[-–—]+\s*/g, '').trim();
                }
                const artist = artistLink.textContent.trim();
                if (artist) {
                    saved.push({ role, artist, element: elem });
                }
            }
        });

        return saved;
    }

    function getOpenCreditsInRow(row) {
        const open = [];
        const items = row.querySelectorAll('td.subform_track_title li.editable_item');
        items.forEach(item => {
            const roleTags = item.querySelectorAll('span.credit-tags-list span.facet-tag span:last-child');
            const artistInput = item.querySelector('input.credit-artist-name-input');
            if (!roleTags.length || !artistInput) return;
            const artist = (artistInput.value || '').trim();
            if (!artist) return;
            roleTags.forEach(tag => {
                const role = tag.textContent.trim();
                if (role) open.push({ role, artist });
            });
        });
        return open;
    }

    async function createArtistInputs(row, count) {
        const artistTd = row.querySelector('td.subform_track_artists');
        const addButton = artistTd?.querySelector('button.add-credit-button');
        if (!addButton || count <= 0) return [];

        const existingItems = Array.from(artistTd.querySelectorAll('li.editable_item'));
        const existingSet = new Set(existingItems);

        for (let i = 0; i < count; i++) {
            try { addButton.click(); } catch (e) {}
        }

        const timeout = 1400;
        const poll = 40;
        const start = Date.now();
        let afterItems = Array.from(artistTd.querySelectorAll('li.editable_item'));
        while (afterItems.length < existingItems.length + count && (Date.now() - start) < timeout) {
            await new Promise(r => setTimeout(r, poll));
            afterItems = Array.from(artistTd.querySelectorAll('li.editable_item'));
        }

        const newItems = afterItems.filter(it => !existingSet.has(it));

        return newItems.map(item => {
            const container = item.closest('li.editable_item') || item;
            const artistInput = container.querySelector('input[data-type="artist-name"], input.credit-artist-name-input');
            const removeButton = findRemoveButtonIn(container) || findRemoveNear(artistInput);
            return { artistInput, artistContainer: container, removeButton };
        });
    }

    async function createCreditItems(row, count) {
        const titleTd = row.querySelector('td.subform_track_title');
        if (!titleTd || count <= 0) return [];
        let addButton = titleTd.querySelector('button.add-credit-button') || row.querySelector('button.add-credit-button');
        if (!addButton) return [];

        const existingItems = Array.from(titleTd.querySelectorAll('li.editable_item'));
        const existingSet = new Set(existingItems);

        for (let i = 0; i < count; i++) {
            try { addButton.click(); } catch (e) {}
        }

        const timeout = 1800;
        const poll = 40;
        const start = Date.now();
        let afterItems = Array.from(titleTd.querySelectorAll('li.editable_item'));
        while (afterItems.length < existingItems.length + count && (Date.now() - start) < timeout) {
            await new Promise(r => setTimeout(r, poll));
            afterItems = Array.from(titleTd.querySelectorAll('li.editable_item'));
        }

        const newItems = afterItems.filter(it => !existingSet.has(it));

        return newItems.map(item => {
            const allInputs = Array.from(item.querySelectorAll('input'));
            const roleInput = item.querySelector('input.add-credit-role-input') || item.querySelector('input[aria-label="Add Artist Role"]') || null;
            const artistInput = allInputs.find(inp => {
                if (!inp) return false;
                if (inp === roleInput) return false;
                return inp.type === 'text';
            }) || null;
            const removeButton = findRemoveButtonIn(item) || findRemoveNear(item);
            return { roleInput, artistInput, newCreditItem: item, removeButton };
        });
    }

    function getJoinInputForArtistRow(row, artistInput, artistContainer, idx) {
        if (!artistContainer) return null;
        let joinInput = artistContainer.querySelector('input[placeholder="Join"], input[aria-label="Join"]');
        if (joinInput) return joinInput;
        let nextSib = artistContainer.nextElementSibling;
        let attempts = 0;
        while (nextSib && attempts < 10) {
            attempts++;
            const jInput = nextSib.querySelector('input[placeholder="Join"], input[aria-label="Join"]');
            if (jInput) return jInput;
            nextSib = nextSib.nextElementSibling;
        }
        const allJoins = Array.from(row.querySelectorAll('input[placeholder="Join"], input[aria-label="Join"]'));
        if (idx >= 0 && idx < allJoins.length) return allJoins[idx];
        return null;
    }

    function addActionToHistory(action) {
        state.actionHistory.push(action);
        if (state.actionHistory.length > CONFIG.MAX_HISTORY_STATES) {
            state.actionHistory.shift();
        }
        updateRevertButtons();
    }

    function trimLeadingZeros(str) {
        if (!str) return str;
        if (/^\d+:\d+:\d+/.test(str)) {
            const parts = str.split(':');
            const hh = parseInt(parts[0], 10);
            if (hh === 0) {
                return String(parseInt(parts[1], 10)) + ':' + parts[2];
            }
            return String(hh) + ':' + parts[1] + ':' + parts[2];
        }
        if (/^\d+:\d+/.test(str)) {
            return str.replace(/^0+(\d)/, '$1');
        }
        return str.replace(/^0+(\d)/, '$1');
    }

    async function saveAllFields() {
        await setInfoProcessing();

        const pageRoot = document.body;
        const panel = document.getElementById('helper-panel');
        const allButtons = Array.from(pageRoot.querySelectorAll('button')).filter(
            btn => !panel || !panel.contains(btn)
        );
        const saveButtons = allButtons.filter(btn => btn.querySelector('i.icon-check'));
        const editButtons = allButtons.filter(btn => btn.querySelector('i.icon-pencil'));

        const isSaving = saveButtons.length > 0;
        const targets = isSaving ? saveButtons : editButtons;

        if (targets.length === 0) {
            await clearInfoProcessing();
            setInfoSingleLine('Nothing to save or edit', false);
            log('No save or edit buttons found', 'info');
            return;
        }

        const verb = isSaving ? 'Saved all credit fields' : 'Opened all credit fields';
        const verbProg = isSaving ? 'Saving credit fields...' : 'Opening credit fields...';
        log(verbProg, 'info');

        let processed = 0;
        for (const btn of targets) {
            if (btn && btn.isConnected) {
                try { btn.click(); processed++; } catch (e) {
                    log(`Error toggling field: ${e.message}`, 'error');
                }
            }
        }

        await clearInfoProcessing();
        if (processed > 0) {
            setInfoSingleLine(`Done! ${verb}`, true);
            log(`Done! ${verb}`, 'success');
        } else {
            setInfoSingleLine('No fields toggled', false);
            log('No fields toggled', 'info');
        }
    }

    async function extractTrackPositions() {
        await setInfoProcessing();
        log('Starting track position extraction...', 'info');

        let trackRows = getTrackInputRows();
        if (trackRows.length === 0) {
            await clearInfoProcessing();
            log('No track rows found', 'error');
            setInfoSingleLine('No tracks found', false);
            return;
        }

        const changes = [];
        let processed = 0;

        trackRows.forEach((row, index) => {
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            const trackPositionInput = row.querySelector('input.track-number-input');

            if (!titleInput || !trackPositionInput) return;

            const title = titleInput.value.trim();

            const posRe = /^[\[(]?([A-Za-z]{0,2}\d+[A-Za-z]?)[\])]?\.?\s*[-–—.]*\s+/;
            const posMatch = title.match(posRe);
            if (!posMatch) return;

            const trackPosition = posMatch[1];
            const prefixLen = posMatch[0].length;
            const newTitle = title.slice(prefixLen).trim();

            if (!newTitle || newTitle === title) return;

            const oldTrackPosition = trackPositionInput.value.trim();
            const trimmedTrackPosition = trimLeadingZeros(trackPosition);

            setReactValue(trackPositionInput, trimmedTrackPosition);
            setReactValue(titleInput, newTitle);

            changes.push({
                titleInput,
                oldTitle: title,
                newTitle,
                trackPositionInput,
                oldTrackPosition,
                newTrackPosition: trimmedTrackPosition
            });

            processed++;
            log(`Track ${index + 1}: Extracted track position "${trimmedTrackPosition}"`, 'success');
        });

        if (changes.length > 0) {
            addActionToHistory({ type: 'trackPositions', changes });
        }

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Extracted ${processed} track position${plural}`, true);
            log(`Done! Extracted ${processed} track position${plural}`, 'success');
        } else {
            setInfoSingleLine('No track positions found', false);
            log('No track positions found', 'info');
        }
    }

    async function scanAndExtract() {
        await setInfoProcessing();
        log('Starting duration scan...', 'info');

        let trackRows = getTrackInputRows();
        if (trackRows.length === 0) {
            await clearInfoProcessing();
            log('No track rows found', 'error');
            setInfoSingleLine('No tracks found', false);
            return;
        }

        const trailingPattern = /(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\s*$/;
        const bracketPattern = /[\(\[\|]\s*(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\s*[\)\]\|]/;

        let processed = 0;
        const changes = [];

        trackRows.forEach((row, index) => {
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            const durationInput = row.querySelector('td.subform_track_duration input, input[aria-label*="duration" i]');
            if (!titleInput || !durationInput) return;
            const title = titleInput.value.trim();

            let match = title.match(trailingPattern);
            let duration = null;
            let newTitle = title;

            if (match) {
                duration = match[1];
                newTitle = title.replace(/\s*(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\s*$/, '').replace(/[-–—\s]+$/, '').trim();
            } else {
                match = title.match(bracketPattern);
                if (match) {
                    duration = match[1];
                    newTitle = title.replace(match[0], '').replace(/[-–—\s]+$/, '').trim();
                }
            }

            if (duration) {
                const trimmedDuration = trimLeadingZeros(duration);

                changes.push({
                    titleInput,
                    oldTitle: title,
                    newTitle,
                    durationInput,
                    oldDuration: durationInput.value.trim(),
                    newDuration: trimmedDuration
                });
                setReactValue(titleInput, newTitle);
                setReactValue(durationInput, trimmedDuration);
                processed++;
                log(`Track ${index + 1}: Extracted duration "${trimmedDuration}" and updated title to "${newTitle}"`, 'success');
            }
        });

        if (changes.length > 0) {
            addActionToHistory({ type: 'durations', changes });
        }

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Extracted ${processed} duration${plural}`, true);
            log(`Done! Extracted ${processed} duration${plural}`, 'success');
        } else {
            setInfoSingleLine('No durations found', false);
            log('No durations found', 'info');
        }
    }

    async function extractArtists() {
        await setInfoProcessing();
        log('Starting artist extraction...', 'info');

        let trackRows = getTrackInputRows();

        let processed = 0;
        let foundButAlreadyEntered = 0;
        const changes = [];

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const title = (titleInput.value || '').trim();

            let match = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
            if (!match) match = title.match(/^(.+?)\s*[-—]\s*(.+)$/);
            if (!match) continue;

            const artistText = match[1].trim();
            const newTitle = match[2].trim();

            const savedMain = getSavedCreditsInRow(row, 'main') || [];
            const savedMainVals = savedMain.map(s => (s.artist || '').replace(/^[\(\[]+|[\)\]]+$/g, '').trim().toLowerCase());

            const unsavedInputs = Array.from(row.querySelectorAll('input[data-type="artist-name"], input.credit-artist-name-input'))
                .map(inp => (inp.value || '').trim())
                .filter(Boolean)
                .map(v => v.replace(/^[\(\[]+|[\)\]]+$/g, '').toLowerCase());

            const presentSet = new Set([...savedMainVals, ...unsavedInputs]);

            const splitterWithCapture = buildSplitterCaptureRegex(true);
            const rawTokens = artistText.split(splitterWithCapture).map(s => s.trim()).filter(s => s !== '');
            let artistParts = [];
            let separators = [];
            if (rawTokens.length === 1) {
                artistParts = artistText.split(buildSplitterRegex()).map(p => cleanupArtistName(p, true)).filter(Boolean);
            } else {
                for (let t = 0; t < rawTokens.length; t++) {
                    if (t % 2 === 0) artistParts.push(cleanupArtistName(rawTokens[t], true));
                    else separators.push(rawTokens[t]);
                }
            }
            if (artistParts.length === 0) continue;

            const normalize = s => (s || '').replace(/\s*\(\d+\)\s*$/g, '').replace(/^[\(\[]+|[\)\]]+$/g, '').trim().toLowerCase();
            const allPartsSaved = artistParts.every(part => presentSet.has(normalize(part)));
            if (allPartsSaved) {
                foundButAlreadyEntered++;
                log(`Track ${i + 1}: Artists already entered`, 'info');
                continue;
            }

            const partsToAdd = artistParts.filter(p => !presentSet.has(normalize(p)));
            if (partsToAdd.length === 0) continue;

            const created = await createArtistInputs(row, partsToAdd.length);

            let createdIndex = 0;
            const numAlreadyEntered = presentSet.size;

            for (let idx = 0; idx < artistParts.length; idx++) {
                const part = artistParts[idx] || '';
                if (presentSet.has(normalize(part))) {
                    continue;
                }
                const added = created[createdIndex++];
                if (!added) {
                    log(`Track ${i + 1}: missing input for "${part}"`, 'warning');
                    continue;
                }
                const artistInput = added.artistInput;
                const artistContainer = added.artistContainer;
                const removeButton = added.removeButton;
                const oldArtist = artistInput ? (artistInput.value || '').trim() : '';
                setReactValue(artistInput, part);

                if (idx > 0 && idx - 1 < separators.length) {
                    const sepRaw = separators[idx - 1] || '';
                    const joinValue = sepRaw.trim();
                    let joinInputs = Array.from(row.querySelectorAll('input[placeholder="Join"], input[aria-label="Join"]'));

                    const joinInputIndex = numAlreadyEntered + idx - 1;
                    let joinInput = joinInputs[joinInputIndex];

                    if (!joinInput) {
                        joinInput = getJoinInputForArtistRow(row, artistInput, artistContainer, joinInputIndex);
                    }
                    if (joinInput) {
                        setReactValue(joinInput, joinValue);
                    }
                }

                changes.push({
                    titleInput,
                    oldTitle: title,
                    newTitle,
                    artistInput,
                    artistContainer,
                    removeButton,
                    oldArtist,
                    newArtist: part
                });
                processed++;
                log(`Track ${i + 1}: Extracted main artist "${part}"`, 'success');
            }

            if (state.removeMainFromTitle) {
                setReactValue(titleInput, newTitle);
            }
        }

        if (changes.length > 0) addActionToHistory({ type: 'artists', changes });

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Extracted ${processed} artist${plural}`, true);
            log(`Done! Extracted ${processed} artist${plural}`, 'success');
        } else if (foundButAlreadyEntered > 0) {
            setInfoSingleLine('Artists already entered', false);
            log('Artists already entered', 'info');
        } else {
            setInfoSingleLine('No artists found', false);
            log('No artists found', 'info');
        }
    }

    async function removeMainArtistsFromTitle() {
        await setInfoProcessing();
        log('Starting main-artist removal (title-only)...', 'info');

        let trackRows = getTrackInputRows();
        if (trackRows.length === 0) {
            await clearInfoProcessing();
            log('No track rows found', 'error');
            setInfoSingleLine('No tracks found', false);
            return;
        }

        const changes = [];
        let processed = 0;

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const title = (titleInput.value || '').trim();

            let match = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
            if (!match) match = title.match(/^(.+?)\s*[-—]\s*(.+)$/);

            if (!match) continue;

            const oldTitle = title;
            const newTitle = match[2].trim();

            if (newTitle === oldTitle) continue;

            setReactValue(titleInput, newTitle);
            changes.push({ titleInput, oldTitle, newTitle });
            processed++;
            log(`Track ${i + 1}: Removed main artist part, title -> "${newTitle}"`, 'success');
        }

        if (changes.length > 0) {
            addActionToHistory({ type: 'artists', changes });
        }

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Cleaned ${processed} artist title${plural}`, true);
            log(`Done! Removed artists from ${processed} title${plural}`, 'success');
        } else {
            setInfoSingleLine('No artists found', false);
            log('No artists found', 'info');
        }
    }

    function surgicalRemoval(title, featPattern, remixOrPattern) {
        let newTitle = title;
        const containerRegex = /([\(\[\uFF08\uFF3B]\s*(.*?)\s*[\)\]\uFF09\uFF3D])/g;
        const replacements = [];
        containerRegex.lastIndex = 0;

        let match;
        while ((match = containerRegex.exec(title)) !== null) {
            const fullBracket = match[1];
            const inner = match[2] || '';
            const featKeywordRegex = new RegExp(`${featPattern}`, 'i');
            const remixKeywordRegex = new RegExp(`\\b(?:${remixOrPattern})\\b`, 'i');

            if (!featKeywordRegex.test(inner)) continue;

            let newInner = inner;
            if (remixKeywordRegex.test(inner)) {
                const fMatch = inner.match(featKeywordRegex);
                const rMatch = inner.match(remixKeywordRegex);

                if (fMatch.index < rMatch.index) {
                    const textAfterFeatMatch = inner.substring(fMatch.index + fMatch[0].length).trim();
                    const firstWord = textAfterFeatMatch.split(/\s+/)[0];
                    const textToKeep = textAfterFeatMatch.substring(firstWord.length).trim();
                    newInner = inner.substring(0, fMatch.index) + textToKeep;
                } else {
                    newInner = inner.substring(0, fMatch.index);
                }
            } else {
                newInner = '';
            }

            newInner = newInner.trim().replace(/^[,;:\-\s/]+/, '').replace(/[,;:\-\s/]+$/, '');
            replacements.push({
                original: fullBracket,
                replacement: newInner === '' ? '' : fullBracket.charAt(0) + newInner + fullBracket.charAt(fullBracket.length - 1)
            });
        }

        replacements.forEach(rep => {
            newTitle = newTitle.replace(rep.original, rep.replacement);
        });

        const featOutsideRegex = new RegExp(`\\s*\\b(?:${featPattern})\\b[^(\\[]*`, 'i');
        newTitle = newTitle.replace(featOutsideRegex, ' ').trim();

        return newTitle
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+([\(\[])/g, ' $1')
            .replace(/[\(\[]\s*[\)\]]/g, '')
            .trim();
    }

    async function removeFeaturingFromTitle() {
        await setInfoProcessing();
        log('Starting feat artist removal (title-only)...', 'info');

        let trackRows = getTrackInputRows();
        if (trackRows.length === 0) {
            await clearInfoProcessing();
            log('No track rows found', 'error');
            setInfoSingleLine('No tracks found', false);
            return;
        }

        const featPattern = buildFeaturingPattern();
        const remixOrPattern = getAllRemixTokensRegex();

        const changes = [];
        let processed = 0;

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;

            const originalTitle = (titleInput.value || '').trim();
            const newTitle = surgicalRemoval(originalTitle, featPattern, remixOrPattern);

            if (newTitle !== originalTitle) {
                setReactValue(titleInput, newTitle);
                changes.push({ titleInput, oldTitle: originalTitle, newTitle });
                processed++;
                log(`Track ${i + 1}: Removed feat artist part, title -> "${newTitle}"`, 'success');
            }
        }

        if (changes.length > 0) {
            addActionToHistory({ type: 'featuring', changes });
        }

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Cleaned ${processed} feat title${plural}`, true);
            log(`Done! Removed feat artists from ${processed} title${plural}`, 'success');
        } else {
            setInfoSingleLine('No feat artists found', false);
            log('No feat artists found', 'info');
        }
    }

    async function extractFeaturing() {
        await setInfoProcessing();
        log('Starting feat artist extraction...', 'info');
        let trackRows = getTrackInputRows();
        let processed = 0;
        let foundButAlreadyEntered = 0;
        const historyChanges = [];
        const featPattern = buildFeaturingPattern();
        const remixTerminatorPattern = getAllRemixTokensRegex();
        const pendingByRow = new WeakMap();

        function normalizeForCompare(name) {
            if (!name) return '';
            return String(name)
                .replace(/\s*\(\d+\)\s*$/g, '')
                .replace(/^[\(\[]+|[\)\]]+$/g, '')
                .trim()
                .toLowerCase();
        }

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const originalTitle = titleInput.value.trim();

            const featSearchRegex = new RegExp(`(${featPattern})\\s*(.*?)(?=\\b(?:${remixTerminatorPattern})\\b|[\\(\\)\\[\\]]|$)`, 'gi');

            let match;
            let foundInThisTrack = false;

            while ((match = featSearchRegex.exec(originalTitle)) !== null) {
                let featArtistsText = match[2].trim();
                if (!featArtistsText) continue;

                const remainingInBracket = originalTitle.substring(match.index + match[0].length);



                const sameBracketRemix = !/^[\)\]]/.test(remainingInBracket.trim()) &&
                    new RegExp(`^[^\\)\\]]*?\\b(?:${remixTerminatorPattern})\\b`, 'i').test(remainingInBracket);

                if (sameBracketRemix) {




                    const remixByPattern = CONFIG.REMIX_BY_PATTERNS.map(p => patternToRegex(p)).join('|');
                    const remainingStartsWithRemixBy = new RegExp(`^\\s*(?:${remixByPattern})\\b`, 'i').test(remainingInBracket);
                    if (!remainingStartsWithRemixBy) {
                        featArtistsText = featArtistsText.split(/\s+/)[0];
                    }
                }

                const parts = splitArtistsByConfiguredPatterns(featArtistsText);
                if (parts.length === 0) continue;

                const savedExtras = getSavedCreditsInRow(row, 'extra');
                const savedFeatArtists = savedExtras
                    .filter(credit => credit.role.toLowerCase().includes('featur'))
                    .map(credit => normalizeForCompare(credit.artist));
                const openFeatArtists = getOpenCreditsInRow(row)
                    .filter(c => c.role.toLowerCase().includes('featur'))
                    .map(c => normalizeForCompare(c.artist));

                if (!pendingByRow.has(row)) pendingByRow.set(row, new Set());
                const pending = pendingByRow.get(row);

                const partsToAdd = parts.filter(p => {
                    const normalized = normalizeForCompare(p);
                    return !savedFeatArtists.includes(normalized) &&
                           !openFeatArtists.includes(normalized) &&
                           !pending.has('feat:' + normalized);
                });

                if (partsToAdd.length === 0 && parts.length > 0) {
                    foundButAlreadyEntered++;
                    continue;
                }

                const inputs = await createCreditItems(row, partsToAdd.length);
                for (let k = 0; k < partsToAdd.length && k < inputs.length; k++) {
                    const { artistInput, roleInput, newCreditItem, removeButton } = inputs[k];

                    const n = normalizeForCompare(partsToAdd[k]);
                    setReactValue(roleInput, 'Featuring');
                    setReactValue(artistInput, partsToAdd[k]);
                    pending.add('feat:' + n);

                    historyChanges.push({
                        titleInput,
                        oldTitle: originalTitle,
                        newTitle: originalTitle,
                        roleInput,
                        artistInput,
                        artist: partsToAdd[k],
                        creditItem: newCreditItem,
                        removeButton: removeButton
                    });
                    processed++;
                    foundInThisTrack = true;
                    log(`Track ${i + 1}: Extracted feat artist "${partsToAdd[k]}"`, 'success');
                }
            }

            if (foundInThisTrack && state.removeFeatFromTitle) {
                const cleanedTitle = surgicalRemoval(originalTitle, featPattern, remixTerminatorPattern);
                setReactValue(titleInput, cleanedTitle);
                historyChanges.forEach(ch => { if (ch.titleInput === titleInput) ch.newTitle = cleanedTitle; });
            }
        }

        if (historyChanges.length > 0) {
            addActionToHistory({ type: 'featuring', changes: historyChanges });
        }

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Extracted ${processed} feat artist${plural}`, true);
            log(`Done! Extracted ${processed} feat artist${plural}`, 'success');
        } else if (foundButAlreadyEntered > 0) {
            setInfoSingleLine('Feat artists already entered', false);
            log('Feat artists already entered', 'info');
        } else {
            setInfoSingleLine('No feat artists found', false);
            log('No feat artists found', 'info');
        }
    }

    function getActiveRemixTokens() {
        if (state.remixOptionalEnabled) {
            return CONFIG.REMIX_PATTERNS.concat(CONFIG.REMIX_PATTERNS_OPTIONAL);
        }
        return CONFIG.REMIX_PATTERNS.slice();
    }

    function updateRemixToggleUI() {
        const toggle = document.getElementById('toggle-remix-optional');
        if (!toggle) return;
        toggle.textContent = state.remixOptionalEnabled ? '✓' : '';
        toggle.removeAttribute('title');
        toggle.title = wrapTitle(`Automatically extract optional patterns:\n${CONFIG_RAW.REMIX_PATTERNS_OPTIONAL.map(patternToDisplay).join(', ')}`);
        updateRemixButtonTitle();
    }

    function updateRemixButtonTitle() {
        const remixBtn = document.getElementById('extract-remixers');
        if (!remixBtn) return;

        const displayPatterns   = CONFIG_RAW.REMIX_PATTERNS.map(patternToDisplay);
        const displayByPatterns = CONFIG_RAW.REMIX_BY_PATTERNS.map(patternToDisplay).map(p => p.replace(/\s+by\s*$/i, ''));

        let remixPatterns =
            `Remix patterns: ${displayPatterns.join(', ')}\nRemix by patterns: ${displayByPatterns.join(', ')}`;

        if (state.remixOptionalEnabled) {
            const displayOptional = CONFIG_RAW.REMIX_PATTERNS_OPTIONAL.map(patternToDisplay);
            if (displayOptional.length) remixPatterns += `\nOptional patterns: ${displayOptional.join(', ')}`;
        }

        remixBtn.title = wrapTitle(remixPatterns);
    }

    function hasSplitterToken(str) {
        if (!str) return false;
        for (const s of CONFIG.ARTIST_SPLITTER_PATTERNS) {
            const re = new RegExp(escapeRegExp(s), 'i');
            if (re.test(str)) return true;
        }
        return false;
    }

    function lastWordsCandidate(str) {
        if (!str) return '';
        const words = str.trim().split(/\s+/);
        if (words.length === 0) return '';
        return words.pop();
    }

    function capitalizeWord(core, isFirst) {
        if (!core) return core;
        const lc = core.toLowerCase();
        if (core.indexOf('.') !== -1) {
            const parts = core.split('.').filter(Boolean);
            if (parts.length > 1 && parts.every(p => /^[\p{L}]+$/u.test(p) && p.length <= 3)) {
                const suffix = core.endsWith('.') ? '.' : '';
                return parts.map(p => p.toUpperCase()).join('.') + suffix;
            }
        }
        if (CONFIG.CAPITALIZE_KEEP_UPPER.some(w => w.toLowerCase() === lc)) {
            return core.toUpperCase();
        }
        if (!isFirst && CONFIG.CAPITALIZE_KEEP_LOWER.some(w => w.toLowerCase() === lc)) {
            return lc;
        }
        return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
    }

    function capitalizeSegmentSegmentwise(token, isFirst) {
        if (!token) return token;
        if (/^[\p{L}]{1,3}(\.[\p{L}]{1,3})+\.?$/u.test(token)) {
            return token.toUpperCase();
        }
        let firstMatchDone = false;
        return token.replace(/([\p{L}\p{N}\u0027\u2018\u2019\u201B\u02BB\u02BC`]+)/gu, (core) => {
            if (firstMatchDone) {
                return core.toLowerCase();
            }
            firstMatchDone = true;
            return capitalizeWord(core, isFirst);
        });
    }

    function capitalizeTitleString(title, _firstWordSeen) {
        if (typeof title !== 'string') return title;
        title = title.trim();
        if (!title) return title;

        const bracketRegex = /(\[.*?\]|\(.*?\))/gu;
        const parts = [];
        let lastIndex = 0;
        let m;
        while ((m = bracketRegex.exec(title)) !== null) {
            if (m.index > lastIndex) parts.push({ text: title.slice(lastIndex, m.index), bracketed: false });
            parts.push({ text: m[0], bracketed: true });
            lastIndex = m.index + m[0].length;
        }
        if (lastIndex < title.length) parts.push({ text: title.slice(lastIndex), bracketed: false });

        let firstWordDone = !!_firstWordSeen;

        const processedParts = parts.map((part) => {
            const txt = part.text;
            if (part.bracketed) {
                const inner = txt.slice(1, -1);
                const capInner = capitalizeTitleString(inner, false);
                firstWordDone = true;
                return txt.charAt(0) + capInner + txt.charAt(txt.length - 1);
            } else {
                const tokens = txt.split(/(\s+)/u).filter(Boolean);
                if (tokens.length === 0) return txt;
                const outTokens = tokens.map((tok) => {
                    if (!/\p{L}/u.test(tok)) return tok;
                    const internalChars = "\u0027\u2018\u2019\u201B\u02BB\u02BC`";
                    const leadMatch = tok.match(new RegExp(`^([^\\p{L}\\p{N}${internalChars}]*)(.*)$`, 'u'));
                    const lead = (leadMatch ? leadMatch[1] : '') || '';
                    const rest = (leadMatch ? leadMatch[2] : tok) || tok;
                    const trailMatch = rest.match(new RegExp(`^(.*)([^\\p{L}\\p{N}${internalChars}]*)$`, 'u'));
                    const core = (trailMatch ? trailMatch[1] : rest) || rest;
                    const trail = (trailMatch ? trailMatch[2] : '') || '';
                    const isFirst = !firstWordDone;
                    firstWordDone = true;
                    let transformed;
                    if (core.includes('-') || core.includes('/')) {
                        const sep = core.includes('-') ? '-' : '/';
                        transformed = core.split(sep).map((seg, idx) =>
                            seg ? capitalizeSegmentSegmentwise(seg, idx === 0 ? isFirst : true) : ''
                        ).join(sep);
                    } else {
                        transformed = capitalizeSegmentSegmentwise(core, isFirst);
                    }
                    return lead + transformed + trail;
                });
                return outTokens.join('');
            }
        });

        let candidate = processedParts.join('').replace(/\s{2,}/g, ' ').trim();
        candidate = candidate.replace(/:(\s*)(\p{Ll})/gu, (match, space, p1) => ':' + space + p1.toUpperCase());
        return candidate;
    }

    async function cleanTitles() {
        await setInfoProcessing();
        log('Starting title cleanup...', 'info');

        let trackRows = getTrackInputRows();
        if (trackRows.length === 0) {
            await clearInfoProcessing();
            log('No track rows found', 'error');
            setInfoSingleLine('No tracks found', false);
            return;
        }

        const escaped = CONFIG.CLEAN_TITLE_PATTERNS
            .slice()
            .sort((a, b) => b.length - a.length)
            .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const cleanRe = new RegExp(
            `\\s*[\\[(](?:${escaped.join('|')})[\\])]`,
            'gi'
        );

        const changes = [];
        let processed = 0;

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const original = (titleInput.value || '').trim();
            if (!original) continue;

            const cleaned = original.replace(cleanRe, '').trim();
            if (cleaned !== original) {
                setReactValue(titleInput, cleaned);
                changes.push({ titleInput, oldTitle: original, newTitle: cleaned });
                processed++;
                log(`Track ${i + 1}: "${original}" → "${cleaned}"`, 'success');
            }
        }

        if (changes.length > 0) {
            addActionToHistory({ type: 'cleanTitles', changes });
        }

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Cleaned ${processed} title${plural}`, true);
            log(`Done! Cleaned ${processed} title${plural}`, 'success');
        } else {
            setInfoSingleLine('No patterns found to clean', false);
            log('No patterns found to clean', 'info');
        }
    }

    async function bracketsToParen() {
        await setInfoProcessing();
        log('Converting brackets to parentheses...', 'info');

        const trackRows = getTrackInputRows();
        if (trackRows.length === 0) {
            await clearInfoProcessing();
            log('No track rows found', 'error');
            setInfoSingleLine('No tracks found', false);
            return;
        }

        const changes = [];
        let processed = 0;

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const original = (titleInput.value || '').trim();
            if (!original) continue;

            const converted = original.replace(/\[/g, '(').replace(/\]/g, ')');
            if (converted !== original) {
                setReactValue(titleInput, converted);
                changes.push({ titleInput, oldTitle: original, newTitle: converted });
                processed++;
                log(`Track ${i + 1}: "${original}" → "${converted}"`, 'success');
            }
        }

        if (changes.length > 0) {
            addActionToHistory({ type: 'bracketsToParen', changes });
        }

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Converted ${processed} bracket title${plural}`, true);
            log(`Done! Converted ${processed} bracket title${plural}`, 'success');
        } else {
            setInfoSingleLine('No brackets found', false);
            log('No brackets found', 'info');
        }
    }

    async function capitalizeTitles() {
        await setInfoProcessing();
        log('Starting title capitalization...', 'info');

        let trackRows = getTrackInputRows();
        if (trackRows.length === 0) {
            await clearInfoProcessing();
            log('No track rows found', 'error');
            setInfoSingleLine('No tracks found', false);
            return;
        }

        const changes = [];
        let processed = 0;

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const original = (titleInput.value || '').trim();
            if (!original) continue;

            const candidate = capitalizeTitleString(original);
            if (candidate && candidate !== original) {
                setReactValue(titleInput, candidate);
                changes.push({ titleInput, oldTitle: original, newTitle: candidate });
                processed++;
                log(`Track ${i + 1}: "${original}" → "${candidate}"`, 'success');
            }
        }

        if (changes.length > 0) {
            addActionToHistory({ type: 'capitalization', changes });
        }

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Capitalized ${processed} title${plural}`, true);
            log(`Done! Capitalized ${processed} title${plural}`, 'success');
        } else {
            setInfoSingleLine('Titles already capitalized', false);
            log('Titles already capitalized', 'info');
        }
    }

    async function extractRemixers(optionalOnly = false) {
        if (typeof optionalOnly !== 'boolean') optionalOnly = false;
        await setInfoProcessing();
        log(`Starting remixer extraction${optionalOnly ? ' (Strict Optional Only)' : ''}...`, 'info');

        const activeTokens = optionalOnly ? CONFIG.REMIX_PATTERNS_OPTIONAL.slice() : getActiveRemixTokens();
        const remixPatternWords = activeTokens.map(p => patternToRegex(p)).join('|');
        const remixByPatternWordsForRegex = CONFIG.REMIX_BY_PATTERNS.map(p => patternToRegex(p)).join('|');
        const remixByRegexFull = new RegExp(`\\b(?:${remixByPatternWordsForRegex})\\b`, 'i');
        const remixByPatternWords = optionalOnly ? '' : remixByPatternWordsForRegex;
        const splitterRegex = buildSplitterRegexNoGlobal();
        const remixAnyPattern = [remixPatternWords, remixByPatternWords].filter(Boolean).join('|');
        const remixAnyRegex = remixAnyPattern ? new RegExp(`\\b(?:${remixAnyPattern})\\b`, 'i') : null;

        let trackRows = getTrackInputRows();

        function normalizeForCompare(name) {
            if (!name) return '';
            return String(name)
                .replace(/\s*\(\d+\)\s*$/g, '')
                .replace(/^[\(\[]+|[\)\]]+$/g, '')
                .trim()
                .toLowerCase();
        }

        function cleanPartsPreserveWrapping(rawParts) {
            const out = [];
            for (let raw of rawParts) {
                const orig = String(raw || '').trim();
                if (!orig) continue;
                let cleaned = orig.replace(getRemixByRegex(), '');
                cleaned = cleaned.replace(/^by\s+/i, '');
                cleaned = cleanupArtistName(cleaned, true);
                cleaned = cleaned.replace(/[\(\[]+$/g, '').replace(/^[\)\]]+/g, '').trim();
                if (orig.startsWith('[') && !cleaned.endsWith(']')) {
                    cleaned = '[' + cleaned.replace(/^\[+/, '') + ']';
                }
                if (orig.startsWith('(') && !cleaned.endsWith(')')) {
                    cleaned = '(' + cleaned.replace(/^\(+/, '') + ')';
                }
                out.push(cleaned);
            }
            return out;
        }

        const remixersByTrack = [];
        let foundButAlreadyEntered = 0;

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const title = (titleInput.value || '').trim();
            if (!title) continue;

            const containerRegex = /([\(\[\uFF08\uFF3B]\s*(.*?)\s*[\)\]\uFF09\uFF3D])/g;
            let m;
            const remixersForThisTrack = [];

            const savedExtras = getSavedCreditsInRow(row, 'extra') || [];
            const savedRemixArtists = savedExtras
                .filter(credit => credit.role && credit.role.toLowerCase().includes('remix'))
                .map(c => normalizeForCompare(c.artist));
            const openRemixArtists = getOpenCreditsInRow(row)
                .filter(c => c.role.toLowerCase().includes('remix'))
                .map(c => normalizeForCompare(c.artist));
            const alreadyPresent = new Set([...savedRemixArtists, ...openRemixArtists]);

            while ((m = containerRegex.exec(title)) !== null) {
                const inner = (m[2] || '').trim();
                if (!inner) continue;
                if (optionalOnly && remixByRegexFull.test(inner)) continue;

                if (remixByPatternWords) {
                    const remByRegex = new RegExp(`(?:${remixByPatternWords})\\s+(.+)$`, 'i');
                    const remByMatch = inner.match(remByRegex);
                    if (remByMatch && remByMatch[1]) {
                        let raw = remByMatch[1].trim();
                        raw = raw.replace(/^[-–—]\s*/, '').replace(/^by\s+/i, '').trim();

                        const featTokens = CONFIG.FEATURING_PATTERNS.map(escapeRegExp).join('|');
                        const featRegex = new RegExp(`(?:${featTokens})`, 'i');
                        const featMatch = featRegex.exec(raw);
                        let remixes = [];
                        if (featMatch) {
                            const beforeFeat = raw.substring(0, featMatch.index).trim();
                            if (hasSplitterToken(beforeFeat)) {
                                const origParts = beforeFeat.split(splitterRegex).map(s => s.trim()).filter(Boolean);
                                remixes = cleanPartsPreserveWrapping(origParts);
                            } else {
                                const cleaned = cleanPartsPreserveWrapping([beforeFeat]);
                                if (cleaned.length) remixes = [cleaned[0]];
                            }
                        } else {
                            const origParts = raw.split(splitterRegex).map(s => s.trim()).filter(Boolean);
                            remixes = cleanPartsPreserveWrapping(origParts);
                        }
                        if (remixes.length === 0) continue;
                        remixes.forEach(r => {
                            const n = normalizeForCompare(r);
                            if (!alreadyPresent.has(n)) { remixersForThisTrack.push(r); alreadyPresent.add(n); }
                            else if (!remixersForThisTrack.includes(r)) foundButAlreadyEntered++;
                        });
                        continue;
                    }
                }

                if (remixAnyRegex) {
                    const remMatch = inner.match(remixAnyRegex);
                    if (!remMatch) continue;
                    const remIndex = remMatch.index;
                    const remKeyword = remMatch[0];
                    const beforeRemix = inner.substring(0, remIndex).trim();
                    const afterRemix = inner.substring(remIndex + remKeyword.length).trim();
                    let remixes = [];

                    if (!beforeRemix && afterRemix) {
                        const featTokens = CONFIG.FEATURING_PATTERNS.map(escapeRegExp).join('|');
                        const featRegex = new RegExp(`(?:${featTokens})`, 'i');
                        const featMatch = featRegex.exec(afterRemix);
                        const artistCand = featMatch ? afterRemix.substring(0, featMatch.index).trim() : afterRemix;
                        const origParts = artistCand.split(splitterRegex).map(s => s.trim()).filter(Boolean);
                        remixes = cleanPartsPreserveWrapping(origParts);
                    } else if (beforeRemix) {
                        const featTokens = CONFIG.FEATURING_PATTERNS.map(escapeRegExp).join('|');
                        const featRegexGlobal = new RegExp(`(?:${featTokens})`, 'ig');
                        let lastFeat = null, fm;
                        while ((fm = featRegexGlobal.exec(beforeRemix)) !== null) lastFeat = fm;
                        if (lastFeat) {
                            const afterFeat = beforeRemix.substring(lastFeat.index + lastFeat[0].length).trim();
                            if (afterFeat) {
                                if (hasSplitterToken(afterFeat)) {
                                    const origParts = afterFeat.split(splitterRegex).map(s => s.trim()).filter(Boolean);
                                    const parts = cleanPartsPreserveWrapping(origParts);
                                    if (parts.length) remixes = [parts[parts.length - 1]];
                                } else {
                                    const cand = lastWordsCandidate(afterFeat);
                                    if (cand) remixes = cleanPartsPreserveWrapping([cand]);
                                }
                            } else {
                                const beforeFeatOnly = beforeRemix.substring(0, lastFeat.index).trim();
                                if (hasSplitterToken(beforeFeatOnly)) {
                                    const origParts = beforeFeatOnly.split(splitterRegex).map(s => s.trim()).filter(Boolean);
                                    const parts = cleanPartsPreserveWrapping(origParts);
                                    if (parts.length) remixes = [parts[0]];
                                } else {
                                    const lastCand = lastWordsCandidate(beforeFeatOnly);
                                    if (lastCand) remixes = cleanPartsPreserveWrapping([lastCand]);
                                }
                            }
                        } else {
                            if (hasSplitterToken(beforeRemix)) {
                                const origParts = beforeRemix.split(splitterRegex).map(s => s.trim()).filter(Boolean);
                                remixes = cleanPartsPreserveWrapping(origParts);
                            } else {
                                const parts = cleanPartsPreserveWrapping([beforeRemix]);
                                if (parts.length) remixes = [parts[0]];
                            }
                        }
                    }

                    if (remixes.length === 0 && afterRemix) {
                        const byPattern = CONFIG.REMIX_BY_PATTERNS.map(p => patternToRegex(p)).join('|');
                        const startsWithBy = new RegExp(`^(?:${byPattern})\\b`, 'i');
                        if (!startsWithBy.test(afterRemix)) {
                            const featTokens = CONFIG.FEATURING_PATTERNS.map(escapeRegExp).join('|');
                            const featRegex = new RegExp(`(?:${featTokens})`, 'i');
                            const featMatch = featRegex.exec(afterRemix);
                            if (featMatch) {
                                const beforeFeat = afterRemix.substring(0, featMatch.index).trim();
                                if (beforeFeat) {
                                    const origParts = splitArtistsByConfiguredPatterns(beforeFeat);
                                    remixes = cleanPartsPreserveWrapping(origParts);
                                }
                            } else {
                                const origParts = splitArtistsByConfiguredPatterns(afterRemix);
                                remixes = cleanPartsPreserveWrapping(origParts);
                            }
                        }
                    }

                    if (remixes.length > 0) {
                        remixes.forEach(r => {
                            const n = normalizeForCompare(r);
                            if (!alreadyPresent.has(n)) { remixersForThisTrack.push(r); alreadyPresent.add(n); }
                            else if (!remixersForThisTrack.includes(r)) foundButAlreadyEntered++;
                        });
                    }
                }
            }

            if (remixersForThisTrack.length === 0 && !optionalOnly) {
                const remixByPatternFull = CONFIG.REMIX_BY_PATTERNS.map(p => patternToRegex(p)).join('|');
                const remixByRegexOutside = new RegExp(`\\b(?:${remixByPatternFull})\\s+(.+)$`, 'i');
                const remixByMatch = title.match(remixByRegexOutside);

                if (remixByMatch && remixByMatch[1]) {
                    let raw = remixByMatch[1].trim();
                    raw = raw.replace(/^[-–—]\s*/, '').trim();

                    const featTokens = CONFIG.FEATURING_PATTERNS.map(escapeRegExp).join('|');
                    const featRegex = new RegExp(`(?:${featTokens})`, 'i');
                    const featMatch = featRegex.exec(raw);

                    let remixes = [];
                    if (featMatch) {
                        const beforeFeat = raw.substring(0, featMatch.index).trim();
                        const origParts = beforeFeat.split(splitterRegex).map(s => s.trim()).filter(Boolean);
                        remixes = cleanPartsPreserveWrapping(origParts);
                    } else {
                        const origParts = raw.split(splitterRegex).map(s => s.trim()).filter(Boolean);
                        remixes = cleanPartsPreserveWrapping(origParts);
                    }

                    if (remixes.length > 0) {
                        remixes.forEach(r => {
                            const n = normalizeForCompare(r);
                            if (!alreadyPresent.has(n)) {
                                remixersForThisTrack.push(r);
                                alreadyPresent.add(n);
                            } else if (!remixersForThisTrack.includes(r)) {
                                foundButAlreadyEntered++;
                            }
                        });
                    }
                }
            }

            if (remixersForThisTrack.length === 0) {
                const activeRemixTokens = optionalOnly ? CONFIG.REMIX_PATTERNS_OPTIONAL.slice() : getActiveRemixTokens();
                const remixPatternFull = activeRemixTokens.map(p => patternToRegex(p)).join('|');
                const remixRegexOutside = new RegExp(`\\s+(?:${remixPatternFull})\\s*$`, 'i');

                if (remixRegexOutside.test(title)) {
                    const beforeRemix = title.replace(remixRegexOutside, '').trim();

                    if (beforeRemix) {
                        const featTokens = CONFIG.FEATURING_PATTERNS.map(escapeRegExp).join('|');
                        const featRegex = new RegExp(`(?:${featTokens})`, 'i');
                        const featMatch = featRegex.exec(beforeRemix);

                        let lastArtist = '';
                        if (featMatch) {
                            const beforeFeat = beforeRemix.substring(0, featMatch.index).trim();
                            lastArtist = lastWordsCandidate(beforeFeat);
                        } else {
                            lastArtist = lastWordsCandidate(beforeRemix);
                        }

                        if (lastArtist) {
                            const cleaned = cleanupArtistName(lastArtist, true);
                            if (cleaned) {
                                const n = normalizeForCompare(cleaned);
                                if (!alreadyPresent.has(n)) {
                                    remixersForThisTrack.push(cleaned);
                                    alreadyPresent.add(n);
                                } else if (!remixersForThisTrack.includes(cleaned)) {
                                    foundButAlreadyEntered++;
                                }
                            }
                        }
                    }
                }
            }

            if (remixersForThisTrack.length > 0) {
                remixersByTrack.push({ row, titleInput, remixers: remixersForThisTrack, trackIndex: i });
            }
        }

        const changes = [];
        let processed = 0;
        for (const td of remixersByTrack) {
            const { row, titleInput, remixers, trackIndex } = td;
            const inputs = await createCreditItems(row, remixers.length);
            for (let k = 0; k < remixers.length && k < inputs.length; k++) {
                const part = remixers[k];
                const { artistInput, roleInput, newCreditItem, removeButton } = inputs[k];

                if (roleInput) setReactValue(roleInput, 'Remix');
                if (artistInput) setReactValue(artistInput, part);
                changes.push({
                    titleInput,
                    oldTitle: titleInput.value,
                    newTitle: titleInput.value,
                    roleInput,
                    artistInput,
                    role: 'Remix',
                    artist: part,
                    creditItem: newCreditItem,
                    removeButton
                });
                processed++;
                log(`Track ${trackIndex + 1}: Extracted remixer "${part}" (Remix)`, 'success');
            }
        }

        if (changes.length > 0) addActionToHistory({ type: 'remixers', changes });

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Extracted ${processed} remixer${plural}`, true);
            log(`Done! Extracted ${processed} remixer${plural}`, 'success');
        } else if (foundButAlreadyEntered > 0) {
            setInfoSingleLine('Remixers already entered', false);
            log('Remixers already entered', 'info');
        } else {
            setInfoSingleLine('No remixers found', false);
            log('No remixers found', 'info');
        }
    }

    async function tryClickAndWait(removeEl, targetNode, attempts = CONFIG.RETRY_ATTEMPTS, delayMs = CONFIG.RETRY_DELAY_MS) {
        if (!removeEl) return false;
        for (let i = 0; i < attempts; i++) {
            try { dispatchMouseClick(removeEl); } catch (e) { log(`Error clicking remove button: ${e.message}`, 'warning'); }
            await new Promise(resolve => setTimeout(resolve, delayMs));
            if (!targetNode || !targetNode.isConnected) return true;
        }
        return (!targetNode || !targetNode.isConnected);
    }

    function dispatchMouseClick(el) {
        if (!el) return false;
        try {
            el.click();
            ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                el.dispatchEvent(new MouseEvent(eventType, {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    async function clickRemoveCandidateAndVerify(change) {
        const creditItem = change.creditItem || change.artistContainer || null;
        const artistInput = change.artistInput || null;
        const storedRemove = change.removeButton || null;
        if (creditItem) {
            const li = creditItem.tagName && creditItem.tagName.toLowerCase() === 'li' ?
                creditItem :
                (creditItem.closest ? creditItem.closest('li.editable_item') || creditItem.closest('li') : creditItem);
            if (li && li.isConnected) {
                const rb = findRemoveButtonIn(li);
                if (rb) {
                    const success = await tryClickAndWait(rb, li);
                    if (success) return true;
                }
            }
        }
        if (storedRemove && storedRemove.isConnected) {
            const success = await tryClickAndWait(storedRemove, creditItem || artistInput);
            if (success) return true;
        }
        if (artistInput && artistInput.isConnected) {
            const li2 = artistInput.closest('li.editable_item') || artistInput.closest('li') || artistInput.closest('fieldset');
            if (li2 && li2.isConnected) {
                const rb = findRemoveButtonIn(li2);
                if (rb) {
                    const success = await tryClickAndWait(rb, li2);
                    if (success) return true;
                }
            }
        }
        const near = (artistInput && findRemoveNear(artistInput)) || (creditItem && findRemoveNear(creditItem));
        if (near) {
            const success = await tryClickAndWait(near, creditItem || artistInput);
            if (success) return true;
        }
        if (creditItem && creditItem.isConnected) {
            const icon = creditItem.querySelector('i.icon.icon-times, svg.icon-times');
            if (icon) {
                const success = await tryClickAndWait(icon, creditItem);
                if (success) return true;
            }
        }
        return false;
    }

    async function revertLastAction() {
        if (state.actionHistory.length === 0) {
            log('No action to revert', 'warning');
            setInfoSingleLine('No changes to revert', false);
            return;
        }
        await setInfoProcessing();
        const lastAction = state.actionHistory.pop();
        log(`Reverting: ${lastAction.type}`, 'info');

        if (lastAction.type === 'durations') {
            let restored = 0;
            for (const change of lastAction.changes) {
                if (change.titleInput) setReactValue(change.titleInput, change.oldTitle);
                if (change.durationInput) setReactValue(change.durationInput, change.oldDuration || '');
                restored++;
            }
            updateRevertButtons();
            await clearInfoProcessing();
            const plural = restored > 1 ? 's' : '';
            setInfoSingleLine(`Done! Reverted ${restored} duration${plural}`, true);
            log(`Done! Reverted ${restored} duration${plural}`, 'success');
            return;
        }
        if (lastAction.type === 'trackPositions') {
            let restored = 0;
            for (const change of lastAction.changes) {
                if (change.titleInput) setReactValue(change.titleInput, change.oldTitle);
                if (change.trackPositionInput) setReactValue(change.trackPositionInput, change.oldTrackPosition || '');
                restored++;
            }
            updateRevertButtons();
            await clearInfoProcessing();
            const plural = restored > 1 ? 's' : '';
            setInfoSingleLine(`Done! Reverted ${restored} track position${plural}`, true);
            log(`Done! Reverted ${restored} track position${plural}`, 'success');
            return;
        }
        if (lastAction.type === 'cleanTitles' || lastAction.type === 'capitalization' || lastAction.type === 'bracketsToParen') {
            let restored = 0;
            for (const change of lastAction.changes) {
                if (change.titleInput && change.oldTitle !== undefined) {
                    setReactValue(change.titleInput, change.oldTitle);
                    restored++;
                }
            }
            updateRevertButtons();
            await clearInfoProcessing();
            const plural = restored > 1 ? 's' : '';
            const verb = lastAction.type === 'bracketsToParen' ? `bracket title${plural}` :
                         lastAction.type === 'cleanTitles'    ? `cleaned title${plural}` : `capitalized title${plural}`;
            setInfoSingleLine(`Done! Reverted ${restored} ${verb}`, true);
            log(`Done! Reverted ${restored} ${verb}`, 'success');
            return;
        }
        if (lastAction.type === 'artists' || lastAction.type === 'featuring' || lastAction.type === 'remixers') {
            for (const change of lastAction.changes) {
                if (change.titleInput && change.oldTitle !== undefined) {
                    setReactValue(change.titleInput, change.oldTitle);
                }
            }
            const removeActions = [];
            for (const change of lastAction.changes) {
                const creditItem = change.creditItem || change.artistContainer || null;
                const artistInput = change.artistInput || null;
                const storedRemove = change.removeButton || null;
                let removeEl = null;
                let targetNode = creditItem || artistInput;
                if (creditItem) {
                    const li = (creditItem.tagName && creditItem.tagName.toLowerCase() === 'li') ?
                        creditItem :
                        (creditItem.closest ? (creditItem.closest('li.editable_item') || creditItem.closest('li')) : creditItem);
                    if (li) {
                        removeEl = findRemoveButtonIn(li);
                        targetNode = li;
                    }
                }
                if (!removeEl && storedRemove && storedRemove.isConnected) removeEl = storedRemove;
                if (!removeEl && artistInput && artistInput.isConnected) {
                    const li2 = artistInput.closest('li.editable_item') || artistInput.closest('li') || artistInput.closest('fieldset');
                    if (li2) removeEl = findRemoveButtonIn(li2);
                    if (!removeEl) removeEl = findRemoveNear(artistInput);
                }
                if (!removeEl && (creditItem || artistInput)) {
                    removeEl = (creditItem && findRemoveNear(creditItem)) || (artistInput && findRemoveNear(artistInput));
                }
                removeActions.push({ removeEl, targetNode, change });
            }
            for (const act of removeActions) {
                if (act.removeEl && act.removeEl.isConnected) {
                    try { dispatchMouseClick(act.removeEl); } catch (e) {}
                }
            }
            const timeout = 1200;
            const pollInterval = 60;
            const start = Date.now();
            let unresolved = removeActions.filter(a => a.targetNode && a.targetNode.isConnected);
            while (unresolved.length > 0 && (Date.now() - start) < timeout) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                unresolved = removeActions.filter(a => a.targetNode && a.targetNode.isConnected);
            }
            let removed = 0;
            let failed = 0;
            for (const act of removeActions) {
                const change = act.change;
                if (!act.targetNode || !act.targetNode.isConnected) {
                    removed++;
                    continue;
                }
                const success = await clickRemoveCandidateAndVerify(change);
                if (success) removed++; else {
                    failed++;
                    if (change.artistInput && change.oldArtist !== undefined) setReactValue(change.artistInput, change.oldArtist || '');
                    if (change.roleInput) setReactValue(change.roleInput, '');
                }
            }
            updateRevertButtons();
            await clearInfoProcessing();
            const involvesCredits = lastAction.changes.some(ch => ch.artistInput || ch.creditItem || ch.roleInput || ch.removeButton);
            let word;
            if (lastAction.type === 'artists') {
                word = involvesCredits ? 'artist' : 'artist title';
            } else if (lastAction.type === 'featuring') {
                word = involvesCredits ? 'feat artist' : 'feat title';
            } else {
                word = involvesCredits ? 'remixer' : 'remixer title';
            }
            const plural = removed !== 1 ? 's' : '';
            const summary = `Reverted ${removed} ${word}${plural}`;
            if (removed > 0) { setInfoSingleLine(`Done! ${summary}`, true); log(`Done! ${summary}`, 'success'); }
            if (failed > 0) { log(`${failed} removal(s) failed`, 'warning'); if (removed === 0) setInfoSingleLine(`${failed} removal(s) failed`, false); }
            return;
        }
        if (lastAction.type === 'tracklistImport') {
            let restored = 0;
            for (const change of lastAction.changes) {
                if (change.trackPositionInput && change.trackPositionInput.isConnected) {
                    setReactValue(change.trackPositionInput, change.oldTrackPosition || '');
                }
                if (change.titleInput && change.titleInput.isConnected) {
                    setReactValue(change.titleInput, change.oldTitle || '');
                }
                if (change.durationInput && change.durationInput.isConnected) {
                    setReactValue(change.durationInput, change.oldDuration || '');
                }
                restored++;
            }
            if (lastAction.addedRows && lastAction.addedRows.length > 0) {
                const stillPresent = lastAction.addedRows.filter(r => r.isConnected);
                if (stillPresent.length > 0) {
                    try {
                        await removeTracksBatch(stillPresent);
                    } catch(e) {
                        log('Track removal error: ' + e.message, 'warning');
                    }
                }
            }
            updateRevertButtons();
            await clearInfoProcessing();
            setInfoSingleLine(`Done! Reverted ${restored} imported ${restored === 1 ? 'track' : 'tracks'}`, true);
            log(`Done! Reverted ${restored} imported ${restored === 1 ? 'track' : 'tracks'}`, 'success');
            return;
        }
        updateRevertButtons();
        await clearInfoProcessing();
        setInfoSingleLine('Done! Reverted', true);
        log('Done! Reverted', 'success');
    }

    async function revertAllActions() {
        if (state.actionHistory.length === 0) {
            log('No actions to revert', 'warning');
            setInfoSingleLine('No changes to revert', false);
            return;
        }
        await setInfoProcessing();
        log(`Reverting all ${state.actionHistory.length} actions...`, 'info');

        const allChanges = [];
        const historySnapshot = [...state.actionHistory];
        state.actionHistory = [];

        for (const action of historySnapshot) {
            if (action.changes) {
                allChanges.push(...action.changes);
            }
        }

        if (allChanges.length === 0) {
            updateRevertButtons();
            await clearInfoProcessing();
            setInfoSingleLine('No changes to revert', false);
            return;
        }

        const originalTitles = new Map();
        const originalDurations = new Map();
        const originalTrackPositions = new Map();
        for (const change of allChanges) {
            if (change.titleInput && change.oldTitle !== undefined) {
                if (!originalTitles.has(change.titleInput)) {
                    originalTitles.set(change.titleInput, change.oldTitle);
                }
            }
            if (change.durationInput) {
                if (!originalDurations.has(change.durationInput)) {
                    originalDurations.set(change.durationInput, change.oldDuration || '');
                }
            }
            if (change.trackPositionInput) {
                if (!originalTrackPositions.has(change.trackPositionInput)) {
                    originalTrackPositions.set(change.trackPositionInput, change.oldTrackPosition || '');
                }
            }
        }

        for (const [titleInput, originalTitle] of originalTitles) {
            setReactValue(titleInput, originalTitle);
        }
        for (const [durationInput, originalDuration] of originalDurations) {
            setReactValue(durationInput, originalDuration);
        }
        for (const [trackPositionInput, originalTrackPosition] of originalTrackPositions) {
            setReactValue(trackPositionInput, originalTrackPosition);
        }

        const removeActions = [];
        for (const change of allChanges) {
            const creditItem = change.creditItem || change.artistContainer || null;
            const artistInput = change.artistInput || null;
            const storedRemove = change.removeButton || null;
            let removeEl = null;
            let targetNode = creditItem || artistInput;

            if (creditItem) {
                const li = (creditItem.tagName && creditItem.tagName.toLowerCase() === 'li') ?
                    creditItem :
                    (creditItem.closest ? (creditItem.closest('li.editable_item') || creditItem.closest('li')) : creditItem);
                if (li) {
                    removeEl = findRemoveButtonIn(li);
                    targetNode = li;
                }
            }
            if (!removeEl && storedRemove && storedRemove.isConnected) removeEl = storedRemove;
            if (!removeEl && artistInput && artistInput.isConnected) {
                const li2 = artistInput.closest('li.editable_item') || artistInput.closest('li') || artistInput.closest('fieldset');
                if (li2) removeEl = findRemoveButtonIn(li2);
                if (!removeEl) removeEl = findRemoveNear(artistInput);
            }
            if (!removeEl && (creditItem || artistInput)) {
                removeEl = (creditItem && findRemoveNear(creditItem)) || (artistInput && findRemoveNear(artistInput));
            }

            if (removeEl || targetNode) {
                removeActions.push({ removeEl, targetNode, change });
            }
        }

        for (const act of removeActions) {
            if (act.removeEl && act.removeEl.isConnected) {
                try { dispatchMouseClick(act.removeEl); } catch (e) {}
            }
        }

        const timeout = 2000;
        const pollInterval = 100;
        const start = Date.now();
        let unresolved = removeActions.filter(a => a.targetNode && a.targetNode.isConnected);
        while (unresolved.length > 0 && (Date.now() - start) < timeout) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            unresolved = removeActions.filter(a => a.targetNode && a.targetNode.isConnected);
        }

        let totalRemoved = 0;
        let failedRemovals = 0;
        for (const act of removeActions) {
            const change = act.change;
            if (!act.targetNode || !act.targetNode.isConnected) {
                totalRemoved++;
                continue;
            }
            const success = await clickRemoveCandidateAndVerify(change);
            if (success) {
                totalRemoved++;
            } else {
                failedRemovals++;
                if (change.artistInput && change.oldArtist !== undefined) {
                    setReactValue(change.artistInput, change.oldArtist || '');
                }
                if (change.roleInput) {
                    setReactValue(change.roleInput, '');
                }
            }
        }

        const allAddedRows = [];
        for (const action of historySnapshot) {
            if (action.type === 'tracklistImport' && action.addedRows && action.addedRows.length > 0) {
                allAddedRows.push(...action.addedRows.filter(r => r.isConnected));
            }
        }
        if (allAddedRows.length > 0) {
            try {
                await removeTracksBatch(allAddedRows);
            } catch(e) {
                log('Track removal error during revert all: ' + e.message, 'warning');
            }
        }

        updateRevertButtons();
        await clearInfoProcessing();
        setInfoSingleLine(`Done! Reverted all actions`, true);
        log('Done! Reverted all actions', 'success');
        if (failedRemovals > 0) {
            log(`${failedRemovals} removal(s) failed during revert all`, 'warning');
        }
    }

    function updateRevertButtons() {
        const revertLastBtn = document.getElementById('revert-last');
        const revertAllBtn = document.getElementById('revert-all');
        const count = state.actionHistory.length;

        if (revertLastBtn) {
            revertLastBtn.textContent = `↩️ Revert (${count})`;
            if (count > 0) {
                revertLastBtn.disabled = false;
                revertLastBtn.style.opacity = '1';
                revertLastBtn.style.cursor = 'pointer';
            } else {
                revertLastBtn.disabled = true;
                revertLastBtn.style.opacity = '0.6';
                revertLastBtn.style.cursor = 'default';
            }
        }

        if (revertAllBtn) {
            if (count > 0) {
                revertAllBtn.disabled = false;
                revertAllBtn.style.opacity = '1';
                revertAllBtn.style.cursor = 'pointer';
            } else {
                revertAllBtn.disabled = true;
                revertAllBtn.style.opacity = '0.6';
                revertAllBtn.style.cursor = 'default';
            }
        }
    }

    function openConfigPanel() {
        const existing = document.getElementById('dh-config-overlay');
        if (existing) {
            existing.style.display = 'flex';
            _applyThemeToConfigOverlay(existing, localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark');
            return;
        }

        const panel = document.getElementById('helper-panel');
        const panelRect = panel ? panel.getBoundingClientRect() : { top: 165, right: window.innerWidth - 20, width: 255 };
        const rightOffset = window.innerWidth - panelRect.right;
        const overlayWidth = panelRect.width + 220;

        const overlay = document.createElement('div');
        overlay.id = 'dh-config-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: ${panelRect.top - 1}px;
            right: ${rightOffset}px;
            width: ${overlayWidth}px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.12);
            z-index: 10002;
            display: flex;
            flex-direction: column;
            font-family: Arial, sans-serif;
            box-sizing: border-box;
            max-height: 63vh;
            overflow: hidden;
        `;
        const fields = [
            {
                id: 'cfg-splitter',
                label: 'Artist Splitters',
                desc: 'Separators between multiple artists',
                getValue: () => CONFIG.ARTIST_SPLITTER_PATTERNS.join('; '),
            },
            {
                id: 'cfg-featuring',
                label: 'Featuring',
                desc: 'Keywords introducing a featured artist',
                getValue: () => CONFIG.FEATURING_PATTERNS.join('; '),
            },
            {
                id: 'cfg-remix',
                label: 'Remix',
                desc: 'Keywords indicating a remixer at the start of a bracket',
                getValue: () => CONFIG_RAW.REMIX_PATTERNS.join('; '),
            },
            {
                id: 'cfg-remix-by',
                label: 'Remix By',
                desc: 'Keywords indicating a remixer at the end of a bracket',
                getValue: () => CONFIG_RAW.REMIX_BY_PATTERNS.join('; '),
            },
            {
                id: 'cfg-remix-opt',
                label: 'Remix Optional',
                desc: 'Keywords that often do not represent a remix by another artist',
                getValue: () => CONFIG_RAW.REMIX_PATTERNS_OPTIONAL.join('; '),
            },
            {
                id: 'cfg-keep-upper',
                label: 'Always Uppercase',
                desc: 'Words always in uppercase when capitalizing',
                getValue: () => CONFIG.CAPITALIZE_KEEP_UPPER.join('; '),
            },
            {
                id: 'cfg-keep-lower',
                label: 'Always Lowercase',
                desc: 'Words always in lowercase when capitalizing (unless first)',
                getValue: () => CONFIG.CAPITALIZE_KEEP_LOWER.join('; '),
            },
            {
                id: 'cfg-clean-title',
                label: 'Clean Titles',
                desc: 'Redundant bracket contents to strip from titles',
                getValue: () => CONFIG.CLEAN_TITLE_PATTERNS.join('; '),
            },
        ];

        const fieldsHtml = fields.map(f => `
            <div style="margin-bottom:6px;">
                <div style="display:flex; align-items:baseline; gap:5px; margin-bottom:2px;">
                    <span class="dh-cfg-label" style="font-size:10px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; white-space:nowrap;">${f.label}:</span>
                    <span class="dh-cfg-desc" style="font-size:10px; color:#555;">${f.desc}</span>
                </div>
                <input type="text" id="${f.id}" value="${escapeHtml(f.getValue())}"
                    style="width:100%; font-size:12px; font-family:monospace; border:1px solid #ccc; border-radius:4px; padding:4px 6px; box-sizing:border-box; color:#222;">
            </div>
        `).join('');

        overlay.innerHTML = `
            <div class="dh-cfg-header" style="display:flex; align-items:center; justify-content:space-between; padding:5px 8px; border-bottom:1px solid rgba(0,0,0,0.09); flex-shrink:0; gap:6px;">
                <div style="display:flex; align-items:baseline; gap:6px; min-width:0;">
                    <strong style="font-size:13px; user-select:none; cursor:default; white-space:nowrap;">⚙️ Config</strong>
                    <span class="dh-cfg-hint" style="font-size:10px; color:#555; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; user-select:none; -webkit-user-select:none; pointer-events:none;">Patterns are semicolon-separated, changes take effect on save.</span>
                </div>
                <button id="dh-config-close" title="Close" style="background:none; border:none; cursor:pointer; font-size:16px; padding:2px 4px; line-height:1; flex-shrink:0;">✕</button>
            </div>
            <div class="dh-cfg-top-row" style="display:flex; align-items:center; gap:10px; padding:5px 9px 5px; border-bottom:1px solid rgba(0,0,0,0.07); flex-shrink:0; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:5px; font-size:11px; cursor:pointer; user-select:none; white-space:nowrap;"
                    title="Time in seconds before the side panel automatically collapses due to inactivity.">
                    <span class="dh-cfg-top-label" style="font-weight:600;">Timeout (s):</span>
                    <input type="number" id="cfg-timeout" min="5" max="3600"
                        value="${Math.round(CONFIG.INACTIVITY_TIMEOUT_MS / 1000)}"
                        style="width:54px; font-size:12px; border:1px solid #ccc; border-radius:4px; padding:2px 5px; box-sizing:border-box; color:#222;">
                </label>
                <label style="display:flex; align-items:center; gap:5px; font-size:11px; cursor:pointer; user-select:none; white-space:nowrap;"
                    title="If checked, the panel will start collapsed every time the page loads.">
                    <input type="checkbox" id="cfg-start-collapsed" ${state.startCollapsed ? 'checked' : ''}>
                    <span class="dh-cfg-top-label" style="font-weight:600;">Start collapsed</span>
                </label>
            </div>
            <div class="dh-cfg-scroll" style="padding:7px 9px 4px; overflow-y:auto; flex:1;">
                ${fieldsHtml}
            </div>
            <div class="dh-cfg-footer" style="display:flex; gap:6px; padding:6px 9px 8px; flex-shrink:0; border-top:1px solid rgba(0,0,0,0.07);">
                <button id="dh-config-save"    style="flex:2; height:30px; background:#28a745; color:#fff; border:none; border-radius:5px; cursor:pointer; font-size:12px; font-weight:600;">Save</button>
                <button id="dh-config-reset"   style="flex:1; height:30px; background:#f1f3f5; color:#c00; border:1px solid #e4e6e8; border-radius:5px; cursor:pointer; font-size:11px;">Reset defaults</button>
                <button id="dh-config-cancel"  style="flex:1; height:30px; background:#f1f3f5; color:#111; border:1px solid #ccc; border-radius:5px; cursor:pointer; font-size:12px;">Cancel</button>
            </div>
        `;

        document.body.appendChild(overlay);
        _applyThemeToConfigOverlay(overlay, localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark');

        function parseField(id) {
            const el = document.getElementById(id);
            if (!el) return [];
            const raw = el.value;
            const delimiter = raw.includes(';') ? /;\s*/ : /,\s*/;
            return raw.split(delimiter).map(s => s.trim()).filter(Boolean);
        }

        function saveConfig() {
            const timeoutEl = document.getElementById('cfg-timeout');
            const timeoutSecs = timeoutEl ? parseInt(timeoutEl.value, 10) : 0;
            if (timeoutSecs > 0) {
                CONFIG.INACTIVITY_TIMEOUT_MS = timeoutSecs * 1000;
                try { localStorage.setItem(STORAGE_KEYS.CFG_TIMEOUT, String(timeoutSecs)); } catch(e) {}
                resetHideTimer();
            }
            const startCollapsedEl = document.getElementById('cfg-start-collapsed');
            if (startCollapsedEl) {
                state.startCollapsed = startCollapsedEl.checked;
                try { localStorage.setItem(STORAGE_KEYS.CFG_START_COLLAPSED, state.startCollapsed ? '1' : '0'); } catch(e) {}
            }
            const splitter       = parseField('cfg-splitter');
            const featuring      = parseField('cfg-featuring');
            const remix          = parseField('cfg-remix');
            const remixBy        = parseField('cfg-remix-by');
            const remixOpt       = parseField('cfg-remix-opt');
            const keepUpper      = parseField('cfg-keep-upper');
            const keepLower      = parseField('cfg-keep-lower');
            const cleanTitle     = parseField('cfg-clean-title');

            if (splitter.length)    { CONFIG.ARTIST_SPLITTER_PATTERNS = splitter;       saveArrayToStorage(STORAGE_KEYS.CFG_SPLITTER,   splitter); }
            if (featuring.length)   { CONFIG.FEATURING_PATTERNS = featuring;             saveArrayToStorage(STORAGE_KEYS.CFG_FEATURING,  featuring); }
            if (remix.length)       { CONFIG_RAW.REMIX_PATTERNS = remix;                 saveArrayToStorage(STORAGE_KEYS.CFG_REMIX,      remix); }
            if (remixBy.length)     { CONFIG_RAW.REMIX_BY_PATTERNS = remixBy;            saveArrayToStorage(STORAGE_KEYS.CFG_REMIX_BY,   remixBy); }
            if (remixOpt.length)    { CONFIG_RAW.REMIX_PATTERNS_OPTIONAL = remixOpt;     saveArrayToStorage(STORAGE_KEYS.CFG_REMIX_OPT,  remixOpt); }
            if (keepUpper.length)   { CONFIG.CAPITALIZE_KEEP_UPPER = keepUpper;          saveArrayToStorage(STORAGE_KEYS.CFG_KEEP_UPPER, keepUpper); }
            if (keepLower.length)   { CONFIG.CAPITALIZE_KEEP_LOWER = keepLower;          saveArrayToStorage(STORAGE_KEYS.CFG_KEEP_LOWER, keepLower); }
            if (cleanTitle.length)  { CONFIG.CLEAN_TITLE_PATTERNS = cleanTitle;          saveArrayToStorage(STORAGE_KEYS.CFG_CLEAN_TITLE, cleanTitle); }

            applyPatternExpansions();
            updateRemixToggleUI();
            updateRemixButtonTitle();
            const featBtn = document.getElementById('extract-featuring');
            if (featBtn) featBtn.title = wrapTitle(`Feat patterns: ${CONFIG.FEATURING_PATTERNS.join(', ')}`);
            const artistsBtn = document.getElementById('extract-artists');
            if (artistsBtn) {
                artistsBtn.title = wrapTitle('Splitter patterns: ' + CONFIG.ARTIST_SPLITTER_PATTERNS.join(', ') + '\nIncluding feat splitters: ' + CONFIG.FEATURING_PATTERNS.join(', '));
            }
            const cleanBtn = document.getElementById('clean-titles');
            if (cleanBtn) {
                const wrapped = CONFIG.CLEAN_TITLE_PATTERNS.join(', ');
                cleanBtn.title = wrapTitle('Clean titles from redundant bracket contents:\n' + wrapped);
            }

            log('Config saved', 'success');
            setInfoSingleLine('Config saved!', true);
        }

        function resetToDefaults() {
            if (!confirm('Reset all patterns to factory defaults?')) return;

            CONFIG_RAW.REMIX_PATTERNS          = [...CONFIG_DEFAULTS.REMIX_PATTERNS];
            CONFIG_RAW.REMIX_BY_PATTERNS       = [...CONFIG_DEFAULTS.REMIX_BY_PATTERNS];
            CONFIG_RAW.REMIX_PATTERNS_OPTIONAL = [...CONFIG_DEFAULTS.REMIX_PATTERNS_OPTIONAL];

            CONFIG.ARTIST_SPLITTER_PATTERNS = [...CONFIG_DEFAULTS.ARTIST_SPLITTER_PATTERNS];
            CONFIG.FEATURING_PATTERNS       = [...CONFIG_DEFAULTS.FEATURING_PATTERNS];
            CONFIG.CAPITALIZE_KEEP_UPPER    = [...CONFIG_DEFAULTS.CAPITALIZE_KEEP_UPPER];
            CONFIG.CAPITALIZE_KEEP_LOWER    = [...CONFIG_DEFAULTS.CAPITALIZE_KEEP_LOWER];
            CONFIG.CLEAN_TITLE_PATTERNS     = [...CONFIG_DEFAULTS.CLEAN_TITLE_PATTERNS];
            CONFIG.INACTIVITY_TIMEOUT_MS    = CONFIG_DEFAULTS.INACTIVITY_TIMEOUT_MS;
            state.startCollapsed            = false;

            applyPatternExpansions();

            const keys = [
                STORAGE_KEYS.CFG_FEATURING, STORAGE_KEYS.CFG_REMIX, STORAGE_KEYS.CFG_REMIX_BY,
                STORAGE_KEYS.CFG_REMIX_OPT, STORAGE_KEYS.CFG_SPLITTER, STORAGE_KEYS.CFG_KEEP_UPPER,
                STORAGE_KEYS.CFG_KEEP_LOWER, STORAGE_KEYS.CFG_CLEAN_TITLE,
                STORAGE_KEYS.CFG_TIMEOUT, STORAGE_KEYS.CFG_START_COLLAPSED
            ];
            keys.forEach(k => { try { localStorage.removeItem(k); } catch(e) {} });
            fields.forEach(f => {
                const el = document.getElementById(f.id);
                if (el) el.value = f.getValue();
            });
            const tEl = document.getElementById('cfg-timeout');
            if (tEl) tEl.value = Math.round(CONFIG_DEFAULTS.INACTIVITY_TIMEOUT_MS / 1000);
            const scEl = document.getElementById('cfg-start-collapsed');
            if (scEl) scEl.checked = false;

            updateRemixToggleUI();
            updateRemixButtonTitle();
            log('Config reset to defaults', 'success');
            setInfoSingleLine('Defaults restored!', true);
        }

        document.getElementById('dh-config-close').onclick  = () => { overlay.style.display = 'none'; };
        document.getElementById('dh-config-cancel').onclick = () => { overlay.style.display = 'none'; };
        document.getElementById('dh-config-save').onclick   = () => { saveConfig(); overlay.style.display = 'none'; };
        document.getElementById('dh-config-reset').onclick  = resetToDefaults;

        overlay.addEventListener('mousemove', resetHideTimer);
        overlay.addEventListener('click', resetHideTimer);
        overlay.addEventListener('keydown', resetHideTimer);
    }

    function _applyThemeToImporterOverlay(overlay, isDark) {
        if (!overlay) return;
        if (isDark) {
            overlay.style.background  = '#111216';
            overlay.style.color       = '#ddd';
            overlay.style.borderColor = '#262626';
            const ta = overlay.querySelector('#dh-importer-textarea');
            if (ta) { ta.style.background = '#1a1c1f'; ta.style.color = '#ddd'; ta.style.border = '1px solid #333'; }
            const closeBtn = overlay.querySelector('#dh-importer-close');
            if (closeBtn) closeBtn.style.color = '#ddd';
            const strong = overlay.querySelector('strong');
            if (strong) strong.style.color = '#eee';
            const hint = overlay.querySelector('span[style*="font-size:10px"]');
            if (hint) hint.style.color = '#777';
            const hdr = overlay.querySelector('div[style*="border-bottom"]');
            if (hdr) hdr.style.borderBottomColor = 'rgba(255,255,255,0.07)';
            const cancelBtn = overlay.querySelector('#dh-importer-cancel');
            if (cancelBtn) { cancelBtn.style.background = '#1f2224'; cancelBtn.style.color = '#ddd'; cancelBtn.style.borderColor = '#333'; }
        } else {
            overlay.style.background  = '#fff';
            overlay.style.color       = '#111';
            overlay.style.borderColor = '#ccc';
            const ta = overlay.querySelector('#dh-importer-textarea');
            if (ta) { ta.style.background = '#fff'; ta.style.color = '#222'; ta.style.border = '1px solid #ccc'; }
            const closeBtn = overlay.querySelector('#dh-importer-close');
            if (closeBtn) closeBtn.style.color = '#111';
            const strong = overlay.querySelector('strong');
            if (strong) strong.style.color = '#111';
            const hint = overlay.querySelector('span[style*="font-size:10px"]');
            if (hint) hint.style.color = '#555';
            const hdr = overlay.querySelector('div[style*="border-bottom"]');
            if (hdr) hdr.style.borderBottomColor = 'rgba(0,0,0,0.09)';
            const cancelBtn = overlay.querySelector('#dh-importer-cancel');
            if (cancelBtn) { cancelBtn.style.background = '#f1f3f5'; cancelBtn.style.color = '#111'; cancelBtn.style.borderColor = '#ccc'; }
        }
    }

    function _applyThemeToConfigOverlay(overlay, isDark) {
        if (!overlay) return;
        if (isDark) {
            overlay.style.background  = '#111216';
            overlay.style.color       = '#ddd';
            overlay.style.borderColor = '#262626';
            overlay.querySelectorAll('input[type="text"]').forEach(inp => {
                inp.style.background  = '#1a1c1f';
                inp.style.color       = '#ddd';
                inp.style.border      = '1px solid #333';
                inp.style.outline     = 'none';
            });
            overlay.querySelectorAll('.dh-cfg-desc').forEach(el => el.style.color = '#777');
            overlay.querySelectorAll('.dh-cfg-label').forEach(el => el.style.color = '#999');
            const hint = overlay.querySelector('.dh-cfg-hint');
            if (hint) hint.style.color = '#777';
            const hdr = overlay.querySelector('.dh-cfg-header');
            if (hdr) hdr.style.borderBottomColor = 'rgba(255,255,255,0.07)';
            const ftr = overlay.querySelector('.dh-cfg-footer');
            if (ftr) ftr.style.borderTopColor = 'rgba(255,255,255,0.07)';
            const closeBtn = overlay.querySelector('#dh-config-close');
            if (closeBtn) closeBtn.style.color = '#ddd';
            const strong = overlay.querySelector('strong');
            if (strong) strong.style.color = '#eee';
            overlay.querySelectorAll('span[style*="text-transform"]').forEach(el => el.style.color = '#bbb');
            const topRow = overlay.querySelector('.dh-cfg-top-row');
            if (topRow) topRow.style.borderBottomColor = 'rgba(255,255,255,0.07)';
            overlay.querySelectorAll('.dh-cfg-top-label').forEach(el => el.style.color = '#ccc');
            const timeoutInp = overlay.querySelector('#cfg-timeout');
            if (timeoutInp) { timeoutInp.style.background = '#1a1c1f'; timeoutInp.style.color = '#ddd'; timeoutInp.style.borderColor = '#333'; }
            const cancelBtn = overlay.querySelector('#dh-config-cancel');
            if (cancelBtn) { cancelBtn.style.background = '#1f2224'; cancelBtn.style.color = '#ddd'; cancelBtn.style.borderColor = '#333'; }
            const resetBtn = overlay.querySelector('#dh-config-reset');
            if (resetBtn) { resetBtn.style.background = '#1f2224'; resetBtn.style.borderColor = '#333'; }
        } else {
            overlay.style.background  = '#fff';
            overlay.style.color       = '#111';
            overlay.style.borderColor = '#ccc';
            overlay.querySelectorAll('input[type="text"]').forEach(inp => {
                inp.style.background  = '#fff';
                inp.style.color       = '#222';
                inp.style.border      = '1px solid #ccc';
                inp.style.outline     = '';
            });
            overlay.querySelectorAll('.dh-cfg-desc').forEach(el => el.style.color = '#555');
            overlay.querySelectorAll('.dh-cfg-label').forEach(el => el.style.color = '');
            const hintEl = overlay.querySelector('.dh-cfg-hint');
            if (hintEl) hintEl.style.color = '#555';
            const topRow = overlay.querySelector('.dh-cfg-top-row');
            if (topRow) topRow.style.borderBottomColor = 'rgba(0,0,0,0.07)';
            overlay.querySelectorAll('.dh-cfg-top-label').forEach(el => el.style.color = '');
            const timeoutInp = overlay.querySelector('#cfg-timeout');
            if (timeoutInp) { timeoutInp.style.background = ''; timeoutInp.style.color = '#222'; timeoutInp.style.borderColor = '#ccc'; }
            const hdr = overlay.querySelector('.dh-cfg-header');
            if (hdr) hdr.style.borderBottomColor = 'rgba(0,0,0,0.09)';
            const ftr = overlay.querySelector('.dh-cfg-footer');
            if (ftr) ftr.style.borderTopColor = 'rgba(0,0,0,0.07)';
            const closeBtn = overlay.querySelector('#dh-config-close');
            if (closeBtn) closeBtn.style.color = '#111';
            const strong = overlay.querySelector('strong');
            if (strong) strong.style.color = '#111';
            const cancelBtn = overlay.querySelector('#dh-config-cancel');
            if (cancelBtn) { cancelBtn.style.background = '#f1f3f5'; cancelBtn.style.color = '#111'; cancelBtn.style.borderColor = '#ccc'; }
            const resetBtn = overlay.querySelector('#dh-config-reset');
            if (resetBtn) { resetBtn.style.background = '#f1f3f5'; resetBtn.style.borderColor = '#e4e6e8'; }
        }
    }

    function applyTheme(theme) {
        const panel = document.getElementById('helper-panel');
        if (!panel) return;
        const panelContent = panel.querySelector('#panel-content');
        const styleButtons = panel.querySelectorAll('.dh-btn');
        const themeBtn = panel.querySelector('#theme-toggle');
        const collapseBtn = panel.querySelector('#collapse-panel');
        const closeBtn = panel.querySelector('#close-panel');
        const configBtn = panel.querySelector('#config-panel');
        const logContainer = panel.querySelector('#log-container');
        const infoDiv = panel.querySelector('#track-info');
        const headerTitle = panel.querySelector('.panel-header strong');
        const featToggle = document.getElementById('toggle-feat-remove');
        const mainToggle = document.getElementById('toggle-main-remove');
        const remixToggle = document.getElementById('toggle-remix-optional');
        const activeBlueLight = '#1e66d6';
        const activeBlueDark = '#0b5fd6';
        const inactiveBgLight = 'rgba(0,0,0,0.05)';
        const inactiveBgDark = 'rgba(255,255,255,0.04)';
        const borderColLight = 'rgba(0,0,0,0.12)';
        const borderColDark = 'rgba(255,255,255,0.08)';
        const miniButtons = panel.querySelectorAll('#extract-remixers-optional-only, #remove-main-from-title, #remove-feat-from-title');
        const configOverlay = document.getElementById('dh-config-overlay');

        if (theme === 'dark') {
            panel.style.background = '#0f1112';
            panel.style.color = '#ddd';
            if (panelContent) panelContent.style.background = '#111216';
            styleButtons.forEach(btn => { btn.style.background = '#1f2224'; btn.style.color = '#ddd'; btn.style.border = '1px solid #262626'; });
            if (infoDiv) { infoDiv.style.background = '#161718'; infoDiv.style.color = CONFIG.INFO_TEXT_COLOR; }
            if (logContainer) { logContainer.style.background = '#0e0f10'; logContainer.style.color = '#cfcfcf'; }
            if (themeBtn)   { themeBtn.textContent = '☀'; themeBtn.style.color = '#fff'; }
            if (collapseBtn) collapseBtn.style.color = '#fff';
            if (closeBtn)    closeBtn.style.color = '#fff';
            if (configBtn)   configBtn.style.color = '#fff';
            if (headerTitle) { headerTitle.style.color = '#fff'; headerTitle.style.whiteSpace = 'nowrap'; headerTitle.style.overflow = 'hidden'; headerTitle.style.textOverflow = 'ellipsis'; }
            if (featToggle)  { featToggle.style.background = state.removeFeatFromTitle ? activeBlueDark : inactiveBgDark;  featToggle.style.color = '#fff'; featToggle.style.border = `0.5px solid ${state.removeFeatFromTitle ? '#1b446f' : borderColDark}`; }
            if (mainToggle)  { mainToggle.style.background = state.removeMainFromTitle ? activeBlueDark : inactiveBgDark;  mainToggle.style.color = '#fff'; mainToggle.style.border = `0.5px solid ${state.removeMainFromTitle ? '#1b446f' : borderColDark}`; }
            if (remixToggle) { remixToggle.style.background = state.remixOptionalEnabled ? activeBlueDark : inactiveBgDark; remixToggle.style.color = '#fff'; remixToggle.style.border = `0.5px solid ${state.remixOptionalEnabled ? '#1b446f' : borderColDark}`; }
            miniButtons.forEach(mb => { mb.style.background = inactiveBgDark; mb.style.borderColor = borderColDark; });
            panel.querySelectorAll('.dh-divider').forEach(d => { d.style.background = 'rgba(255,255,255,0.07)'; });
            const ph = panel.querySelector('.panel-header'); if (ph) ph.style.borderBottomColor = 'rgba(255,255,255,0.07)';

            _applyThemeToConfigOverlay(configOverlay, true);
            _applyThemeToImporterOverlay(document.getElementById('dh-importer-overlay'), true);
        } else {
            panel.style.background = '#fff';
            panel.style.color = '#111';
            if (panelContent) panelContent.style.background = '#fff';
            styleButtons.forEach(btn => { btn.style.background = '#f1f3f5'; btn.style.color = '#111'; btn.style.border = '1px solid #e4e6e8'; });
            if (infoDiv) { infoDiv.style.background = '#f8f9fa'; infoDiv.style.color = CONFIG.INFO_TEXT_COLOR; }
            if (logContainer) { logContainer.style.background = '#f8f9fa'; logContainer.style.color = '#6b6b6b'; }
            if (themeBtn)   { themeBtn.textContent = '☾'; themeBtn.style.color = '#111'; }
            if (collapseBtn) collapseBtn.style.color = '#111';
            if (closeBtn)    closeBtn.style.color = '#111';
            if (configBtn)   configBtn.style.color = '#111';
            if (headerTitle) { headerTitle.style.color = '#111'; headerTitle.style.whiteSpace = 'nowrap'; headerTitle.style.overflow = 'hidden'; headerTitle.style.textOverflow = 'ellipsis'; }
            if (featToggle)  { featToggle.style.background = state.removeFeatFromTitle ? activeBlueLight : inactiveBgLight; featToggle.style.color = state.removeFeatFromTitle ? '#fff' : '#111'; featToggle.style.border = `0.5px solid ${state.removeFeatFromTitle ? '#bfcfe8' : borderColLight}`; }
            if (mainToggle)  { mainToggle.style.background = state.removeMainFromTitle ? activeBlueLight : inactiveBgLight; mainToggle.style.color = state.removeMainFromTitle ? '#fff' : '#111'; mainToggle.style.border = `0.5px solid ${state.removeMainFromTitle ? '#bfcfe8' : borderColLight}`; }
            if (remixToggle) { remixToggle.style.background = state.remixOptionalEnabled ? activeBlueLight : inactiveBgLight; remixToggle.style.color = state.remixOptionalEnabled ? '#fff' : '#111'; remixToggle.style.border = `0.5px solid ${state.remixOptionalEnabled ? '#bfcfe8' : borderColLight}`; }
            miniButtons.forEach(mb => { mb.style.background = inactiveBgLight; mb.style.borderColor = borderColLight; });
            panel.querySelectorAll('.dh-divider').forEach(d => { d.style.background = 'rgba(0,0,0,0.08)'; });
            const ph2 = panel.querySelector('.panel-header'); if (ph2) ph2.style.borderBottomColor = 'rgba(0,0,0,0.08)';

            _applyThemeToConfigOverlay(configOverlay, false);
            _applyThemeToImporterOverlay(document.getElementById('dh-importer-overlay'), false);
        }
        if (featToggle)  { featToggle.title = 'Automatically remove feat artists from titles'; featToggle.textContent  = state.removeFeatFromTitle  ? '✓' : ''; }
        if (mainToggle)  { mainToggle.title = 'Automatically remove main artists from titles'; mainToggle.textContent  = state.removeMainFromTitle  ? '✓' : ''; }
        if (remixToggle) updateRemixToggleUI();
    }

    function initThemeFromStorage() {
        let theme = 'light';
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.THEME_KEY);
            if (stored === 'dark' || stored === 'light') theme = stored;
        } catch (e) { log('Could not load theme preference', 'warning'); }
        applyTheme(theme);
    }

    function wrapTitle(text, charsPerLine = 55) {
        const lines = text.split('\n');
        return lines.map(line => {
            if (line.length <= charsPerLine) return line;
            const words = line.split(', ');
            let out = '', cur = '';
            for (const w of words) {
                const add = cur ? cur + ', ' + w : w;
                if (add.length > charsPerLine && cur) { out += (out ? '\n' : '') + cur; cur = w; }
                else cur = add;
            }
            if (cur) out += (out ? '\n' : '') + cur;
            return out;
        }).join('\n');
    }

    function addPanelStyles() {
        if (document.getElementById('discogs-helper-panel-styles')) return;
        const css = `
            .dh-btn {
                height: 34px !important;
                line-height: 1 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: flex-start !important;
                white-space: nowrap !important;
                padding: 0 10px !important;
                margin-bottom: 5px !important;
                font-size: 14px !important;
                border-radius: 5px !important;
                gap: 6px !important;
                letter-spacing: 0.01em !important;
                transition: opacity 0.1s !important;
            }
            .dh-btn:hover { opacity: 0.85 !important; }
            .dh-btn:active { opacity: 0.7 !important; }
            .dh-icon-btn {
                height: 34px !important;
                flex: 1 1 0 !important;
                min-width: 0 !important;
                width: auto !important;
                max-width: none !important;
                justify-content: center !important;
                font-size: 18px !important;
                padding: 0 !important;
                margin-bottom: 0 !important;
                border-radius: 5px !important;
            }
            .dh-divider {
                height: 1px; margin: 5px 0; border: none;
                background: rgba(0,0,0,0.07); border-radius: 1px;
            }
            #revert-last, #revert-all {
                margin-bottom: 0 !important;
                font-size: 14px !important;
                height: 34px !important;
                padding: 0 10px !important;
            }
            #dh-importer-textarea::-webkit-resizer { width: 15px; height: 15px; }
            #dh-importer-textarea { resize: vertical; }
            #helper-panel {
                border-radius: 8px !important; overflow: hidden !important;
                box-sizing: border-box !important;
            }
            #helper-panel .panel-header strong {
                white-space: nowrap; overflow: hidden;
                text-overflow: ellipsis; display: inline-block; vertical-align: middle;
            }
            #helper-panel #panel-content { box-sizing: border-box; background: transparent; }
            #helper-panel #log-container {
                border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;
                box-sizing: border-box;
            }
            #helper-panel, #helper-panel * { box-sizing: border-box; }
            #track-info {
                font-size: 13px !important;
                padding: 4px 8px !important;
                border-radius: 4px !important;
                margin-top: 5px !important;
            }
            #extract-remixers-optional-only, #remove-main-from-title, #remove-feat-from-title,
            #toggle-feat-remove, #toggle-remix-optional, #toggle-main-remove {
                width: 30px !important; height: 30px !important;
                display: inline-flex; align-items: center; justify-content: center;
                border-radius: 5px; cursor: pointer; user-select: none;
                transition: all 0.1s ease-in-out;
                border-width: 0.5px !important; border-style: solid; flex-shrink: 0;
            }
            #toggle-feat-remove, #toggle-remix-optional, #toggle-main-remove { font-size: 16px !important; }
            #extract-remixers-optional-only { font-size: 18px !important; }
            #remove-main-from-title, #remove-feat-from-title { font-size: 16px !important; }
            #extract-remixers-optional-only:hover, #remove-main-from-title:hover,
            #remove-feat-from-title:hover, #toggle-feat-remove:hover,
            #toggle-remix-optional:hover, #toggle-main-remove:hover { transform: scale(1.12); }
            #extract-remixers-optional-only:active, #remove-main-from-title:active,
            #remove-feat-from-title:active, #toggle-feat-remove:active,
            #toggle-remix-optional:active, #toggle-main-remove:active { transform: scale(0.9); }
            #toggle-feat-remove:focus, #toggle-remix-optional:focus, #toggle-main-remove:focus {
                outline: 2px solid rgba(30,102,214,0.3); outline-offset: 1px;
            }
            #dh-config-overlay input[type="text"]:focus {
                outline: 2px solid rgba(30,102,214,0.35);
                border-color: #6aabf7 !important;
            }
            #dh-config-overlay .dh-cfg-scroll > div {
                border: none !important;
                box-shadow: none !important;
            }
        `;
        const style = document.createElement('style');
        style.id = 'discogs-helper-panel-styles';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function getTrackInputRows() {
        const candidates = new Set([
            ...document.querySelectorAll('tr.track_row'),
            ...document.querySelectorAll('tr.subform_track.track_track'),
            ...document.querySelectorAll('tr[data-path^="/tracks/"]'),
            ...document.querySelectorAll('tr[class*="track"]')
        ]);
        return Array.from(candidates).filter(r =>
            r.querySelector('input.track-number-input') ||
            r.querySelector('input[id*="track-title"]') ||
            r.querySelector('input[data-type="track-title"]')
        );
    }

    function parseTracklist(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const results = [];
        const durationRe = /[\[(]?\b(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\b[\])]?\s*$/;
        const multiCdRe = /^[\[(]?0*(\d+)-0*(\d+)[\]).]?[.\-\s]+/;
        const posRe = /^[\[(]?([A-Za-z]{0,2}\d+[A-Za-z]?)[\]).]?[.\-\s]+/;
        const noiseRe = /\s+(?:video|buy\s+track|buy|lyrics|info|more|stream|listen|play|download)\s*$/i;
        for (const line of lines) {
            let remaining = line.replace(noiseRe, '').trim();
            let position = '';
            let duration = '';
            const multiMatch = remaining.match(multiCdRe);
            if (multiMatch) {
                position = multiMatch[1] + '-' + multiMatch[2];
                remaining = remaining.slice(multiMatch[0].length).trim();
            } else {
                const posMatch = remaining.match(posRe);
                if (posMatch) {
                    position = posMatch[1];
                    remaining = remaining.slice(posMatch[0].length).trim();
                }
            }
            const durMatch = remaining.match(durationRe);
            if (durMatch) {
                duration = durMatch[1];
                remaining = remaining.slice(0, remaining.length - durMatch[0].length).trim();
                remaining = remaining.replace(/[-\u2013\u2014\s]+$/, '').trim();
            }
            const title = remaining.trim();
            if (title || position) results.push({ position, title, duration });
        }
        return results;
    }

    async function addTracksBatch(count) {
        if (count <= 0) return;
        const addSelect = document.querySelector('select[aria-label="Select the number of tracks to add"]');
        const addButton = addSelect && addSelect.nextElementSibling;
        if (!addSelect || !addButton) { log('Could not find Add Tracks controls', 'error'); return false; }
        const firstRow = getTrackInputRows()[0] || document.querySelector('tr[class*="track"]');
        const tracklistEl = document.querySelector('.section_tracklist') ||
                            document.querySelector('[class*="tracklist"]') ||
                            (firstRow && (firstRow.closest('fieldset') || firstRow.closest('section') || firstRow.closest('tbody')));
        const prevVisibility = tracklistEl ? tracklistEl.style.visibility : null;
        if (tracklistEl) tracklistEl.style.visibility = 'hidden';

        const hideStyle = document.createElement('style');
        hideStyle.textContent = [
            'select[aria-label="Select the number of tracks to add"] { visibility: hidden !important; }',
            'select[aria-label="Select the number of tracks to add"] + button { visibility: hidden !important; }',
        ].join(' ');
        document.head.appendChild(hideStyle);

        let remaining = count;
        while (remaining > 0) {
            const batch = Math.min(remaining, 20);
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
            nativeSetter.call(addSelect, String(batch));
            addSelect.dispatchEvent(new Event('change', { bubbles: true }));
            addButton.click();
            remaining -= batch;
            await new Promise(resolve => setTimeout(resolve, CONFIG.PROCESSING_DELAY_MS * 2));
        }
        await new Promise(resolve => setTimeout(resolve, CONFIG.PROCESSING_DELAY_MS));

        hideStyle.remove();
        if (tracklistEl && prevVisibility !== null) tracklistEl.style.visibility = prevVisibility;
        return true;
    }

    async function removeTracksBatch(trackRowsToRemove) {
        if (!trackRowsToRemove || !trackRowsToRemove.length) return;
        const firstR = trackRowsToRemove[0];
        let tracklistEl = null;
        try {
            tracklistEl = firstR ? (
                document.querySelector('.section_tracklist') ||
                firstR.closest('fieldset') ||
                firstR.closest('section') ||
                firstR.closest('tbody')
            ) : null;
        } catch(e) {}

        if (tracklistEl) tracklistEl.style.visibility = 'hidden';

        const hideMenuStyle = document.createElement('style');
        hideMenuStyle.textContent = 'ul.action_menu { visibility: hidden !important; pointer-events: none !important; }';
        document.head.appendChild(hideMenuStyle);

        const removeLinks = [];
        for (const row of trackRowsToRemove) {
            if (!row.isConnected) continue;
            try {
                const menuToggle = row.querySelector('button.action_menu_toggler');
                if (!menuToggle) continue;
                menuToggle.click();
                await new Promise(resolve => setTimeout(resolve, 0));
                const menu = row.querySelector('ul.action_menu') ||
                    Array.from(document.querySelectorAll('ul.action_menu')).pop();
                if (!menu) continue;
                const link = Array.from(menu.querySelectorAll('a[role="menuitem"]'))
                    .find(a => a.textContent.replace(/\s+/g, ' ').trim().toLowerCase().startsWith('remove track'));
                if (link) removeLinks.push(link);
                else menuToggle.click();
            } catch(e) {
                log('Menu open error: ' + e.message, 'warning');
            }
        }

        for (const link of removeLinks) {
            try { link.click(); } catch(e) {}
        }

        hideMenuStyle.remove();

        await new Promise(resolve => setTimeout(resolve, CONFIG.PROCESSING_DELAY_MS));
        if (tracklistEl) tracklistEl.style.visibility = '';

        try {
            const firstTrackRow = getTrackInputRows()[0];
            if (firstTrackRow) firstTrackRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch(e) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        log(`Removed ${removeLinks.length} of ${trackRowsToRemove.length} track row(s)`, removeLinks.length > 0 ? 'success' : 'warning');
    }

    async function applyTracklist(parsed) {
        if (!parsed.length) { log('No tracks parsed from text', 'warning'); return; }
        await setInfoProcessing();
        const changes = [];

        let trackRows = getTrackInputRows();
        const existingCount = trackRows.length;

        let prefixBlanks = 0;
        const firstPos = parsed[0] && parsed[0].position;
        if (firstPos) {
            const firstNum = parseInt(firstPos.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(firstNum) && firstNum > 1) {
                prefixBlanks = firstNum - 1;
            }
        }

        const totalNeeded = prefixBlanks + parsed.length;
        const needed = totalNeeded - existingCount;
        let addedCount = 0;
        if (needed > 0) {
            const ok = await addTracksBatch(needed);
            if (!ok) { await clearInfoProcessing(); return; }
            addedCount = needed;
        }

        await new Promise(resolve => setTimeout(resolve, CONFIG.PROCESSING_DELAY_MS));
        trackRows = getTrackInputRows();

        let filled = 0;
        parsed.forEach((entry, i) => {
            const rowIndex = prefixBlanks + i;
            const row = trackRows[rowIndex];
            if (!row) return;
            const posInput   = row.querySelector('input.track-number-input');
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            const durInput   = row.querySelector('td.subform_track_duration input, input[aria-label*="duration" i]');
            const oldPosition = posInput ? (posInput.value || '') : '';
            const oldTitle    = titleInput ? (titleInput.value || '') : '';
            const oldDuration = durInput ? (durInput.value || '') : '';
            if (entry.position && posInput)  setReactValue(posInput,   trimLeadingZeros(entry.position));
            if (entry.title    && titleInput) setReactValue(titleInput, entry.title);
            if (entry.duration && durInput)   setReactValue(durInput,   trimLeadingZeros(entry.duration));
            changes.push({
                trackPositionInput: posInput,
                oldTrackPosition: oldPosition,
                newTrackPosition: entry.position ? trimLeadingZeros(entry.position) : oldPosition,
                titleInput,
                oldTitle,
                newTitle: entry.title || oldTitle,
                durationInput: durInput,
                oldDuration,
                newDuration: entry.duration ? trimLeadingZeros(entry.duration) : oldDuration
            });
            filled++;
        });

        const addedRows = [];
        if (addedCount > 0) {
            const freshArr = getTrackInputRows();
            addedRows.push(...freshArr.slice(freshArr.length - addedCount));
        }

        if (changes.length > 0 || addedRows.length > 0) {
            addActionToHistory({ type: 'tracklistImport', changes, addedRows });
        }
        await clearInfoProcessing();
        setInfoSingleLine(`Done! Imported ${filled} ${filled === 1 ? 'track' : 'tracks'}`, true);
        log(`Tracklist import: ${filled} ${filled === 1 ? 'track' : 'tracks'} populated`, 'success');
    }

    function openTracklistImporter() {
        const existing = document.getElementById('dh-importer-overlay');
        if (existing) { existing.style.display = 'flex'; document.getElementById('dh-importer-textarea').focus(); return; }
        const panel = document.getElementById('helper-panel');
        const panelRect = panel ? panel.getBoundingClientRect() : { top: 165, right: window.innerWidth - 20, width: 255 };
        const importerWidth = panelRect.width + 220;
        const textareaHeight = Math.max(160, (panelRect.height || 0) - 103);
        const rightOffset = window.innerWidth - panelRect.right;
        const overlay = document.createElement('div');
        overlay.id = 'dh-importer-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: ${panelRect.top - 1}px;
            right: ${rightOffset}px;
            width: ${importerWidth}px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.12);
            z-index: 10001;
            display: flex;
            flex-direction: column;
            font-family: Arial, sans-serif;
            box-sizing: border-box;
        `;
        overlay.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:5px 8px; border-bottom:1px solid rgba(0,0,0,0.09); gap:6px;">
                <div style="display:flex; align-items:baseline; gap:6px; min-width:0;">
                    <strong style="font-size:13px; user-select:none; -webkit-user-select:none; cursor:default; white-space:nowrap;">📝 Tracklist Import</strong>
                    <span style="font-size:10px; color:#555; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; user-select:none; -webkit-user-select:none; pointer-events:none;">Positions and durations will be auto-detected.</span>
                </div>
                <button id="dh-importer-close" title="Close" style="background:none; border:none; cursor:pointer; font-size:16px; padding:2px 4px; line-height:1; flex-shrink:0;">✕</button>
            </div>
            <div style="padding:7px 7px 0;">
                <textarea id="dh-importer-textarea" placeholder="Recommended tracklist formatting patterns:
1 - Artist - Track Title 03:45
02. Artist — Track Title 40:01
03) Artist - Track Title 3:18
[A4] - Track Title [0:04:15]
(B5) Track Title (00:07:38)
1-6 - Track Title 01:17:19
Track Title 10:06:21
etc" style="width:100%; height:${textareaHeight}px; font-size:12px; font-family:monospace; border:1px solid #ccc; border-radius:4px; padding:6px; box-sizing:border-box; resize:vertical;"></textarea>
            </div>
            <div style="display:flex; gap:6px; padding:7px 7px 7px;">
                <button id="dh-importer-confirm" style="flex:1; height:32px; background:#28a745; color:#fff; border:none; border-radius:5px; cursor:pointer; font-size:13px; font-weight:600;">Confirm</button>
                <button id="dh-importer-cancel" style="flex:1; height:32px; background:#f1f3f5; color:#111; border:1px solid #ccc; border-radius:5px; cursor:pointer; font-size:13px;">Cancel</button>
            </div>
        `;
        document.body.appendChild(overlay);
        _applyThemeToImporterOverlay(overlay, localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark');
        const textarea = document.getElementById('dh-importer-textarea');
        textarea.value = state.importerText;
        function normalizeTracklistText(raw) {
            const lines = raw.split('\n').map(l => l.replace(/\t/g, ' ').trim()).filter(l => l.length > 0);
            const out = [];
            let i = 0;
            while (i < lines.length) {
                const line = lines[i];
                if (/^[A-Za-z]{0,2}\d+[A-Za-z]?\.?$/.test(line)) {
                    const parts = [line.replace(/\.+$/, '')];
                    i++;
                    while (i < lines.length && !/^[A-Za-z]{0,2}\d+[A-Za-z]?\.?$/.test(lines[i])) {
                        parts.push(lines[i]);
                        i++;
                    }
                    const num = parts[0];
                    const rest = parts.slice(1).join(' ').trim();
                    if (rest) out.push(num + '. ' + rest);
                    else out.push(num + '.');
                } else {
                    out.push(line);
                    i++;
                }
            }
            return out.join('\n');
        }
        textarea.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData('text');
            const cleaned = normalizeTracklistText(pasted);
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const before = textarea.value.substring(0, start);
            const after = textarea.value.substring(end);
            const sepBefore = (before.length > 0 && !before.endsWith('\n')) ? '\n' : '';
            const sepAfter = (after.length > 0 && !after.startsWith('\n') && after.trim().length > 0) ? '\n' : '';
            const combined = before + sepBefore + cleaned + sepAfter + after;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeSetter.call(textarea, combined);
            const newPos = before.length + sepBefore.length + cleaned.length;
            textarea.setSelectionRange(newPos, newPos);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });
        textarea.addEventListener('input', () => { state.importerText = textarea.value; });
        document.getElementById('dh-importer-close').onclick = () => { state.importerText = textarea.value; overlay.style.display = 'none'; };
        document.getElementById('dh-importer-cancel').onclick = () => { state.importerText = textarea.value; overlay.style.display = 'none'; };
        document.getElementById('dh-importer-confirm').onclick = async () => {
            state.importerText = textarea.value;
            overlay.style.display = 'none';
            const parsed = parseTracklist(state.importerText);
            if (!parsed.length) { log('Nothing to import — no tracks detected', 'warning'); setInfoSingleLine('Nothing to import', false); return; }
            log(`Importing ${parsed.length} ${parsed.length === 1 ? 'track' : 'tracks'}...`);
            await applyTracklist(parsed);
        };
        overlay.addEventListener('mousemove', resetHideTimer);
        overlay.addEventListener('click', resetHideTimer);
        overlay.addEventListener('keydown', resetHideTimer);
        textarea.focus();
    }

    function createPanel() {
        const existing = document.getElementById('helper-panel');
        if (existing) existing.remove();
        const panel = document.createElement('div');
        panel.id = 'helper-panel';
        panel.style.cssText = `
            position: fixed;
            right: 20px;
            top: 165px;
            width: 255px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            z-index: 10000;
            font-family: Arial, sans-serif;
            box-sizing: border-box;
        `;
        panel.innerHTML = `
            <div class="panel-header" style="
                padding: 5px 8px;
                display: flex; align-items: center; gap: 4px;
                border-bottom: 1px solid rgba(0,0,0,0.09);
            ">
                <strong id="panel-title" style="font-size: 13px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.01em; user-select: none; -webkit-user-select: none; cursor: pointer;">Discogs Edit Helper</strong>
                <button id="theme-toggle"   style="background:none; border:none; cursor:pointer; font-size:13px; padding:1px 0; line-height:1; opacity:0.65; width:22px; text-align:center; flex-shrink:0;">☾</button>
                <button id="config-panel"   style="background:none; border:none; cursor:pointer; font-size:13px; padding:1px 0; line-height:1; opacity:0.65; width:22px; text-align:center; flex-shrink:0;">⚙️</button>
                <button id="collapse-panel" style="background:none; border:none; cursor:pointer; font-size:13px; padding:1px 0; line-height:1; opacity:0.65; width:22px; text-align:center; flex-shrink:0;">▲</button>
                <button id="close-panel"    style="background:none; border:none; cursor:pointer; font-size:14px; padding:1px 0; line-height:1; opacity:0.65; width:22px; text-align:center; flex-shrink:0;">✕</button>
            </div>

            <div id="panel-content" style="padding: 7px 7px 6px; box-sizing: border-box;">

                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <button id="extract-track-numbers" class="dh-btn dh-icon-btn">🔢</button>
                    <button id="capitalize-titles"      class="dh-btn dh-icon-btn">🔠</button>
                    <button id="scan-and-extract"       class="dh-btn dh-icon-btn">🕛</button>
                    <button id="tracklist-import"       class="dh-btn dh-icon-btn">📝</button>
                    <button id="save-all-fields"        class="dh-btn dh-icon-btn">💾</button>
                    <button id="cleanup-tools-toggle"   class="dh-btn dh-icon-btn" title="Cleanup tools">▶</button>
                </div>

                <div id="cleanup-tools-dropdown" style="display:none; flex-wrap:wrap; gap:5px; margin-bottom:5px;">
                    <button id="clean-titles"           class="dh-btn dh-icon-btn">✂️</button>
                    <button id="brackets-to-parens"     class="dh-btn dh-icon-btn">[ ]</button>
                </div>

                <hr class="dh-divider">

                <button id="extract-artists"   class="dh-btn" style="width:100%;">👤 Extract Main Artists</button>
                <button id="extract-featuring" class="dh-btn" style="width:100%;">👥 Extract Feat Artists</button>
                <button id="extract-remixers"  class="dh-btn" style="width:100%;">🎶 Extract Remixers</button>

                <hr class="dh-divider">

                <div style="display:flex; gap:5px;">
                    <button id="revert-last" class="dh-btn" style="flex:1;">↩️ Revert (0)</button>
                    <button id="revert-all"  class="dh-btn" style="flex:1;">↩️ Revert All</button>
                </div>

                <div id="track-info" style="
                    background:#f8f9fa; border-radius:4px; font-size:13px;
                    padding:4px 8px; text-align:center;
                    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
                ">Ready</div>

                <div id="log-section" style="margin-top:2px;">
                    <div id="log-toggle" style="display:flex; justify-content:space-between; align-items:center; padding:3px 0; cursor:pointer;">
                        <span style="font-size:9.5px; color:#999; letter-spacing:0.05em; text-transform:uppercase; font-weight:600;">Activity Log</span>
                        <span id="log-arrow" style="font-size:9px; color:#999;">▼</span>
                    </div>
                    <div id="log-container" style="max-height:120px; overflow-y:auto; font-size:10px; font-family:monospace; background:#f8f9fa; padding:4px 5px; border-radius:4px; display:none;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        addPanelStyles();
        const featBtnEl = document.getElementById('extract-featuring');
        if (featBtnEl) featBtnEl.title = wrapTitle(`Feat patterns: ${CONFIG.FEATURING_PATTERNS.join(', ')}`);
        const styleButtons = panel.querySelectorAll('.dh-btn');
        styleButtons.forEach(btn => {
            btn.style.background = '#f1f3f5';
            btn.style.color      = '#111';
            btn.style.border     = '1px solid #e4e6e8';
            btn.style.cursor     = 'pointer';
            btn.style.fontWeight = '500';
            btn.style.fontFamily = 'inherit';
            if (!btn.classList.contains('dh-icon-btn')) {
                btn.style.width = '100%';
            }
        });
        const remixBtn = document.getElementById('extract-remixers');
        if (remixBtn) {
            remixBtn.style.display = 'flex';
            remixBtn.style.alignItems = 'center';
            remixBtn.style.justifyContent = 'flex-start';
            remixBtn.style.gap = '6px';

            const optionalOnlyBtn = document.createElement('span');
            optionalOnlyBtn.id = 'extract-remixers-optional-only';
            optionalOnlyBtn.setAttribute('role', 'button');
            optionalOnlyBtn.setAttribute('tabindex', '0');
            optionalOnlyBtn.textContent = '🎵';
            optionalOnlyBtn.title = wrapTitle(`Extract optional patterns only:\n${CONFIG_RAW.REMIX_PATTERNS_OPTIONAL.map(patternToDisplay).join(', ')}`);
            optionalOnlyBtn.style.cssText = `flex:0 0 auto; margin:0; margin-left:auto; padding:0; width:30px; height:30px;
                font-family:"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Segoe UI Symbol",system-ui,-apple-system,"Helvetica Neue",Arial;
                border-radius:4px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; user-select:none;`;
            optionalOnlyBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); extractRemixers(true); });
            optionalOnlyBtn.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); optionalOnlyBtn.click(); } });
            remixBtn.appendChild(optionalOnlyBtn);

            const remixToggle = document.createElement('span');
            remixToggle.id = 'toggle-remix-optional';
            remixToggle.setAttribute('role', 'button');
            remixToggle.setAttribute('tabindex', '0');
            remixToggle.textContent = state.remixOptionalEnabled ? '✓' : '';
            remixToggle.style.cssText = `flex:0 0 auto; margin:0; padding:0; width:30px; height:30px; border-radius:5px;
                cursor:pointer; display:inline-flex; align-items:center; justify-content:center; user-select:none;`;
            remixToggle.addEventListener('click', (e) => {
                e.stopPropagation(); e.preventDefault();
                state.remixOptionalEnabled = !state.remixOptionalEnabled;
                try { localStorage.setItem(STORAGE_KEYS.REMIX_OPTIONAL_KEY, state.remixOptionalEnabled ? '1' : '0'); } catch (err) {}
                updateRemixToggleUI();
                applyTheme(localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark' ? 'dark' : 'light');
            });
            remixToggle.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); remixToggle.click(); } });
            remixBtn.appendChild(remixToggle);
        }
        const featBtn = document.getElementById('extract-featuring');
        if (featBtn) {
            featBtn.style.display = 'flex';
            featBtn.style.alignItems = 'center';
            featBtn.style.justifyContent = 'flex-start';
            featBtn.style.gap = '6px';

            const removeFeatSmall = document.createElement('span');
            removeFeatSmall.id = 'remove-feat-from-title';
            removeFeatSmall.setAttribute('role', 'button');
            removeFeatSmall.setAttribute('tabindex', '0');
            removeFeatSmall.textContent = '✂️';
            removeFeatSmall.title = 'Remove feat artists from titles';
            removeFeatSmall.style.cssText = `flex:0 0 auto; margin:0; margin-left:auto; padding:0; width:30px; height:30px;
                border-radius:5px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; user-select:none;`;
            removeFeatSmall.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); removeFeaturingFromTitle(); });
            removeFeatSmall.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); removeFeatSmall.click(); } });
            featBtn.appendChild(removeFeatSmall);

            const featToggle = document.createElement('span');
            featToggle.id = 'toggle-feat-remove';
            featToggle.setAttribute('role', 'button');
            featToggle.setAttribute('tabindex', '0');
            featToggle.textContent = state.removeFeatFromTitle ? '✓' : '';
            featToggle.title = 'Automatically remove feat artists from titles';
            featToggle.style.cssText = `flex:0 0 auto; margin:0; padding:0; width:30px; height:30px; border-radius:5px;
                cursor:pointer; display:inline-flex; align-items:center; justify-content:center; user-select:none;`;
            function toggleFeatHandler(e) {
                e.stopPropagation(); e.preventDefault();
                state.removeFeatFromTitle = !state.removeFeatFromTitle;
                featToggle.textContent = state.removeFeatFromTitle ? '✓' : '';
                try { localStorage.setItem(STORAGE_KEYS.FEAT_REMOVE_KEY, state.removeFeatFromTitle ? '1' : '0'); } catch (err) {}
                applyTheme(localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark' ? 'dark' : 'light');
            }
            featToggle.addEventListener('click', toggleFeatHandler);
            featToggle.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') toggleFeatHandler(ev); });
            featBtn.appendChild(featToggle);
        }
        const mainBtn = document.getElementById('extract-artists');
        if (mainBtn) {
            mainBtn.style.display = 'flex';
            mainBtn.style.alignItems = 'center';
            mainBtn.style.justifyContent = 'flex-start';
            mainBtn.style.gap = '6px';

            const removeMain = document.createElement('span');
            removeMain.id = 'remove-main-from-title';
            removeMain.setAttribute('role', 'button');
            removeMain.setAttribute('tabindex', '0');
            removeMain.textContent = '✂️';
            removeMain.title = 'Remove main artists from titles';
            removeMain.style.cssText = `flex:0 0 auto; margin:0; margin-left:auto; padding:0; width:30px; height:30px;
                border-radius:5px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; user-select:none;`;
            removeMain.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); removeMainArtistsFromTitle(); });
            removeMain.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); removeMain.click(); } });
            mainBtn.appendChild(removeMain);

            const mainToggle = document.createElement('span');
            mainToggle.id = 'toggle-main-remove';
            mainToggle.setAttribute('role', 'button');
            mainToggle.setAttribute('tabindex', '0');
            mainToggle.textContent = state.removeMainFromTitle ? '✓' : '';
            mainToggle.title = 'Automatically remove main artists from titles';
            mainToggle.style.cssText = `flex:0 0 auto; margin:0; padding:0; width:30px; height:30px; border-radius:5px;
                cursor:pointer; display:inline-flex; align-items:center; justify-content:center; user-select:none;`;
            function toggleMainHandler(e) {
                e.stopPropagation(); e.preventDefault();
                state.removeMainFromTitle = !state.removeMainFromTitle;
                mainToggle.textContent = state.removeMainFromTitle ? '✓' : '';
                try { localStorage.setItem(STORAGE_KEYS.MAIN_REMOVE_KEY, state.removeMainFromTitle ? '1' : '0'); } catch (err) {}
                applyTheme(localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark' ? 'dark' : 'light');
            }
            mainToggle.addEventListener('click', toggleMainHandler);
            mainToggle.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') toggleMainHandler(ev); });
            mainBtn.appendChild(mainToggle);
        }
        const collapseBtn = document.getElementById('collapse-panel');
        const closeBtn    = document.getElementById('close-panel');
        const themeBtn    = document.getElementById('theme-toggle');
        const configBtn   = document.getElementById('config-panel');
        const logToggle   = document.getElementById('log-toggle');
        const logContainer= document.getElementById('log-container');

        closeBtn.onclick  = () => { panel.style.display = 'none'; if (state.hideTimeout) clearTimeout(state.hideTimeout); };
        configBtn.onclick = () => { openConfigPanel(); resetHideTimer(); };

        closeBtn.title    = 'Close';
        configBtn.title   = 'Config';
        themeBtn.title    = 'Toggle theme';

        const panelTitle = document.getElementById('panel-title');
        if (panelTitle) panelTitle.onclick = () => collapseBtn.click();

        collapseBtn.title = 'Collapse';

        collapseBtn.onclick = () => {
            const content = document.getElementById('panel-content');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                collapseBtn.textContent = '▲';
                collapseBtn.title = 'Collapse';
                state.isCollapsed = false;
                resetHideTimer();
            } else {
                content.style.display = 'none';
                collapseBtn.textContent = '▼';
                collapseBtn.title = 'Expand';
                state.isCollapsed = true;
            }
        };

        document.getElementById('save-all-fields').title        = 'Save / edit all open credit fields';
        document.getElementById('scan-and-extract').title        = 'Extract durations from titles';
        document.getElementById('extract-track-numbers').title   = 'Extract track positions from titles';
        document.getElementById('capitalize-titles').title       = 'Capitalize titles';
        document.getElementById('tracklist-import').title        = 'Tracklist import';
        document.getElementById('revert-last').title             = 'Revert last action';
        document.getElementById('revert-all').title              = 'Revert all actions';

        document.getElementById('save-all-fields').onclick       = saveAllFields;
        document.getElementById('scan-and-extract').onclick      = scanAndExtract;
        document.getElementById('extract-track-numbers').onclick = extractTrackPositions;
        document.getElementById('extract-artists').onclick       = extractArtists;
        document.getElementById('extract-featuring').onclick     = extractFeaturing;
        document.getElementById('extract-remixers').onclick      = extractRemixers;
        document.getElementById('capitalize-titles').onclick     = capitalizeTitles;
        document.getElementById('revert-last').onclick           = revertLastAction;
        document.getElementById('revert-all').onclick            = revertAllActions;
        document.getElementById('tracklist-import').onclick      = openTracklistImporter;

        const artistsBtn = document.getElementById('extract-artists');
        if (artistsBtn) {
            artistsBtn.title = wrapTitle('Splitter patterns: ' + CONFIG.ARTIST_SPLITTER_PATTERNS.join(', ') + '\nIncluding feat splitters: ' + CONFIG.FEATURING_PATTERNS.join(', '));
        }

        const cleanBtn = document.getElementById('clean-titles');
        if (cleanBtn) {
            cleanBtn.title = wrapTitle('Clean titles from redundant bracket contents:\n' + CONFIG.CLEAN_TITLE_PATTERNS.join(', '));
            cleanBtn.onclick = cleanTitles;
        }

        const bracketsBtn = document.getElementById('brackets-to-parens');
        if (bracketsBtn) {
            bracketsBtn.title = 'Convert [ ] brackets to ( ) parentheses in titles';
            bracketsBtn.onclick = bracketsToParen;
        }

        const cleanupToggle = document.getElementById('cleanup-tools-toggle');
        const cleanupDropdown = document.getElementById('cleanup-tools-dropdown');
        if (cleanupToggle && cleanupDropdown) {
            cleanupToggle.addEventListener('click', () => {
                const open = cleanupDropdown.style.display !== 'none';
                cleanupDropdown.style.display = open ? 'none' : 'flex';
                cleanupToggle.textContent = open ? '▶' : '▲';
                const isDark = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark';
                if (open) {
                    cleanupToggle.style.background = isDark ? '#1f2224' : '#f1f3f5';
                } else {
                    cleanupToggle.style.background = isDark ? '#2a3040' : '#dde4ef';
                }
            });
        }

        logToggle.onclick = () => {
            if (!logContainer) return;
            if (logContainer.style.display === 'none' || logContainer.style.display === '') {
                logContainer.style.display = 'block';
                document.getElementById('log-arrow').textContent = '▲';
            } else {
                logContainer.style.display = 'none';
                document.getElementById('log-arrow').textContent = '▼';
            }
        };

        themeBtn.onclick = () => {
            const current = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark' ? 'dark' : 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            try { localStorage.setItem(STORAGE_KEYS.THEME_KEY, next); } catch (e) {}
            applyTheme(next);
        };

        initThemeFromStorage();
        updateRemixToggleUI();
        updateRemixButtonTitle();
        log('Panel initialized');
        if (state.startCollapsed) {
            const content = document.getElementById('panel-content');
            const collapseBtn = document.getElementById('collapse-panel');
            if (content && collapseBtn) {
                content.style.display = 'none';
                collapseBtn.textContent = '▼';
                collapseBtn.title = 'Expand';
                state.isCollapsed = true;
            }
        }
        resetHideTimer();
        updateRevertButtons();
    }

    function resetHideTimer() {
        if (state.hideTimeout) clearTimeout(state.hideTimeout);
        state.hideTimeout = setTimeout(() => { if (!state.isCollapsed) collapsePanel(); }, CONFIG.INACTIVITY_TIMEOUT_MS);
    }

    function collapsePanel() {
        if (state.processingStartTime) return;
        const importer = document.getElementById('dh-importer-overlay');
        if (importer && importer.style.display !== 'none' && importer.style.display !== '') return;
        const configOv = document.getElementById('dh-config-overlay');
        if (configOv && configOv.style.display !== 'none' && configOv.style.display !== '') return;
        const content = document.getElementById('panel-content');
        const collapseBtn = document.getElementById('collapse-panel');
        if (content && collapseBtn && content.style.display !== 'none') {
            content.style.display = 'none';
            collapseBtn.textContent = '▼';
            collapseBtn.title = 'Expand';
            state.isCollapsed = true;
        }
    }

    setTimeout(() => {
        initializeState();
        createPanel();
        updateRevertButtons();
        log('Discogs Edit Helper ready');
        const panel = document.getElementById('helper-panel');
        if (panel) {
            panel.addEventListener('mousemove', resetHideTimer);
            panel.addEventListener('keydown',   resetHideTimer);
            panel.addEventListener('click',     resetHideTimer);
        }
    }, 900);

})();
