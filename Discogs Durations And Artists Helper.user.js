// ==UserScript==
// @name         Discogs Durations And Artists Helper
// @namespace    https://github.com/chr1sx
// @version      1.0
// @description  Extracts durations and artists from track titles and moves them to appropriate fields
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
        console.log(`[Discogs Helper] ${message}`);
        updatePanel();
    }

    function resetHideTimer() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            console.log('[Discogs Helper] Cleared previous timer');
        }
        hideTimeout = setTimeout(() => {
            const panel = document.getElementById('durations-helper-panel');
            console.log('[Discogs Helper] Timer fired! Panel exists:', !!panel, 'Display:', panel?.style.display);
            if (panel && panel.style.display !== 'none') {
                panel.style.display = 'none';
                console.log('[Discogs Helper] Panel hidden successfully');
            }
        }, 18500);
        console.log('[Discogs Helper] New 18-second timer started at', new Date().toLocaleTimeString());
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

    // Helper function to click Add button and wait for artist field to open
    function clickAddArtistButton(row) {
        return new Promise((resolve) => {
            const addButton = row.querySelector('button.add-credit-button');
            if (!addButton) {
                resolve(false);
                return;
            }

            addButton.click();

            // Wait for the artist input field to appear
            let attempts = 0;
            const checkInterval = setInterval(() => {
                const artistInput = row.querySelector('input[data-type="artist-name"]');
                attempts++;

                if (artistInput) {
                    clearInterval(checkInterval);
                    resolve(true);
                } else if (attempts > 20) { // 2 seconds max wait
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 100);
        });
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
            border-radius: 8px;
            box-shadow: -2px 2px 8px rgba(0,0,0,0.1);
            z-index: 10000;
            font-family: Arial, sans-serif;
            overflow: hidden;
        `;

        panel.innerHTML = `
            <div style="background: #1A1D1E; color: white; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 13px;">⏱ Discogs Helper</strong>
                <button id="close-panel" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; padding: 0 5px; line-height: 1;">✕</button>
            </div>
            <div style="padding: 12px; box-sizing: border-box;">
                <button id="scan-and-extract" style="width: 100%; padding: 10px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 13px; transition: background 0.2s; box-sizing: border-box; margin-bottom: 8px;">
                    🕐 Scan & Extract Durations
                </button>
                <button id="extract-artists" style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 13px; transition: background 0.2s; box-sizing: border-box;">
                    👤 Scan & Extract Artists
                </button>
                <div id="track-info" style="background: #f8f9fa; padding: 8px; border-radius: 5px; margin-top: 10px; font-size: 12px; display: none; box-sizing: border-box; text-align: center;">
                </div>
                <div id="log-section" style="margin-top: 10px; display: none; box-sizing: border-box;">
                    <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 6px 0; box-sizing: border-box;" id="log-toggle">
                        <strong style="font-size: 11px; color: #666;">Activity Log</strong>
                        <span id="log-arrow" style="font-size: 10px; color: #666;">▼</span>
                    </div>
                    <div id="log-container" style="max-height: 200px; overflow-y: auto; font-size: 10px; font-family: monospace; background: #f8f9fa; padding: 6px; border-radius: 5px; display: none; box-sizing: border-box;">
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
            console.log('[Discogs Helper] Mouse entered panel - resetting timer');
            resetHideTimer();
        });

        panel.addEventListener('mouseleave', () => {
            console.log('[Discogs Helper] Mouse left panel - resetting timer');
            resetHideTimer();
        });

        // Duration button
        const scanBtn = document.getElementById('scan-and-extract');
        scanBtn.onmouseover = () => scanBtn.style.background = '#218838';
        scanBtn.onmouseout = () => scanBtn.style.background = '#28a745';
        scanBtn.onclick = scanAndExtract;

        // Artist button
        const artistBtn = document.getElementById('extract-artists');
        artistBtn.onmouseover = () => artistBtn.style.background = '#0056b3';
        artistBtn.onmouseout = () => artistBtn.style.background = '#007bff';
        artistBtn.onclick = extractArtists;

        document.getElementById('log-toggle').onclick = toggleLog;

        log('Panel initialized');

        // Start the auto-hide timer
        console.log('[Discogs Helper] Starting initial 18-second timer');
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

        log('Starting duration scan...', 'info');

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

    async function extractArtists() {
        // Show log section and track info
        document.getElementById('log-section').style.display = 'block';
        document.getElementById('track-info').style.display = 'block';

        log('Starting artist extraction...', 'info');

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
        let skipped = 0;

        for (let index = 0; index < trackRows.length; index++) {
            const row = trackRows[index];

            let titleInput = row.querySelector('input[data-type="track-title"]') ||
                           row.querySelector('input[id*="track-title"]') ||
                           row.querySelector('input.track_input[placeholder*="Title" i]');

            if (!titleInput) {
                continue;
            }

            const title = titleInput.value.trim();

            // Match artist - title or artist — title (em dash)
            const artistMatch = title.match(/^(.+?)\s*[-—]\s*(.+)$/);

            if (artistMatch) {
                const artist = artistMatch[1].trim();
                const newTitle = artistMatch[2].trim();

                // Check if artist field already exists and has content
                let existingArtistInput = row.querySelector('input[data-type="artist-name"]');

                if (existingArtistInput && existingArtistInput.value.trim()) {
                    log(`Track ${index + 1}: Skipped (artist already present)`, 'warning');
                    skipped++;
                    continue;
                }

                // If no artist field is open, click Add button
                if (!existingArtistInput) {
                    log(`Track ${index + 1}: Opening artist field...`, 'info');
                    const opened = await clickAddArtistButton(row);

                    if (!opened) {
                        log(`Track ${index + 1}: Failed to open artist field`, 'error');
                        failed++;
                        continue;
                    }

                    // Re-query for the artist input after opening
                    existingArtistInput = row.querySelector('input[data-type="artist-name"]');
                }

                if (existingArtistInput) {
                    // Update title
                    setReactValue(titleInput, newTitle);

                    // Add artist
                    setReactValue(existingArtistInput, artist);

                    log(`Track ${index + 1}: "${artist}" → "${newTitle}"`, 'success');
                    processed++;
                } else {
                    log(`Track ${index + 1}: Could not find artist input field`, 'error');
                    failed++;
                }
            }
        }

        // Update status
        const infoDiv = document.getElementById('track-info');
        if (processed > 0) {
            infoDiv.innerHTML = `
                <div style="color: #28a745; font-weight: bold;">✓ Success!</div>
                <div style="margin-top: 4px;">Extracted ${processed} artist${processed > 1 ? 's' : ''}</div>
                ${skipped > 0 ? `<div style="color: #ffc107; margin-top: 4px;">⊘ ${skipped} skipped</div>` : ''}
                ${failed > 0 ? `<div style="color: #dc3545; margin-top: 4px;">✗ ${failed} failed</div>` : ''}
            `;
            log(`✓ Extracted ${processed} artist(s)`, 'success');
        } else {
            infoDiv.innerHTML = `
                <span style="color: #ffc107;">⚠ No artists found in titles</span>
            `;
            log('No artists found to extract', 'warning');
        }

        if (skipped > 0) {
            log(`⊘ ${skipped} track(s) already had artists`, 'warning');
        }

        if (failed > 0) {
            log(`✗ ${failed} track(s) failed to process`, 'error');
        }
    }

    // Initialize
    setTimeout(() => {
        log('Script loaded');
        createPanel();
    }, 1000);
})();