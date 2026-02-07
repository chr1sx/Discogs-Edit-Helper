// ==UserScript==
// @name         Discogs Edit Helper
// @namespace    https://github.com/chr1sx/Discogs-Edit-Helper
// @version      1.3.1
// @description  Automatically extracts info from track titles and assigns to the appropriate fields.
// @author       chr1sx
// @match        https://www.discogs.com/release/edit/*
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
        INACTIVITY_TIMEOUT_MS: 45 * 1000,
        MAX_LOG_MESSAGES: 200,
        MAX_HISTORY_STATES: 50,
        RETRY_ATTEMPTS: 4,
        RETRY_DELAY_MS: 140,
        PROCESSING_DELAY_MS: 300,
        INFO_TEXT_COLOR: '#28a745',
        FEATURING_PATTERNS: ['featuring', 'feat', 'ft', 'f/', 'w/'],
        REMIX_PATTERNS: ['remix', 'rmx'],
        REMIX_PATTERNS_OPTIONAL: ['edit', 'mix', 'rework', 'version'],
        REMIX_BY_PATTERNS: ['remixed by', 'remix by', 'rmx by', 'reworked by', 'rework by', 'edited by', 'edit by', 'mixed by', 'mix by', 'version by'],
        ARTIST_SPLITTER_PATTERNS: ['vs', '&', '+', '/', ',']
    };

    const STORAGE_KEYS = {
        THEME_KEY: 'discogs_helper_theme_v2',
        FEAT_REMOVE_KEY: 'discogs_helper_removeFeat',
        MAIN_REMOVE_KEY: 'discogs_helper_removeMain',
        REMIX_OPTIONAL_KEY: 'discogs_helper_remix_optional'
    };

    const state = {
        logMessages: [],
        hideTimeout: null,
        processingTimeout: null,
        processingStartTime: null,
        actionHistory: [],
        isCollapsed: false,
        removeMainFromTitle: true,
        removeFeatFromTitle: false,
        remixOptionalEnabled: false
    };

    function getRemixByRegex() {
        const patterns = CONFIG.REMIX_BY_PATTERNS.map(p => escapeRegExp(p)).join('|');
        return new RegExp(`^(?:${patterns})\\s+`, 'i');
    }

    function getAllRemixTokensRegex() {
        const all = [
            ...CONFIG.REMIX_PATTERNS,
            ...CONFIG.REMIX_PATTERNS_OPTIONAL,
            ...CONFIG.REMIX_BY_PATTERNS
        ].map(p => escapeRegExp(p)).join('|');
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

    function setInfoProcessing() {
        if (state.processingTimeout) {
            clearTimeout(state.processingTimeout);
            state.processingTimeout = null;
        }

        setInfoSingleLine('Processing...');
        state.processingStartTime = Date.now();
    }

    async function clearInfoProcessing() {
        if (state.processingStartTime) {
            const elapsed = Date.now() - state.processingStartTime;
            if (elapsed < CONFIG.PROCESSING_DELAY_MS) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.PROCESSING_DELAY_MS - elapsed));
            }
            state.processingStartTime = null;
        }
    }

    function initializeState() {
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
        if (alphaAlts.length) parts.push(`(?<!\\w)(?:${alphaAlts.join('|')})(?!\\w)`);
        if (nonAlphaAlts.length) parts.push(`(?:${nonAlphaAlts.join('|')})`);
        return parts.join('|');
    }

    function buildSplitterCaptureRegex(includeFeaturing = false) {
    const parts = [];
    if (includeFeaturing) parts.push(buildFeaturingPattern());
    for (const s of CONFIG.ARTIST_SPLITTER_PATTERNS) {
        if (isAlphaToken(s)) {
            parts.push(`(?<!\\w)(?:${escapeRegExp(s)}\\.?)(?!\\w)`);
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
            return `(?<!\\w)(?:${escapeRegExp(s)}\\.?)(?!\\w)`;
        }
        return `(?:${escapeRegExp(s)})`;
    });
    const pattern = parts.join('|');
    return new RegExp(`\\s*(?:${pattern})\\s*`, 'gi');
    }

    function splitArtistsByConfiguredPatterns(raw) {
    if (!raw) return [];
    const tokens = CONFIG.ARTIST_SPLITTER_PATTERNS.map(t => escapeRegExp(t)).join('|');
    const splitter = new RegExp(`\\s*(?:${tokens})\\s*`, 'gi');
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

    async function clickAddArtistButton(row) {
        return new Promise((resolve) => {
            const artistTd = row.querySelector('td.subform_track_artists');
            const addButton = artistTd?.querySelector('button.add-credit-button');
            if (!addButton) { resolve({ success: false }); return; }
            const before = Array.from(artistTd.querySelectorAll('input[data-type="artist-name"], input.credit-artist-name-input'));
            addButton.click();
            let attempts = 0;
            const maxAttempts = 40;
            const interval = setInterval(() => {
                attempts++;
                const inputs = Array.from(artistTd.querySelectorAll('input[data-type="artist-name"], input.credit-artist-name-input'));
                const newInput = inputs.find(input => !before.includes(input));
                if (newInput) {
                    clearInterval(interval);
                    const artistContainer = newInput.closest('li.editable_item') || newInput.closest('li') || newInput.closest('fieldset') || newInput.parentElement;
                    const removeButton = findRemoveButtonIn(artistContainer) || findRemoveNear(newInput);
                    setTimeout(() => resolve({ success: true, artistInput: newInput, artistContainer, removeButton }), 30);
                    return;
                }
                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    resolve({ success: false });
                }
            }, 100);
        });
    }

    async function createArtistInputs(row, count) {
        const artistTd = row.querySelector('td.subform_track_artists');
        const addButton = artistTd?.querySelector('button.add-credit-button');
        if (!addButton || count <= 0) return [];
        const before = Array.from(artistTd.querySelectorAll('input[data-type="artist-name"], input.credit-artist-name-input'));
        const beforeCount = before.length;
        for (let i = 0; i < count; i++) try { addButton.click(); } catch (e) {}
        const timeout = 1200;
        const pollInterval = 40;
        const start = Date.now();
        let nowInputs = Array.from(artistTd.querySelectorAll('input[data-type="artist-name"], input.credit-artist-name-input'));
        while (nowInputs.length < beforeCount + count && (Date.now() - start) < timeout) {
            await new Promise(r => setTimeout(r, pollInterval));
            nowInputs = Array.from(artistTd.querySelectorAll('input[data-type="artist-name"], input.credit-artist-name-input'));
        }
        return nowInputs.slice(beforeCount).map(inp => {
            const container = inp.closest('li.editable_item') || inp.closest('li') || inp.closest('fieldset') || inp.parentElement;
            const removeButton = findRemoveButtonIn(container) || findRemoveNear(inp);
            return { artistInput: inp, artistContainer: container, removeButton };
        });
    }

    async function clickAddCreditButton(row) {
        return new Promise((resolve) => {
            const titleTd = row.querySelector('td.subform_track_title');
            if (!titleTd) { log('Title TD not found for track.', 'error'); resolve(false); return; }
            let creditsEditableList = Array.from(titleTd.querySelectorAll('.editable_list')).find(list => {
                const span = list.querySelector('span:not([data-reactid*="track-number"])');
                return span && span.textContent && span.textContent.includes('Credits');
            });
            if (!creditsEditableList) creditsEditableList = Array.from(titleTd.querySelectorAll('.editable_list')).find(list => list.querySelector('button.add-credit-button'));
            let addButton = creditsEditableList?.querySelector('button.add-credit-button');
            if (!addButton) addButton = titleTd.querySelector('button.add-credit-button') || row.querySelector('button.add-credit-button');
            if (!addButton) { log('Could not find Credits editable list.', 'error'); resolve(false); return; }
            const artistInputsInRow = Array.from(row.querySelectorAll('input.credit-artist-name-input'));
            let beforeMax = -1;
            artistInputsInRow.forEach(input => {
                const id = input.id || '';
                const match = id.match(/artist-name-credits-input-(\d+)/);
                if (match) beforeMax = Math.max(beforeMax, parseInt(match[1], 10));
            });
            addButton.click();
            let attempts = 0;
            const maxAttempts = 60;
            const interval = setInterval(() => {
                attempts++;
                const nowArtistInputs = Array.from(row.querySelectorAll('input.credit-artist-name-input'));
                let newMax = beforeMax;
                nowArtistInputs.forEach(input => {
                    const id = input.id || '';
                    const match = id.match(/artist-name-credits-input-(\d+)/);
                    if (match) newMax = Math.max(newMax, parseInt(match[1], 10));
                });
                if (newMax > beforeMax) {
                    const roleSel = `#add-role-input-${newMax}`;
                    const artistSel = `#artist-name-credits-input-${newMax}`;
                    let roleInput = row.querySelector(roleSel);
                    let artistInput = row.querySelector(artistSel);
                    if (!roleInput || !artistInput) {
                        const creditItemsList = titleTd.querySelector('ul.editable_items_list') || row.querySelector('ul.editable_items_list');
                        if (creditItemsList) {
                            const items = Array.from(creditItemsList.querySelectorAll('li.editable_item, li, fieldset'));
                            const candidate = items[items.length - 1];
                            if (candidate) {
                                const li = candidate.closest('li.editable_item') || candidate.closest('li') || candidate;
                                roleInput = roleInput || li.querySelector('input.add-credit-role-input');
                                artistInput = artistInput || li.querySelector('input.credit-artist-name-input');
                                const removeButton = li.querySelector('button.editable_input_remove') || findRemoveNear(li);
                                clearInterval(interval);
                                setTimeout(() => resolve({ roleInput, artistInput, newCreditItem: li, removeButton }), 20);
                                return;
                            }
                        }
                    }
                    if (!roleInput || !artistInput) {
                        const allRoles = Array.from(document.querySelectorAll('input.add-credit-role-input'));
                        const allArtists = Array.from(document.querySelectorAll('input.credit-artist-name-input'));
                        if (allRoles.length && allArtists.length) {
                            roleInput = allRoles[allRoles.length - 1];
                            artistInput = allArtists[allArtists.length - 1];
                        }
                    }
                    const newCreditItem = (roleInput && roleInput.closest('li.editable_item')) || (artistInput && artistInput.closest('li.editable_item')) || (roleInput && roleInput.closest('li')) || (artistInput && artistInput.closest('li')) || null;
                    const removeButton = newCreditItem ? (newCreditItem.querySelector('button.editable_input_remove') || findRemoveButtonIn(newCreditItem) || findRemoveNear(newCreditItem)) : (titleTd.querySelector('button.editable_input_remove') || findRemoveNear(row));
                    clearInterval(interval);
                    setTimeout(() => resolve({ roleInput, artistInput, newCreditItem, removeButton }), 20);
                    return;
                }
                const creditItemsList = titleTd.querySelector('ul.editable_items_list') || row.querySelector('ul.editable_items_list');
                if (creditItemsList) {
                    const items = Array.from(creditItemsList.querySelectorAll('li.editable_item, li, fieldset'));
                    if (items.length > 0) {
                        const last = items[items.length - 1];
                        const li = last.closest('li.editable_item') || last.closest('li') || last;
                        const roleInput = li.querySelector('input.add-credit-role-input[aria-label="Add Artist Role"], input.add-credit-role-input');
                        const artistInput = li.querySelector('input.credit-artist-name-input[aria-label="Add Artist"], input.credit-artist-name-input');
                        if (roleInput && artistInput) {
                            clearInterval(interval);
                            const removeButton = li.querySelector('button.editable_input_remove') || findRemoveNear(li);
                            setTimeout(() => resolve({ roleInput, artistInput, newCreditItem: li, removeButton }), 20);
                            return;
                        }
                    }
                }
                const allRoles = Array.from(document.querySelectorAll('input.add-credit-role-input'));
                const allArtists = Array.from(document.querySelectorAll('input.credit-artist-name-input'));
                if (allRoles.length > 0 && allArtists.length > 0) {
                    const roleInput = allRoles[allRoles.length - 1];
                    const artistInput = allArtists[allArtists.length - 1];
                    const newCreditItem = (roleInput && roleInput.closest('li.editable_item')) || (artistInput && artistInput.closest('li.editable_item')) || null;
                    clearInterval(interval);
                    const removeButton = newCreditItem ? (newCreditItem.querySelector('button.editable_input_remove') || findRemoveButtonIn(newCreditItem) || findRemoveNear(newCreditItem)) : findRemoveNear(row);
                    setTimeout(() => resolve({ roleInput, artistInput, newCreditItem, removeButton }), 20);
                    return;
                }
                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    log('Timeout waiting for credit inputs to appear', 'error');
                    resolve(false);
                }
            }, 100);
        });
    }

    async function createCreditItems(row, count) {
        const titleTd = row.querySelector('td.subform_track_title');
        if (!titleTd || count <= 0) return [];
        let addButton = titleTd.querySelector('button.add-credit-button') || row.querySelector('button.add-credit-button');
        if (!addButton) return [];
        const artistInputsInRow = Array.from(row.querySelectorAll('input.credit-artist-name-input'));
        let beforeMax = -1;
        artistInputsInRow.forEach(input => {
            const id = input.id || '';
            const match = id.match(/artist-name-credits-input-(\d+)/);
            if (match) beforeMax = Math.max(beforeMax, parseInt(match[1], 10));
        });
        for (let i = 0; i < count; i++) { try { addButton.click(); } catch (e) {} }
        const timeout = 1600;
        const pollInterval = 40;
        const start = Date.now();
        let nowInputs = Array.from(row.querySelectorAll('input.credit-artist-name-input'));
        let nowMax = beforeMax;
        nowInputs.forEach(input => {
            const id = input.id || '';
            const match = id.match(/artist-name-credits-input-(\d+)/);
            if (match) nowMax = Math.max(nowMax, parseInt(match[1], 10));
        });
        while (nowMax < beforeMax + count && (Date.now() - start) < timeout) {
            await new Promise(r => setTimeout(r, pollInterval));
            nowInputs = Array.from(row.querySelectorAll('input.credit-artist-name-input'));
            nowInputs.forEach(input => {
                const id = input.id || '';
                const match = id.match(/artist-name-credits-input-(\d+)/);
                if (match) nowMax = Math.max(nowMax, parseInt(match[1], 10));
            });
        }
        const results = [];
        for (let i = 1; i <= count; i++) {
            const roleSel = `#add-role-input-${beforeMax + i}`;
            const artistSel = `#artist-name-credits-input-${beforeMax + i}`;
            let roleInput = row.querySelector(roleSel);
            let artistInput = row.querySelector(artistSel);
            let newCreditItem = null;
            let removeButton = null;
            if (artistInput) {
                newCreditItem = artistInput.closest('li.editable_item') || artistInput.closest('li') || artistInput.closest('fieldset') || artistInput.parentElement;
                if (!roleInput && newCreditItem) roleInput = newCreditItem.querySelector('input.add-credit-role-input');
                removeButton = newCreditItem ? (newCreditItem.querySelector('button.editable_input_remove') || findRemoveButtonIn(newCreditItem) || findRemoveNear(newCreditItem)) : findRemoveNear(row);
            }
            results.push({ roleInput, artistInput, newCreditItem, removeButton });
        }
        return results;
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
        updateRevertButton();
    }

    async function scanAndExtract() {
        setInfoProcessing();
        await new Promise(resolve => setTimeout(resolve, 0));
        log('Starting duration scan...', 'info');

        let trackRows = document.querySelectorAll('tr.track_row');
        if (trackRows.length === 0) trackRows = document.querySelectorAll('tr[class*="track"]');
        if (trackRows.length === 0) {
            await clearInfoProcessing();
            log('No track rows found', 'error');
            setInfoSingleLine('No tracks found', false);
            return;
        }

        const trailingPattern = /(\d{1,2}:\d{2})\s*$/;
        const bracketPattern = /[\(\[\|]\s*(\d{1,2}:\d{2})\s*[\)\]\|]/;

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
                newTitle = title.replace(/\s*\d{1,2}:\d{2}\s*$/, '').trim();
            } else {
                match = title.match(bracketPattern);
                if (match) {
                    duration = match[1];
                    newTitle = title.replace(match[0], '').trim();
                }
            }

            if (duration) {
                changes.push({
                    titleInput,
                    oldTitle: title,
                    newTitle,
                    durationInput,
                    oldDuration: durationInput.value.trim(),
                    newDuration: duration
                });
                setReactValue(titleInput, newTitle);
                setReactValue(durationInput, duration);
                processed++;
                log(`Track ${index + 1}: Extracted duration "${duration}" and updated title to "${newTitle}"`, 'success');
            }
        });

        if (changes.length > 0) {
            addActionToHistory({ type: 'durations', changes });
        }
        if (processed > 0) {
            await clearInfoProcessing();
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Extracted ${processed} duration${plural}`, true);
            log(`Done! Extracted ${processed} duration${plural}`, 'success');
        } else {
            await clearInfoProcessing();
            setInfoSingleLine('No durations found', false);
        }
    }

    async function extractArtists() {
        setInfoProcessing();
        await new Promise(resolve => setTimeout(resolve, 0));
        log('Starting artist extraction...', 'info');
        let trackRows = document.querySelectorAll('tr.track_row');
        if (trackRows.length === 0) trackRows = document.querySelectorAll('tr[class*="track"]');
        let processed = 0;
        const changes = [];
        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const title = titleInput.value.trim();

            let match = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
            if (!match) match = title.match(/^(.+?)\s*[-—]\s*(.+)$/);

            if (!match) continue;
            const artistText = match[1].trim();
            const newTitle = match[2].trim();
            const existingArtistInput = row.querySelector('td.subform_track_artists input[data-type="artist-name"]');
            if (existingArtistInput && existingArtistInput.value.trim()) continue;
            const splitterWithCapture = buildSplitterCaptureRegex(true);
            const rawTokens = artistText.split(splitterWithCapture).map(s => s.trim()).filter(s => s !== '');
            let artistParts = [];
            let separators = [];
            if (rawTokens.length === 1) {
                artistParts = artistText.split(buildSplitterRegex()).map(p => cleanupArtistName(p, true)).filter(Boolean);
                separators = [];
            } else {
                for (let t = 0; t < rawTokens.length; t++) {
                    if (t % 2 === 0) artistParts.push(cleanupArtistName(rawTokens[t], true));
                    else separators.push(rawTokens[t]);
                }
            }
            if (artistParts.length === 0) continue;
            const created = await createArtistInputs(row, artistParts.length);
            if (created.length < artistParts.length) {
                for (let m = created.length; m < artistParts.length; m++) {
                    const res = await clickAddArtistButton(row);
                    if (res.success) created.push({ artistInput: res.artistInput, artistContainer: res.artistContainer, removeButton: res.removeButton });
                }
            }
            let joinInputs = Array.from(row.querySelectorAll('input[placeholder="Join"], input[aria-label="Join"]'));
            for (let idx = 0; idx < artistParts.length; idx++) {
                const part = artistParts[idx] || '';
                const added = created[idx];
                if (!added) { log(`Track ${i + 1}: missing input for "${part}"`, 'warning'); continue; }
                const artistInput = added.artistInput;
                const artistContainer = added.artistContainer;
                const removeButton = added.removeButton;
                const oldArtistValue = artistInput ? (artistInput.value || '').trim() : '';
                setReactValue(artistInput, part);
                if (idx < separators.length) {
                    const sepRaw = separators[idx] || '';
                    const joinValue = sepRaw.trim();
                    let joinInput = joinInputs[idx] || getJoinInputForArtistRow(row, artistInput, artistContainer, idx);
                    if (joinInput) setReactValue(joinInput, joinValue);
                }
                changes.push({
                    titleInput,
                    oldTitle: title,
                    newTitle,
                    artistInput,
                    artistContainer,
                    removeButton,
                    oldArtist: oldArtistValue,
                    newArtist: part
                });
                processed++;
                log(`Track ${i + 1}: Extracted main artist "${part}"`, 'success');
            }
            if (state.removeMainFromTitle) {
                setReactValue(titleInput, newTitle);
            }
        }
        if (changes.length > 0) {
            addActionToHistory({ type: 'artists', changes });
        }
        if (processed > 0) {
            await clearInfoProcessing();
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Extracted ${processed} artist${plural}`, true);
            log(`Done! Extracted ${processed} artist${plural}`, 'success');
        } else {
            await clearInfoProcessing();
            setInfoSingleLine('No artists found', false);
        }
    }

    async function removeMainArtistsFromTitle() {
        setInfoProcessing();
        await new Promise(resolve => setTimeout(resolve, 0));
        log('Starting main-artist removal (title-only)...', 'info');

        let trackRows = document.querySelectorAll('tr.track_row');
        if (trackRows.length === 0) trackRows = document.querySelectorAll('tr[class*="track"]');
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

        if (processed > 0) {
            await clearInfoProcessing();
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Cleaned ${processed} artist title${plural}`, true);
            log(`Done! Removed artists from ${processed} title${plural}`, 'success');
        } else {
            await clearInfoProcessing();
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
        setInfoProcessing();
        await new Promise(resolve => setTimeout(resolve, 0));
        log('Starting feat artist removal (title-only)...', 'info');

        let trackRows = document.querySelectorAll('tr.track_row');
        if (trackRows.length === 0) trackRows = document.querySelectorAll('tr[class*="track"]');
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

        if (processed > 0) {
            await clearInfoProcessing();
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Cleaned ${processed} feat title${plural}`, true);
            log(`Done! Removed feat artists from ${processed} title${plural}`, 'success');
        } else {
            await clearInfoProcessing();
            setInfoSingleLine('No feat artists found', false);
            log('No feat artists found', 'info');
        }
    }

    async function extractFeaturing() {
        setInfoProcessing();
        await new Promise(resolve => setTimeout(resolve, 0));
        log('Starting feat artist extraction...', 'info');
        let trackRows = document.querySelectorAll('tr.track_row');
        if (trackRows.length === 0) trackRows = document.querySelectorAll('tr[class*="track"]');
        let processed = 0;
        const historyChanges = [];
        const featPattern = buildFeaturingPattern();
        const remixTerminatorPattern = getAllRemixTokensRegex();

        function normalizeForCompare(name) {
            if (!name) return '';
            return String(name).replace(/^[\(\[]+|[\)\]]+$/g, '').trim().toLowerCase();
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
                const hasRemixLater = new RegExp(`^.*?\\b(?:${remixTerminatorPattern})\\b\\s*[\\)\\]]`, 'i').test(remainingInBracket);

                if (hasRemixLater) {
                    featArtistsText = featArtistsText.split(/\s+/)[0];
                }

                const parts = splitArtistsByConfiguredPatterns(featArtistsText);
                if (parts.length === 0) continue;

                const existingVals = Array.from(row.querySelectorAll('input.credit-artist-name-input, input[data-type="artist-name"]'))
                    .map(inp => normalizeForCompare(inp.value || ''));

                const partsToAdd = parts.filter(p => !existingVals.includes(normalizeForCompare(p)));

                const inputs = await createCreditItems(row, partsToAdd.length);
                for (let k = 0; k < partsToAdd.length && k < inputs.length; k++) {
                    const { artistInput, roleInput, newCreditItem, removeButton } = inputs[k];
                    setReactValue(roleInput, 'Featuring');
                    setReactValue(artistInput, partsToAdd[k]);

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
        const plural = processed > 1 ? 's' : '';
        const summary = processed > 0 ? `Done! Extracted ${processed} feat artist${plural}` : 'No feat artists found';
        setInfoSingleLine(summary, processed > 0);
        log(summary, processed > 0 ? 'success' : 'info');
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
        toggle.title = `Automatically extract optional patterns: ${CONFIG.REMIX_PATTERNS_OPTIONAL.join(', ')}`;
        updateRemixButtonTitle();
    }

    function updateRemixButtonTitle() {
        const remixBtn = document.getElementById('extract-remixers');
        if (!remixBtn) return;

        const wrap = (arr, firstLineCount = 4, perLine = 6) => {
            if (!arr || arr.length === 0) {
                return '';
            }

            return arr.reduce((acc, currentVal, index) => {
                if (index === 0) {
                    return currentVal;
                }
                const isLineBreakPoint = (index === firstLineCount || (index > firstLineCount && (index - firstLineCount) % perLine === 0));
                const separator = isLineBreakPoint ? '\n' : ', ';
                return acc + separator + currentVal;
            }, '');
        };

        let remixPatterns =
`Remix Patterns: ${wrap(CONFIG.REMIX_PATTERNS, 6, 8)}
Remix By Patterns: ${wrap(CONFIG.REMIX_BY_PATTERNS, 4, 6)}`;

        const optionalPatternsWrapped = wrap(CONFIG.REMIX_PATTERNS_OPTIONAL, 5, 8);
        if (state.remixOptionalEnabled && optionalPatternsWrapped) {
            remixPatterns += `
Optional Remix Patterns: ${optionalPatternsWrapped}`;
        }

        remixBtn.title = remixPatterns;
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

    function isAllUpper(word) {
        const letters = word.replace(/[^\p{L}]/gu, '');
        if (!letters) return false;
        return letters === letters.toUpperCase();
    }

    function capitalizeSegmentSegmentwise(token) {
        if (!token) return token;
        if (token.indexOf('.') !== -1) {
            const parts = token.split('.').filter(Boolean);
            if (parts.length > 1 && parts.every(p => /^[\p{L}]+$/u.test(p) && p.length <= 3)) {
                const suffix = token.endsWith('.') ? '.' : '';
                return parts.map(p => p.toUpperCase()).join('.') + suffix;
            }
        }

        if (!/['’`ʻ]/.test(token)) {
            if (/[A-Za-z]\.[A-Za-z]/.test(token) || /[A-Z][a-z]*[A-Z]/.test(token)) {
                return token;
            }
        }

        return token.replace(/([\p{L}\p{N}'’`ʻ]+)/gu, (core) => {
            if (isAllUpper(core) && core.length <= 3) {
                return core;
            }
            return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
        });
    }

    function capitalizeTitleString(title) {
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

        const processedParts = parts.map((part) => {
            const txt = part.text;
            if (part.bracketed) {
                const inner = txt.slice(1, -1);
                const capInner = capitalizeTitleString(inner);
                return txt.charAt(0) + capInner + txt.charAt(txt.length - 1);
            } else {
                const tokens = txt.split(/(\s+)/u).filter(Boolean);
                if (tokens.length === 0) return txt;
                const outTokens = tokens.map((tok) => {
                    if (!/\p{L}/u.test(tok)) return tok;
                    const internalChars = "'’`ʻ";
                    const leadMatch = tok.match(new RegExp(`^([^\\p{L}\\p{N}${internalChars}]*)(.*)$`, 'u'));
                    const lead = (leadMatch ? leadMatch[1] : '') || '';
                    const rest = (leadMatch ? leadMatch[2] : tok) || tok;
                    const trailMatch = rest.match(new RegExp(`^(.*)([^\\p{L}\\p{N}${internalChars}]*)$`, 'u'));
                    const core = (trailMatch ? trailMatch[1] : rest) || rest;
                    const trail = (trailMatch ? trailMatch[2] : '') || '';
                    const transformed = capitalizeSegmentSegmentwise(core);
                    return lead + transformed + trail;
                });
                return outTokens.join('');
            }
        });

        let candidate = processedParts.join('').replace(/\s{2,}/g, ' ').trim();
        candidate = candidate.replace(/:\s+(\p{Ll})/gu, (m, p1) => ': ' + p1.toUpperCase());
        return candidate;
    }

    async function capitalizeTitles() {
        setInfoProcessing();
        await new Promise(resolve => setTimeout(resolve, 0));
        log('Starting title capitalization...', 'info');

        let trackRows = document.querySelectorAll('tr.track_row');
        if (trackRows.length === 0) trackRows = document.querySelectorAll('tr[class*="track"]');
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

        if (processed > 0) {
            await clearInfoProcessing();
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Capitalized ${processed} title${plural}`, true);
            log(`Done! Capitalized ${processed} title${plural}`, 'success');
        } else {
            await clearInfoProcessing();
            setInfoSingleLine('No titles found to capitalize', false);
        }
    }

    async function extractRemixers(optionalOnly = false) {
        if (typeof optionalOnly !== 'boolean') optionalOnly = false;

        setInfoProcessing();
        await new Promise(resolve => setTimeout(resolve, 0));
        log(`Starting remixer extraction${optionalOnly ? ' (Strict Optional Only)' : ''}...`, 'info');

        const activeTokens = optionalOnly ? CONFIG.REMIX_PATTERNS_OPTIONAL.slice() : getActiveRemixTokens();
        const remixPatternWords = activeTokens.map(p => escapeRegExp(p)).join('|');

        const remixByPatternWordsForRegex = CONFIG.REMIX_BY_PATTERNS.map(p => escapeRegExp(p)).join('|');
        const remixByRegexFull = new RegExp(`\\b(?:${remixByPatternWordsForRegex})\\b`, 'i');

        const remixByPatternWords = optionalOnly ? '' : remixByPatternWordsForRegex;
        const splitterRegex = buildSplitterRegex();
        const remixAnyPattern = [remixPatternWords, remixByPatternWords].filter(Boolean).join('|');
        const remixAnyRegex = remixAnyPattern ? new RegExp(`\\b(?:${remixAnyPattern})\\b`, 'i') : null;

        let trackRows = document.querySelectorAll('tr.track_row');
        if (trackRows.length === 0) trackRows = document.querySelectorAll('tr[class*="track"]');

        let processed = 0;
        const changes = [];
        const TRACK_TIMEOUT_MS = 8000;

        function normalizeForCompare(name) {
            if (!name) return '';
            return String(name).replace(/^[\(\[]+|[\)\]]+$/g, '').trim().toLowerCase();
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

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const title = titleInput.value.trim();

            const containerRegex = /([\(\[\uFF08\uFF3B]\s*(.*?)\s*[\)\]\uFF09\uFF3D])/g;

            const trackPromise = (async () => {
                try {
                    let matchInContainer;
                    while ((matchInContainer = containerRegex.exec(title)) !== null) {
                        const inner = (matchInContainer[2] || '').trim();

                        if (optionalOnly && remixByRegexFull.test(inner)) {
                            continue;
                        }

                        if (remixByPatternWords) {
                            const remByRegex = new RegExp(`(?:${remixByPatternWords})\\s+(.+)$`, 'i');
                            const remByMatch = inner.match(remByRegex);
                            if (remByMatch && remByMatch[1]) {
                                let raw = remByMatch[1].trim();
                                const featTokens = CONFIG.FEATURING_PATTERNS.map(escapeRegExp).join('|');
                                const featRegex = new RegExp(`(?:${featTokens})`, 'i');
                                const featMatch = featRegex.exec(raw);
                                let remixes = [];
                                if (featMatch) {
                                    const featIndex = featMatch.index;
                                    const beforeFeat = raw.substring(0, featIndex).trim();
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

                                const existingVals = Array.from(row.querySelectorAll('input.credit-artist-name-input, input[data-type="artist-name"], input.add-credit-artist-input'))
                                    .map(inp => normalizeForCompare(inp.value || ''));
                                const partsToAdd = remixes.filter(p => !existingVals.includes(normalizeForCompare(p)));

                                const allArtistInputs = Array.from(row.querySelectorAll('input.credit-artist-name-input, input.add-credit-artist-input, input[data-type="artist-name"], input[name*="artist"]'));
                                const emptyInputs = allArtistInputs.filter(inp => !(inp.value || '').trim());
                                const inputsToUse = [];
                                for (let j = 0; j < Math.min(emptyInputs.length, partsToAdd.length); j++) inputsToUse.push(emptyInputs[j]);
                                const needCreate = partsToAdd.length - inputsToUse.length;
                                if (needCreate > 0) {
                                    const created = await createCreditItems(row, needCreate);
                                    created.forEach(c => { if (c && c.artistInput) inputsToUse.push(c.artistInput); });
                                    while (inputsToUse.length < partsToAdd.length) {
                                        const res = await clickAddCreditButton(row);
                                        if (res && res.artistInput) inputsToUse.push(res.artistInput);
                                        else break;
                                    }
                                }

                                for (let k = 0; k < partsToAdd.length && k < inputsToUse.length; k++) {
                                    const part = partsToAdd[k];
                                    const artistInput = inputsToUse[k];
                                    const li = artistInput ? (artistInput.closest('li.editable_item') || artistInput.closest('li') || artistInput.closest('fieldset')) : null;
                                    const roleInput = li ? (li.querySelector('input.add-credit-role-input') || li.querySelector('input[aria-label="Add Artist Role"]')) : null;
                                    if (roleInput) setReactValue(roleInput, 'Remix');
                                    if (artistInput) {
                                        const oldArtistValue = (artistInput.value || '').trim();
                                        setReactValue(artistInput, part);
                                        changes.push({
                                            titleInput,
                                            oldTitle: title,
                                            newTitle: title,
                                            roleInput,
                                            artistInput,
                                            role: 'Remix',
                                            artist: part,
                                            oldArtist: oldArtistValue,
                                            creditItem: li,
                                            removeButton: findRemoveButtonIn(li)
                                        });
                                        processed++;
                                        log(`Track ${i + 1}: Extracted remixer "${part}" (Remix)`, 'success');
                                    }
                                }
                                continue;
                            }
                        }

                        if (remixAnyRegex) {
                            const remMatch = inner.match(remixAnyRegex);
                            if (remMatch) {
                                const remIndex = remMatch.index;
                                const remKeyword = remMatch[0];
                                const beforeRemix = inner.substring(0, remIndex).trim();
                                const afterRemixStart = remIndex + remKeyword.length;
                                const afterRemix = inner.substring(afterRemixStart).trim();
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
                                    let lastFeatMatch = null;
                                    let fm;
                                    while ((fm = featRegexGlobal.exec(beforeRemix)) !== null) { lastFeatMatch = fm; }

                                    if (lastFeatMatch) {
                                        const lastFeatIndex = lastFeatMatch.index;
                                        const featToken = lastFeatMatch[0];
                                        const afterFeat = beforeRemix.substring(lastFeatIndex + featToken.length).trim();
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
                                            const beforeFeatOnly = beforeRemix.substring(0, lastFeatIndex).trim();
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
                                    const byPattern = CONFIG.REMIX_BY_PATTERNS.map(p => escapeRegExp(p)).join('|');
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
                                    const existingVals = Array.from(row.querySelectorAll('input.credit-artist-name-input, input[data-type="artist-name"], input.add-credit-artist-input'))
                                        .map(inp => normalizeForCompare(inp.value || ''));
                                    const partsToAdd = remixes.filter(p => !existingVals.includes(normalizeForCompare(p)));

                                    const allArtistInputs = Array.from(row.querySelectorAll('input.credit-artist-name-input, input.add-credit-artist-input, input[data-type="artist-name"], input[name*="artist"]'));
                                    const emptyInputs = allArtistInputs.filter(inp => !(inp.value || '').trim());
                                    const inputsToUse = [];
                                    for (let j = 0; j < Math.min(emptyInputs.length, partsToAdd.length); j++) inputsToUse.push(emptyInputs[j]);
                                    const needCreate = partsToAdd.length - inputsToUse.length;
                                    if (needCreate > 0) {
                                        const created = await createCreditItems(row, needCreate);
                                        created.forEach(c => { if (c && c.artistInput) inputsToUse.push(c.artistInput); });
                                        while (inputsToUse.length < partsToAdd.length) {
                                            const res = await clickAddCreditButton(row);
                                            if (res && res.artistInput) inputsToUse.push(res.artistInput);
                                            else break;
                                        }
                                    }

                                    for (let k = 0; k < partsToAdd.length && k < inputsToUse.length; k++) {
                                        const part = partsToAdd[k];
                                        const artistInput = inputsToUse[k];
                                        const li = artistInput ? (artistInput.closest('li.editable_item') || artistInput.closest('li') || artistInput.closest('fieldset')) : null;
                                        const roleInput = li ? (li.querySelector('input.add-credit-role-input') || li.querySelector('input[aria-label="Add Artist Role"]')) : null;
                                        if (roleInput) setReactValue(roleInput, 'Remix');
                                        if (artistInput) {
                                            const oldArtistValue = (artistInput.value || '').trim();
                                            setReactValue(artistInput, part);
                                            changes.push({
                                                titleInput,
                                                oldTitle: title,
                                                newTitle: title,
                                                roleInput,
                                                artistInput,
                                                role: 'Remix',
                                                artist: part,
                                                oldArtist: oldArtistValue,
                                                creditItem: li,
                                                removeButton: findRemoveButtonIn(li)
                                            });
                                            processed++;
                                            log(`Track ${i + 1}: Extracted remixer "${part}" (Remix)`, 'success');
                                        }
                                    }
                                    continue;
                                }
                            }
                        }
                    }
                } catch (err) {
                    log(`Track ${i + 1}: error during remixer extraction: ${err && err.message ? err.message : err}`, 'error');
                }
            })();

            try {
                await Promise.race([
                    trackPromise,
                    new Promise((_, rej) => setTimeout(() => rej(new Error('track-timeout')), TRACK_TIMEOUT_MS))
                ]);
            } catch (err) {
                log(`Track ${i + 1}: extraction failed or timed out`, 'warning');
            }
        }

        if (changes.length > 0) {
            addActionToHistory({ type: 'remixers', changes });
        }
        if (processed > 0) {
            await clearInfoProcessing();
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Extracted ${processed} remixer${plural}`, true);
            log(`Done! Extracted ${processed} remixer${plural}`, 'success');
        } else {
            await clearInfoProcessing();
            setInfoSingleLine('No remixers found', false);
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
        setInfoProcessing();
        await new Promise(resolve => setTimeout(resolve, 0));
        const lastAction = state.actionHistory.pop();
        log(`Reverting: ${lastAction.type}`, 'info');
        if (lastAction.type === 'durations') {
            let restored = 0;
            for (const change of lastAction.changes) {
                if (change.titleInput) setReactValue(change.titleInput, change.oldTitle);
                if (change.durationInput) setReactValue(change.durationInput, change.oldDuration || '');
                restored++;
            }
            updateRevertButton();
            await clearInfoProcessing();
            const plural = restored > 1 ? 's' : '';
            setInfoSingleLine(`Done! Reverted ${restored} duration${plural}`, true);
            log(`Done! Reverted ${restored} duration${plural}`, 'success');
            return;
        }

        if (lastAction.type === 'capitalization') {
            let restored = 0;
            for (const change of lastAction.changes) {
                if (change.titleInput && change.oldTitle !== undefined) {
                    setReactValue(change.titleInput, change.oldTitle);
                    restored++;
                }
            }
            updateRevertButton();
            await clearInfoProcessing();
            const plural = restored > 1 ? 's' : '';
            setInfoSingleLine(`Done! Reverted ${restored} capitalized title${plural}`, true);
            log(`Done! Reverted ${restored} capitalized title${plural}`, 'success');
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
            updateRevertButton();

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
            await clearInfoProcessing();
            if (removed > 0) { setInfoSingleLine(`Done! ${summary}`, true); log(`Done! ${summary}`, 'success'); }
            if (failed > 0) { log(`${failed} removal(s) failed`, 'warning'); if (removed === 0) setInfoSingleLine(`${failed} removal(s) failed`, false); }
            return;
        }
        updateRevertButton();
        await clearInfoProcessing();
        setInfoSingleLine('Done! Reverted', true);
        log('Done! Reverted', 'success');
    }

    function updateRevertButton() {
        const btn = document.getElementById('revert-last');
        if (!btn) return;
        if (state.actionHistory.length > 0) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.textContent = `↩️ Revert Actions (${state.actionHistory.length})`;
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.style.cursor = 'default';
            btn.textContent = '↩️ Revert Actions';
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

        if (theme === 'dark') {
            panel.style.background = '#0f1112';
            panel.style.color = '#ddd';
            if (panelContent) panelContent.style.background = '#111216';
            styleButtons.forEach(btn => { btn.style.background = '#1f2224'; btn.style.color = '#ddd'; btn.style.border = '1px solid #262626'; });
            if (infoDiv) { infoDiv.style.background = '#161718'; infoDiv.style.color = CONFIG.INFO_TEXT_COLOR; }
            if (logContainer) { logContainer.style.background = '#0e0f10'; logContainer.style.color = '#cfcfcf'; }
            if (themeBtn) { themeBtn.textContent = '☀'; themeBtn.style.color = '#fff'; }
            if (collapseBtn) collapseBtn.style.color = '#fff';
            if (closeBtn) closeBtn.style.color = '#fff';
            if (headerTitle) { headerTitle.style.color = '#fff'; headerTitle.style.whiteSpace = 'nowrap'; headerTitle.style.overflow = 'hidden'; headerTitle.style.textOverflow = 'ellipsis'; }

            if (featToggle) { featToggle.style.background = state.removeFeatFromTitle ? activeBlueDark : inactiveBgDark; featToggle.style.color = '#fff'; featToggle.style.border = `0.5px solid ${state.removeFeatFromTitle ? '#1b446f' : borderColDark}`; }
            if (mainToggle) { mainToggle.style.background = state.removeMainFromTitle ? activeBlueDark : inactiveBgDark; mainToggle.style.color = '#fff'; mainToggle.style.border = `0.5px solid ${state.removeMainFromTitle ? '#1b446f' : borderColDark}`; }
            if (remixToggle) { remixToggle.style.background = state.remixOptionalEnabled ? activeBlueDark : inactiveBgDark; remixToggle.style.color = '#fff'; remixToggle.style.border = `0.5px solid ${state.removeRemixOpt ? '#1b446f' : borderColDark}`; }

            miniButtons.forEach(mb => {
                mb.style.background = inactiveBgDark;
                mb.style.borderColor = borderColDark;
            });

        } else {
            panel.style.background = '#fff';
            panel.style.color = '#111';
            if (panelContent) panelContent.style.background = '#fff';
            styleButtons.forEach(btn => { btn.style.background = '#f1f3f5'; btn.style.color = '#111'; btn.style.border = '1px solid #e4e6e8'; });
            if (infoDiv) { infoDiv.style.background = '#f8f9fa'; infoDiv.style.color = CONFIG.INFO_TEXT_COLOR; }
            if (logContainer) { logContainer.style.background = '#f8f9fa'; logContainer.style.color = '#6b6b6b'; }
            if (themeBtn) { themeBtn.textContent = '☾'; themeBtn.style.color = '#111'; }
            if (collapseBtn) collapseBtn.style.color = '#111';
            if (closeBtn) closeBtn.style.color = '#111';
            if (headerTitle) { headerTitle.style.color = '#111'; headerTitle.style.whiteSpace = 'nowrap'; headerTitle.style.overflow = 'hidden'; headerTitle.style.textOverflow = 'ellipsis'; }

            if (featToggle) { featToggle.style.background = state.removeFeatFromTitle ? activeBlueLight : inactiveBgLight; featToggle.style.color = state.removeFeatFromTitle ? '#fff' : '#111'; featToggle.style.border = `0.5px solid ${state.removeFeatFromTitle ? '#bfcfe8' : borderColLight}`; }
            if (mainToggle) { mainToggle.style.background = state.removeMainFromTitle ? activeBlueLight : inactiveBgLight; mainToggle.style.color = state.removeMainFromTitle ? '#fff' : '#111'; mainToggle.style.border = `0.5px solid ${state.removeMainFromTitle ? '#bfcfe8' : borderColLight}`; }
            if (remixToggle) { remixToggle.style.background = state.remixOptionalEnabled ? activeBlueLight : inactiveBgLight; remixToggle.style.color = state.remixOptionalEnabled ? '#fff' : '#111'; remixToggle.style.border = `0.5px solid ${state.remixOptionalEnabled ? '#bfcfe8' : borderColLight}`; }

            miniButtons.forEach(mb => {
                mb.style.background = inactiveBgLight;
                mb.style.borderColor = borderColLight;
            });
        }
        if (featToggle) { featToggle.title = `Automatically remove feat artists from titles`; featToggle.textContent = state.removeFeatFromTitle ? '✓' : ''; }
        if (mainToggle) { mainToggle.title = `Automatically remove main artists from titles`; mainToggle.textContent = state.removeMainFromTitle ? '✓' : ''; }
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

    function addPanelStyles() {
        if (document.getElementById('discogs-helper-panel-styles')) return;
        const css = `
            #helper-panel { border-radius: 8px !important; overflow: hidden !important; box-sizing: border-box !important; }
            #helper-panel .panel-header strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: middle; }
            #helper-panel #panel-content { box-sizing: border-box; background: transparent; }
            #helper-panel #log-container { border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; box-sizing: border-box; }
            #helper-panel, #helper-panel * { box-sizing: border-box; }

            #extract-remixers-optional-only, #remove-main-from-title, #remove-feat-from-title,
            #toggle-feat-remove, #toggle-remix-optional, #toggle-main-remove {
                width: 24px !important;
                height: 24px !important;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                cursor: pointer;
                user-select: none;
                transition: all 0.1s ease-in-out;
                border-width: 0.5px !important;
                border-style: solid;
            }

            #toggle-feat-remove, #toggle-remix-optional, #toggle-main-remove { font-size: 14px !important; }
            #extract-remixers-optional-only { font-size: 15px !important; }
            #remove-main-from-title, #remove-feat-from-title { font-size: 13px !important; }

            #extract-remixers-optional-only:hover, #remove-main-from-title:hover, #remove-feat-from-title:hover,
            #toggle-feat-remove:hover, #toggle-remix-optional:hover, #toggle-main-remove:hover {
                transform: scale(1.08);
            }

            #extract-remixers-optional-only:active, #remove-main-from-title:active, #remove-feat-from-title:active,
            #toggle-feat-remove:active, #toggle-remix-optional:active, #toggle-main-remove:active {
                transform: scale(0.94);
            }

            #toggle-feat-remove:focus, #toggle-remix-optional:focus, #toggle-main-remove:focus {
                outline: 2px solid rgba(30, 102, 214, 0.3); outline-offset: 1px;
            }
        `;
        const style = document.createElement('style');
        style.id = 'discogs-helper-panel-styles';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
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
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
            z-index: 10000;
            font-family: Arial, sans-serif;
            box-sizing: border-box;
        `;
        panel.innerHTML = `
            <div class="panel-header" style="padding: 8px 10px; display: flex; align-items: center; gap: 8px; box-sizing: border-box;">
                <strong style="font-size: 14px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Discogs Edit Helper</strong>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <button id="theme-toggle" title="Toggle theme" style="background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px 4px;">☾</button>
                    <button id="collapse-panel" title="Collapse" style="background: none; border: none; cursor: pointer; font-size: 16px; padding: 2px 4px;">▲</button>
                    <button id="close-panel" title="Close" style="background: none; border: none; cursor: pointer; font-size: 18px; padding: 2px 4px;">✕</button>
                </div>
            </div>
            <div id="panel-content" style="padding: 12px; box-sizing: border-box;">
                <div style="display: flex; gap: 6px; margin-bottom: 0px;">
                    <button id="scan-and-extract" class="dh-btn" style="flex: 1; margin-bottom: 0;" title="Extract durations from the end of track titles">🕛 Durations</button>
                    <button id="capitalize-titles" class="dh-btn" style="flex: 1; margin-bottom: 0;" title="Capitalize the first letter of each word in titles">🔠 Capitalize</button>
                </div>

                <button id="extract-artists" class="dh-btn" title="Splitter Patterns: ${CONFIG.ARTIST_SPLITTER_PATTERNS.join(', ')}">👤 Extract Main Artists</button>
                <button id="extract-featuring" class="dh-btn" title="Feat Patterns: ${CONFIG.FEATURING_PATTERNS.join(', ')}">👥 Extract Feat Artists</button>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button id="extract-remixers" class="dh-btn" style="flex:1;">🎶 Extract Remixers</button>
                </div>

                <button id="revert-last" class="dh-btn" style="margin-top: 0px;">↩️ Revert Actions</button>
                <div id="track-info" style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin-top: 6px; font-size: 12px; display: block; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Ready</div>
                <div id="log-section" style="margin-top: 6px; display: block;">
                    <div id="log-toggle" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; cursor: pointer;">
                        <strong style="font-size: 11px; color: #666;">Activity Log</strong>
                        <span id="log-arrow" style="font-size: 12px; color: #666;">▼</span>
                    </div>
                    <div id="log-container" style="max-height: 160px; overflow-y: auto; font-size: 10px; font-family: monospace; background: #f8f9fa; padding: 6px; border-radius: 4px; display: none;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        addPanelStyles();
        const styleButtons = panel.querySelectorAll('.dh-btn');
        styleButtons.forEach(btn => {
            btn.style.cssText += `
                display: flex;
                align-items: center;
                justify-content: flex-start;
                width: 100%;
                box-sizing: border-box;
                padding: 10px 12px;
                margin-bottom: 6px;
                background: #f1f3f5;
                color: #111;
                border: 1px solid #e4e6e8;
                border-radius: 6px;
                text-align: left;
                cursor: pointer;
                font-weight: 500;
            `;
        });

        const remixBtn = document.getElementById('extract-remixers');
        if (remixBtn) {
            remixBtn.style.display = 'flex';
            remixBtn.style.alignItems = 'center';
            remixBtn.style.justifyContent = 'flex-start';
            remixBtn.style.gap = '8px';

            const optionalOnlyBtn = document.createElement('span');
            optionalOnlyBtn.id = 'extract-remixers-optional-only';
            optionalOnlyBtn.setAttribute('role', 'button');
            optionalOnlyBtn.setAttribute('tabindex', '0');
            optionalOnlyBtn.textContent = '🎵';
            optionalOnlyBtn.title = `Extract optional patterns only: ${CONFIG.REMIX_PATTERNS_OPTIONAL.join(', ')}`;
            optionalOnlyBtn.style.cssText = `
                flex: 0 0 auto;
                margin: 0;
                margin-left: auto;
                padding: 0;
                width: 24px;
                height: 24px;
                font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", system-ui, -apple-system, "Helvetica Neue", Arial;
                border-radius: 4px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                user-select: none;
            `;
            optionalOnlyBtn.addEventListener('click', (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                if (e && e.preventDefault) e.preventDefault();
                extractRemixers(true);
            });
            optionalOnlyBtn.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); optionalOnlyBtn.click(); } });
            remixBtn.appendChild(optionalOnlyBtn);

            const remixToggle = document.createElement('span');
            remixToggle.id = 'toggle-remix-optional';
            remixToggle.setAttribute('role', 'button');
            remixToggle.setAttribute('tabindex', '0');
            remixToggle.textContent = state.remixOptionalEnabled ? '✓' : '';
            remixToggle.title = `Optional Remix Patterns: ${CONFIG.REMIX_PATTERNS_OPTIONAL.join(', ')}`;
            remixToggle.style.cssText = `
                flex: 0 0 auto;
                margin: 0;
                padding: 0;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                user-select: none;
            `;
            remixToggle.addEventListener('click', (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                if (e && e.preventDefault) e.preventDefault();
                state.remixOptionalEnabled = !state.remixOptionalEnabled;
                try { localStorage.setItem(STORAGE_KEYS.REMIX_OPTIONAL_KEY, state.remixOptionalEnabled ? '1' : '0'); } catch (err) { log('Could not save remix optional setting', 'warning'); }
                updateRemixToggleUI();
                const current = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark' ? 'dark' : 'light';
                applyTheme(current);
            });
            remixToggle.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); remixToggle.click(); } });
            remixBtn.appendChild(remixToggle);
        }

        const featBtn = document.getElementById('extract-featuring');
        if (featBtn) {
            featBtn.style.display = 'flex';
            featBtn.style.alignItems = 'center';
            featBtn.style.justifyContent = 'flex-start';
            featBtn.style.gap = '8px';

            const removeFeatSmall = document.createElement('span');
            removeFeatSmall.id = 'remove-feat-from-title';
            removeFeatSmall.setAttribute('role', 'button');
            removeFeatSmall.setAttribute('tabindex', '0');
            removeFeatSmall.textContent = '✂️';
            removeFeatSmall.title = 'Remove feat artists from titles';
            removeFeatSmall.style.cssText = `
                flex: 0 0 auto;
                margin: 0;
                margin-left: auto;
                padding: 0;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                user-select: none;
            `;
            removeFeatSmall.addEventListener('click', (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                if (e && e.preventDefault) e.preventDefault();
                removeFeaturingFromTitle();
            });
            removeFeatSmall.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); removeFeatSmall.click(); } });
            featBtn.appendChild(removeFeatSmall);

            const featToggle = document.createElement('span');
            featToggle.id = 'toggle-feat-remove';
            featToggle.setAttribute('role', 'button');
            featToggle.setAttribute('tabindex', '0');
            featToggle.textContent = state.removeFeatFromTitle ? '✓' : '';
            featToggle.title = `Automatically remove feat artists from titles`;
            featToggle.style.cssText = `
                flex: 0 0 auto;
                margin: 0;
                padding: 0;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                user-select: none;
            `;

            function toggleFeatHandler(e) {
                if (e && e.stopPropagation) e.stopPropagation();
                if (e && e.preventDefault) e.preventDefault();
                state.removeFeatFromTitle = !state.removeFeatFromTitle;
                featToggle.textContent = state.removeFeatFromTitle ? '✓' : '';
                featToggle.title = `Automatically remove feat artists from titles`;
                try { localStorage.setItem(STORAGE_KEYS.FEAT_REMOVE_KEY, state.removeFeatFromTitle ? '1' : '0'); } catch (err) { log('Could not save feat setting', 'warning'); }
                const current = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark' ? 'dark' : 'light';
                applyTheme(current);
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
            mainBtn.style.gap = '8px';

            const removeMain = document.createElement('span');
            removeMain.id = 'remove-main-from-title';
            removeMain.setAttribute('role', 'button');
            removeMain.setAttribute('tabindex', '0');
            removeMain.textContent = '✂️';
            removeMain.title = 'Remove main artists from titles';
            removeMain.style.cssText = `
                flex: 0 0 auto;
                margin: 0;
                margin-left: auto;
                padding: 0;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                user-select: none;
            `;
            removeMain.addEventListener('click', (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                if (e && e.preventDefault) e.preventDefault();
                removeMainArtistsFromTitle();
            });
            removeMain.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); removeMain.click(); } });
            mainBtn.appendChild(removeMain);

            const mainToggle = document.createElement('span');
            mainToggle.id = 'toggle-main-remove';
            mainToggle.setAttribute('role', 'button');
            mainToggle.setAttribute('tabindex', '0');
            mainToggle.textContent = state.removeMainFromTitle ? '✓' : '';
            mainToggle.title = `Automatically remove main artists from titles`;
            mainToggle.style.cssText = `
                flex: 0 0 auto;
                margin: 0;
                padding: 0;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                user-select: none;
            `;
            function toggleMainHandler(e) {
                if (e && e.stopPropagation) e.stopPropagation();
                if (e && e.preventDefault) e.preventDefault();
                state.removeMainFromTitle = !state.removeMainFromTitle;
                mainToggle.textContent = state.removeMainFromTitle ? '✓' : '';
                try { localStorage.setItem(STORAGE_KEYS.MAIN_REMOVE_KEY, state.removeMainFromTitle ? '1' : '0'); } catch (err) { log('Could not save main-remove setting', 'warning'); }
                const current = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark' ? 'dark' : 'light';
                applyTheme(current);
            }
            mainToggle.addEventListener('click', toggleMainHandler);
            mainToggle.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') toggleMainHandler(ev); });
            mainBtn.appendChild(mainToggle);
        }

        const collapseBtn = document.getElementById('collapse-panel');
        const closeBtn = document.getElementById('close-panel');
        const themeBtn = document.getElementById('theme-toggle');
        const logToggle = document.getElementById('log-toggle');
        const logContainer = document.getElementById('log-container');
        closeBtn.onclick = () => { panel.style.display = 'none'; if (state.hideTimeout) clearTimeout(state.hideTimeout); };
        collapseBtn.onclick = () => {
            const content = document.getElementById('panel-content');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                collapseBtn.textContent = '▲';
                collapseBtn.title = 'Expand';
                state.isCollapsed = false;
                resetHideTimer();
            } else {
                content.style.display = 'none';
                collapseBtn.textContent = '▼';
                collapseBtn.title = 'Expand';
                state.isCollapsed = true;
            }
        };
        document.getElementById('scan-and-extract').onclick = scanAndExtract;
        document.getElementById('extract-artists').onclick = extractArtists;
        document.getElementById('extract-featuring').onclick = extractFeaturing;
        document.getElementById('extract-remixers').onclick = extractRemixers;
        document.getElementById('capitalize-titles').onclick = capitalizeTitles;
        document.getElementById('revert-last').onclick = revertLastAction;
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
            try { localStorage.setItem(STORAGE_KEYS.THEME_KEY, next); } catch (e) { log('Could not save theme preference', 'warning'); }
            applyTheme(next);
        };
        initThemeFromStorage();
        updateRemixToggleUI();
        updateRemixButtonTitle();
        log('Panel initialized');
        resetHideTimer();
        updateRevertButton();
    }

    function resetHideTimer() {
        if (state.hideTimeout) clearTimeout(state.hideTimeout);
        state.hideTimeout = setTimeout(() => { if (!state.isCollapsed) collapsePanel(); }, CONFIG.INACTIVITY_TIMEOUT_MS);
    }

    function collapsePanel() {
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
        updateRevertButton();
        log('Discogs Edit Helper ready');
        const panel = document.getElementById('helper-panel');
        if (panel) {
            panel.addEventListener('mousemove', resetHideTimer);
            panel.addEventListener('keydown', resetHideTimer);
            panel.addEventListener('click', resetHideTimer);
        }
    }, 900);

})();
