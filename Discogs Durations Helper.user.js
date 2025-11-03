// ==UserScript==
// @name         Discogs Durations Helper
// @namespace    https://github.com/chr1sx
// @version      1.0
// @description  Extracts durations from track titles and moves them to duration fields
// @match        https://www.discogs.com/release/edit/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    let logMessages = [];
    let hideTimeout = null;

    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        logMessages.push({ timestamp, message, type });
        console.log(`[Discogs Durations Helper] ${message}`);
        updatePanel();
    }

    function resetHideTimer() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
        }
        hideTimeout = setTimeout(() => {
            const panel = document.getElementById('durations-helpe-panel');
            if (panel && panel.style.display !== 'none') {
                panel.style.display = 'none';
                console.log('[Discogs Durations Helper] Panel auto-hidden after 18 seconds');
            }
        }, 18500);
        console.log('[Discogs Durations Helper] Hide timer reset - 18 seconds');
    }

    // Helper function to set value in React inputs
    function setReactValue(element, value) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        ).set;

        nativeInputValueSetter.call(element, value);

        // Trigger React events
        const inputEvent = new Event('input', { bubbles: true });
        element.dispatchEvent(inputEvent);

        // Also trigger change event
        const changeEvent = new Event('change', { bubbles: true });
        element.dispatchEvent(changeEvent);

        // Focus and blur to ensure React state updates
        element.focus();
        element.blur();
    }

    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'durations-helper-panel';
        panel.style.cssText = `
            position: fixed;
            right: 20px;
            top: 165px;
            width: 255px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: -2px 2px 8px rgba(0,0,0,0.1);
            z-index: 10000;
            font-family: Arial, sans-serif;
        `;

        panel.innerHTML = `
            <div style="background: #1A1D1E; color: white; padding: 8px 12px; border-radius: 0 4px 0 0; display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 13px;">⏱ Discogs Durations Helper</strong>
                <button id="close-panel" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; padding: 0 5px; line-height: 1;">✕</button>
            </div>
            <div style="padding: 12px; box-sizing: border-box;">
                <button id="scan-and-extract" style="width: 100%; padding: 10px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight: bold; font-size: 13px; transition: background 0.2s; box-sizing: border-box;">
                    🔍 Scan & Extract
                </button>
                <div id="track-info" style="background: #f8f9fa; padding: 8px; border-radius: 3px; margin-top: 10px; font-size: 12px; display: none; box-sizing: border-box; text-align: center;">
                </div>
                <div id="log-section" style="margin-top: 10px; display: none; box-sizing: border-box;">
                    <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 6px 0; box-sizing: border-box;" id="log-toggle">
                        <strong style="font-size: 11px; color: #666;">Activity Log</strong>
                        <span id="log-arrow" style="font-size: 10px; color: #666;">▼</span>
                    </div>
                    <div id="log-container" style="max-height: 200px; overflow-y: auto; font-size: 10px; font-family: monospace; background: #f8f9fa; padding: 6px; border-radius: 3px; display: none; box-sizing: border-box;">
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // Event listeners
        document.getElementById('close-panel').onclick = () => {
            panel.style.display = 'none';
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
        };

        // Add event listeners for user interaction to reset timer
        panel.addEventListener('mouseenter', () => {
            console.log('[Discogs Durations Helper] Mouse entered panel');
            resetHideTimer();
        });
        panel.addEventListener('mousemove', resetHideTimer);
        panel.addEventListener('click', resetHideTimer);
        panel.addEventListener('scroll', resetHideTimer, true);

        const scanBtn = document.getElementById('scan-and-extract');
        scanBtn.onmouseover = () => scanBtn.style.background = '#218838';
        scanBtn.onmouseout = () => scanBtn.style.background = '#28a745';
        scanBtn.onclick = scanAndExtract;

        document.getElementById('log-toggle').onclick = toggleLog;

        log('Panel initialized');

        // Start the auto-hide timer
        console.log('[Discogs Durations Helper] Starting initial 18-second timer');
        resetHideTimer();
    }

    function updatePanel() {
        const logContainer = document.getElementById('log-container');
        if (!logContainer) return;

        logContainer.innerHTML = logMessages.slice(-20).map(entry => {
            const colors = {
                info: '#333',
                success: '#28a745',
                warning: '#ffc107',
                error: '#dc3545'
            };
            return `<div style="color: ${colors[entry.type]}; margin: 2px 0;">
                [${entry.timestamp}] ${entry.message}
            </div>`;
        }).join('');
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function toggleLog() {
        const logContainer = document.getElementById('log-container');
        const arrow = document.getElementById('log-arrow');

        if (logContainer.style.display === 'none') {
            logContainer.style.display = 'block';
            arrow.textContent = '▲';
        } else {
            logContainer.style.display = 'none';
            arrow.textContent = '▼';
        }
    }

    function scanAndExtract() {
        // Show log section and track info
        document.getElementById('log-section').style.display = 'block';
        document.getElementById('track-info').style.display = 'block';

        log('Starting scan...', 'info');

        let trackRows = document.querySelectorAll('tr.track_row');

        if (trackRows.length === 0) {
            trackRows = document.querySelectorAll('tr[class*="track"]');
        }

        if (trackRows.length === 0) {
            log('No track rows found', 'error');
            document.getElementById('track-info').innerHTML = `
                <span style="color: #dc3545;">✗ No tracks found</span>
            `;
            return;
        }

        let processed = 0;
        let failed = 0;

        trackRows.forEach((row, index) => {
            let titleInput = row.querySelector('input[data-type="track-title"]') ||
                           row.querySelector('input[id*="track-title"]') ||
                           row.querySelector('input.track_input[placeholder*="Title" i]');

            let durationInput = row.querySelector('td.subform_track_duration input') ||
                              row.querySelector('td[data-ref-overview="track_duration"] input') ||
                              row.querySelector('input[aria-label*="duration" i]');

            if (!titleInput || !durationInput) {
                if (titleInput && /\d+:\d+\s*$/.test(titleInput.value)) {
                    failed++;
                }
                return;
            }

            const title = titleInput.value.trim();
            const durationMatch = title.match(/(\d+:\d+)\s*$/);

            if (durationMatch) {
                const duration = durationMatch[1];
                const newTitle = title.replace(/\s*\d+:\d+\s*$/, '').trim();

                setReactValue(titleInput, newTitle);
                setReactValue(durationInput, duration);

                log(`Track ${index + 1}: "${newTitle}" → ${duration}`, 'success');
                processed++;
            }
        });

        // Update status
        const infoDiv = document.getElementById('track-info');
        if (processed > 0) {
            infoDiv.innerHTML = `
                <div style="color: #28a745; font-weight: bold;">✓ Success!</div>
                <div style="margin-top: 4px;">Extracted ${processed} duration${processed > 1 ? 's' : ''}</div>
                ${failed > 0 ? `<div style="color: #dc3545; margin-top: 4px;">✗ ${failed} failed</div>` : ''}
            `;
            log(`✓ Extracted ${processed} duration(s)`, 'success');
        } else {
            infoDiv.innerHTML = `
                <span style="color: #ffc107;">⚠ No durations found in titles</span>
            `;
            log('No durations found to extract', 'warning');
        }

        if (failed > 0) {
            log(`✗ ${failed} track(s) missing duration field`, 'error');
        }
    }

    // Initialize
    setTimeout(() => {
        log('Script loaded');
        createPanel();
    }, 1000);
})();
