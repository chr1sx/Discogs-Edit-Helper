// ==UserScript==
// @name         Discogs Edit Helper
// @namespace    https://github.com/chr1sx/Discogs-Edit-Helper
// @version      1.8.1
// @description  Imports metadata from web stores and plain-text tracklists, extracts info from titles and assigns data to the appropriate fields
// @author       chr1sx
// @match        https://www.discogs.com/release/edit/*
// @match        https://www.discogs.com/*/release/edit/*
// @match        https://www.discogs.com/release/add
// @match        https://www.discogs.com/*/release/add
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_cookie.list
// @grant        unsafeWindow
// @connect      *
// @run-at       document-idle
// @license      MIT
// @icon         https://raw.githubusercontent.com/chr1sx/Discogs-Edit-Helper/refs/heads/main/Images/icon-64.png
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
        ARTIST_SPLITTER_PATTERNS: ['versus', 'vs', 'v', 'aka', '&', '+', ',', '/', '\\', '|', '×', 'x'],
        CREDIT_SEPARATOR_PATTERNS: ['and', '&', '+', ',', '/', '\\'],
        FEATURING_PATTERNS: ['featuring', 'feat', 'ft', 'f/', 'w/'],
        REMIX_PATTERNS: ['remix', 'rmx', 'rebuild'],
        REMIX_BY_PATTERNS: ['remixed by', 'remix by', 'rmx by', 'rebuild by', 'rebuilt by', 'reworked by', 'rework by', 'edited by', 'edit by', 'mixed by', 'mix by', 'version by', 'dub by'],
        REMIX_PATTERNS_OPTIONAL: ['dub', 'edit', 'rework', 'mix', 'version'],
        CAPITALIZE_KEEP_UPPER: ['II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'CIA', 'DJ', 'DNA', 'EP', 'FBI', 'FM', 'HD', 'KGB', 'LSD', 'MC', 'MI6', 'NASA', 'TNT', 'UFO', 'UK', 'USA', 'USSR', 'VIP', 'VHS', 'WTF'],
        CAPITALIZE_KEEP_LOWER: ['da', 'de', 'del', 'des', 'di', 'la', 'van', 'von'],
        CLEAN_TITLE_PATTERNS: ['original mix', 'explicit', 'digital bonus track', 'digital bonus', 'bonus track', 'bonus', '24bit', '24-bit', '24 bit', '16bit', '16-bit', '16 bit', '000 bpm']
    };
    const CONFIG_RAW = {
        INACTIVITY_TIMEOUT_MS:    60 * 1000,
        ARTIST_SPLITTER_PATTERNS:  ['versus', 'vs', 'v', 'aka', '&', '+', ',', '/', '\\', '|', '×', 'x'],
        CREDIT_SEPARATOR_PATTERNS: ['and', '&', '+', ',', '/', '\\'],
        FEATURING_PATTERNS:        ['featuring', 'feat', 'ft', 'f/', 'w/'],
        REMIX_PATTERNS:           ['remix', 'rmx', 'rebuild'],
        REMIX_BY_PATTERNS:        ['remixed by', 'remix by', 'rmx by', 'rebuild by', 'rebuilt by', 'reworked by', 'rework by', 'edited by', 'edit by', 'mixed by', 'mix by', 'version by', 'dub by'],
        REMIX_PATTERNS_OPTIONAL:  ['dub', 'edit', 'rework', 'mix', 'version'],
        CAPITALIZE_KEEP_UPPER:    ['II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'CIA', 'DJ', 'DNA', 'EP', 'FBI', 'FM', 'HD', 'KGB', 'LSD', 'MC', 'MI6', 'NASA', 'TNT', 'UFO', 'UK', 'USA', 'USSR', 'VIP', 'VHS', 'WTF'],
        CAPITALIZE_KEEP_LOWER:    ['da', 'de', 'del', 'des', 'di', 'la', 'van', 'von'],
        CLEAN_TITLE_PATTERNS:     ['original mix', 'explicit', 'digital bonus track', 'digital bonus', 'bonus track', 'bonus', '24bit', '24-bit', '24 bit', '16bit', '16-bit', '16 bit', '000 bpm'],
    };

    const CONFIG_DEFAULTS = {
        INACTIVITY_TIMEOUT_MS:     CONFIG_RAW.INACTIVITY_TIMEOUT_MS,
        ARTIST_SPLITTER_PATTERNS:  [...CONFIG_RAW.ARTIST_SPLITTER_PATTERNS],
        CREDIT_SEPARATOR_PATTERNS: [...CONFIG_RAW.CREDIT_SEPARATOR_PATTERNS],
        FEATURING_PATTERNS:        [...CONFIG_RAW.FEATURING_PATTERNS],
        REMIX_PATTERNS:            [...CONFIG_RAW.REMIX_PATTERNS],
        REMIX_BY_PATTERNS:         [...CONFIG_RAW.REMIX_BY_PATTERNS],
        REMIX_PATTERNS_OPTIONAL:   [...CONFIG_RAW.REMIX_PATTERNS_OPTIONAL],
        CAPITALIZE_KEEP_UPPER:     [...CONFIG_RAW.CAPITALIZE_KEEP_UPPER],
        CAPITALIZE_KEEP_LOWER:     [...CONFIG_RAW.CAPITALIZE_KEEP_LOWER],
        CLEAN_TITLE_PATTERNS:      [...CONFIG_RAW.CLEAN_TITLE_PATTERNS],
    };

    const STORAGE_KEYS = {
        THEME_KEY:          'discogs_helper_theme_v2',
        FEAT_REMOVE_KEY:    'discogs_helper_removeFeat',
        MAIN_REMOVE_KEY:    'discogs_helper_removeMain',
        REMIX_OPTIONAL_KEY: 'discogs_helper_remix_optional',
        CFG_TIMEOUT:        'discogs_helper_cfg_timeout',
        CFG_START_COLLAPSED:'discogs_helper_cfg_start_collapsed',
        CFG_SPLITTER:       'discogs_helper_cfg_splitter',
        CFG_CREDIT_SEP:     'discogs_helper_cfg_credit_sep',
        CFG_FEATURING:      'discogs_helper_cfg_featuring',
        CFG_REMIX:          'discogs_helper_cfg_remix',
        CFG_REMIX_BY:       'discogs_helper_cfg_remix_by',
        CFG_REMIX_OPT:      'discogs_helper_cfg_remix_opt',
        CFG_KEEP_UPPER:     'discogs_helper_cfg_keep_upper',
        CFG_KEEP_LOWER:     'discogs_helper_cfg_keep_lower',
        CFG_CLEAN_TITLE:    'discogs_helper_cfg_clean_title',
        CFG_CAPITALIZE_FIELDS: 'discogs_helper_cfg_capitalize_fields_v1',
        CFG_CAPITALIZE_BTN_FIELDS: 'discogs_helper_cfg_capitalize_btn_fields_v1',
        CFG_SPLIT_IMPORT:    'discogs_helper_cfg_split_import_v2',
        CFG_IMPORT_CREDITS:  'discogs_helper_cfg_import_credits_v1',
        CFG_IMPORT_STYLES:   'discogs_helper_cfg_import_styles_v1',
        CFG_IMPORT_AUTO_REMIXERS: 'discogs_helper_cfg_import_auto_remixers_v1',
        CFG_IMPORT_AUTO_FEAT:     'discogs_helper_cfg_import_auto_feat_v1',
        CFG_IMPORT_AUTO_DESCR:    'discogs_helper_cfg_import_auto_descr_v1',
        CFG_IMPORT_COUNTRY:       'discogs_helper_cfg_import_country_v1',
        CFG_CAPITALIZE_MIXED:     'discogs_helper_cfg_capitalize_mixed_v1',
    };

    const state = {
        logMessages: [],
        hideTimeout: null,
        processingTimeout: null,
        processingStartTime: null,
        actionHistory: [],
        isCollapsed: false,
        startCollapsed: false,
        capitalizeFields: { albumArtists: true, albumTitle: true, label: true, vaArtists: true, trackTitles: true, joiners: true, creditNames: true, trackCredits: true },
        capitalizeBtnFields: { albumArtists: true, albumTitle: true, label: true, vaArtists: true, trackTitles: true, joiners: true, creditNames: true, trackCredits: true },
        splitImport: true,
        importCredits: true,
        importStyles: true,
        importAutoRemixers: true,
        importAutoFeat: true,
        importAutoDescr: true,
        importCountry: true,
        capitalizeMixedCase: true,
        removeMainFromTitle: true,
        removeFeatFromTitle: false,
        remixOptionalEnabled: false,
        importerText: '',
        importerMissingArtistMode: false,
        importerMissingDurationMode: false
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
        const creditSep = parseStoredArray(STORAGE_KEYS.CFG_CREDIT_SEP);
        if (creditSep) CONFIG.CREDIT_SEPARATOR_PATTERNS = creditSep;
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
            try {
                const storedCapFields = localStorage.getItem(STORAGE_KEYS.CFG_CAPITALIZE_FIELDS);
                if (storedCapFields) {
                    const parsed = JSON.parse(storedCapFields);
                    if (parsed && typeof parsed === 'object') {
                        state.capitalizeFields = { ...state.capitalizeFields, ...parsed };
                    }
                } else {
                    const legacyCap = localStorage.getItem('discogs_helper_cfg_capitalize_import_v2');
                    if (legacyCap !== null) {
                        const val = legacyCap === '1';
                        state.capitalizeFields = { albumArtists: val, albumTitle: val, label: val, vaArtists: val, trackTitles: val, joiners: val, creditNames: val, trackCredits: val };
                    }
                }
            } catch(e) {}
            try {
                const storedCapBtnFields = localStorage.getItem(STORAGE_KEYS.CFG_CAPITALIZE_BTN_FIELDS);
                if (storedCapBtnFields) {
                    const parsed = JSON.parse(storedCapBtnFields);
                    if (parsed && typeof parsed === 'object') {
                        state.capitalizeBtnFields = { ...state.capitalizeBtnFields, ...parsed };
                    }
                }
            } catch(e) {}
            const storedSplitImport = localStorage.getItem(STORAGE_KEYS.CFG_SPLIT_IMPORT);
            state.splitImport = storedSplitImport !== null ? (storedSplitImport === '1') : true;
            const storedImportCredits = localStorage.getItem(STORAGE_KEYS.CFG_IMPORT_CREDITS);
            state.importCredits = storedImportCredits !== null ? (storedImportCredits === '1') : true;
            const storedImportStyles = localStorage.getItem(STORAGE_KEYS.CFG_IMPORT_STYLES);
            state.importStyles = storedImportStyles !== null ? (storedImportStyles === '1') : true;
            const storedAutoRemixers = localStorage.getItem(STORAGE_KEYS.CFG_IMPORT_AUTO_REMIXERS);
            state.importAutoRemixers = storedAutoRemixers !== null ? (storedAutoRemixers === '1') : true;
            const storedAutoFeat = localStorage.getItem(STORAGE_KEYS.CFG_IMPORT_AUTO_FEAT);
            state.importAutoFeat = storedAutoFeat !== null ? (storedAutoFeat === '1') : true;
            const storedAutoDescr = localStorage.getItem(STORAGE_KEYS.CFG_IMPORT_AUTO_DESCR);
            state.importAutoDescr = storedAutoDescr !== null ? (storedAutoDescr === '1') : true;
            const storedCountry = localStorage.getItem(STORAGE_KEYS.CFG_IMPORT_COUNTRY);
            state.importCountry = storedCountry !== null ? (storedCountry === '1') : true;
            const storedCapMixed = localStorage.getItem(STORAGE_KEYS.CFG_CAPITALIZE_MIXED);
            if (storedCapMixed !== null) state.capitalizeMixedCase = storedCapMixed !== '0';
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

    function dehBridgePostMessage(type, data) {
        window.postMessage({ source: 'deh_bridge', type, ...data }, '*');
    }

    function setReactValue(element, value) {
        if (!element) return;
        try {
            const tag = element.tagName;
            const proto = tag === 'SELECT'   ? window.HTMLSelectElement.prototype
                        : tag === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
                        :                      window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            const node = element.wrappedJSObject || element;
            const tracker = node._valueTracker;
            if (tracker) tracker.setValue('');
            nativeSetter.call(element, value);
            element.dispatchEvent(new Event('input',  { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.focus();
            element.blur();
        } catch (e) {
            log(`Error setting value: ${e.message}`, 'error');
        }
    }

    const DISCOGS_GENRE_STYLES = {
        'Electronic': [
            'Abstract','Acid','Acid House','Acid Jazz','Amapiano','Ambient',
            'Ambient House','Balearic','Ballroom','Baltimore Club','Bass Music',
            'Bassline','Beatdown','Berlin-School','Big Beat','Bitpop','Bleep',
            'Bouncy Techno','Breakbeat','Breakcore','Breaks','Broken Beat',
            'Chillwave','Chiptune','Comfy Synth','Dance-pop','Dark Ambient',
            'Dark Electro','Darkwave','Deconstructed Club','Deep House',
            'Deep Techno','Disco','Disco Polo','Donk','Doomcore','Downtempo',
            'Drone','Drum n Bass','Dub','Dub Techno','Dubstep','Dungeon Synth',
            'EBM','Electro','Electro House','Electro Swing','Electroacoustic',
            'Electroclash','Euro House','Euro Trance','Euro-Disco','Eurobeat',
            'Eurodance','Experimental','Footwork','Freestyle','Freetekno',
            'French House','Funkot','Future Bass','Future House','Future Jazz',
            'Gabber','Garage House','Ghetto','Ghetto House','Ghettotech',
            'Glitch','Glitch Hop','Goa Trance','Gqom','Grime','Halftime',
            'Hands Up','Happy Hardcore','Hard Beat','Hard House','Hard Techno',
            'Hard Trance','Hardcore','Hardstyle','Harsh Noise Wall','Hi NRG',
            'Hip Hop','Hip-House','House','Hyper Techno','Hyperpop','IDM',
            'Illbient','Industrial','Italo House','Italo-Disco','Italodance',
            'J-Core','Jazzdance','Jersey Club','Juke','Jumpstyle','Jungle',
            'Latin','Leftfield','Lento Violento','Lowercase','Makina',
            'Microhouse','Minimal','Minimal Techno','Modern Classical',
            'Moombahton','Musique Concrète','Neo Trance','Neofolk',
            'Nerdcore Techno','New Age','New Beat','New Wave','Noise',
            'Nu-Disco','Plunderphonics','Power Electronics','Progressive Breaks',
            'Progressive House','Progressive Trance','Psy-Trance',
            'Rhythmic Noise','Rōkyoku','Schranz','Skweee','Sound Collage',
            'Speed Garage','Speedcore','Suomisaundi','Synth-pop','Synthpunk',
            'Synthwave','Tech House','Tech Trance','Techno','Trance','Tribal',
            'Tribal House','Trip Hop','Tropical House','UK Funky','UK Garage',
            'Vaporwave','Vocaloid','Witch House',
        ],
        'Rock': [
            'AOR','Acid Rock','Acoustic','Alternative Metal','Alternative Rock',
            'Anarcho-Punk','Anatolian Rock','Arena Rock','Art Rock',
            'Atmospheric Black Metal','Avantgarde','Baroque Pop','Beat',
            'Black Metal','Blackgaze','Blues Rock','Britpop','Brutal Death Metal',
            'Classic Rock','Coldwave','Country Rock','Crossover Thrash','Crust',
            'Death Metal','Deathcore','Deathrock','Depressive Black Metal',
            'Doo Wop','Doom Metal','Dream Pop','Emo','Ethereal','Experimental',
            'Folk Metal','Folk Rock','Funeral Doom Metal','Funk Metal',
            'Garage Rock','Glam','Goregrind','Goth Rock','Gothic Metal',
            'Grindcore','Groove Metal','Group Sounds','Grunge','Hard Rock',
            'Hardcore','Heavy Metal','Horror Rock','Indie Rock','Industrial',
            'Industrial Metal','J-Rock','Jangle Pop','K-Rock','Krautrock',
            'Lo-Fi','Lounge','Math Rock','Mathcore','Melodic Death Metal',
            'Melodic Hardcore','Metalcore','Midwest Emo','Mod','NDW',
            'Neo-Classical Metal','Neofolk','New Wave','Nintendocore','No Wave',
            'Noise','Noise Rock','Noisecore','Nu Metal','Oi','Parody',
            'Pop Punk','Pop Rock','Pornogrind','Post Rock','Post-Grunge',
            'Post-Hardcore','Post-Metal','Post-Punk','Power Metal','Power Pop',
            'Power Violence','Prog Rock','Progressive Metal','Psychedelic Rock',
            'Psychobilly','Pub Rock','Punk','Rock & Roll','Rock Opera',
            'Rockabilly','Screamo','Shoegaze','Ska','Skiffle','Slowcore',
            'Sludge Metal','Soft Rock','Southern Rock','Space Rock',
            'Speed Metal','Stoner Rock','Surf','Swamp Pop','Symphonic Metal',
            'Symphonic Rock','Technical Death Metal','Thrash','Twist',
            'Unblack Metal','Viking Metal','Yé-Yé',
        ],
        'Funk / Soul': [
            'Afrobeat','Bayou Funk','Boogie','Contemporary R&B','Disco',
            'Doo Wop','Free Funk','Funk','Go-Go','Gospel','Minneapolis Sound',
            'Neo Soul','New Jack Swing','P.Funk','Psychedelic','Rhythm & Blues',
            'Soul','Swingbeat','UK Street Soul',
        ],
        'Pop': [
            'Alt-Pop','Anison','Arabic Pop','Ballad','Barbershop','Bollywood',
            'Break-In','Bubblegum','Cantopop','Chanson','City Pop','Dansband',
            'Enka','Ethno-pop','Europop','Exotica','Future Pop','Hokkien Pop',
            'Holiday','Hypnagogic pop','Indie Pop','Indo-Pop','J-pop','K-pop',
            'Karaoke','Kayōkyoku','Latin Pop','Levenslied','Light Music',
            'Mandopop','Manila Sound','Musette','Music Hall','Novelty',
            'Néo Kyma','Parody','Persian Pop','Russian Pop','Ryūkōka',
            'Schlager','Shibuya-Kei','Sunshine Pop','V-pop','Villancicos',
            'Vocal','Zhongguo Feng',
        ],
        "Children's": ['Educational','Lullaby','Nursery Rhymes','Story'],
        'Hip Hop': [
            'Bass Music','Beatbox','Bongo Flava','Boom Bap','Bounce','Britcore',
            'Cloud Rap','Conscious','Crunk','Cut-up/DJ','DJ Battle Tool',
            'Drill','Electro','Favela Funk','G-Funk','Gangsta','Go-Go','Grime',
            'Hardcore Hip-Hop','Hiplife','Horrorcore','Hyphy','Instrumental',
            'Jazzy Hip-Hop','Kwaito','Low Bap','Memphis Rap','Miami Bass',
            'Motswako','Phonk','Pop Rap','Ragga HipHop','RnB/Swing','Screw',
            'Snap','Spaza','Thug Rap','Trap','Trip Hop','Turntablism',
        ],
        'Reggae': [
            'Azonto','Bubbling','Bultrón','Calypso','Dancehall','Dub',
            'Dub Poetry','Junkanoo','Lovers Rock','Mento','Ragga','Rapso',
            'Reggae','Reggae Gospel','Reggae-Pop','Rocksteady','Roots Reggae',
            'Ska','Soca','Steel Band','Toasting',
        ],
        'Blues': [
            'Boogie Woogie','Chicago Blues','Country Blues','Delta Blues',
            'East Coast Blues','Electric Blues','Harmonica Blues',
            'Hill Country Blues','Jump Blues','Louisiana Blues','Memphis Blues',
            'Modern Electric Blues','Piano Blues','Piedmont Blues',
            'Rhythm & Blues','Texas Blues',
        ],
        'Classical': [
            'Aleatoric','Art Song','Atonal','Ballet','Baroque','Bel Canto',
            'Brass Instrument','Cantata','Capriccio','Chamber Music','Choral',
            'Classical','Classical Guitar','Concert Band','Concerto',
            'Concerto Grosso','Contemporary','Dances','Divertimento','Early',
            'Etude','Experimental','Expressionist','Fantasia','Formes Fixes',
            'Futurism','Grand Opera','Harpsichord','Impressionist',
            'Incidental Music','Keyboard','Late Romantic','Lied','Madrigal',
            'Magnificat','Mass','Medieval','Microtonal','Minimalism','Modern',
            'Motet','Neo-Classical','Neo-Romantic','Nocturne','Opera',
            'Operetta','Oratorio','Orchestra','Organ','Overture','Passion',
            'Percussion Ensemble','Piano','Plainchant','Post-Modern','Prelude',
            'Program Music','Renaissance','Requiem','Rhapsody','Romantic',
            'Serenade','Serial','Singspiel','Solo','Sonata','Spectralism',
            'String Ensemble','String Instrument','Style Galant','Suite',
            'Symphony','Te Deum','Theme With Variations','Tone Poem',
            'Twelve-tone','Verismo','Wind Ensemble','Woodwind Instrument',
            'Zarzuela',
        ],
        'Jazz': [
            'Afro-Cuban Jazz','Afrobeat','Avant-garde Jazz','Big Band','Bop',
            'Bossa Nova','Cape Jazz','Contemporary Jazz','Cool Jazz','Dark Jazz',
            'Dixieland','Easy Listening','Free Improvisation','Free Jazz',
            'Fusion','Gypsy Jazz','Hard Bop','Jazz-Funk','Jazz-Rock',
            'Latin Jazz','Modal','Post Bop','Ragtime','Shidaiqu','Smooth Jazz',
            'Soul-Jazz','Space-Age','Spiritual Jazz','Stride','Swing',
        ],
        'Latin': [
            'Afro-Cuban','Aguinaldo','Axé','Bachata','Baião','Bambuco','Banda',
            'Batucada','Beguine','Bolero','Bomba','Boogaloo','Bossanova',
            'Brega','Candombe','Carimbó','Cha-Cha','Champeta','Charanga',
            'Choro','Compas','Conjunto','Corrido','Cuatro','Cubano','Cumbia',
            'Danzon','Descarga','Duranguense','Forró','Frevo','Gaita',
            'Guaguancó','Guajira','Guaracha','Jibaro','Joropo','Lambada',
            'MPB','Mambo','Marcha Carnavalesca','Mariachi','Marimba','Merengue',
            'Música Criolla','Norteño','Nueva Cancion','Nueva Trova','Occitan',
            'Pachanga','Pagode','Plena','Porro','Quechua','Ranchera',
            'Reggaeton','Rumba','Salsa','Samba','Samba-Canção','Seresta',
            'Son','Son Montuno','Sonero','Sport','Tango','Tejano','Timba',
            'Trova','Vallenato',
        ],
        'Folk, World, & Country': [
            'Aboriginal','African','Andalusian Classical','Andean Music',
            'Antifolk','Appalachian Music','Baila','Bakersfield Sound',
            'Bangladeshi Classical','Basque Music','Bengali Music','Bećarac',
            'Bhangra','Bluegrass','Byzantine','Caipira','Cajun',
            'Cambodian Classical','Cantorial','Canzone Napoletana','Carnatic',
            'Catalan Music','Celtic','Chacarera','Chamamé','Chinese Classical',
            'Chutney','Cobla','Copla','Country','Cretan','Currulao','Dabke',
            'Dangdut','Desert Blues','Fado','Filk','Flamenco','Folk','Funaná',
            'Gagaku','Galician Traditional','Gamelan','Geet','Ghazal','Gnawa',
            'Gospel','Griot','Guarania','Gusle','Gwo Ka','Għana','Hawaiian',
            'Highlife','Hillbilly','Hindustani','Honky Tonk','Honkyoku',
            'Huayno','Indian Classical','Izvorna','Jiuta','Jota','Jug Band',
            'Kaseko','Kaskawi','Keroncong','Khaliji','Kizomba','Klasik',
            'Klezmer','Kolo','Korean Court Music','Kuduro','Lao Music',
            'Laïkó','Liscio','Luk Krung','Luk Thung','Maloya','Mbalax',
            'Milonga',"Min'yō",'Mizrahi','Mo Lam','Morna','Mouth Music',
            'Mugham','Nagauta','Neopagan','Nhạc Vàng','Nordic','Népzene',
            'Ojkača','Ottoman Classical','Overtone Singing','Pacific',
            'Pasodoble','Persian Classical','Philippine Classical',
            'Phleng Phuea Chiwit','Piobaireachd','Polka',
            'Progressive Bluegrass','Qawwali','Rara','Raï','Rebetiko',
            'Romani','Rune Singing','Salegy','Sankyoku','Sea Shanties',
            'Sean-nós','Sephardic','Sertanejo','Shaabi','Shinkyoku','Shomyo',
            'Singeli','Sokyoku','Soukous','Spirituals','Sámi Music','Séga',
            'Taarab','Tamburitza','Tamil Film Music','Thai Classical',
            'Trallalero','Volksmusik','Waiata','Western Swing',
            'Yemenite Jewish','Yoruba','Zamba','Zemer Ivri','Zouk','Zydeco',
            'Éntekhno',
        ],
        'Brass & Military': [
            'Brass Band','Guggenmusik','Marches','Military','Pipe & Drum',
        ],
        'Stage & Screen': [
            'Ballet','Cabaret','Concert Film','Music Video','Musical','Score',
            'Soundtrack','Theme','Vaudeville','Video Game Music',
        ],
    };

    const DISCOGS_GENRE_CHECKBOX_ID = {
        'Electronic':             'genre_electronic',
        'Rock':                   'genre_rock',
        'Funk / Soul':            'genre_funk-soul',
        'Pop':                    'genre_pop',
        "Children's":             'genre_children-s',
        'Hip Hop':                'genre_hip-hop',
        'Reggae':                 'genre_reggae',
        'Blues':                  'genre_blues',
        'Classical':              'genre_classical',
        'Folk, World, & Country': 'genre_folk-world-country',
        'Jazz':                   'genre_jazz',
        'Latin':                  'genre_latin',
        'Brass & Military':       'genre_brass-military',
        'Stage & Screen':         'genre_stage-screen',
    };

    const _STYLE_LOOKUP = (() => {
        const map = new Map();
        for (const [genre, styles] of Object.entries(DISCOGS_GENRE_STYLES)) {
            for (const style of styles) {
                const key = style.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (!map.has(key)) map.set(key, { genre, style });
            }
        }
        return map;
    })();

    const _TAG_ALIASES = new Map([
        ['drumandbass',      'drumnbass'],
        ['drumbass',         'drumnbass'],
        ['drumampbass',      'drumnbass'],
        ['dnb',              'drumnbass'],
        ['rhythmnnoise',     'rhythmicnoise'],
        ['rhythmampnoise',   'rhythmicnoise'],
        ['rhythmnoise',      'rhythmicnoise'],
        ['rhytmicnoise',     'rhythmicnoise'],
        ['electronicbodymusic', 'ebm'],
        ['industrialtechno',    ['industrial', 'techno']],
        ['industrialtekno',     ['industrial', 'techno']],
    ]);

    function wiMatchTagsToGenresStyles(tags) {
        const result = new Map();
        for (const tag of (tags || [])) {
            let key = String(tag).toLowerCase().replace(/[^a-z0-9]/g, '');
            const aliasVal = _TAG_ALIASES.get(key);
            const keys = aliasVal ? (Array.isArray(aliasVal) ? aliasVal : [aliasVal]) : [key];
            for (const k of keys) {
                const hit = _STYLE_LOOKUP.get(k);
                if (!hit) continue;
                if (!result.has(hit.genre)) result.set(hit.genre, new Set());
                result.get(hit.genre).add(hit.style);
            }
        }
        return result;
    }

    async function wiApplyGenresAndStyles(genreStyleMap) {
        if (!genreStyleMap || genreStyleMap.size === 0) return [];
        await wiClearAllStyles();
        const snaps = [];
        const raf = () => new Promise(r => requestAnimationFrame(r));

        for (const [genre, styles] of genreStyleMap) {
            const cbId = DISCOGS_GENRE_CHECKBOX_ID[genre];
            if (!cbId) { log(`No checkbox id for genre "${genre}"`, 'warning'); continue; }
            const cb = document.getElementById(cbId);
            if (!cb) { log(`Genre checkbox not found: #${cbId}`, 'warning'); continue; }
            snaps.push({ el: cb, oldChecked: cb.checked, isCb: true });
            if (!cb.checked) {
                cb.click();
                await new Promise(r => setTimeout(r, 250));
            }

            const sel = document.getElementById('release-styles');
            if (!sel) { log(`Styles dropdown not found (genre: "${genre}")`, 'warning'); continue; }

            const applied = [];
            for (const style of styles) {
                const alreadyAdded = Array.from(
                    document.querySelectorAll('.react_drag_drop_field_list.styles li')
                ).some(li => li.textContent.trim() === style);
                if (alreadyAdded) { log(`Style already present: "${style}"`, 'info'); continue; }

                const opt = Array.from(sel.options).find(o => o.value === style);
                if (!opt) { log(`Style "${style}" not in dropdown for genre "${genre}"`, 'warning'); continue; }

                setReactValue(sel, style);
                await raf();
                applied.push(style);
            }
        }
        return snaps;
    }

    async function wiClearAllStyles() {
        let safetyLimit = 60;
        while (safetyLimit-- > 0) {
            const pill = document.querySelector(
                '.react_drag_drop_field_list.styles li button,' +
                '.react_drag_drop_field_list.styles li [role="button"],' +
                '[class*="style"] [class*="remove"],' +
                '[class*="style"] [class*="delete"],' +
                '[data-field-name="styles"] button'
            );
            if (!pill) break;
            pill.click();
            await new Promise(r => requestAnimationFrame(r));
        }
        for (const id of Object.values(DISCOGS_GENRE_CHECKBOX_ID)) {
            const cb = document.getElementById(id);
            if (cb && cb.checked) cb.click();
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

    async function getTrackRowsOrBail() {
        const rows = getTrackInputRows();
        if (rows.length === 0) {
            await clearInfoProcessing();
            log('No track rows found', 'error');
            setInfoSingleLine('No tracks found', false);
            return null;
        }
        return rows;
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
        s = s.replace(/\s+except\b.*/i, '');

        if (preserveWrapping) {
            if (s.startsWith('[') && s.endsWith(']')) {
                return s;
            }
            if (s.startsWith('(') && s.endsWith(')')) {
                const inner = s.slice(1, -1).trim();
                return '(' + inner + ')';
            }
            const isColonWrapped = /^:/.test(s) && /:$/.test(s);
            s = s.replace(/^[\s\(\-:\.]+/, '');
            s = s.replace(/[\s\-\:;,\.]+$/g, '');
            if (isColonWrapped) s = ':' + s.replace(/:$/, '') + ':';
            return s;
        }
        if (s.startsWith('[') && s.endsWith(']')) {
            return s;
        }
        if (s.startsWith('(') && s.endsWith(')')) {
            s = s.slice(1, -1).trim();
        }
        const isColonWrapped2 = /^:/.test(s) && /:$/.test(s);
        s = s.replace(/^[\s\(\-:\.]+/, '');
        s = s.replace(/[\s\-\:;,\.]+$/g, '');
        if (isColonWrapped2) s = ':' + s.replace(/:$/, '') + ':';
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
            .map(t => {
                const escaped = escapeRegExp(t);
                return /^[A-Za-z]/.test(t) ? `(?<!\\S)${escaped}` : escaped;
            });
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

    function wiSplitArtistForImport(str) {
        if (!str || !str.trim()) return [];
        const parts = [];
        const fp = buildFeaturingPattern();
        if (fp) parts.push(fp);
        for (const s of CONFIG.ARTIST_SPLITTER_PATTERNS) {
            if (isAlphaToken(s)) parts.push(`(?<!\\S)(?:${escapeRegExp(s)}\\.?)(?!\\S)`);
            else parts.push(`(?:${escapeRegExp(s)})`);
        }
        const captureRe = new RegExp(`\\s*(${parts.join('|')})\\s*`, 'i');
        const rawTokens = str.split(captureRe).map(s => s.trim()).filter(s => s !== '');
        if (rawTokens.length <= 1) return [{ name: str.trim() }];
        const result = [];
        let expectName = true;
        let lastSep = undefined;
        for (let i = 0; i < rawTokens.length; i++) {
            const tok = rawTokens[i];
            const tokNorm = tok.trim().toLowerCase().replace(/\.$/, '');
            const isConfiguredSep = CONFIG.ARTIST_SPLITTER_PATTERNS.some(p => p.toLowerCase() === tokNorm);
            const isSep = captureRe.test(tok) && (!tok.match(/^[A-Za-z]{2,}$/) || isConfiguredSep);
            if (isSep) { lastSep = tok; expectName = true; }
            else if (expectName) {
                if (tok) result.push({ name: tok, joinBefore: result.length > 0 ? lastSep : undefined });
                lastSep = undefined; expectName = false;
            }
        }
        return result.length > 0 ? result : [{ name: str.trim() }];
        return result.length > 0 ? result : [{ name: str.trim() }];
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
        const normalized = raw.replace(/\bV\/A\b/gi, 'Various');
        const splitter = buildSplitterRegexNoGlobal();
        const parts = normalized.split(splitter).map(p => cleanupArtistName(p, true)).filter(Boolean);
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
        let joinInput = artistContainer.querySelector('input[size="10"]');
        if (joinInput) return joinInput;
        let nextSib = artistContainer.nextElementSibling;
        let attempts = 0;
        while (nextSib && attempts < 10) {
            attempts++;
            const jInput = nextSib.querySelector('input[size="10"]');
            if (jInput) return jInput;
            nextSib = nextSib.nextElementSibling;
        }
        const allJoins = Array.from(row.querySelectorAll('input[size="10"]'));
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
            const lastBtn = targets[targets.length - 1];
            if (lastBtn && lastBtn.isConnected) {
                lastBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            setInfoSingleLine('No fields toggled', false);
            log('No fields toggled', 'info');
        }
    }

    async function extractTrackPositions() {
        await setInfoProcessing();
        log('Starting track position extraction...', 'info');

        let trackRows = await getTrackRowsOrBail();
        if (!trackRows) return;

        const changes = [];
        let processed = 0;

        trackRows.forEach((row, index) => {
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            const trackPositionInput = row.querySelector('input.track-number-input');

            if (!titleInput || !trackPositionInput) return;

            const title = titleInput.value.trim();

            const posRe = /^[\[(]?([A-Za-z]{0,2}\d+[A-Za-z]?)[\])]?\.?\s*[-–—.:]*\s+/;
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

        let trackRows = await getTrackRowsOrBail();
        if (!trackRows) return;

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
                    let joinInputs = Array.from(row.querySelectorAll('input[size="10"]'));

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

        let trackRows = await getTrackRowsOrBail();
        if (!trackRows) return;

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

    async function swapArtistTitle() {
        await setInfoProcessing();
        log('Starting artist ↔ title swap...', 'info');
        await wiOpenSavedLinks();

        let trackRows = await getTrackRowsOrBail();
        if (!trackRows) return;

        const changes = [];
        let processed = 0;

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput  = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            const trackRowEls = new Set(getTrackInputRows());
            const artistInput = row.querySelector('input[data-type="artist-name"], input.credit-artist-name-input');
            if (!titleInput || !artistInput) continue;

            const oldTitle  = (titleInput.value  || '').trim();
            const oldArtist = (artistInput.value || '').trim();
            if (!oldTitle && !oldArtist) continue;

            setReactValue(titleInput,  oldArtist);
            setReactValue(artistInput, oldTitle);
            changes.push({ titleInput, artistInput, oldTitle, newTitle: oldArtist, oldArtist, newArtist: oldTitle });
            processed++;
            log(`Track ${i + 1}: Swapped artist "${oldArtist}" ↔ title "${oldTitle}"`, 'success');
        }

        if (changes.length > 0) addActionToHistory({ type: 'swapArtistTitle', changes });

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed !== 1 ? 's' : '';
            setInfoSingleLine(`Done! Swapped ${processed} track${plural}`, true);
            log(`Done! Swapped ${processed} track${plural}`, 'success');
        } else {
            setInfoSingleLine('Nothing to swap', false);
            log('No swappable tracks found', 'info');
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

        let trackRows = await getTrackRowsOrBail();
        if (!trackRows) return;

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

    async function extractFeaturing(silent = false) {
        if (typeof silent !== 'boolean') silent = false;
        await setInfoProcessing();
        if (!silent) log('Starting feat artist extraction...', 'info');
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
            if (!silent) {
                setInfoSingleLine(`Done! Extracted ${processed} feat artist${plural}`, true);
                log(`Done! Extracted ${processed} feat artist${plural}`, 'success');
            }
        } else if (foundButAlreadyEntered > 0) {
            if (!silent) {
                setInfoSingleLine('Feat artists already entered', false);
                log('Feat artists already entered', 'info');
            }
        } else {
            if (!silent) {
                setInfoSingleLine('No feat artists found', false);
                log('No feat artists found', 'info');
            }
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
            if (re.test(str)) { return true; }
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
        const quoteLeadM = core.match(/^([\u0027\u2018\u2019\u201B\u02BB\u02BC\u00B4`]+)([\s\S]*)$/u);
        if (quoteLeadM) {
            return quoteLeadM[1] + capitalizeWord(quoteLeadM[2], isFirst);
        }
        const lc = core.toLowerCase();
        if (core.indexOf('.') !== -1) {
            const parts = core.split('.').filter(Boolean);
            if (parts.length > 1 && parts.every(p => /^[\p{L}]+$/u.test(p) && p.length <= 3)) {
                if (/[a-z]/.test(core) && !CONFIG.CAPITALIZE_KEEP_UPPER.includes(core.toUpperCase())) {
                } else {
                    const suffix = core.endsWith('.') ? '.' : '';
                    return parts.map(p => p.toUpperCase()).join('.') + suffix;
                }
            }
        }
        if (CONFIG.CAPITALIZE_KEEP_UPPER.some(w => w.toLowerCase() === lc)) {
            return core.toUpperCase();
        }
        if (!isFirst && CONFIG.CAPITALIZE_KEEP_LOWER.some(w => w.toLowerCase() === lc)) {
            return lc;
        }
        const numPrefixM = core.match(/^(\d+)([\p{L}])(.*)/u);
        if (numPrefixM) {
            const ampmM = core.match(/^(\d+)(am|pm)$/i);
            if (ampmM) return ampmM[1] + ampmM[2].toUpperCase();
            return numPrefixM[1] + numPrefixM[2].toUpperCase() + numPrefixM[3].toLowerCase();
        }
        if (state.capitalizeMixedCase && /\p{Lu}/u.test(core.slice(1)) && /\p{Ll}/u.test(core)) {
            return core;
        }
        return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
    }

    function capitalizeSegmentSegmentwise(token, isFirst) {
        if (!token) return token;
        if (/^[\p{L}]{1,3}(\.[\p{L}]{1,3})+\.?$/u.test(token)) {
            if (/[a-z]/.test(token) && !CONFIG.CAPITALIZE_KEEP_UPPER.includes(token.toUpperCase())) {
            } else {
                return token.toUpperCase();
            }
        }
        let firstMatchDone = false;
        let lastNonWordChar = '';
        return token.replace(/([\p{L}\p{N}\u0027\u2018\u2019\u201B\u02BB\u02BC\u00B4`]+)|([^\p{L}\p{N}\u0027\u2018\u2019\u201B\u02BB\u02BC\u00B4`]+)/gu, (match, word, nonWord) => {
            if (nonWord !== undefined) {
                lastNonWordChar = nonWord;
                return nonWord;
            }
            const treatAsFirst = !firstMatchDone || /&/.test(lastNonWordChar);
            lastNonWordChar = '';
            if (!firstMatchDone) firstMatchDone = true;
            if (treatAsFirst) return capitalizeWord(word, isFirst);
            return word.toLowerCase();
        });
    }

    function getFieldLabel(el, preTrackRows, preAlbumArtistEls) {
        const id = el.id || '';
        const dataType = el.getAttribute('data-type') || '';
        const cls = el.className || '';
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = el.getAttribute('placeholder') || '';
        const trackRows = preTrackRows || getTrackInputRows();
        const trackRowEls = new Set(trackRows);
        const albumArtistEls = preAlbumArtistEls || new Set(
            Array.from(document.querySelectorAll('input[data-type="artist-name"], #artist-name-input'))
                .filter(el => !Array.from(trackRowEls).some(row => row.contains(el)))
        );
        const trackIdx = trackRows.findIndex(row =>
            Array.from(row.querySelectorAll(
                'input[data-type="artist-name"], input.credit-artist-name-input, ' +
                'input[data-type="track-title"], input[id*="track-title"], ' +
                'input.track-number-input, td.subform_track_duration input, ' +
                'input[aria-label*="duration" i], input.add-credit-role-input'
            )).includes(el)
        );
        const trackPrefix = trackIdx >= 0 ? `Track ${trackIdx + 1}: ` : '';
        if (id === 'release-title-input')           return 'Album Title';
        if (id.startsWith('label-name-input')) {
            const type = el.closest('fieldset')?.querySelector('select.label-name-select')?.selectedOptions?.[0]?.text || 'Label';
            return `LCCN (${type}): Name`;
        }
        if (id.startsWith('catalog-number-input')) {
            const type = el.closest('fieldset')?.querySelector('select.label-name-select')?.selectedOptions?.[0]?.text || 'Label';
            return `LCCN (${type}): Cat#`;
        }
        if (id.startsWith('free-text-input'))       return 'Free Text';
        if (id === 'release-date')                  return 'Date';
        if (placeholder === 'Join' || ariaLabel === 'join') return `${trackPrefix}Joiner`;
        if (dataType === 'track-title' || id.includes('track-title')) return `${trackPrefix}Title`;
        if (cls.includes('track-number-input'))     return `${trackPrefix}Position`;
        if (ariaLabel.includes('duration') || el.closest?.('td.subform_track_duration')) return `${trackPrefix}Duration`;
        if (cls.includes('add-credit-role-input') || ariaLabel === 'add artist role') return `${trackPrefix}Role`;
        if (cls.includes('credit-artist-name-input') || dataType === 'artist-name-credits') return `${trackPrefix}Credit`;
        if (dataType === 'artist-name') return albumArtistEls.has(el) ? 'Album Artist' : `${trackPrefix}Artist`;
        if (el.closest?.('div[data-path="/barcodes"]')) {
            const type = el.closest('fieldset')?.querySelector('select')?.selectedOptions?.[0]?.text || 'Identifier';
            return `BAOI (${type})`;
        }
        return `${trackPrefix}Field`;
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
                    const internalChars = "\u0027\u2018\u2019\u201B\u02BB\u02BC\u00B4`";
                    const leadMatch = tok.match(new RegExp(`^([^\\p{L}\\p{N}${internalChars}]*)(.*)$`, 'u'));
                    const lead = (leadMatch ? leadMatch[1] : '') || '';
                    const rest = (leadMatch ? leadMatch[2] : tok) || tok;
                    const trailMatch = rest.match(new RegExp(`^(.*)([^\\p{L}\\p{N}${internalChars}]*)$`, 'u'));
                    const core = (trailMatch ? trailMatch[1] : rest) || rest;
                    const trail = (trailMatch ? trailMatch[2] : '') || '';
                    const isFirst = !firstWordDone;
                    firstWordDone = true;
                    let transformed;
                    if (/[-\/\\;=+#~|_@]/.test(core)) {
                        transformed = core.split(/([-\/\\;=+#~|_@])/).map((seg, idx) =>
                            /[-\/\\;=+#~|_@]/.test(seg) ? seg : seg ? capitalizeSegmentSegmentwise(seg, idx === 0 ? isFirst : true) : ''
                        ).join('');
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
        candidate = candidate.replace(/\.(\p{Ll})/gu, (_, c) => '.' + c.toUpperCase());
        candidate = candidate.replace(/(\p{L})([\u2019\u0027])(\p{Ll})/gu, (_, before, apos, after) => before + apos + after);
        candidate = candidate.replace(/(?<![\p{L}\.])(["\u201D\u2019\u0027\)\]])(\p{Ll})/gu, (_, close, c) => close + c.toUpperCase())
        candidate = candidate.replace(/(\p{L})([\u2019\u0027])S\b/gu, (_, before, apos) => before + apos + 's');
        candidate = candidate.replace(/(\p{L})([\u2019\u0027])(\p{Lu})/gu, (_, before, apos, after) => before + apos + after.toLowerCase());
        candidate = candidate.replace(/\bSelf-Released\b/g, 'Self-released');
        return candidate;
    }

    async function cleanTitles() {
        await setInfoProcessing();
        log('Starting title cleanup...', 'info');

        let trackRows = await getTrackRowsOrBail();
        if (!trackRows) return;

        const escaped = CONFIG.CLEAN_TITLE_PATTERNS
            .slice()
            .sort((a, b) => b.length - a.length)
            .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/000/g, '\\d+'));
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

    async function cleanTitlesCustom(pattern) {
        await setInfoProcessing();
        const trackRows = await getTrackRowsOrBail();
        if (!trackRows) return;
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('(?<![\\w\u00C0-\u024F])' + escaped + '(?![\\w\u00C0-\u024F])', 'gi');
        const changes = [];
        let processed = 0;
        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const original = (titleInput.value || '').trim();
            if (!original) continue;
            const cleaned = original.replace(re, '').replace(/\s{2,}/g, ' ').trim();
            if (cleaned !== original) {
                setReactValue(titleInput, cleaned);
                changes.push({ titleInput, oldTitle: original, newTitle: cleaned });
                processed++;
            }
        }
        if (changes.length > 0) addActionToHistory({ type: 'cleanTitles', changes });
        await clearInfoProcessing();
        const plural = processed !== 1 ? 's' : '';
        if (processed > 0) { setInfoSingleLine(`Done! Cleaned ${processed} title${plural}`, true); log(`Done! Cleaned ${processed} title${plural}`, 'success'); }
        else { setInfoSingleLine('No matches found', false); log('No matches found', 'info'); }
    }

    function openCleanTitlesCustomOverlay() {
        const existing = document.getElementById('dh-ct-custom-overlay');
        if (existing) { existing.querySelector('#dh-ct-custom-input')?.focus(); return; }
        const panel = document.getElementById('helper-panel');
        const panelRect = panel ? panel.getBoundingClientRect() : { top: 165, right: window.innerWidth - 20, width: 255 };
        const isDark = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark';
        const overlay = document.createElement('div');
        overlay.id = 'dh-ct-custom-overlay';
        overlay.style.cssText = [
            'position:fixed',
            `top:${panelRect.top - 1}px`,
            `right:${window.innerWidth - panelRect.right}px`,
            `width:${panelRect.width + 100}px`,
            `background:${isDark ? '#17191c' : '#fff'}`,
            `border:1px solid ${isDark ? '#333' : '#ccc'}`,
            'border-radius:8px',
            'box-shadow:0 4px 12px rgba(0,0,0,0.08)',
            'z-index:10001',
            'display:flex',
            'flex-direction:column',
            'font-family:Arial,sans-serif',
            'box-sizing:border-box',
        ].join(';');
        overlay.innerHTML = [
            `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px 7px;border-bottom:1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)'};flex-shrink:0;">`,
            `<strong style="font-size:13px;font-weight:600;color:${isDark ? '#ddd' : '#111'};user-select:none;-webkit-user-select:none;cursor:default;white-space:nowrap;letter-spacing:0.01em;"><span style="font-weight:normal;margin-right:4px;">✂️</span>Custom Text Removal</strong>`,
            `<button id="dh-ct-close" style="background:none;border:none;cursor:pointer;font-size:13px;padding:1px 4px;opacity:0.65;color:${isDark ? '#aaa' : '#555'};">✕</button>`,
            '</div>',
            '<div style="padding:6px 10px 7px;flex-shrink:0;">',
            `<input type="text" id="dh-ct-custom-input" placeholder="Enter text to remove from track titles (including outside brackets)" style="width:100%;font-size:11px;border:1px solid ${isDark ? '#333' : '#ccc'};border-radius:4px;padding:5px 7px;box-sizing:border-box;background:${isDark ? '#1a1c1f' : '#fff'};color:${isDark ? '#ddd' : '#222'};">`,
            '</div>',
            `<div style="display:flex;align-items:center;gap:6px;padding:7px 10px 8px;border-top:1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'};flex-shrink:0;">`,
            '<button id="dh-ct-apply" style="flex:1;background:#28a745;color:#fff;border:1px solid transparent;border-radius:5px;padding:0;height:34px;box-sizing:border-box;font-size:12px;cursor:pointer;font-weight:600;">Apply</button>',
            `<button id="dh-ct-cancel" style="flex:1;background:${isDark ? '#2a2c2f' : '#f0f0f0'};color:${isDark ? '#ccc' : '#444'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:5px;padding:0;height:34px;box-sizing:border-box;font-size:12px;cursor:pointer;">Cancel</button>`,
            '</div>',
        ].join('');
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#dh-ct-close').onclick  = close;
        overlay.querySelector('#dh-ct-cancel').onclick = close;
        overlay.querySelector('#dh-ct-apply').onclick  = () => {
            const val = (overlay.querySelector('#dh-ct-custom-input')?.value || '').trim();
            if (!val) return;
            close();
            cleanTitlesCustom(val);
        };
        overlay.querySelector('#dh-ct-custom-input').addEventListener('keydown', e => {
            if (e.key === 'Enter')  overlay.querySelector('#dh-ct-apply').click();
            if (e.key === 'Escape') close();
        });
        overlay.querySelector('#dh-ct-custom-input').focus();
    }

    async function bracketsToParen() {
        await setInfoProcessing();
        log('Converting brackets to parentheses...', 'info');

        const trackRows = await getTrackRowsOrBail();
        if (!trackRows) return;

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

    async function dashToParens() {
        await setInfoProcessing();
        log('Converting dash version titles to parentheses...', 'info');

        const trackRows = await getTrackRowsOrBail();
        if (!trackRows) return;

        const changes = [];
        let processed = 0;
        const dashRe = /^(.+?)\s*[\u2013\u2014-]\s+(.+)$/;

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            if (!titleInput) continue;
            const original = (titleInput.value || '').trim();
            if (!original) continue;

            const m = original.match(dashRe);
            if (!m) continue;
            const converted = `${m[1].trim()} (${m[2].trim()})`;
            if (converted !== original) {
                setReactValue(titleInput, converted);
                changes.push({ titleInput, oldTitle: original, newTitle: converted });
                processed++;
                log(`Track ${i + 1}: "${original}" → "${converted}"`, 'success');
            }
        }

        if (changes.length > 0) addActionToHistory({ type: 'bracketsToParen', changes });
        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed > 1 ? 's' : '';
            setInfoSingleLine(`Done! Converted ${processed} dash title${plural}`, true);
            log(`Done! Converted ${processed} dash title${plural}`, 'success');
        } else {
            setInfoSingleLine('No dashes found', false);
            log('No dashes found', 'info');
        }
    }

    async function capitalizeTitles() {
        await setInfoProcessing();
        log('Starting title capitalization...', 'info');

        let trackRows = await getTrackRowsOrBail();
        if (!trackRows) return;

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

    async function stripWhitespace() {
        await setInfoProcessing();
        log('Starting whitespace strip...', 'info');
        await wiOpenSavedLinks();

        const panel = document.getElementById('helper-panel');
        const trackRows = getTrackInputRows();
        const trackRowEls = new Set(trackRows);
        const albumArtistEls = new Set(
            Array.from(document.querySelectorAll('input[data-type="artist-name"], #artist-name-input'))
                .filter(el => !Array.from(trackRowEls).some(row => row.contains(el)))
        );
        const getTrackIdx = (el) => trackRows.findIndex(row =>
            Array.from(row.querySelectorAll(
                'input[data-type="artist-name"], input.credit-artist-name-input, ' +
                'input[data-type="track-title"], input[id*="track-title"], ' +
                'input.track-number-input, td.subform_track_duration input, ' +
                'input[aria-label*="duration" i], input.add-credit-role-input'
            )).includes(el)
        );
        const seen = new Set();
        const selectors = [
            'input[data-type="artist-name"]',
            '#artist-name-input',
            '#release-title-input',
            'input[id^="label-name-input"]',
            'input[id^="catalog-number-input"]',
            'input[id^="free-text-input"]',
            '#release-date',
            'input[size="10"]',
            'input[data-type="track-title"], input[id*="track-title"]',
            'input.track-number-input',
            'td.subform_track_duration input, input[aria-label*="duration" i]',
            'input.credit-artist-name-input',
            'input[data-type="artist-name-credits"]',
            'input.add-credit-role-input, input[aria-label="Add Artist Role"]',
            'div[data-path="/barcodes"] input[type="text"]',
        ];

        const changes = [];
        let processed = 0;

        for (const el of selectors.flatMap(sel => Array.from(document.querySelectorAll(sel))).filter(el => {
            if (!el || !el.isConnected || panel?.contains(el) || seen.has(el)) return false;
            seen.add(el); return true;
        })) {
            const orig = el.value ?? '';
            const stripped = orig.trim();
            if (stripped !== orig) {
                setReactValue(el, stripped);
                changes.push({ titleInput: el, oldTitle: orig, newTitle: stripped });
                log(`${getFieldLabel(el, trackRows, albumArtistEls)}: "${orig}" → "${stripped}"`, 'success');
                processed++;
            }
        }

        if (changes.length > 0) addActionToHistory({ type: 'stripWhitespace', changes });

        await clearInfoProcessing();
        if (processed > 0) {
            const plural = processed !== 1 ? 's' : '';
            setInfoSingleLine(`Done! Stripped ${processed} field${plural}`, true);
            log(`Done! Stripped whitespace from ${processed} field${plural}`, 'success');
        } else {
            setInfoSingleLine('No whitespace found', false);
            log('No whitespace to strip', 'info');
        }
    }

    async function wiOpenSavedLinks() {
        const panel = document.getElementById('helper-panel');
        const getOuterBtns = (icon) => Array.from(document.body.querySelectorAll('button'))
            .filter(btn => (!panel || !panel.contains(btn)) && btn.querySelector(icon));
        const pencilBtns = getOuterBtns('i.icon-pencil');
        if (pencilBtns.length === 0) {
            if (getOuterBtns('i.icon-check').length > 0) await new Promise(r => setTimeout(r, 150));
            return 0;
        }
        const checksBefore = getOuterBtns('i.icon-check').length;
        const expectedTotal = checksBefore + pencilBtns.length;
        for (const btn of pencilBtns) {
            if (btn.isConnected) try { btn.click(); } catch(e) {}
        }
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 80));
            if (getOuterBtns('i.icon-check').length >= expectedTotal) {
                await new Promise(r => setTimeout(r, 150));
                break;
            }
        }
        return pencilBtns.length;
    }

    async function openSavedLinksIfNeeded(editableItems) {
        const panel = document.getElementById('helper-panel');
        const anyInputSel = 'input[data-type="artist-name"], input.credit-artist-name-input, input[data-type="artist-name-credits"]';

        function getDisplayedName(item) {
            const rolloverLink = item.querySelector('a.rollover_link, span.rollover_link');
            if (rolloverLink) return rolloverLink.textContent.trim();
            const clone = item.cloneNode(true);
            clone.querySelectorAll('button, input').forEach(el => el.remove());
            const text = clone.textContent.trim();
            if (!text || /^\s*[+&,/\\]\s*$/.test(text)) return null;
            return text;
        }


        const containersToOpen = new Map();
        for (const item of editableItems) {
            if (!item.isConnected) continue;
            const existingInput = item.querySelector(anyInputSel);
            if (existingInput && existingInput.value && existingInput.value.trim()) {
                continue;
            }
            const displayedName = getDisplayedName(item);
            if (!displayedName) {
                continue;
            }
            if (capitalizeTitleString(displayedName) === displayedName) {
                continue;
            }
            const container = item.closest('td') || item.parentElement;
            if (containersToOpen.has(container)) continue;
            const pencilBtn = Array.from(container.querySelectorAll('button'))
                .find(b => (!panel || !panel.contains(b)) && b.querySelector('i.icon-pencil'));
            if (pencilBtn) {
                containersToOpen.set(container, pencilBtn);
            } else {
            }
        }

        if (containersToOpen.size === 0) return 0;

        const getCheckCount = () => Array.from(document.body.querySelectorAll('button'))
            .filter(btn => (!panel || !panel.contains(btn)) && btn.querySelector('i.icon-check')).length;
        const checksBefore = getCheckCount();
        const expectedTotal = checksBefore + containersToOpen.size;
        for (const btn of containersToOpen.values()) {
            if (btn.isConnected) try { btn.click(); } catch(e) {}
        }
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 80));
            if (getCheckCount() >= expectedTotal) { await new Promise(r => setTimeout(r, 150)); break; }
        }
        return containersToOpen.size;
    }

    async function openContainersIfSaved(containers) {
        const panel = document.getElementById('helper-panel');
        const toOpen = [];
        const seen = new Set();
        for (const container of containers) {
            if (!container || !container.isConnected || seen.has(container)) continue;
            seen.add(container);
            const pencilBtn = Array.from(container.querySelectorAll('button'))
                .find(b => (!panel || !panel.contains(b)) && b.querySelector('i.icon-pencil'));
            if (pencilBtn) toOpen.push(pencilBtn);
        }
        if (toOpen.length === 0) return 0;
        const getCheckCount = () => Array.from(document.body.querySelectorAll('button'))
            .filter(btn => (!panel || !panel.contains(btn)) && btn.querySelector('i.icon-check')).length;
        const checksBefore = getCheckCount();
        const expectedTotal = checksBefore + toOpen.length;
        for (const btn of toOpen) {
            if (btn.isConnected) try { btn.click(); } catch(e) {}
        }
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 80));
            if (getCheckCount() >= expectedTotal) { await new Promise(r => setTimeout(r, 150)); break; }
        }
        return toOpen.length;
    }

    function getJoinerContainersNeedingWork() {
        const panel = document.getElementById('helper-panel');
        const joinSel = 'input[size="10"]';
        const needsCap = (s) => s && capitalizeTitleString(s.trim()) !== s.trim();
        const result = [];
        const seen = new Set();

        function getSavedJoinTexts(container) {
            const texts = [];
            for (const item of container.querySelectorAll('li.editable_item')) {
                const creditRole = item.querySelector('span.credit_role');
                if (!creditRole) continue;
                for (const span of creditRole.children) {
                    if (span.tagName !== 'SPAN') continue;
                    if (span.className) continue;
                    const t = span.textContent.trim();
                    if (t) texts.push(t);
                }
            }
            return texts;
        }

        function checkContainer(container) {
            if (!container || !container.isConnected || seen.has(container)) return;
            seen.add(container);

            const visibleJoins = Array.from(container.querySelectorAll(joinSel));
            if (visibleJoins.some(el => needsCap(el.value))) {
                result.push(container);
                return;
            }

            const pencilBtn = Array.from(container.querySelectorAll('button'))
                .find(b => (!panel || !panel.contains(b)) && b.querySelector('i.icon-pencil'));
            if (!pencilBtn) return;

            const joinTexts = getSavedJoinTexts(container);
            if (joinTexts.some(t => needsCap(t))) {
                result.push(container);
            }
        }

        for (const row of getTrackInputRows()) {
            const td = row.querySelector('td.subform_track_artists');
            if (td) checkContainer(td);
        }

        const trackRowEls = new Set(getTrackInputRows());
        const albumArtistInputs = Array.from(
            document.querySelectorAll('input[data-type="artist-name"], #artist-name-input')
        ).filter(el => !Array.from(trackRowEls).some(row => row.contains(el)));

        for (const input of albumArtistInputs) {
            let el = input.parentElement;
            while (el && el !== document.body) {
                if (el.querySelector('li.editable_item') || el.querySelector(joinSel)) {
                    checkContainer(el);
                    break;
                }
                el = el.parentElement;
            }
        }
        const albumItems = Array.from(document.querySelectorAll('li.editable_item'))
            .filter(item => !Array.from(trackRowEls).some(row => row.contains(item))
                         && !item.querySelector('span.credit_role'));
        for (const item of albumItems) {
            const container = item.closest('td')
                           || item.closest('fieldset')
                           || item.closest('[data-path]')
                           || item.parentElement?.closest('div, section');
            if (container) checkContainer(container);
        }

        return result;
    }

    async function capitalizeAll() {
        await setInfoProcessing();
        const cf = state.capitalizeFields;
        const capStr = (s) => s ? capitalizeTitleString(s) : s;
        const applyField = (el, changes, fieldLabel) => {
            const orig = (el.value || '').trim();
            const cand = capStr(orig);
            if (cand && cand !== orig) {
                setReactValue(el, cand);
                changes.push({ titleInput: el, oldTitle: orig, newTitle: cand });
                log(`${fieldLabel}: "${orig}" → "${cand}"`, 'success');
                return 1;
            }
            return 0;
        };

        const changes = [];
        let processed = 0;
        const trackRows = getTrackInputRows();
        const trackRowEls = new Set(trackRows);

        if (cf.albumArtists || cf.creditNames) {
            const albumItems = Array.from(document.querySelectorAll('li.editable_item'))
                .filter(item => !Array.from(trackRowEls).some(row => row.contains(item)));
            await openSavedLinksIfNeeded(albumItems);
        }

        if (cf.vaArtists || cf.trackCredits) {
            const trackItems = [];
            for (const row of trackRows) {
                if (cf.vaArtists)    trackItems.push(...row.querySelectorAll('td.subform_track_artists li.editable_item'));
                if (cf.trackCredits) trackItems.push(...row.querySelectorAll('td.subform_track_title li.editable_item'));
            }
            await openSavedLinksIfNeeded(trackItems);
        }

        if (cf.joiners) {
            await openContainersIfSaved(getJoinerContainersNeedingWork());
        }

        if (cf.albumArtists) {
            document.querySelectorAll('input[data-type="artist-name"], #artist-name-input').forEach(el => {
                if (!Array.from(trackRowEls).some(row => row.contains(el))) processed += applyField(el, changes, 'Album Artist');
            });
        }

        if (cf.creditNames) {
            document.querySelectorAll('input.credit-artist-name-input, input[data-type="artist-name-credits"]').forEach(el => {
                if (!Array.from(trackRowEls).some(row => row.contains(el))) processed += applyField(el, changes, 'Album Credit');
            });
        }

        if (cf.joiners) {
            document.querySelectorAll('input[size="10"]').forEach(el => {
                if (!Array.from(trackRowEls).some(row => row.contains(el)))
                    processed += applyField(el, changes, 'Album Artist Joiner');
            });
        }

        for (let i = 0; i < trackRows.length; i++) {
            const row = trackRows[i];
            const n = i + 1;

            if (cf.trackTitles) {
                const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
                if (titleInput) processed += applyField(titleInput, changes, `Track ${n}: Title`);
            }

            if (cf.vaArtists) {
                row.querySelectorAll('td.subform_track_artists input[data-type="artist-name"], td.subform_track_artists input.credit-artist-name-input').forEach(el => {
                    processed += applyField(el, changes, `Track ${n}: Artist`);
                });
            }

            if (cf.joiners) {
                row.querySelectorAll('input[size="10"]').forEach(el => {
                    processed += applyField(el, changes, `Track ${n}: Joiner`);
                });
            }

            if (cf.trackCredits) {
                row.querySelectorAll('td.subform_track_title input.credit-artist-name-input, td.subform_track_title input[data-type="artist-name-credits"]').forEach(el => {
                    processed += applyField(el, changes, `Track ${n}: Credit`);
                });
            }
        }

        if (changes.length > 0) addActionToHistory({ type: 'capitalization', changes });
        await clearInfoProcessing();
        if (processed > 0) {
            setInfoSingleLine(`Done! Capitalized ${processed} field${processed !== 1 ? 's' : ''}`, true);
            log(`Done! Capitalized ${processed} field${processed !== 1 ? 's' : ''}`, 'success');
        } else {
            setInfoSingleLine('Already capitalized', false);
            log('Already capitalized', 'info');
        }
    }

    async function extractRemixers(optionalOnly = false, silent = false) {
        if (typeof optionalOnly !== 'boolean') optionalOnly = false;
        await setInfoProcessing();
        if (!silent) log(`Starting remixer extraction${optionalOnly ? ' (Strict Optional Only)' : ''}...`, 'info');

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
                if (/^\s*original(?:\s+(?:mix|version|dub|edit|instrumental|vocal|radio\s+edit|club\s+mix|extended\s+mix))?\s*$/i.test(inner)) continue;
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
            if (!silent) {
                setInfoSingleLine(`Done! Extracted ${processed} remixer${plural}`, true);
                log(`Done! Extracted ${processed} remixer${plural}`, 'success');
            }
        } else if (foundButAlreadyEntered > 0) {
            if (!silent) {
                setInfoSingleLine('Remixers already entered', false);
                log('Remixers already entered', 'info');
            }
        } else {
            if (!silent) {
                setInfoSingleLine('No remixers found', false);
                log('No remixers found', 'info');
            }
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
    while (state.actionHistory.length > 0 && state.actionHistory[state.actionHistory.length - 1].type === 'webImport') {
        state.actionHistory.pop();
    }
    const lastAction = state.actionHistory.pop();
    log(`Reverting last action (${lastAction.type})…`, 'info');

    if (lastAction.type === 'durations') {
        let restored = 0;
        for (const change of lastAction.changes) {
            if (change.titleInput)    setReactValue(change.titleInput,    change.oldTitle);
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
            if (change.titleInput)         setReactValue(change.titleInput,         change.oldTitle);
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

    if (lastAction.type === 'cleanTitles' || lastAction.type === 'capitalization' || lastAction.type === 'bracketsToParen' || lastAction.type === 'stripWhitespace') {
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
        const verb = lastAction.type === 'bracketsToParen'  ? `bracket title${plural}`
                   : lastAction.type === 'cleanTitles'      ? `cleaned title${plural}`
                   : lastAction.type === 'stripWhitespace'  ? `stripped field${plural}`
                   :                                          `capitalized field${plural}`;
        setInfoSingleLine(`Done! Reverted ${restored} ${verb}`, true);
        log(`Done! Reverted ${restored} ${verb}`, 'success');
        return;
    }

    if (lastAction.type === 'swapArtistTitle') {
        let restored = 0;
        for (const change of lastAction.changes) {
            if (change.titleInput?.isConnected)  setReactValue(change.titleInput,  change.oldTitle  ?? '');
            if (change.artistInput?.isConnected) setReactValue(change.artistInput, change.oldArtist ?? '');
            restored++;
        }
        updateRevertButtons();
        await clearInfoProcessing();
        const plural = restored !== 1 ? 's' : '';
        setInfoSingleLine(`Done! Reverted ${restored} swap${plural}`, true);
        log(`Done! Reverted ${restored} swap${plural}`, 'success');
        return;
    }

    if (lastAction.type === 'artists' || lastAction.type === 'featuring' || lastAction.type === 'remixers') {
        for (const change of lastAction.changes) {
            if (change.titleInput && change.oldTitle !== undefined)
                setReactValue(change.titleInput, change.oldTitle);
        }
        const removeActions = [];
        for (const change of lastAction.changes) {
            const creditItem   = change.creditItem  || change.artistContainer || null;
            const artistInput  = change.artistInput || null;
            const storedRemove = change.removeButton || null;
            let removeEl = null;
            let targetNode = creditItem || artistInput;
            if (creditItem) {
                const li = (creditItem.tagName?.toLowerCase() === 'li')
                    ? creditItem
                    : creditItem.closest?.('li.editable_item') || creditItem.closest?.('li');
                if (li) { removeEl = findRemoveButtonIn(li); targetNode = li; }
            }
            if (!removeEl && storedRemove?.isConnected) removeEl = storedRemove;
            if (!removeEl && artistInput?.isConnected) {
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
            if (act.removeEl?.isConnected) {
                try { dispatchMouseClick(act.removeEl); } catch(e) {}
            }
        }
        const timeout = 1200, pollInterval = 60, start = Date.now();
        let unresolved = removeActions.filter(a => a.targetNode?.isConnected);
        while (unresolved.length > 0 && Date.now() - start < timeout) {
            await new Promise(r => setTimeout(r, pollInterval));
            unresolved = removeActions.filter(a => a.targetNode?.isConnected);
        }
        let removed = 0, failed = 0;
        for (const act of removeActions) {
            if (!act.targetNode?.isConnected) { removed++; continue; }
            const success = await clickRemoveCandidateAndVerify(act.change);
            if (success) removed++;
            else {
                failed++;
                if (act.change.artistInput && act.change.oldArtist !== undefined)
                    setReactValue(act.change.artistInput, act.change.oldArtist || '');
                if (act.change.roleInput) setReactValue(act.change.roleInput, '');
            }
        }
        updateRevertButtons();
        await clearInfoProcessing();
        const involvesCredits = lastAction.changes.some(ch => ch.artistInput || ch.creditItem || ch.roleInput || ch.removeButton);
        let word = lastAction.type === 'artists'   ? (involvesCredits ? 'artist'      : 'artist title')
                 : lastAction.type === 'featuring' ? (involvesCredits ? 'feat artist' : 'feat title')
                 :                                   (involvesCredits ? 'remixer'     : 'remixer title');
        const plural = removed !== 1 ? 's' : '';
        const summary = `Reverted ${removed} ${word}${plural}`;
        if (removed > 0) { setInfoSingleLine(`Done! ${summary}`, true); log(`Done! ${summary}`, 'success'); }
        if (failed > 0)  { log(`${failed} removal(s) failed`, 'warning'); if (removed === 0) setInfoSingleLine(`${failed} removal(s) failed`, false); }
        return;
    }

    if (lastAction.type === 'discogsCreditsImport') {
        const removeBtns = (lastAction.addedCreditRemoveBtns || []).filter(b => b?.isConnected);
        if (removeBtns.length > 0) {
            for (const btn of [...removeBtns].reverse()) {
                try { btn.click(); } catch(e) {}
                await new Promise(r => setTimeout(r, 30));
            }
            const deadline = Date.now() + 2000;
            while (removeBtns.some(b => b.isConnected) && Date.now() < deadline)
                await new Promise(r => setTimeout(r, 50));
        }
        updateRevertButtons();
        await clearInfoProcessing();
        const n = removeBtns.length;
        const logMsg  = `Reverted ${n} credit${n !== 1 ? 's' : ''} from Discogs #${lastAction.releaseId || '?'}`;
        const infoMsg = `Done! Reverted ${n} credit${n !== 1 ? 's' : ''} from Discogs`;
        setInfoSingleLine(infoMsg, true);
        log(`Done! ${logMsg}`, 'success');
        return;
    }

    if (lastAction.type === 'webImport' || lastAction.type === 'tracklistImport' || lastAction.type === 'missingArtistImport' || lastAction.type === 'missingDurationImport') {
        if (lastAction.type === 'webImport') {
            await wiClearAllStyles();
            for (const { el, oldVal, oldChecked, isCb } of (lastAction.fields || [])) {
                if (!el?.isConnected) continue;
                if (isCb) {
                    if (el.checked !== oldChecked) el.click();
                } else if (el.tagName?.toLowerCase() === 'textarea') {
                    wiSetTextareaValue(el, oldVal);
                } else {
                    setReactValue(el, oldVal);
                }
            }

            const removeBtns = [
                ...(lastAction.addedArtistRemoveBtns || []),
                ...(lastAction.addedCreditRemoveBtns || []),
            ].filter(b => b?.isConnected);
            if (removeBtns.length > 0) {
                for (const btn of [...removeBtns].reverse()) {
                    try { btn.click(); } catch(e) {}
                    await new Promise(r => setTimeout(r, 30));
                }
                const deadline = Date.now() + 2000;
                while (removeBtns.some(b => b.isConnected) && Date.now() < deadline) {
                    await new Promise(r => setTimeout(r, 50));
                }
                for (const btn of [...removeBtns].reverse()) {
                    if (btn.isConnected) {
                        try { btn.click(); } catch(e) {}
                        await new Promise(r => setTimeout(r, 50));
                    }
                }
                log(`Removed ${removeBtns.length} extra artist field(s)`, 'success');
            }
        }

        const tla = lastAction.type === 'webImport' ? lastAction.tracklistAction : lastAction;
        if (tla) {
            const historyToRevert = [...(tla.changes || [])].reverse();

            const allArtistFields = [];
            for (const change of historyToRevert) {
                if (change.addedArtistFields?.length > 0) allArtistFields.push(...change.addedArtistFields);
            }
            if (allArtistFields.length > 0) {
                for (const field of allArtistFields) {
                    const creditItem = field.artistContainer || null;
                    let removeEl = null;
                    if (creditItem) {
                        const li = creditItem.tagName?.toLowerCase() === 'li'
                            ? creditItem
                            : creditItem.closest?.('li.editable_item') || creditItem.closest?.('li');
                        if (li?.isConnected) removeEl = findRemoveButtonIn(li);
                    }
                    if (!removeEl && field.removeButton?.isConnected) removeEl = field.removeButton;
                    if (removeEl?.isConnected) {
                        try { dispatchMouseClick(removeEl); } catch(e) {}
                    }
                }
                const timeout = 1400, pollInterval = 60, start = Date.now();
                const targetNodes = allArtistFields.map(f => f.artistContainer).filter(Boolean);
                let unresolved = targetNodes.filter(n => n.isConnected);
                while (unresolved.length > 0 && Date.now() - start < timeout) {
                    await new Promise(r => setTimeout(r, pollInterval));
                    unresolved = targetNodes.filter(n => n.isConnected);
                }
                for (const field of allArtistFields) {
                    if (field.artistContainer?.isConnected) await clickRemoveCandidateAndVerify(field);
                }
            }

            for (const change of historyToRevert) {
                if (change.trackPositionInput?.isConnected) setReactValue(change.trackPositionInput, change.oldTrackPosition || '');
                if (change.titleInput?.isConnected)         setReactValue(change.titleInput,         change.oldTitle        || '');
                if (change.durationInput?.isConnected)      setReactValue(change.durationInput,      change.oldDuration     || '');
            }

            const addedRows = (tla.addedRows || []).filter(r => r.isConnected);
            if (addedRows.length > 0) await removeTracksBatch(addedRows);
        }

        if (lastAction.type === 'webImport') {
            const preReactIds = lastAction.preImageReactIds || new Set();
            const newThumbs = Array.from(document.querySelectorAll('span.thumbnail_link[data-reactid]'))
                .filter(el => !preReactIds.has(el.dataset.reactid));
            if (newThumbs.length > 0) {
                const imagesList = newThumbs[0].parentElement?.parentElement?.parentElement;
                if (imagesList) {
                    const allDeleteControls = Array.from(imagesList.querySelectorAll('a, button, [role="button"]'))
                        .filter(el => {
                            const t = (el.textContent || '').trim().toLowerCase();
                            const c = (el.className  || '').toLowerCase();
                            const h = (el.getAttribute('title') || el.getAttribute('aria-label') || '').toLowerCase();
                            return t === 'delete' || t === 'remove' || t === '×' || t === '✕' || t === 'x'
                                || c.includes('delete') || c.includes('remove')
                                || h.includes('delete') || h.includes('remove');
                        });
                    const totalNow = document.querySelectorAll('span.thumbnail_link[data-reactid]').length;
                    const preCount = totalNow - newThumbs.length;
                    const toDeleteBtns = allDeleteControls.slice(preCount);
                    for (const btn of toDeleteBtns) btn.click();
                }
                await new Promise(r => setTimeout(r, 500));
            }
            const qtyEl = document.querySelector('li[data-path^="/format/"] input[size="2"]');
            if (qtyEl && qtyEl.value !== '1') setReactValue(qtyEl, '1');
        }

        updateRevertButtons();
        await clearInfoProcessing();
        setInfoSingleLine('Done! Reverted import', true);
        log('Done! Reverted import', 'success');
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
    const allAddedArtistRemoveBtns = [];
    const historySnapshot = [...state.actionHistory].filter(a => a.type !== 'webImport');
    state.actionHistory = [];

    for (const action of historySnapshot) {
        if (action.changes) {
            allChanges.push(...action.changes);
        }
    }

    const allDiscogsCreditRemoveBtns = [];
    for (const action of historySnapshot) {
        if (action.type === 'discogsCreditsImport' && action.addedCreditRemoveBtns?.length > 0)
            allDiscogsCreditRemoveBtns.push(...action.addedCreditRemoveBtns.filter(b => b?.isConnected));
    }

    if (allChanges.length === 0 && allAddedArtistRemoveBtns.length === 0 && allDiscogsCreditRemoveBtns.length === 0) {
        updateRevertButtons();
        await clearInfoProcessing();
        setInfoSingleLine('No changes to revert', false);
        return;
    }

    const validRemoveBtns = allAddedArtistRemoveBtns.filter(b => b?.isConnected);
    if (validRemoveBtns.length > 0) {
        for (const btn of [...validRemoveBtns].reverse()) {
            try { btn.click(); } catch(e) {}
            await new Promise(r => setTimeout(r, 30));
        }
        const deadline = Date.now() + 2000;
        while (validRemoveBtns.some(b => b.isConnected) && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 50));
        }
        for (const btn of [...validRemoveBtns].reverse()) {
            if (btn.isConnected) {
                try { btn.click(); } catch(e) {}
                await new Promise(r => setTimeout(r, 50));
            }
        }
        log(`Removed ${validRemoveBtns.length} extra artist field(s)`, 'success');
    }

    const originalTitles         = new Map();
    const originalDurations      = new Map();
    const originalTrackPositions = new Map();
    const originalArtists        = new Map();
    for (const change of allChanges) {
        if (change.titleInput         && change.oldTitle         !== undefined && !originalTitles.has(change.titleInput))
            originalTitles.set(change.titleInput, change.oldTitle);
        if (change.durationInput      && !originalDurations.has(change.durationInput))
            originalDurations.set(change.durationInput, change.oldDuration || '');
        if (change.trackPositionInput && !originalTrackPositions.has(change.trackPositionInput))
            originalTrackPositions.set(change.trackPositionInput, change.oldTrackPosition || '');
        if (change.artistInput        && change.oldArtist        !== undefined && !originalArtists.has(change.artistInput))
            originalArtists.set(change.artistInput, change.oldArtist);
    }
    for (const [el, val] of originalTitles)         if (el.isConnected) setReactValue(el, val);
    for (const [el, val] of originalDurations)      if (el.isConnected) setReactValue(el, val);
    for (const [el, val] of originalTrackPositions) if (el.isConnected) setReactValue(el, val);
    for (const [el, val] of originalArtists)        if (el.isConnected) setReactValue(el, val);

    const allArtistFields = [];
    for (const change of allChanges) {
        if (change.addedArtistFields?.length > 0) allArtistFields.push(...change.addedArtistFields);
    }
    if (allArtistFields.length > 0) {
        for (const field of allArtistFields) {
            const creditItem = field.artistContainer || null;
            let removeEl = null;
            if (creditItem) {
                const li = creditItem.tagName?.toLowerCase() === 'li'
                    ? creditItem
                    : creditItem.closest?.('li.editable_item') || creditItem.closest?.('li');
                if (li?.isConnected) removeEl = findRemoveButtonIn(li);
            }
            if (!removeEl && field.removeButton?.isConnected) removeEl = field.removeButton;
            if (removeEl?.isConnected) {
                try { dispatchMouseClick(removeEl); } catch(e) {}
            }
        }
        const batchTimeout = 2000, batchPoll = 60, batchStart = Date.now();
        const targetNodes = allArtistFields.map(f => f.artistContainer).filter(Boolean);
        let unresolved = targetNodes.filter(n => n.isConnected);
        while (unresolved.length > 0 && Date.now() - batchStart < batchTimeout) {
            await new Promise(r => setTimeout(r, batchPoll));
            unresolved = targetNodes.filter(n => n.isConnected);
        }
        for (const field of allArtistFields) {
            if (field.artistContainer?.isConnected) await clickRemoveCandidateAndVerify(field);
        }
    }

    const removeActions = [];
    for (const change of allChanges) {
        const creditItem   = change.creditItem  || change.artistContainer || null;
        const artistInput  = change.artistInput || null;
        const storedRemove = change.removeButton || null;
        let removeEl = null;
        let targetNode = creditItem || artistInput;
        if (creditItem) {
            const li = creditItem.tagName?.toLowerCase() === 'li'
                ? creditItem
                : creditItem.closest?.('li.editable_item') || creditItem.closest?.('li');
            if (li) { removeEl = findRemoveButtonIn(li); targetNode = li; }
        }
        if (!removeEl && storedRemove?.isConnected) removeEl = storedRemove;
        if (!removeEl && artistInput?.isConnected) {
            const li2 = artistInput.closest('li.editable_item') || artistInput.closest('li') || artistInput.closest('fieldset');
            if (li2) removeEl = findRemoveButtonIn(li2);
            if (!removeEl) removeEl = findRemoveNear(artistInput);
        }
        if (!removeEl && (creditItem || artistInput)) {
            removeEl = (creditItem && findRemoveNear(creditItem)) || (artistInput && findRemoveNear(artistInput));
        }
        if (removeEl || targetNode) removeActions.push({ removeEl, targetNode, change });
    }
    for (const act of removeActions) {
        if (act.removeEl?.isConnected) {
            try { dispatchMouseClick(act.removeEl); } catch(e) {}
        }
    }
    const timeout = 2000, pollInterval = 100, start = Date.now();
    let unresolved = removeActions.filter(a => a.targetNode?.isConnected);
    while (unresolved.length > 0 && Date.now() - start < timeout) {
        await new Promise(r => setTimeout(r, pollInterval));
        unresolved = removeActions.filter(a => a.targetNode?.isConnected);
    }
    let totalRemoved = 0, failedRemovals = 0;
    for (const act of removeActions) {
        if (!act.targetNode?.isConnected) { totalRemoved++; continue; }
        const success = await clickRemoveCandidateAndVerify(act.change);
        if (success) totalRemoved++;
        else {
            failedRemovals++;
            if (act.change.artistInput && act.change.oldArtist !== undefined)
                setReactValue(act.change.artistInput, act.change.oldArtist || '');
            if (act.change.roleInput) setReactValue(act.change.roleInput, '');
        }
    }

    const allAddedRows = [];
    for (const action of historySnapshot) {
        if (action.type === 'tracklistImport' && action.addedRows?.length > 0)
            allAddedRows.push(...action.addedRows.filter(r => r.isConnected));
        if (action.type === 'webImport' && action.tracklistAction?.addedRows)
            allAddedRows.push(...action.tracklistAction.addedRows.filter(r => r.isConnected));
    }
    if (allAddedRows.length > 0) {
        try { await removeTracksBatch(allAddedRows); }
        catch(e) { log('Track removal error during revert all: ' + e.message, 'warning'); }
    }

    if (allDiscogsCreditRemoveBtns.length > 0) {
        for (const btn of [...allDiscogsCreditRemoveBtns].reverse()) {
            try { btn.click(); } catch(e) {}
            await new Promise(r => setTimeout(r, 40));
        }
        await new Promise(r => setTimeout(r, 200));
        log(`Reverted ${allDiscogsCreditRemoveBtns.length} Discogs credit${allDiscogsCreditRemoveBtns.length !== 1 ? 's' : ''}`, 'success');
    }

    const webImportActions = historySnapshot.filter(a => a.type === 'webImport' || a.type === 'discogsCreditsImport');
    if (webImportActions.length > 0) {
        const combinedPreReactIds = new Set();
        for (const action of webImportActions) {
            for (const id of (action.preImageReactIds || [])) combinedPreReactIds.add(id);
        }
        const newThumbs = Array.from(document.querySelectorAll('span.thumbnail_link[data-reactid]'))
            .filter(el => !combinedPreReactIds.has(el.dataset.reactid));
        if (newThumbs.length > 0) {
            const imagesList = newThumbs[0].parentElement?.parentElement?.parentElement;
            if (imagesList) {
                const allDeleteControls = Array.from(imagesList.querySelectorAll('a, button, [role="button"]'))
                    .filter(el => {
                        const t = (el.textContent || '').trim().toLowerCase();
                        const c = (el.className  || '').toLowerCase();
                        const h = (el.getAttribute('title') || el.getAttribute('aria-label') || '').toLowerCase();
                        return t === 'delete' || t === 'remove' || t === '×' || t === '✕' || t === 'x'
                            || c.includes('delete') || c.includes('remove')
                            || h.includes('delete') || h.includes('remove');
                    });
                const totalNow = document.querySelectorAll('span.thumbnail_link[data-reactid]').length;
                const preCount = totalNow - newThumbs.length;
                const toDeleteBtns = allDeleteControls.slice(preCount);
                for (const btn of toDeleteBtns) btn.click();
            }
            await new Promise(r => setTimeout(r, 500));
        }
        const qtyEl = document.querySelector('li[data-path^="/format/"] input[size="2"]');
        if (qtyEl && qtyEl.value !== '1') setReactValue(qtyEl, '1');
    }

    updateRevertButtons();
    await clearInfoProcessing();
    setInfoSingleLine('Done! Reverted all actions', true);
    log('Done! Reverted all actions', 'success');
    if (failedRemovals > 0) log(`${failedRemovals} removal(s) failed during revert all`, 'warning');
}

    function updateRevertButtons() {
        const revertLastBtn = document.getElementById('revert-last');
        const revertAllBtn = document.getElementById('revert-all');
        const count = state.actionHistory.filter(a => a.type !== 'webImport').length;

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
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
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
                label: 'Artist Separators',
                desc: 'Keywords between multiple artists',
                getValue: () => CONFIG.ARTIST_SPLITTER_PATTERNS.join('; '),
            },
            {
                id: 'cfg-credit-sep',
                label: 'Credit Separators',
                desc: 'Keywords between multiple artists in credits',
                getValue: () => CONFIG.CREDIT_SEPARATOR_PATTERNS.join('; '),
            },
            {
                id: 'cfg-featuring',
                label: 'Featuring Separators',
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
            <div class="dh-cfg-header" style="display:flex; align-items:center; justify-content:space-between; padding:5px 8px 7px; border-bottom:1px solid rgba(0,0,0,0.09); flex-shrink:0; gap:6px;">
                <div style="display:flex; align-items:center; gap:6px; min-width:0;">
                    <strong style="font-size:13px; font-weight:600; color:#111; user-select:none; -webkit-user-select:none; cursor:default; white-space:nowrap; letter-spacing:0.01em; flex-shrink:0;"><span style="font-weight:normal; margin-right:4px;">⚙️</span>Config</strong>
                    <span class="dh-cfg-hint" style="font-size:10px; color:#555; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; user-select:none; -webkit-user-select:none; pointer-events:none;">Patterns are semicolon-separated, changes take effect on save.</span>
                </div>
                <button id="dh-config-close" title="Close" style="background:none; border:none; cursor:pointer; font-size:13px; padding:1px 4px; line-height:1; flex-shrink:0; opacity:0.65; color:#555;">✕</button>
            </div>
            <div class="dh-cfg-top-row" style="display:flex; align-items:center; gap:10px; padding:5px 9px 5px; border-bottom:1px solid rgba(0,0,0,0.07); flex-shrink:0; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:5px; font-size:11px; cursor:pointer; user-select:none; white-space:nowrap;"
                    title="Time before the side panel collapses due to inactivity">
                    <span class="dh-cfg-top-label" style="font-weight:600;">Timeout (s):</span>
                    <input type="number" id="cfg-timeout" min="5" max="3600"
                        value="${Math.round(CONFIG.INACTIVITY_TIMEOUT_MS / 1000)}"
                        style="width:54px; font-size:12px; border:1px solid #ccc; border-radius:4px; padding:2px 5px; box-sizing:border-box; color:#222;">
                </label>
                <label style="display:flex; align-items:center; gap:5px; font-size:11px; cursor:pointer; user-select:none; white-space:nowrap;"
                    title="Start the side panel collapsed every time the page loads">
                    <input type="checkbox" id="cfg-start-collapsed" ${state.startCollapsed ? 'checked' : ''}>
                    <span class="dh-cfg-top-label" style="font-weight:600;">Collapsed</span>
                </label>
                <div style="position:relative; display:inline-block;">
                    <button id="cfg-import-toggle" type="button"
                        title="Web import options"
                        style="display:flex; align-items:center; gap:4px; font-size:11px; font-weight:600; cursor:pointer; user-select:none; white-space:nowrap; background:none; border:none; padding:0; color:inherit;">
                        Import &#9660;
                    </button>
                    <div id="cfg-import-dropdown" style="display:none; position:fixed; z-index:9999; background:#fff; border:1px solid #ccc; border-radius:5px; padding:6px 13px 6px 8px; box-shadow:0 3px 10px rgba(0,0,0,0.15); flex-direction:column; gap:4px; width:max-content; max-height:60vh; overflow-y:auto;">
                        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap;" title="Split artists when importing from web stores">
                            <input type="checkbox" id="cfg-split-import" ${state.splitImport ? 'checked' : ''}>
                            <span>Split Artists</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap;" title="Enter credits (roles and names) when importing from web stores">
                            <input type="checkbox" id="cfg-import-credits" ${state.importCredits ? 'checked' : ''}>
                            <span>Credits</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap;" title="Enter genres and styles when importing from web stores">
                            <input type="checkbox" id="cfg-import-styles" ${state.importStyles ? 'checked' : ''}>
                            <span>Styles</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap;" title="Automatically extract remix credits from titles during web import\n(toggle in main panel to include/exclude optional remix patterns)">
                            <input type="checkbox" id="cfg-import-auto-remixers" ${state.importAutoRemixers ? 'checked' : ''}>
                            <span>Remixers</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap;" title="Automatically extract feat credits from track titles during web import\n(toggle in main panel to remove/keep feat text in titles)">
                            <input type="checkbox" id="cfg-import-auto-feat" ${state.importAutoFeat ? 'checked' : ''}>
                            <span>Feat Artists</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap;" title="Enters format description tag (e.g., EP, Single)\nfrom the release title during web import">
                            <input type="checkbox" id="cfg-import-auto-descr" ${state.importAutoDescr ? 'checked' : ''}>
                            <span>Auto Descr.</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap;" title="Enters country during web import if it's available\n(when disabled, always enters Worldwide)">
                            <input type="checkbox" id="cfg-import-country" ${state.importCountry ? 'checked' : ''}>
                            <span>Country</span>
                        </label>
                        <hr style="margin:1px 0; border:none; border-top:1px solid #ddd;">
                        <span style="font-size:10px; font-weight:700; text-transform:uppercase; opacity:0.5; user-select:none; cursor:default;" title="Controls which fields get capitalized during web import">Capitalize</span>
                        <button id="cfg-cap-toggle-all" style="display:block; width:100%; font-size:10px; padding:2px 4px; margin-bottom:0; border:1px solid #ccc; border-radius:3px; cursor:pointer; text-align:center; box-sizing:border-box;">Select All</button>
                        ${(()=>{ const labels={'albumArtists':'Album Artists','albumTitle':'Album Title','label':'Label','joiners':'Joiners','vaArtists':'Track Artists','trackTitles':'Track Titles','creditNames':'Album Credits'}; return Object.keys(labels).map(k=>`<label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap;"><input type="checkbox" class="cfg-cap-field" data-field="${k}" ${state.capitalizeFields[k]?'checked':''}><span>${labels[k]}</span></label>`).join(''); })()}
                    </div>
                </div>
                <div style="position:relative; display:inline-block;">
                    <button id="cfg-capitalize-toggle" type="button"
                        title="Controls which fields are included when using Everything button"
                        style="display:flex; align-items:center; gap:4px; font-size:11px; font-weight:600; cursor:pointer; user-select:none; white-space:nowrap; background:none; border:none; padding:0; color:inherit;">
                        Capitalize &#9660;
                    </button>
                    <div id="cfg-capitalize-dropdown" style="display:none; position:fixed; z-index:9999; background:#fff; border:1px solid #ccc; border-radius:5px; padding:6px 13px 6px 8px; box-shadow:0 3px 10px rgba(0,0,0,0.15); flex-direction:column; gap:4px; width:max-content; max-height:60vh; overflow-y:auto;">
                        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap;" title="Preserve mixed-case words as-is (e.g. DnB, iTunes)">
                            <input type="checkbox" id="cfg-capitalize-mixed" ${state.capitalizeMixedCase ? 'checked' : ''}>
                            <span>Mixed-case</span>
                        </label>
                        <button id="cfg-cap-btn-toggle-all" style="display:block; width:100%; font-size:10px; padding:2px 4px; margin-bottom:4px; border:1px solid #ccc; border-radius:3px; cursor:pointer; text-align:center; box-sizing:border-box;">Select All</button>
                        ${(()=>{ const labels={'albumArtists':'Album Artists','albumTitle':'Album Title','label':'Label/Company','joiners':'Joiners','vaArtists':'Track Artists','trackTitles':'Track Titles','trackCredits':'Track Credits','creditNames':'Album Credits'}; return Object.keys(labels).map(k=>`<label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap;"><input type="checkbox" class="cfg-cap-btn-field" data-field="${k}" ${state.capitalizeBtnFields[k]?'checked':''}><span>${labels[k]}</span></label>`).join(''); })()}
                    </div>
                </div>
            </div>
            <div class="dh-cfg-scroll" style="padding:7px 9px 4px; overflow-y:auto; flex:1;">
                ${fieldsHtml}
            </div>
            <div class="dh-cfg-footer" style="display:flex; align-items:center; gap:6px; padding:7px 10px 8px; flex-shrink:0; border-top:1px solid rgba(0,0,0,0.07);">
                <button id="dh-config-save"    style="flex:2; height:34px; background:#28a745; color:#fff; border:1px solid transparent; border-radius:5px; cursor:pointer; font-size:13px; font-weight:600; box-sizing:border-box;">Save</button>
                <button id="dh-config-reset"   style="flex:1; height:34px; background:#f1f3f5; color:#c00; border:1px solid #e4e6e8; border-radius:5px; cursor:pointer; font-size:13px; box-sizing:border-box;">Reset defaults</button>
                <button id="dh-config-cancel"  style="flex:1; height:34px; background:#f1f3f5; color:#111; border:1px solid #ccc; border-radius:5px; cursor:pointer; font-size:13px; box-sizing:border-box;">Cancel</button>
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
            document.querySelectorAll('.cfg-cap-field').forEach(cb => {
                state.capitalizeFields[cb.dataset.field] = cb.checked;
            });
            try { localStorage.setItem(STORAGE_KEYS.CFG_CAPITALIZE_FIELDS, JSON.stringify(state.capitalizeFields)); } catch(e) {}
            document.querySelectorAll('.cfg-cap-btn-field').forEach(cb => {
                state.capitalizeBtnFields[cb.dataset.field] = cb.checked;
            });
            try { localStorage.setItem(STORAGE_KEYS.CFG_CAPITALIZE_BTN_FIELDS, JSON.stringify(state.capitalizeBtnFields)); } catch(e) {}
            const splitImportEl = document.getElementById('cfg-split-import');
            if (splitImportEl) {
                state.splitImport = splitImportEl.checked;
                try { localStorage.setItem(STORAGE_KEYS.CFG_SPLIT_IMPORT, state.splitImport ? '1' : '0'); } catch(e) {}
            }
            const importCreditsEl = document.getElementById('cfg-import-credits');
            if (importCreditsEl) {
                state.importCredits = importCreditsEl.checked;
                try { localStorage.setItem(STORAGE_KEYS.CFG_IMPORT_CREDITS, state.importCredits ? '1' : '0'); } catch(e) {}
            }
            const importStylesEl = document.getElementById('cfg-import-styles');
            if (importStylesEl) {
                state.importStyles = importStylesEl.checked;
                try { localStorage.setItem(STORAGE_KEYS.CFG_IMPORT_STYLES, state.importStyles ? '1' : '0'); } catch(e) {}
            }
            const importAutoRemixersEl = document.getElementById('cfg-import-auto-remixers');
            if (importAutoRemixersEl) {
                state.importAutoRemixers = importAutoRemixersEl.checked;
                try { localStorage.setItem(STORAGE_KEYS.CFG_IMPORT_AUTO_REMIXERS, state.importAutoRemixers ? '1' : '0'); } catch(e) {}
            }
            const importAutoFeatEl = document.getElementById('cfg-import-auto-feat');
            if (importAutoFeatEl) {
                state.importAutoFeat = importAutoFeatEl.checked;
                try { localStorage.setItem(STORAGE_KEYS.CFG_IMPORT_AUTO_FEAT, state.importAutoFeat ? '1' : '0'); } catch(e) {}
            }
            const importAutoDescrEl = document.getElementById('cfg-import-auto-descr');
            if (importAutoDescrEl) {
                state.importAutoDescr = importAutoDescrEl.checked;
                try { localStorage.setItem(STORAGE_KEYS.CFG_IMPORT_AUTO_DESCR, state.importAutoDescr ? '1' : '0'); } catch(e) {}
            }
            const importCountryEl = document.getElementById('cfg-import-country');
            if (importCountryEl) {
                state.importCountry = importCountryEl.checked;
                try { localStorage.setItem(STORAGE_KEYS.CFG_IMPORT_COUNTRY, state.importCountry ? '1' : '0'); } catch(e) {}
            }
            const capMixedEl = document.getElementById('cfg-capitalize-mixed');
            if (capMixedEl) {
                state.capitalizeMixedCase = capMixedEl.checked;
                try { localStorage.setItem(STORAGE_KEYS.CFG_CAPITALIZE_MIXED, state.capitalizeMixedCase ? '1' : '0'); } catch(e) {}
                const capAllBtn = document.getElementById('capitalize-all');
                if (capAllBtn) capAllBtn.title = 'Capitalize artists, label/company, joiners, titles and credits' + (state.capitalizeMixedCase ? '\n(mixed-case words like DnB, iTunes preserved - toggle in Config)' : '');
            }

            const splitter       = parseField('cfg-splitter');
            const creditSep      = parseField('cfg-credit-sep');
            const featuring      = parseField('cfg-featuring');
            const remix          = parseField('cfg-remix');
            const remixBy        = parseField('cfg-remix-by');
            const remixOpt       = parseField('cfg-remix-opt');
            const keepUpper      = parseField('cfg-keep-upper');
            const keepLower      = parseField('cfg-keep-lower');
            const cleanTitle     = parseField('cfg-clean-title');

            if (splitter.length)    { CONFIG.ARTIST_SPLITTER_PATTERNS = splitter;        saveArrayToStorage(STORAGE_KEYS.CFG_SPLITTER,   splitter); }
            if (creditSep.length)   { CONFIG.CREDIT_SEPARATOR_PATTERNS = creditSep;      saveArrayToStorage(STORAGE_KEYS.CFG_CREDIT_SEP, creditSep); }
            if (featuring.length)   { CONFIG.FEATURING_PATTERNS = featuring;             saveArrayToStorage(STORAGE_KEYS.CFG_FEATURING,  featuring); }
            if (remix.length)       { CONFIG_RAW.REMIX_PATTERNS = remix;                 saveArrayToStorage(STORAGE_KEYS.CFG_REMIX,      remix); }
            if (remixBy.length)     { CONFIG_RAW.REMIX_BY_PATTERNS = remixBy;            saveArrayToStorage(STORAGE_KEYS.CFG_REMIX_BY,   remixBy); }
            if (remixOpt.length)    { CONFIG_RAW.REMIX_PATTERNS_OPTIONAL = remixOpt;     saveArrayToStorage(STORAGE_KEYS.CFG_REMIX_OPT,  remixOpt); }
            if (keepUpper.length)   { CONFIG.CAPITALIZE_KEEP_UPPER = keepUpper;          saveArrayToStorage(STORAGE_KEYS.CFG_KEEP_UPPER, keepUpper); }
            if (keepLower.length)   { CONFIG.CAPITALIZE_KEEP_LOWER = keepLower;          saveArrayToStorage(STORAGE_KEYS.CAPITALIZE_KEEP_LOWER, keepLower); }
            if (cleanTitle.length)  { CONFIG.CLEAN_TITLE_PATTERNS = cleanTitle;          saveArrayToStorage(STORAGE_KEYS.CFG_CLEAN_TITLE, cleanTitle); }

            applyPatternExpansions();
            updateRemixToggleUI();
            updateRemixButtonTitle();
            const featBtn = document.getElementById('extract-featuring');
            if (featBtn) featBtn.title = wrapTitle(`Feat Separators: ${CONFIG.FEATURING_PATTERNS.join(', ')}`);
            const artistsBtn = document.getElementById('extract-artists');
            if (artistsBtn) {
                artistsBtn.title = wrapTitle('Separator patterns: ' + CONFIG.ARTIST_SPLITTER_PATTERNS.join(', ') + '\nIncl. feat separators: ' + CONFIG.FEATURING_PATTERNS.join(', '));
            }
            const cleanBtn = document.getElementById('clean-titles');
            if (cleanBtn) {
                const wrapped = CONFIG.CLEAN_TITLE_PATTERNS.join(', ');
                cleanBtn.title = wrapTitle('Clean titles from redundant bracket contents:\n' + wrapped);
            }
            const _ctStdEl = document.getElementById('clean-titles-std');
            if (_ctStdEl) {
                const wrapped = CONFIG.CLEAN_TITLE_PATTERNS.join(', ');
                _ctStdEl.title = wrapTitle('Clean titles from redundant bracket contents:\n' + wrapped);
            }

            log('Config saved', 'success');
            setInfoSingleLine('Config saved!', true);
        }

        function resetToDefaults() {
            if (!confirm('Reset all patterns to factory defaults?')) return;

            CONFIG_RAW.REMIX_PATTERNS          = [...CONFIG_DEFAULTS.REMIX_PATTERNS];
            CONFIG_RAW.REMIX_BY_PATTERNS       = [...CONFIG_DEFAULTS.REMIX_BY_PATTERNS];
            CONFIG_RAW.REMIX_PATTERNS_OPTIONAL = [...CONFIG_DEFAULTS.REMIX_PATTERNS_OPTIONAL];

            CONFIG.ARTIST_SPLITTER_PATTERNS  = [...CONFIG_DEFAULTS.ARTIST_SPLITTER_PATTERNS];
            CONFIG.CREDIT_SEPARATOR_PATTERNS = [...CONFIG_DEFAULTS.CREDIT_SEPARATOR_PATTERNS];
            CONFIG.FEATURING_PATTERNS        = [...CONFIG_DEFAULTS.FEATURING_PATTERNS];
            CONFIG.CAPITALIZE_KEEP_UPPER    = [...CONFIG_DEFAULTS.CAPITALIZE_KEEP_UPPER];
            CONFIG.CAPITALIZE_KEEP_LOWER    = [...CONFIG_DEFAULTS.CAPITALIZE_KEEP_LOWER];
            CONFIG.CLEAN_TITLE_PATTERNS     = [...CONFIG_DEFAULTS.CLEAN_TITLE_PATTERNS];
            CONFIG.INACTIVITY_TIMEOUT_MS    = CONFIG_DEFAULTS.INACTIVITY_TIMEOUT_MS;
            state.startCollapsed            = false;
            state.capitalizeFields          = { albumArtists: true, albumTitle: true, label: true, vaArtists: true, trackTitles: true, joiners: true, creditNames: true, trackCredits: true };
            state.capitalizeBtnFields       = { albumArtists: true, albumTitle: true, label: true, vaArtists: true, trackTitles: true, joiners: true, creditNames: true, trackCredits: true };
            state.splitImport               = true;
            state.importCredits             = true;
            state.importStyles              = true;
            state.importAutoRemixers        = true;
            state.importAutoFeat            = true;
            state.importAutoDescr           = true;
            state.importCountry             = true;
            state.capitalizeMixedCase       = true;

            applyPatternExpansions();

            const keys = [
                STORAGE_KEYS.CFG_FEATURING, STORAGE_KEYS.CFG_REMIX, STORAGE_KEYS.CFG_REMIX_BY,
                STORAGE_KEYS.CFG_REMIX_OPT, STORAGE_KEYS.CFG_SPLITTER, STORAGE_KEYS.CFG_CREDIT_SEP, STORAGE_KEYS.CFG_KEEP_UPPER,
                STORAGE_KEYS.CFG_KEEP_LOWER, STORAGE_KEYS.CFG_CLEAN_TITLE,
                STORAGE_KEYS.CFG_TIMEOUT, STORAGE_KEYS.CFG_START_COLLAPSED, STORAGE_KEYS.CFG_CAPITALIZE_FIELDS, STORAGE_KEYS.CFG_CAPITALIZE_BTN_FIELDS, STORAGE_KEYS.CFG_SPLIT_IMPORT, STORAGE_KEYS.CFG_IMPORT_CREDITS, STORAGE_KEYS.CFG_IMPORT_STYLES, STORAGE_KEYS.CFG_IMPORT_AUTO_REMIXERS, STORAGE_KEYS.CFG_IMPORT_AUTO_FEAT, STORAGE_KEYS.CFG_CAPITALIZE_MIXED, STORAGE_KEYS.CFG_IMPORT_AUTO_DESCR, STORAGE_KEYS.CFG_IMPORT_COUNTRY
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
            document.querySelectorAll('.cfg-cap-field').forEach(cb => { cb.checked = true; });
            document.querySelectorAll('.cfg-cap-btn-field').forEach(cb => { cb.checked = true; });
            const capMixedEl = document.getElementById('cfg-capitalize-mixed');
            if (capMixedEl) capMixedEl.checked = true;
            const splitImpEl = document.getElementById('cfg-split-import');
            if (splitImpEl) splitImpEl.checked = true;
            const credImpEl = document.getElementById('cfg-import-credits');
            if (credImpEl) credImpEl.checked = true;
            const stylesImpEl = document.getElementById('cfg-import-styles');
            if (stylesImpEl) stylesImpEl.checked = true;
            const autoDescrEl = document.getElementById('cfg-import-auto-descr');
            if (autoDescrEl) autoDescrEl.checked = true;
            const importCountryEl = document.getElementById('cfg-import-country');
            if (importCountryEl) importCountryEl.checked = true;

            updateRemixToggleUI();
            updateRemixButtonTitle();
            log('Config reset to defaults', 'success');
            setInfoSingleLine('Defaults restored!', true);
        }

        document.getElementById('dh-config-close').onclick  = () => { overlay.style.display = 'none'; };
        document.getElementById('dh-config-cancel').onclick = () => { overlay.style.display = 'none'; };
        document.getElementById('dh-config-save').onclick   = () => { saveConfig(); overlay.style.display = 'none'; };
        document.getElementById('dh-config-reset').onclick  = resetToDefaults;

        const _capBtnToggleAll = document.getElementById('cfg-cap-btn-toggle-all');
        if (_capBtnToggleAll) {
            _capBtnToggleAll.addEventListener('click', (e) => {
                e.stopPropagation();
                const boxes = document.querySelectorAll('.cfg-cap-btn-field');
                const allChecked = Array.from(boxes).every(cb => cb.checked);
                boxes.forEach(cb => { cb.checked = !allChecked; });
                _capBtnToggleAll.textContent = allChecked ? 'Select All' : 'Deselect All';
            });
        }
        const _capToggle   = document.getElementById('cfg-capitalize-toggle');
        const _capDropdown = document.getElementById('cfg-capitalize-dropdown');
        if (_capToggle && _capDropdown) {
            _capToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = _capDropdown.style.display !== 'none';
                if (!open) {
                    const r = _capToggle.getBoundingClientRect();
                    _capDropdown.style.top   = r.bottom + 'px';
                    _capDropdown.style.left  = '';
                    _capDropdown.style.right = (window.innerWidth - r.right) + 'px';
                }
                _capDropdown.style.display = open ? 'none' : 'flex';
                _capToggle.textContent = open ? 'Capitalize \u25BC' : 'Capitalize \u25B2';
                if (!open && _impDropdown) { _impDropdown.style.display = 'none'; _impToggle.textContent = 'Import \u25BC'; }
                const isDark = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark';
                _capDropdown.style.background  = isDark ? '#1f2224' : '#fff';
                _capDropdown.style.borderColor = isDark ? '#444' : '#ccc';
                _capDropdown.style.color       = isDark ? '#ddd' : '#111';
                if (_capBtnToggleAll) {
                    _capBtnToggleAll.style.background  = isDark ? '#2a2d30' : '#f1f3f5';
                    _capBtnToggleAll.style.color       = isDark ? '#ddd' : '#111';
                    _capBtnToggleAll.style.borderColor = isDark ? '#444' : '#ccc';
                }
            });
            document.addEventListener('click', () => {
                _capDropdown.style.display = 'none';
                _capToggle.textContent = 'Capitalize \u25BC';
            });
            _capDropdown.addEventListener('click', e => e.stopPropagation());
        }
        const _capToggleAll = document.getElementById('cfg-cap-toggle-all');
        if (_capToggleAll) {
            _capToggleAll.addEventListener('click', (e) => {
                e.stopPropagation();
                const boxes = document.querySelectorAll('.cfg-cap-field');
                const allChecked = Array.from(boxes).every(cb => cb.checked);
                boxes.forEach(cb => { cb.checked = !allChecked; });
                _capToggleAll.textContent = allChecked ? 'Select All' : 'Deselect All';
            });
        }

        const _impToggle   = document.getElementById('cfg-import-toggle');
        const _impDropdown = document.getElementById('cfg-import-dropdown');
        if (_impToggle && _impDropdown) {
            _impToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = _impDropdown.style.display !== 'none';
                if (!open) {
                    const r = _impToggle.getBoundingClientRect();
                    _impDropdown.style.top   = r.bottom + 'px';
                    _impDropdown.style.left  = '';
                    _impDropdown.style.right = (window.innerWidth - r.right) + 'px';
                }
                _impDropdown.style.display = open ? 'none' : 'flex';
                _impToggle.textContent = open ? 'Import \u25BC' : 'Import \u25B2';
                if (!open && _capDropdown) { _capDropdown.style.display = 'none'; _capToggle.textContent = 'Capitalize \u25BC'; }
                const isDark = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark';
                _impDropdown.style.background  = isDark ? '#1f2224' : '#fff';
                _impDropdown.style.borderColor = isDark ? '#444' : '#ccc';
                _impDropdown.style.color       = isDark ? '#ddd' : '#111';
                if (_capToggleAll) {
                    _capToggleAll.style.background  = isDark ? '#2a2d30' : '#f1f3f5';
                    _capToggleAll.style.color       = isDark ? '#ddd' : '#111';
                    _capToggleAll.style.borderColor = isDark ? '#444' : '#ccc';
                }
                const hr = _impDropdown.querySelector('hr');
                if (hr) hr.style.borderTopColor = isDark ? '#444' : '#ddd';
            });
            document.addEventListener('click', () => {
                _impDropdown.style.display = 'none';
                _impToggle.textContent = 'Import \u25BC';
            });
            _impDropdown.addEventListener('click', e => e.stopPropagation());
        }

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
            overlay.querySelectorAll('#dh-missing-artist-toggle, #dh-missing-duration-toggle').forEach(btn => {
                const isActive = (btn.id === 'dh-missing-artist-toggle' && state.importerMissingArtistMode)
                              || (btn.id === 'dh-missing-duration-toggle' && state.importerMissingDurationMode);
                if (!isActive) { btn.style.borderColor = '#555'; btn.style.color = '#bbb'; }
            });
        } else {
            overlay.style.background  = '#fff';
            overlay.style.color       = '#111';
            overlay.style.borderColor = '#ccc';
            const ta = overlay.querySelector('#dh-importer-textarea');
            if (ta) { ta.style.background = '#fff'; ta.style.color = '#222'; ta.style.border = '1px solid #ccc'; }
            const closeBtn = overlay.querySelector('#dh-importer-close');
            if (closeBtn) closeBtn.style.color = '#555';
            const strong = overlay.querySelector('strong');
            if (strong) strong.style.color = '#111';
            const hint = overlay.querySelector('span[style*="font-size:10px"]');
            if (hint) hint.style.color = '#555';
            const hdr = overlay.querySelector('div[style*="border-bottom"]');
            if (hdr) hdr.style.borderBottomColor = 'rgba(0,0,0,0.09)';
            const cancelBtn = overlay.querySelector('#dh-importer-cancel');
            if (cancelBtn) { cancelBtn.style.background = '#f1f3f5'; cancelBtn.style.color = '#111'; cancelBtn.style.borderColor = '#ccc'; }
            overlay.querySelectorAll('#dh-missing-artist-toggle, #dh-missing-duration-toggle').forEach(btn => {
                const isActive = (btn.id === 'dh-missing-artist-toggle' && state.importerMissingArtistMode)
                              || (btn.id === 'dh-missing-duration-toggle' && state.importerMissingDurationMode);
                if (!isActive) { btn.style.borderColor = '#ccc'; btn.style.color = ''; }
            });
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
                inp.style.outline     = '';
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
            if (closeBtn) closeBtn.style.color = '#555';
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
        const miniButtons = panel.querySelectorAll('#extract-remixers-optional-only, #remove-main-from-title, #remove-feat-from-title, #swap-artist-title');
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
            _applyThemeToWebImporter(document.getElementById('dh-web-importer-overlay'), true);
        } else {
            panel.style.background = '#fff';
            panel.style.color = '#111';
            if (panelContent) panelContent.style.background = '#fff';
            styleButtons.forEach(btn => { btn.style.background = '#f1f3f5'; btn.style.color = '#111'; btn.style.border = '1px solid #e4e6e8'; });
            if (infoDiv) { infoDiv.style.background = '#f8f9fa'; infoDiv.style.color = CONFIG.INFO_TEXT_COLOR; }
            if (logContainer) { logContainer.style.background = '#f8f9fa'; logContainer.style.color = '#6b6b6b'; }
            if (themeBtn)   { themeBtn.textContent = '☾'; themeBtn.style.color = '#111'; }
            if (collapseBtn) collapseBtn.style.color = '#111';
            if (closeBtn)    closeBtn.style.color = '#555';
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
            _applyThemeToWebImporter(document.getElementById('dh-web-importer-overlay'), false);
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
            #capitalize-all-wrap {
                flex: 1 1 0 !important;
                min-width: 0 !important;
                background: transparent !important;
            }
            #capitalize-all-wrap #capitalize-all {
                width: 100% !important;
            }
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
            #extract-remixers-optional-only, #remove-main-from-title, #remove-feat-from-title, #swap-artist-title,
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
            #swap-artist-title { font-size: 20px !important; }
            #extract-remixers-optional-only:hover, #remove-main-from-title:hover,
            #remove-feat-from-title:hover, #swap-artist-title:hover, #toggle-feat-remove:hover,
            #toggle-remix-optional:hover, #toggle-main-remove:hover { transform: scale(1.12); }
            #extract-remixers-optional-only:active, #remove-main-from-title:active,
            #remove-feat-from-title:active, #swap-artist-title:active, #toggle-feat-remove:active,
            #toggle-remix-optional:active, #toggle-main-remove:active { transform: scale(0.9); }
            #toggle-feat-remove:focus, #toggle-remix-optional:focus, #toggle-main-remove:focus {
                outline: 2px solid rgba(30,102,214,0.3);
            }
            #dh-config-overlay input[type="text"]:focus,
            #dh-wi-url:focus,
            #dh-ct-custom-input:focus,
            #dh-importer-textarea:focus {
                outline: none !important;
                box-shadow:
                    0 0 0 1px rgba(30,102,214,0.50),
                    0 0 0 2px rgba(30,102,214,0.24),
                    0 0 0 3px rgba(30,102,214,0.16),
                    0 0 0 4px rgba(30,102,214,0.09),
                    0 0 0 5px rgba(30,102,214,0.05),
                    0 0 0 6px rgba(30,102,214,0.03) !important;
            }
            #dh-config-overlay input[type="text"], #dh-wi-url, #dh-ct-custom-input, #dh-importer-textarea {
                box-shadow: none !important;
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

    function wiWaitForCount(getCount, target, timeout = 10000) {
        return new Promise(resolve => {
            if (getCount() >= target) { resolve(); return; }
            const deadline = setTimeout(() => { obs.disconnect(); resolve(); }, timeout);
            const obs = new MutationObserver(() => {
                if (getCount() >= target) { clearTimeout(deadline); obs.disconnect(); resolve(); }
            });
            obs.observe(document.body, { childList: true, subtree: true });
        });
    }

    function wiWaitForElement(selector, timeout = 8000) {
        return new Promise(resolve => {
            const existing = document.querySelector(selector);
            if (existing) { resolve(existing); return; }
            const deadline = setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
            const obs = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) { clearTimeout(deadline); obs.disconnect(); resolve(el); }
            });
            obs.observe(document.body, { childList: true, subtree: true });
        });
    }

    async function addTracksBatch(count) {
        if (count <= 0) return true;
        const addSelect = document.querySelector('tfoot select');
        const addButton = addSelect && addSelect.nextElementSibling;
        if (!addSelect || !addButton) { log('Could not find Add Tracks controls', 'error'); return false; }

        const hideStyle = document.createElement('style');
        hideStyle.textContent = [
            'tfoot select { visibility: hidden !important; }',
            'tfoot select + button { visibility: hidden !important; }',
        ].join(' ');
        document.head.appendChild(hideStyle);

        let remaining = count;
        while (remaining > 0) {
            const batch = Math.min(remaining, 20);
            const before = getTrackInputRows().length;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
            nativeSetter.call(addSelect, String(batch));
            addSelect.dispatchEvent(new Event('change', { bubbles: true }));
            addButton.click();
            remaining -= batch;
            await wiWaitForCount(() => getTrackInputRows().length, before + batch);
        }

        hideStyle.remove();
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
                const link = menu.querySelector('a[role="menuitem"]');
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

    async function applyMissingArtists(text) {
        const rawLines = text.split('\n');
        const nonBlank = rawLines.map(l => l.trim()).filter(Boolean);
        if (!nonBlank.length) { log('No artist data entered', 'warning'); return; }
        const trackRows = getTrackInputRows();
        if (!trackRows.length) { log('No track rows found', 'warning'); return; }
        await setInfoProcessing();

        const durationRe = /[\[(]?\b(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\b[\])]?\s*$/;
        const multiCdRe  = /^[\[(]?0*(\d+)-0*(\d+)[\]).]?[.\-\s]+/;
        const posRe      = /^[\[(]?([A-Za-z]{0,2}\d+[A-Za-z]?)[\]).]?[.\-\s]+/;
        const titleSepRe = /^(.+?)\s+[-\u2013\u2014]\s+(.+)$/;

        function extractPosAndArtist(line) {
            let remaining = line.trim();
            if (!remaining) return null;
            let position = '';
            const multiMatch = remaining.match(multiCdRe);
            if (multiMatch) {
                position = trimLeadingZeros(multiMatch[1] + '-' + multiMatch[2]);
                remaining = remaining.slice(multiMatch[0].length).trim();
            } else {
                const posMatch = remaining.match(posRe);
                if (posMatch) { position = trimLeadingZeros(posMatch[1]); remaining = remaining.slice(posMatch[0].length).trim(); }
            }
            if (!remaining) return null;
            const durMatch = remaining.match(durationRe);
            if (durMatch) remaining = remaining.slice(0, remaining.length - durMatch[0].length).replace(/[-\u2013\u2014\s]+$/, '').trim();
            if (!remaining) return null;
            const titleSep = remaining.match(titleSepRe);
            const artist = titleSep ? titleSep[1].trim() : remaining.trim();
            if (!artist) return null;
            return { position: position.toLowerCase(), artist };
        }

        const parsedNonBlank = nonBlank.map(extractPosAndArtist).filter(Boolean);
        const anyHavePos     = parsedNonBlank.some(e => e.position);
        const isSingleArtist = nonBlank.length === 1 && !anyHavePos;
        const isLineByLine   = !isSingleArtist && !anyHavePos;
        const assignments    = anyHavePos ? parsedNonBlank.filter(e => e.position) : [];

        let filled = 0;
        const changes = [];
        const matchedPositions = new Set();
        if (!isSingleArtist && !isLineByLine) {
            const filledPositions = trackRows.filter(r => r.querySelector('input.track-number-input')?.value?.trim()).length;
            if (filledPositions === 0) {
                await clearInfoProcessing();
                log('No track positions found — fill in positions first, or enter a single artist name to fill all tracks', 'warning');
                setInfoSingleLine('No track positions found', false);
                return;
            }
        }
        const getExistingArtists = (row) => {
            const artistTd = row.querySelector('td.subform_track_artists');
            if (!artistTd) return [];
            const names = [];
            for (const item of artistTd.querySelectorAll('li.editable_item')) {
                const input = item.querySelector('input[data-type="artist-name"], input.credit-artist-name-input');
                if (input?.value?.trim()) { names.push(input.value.trim().toLowerCase()); continue; }
                const link = item.querySelector('a.rollover_link, span.rollover_link');
                if (link?.textContent?.trim()) names.push(link.textContent.trim().toLowerCase());
            }
            return names;
        };
        const applyArtistParts = async (row, rawArtist) => {
            const entries = wiSplitArtistForImport(rawArtist);
            const parts = entries.length > 0 ? entries : [{ name: rawArtist }];
            const created = await createArtistInputs(row, parts.length);
            const addedFields = [];
            for (let ai = 0; ai < parts.length; ai++) {
                if (!created[ai]?.artistInput) continue;
                setReactValue(created[ai].artistInput, parts[ai].name);
                if (ai > 0 && parts[ai].joinBefore) {
                    const joinInputs = Array.from(row.querySelectorAll('input[size="10"]'));
                    const joinInput = joinInputs[ai - 1] || getJoinInputForArtistRow(row, created[ai].artistInput, created[ai].artistContainer, ai - 1);
                    if (joinInput) setReactValue(joinInput, parts[ai].joinBefore);
                }
                addedFields.push({ artistContainer: created[ai].artistContainer, removeButton: created[ai].removeButton });
            }
            return addedFields;
        };
        if (isLineByLine) {
            for (let i = 0; i < rawLines.length; i++) {
                const artist = rawLines[i].trim();
                if (!artist) continue;
                const row = trackRows[i];
                if (!row) continue;
                const existing = getExistingArtists(row);
                if (existing.includes(artist.toLowerCase())) continue;
                const addedFields = await applyArtistParts(row, artist);
                if (addedFields.length) {
                    filled++;
                    const pos = row.querySelector('input.track-number-input')?.value?.trim();
                    matchedPositions.add(pos || `row ${i + 1}`);
                    changes.push({ addedArtistFields: addedFields });
                }
            }
        } else {
            for (const row of trackRows) {
                const posInput = row.querySelector('input.track-number-input');
                const artistTd = row.querySelector('td.subform_track_artists');
                const pos = posInput?.value?.trim().toLowerCase();
                let artist = null;
                if (isSingleArtist) {
                    if (artistTd?.querySelectorAll('li.editable_item').length > 0) continue;
                    artist = parsedNonBlank[0]?.artist || nonBlank[0];
                } else if (pos) {
                    const match = assignments.find(a => a.position === pos);
                    if (match) artist = match.artist;
                }
                if (!artist) continue;
                const existing = getExistingArtists(row);
                if (!isSingleArtist && existing.includes(artist.toLowerCase())) continue;
                const addedFields = await applyArtistParts(row, artist);
                if (addedFields.length) {
                    filled++;
                    changes.push({ addedArtistFields: addedFields });
                    if (pos) matchedPositions.add(pos);
                }
            }
        }
        if (changes.length > 0) addActionToHistory({ type: 'missingArtistImport', changes });
        await clearInfoProcessing();
        const s = filled !== 1 ? 's' : '';
        const posList = [...matchedPositions].join(', ');
        if (isLineByLine) {
            if (filled > 0) log(`Done! Filled ${filled} track artist${s}: ${posList}`, 'success');
            else log('No artists filled — check that line count matches track count', 'warning');
            setInfoSingleLine(filled > 0 ? `Done! Filled ${filled} track artist${s}` : 'No artists filled', filled > 0);
        } else if (!isSingleArtist) {
            const unmatched = assignments.filter(a => !matchedPositions.has(a.position));
            if (filled > 0) log(`Done! Filled ${filled} track artist${s}: ${posList}`, 'success');
            if (unmatched.length > 0) {
                const unmatchedList = unmatched.map(a => a.position).join(', ');
                log(`Could not fill ${unmatched.length} track${unmatched.length !== 1 ? 's' : ''} (no position set): ${unmatchedList}`, 'warning');
            }
            if (filled === 0) setInfoSingleLine('No matching positions found', false);
            else setInfoSingleLine(`Done! Filled ${filled} track artist${s}`, true);
        } else {
            if (filled > 0) log(`Done! Filled ${filled} track artist${s}: ${posList}`, 'success');
            else log('No artists filled', 'warning');
            setInfoSingleLine(filled > 0 ? `Done! Filled ${filled} track artist${s}` : 'No artists filled', filled > 0);
        }
    }

    async function applyMissingDurations(text) {
        const DUR_SEL = 'td.subform_track_duration input, input[aria-label*="duration" i]';
        const rawLines = text.split('\n');
        const nonBlank = rawLines.map(l => l.trim()).filter(Boolean);
        if (!nonBlank.length) { log('No duration data entered', 'warning'); return; }
        const trackRows = getTrackInputRows();
        if (!trackRows.length) { log('No track rows found', 'warning'); return; }
        await setInfoProcessing();

        const durationRe = /[\[(]?\b(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\b[\])]?\s*$/;
        const multiCdRe  = /^[\[(]?0*(\d+)-0*(\d+)[\]).]?[.\-\s]+/;
        const posRe      = /^[\[(]?([A-Za-z]{0,2}\d+[A-Za-z]?)[\]).]?[.\-\s]+/;
        function extractPosAndDur(line) {
            let remaining = line.trim();
            if (!remaining) return null;
            let position = '';
            const multiMatch = remaining.match(multiCdRe);
            if (multiMatch) {
                position = trimLeadingZeros(multiMatch[1] + '-' + multiMatch[2]);
                remaining = remaining.slice(multiMatch[0].length).trim();
            } else {
                const posMatch = remaining.match(posRe);
                if (posMatch) { position = trimLeadingZeros(posMatch[1]); remaining = remaining.slice(posMatch[0].length).trim(); }
            }
            const durMatch = remaining.match(durationRe);
            if (durMatch) return { position: position.toLowerCase(), duration: trimLeadingZeros(durMatch[1]) };
            return null;
        }

        const parsedNonBlank = nonBlank.map(extractPosAndDur).filter(Boolean);
        const anyHavePos   = parsedNonBlank.some(e => e.position);
        const isLineByLine = !anyHavePos;
        const assignments  = anyHavePos ? parsedNonBlank.filter(e => e.position) : [];

        if (!isLineByLine) {
            const filledPositions = trackRows.filter(r => r.querySelector('input.track-number-input')?.value?.trim()).length;
            if (filledPositions === 0) {
                await clearInfoProcessing();
                log('No track positions found — fill in positions first', 'warning');
                setInfoSingleLine('No track positions found', false);
                return;
            }
        }
        let filled = 0;
        const changes = [];
        const matchedPositions = new Set();
        if (isLineByLine) {
            for (let i = 0; i < rawLines.length; i++) {
                const parsed = extractPosAndDur(rawLines[i]);
                if (!parsed) continue;
                const row = trackRows[i];
                if (!row) continue;
                const durInput = row.querySelector(DUR_SEL);
                if (!durInput) continue;
                const oldDuration = durInput.value || '';
                setReactValue(durInput, parsed.duration);
                filled++;
                const pos = row.querySelector('input.track-number-input')?.value?.trim();
                matchedPositions.add(pos || `row ${i + 1}`);
                changes.push({ durationInput: durInput, oldDuration });
            }
        } else {
            for (const row of trackRows) {
                const posInput = row.querySelector('input.track-number-input');
                const pos = posInput?.value?.trim().toLowerCase();
                if (!pos) continue;
                const match = assignments.find(a => a.position === pos);
                if (!match) continue;
                const durInput = row.querySelector(DUR_SEL);
                if (!durInput) continue;
                const oldDuration = durInput.value || '';
                setReactValue(durInput, match.duration);
                filled++;
                matchedPositions.add(pos);
                changes.push({ durationInput: durInput, oldDuration });
            }
        }
        if (changes.length > 0) addActionToHistory({ type: 'missingDurationImport', changes });
        await clearInfoProcessing();
        const s = filled !== 1 ? 's' : '';
        if (!isLineByLine) {
            const unmatched = assignments.filter(a => !matchedPositions.has(a.position));
            if (filled > 0) log(`Done! Filled ${filled} duration${s}: ${[...matchedPositions].join(', ')}`, 'success');
            if (unmatched.length > 0) log(`Could not fill ${unmatched.length} track${unmatched.length !== 1 ? 's' : ''} (no position set): ${unmatched.map(a => a.position).join(', ')}`, 'warning');
            setInfoSingleLine(filled > 0 ? `Done! Filled ${filled} duration${s}` : 'No matching positions found', filled > 0);
        } else {
            if (filled > 0) log(`Done! Filled ${filled} duration${s}: ${[...matchedPositions].join(', ')}`, 'success');
            else log('No durations filled — check that line count matches track count', 'warning');
            setInfoSingleLine(filled > 0 ? `Done! Filled ${filled} duration${s}` : 'No durations filled', filled > 0);
        }
    }

    async function applyTracklist(parsed, isVA = false, silent = false) {
        if (!parsed.length) { log('No tracks parsed from text', 'warning'); return; }
        await setInfoProcessing();
        const changes = [];

        let trackRows = getTrackInputRows();
        const existingCount = trackRows.length;

        let prefixBlanks = 0;
        const firstPos = parsed[0]?.position;
        if (firstPos) {
            const firstNum = parseInt(firstPos.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(firstNum) && firstNum > 1) prefixBlanks = firstNum - 1;
        }

        const totalNeeded = prefixBlanks + parsed.length;
        if (totalNeeded > existingCount) {
            const ok = await addTracksBatch(totalNeeded - existingCount);
            if (!ok) { await clearInfoProcessing(); return; }
        }

        await new Promise(resolve => setTimeout(resolve, CONFIG.PROCESSING_DELAY_MS));
        trackRows = getTrackInputRows();

        for (let i = 0; i < parsed.length; i++) {
            const entry = parsed[i];
            const row = trackRows[prefixBlanks + i];
            if (!row) continue;

            const posInput = row.querySelector('input.track-number-input');
            const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
            const durInput = row.querySelector('td.subform_track_duration input, input[aria-label*="duration" i]');

            const trackChange = {
                trackPositionInput: posInput, oldTrackPosition: posInput?.value || '',
                titleInput: titleInput, oldTitle: titleInput?.value || '',
                durationInput: durInput, oldDuration: durInput?.value || '',
                addedArtistFields: []
            };

            if (entry.position && posInput) setReactValue(posInput, trimLeadingZeros(entry.position));
            if (entry.title && titleInput) setReactValue(titleInput, entry.title);
            if (entry.duration && durInput) setReactValue(durInput, trimLeadingZeros(entry.duration));

            const artistTd = row.querySelector('td.subform_track_artists');
            if (artistTd) {
                const existingArtistItems = Array.from(artistTd.querySelectorAll('li.editable_item'));
                const removeBtns = existingArtistItems.map(item => findRemoveButtonIn(item)).filter(b => b?.isConnected);
                for (const btn of removeBtns) btn.click();
                if (removeBtns.length > 0) await new Promise(r => requestAnimationFrame(r));
            }

            const artistEntries = entry.artistsWithJoins || (entry.artists || []).map(n => ({ name: n }));
            const expandedEntries = artistEntries.flatMap(e2 => {
                if (e2.joinBefore || !state.splitImport) return [e2];
                const split = wiSplitArtistForImport(e2.name);
                return split.length > 1 ? split : [e2];
            });
            if (isVA && expandedEntries.length > 0) {
                const created = await createArtistInputs(row, expandedEntries.length);
                expandedEntries.forEach((e2, idx) => {
                    if (!created[idx]) return;
                    setReactValue(created[idx].artistInput, e2.name);
                    if (idx > 0 && e2.joinBefore) {
                        const joinInputs = Array.from(row.querySelectorAll('input[size="10"]'));
                        const joinInput = joinInputs[idx - 1] || getJoinInputForArtistRow(row, created[idx].artistInput, created[idx].artistContainer, idx - 1);
                        if (joinInput) setReactValue(joinInput, e2.joinBefore);
                    }
                    trackChange.addedArtistFields.push({
                        artistContainer: created[idx].artistContainer,
                        removeButton: created[idx].removeButton
                    });
                });
            }
            changes.push(trackChange);
        }

        const addedRows = totalNeeded > existingCount ? Array.from(getTrackInputRows()).slice(existingCount) : [];

        if (totalNeeded < existingCount) {
            const allRows = getTrackInputRows();
            for (let i = totalNeeded; i < existingCount; i++) {
                const row = allRows[i];
                if (!row) continue;
                const posInput   = row.querySelector('input.track-number-input');
                const titleInput = row.querySelector('input[data-type="track-title"], input[id*="track-title"]');
                const durInput   = row.querySelector('td.subform_track_duration input, input[aria-label*="duration" i]');
                if (posInput?.value)   setReactValue(posInput,   '');
                if (titleInput?.value) setReactValue(titleInput, '');
                if (durInput?.value)   setReactValue(durInput,   '');
            }
        }

        addActionToHistory({ type: 'tracklistImport', changes, addedRows });
        await clearInfoProcessing();
        const plural = parsed.length !== 1 ? 's' : '';
        setInfoSingleLine(`Done! Applied ${parsed.length} track${plural}`, true);
        if (!silent) log(`Done! Applied ${parsed.length} track${plural}`, 'success');
    }

    const STORE_DOMAINS = {
        'qobuz.com':            'Qobuz',
        'highresaudio.com':     'HighResAudio',
        'bandcamp.com':         'Bandcamp',
        'prestomusic.com':      'Presto Music',
        'nativedsd.com':        'NativeDSD',
        'junodownload.com':     'Juno Download',
        'hdtracks.com':         'HDtracks',
        'prostudiomasters.com': 'ProStudioMasters',
        '7digital.com':         '7digital',
        'beatport.com':         'Beatport',
        'traxsource.com':       'Traxsource',
        'volumo.com':           'Volumo',
        'music.apple.com':      'Apple Music',
        'ototoy.jp':            'OTOTOY',
        'mora.jp':              'Mora',
        'bleep.com':            'Bleep',
        'boomkat.com':          'Boomkat',
        'kompakt.fm':           'Kompakt',
        'eclassical.com':       'eClassical',
    };

    function detectStoreName(url) {
        try {
            const host = new URL(url).hostname.replace(/^www\./, '');
            for (const [domain, name] of Object.entries(STORE_DOMAINS)) {
                if (host === domain || host.endsWith('.' + domain)) return name;
            }
        } catch(e) {}
        return '';
    }

    function wiFormatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '';
        const s = Math.round(Number(seconds));
        if (s <= 0) return '';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = String(s % 60).padStart(2, '0');
        return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${ss}` : `${m}:${ss}`;
    }

    function wiGetMeta(doc, ...props) {
        for (const prop of props) {
            const el = doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
            if (el?.content?.trim()) return el.content.trim();
        }
        return '';
    }

    function wiParseHTML(html) {
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function wiAntiBotError(url) {
        const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch(e) { return url; } })();
        return `Anti-bot verification required for ${domain}.\n<a href="${url}" target="_blank" style="color:#00e6ff;font-weight:bold;">Open the page in your browser</a>, complete the check, return and "Fetch" again.`;
    }

    function wiIsAntiBotPage(html) {
        const lower = html.toLowerCase();
        return lower.includes('is verifying your browser') ||
               lower.includes('fastly is verifying') ||
               lower.includes('cf-challenge') ||
               lower.includes('cf-browser-verification') ||
               lower.includes('are you human') ||
               lower.includes('enable javascript') ||
               lower.includes('just a moment') ||
               lower.includes('security check') ||
               lower.includes('attention required') ||
               lower.includes('access denied') ||
               lower.includes('client challenge') ||
               /fastly\s*error/i.test(html);
    }

    function wiCrossFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                const urlObj = new URL(url);
                const domain = urlObj.hostname.replace('www.', '');
                const is7Digital      = urlObj.hostname.includes('7digital.com');
                const isBoomkat       = urlObj.hostname.includes('boomkat.com');
                const isJuno          = urlObj.hostname.includes('junodownload.com');
                const isTraxsource    = urlObj.hostname.includes('traxsource.com');
                const isBeatport      = urlObj.hostname.includes('beatport.com');
                const isBandcamp      = urlObj.hostname.includes('bandcamp.com');
                const isAppleMusic    = urlObj.hostname.includes('music.apple.com');
                const isBleep         = urlObj.hostname.includes('bleep.com');
                const isEClassical    = urlObj.hostname.includes('eclassical.com');
                const isHDtracks      = urlObj.hostname.includes('hdtracks.com');
                const isHighResAudio  = urlObj.hostname.includes('highresaudio.com');
                const isKompakt       = urlObj.hostname.includes('kompakt.fm');
                const isMora          = urlObj.hostname.includes('mora.jp');
                const isNativeDSD     = urlObj.hostname.includes('nativedsd.com');
                const isOtotoy        = urlObj.hostname.includes('ototoy.jp');
                const isProStudio     = urlObj.hostname.includes('prostudiomasters.com');
                const isDiscogs       = urlObj.hostname.includes('discogs.com');
                const isQobuz         = urlObj.hostname.includes('qobuz.com');
                const isPresto        = urlObj.hostname.includes('prestomusic.com');

                const headers = {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'User-Agent': navigator.userAgent,
                    'DNT': '1',
                    'Sec-GPC': '1',
                };

                if (is7Digital || isBoomkat) {
                    headers['Referer'] = urlObj.origin + '/';
                    headers['Cache-Control'] = 'max-age=0';
                }

                if (isBoomkat) {
                    headers['Upgrade-Insecure-Requests'] = '1';
                    headers['Sec-Fetch-Dest'] = 'document';
                    headers['Sec-Fetch-Mode'] = 'navigate';
                    headers['Sec-Fetch-Site'] = 'none';
                    headers['Sec-Fetch-User'] = '?1';
                }

                if (isJuno) {
                    headers['Referer'] = 'https://www.junodownload.com/';
                }

                if (isQobuz) {
                    headers['Referer'] = 'https://www.qobuz.com/';
                }

                if (isPresto) {
                    headers['Referer'] = 'https://www.prestomusic.com/';
                }

                if (isDiscogs) {
                    headers['Referer'] = 'https://www.discogs.com/';
                }

                const finalHeaders = Object.assign(headers, options.headers || {});

                const _performRequest = (extraCookieStr) => {
                    if (extraCookieStr) {
                        finalHeaders['Cookie'] = extraCookieStr;
                    }

                    GM_xmlhttpRequest({
                        method: options.method || 'GET',
                        url: url,
                        headers: finalHeaders,
                        anonymous: false,
                        revalidate: true,
                        responseType: options.responseType || 'text',
                        timeout: options.timeout || 30000,
                        onload: (response) => {
                            if (response.status === 429) {
                                reject(new Error(`Rate limit reached (HTTP 429): ${domain}`));
                                return;
                            }
                            if (response.status === 403) {
                                if (isJuno || isBoomkat || isTraxsource || isBeatport ||
                                    is7Digital || isBandcamp || isAppleMusic || isBleep ||
                                    isEClassical || isHDtracks || isHighResAudio || isKompakt ||
                                    isMora || isNativeDSD || isOtotoy || isProStudio ||
                                    isQobuz || isPresto) {
                                    reject(new Error(wiAntiBotError(url)));
                                    return;
                                }
                                reject(new Error(`Access forbidden (HTTP 403): ${domain}`));
                                return;
                            }
                            if (response.status === 401) {
                                reject(new Error(`Authentication required (HTTP 401): ${domain}`));
                                return;
                            }
                            if (response.status === 404) {
                                reject(new Error(`Page not found (HTTP 404): ${domain}`));
                                return;
                            }
                            if (response.status === 503) {
                                reject(new Error(`Service unavailable (HTTP 503): ${domain}`));
                                return;
                            }
                            if (response.status >= 400) {
                                reject(new Error(`HTTP ${response.status} error: ${domain}`));
                                return;
                            }

                            const content = response.responseText || response.response;
                            if (!content || content.length === 0) {
                                reject(new Error(`Empty response from ${domain}`));
                                return;
                            }

                            if (wiIsAntiBotPage(content)) {
                                reject(new Error(wiAntiBotError(url)));
                                return;
                            }

                            resolve(content);
                        },
                        onerror: () => {
                            reject(new Error(`Network error fetching ${domain}`));
                        },
                        ontimeout: () => {
                            reject(new Error(`Request timeout for ${domain} (exceeded 30s)`));
                        },
                    });
                };

                if ((isBoomkat || isJuno || isDiscogs || isBandcamp || isPresto) && typeof GM_cookie !== 'undefined' && typeof GM_cookie.list === 'function') {
                    GM_cookie.list({ url: urlObj.origin }, (cookies, error) => {
                        if (!error && cookies && cookies.length) {
                            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                            _performRequest(cookieStr);
                        } else {
                            _performRequest(null);
                        }
                    });
                } else {
                    _performRequest(null);
                }
                return;
            }

            const fetchOpts = {
                credentials: 'include',
                headers: options.headers || {},
                method: options.method || 'GET',
                signal: typeof AbortSignal.timeout === 'function'
                    ? AbortSignal.timeout(options.timeout || 30000)
                    : (() => { const c = new AbortController(); setTimeout(() => c.abort(), options.timeout || 30000); return c.signal; })(),
            };

            fetch(url, fetchOpts)
                .then(r => {
                    if (!r.ok) {
                        const statusText = {
                            429: 'Rate limit reached',
                            403: 'Access forbidden',
                            401: 'Authentication required',
                            404: 'Page not found',
                            503: 'Service unavailable',
                        };
                        throw new Error(`${statusText[r.status] || 'HTTP ' + r.status + ' error'}: ${new URL(url).hostname.replace('www.', '')}`);
                    }
                    return r.text();
                })
                .then(html => {
                    if (wiIsAntiBotPage(html)) throw new Error(wiAntiBotError(url));
                    resolve(html);
                })
                .catch(reject);
        });
    }

    async function wiParseAppleMusicHTML(url, preloadedHtml = null) {
        const html = preloadedHtml || await wiCrossFetch(url);
        const doc  = wiParseHTML(html, url);

        let ldData = null;
        const ldScript = doc.querySelector('script#schema\\:music-album, script[type="application/ld+json"]');
        if (ldScript) {
            try { ldData = JSON.parse(ldScript.textContent); } catch(e) {}
        }

        function isoToMmss(iso) {
            if (!iso) return '';
            const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
            if (!m) return wiNormalizeDuration(iso);
            const h = parseInt(m[1] || 0), mn = parseInt(m[2] || 0), s = Math.round(parseFloat(m[3] || 0));
            const totalMins = h * 60 + mn;
            return totalMins + ':' + String(s).padStart(2, '0');
        }

        const artistLinks = Array.from(doc.querySelectorAll(
            '.headings__subtitles a[data-testid="click-action"], .headings__subtitles a[href*="/artist/"]'
        )).map(a => a.textContent.trim()).filter(Boolean);
        const artist = ldData?.byArtist?.[0]?.name
            || artistLinks[0]
            || wiGetMeta(doc, 'og:title').split(' by ')[1]
            || '';
        const artists = artistLinks.length > 1 ? artistLinks : undefined;

        const title = (ldData?.name
            || doc.querySelector('.headings__title')?.textContent?.trim()
            || wiGetMeta(doc, 'apple:title')
            || '').replace(/\s*\(explicit\)$/i, '').trim();

        const rawDate = ldData?.datePublished
            || wiGetMeta(doc, 'music:release_date')
            || doc.querySelector('.headings__metadata-bottom')?.textContent?.match(/(\d{4}-\d{2}-\d{2})/)?.[1]
            || '';
        const date = wiNormalizeDate(rawDate.slice(0, 10));

        let imageUrl = ldData?.image || wiGetMeta(doc, 'og:image') || '';
        if (imageUrl) imageUrl = imageUrl.replace(/\/\d+x\d+[^/]*\.(?:jpg|webp)(?:[?#].*)?$/i, '/1400x1400.jpg');

        const copyrightText = doc.querySelector('.tracklist-footer-description, .footer-body .description')?.textContent?.trim() || '';
        const label = copyrightText.split('\n').find(l => l.includes('\u2117') || l.includes('\u00a9'))
            ?.replace(/^[\u00a9\u2117]\s*\d{4}\s*/i, '').trim() || '';

        let tracks = [];
        if (ldData?.track && ldData.track.length > 0) {
            tracks = ldData.track.map((t, i) => ({
                position: String(i + 1),
                title:    (t.name || '').trim(),
                duration: isoToMmss(t.duration),
            })).filter(t => t.title);
        } else if (ldData?.tracks && ldData.tracks.length > 0) {
            tracks = ldData.tracks.map((t, i) => ({
                position: String(i + 1),
                title:    (t.name || '').trim(),
                duration: isoToMmss(t.duration),
            })).filter(t => t.title);
        } else {
            tracks = Array.from(doc.querySelectorAll('.songs-list-row')).map((row, i) => ({
                position: String(i + 1),
                title:    row.querySelector('.songs-list-row__song-name')?.textContent?.trim() || '',
                duration: row.querySelector('.songs-list-row__length')?.textContent?.trim() || '',
            })).filter(t => t.title);
        }

        return { artist, ...(artists ? { artists } : {}), title, label, catno: null,
                 date, tracks, imageUrl, fileType: 'AAC', freeText: '256 kbps',
                 storeName: 'Apple Music' };
    }

    async function wiParseAppleMusic(url) {
        const match = url.match(/\/album\/[^\/]+\/(\d+)/) || url.match(/\/album\/(\d+)/);
        if (!match) return null;
        const albumId = match[1];

        const sfMatch   = url.match(/music\.apple\.com\/([a-z]{2})\//);
        const storefront = sfMatch ? sfMatch[1] : 'us';

        const getAlbumArtistsFromPage = async () => {
            try {
                const pageHtml = await wiCrossFetch(url);
                const pageDoc  = wiParseHTML(pageHtml, url);
                const links = Array.from(pageDoc.querySelectorAll(
                    '.headings__subtitles a[data-testid="click-action"], .headings__subtitles a[href*="/artist/"]'
                )).map(a => a.textContent.trim()).filter(Boolean);
                return links;
            } catch(e) { return []; }
        };

        try {
            const itunesText = await wiCrossFetch(`https://itunes.apple.com/lookup?id=${albumId}&entity=song&limit=200`);
            const data  = JSON.parse(itunesText);
            const album = data.results?.find(r => r.wrapperType === 'collection');

            if (album) {
                const rawAlbumArtist = album.artistName || '';
                const isVA = /various artists|v\/a/i.test(rawAlbumArtist);

                let albumArtistsArray = [];
                if (!isVA) {
                    albumArtistsArray = await getAlbumArtistsFromPage();
                    if (albumArtistsArray.length <= 1)
                        albumArtistsArray = rawAlbumArtist.split(/\s+&\s+/).map(s => s.trim()).filter(Boolean);
                }
                const artist  = isVA ? 'Various' : albumArtistsArray.join(', ');
                const artists = !isVA && albumArtistsArray.length > 1 ? albumArtistsArray : undefined;

                const songs = (data.results || [])
                    .filter(r => r.kind === 'song' && (r.trackName || '').trim())
                    .sort((a, b) => (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber));

                if (songs.length > 0) {
                    const uniqueArtistGroups = [...new Set(songs.map(s => (s.artistName || '').toLowerCase()).filter(Boolean))];
                    const isVAPerTrack = isVA || uniqueArtistGroups.length > 1;
                    const tracks = songs.map((t, i) => ({
                        position: String(i + 1),
                        title:    t.trackName || '',
                        duration: t.trackTimeMillis ? wiFormatDuration(Math.round(t.trackTimeMillis / 1000)) : '',
                        ...(isVAPerTrack && t.artistName ? { artists: [t.artistName] } : {}),
                    }));
                    const label = (album.copyright || '').replace(/^[\u00a9\u2117]\s*\d{4}\s*/i, '').trim() || '';
                    return {
                        artist, ...(artists ? { artists } : {}),
                        title: (album.collectionName || '').replace(/\s*\(explicit\)$/i, '').trim(),
                        label, catno: null,
                        date: album.releaseDate?.slice(0, 10) || '',
                        tracks,
                        imageUrl: (album.artworkUrl100 || '').replace(/\d+x\d+/, '1400x1400'),
                        fileType: 'AAC', freeText: '256 kbps',
                        storeName: 'Apple Music',
                    };
                }
                log('Apple Music: iTunes returned 0 songs, trying HTML scraper...', 'info');
            }
        } catch(e) {
            log('Apple Music: iTunes failed (' + e.message + '), trying HTML scraper...', 'warning');
        }

        log('Apple Music: using HTML scraper', 'info');
        return wiParseAppleMusicHTML(url);
    }

    const CREDIT_ROLE_MAP = [
        // Writing & composition
        [/^compos(?:ed|ers?|ing|ition)?(?:\s+by)?$/i,                                                'Composed By'],
        [/^compositon(?:\s+by)?$/i,                                                                  'Composed By'],
        [/^composted(?:\s+by)?$/i,                                                                   'Composed By'],
        [/^(?:(?:all[- ](?:songs?|music)[\s-]?|music[\s-]?|songs?[\s-]?)?writ(?:er|ing|ten))(?:\s+by)?$/i, 'Written-By'],
        [/^(?:all[- ])?lyric(?:s|ist|al)?(?:\s+by)?$/i,                                             'Lyrics By'],
        [/^liric(?:s)?(?:\s+by)?$/i,                                                                 'Lyrics By'],
        [/^lyrcs(?:\s+by)?$/i,                                                                      'Lyrics By'],
        [/^(?:all\s+(?:original\s+)?)?(?:words?|text)(?:\s+writ(?:er|ing|ten))?(?:\s+by)?$/i,    'Words By'],
        [/^(?:all\s+)?music(?:\s+by)?$/i,                                                           'Music By'],
        [/^songwrit(?:ers?|ing)(?:\s+by)?$/i,                                                        'Songwriter'],
        [/^adapt(?:ed|ation)?(?:\s+by)?$/i,                                                          'Adapted By'],

        // Arrangement & direction
        [/^arrang(?:ed|ers?|ing|ement)(?:\s+by)?$/i,                                                 'Arranged By'],
        [/^arang(?:ed|ers?|ing|ement)?(?:\s+by)?$/i,                                                'Arranged By'],
        [/^arrangment(?:\s+by)?$/i,                                                                  'Arranged By'],
        [/^orchestrat(?:ed|ion|er)(?:\s+by)?$/i,                                                     'Orchestrated By'],
        [/^conduct(?:ed|or)(?:\s+by)?$/i,                                                            'Conductor'],

        // Production
        [/^(?:additional[- ])?(?:produced?|producer|production)(?:\s+by)?$/i,                        'Producer'],
        [/^produser(?:\s+by)?$/i,                                                                    'Producer'],
        [/^producted(?:\s+by)?$/i,                                                                   'Producer'],
        [/^co-?produc(?:er|ed|ing|tion)?(?:\s+by)?$/i,                                             'Co-producer'],
        [/^executive[- ]produc(?:ed|er|production)?(?:\s+by)?$/i,                                    'Executive-Producer'],
        [/^(?:additional[- ])?programm(?:ed|er|ing)?(?:\s+by)?$/i,                                   'Programmed By'],
        [/^supervis(?:ed|or|ion)(?:\s+by)?$/i,                                                       'Supervised By'],
        [/^(?:compiled?|compiler|compilation)(?:\s+by)?$/i,                                          'Compiled By'],
        [/^(?:management|managed|manager)(?:\s+by)?$/i,                                              'Management'],

        // Mastering, mixing & recording
        [/^master(?:ed|ing)?(?:\s+by)?$/i,                                                           'Mastered By'],
        [/^mastering(?:\s+by)?$/i,                                                                   'Mastered By'],
        [/^masered(?:\s+by)?$/i,                                                                     'Mastered By'],
        [/^masterd(?:\s+by)?$/i,                                                                     'Mastered By'],
        [/^re[-_]?masters?(?:ed|ing)?(?:\s+by)?$/i,                                                  'Remastered By'],
        [/^re[-_]?mastering(?:\s+by)?$/i,                                                           'Remastered By'],
        [/^\(re\)\s*master(?:ing|ed)?(?:\s+by)?$/i,                                                 'Remastered By'],
        [/^mix(?:ed|ing|er)?(?:\s+by)?$/i,                                                           'Mixed By'],
        [/^mixing(?:\s+by)?$/i,                                                                      'Mixed By'],
        [/^record(?:ed|ing|er)?(?:\s+by)?$/i,                                                        'Recorded By'],
        [/^field\s+record(?:ing|ings|ed)?(?:\s+by)?$/i,                                             'Field Recording'],
        [/^eng(?:i|e)neers?(?:ed|ing)?(?:\s+by)?$/i,                                                 'Engineer'],
        [/^engineering(?:\s+by)?$/i,                                                                 'Engineer'],
        [/^engineerd(?:\s+by)?$/i,                                                                   'Engineer'],
        [/^engeneer(?:s|ing)?(?:\s+by)?$/i,                                                         'Engineer'],
        [/^(?:edited?|editor|editing)(?:\s+by)?$/i,                                                  'Edited By'],
        [/^sequenc(?:ed|er|ing)?(?:\s+by)?$/i,                                                       'Sequenced By'],
        [/^sound[- ]design(?:er|ed)?$/i,                                                              'Sound Designer'],
        [/^lacquer[- ]cut(?:\s+by)?$/i,                                                              'Lacquer Cut By'],

        // Performance
        [/^(?:performed?|performers?|performance)(?:\s+by)?$/i,                                      'Performer'],
        [/^band(?:[- ]?(?:members?|is))?$/i,                                                          'Band'],
        [/^(?:all\s+)?instruments?(?:\s+by)?$/i,                                                    'Instruments'],

        // Vocals
        [/^(?:all\s+)?(?:vocals?|singing|vox)(?:\s+by)?$/i,                                         'Vocals'],
        [/^(?:lead[- ]?vocals?|lead[- ]?vo(?:ice|x)s?)(?:\s+by)?$/i,                                 'Lead Vocals'],
        [/^(?:backing[- ]?vocals?|background[- ]?vocals?)(?:\s+by)?$/i,                              'Backing Vocals'],
        [/^(?:vocal\s+samples?|vox)$/i,                                                              'Vocals'],
        [/^(?:choir|chorus)$/i,                                                                       'Choir'],
        [/^rap(?:ped)?(?:\s+by)?$/i,                                                                 'Rap'],
        [/^mc$/i,                                                                                     'MC'],
        [/^(?:human\s+)?beatbox(?:ing)?(?:\s+by)?$/i,                                               'Human Beatbox'],

        // Drums & percussion
        [/^(?:lead\s+)?drums?(?:\s+by)?$/i,                                                         'Drums'],
        [/^live\s+drums?(?:\s+by)?$/i,                                                              'Drums'],
        [/^drum[- ]program(?:s|ming)?(?:\s+by)?$/i,                                                  'Drum Programming'],
        [/^drum[- ]machines?(?:\s+by)?$/i,                                                           'Drum Machine'],
        [/^percussion$/i,                                                                             'Percussion'],

        // Bass & guitar
        [/^bass[- ]guitars?(?:\s+by)?$/i,                                                             'Bass Guitar'],
        [/^electric[- ]?basses?(?:\s+by)?$/i,                                                         'Electric Bass'],
        [/^bass(?!oon)/i,                                                                              'Bass'],
        [/^guitars?$/i,                                                                                'Guitar'],
        [/^acoustic[- ]guitars?(?:\s+by)?$/i,                                                         'Acoustic Guitar'],
        [/^electric[- ]guitars?(?:\s+by)?$/i,                                                         'Electric Guitar'],

        // Keys & synths
        [/^pianos?$/i,                                                                                 'Piano'],
        [/^(?:keyboards?|keys)(?:\s+by)?$/i,                                                         'Keyboards'],
        [/^synthesiz(?:er|ers)(?:\s+by)?$|^synthesisers?(?:\s+by)?$/i,                              'Synthesizer'],
        [/^synths?(?:\s+by)?$/i,                                                                     'Synth'],
        [/^([\w][\w+\-]+)\s+synths?(?:\s+by)?$/i,                                                'Synth'],

        // Other instruments
        [/^strings?$/i,                                                                               'Strings'],
        [/^(?:brass|horns?)$/i,                                                                       'Brass'],

        // DJ & electronic
        [/^(?:dj[- ]?mix|dj mixed)(?:\s+by)?$/i,                                                    'DJ Mix'],
        [/^(?:turntables?|dj|spinning)$/i,                                                            'Turntables'],
        [/^(?:samples?|sampling)$/i,                                                                  'Samples'],
        [/^noises?(?:\s+by)?$/i,                                                                     'Noises'],

        // Artwork & design
        [/^art[- ]direction$/i,                                                                       'Art Direction'],
        [/^aesthetic[- ]direction(?:\s+by)?$/i,                                                      'Art Direction'],
        [/^art(?:war|work)?(?:\s+by)?$/i,                                                            'Artwork'],
        [/^visuals?(?:\s+by)?$/i,                                                                    'Artwork'],
        [/^photography\s+art(?:work)?$/i,                                                            'Artwork'],
        [/^cover(?:\s+art(?:work)?)?(?:\s+by)?$/i,                                                  'Cover'],
        [/^graphic(?:al)?[- ]?design(?:er|ed)?(?:\s+by)?$/i,                                        'Graphic Design'],
        [/^graphic[- ]?desing(?:\s+by)?$/i,                                                         'Graphic Design'],
        [/^graphics?(?:\s+by)?$/i,                                                                   'Graphics'],
        [/^graphic\s+support(?:\s+by)?$/i,                                                          'Graphics'],
        [/^grahpic[- ]?design(?:\s+by)?$/i,                                                         'Graphic Design'],
        [/^re[-_]?design(?:ed)?(?:\s+by)?$/i,                                                        'Design'],
        [/^design(?:ed)?(?:\s+by)?$/i,                                                               'Design'],
        [/^desing(?:\s+by)?$/i,                                                                      'Design'],
        [/^(?:cover[- ]?)?layout(?:\s+by)?$/i,                                                       'Layout'],
        [/^(?:cover[- ]?)?lauyout(?:\s+by)?$/i,                                                     'Layout'],
        [/^(?:cover[- ]?)?layuot(?:\s+by)?$/i,                                                      'Layout'],
        [/^(?:photography|photographer|photographs?|photos?|fotos?|(?:cover\s+)?images?)(?:\s+by)?$/i, 'Photography By'],
        [/^pictures?(?:\s+by)?$/i,                                                                   'Photography By'],
        [/^(?:photography|photo)\s+art(?:ist)?(?:\s+by)?$/i,                                         'Photography By'],
        [/^photgraphy(?:\s+by)?$/i,                                                                  'Photography By'],
        [/^photograhpy(?:\s+by)?$/i,                                                                 'Photography By'],
        [/^photogrpahy(?:\s+by)?$/i,                                                                 'Photography By'],
        [/^(?:illustration|illustrat(?:or|ed))(?:\s+by)?$/i,                                        'Illustration'],
        [/^ilustrat(?:ion|or|ed)?(?:\s+by)?$/i,                                                     'Illustration'],
        [/^illustrtion(?:\s+by)?$/i,                                                                 'Illustration'],
        [/^fonts?(?:\s+by)?$/i,                                                                      'Typography'],
        [/^(?:liner|sleeve)[- ]notes?$/i,                                                             'Liner Notes'],
        [/^cover[- ]?photos?(?:\s+by)?$/i,                                                           'Photography By'],
    ];

    const DISCOGS_OFFICIAL_CREDITS = new Map([
  ['written-by', 'Written-By'],
  ['adapted by', 'Adapted By'],
  ['arranged by', 'Arranged By'],
  ['beats', 'Beats'],
  ['cadenza', 'Cadenza'],
  ['composed by', 'Composed By'],
  ['concept by', 'Concept By'],
  ['copyist', 'Copyist'],
  ['created by', 'Created By'],
  ['instrumentation by', 'Instrumentation By'],
  ['instruments', 'Instruments'],
  ['libretto by', 'Libretto By'],
  ['lyrics by', 'Lyrics By'],
  ['music by', 'Music By'],
  ['musical assistance', 'Musical Assistance'],
  ['orchestrated by', 'Orchestrated By'],
  ['programmed by', 'Programmed By'],
  ['score', 'Score'],
  ['score editor', 'Score Editor'],
  ['sequenced by', 'Sequenced By'],
  ['songwriter', 'Songwriter'],
  ['sound designer', 'Sound Designer'],
  ['transcription by', 'Transcription By'],
  ['translated by', 'Translated By'],
  ['words by', 'Words By'],
  ['featuring', 'Featuring'],
  ['hosted by', 'Hosted By'],
  ['music consultant', 'Music Consultant'],
  ['presenter', 'Presenter'],
  ['chorus master', 'Chorus Master'],
  ['concertmaster', 'Concertmaster'],
  ['concertmistress', 'Concertmistress'],
  ['conductor', 'Conductor'],
  ['contractor', 'Contractor'],
  ['directed by', 'Directed By'],
  ['leader', 'Leader'],
  ['music director', 'Music Director'],
  ['repetiteur', 'Repetiteur'],
  ['co-producer', 'Co-producer'],
  ['collected by', 'Collected By'],
  ['commissioned by', 'Commissioned By'],
  ['compilation producer', 'Compilation Producer'],
  ['compiled by', 'Compiled By'],
  ['curated by', 'Curated By'],
  ['editor', 'Editor'],
  ['executive-producer', 'Executive-Producer'],
  ['post production', 'Post Production'],
  ['producer', 'Producer'],
  ['recording supervisor', 'Recording Supervisor'],
  ['reissue producer', 'Reissue Producer'],
  ['research', 'Research'],
  ['supervised by', 'Supervised By'],
  ['dj mix', 'DJ Mix'],
  ['animation', 'Animation'],
  ['art direction', 'Art Direction'],
  ['aesthetic direction', 'Art Direction'],
  ['additional effects', 'Effects'],
  ['additional input', 'Acknowledgements'],
  ['additional support', 'Acknowledgements'],
  ['artwork', 'Artwork'],
  ['assemblage', 'Assemblage'],
  ['calligraphy', 'Calligraphy'],
  ['camera operator', 'Camera Operator'],
  ['cgi artist', 'CGI Artist'],
  ['cinematographer', 'Cinematographer'],
  ['costume designer', 'Costume Designer'],
  ['cover', 'Cover'],
  ['creative director', 'Creative Director'],
  ['design', 'Design'],
  ['design concept', 'Design Concept'],
  ['director of photography', 'Director Of Photography'],
  ['drawing', 'Drawing'],
  ['film director', 'Film Director'],
  ['film editor', 'Film Editor'],
  ['film producer', 'Film Producer'],
  ['film technician', 'Film Technician'],
  ['filmed by', 'Filmed By'],
  ['footage by', 'Footage By'],
  ['gaffer', 'Gaffer'],
  ['graphic design', 'Graphic Design'],
  ['graphics', 'Graphics'],
  ['grip', 'Grip'],
  ['hair', 'Hair'],
  ['illustration', 'Illustration'],
  ['image editor', 'Image Editor'],
  ['layout', 'Layout'],
  ['lettering', 'Lettering'],
  ['lighting', 'Lighting'],
  ['lighting director', 'Lighting Director'],
  ['lithography', 'Lithography'],
  ['logo', 'Logo'],
  ['make-up', 'Make-Up'],
  ['model', 'Model'],
  ['painting', 'Painting'],
  ['photography by', 'Photography By'],
  ['production manager', 'Production Manager'],
  ['realization', 'Realization'],
  ['scenographer', 'Scenographer'],
  ['screen printing', 'Screen Printing'],
  ['set designer', 'Set Designer'],
  ['sleeve', 'Sleeve'],
  ['stage manager', 'Stage Manager'],
  ['stylist', 'Stylist'],
  ['typography', 'Typography'],
  ['video director', 'Video Director'],
  ['video editor', 'Video Editor'],
  ['video producer', 'Video Producer'],
  ['video technician', 'Video Technician'],
  ['videography', 'Videography'],
  ['vj', 'VJ'],
  ['abridged by', 'Abridged By'],
  ['adapted by (text)', 'Adapted By (Text)'],
  ['announcer', 'Announcer'],
  ['author', 'Author'],
  ['booklet editor', 'Booklet Editor'],
  ['choreography', 'Choreography'],
  ['commentator', 'Commentator'],
  ['dialog', 'Dialog'],
  ['interviewee', 'Interviewee'],
  ['interviewer', 'Interviewer'],
  ['liner notes', 'Liner Notes'],
  ['music librarian', 'Music Librarian'],
  ['narrator', 'Narrator'],
  ['proofreader', 'Proofreader'],
  ['read by', 'Read By'],
  ['screenwriter', 'Screenwriter'],
  ['script by', 'Script By'],
  ['sleeve notes', 'Sleeve Notes'],
  ['text by', 'Text By'],
  ['voice actor', 'Voice Actor'],
  ['a&r', 'A&R'],
  ['administrator', 'Administrator'],
  ['advisor', 'Advisor'],
  ['booking', 'Booking'],
  ['consultant', 'Consultant'],
  ['coordinator', 'Coordinator'],
  ['legal', 'Legal'],
  ['management', 'Management'],
  ['marketing', 'Marketing'],
  ['merchandising', 'Merchandising'],
  ['product manager', 'Product Manager'],
  ['project manager', 'Project Manager'],
  ['promotion', 'Promotion'],
  ['public relations', 'Public Relations'],
  ['tour manager', 'Tour Manager'],
  ['vocal coach', 'Vocal Coach'],
  ['authoring', 'Authoring'],
  ['daw', 'DAW'],
  ['direct metal mastering by', 'Direct Metal Mastering By'],
  ['edited by', 'Edited By'],
  ['engineer', 'Engineer'],
  ['equipment', 'Equipment'],
  ['field recording', 'Field Recording'],
  ['field recordings', 'Field Recording'],
  ['instrument builder', 'Instrument Builder'],
  ['lacquer cut by', 'Lacquer Cut By'],
  ['lathe cut by', 'Lathe Cut By'],
  ['lathe designer', 'Lathe Designer'],
  ['luthier', 'Luthier'],
  ['mastered by', 'Mastered By'],
  ['mixed by', 'Mixed By'],
  ['overdubbed by', 'Overdubbed By'],
  ['plated by', 'Plated By'],
  ['recorded by', 'Recorded By'],
  ['remastered by', 'Remastered By'],
  ['(re)mastering', 'Remastered By'],
  ['(re)mastered by', 'Remastered By'],
  ['restoration', 'Restoration'],
  ['tape op', 'Tape Op'],
  ['technician', 'Technician'],
  ['tracking by', 'Tracking By'],
  ['transferred by', 'Transferred By'],
  ['tuner', 'Tuner'],
  ['alto vocals', 'Alto Vocals'],
  ['backing vocals', 'Backing Vocals'],
  ['baritone vocals', 'Baritone Vocals'],
  ['bass vocals', 'Bass Vocals'],
  ['bass-baritone vocals', 'Bass-Baritone Vocals'],
  ['caller', 'Caller'],
  ['cantor', 'Cantor'],
  ['choir', 'Choir'],
  ['chorus', 'Chorus'],
  ['contralto vocals', 'Contralto Vocals'],
  ['coro', 'Coro'],
  ['countertenor vocals', 'Countertenor Vocals'],
  ['eefing', 'Eefing'],
  ['harmony vocals', 'Harmony Vocals'],
  ['human beatbox', 'Human Beatbox'],
  ['humming', 'Humming'],
  ['joik', 'Joik'],
  ['kakegoe', 'Kakegoe'],
  ['lead vocals', 'Lead Vocals'],
  ['mc', 'MC'],
  ['mezzo-soprano vocals', 'Mezzo-soprano Vocals'],
  ['overtone voice', 'Overtone Voice'],
  ['rap', 'Rap'],
  ['satsuma', 'Satsuma'],
  ['scat', 'Scat'],
  ['solo vocal', 'Solo Vocal'],
  ['soprano vocals', 'Soprano Vocals'],
  ['speech', 'Speech'],
  ['tenor vocals', 'Tenor Vocals'],
  ['toasting', 'Toasting'],
  ['treble vocals', 'Treble Vocals'],
  ['vocal percussion', 'Vocal Percussion'],
  ['vocalese', 'Vocalese'],
  ['voice', 'Voice'],
  ['vocals', 'Vocals'],
  ['vocalized', 'Vocals'],
  ['vocalize', 'Vocals'],
  ['whistling', 'Whistling'],
  ['yodeling', 'Yodeling'],
  ['drum programming', 'Drum Programming'],
  ['drums', 'Drums'],
  ['electronic drums', 'Electronic Drums'],
  ['drum', 'Drum'],
  ['percussion', 'Percussion'],
  ['bass drum', 'Bass Drum'],
  ['snare', 'Snare'],
  ['hihat', 'Hihat'],
  ['bongos', 'Bongos'],
  ['congas', 'Congas'],
  ['cymbals', 'Cymbals'],
  ['tambourine', 'Tambourine'],
  ['triangle', 'Triangle'],
  ['cowbell', 'Cowbell'],
  ['maracas', 'Maracas'],
  ['shaker', 'Shaker'],
  ['claves', 'Claves'],
  ['castanets', 'Castanets'],
  ['timbales', 'Timbales'],
  ['timpani', 'Timpani'],
  ['gong', 'Gong'],
  ['bells', 'Bells'],
  ['xylophone', 'Xylophone'],
  ['vibraphone', 'Vibraphone'],
  ['marimba', 'Marimba'],
  ['glockenspiel', 'Glockenspiel'],
  ['celesta', 'Celesta'],
  ['chimes', 'Chimes'],
  ['crotales', 'Crotales'],
  ['tubular bells', 'Tubular Bells'],
  ['piano', 'Piano'],
  ['grand piano', 'Grand Piano'],
  ['upright piano', 'Upright Piano'],
  ['electric piano', 'Electric Piano'],
  ['organ', 'Organ'],
  ['electric organ', 'Electric Organ'],
  ['harmonium', 'Harmonium'],
  ['keyboards', 'Keyboards'],
  ['synthesizer', 'Synthesizer'],
  ['synth', 'Synth'],
  ['synth bass', 'Synth Bass'],
  ['mellotron', 'Mellotron'],
  ['harpsichord', 'Harpsichord'],
  ['guitar', 'Guitar'],
  ['electric guitar', 'Electric Guitar'],
  ['acoustic guitar', 'Acoustic Guitar'],
  ['bass guitar', 'Bass Guitar'],
  ['electric bass', 'Electric Bass'],
  ['bass', 'Bass'],
  ['lead guitar', 'Lead Guitar'],
  ['rhythm guitar', 'Rhythm Guitar'],
  ['acoustic bass', 'Acoustic Bass'],
  ['lap steel guitar', 'Lap Steel Guitar'],
  ['slide guitar', 'Slide Guitar'],
  ['steel guitar', 'Steel Guitar'],
  ['pedal steel guitar', 'Pedal Steel Guitar'],
  ['classical guitar', 'Classical Guitar'],
  ['flamenco guitar', 'Flamenco Guitar'],
  ['12-string acoustic guitar', '12-String Acoustic Guitar'],
  ['12-string electric guitar', '12-string Electric Guitar'],
  ['twelve-string guitar', 'Twelve-String Guitar'],
  ['fretless bass', 'Fretless Bass'],
  ['fretless guitar', 'Fretless Guitar'],
  ['semi-acoustic guitar', 'Semi-Acoustic Guitar'],
  ['banjo', 'Banjo'],
  ['mandolin', 'Mandolin'],
  ['ukulele', 'Ukulele'],
  ['violin', 'Violin'],
  ['viola', 'Viola'],
  ['cello', 'Cello'],
  ['contrabass', 'Contrabass'],
  ['double bass', 'Double Bass'],
  ['harp', 'Harp'],
  ['trumpet', 'Trumpet'],
  ['trombone', 'Trombone'],
  ['french horn', 'French Horn'],
  ['tuba', 'Tuba'],
  ['saxophone', 'Saxophone'],
  ['clarinet', 'Clarinet'],
  ['flute', 'Flute'],
  ['oboe', 'Oboe'],
  ['bassoon', 'Bassoon'],
  ['harmonica', 'Harmonica'],
  ['accordion', 'Accordion'],
  ['strings', 'Strings'],
  ['brass', 'Brass'],
  ['electronics', 'Electronics'],
  ['noises', 'Noises'],
  ['samples', 'Samples'],
  ['turntables', 'Turntables'],
  ['drum machine', 'Drum Machine'],
  ['sequencer', 'Sequencer'],
  ['sampler', 'Sampler'],
  ['loops', 'Loops'],
  ['effects', 'Effects'],
  ['scratches', 'Scratches'],
  ['vocoder', 'Vocoder'],
  ['theremin', 'Theremin'],
  ['tape', 'Tape'],
  ['computer', 'Computer'],
  ['band', 'Band'],
  ['performer', 'Performer'],
  ['ensemble', 'Ensemble'],
  ['orchestra', 'Orchestra']
    ]);

    function splitOutsideQuotes(s) {
        const Q = new Set(["'", '"', '\u2018', '\u2019', '\u201c', '\u201d']);
        const segments = [];
        let buf = '', depth = 0, parenDepth = 0;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (c === '(') { parenDepth++; buf += c; continue; }
            if (c === ')') { parenDepth = Math.max(0, parenDepth - 1); buf += c; continue; }
            if (Q.has(c)) { depth = depth ? 0 : 1; buf += c; continue; }
            if (!depth && !parenDepth) {
                if (c === ',' || c === '&') { segments.push(buf.trim()); buf = ''; continue; }
                if (c === '+' && /\s$/.test(buf) && /^\s/.test(s[i+1] || '')) { segments.push(buf.trim()); buf = ''; continue; }
                const rest = s.slice(i);
                const m = rest.match(/^and\b/i);
                if (m && (i === 0 || /\s/.test(s[i-1]))) {
                    segments.push(buf.trim());
                    buf = '';
                    i += m[0].length - 1;
                    continue;
                }
            }
            buf += c;
        }
        if (buf.trim()) segments.push(buf.trim());
        return segments.map(p => p.replace(/^[,\s]+|[,\s]+$/g, '')).filter(Boolean);
    }
    const COMPOUND_ROLE_EXPANSIONS = new Map([
        ['analog manipulation',        [{ official: 'Other', bracket: 'Analog Manipulation' }]],
        ['analogue manipulation',      [{ official: 'Other', bracket: 'Analog Manipulation' }]],
        ['digital manipulation',       [{ official: 'Other', bracket: 'Digital Manipulation' }]],
        ['manipulation',               [{ official: 'Other', bracket: 'Manipulation' }]],
        ['manipulated',               [{ official: 'Other', bracket: 'Manipulated' }]],
        ['original photo',             [{ official: 'Photography By', bracket: 'Original Photo' }]],
        ['original photograph',        [{ official: 'Photography By', bracket: 'Original Photo' }]],
        ['original photography',       [{ official: 'Photography By', bracket: 'Original Photo' }]],
        ['cover layout',              ['Cover', 'Layout']],
        ['cover design',              ['Cover', 'Design']],
        ['cover layout design',       ['Cover', 'Layout', 'Design']],
        ['cover artwork',             [{ official: 'Artwork', bracket: 'Cover Artwork' }]],
        ['cover art',                 [{ official: 'Artwork', bracket: 'Cover Art' }]],
        ['cover photo',               [{ official: 'Photography By', bracket: 'Cover Photo' }]],
        ['cover photograph',          [{ official: 'Photography By', bracket: 'Cover Photo' }]],
        ['cover photography',         [{ official: 'Photography By', bracket: 'Cover Photo' }]],
        ['cover and cover photo',     ['Cover', { official: 'Photography By', bracket: 'Cover Photo' }]],
        ['cover and cover photograph',['Cover', { official: 'Photography By', bracket: 'Cover Photo' }]],
        ['macro-photography',         [{ official: 'Photography By', bracket: 'Macro-Photography' }]],
        ['macro photography',         [{ official: 'Photography By', bracket: 'Macro-Photography' }]],
        ['font',                      [{ official: 'Typography', bracket: null }]],
        ['digital artwork',           [{ official: 'Artwork', bracket: 'Digital' }]],
        ['digital art',               [{ official: 'Artwork', bracket: 'Digital' }]],
        ['cover art direction',       ['Cover', 'Art Direction']],
        ['artwork layout',            ['Artwork', 'Layout']],
        ['artwork design',            ['Artwork', 'Design']],
        ['artwork layout design',     ['Artwork', 'Layout', 'Design']],
        ['artwork layout and design', ['Artwork', 'Layout', 'Design']],
        ['artwork idea',              [{ official: 'Artwork', bracket: 'Idea' }]],
        ['layouted',                  [{ official: 'Layout',  bracket: 'Layouted' }]],
        ['layout and design',         ['Layout', 'Design']],
        ['layout design',             ['Layout', 'Design']],
        ['art design',                [{ official: 'Artwork', bracket: 'Art' }, 'Design']],
        ['art layout',                [{ official: 'Artwork', bracket: 'Art' }, 'Layout']],
        ['art design layout',         [{ official: 'Artwork', bracket: 'Art' }, 'Design', 'Layout']],
        ['art layout design',         [{ official: 'Artwork', bracket: 'Art' }, 'Layout', 'Design']],
        ['artwork photography',        ['Artwork', 'Photography By']],
        ['graphic layout',             [{ official: 'Layout', bracket: 'Graphic Layout' }]],
        ['graphic design',             ['Graphic Design']],
        ['graphic design layout',      ['Graphic Design', 'Layout']],
        ['sleeve design',             ['Sleeve', 'Design']],
        ['sleeve art',                ['Sleeve', { official: 'Artwork', bracket: 'Art' }]],
        ['sleeve artwork',            ['Sleeve', { official: 'Artwork', bracket: 'Art' }]],
        ['sleeve design layout',      ['Sleeve', 'Design', 'Layout']],
        ['textual design',            [{ official: 'Design', bracket: 'Textual' }]],
        ['design art',                ['Design', { official: 'Artwork', bracket: 'Art' }]],
        ['w&p',                       [{ official: 'Written-By', bracket: 'W' }, { official: 'Producer', bracket: 'P' }]],
        ['w+p',                       [{ official: 'Written-By', bracket: 'W' }, { official: 'Producer', bracket: 'P' }]],
        ['vocals and lyrics',         ['Vocals', 'Lyrics By']],
        ['lyrics and vocals',         ['Lyrics By', 'Vocals']],
        ['voices',                    [{ official: 'Voice', bracket: 'Voices' }]],
        ['lead voices',               [{ official: 'Lead Vocals', bracket: null }]],
        ['executive production',      [{ official: 'Executive-Producer', bracket: 'Production' }]],
        ['all tracks',                [{ official: 'Music By', bracket: 'Tracks' }]],
        ['all songs',                 [{ official: 'Music By', bracket: 'Songs' }]],
        ['tracks',                    [{ official: 'Music By', bracket: 'Tracks' }]],
        ['mixed and mastered',        ['Mixed By', 'Mastered By']],
        ['mixed & mastered',          ['Mixed By', 'Mastered By']],
        ['final mixed and mastered',  ['Mixed By', 'Mastered By']],
        ['final mix and master',      ['Mixed By', 'Mastered By']],
        ['mix and master',            ['Mixed By', 'Mastered By']],
        ['mix and mastered',          ['Mixed By', 'Mastered By']],
        ['whisper',                   [{ official: 'Vocals', bracket: 'Whispers' }]],
        ['whispers',                  [{ official: 'Vocals', bracket: 'Whispers' }]],
        ['whispering',                [{ official: 'Vocals', bracket: 'Whispers' }]],
        ['background vocals',         [{ official: 'Backing Vocals', bracket: 'Background' }]],
        ['aesthetic direction',       [{ official: 'Art Direction', bracket: 'Aesthetic' }]],
        ['riffs',                     [{ official: 'Guitar', bracket: 'Riffs' }]],
        ['vocals written',                [{ official: 'Written-By', bracket: 'Vocals' }]],
        ['performed',                [{ official: 'Performer', bracket: 'Performed' }]],
        ['performer',                [{ official: 'Performer', bracket: 'Performed' }]],
        ['vocals written and performed',     [{ official: 'Written-By', bracket: 'Vocals' }, { official: 'Performer', bracket: 'Performed' }]],
        ['written and performed',            [{ official: 'Written-By', bracket: null }, { official: 'Performer', bracket: 'Performed' }]],
        ['written and produced',             [{ official: 'Written-By', bracket: null }, { official: 'Producer', bracket: 'Produced' }]],
        ['written produced and performed',[{ official: 'Written-By', bracket: null }, { official: 'Producer', bracket: 'Produced' }, { official: 'Performer', bracket: 'Performed' }]],
        ['remix produced',                   [{ official: 'Producer', bracket: 'Remix Produced' }]],
        ['remix production',                 [{ official: 'Producer', bracket: 'Remix Production' }]],
        ['remixes produced',                 [{ official: 'Producer', bracket: 'Remix Produced' }]],
        ['lyrics written and performed',  [{ official: 'Written-By', bracket: 'Vocals' }, { official: 'Performer', bracket: 'Performed' }]],
        ['spoken word',               [{ official: 'Words By', bracket: 'Spoken Word' }]],
        ['spoken words',              [{ official: 'Words By', bracket: 'Spoken Word' }]],
        ['spoken',                    [{ official: 'Words By', bracket: 'Spoken Word' }]],
        ['designed',                  [{ official: 'Design', bracket: 'Designed' }]],
        ['co-written',                [{ official: 'Written-By', bracket: 'Co-Written' }]],
        ['co-written with',           [{ official: 'Written-By', bracket: 'Co-Written With' }]],
        ['cowritten',                 [{ official: 'Written-By', bracket: 'Co-Written' }]],
        ['co-writing',                [{ official: 'Written-By', bracket: 'Co-Written' }]],
        ['co-writer',                 [{ official: 'Written-By', bracket: 'Co-Written' }]],
        ['co-writer with',            [{ official: 'Written-By', bracket: 'Co-Written With' }]],
        ['mastering engineer',        [{ official: 'Engineer', bracket: 'Mastering Engineer' }]],
        ['mastering engineered',     [{ official: 'Engineer', bracket: 'Mastering Engineered' }]],
        ['mixing engineer',           [{ official: 'Engineer', bracket: 'Mixing Engineer' }]],
        ['mixing engineered',        [{ official: 'Engineer', bracket: 'Mixing Engineered' }]],
        ['re-engineered',             [{ official: 'Engineer', bracket: 'Re-Engineered' }]],
        ['re engineered',             [{ official: 'Engineer', bracket: 'Re-Engineered' }]],
        ['reengineered',              [{ official: 'Engineer', bracket: 'Re-Engineered' }]],
        ['drum machines',            [{ official: 'Drum Machine',        bracket: 'Drum Machines'        }]],
        ['bass guitars',             [{ official: 'Bass Guitar',          bracket: 'Bass Guitars'         }]],
        ['electric guitars',         [{ official: 'Electric Guitar',      bracket: 'Electric Guitars'     }]],
        ['acoustic guitars',         [{ official: 'Acoustic Guitar',      bracket: 'Acoustic Guitars'     }]],
        ['lead guitars',             [{ official: 'Lead Guitar',          bracket: 'Lead Guitars'         }]],
        ['rhythm guitars',           [{ official: 'Rhythm Guitar',        bracket: 'Rhythm Guitars'       }]],
        ['classical guitars',        [{ official: 'Classical Guitar',     bracket: 'Classical Guitars'    }]],
        ['slide guitars',            [{ official: 'Slide Guitar',         bracket: 'Slide Guitars'        }]],
        ['steel guitars',            [{ official: 'Steel Guitar',         bracket: 'Steel Guitars'        }]],
        ['lap steel guitars',        [{ official: 'Lap Steel Guitar',     bracket: 'Lap Steel Guitars'    }]],
        ['pedal steel guitars',      [{ official: 'Pedal Steel Guitar',   bracket: 'Pedal Steel Guitars'  }]],
        ['fretless guitars',         [{ official: 'Fretless Guitar',      bracket: 'Fretless Guitars'     }]],
        ['twelve-string guitars',    [{ official: 'Twelve-String Guitar', bracket: 'Twelve-String Guitars'}]],
        ['electric basses',          [{ official: 'Electric Bass',        bracket: 'Electric Basses'      }]],
        ['acoustic basses',          [{ official: 'Acoustic Bass',        bracket: 'Acoustic Basses'      }]],
        ['fretless basses',          [{ official: 'Fretless Bass',        bracket: 'Fretless Basses'      }]],
        ['synth basses',             [{ official: 'Synth Bass',           bracket: 'Synth Basses'         }]],
        ['grand pianos',             [{ official: 'Grand Piano',          bracket: 'Grand Pianos'         }]],
        ['upright pianos',           [{ official: 'Upright Piano',        bracket: 'Upright Pianos'       }]],
        ['electric pianos',          [{ official: 'Electric Piano',       bracket: 'Electric Pianos'      }]],
        ['electric organs',          [{ official: 'Electric Organ',       bracket: 'Electric Organs'      }]],
    ]);
    function getCompound(key) {
        return COMPOUND_ROLE_EXPANSIONS.get(key)
            ?? COMPOUND_ROLE_EXPANSIONS.get(key.replace(/\s+by$/i, '').trimEnd());
    }
    function normalizeCreditRole(raw) {
        let s = raw.trim();
        s = s.replace(/^:\s*/, '');
        s = s.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
        s = s.replace(/^['"\u2018\u2019\u201c\u201d][^'"\u2018\u2019\u201c\u201d]*['"\u2018\u2019\u201c\u201d]\s*/g, '');
        s = s.replace(/\s+on\s+['"\u2018\u2019\u201c\u201d][^'"\u2018\u2019\u201c\u201d]*['"\u2018\u2019\u201c\u201d]/gi, '');
        s = s.replace(/\s+on\s+[\d,\-]+/gi, '');
        s = s.replace(/\s+of\s+\S.*$/gi, '');
        s = s.replace(/\s+in\s+\S.*$/gi, '');
        s = s.replace(/\s*\(\s*[Tt]racks?\s+[\d\s,\-\u2013]+\)/g, '');
        s = s.replace(/\s*\(\s*(?:original|additional|session|bonus|remix)\s+tracks?\s*\)/gi, '');
        s = s.replace(/\s*\(([^)]*)\)/g, (match, inner) => {
            const t = inner.trim();
            if (/^(?:original(?:ly)?|remix(?:ed)?|session|additional|add(?:'t|\.t|`t|t|\.)|live|acoustic|alternate|bonus|extended|instrumental|edit|radio\s+edit|re)$/i.test(t)) return match;
            return '';
        });
        const _origSuffixM = s.match(/\s+(original(?:ly)?)$/i);
        const hadOriginalSuffix = !!_origSuffixM;
        if (_origSuffixM) s = s.slice(0, s.length - _origSuffixM[0].length);
        s = s.trim();
        const compound = getCompound(s.toLowerCase().replace(/\s+/g, ' '));
        if (compound) return compound.map(e => typeof e === 'string' ? { official: e, bracket: null } : e);
        const allPrefix = /^(?:(?:all\s+)?(?:all\s+original\s+)?(?:music|songs?|tracks?)|album|remixes?|original(?:ly)?|cover|additional|add(?:'t|\.t|`t|t|\.)|session)\s+/i;
        let sStripped = s;
        while (allPrefix.test(sStripped)) sStripped = sStripped.replace(allPrefix, '').trim();
        sStripped = sStripped.replace(/\s*,?\s*\b(?:on|for)\s+(?:(?:CD|disc|vinyl|tape|side|lp|ep)\s+\w+\s+)?(?:tracks?\s+)?[\d\s,&\-\u2013]+(?:\s+and\s+\d+)?\s*$/gi, '').trim();
        const _instRecM = sStripped.match(/^(.+?)\s+recorded(?:\s+by)?$/i);
        if (_instRecM) {
            const inst = _instRecM[1].trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase());
            return { official: 'Recorded By', bracket: inst };
        }
        const _instPerfM = sStripped.match(/^(.+?)\s+performed(?:\s+by)?$/i);
        if (_instPerfM) {
            const inst = _instPerfM[1].trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase());
            return { official: inst, bracket: 'Performed' };
        }
        const _createdM = sStripped.match(/^(.+?)\s+created(?:\s+by)?$/i);
        if (_createdM) {
            const prefix = _createdM[1].trim();
            const _prefixRole = normalizeCreditRole(prefix);
            if (_prefixRole) {
                const prefixTitled = prefix.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase());
                return { official: prefixTitled, bracket: 'Created' };
            }
        }
        const _logoM = sStripped.match(/^logo\s+(.+?)(?:\s+by)?$/i);
        if (_logoM) {
            const qual = _logoM[1].trim();
            const qualTitled = qual.charAt(0).toUpperCase() + qual.slice(1).toLowerCase();
            return { official: 'Logo', bracket: qualTitled };
        }
        let official = null;
        for (const [re, off] of CREDIT_ROLE_MAP) {
            if (re.test(sStripped)) { official = off; break; }
        }
        if (!official) {
            const sLow = sStripped.toLowerCase();
            const exact = DISCOGS_OFFICIAL_CREDITS.get(sLow) || DISCOGS_OFFICIAL_CREDITS.get(sLow + ' by');
            if (exact) official = exact;
        }
        if (!official) {
            let fb = sStripped;
            const fbWordCount = sStripped.trim().split(/\s+/).length;
            while (fbWordCount <= 5 && fb.includes(' ')) {
                fb = fb.replace(/^\S+\s+/, '');
                const _logoFbM = fb.match(/^logo\s+(.+?)(?:\s+by)?$/i);
                if (_logoFbM) {
                    const qual = _logoFbM[1].trim();
                    return { official: 'Logo', bracket: qual.charAt(0).toUpperCase() + qual.slice(1).toLowerCase() };
                }
                const fbCompound = getCompound(fb.toLowerCase().replace(/\s+/g, ' '));
                if (fbCompound) return fbCompound.length === 1 ? fbCompound[0] : fbCompound;
                for (const [re, off] of CREDIT_ROLE_MAP) { if (re.test(fb)) { official = off; sStripped = fb; break; } }
                if (official) break;
                const fbLow = fb.toLowerCase();
                const ex = DISCOGS_OFFICIAL_CREDITS.get(fbLow) || DISCOGS_OFFICIAL_CREDITS.get(fbLow + ' by');
                if (ex) { official = ex; sStripped = fb; break; }
            }
            if (!official) {
                const fbFinalCompound = getCompound(fb.toLowerCase().replace(/\s+/g, ' '));
                if (fbFinalCompound) return fbFinalCompound.length === 1 ? fbFinalCompound[0] : fbFinalCompound;
                for (const [re, off] of CREDIT_ROLE_MAP) { if (re.test(fb)) { official = off; sStripped = fb; break; } }
                if (!official) {
                    const fbLow = fb.toLowerCase();
                    const ex = DISCOGS_OFFICIAL_CREDITS.get(fbLow) || DISCOGS_OFFICIAL_CREDITS.get(fbLow + ' by');
                    if (ex) { official = ex; sStripped = fb; }
                }
            }
        }
        if (!official) return null;
        const cLow = sStripped.toLowerCase();
        const oBase = official.toLowerCase().replace(/[- ]by$/, '').replace(/-/g, ' ');
        const isStemVariant = (official === 'Cover' && /^cover\s+art(?:work)?$/i.test(s))
            || (official === 'Instruments' && /^all\s+instruments?(?:\s+by)?$/i.test(s));
        const strippedPrefix = sStripped !== s;
        const _origPrefixM = s.match(/^(original(?:ly)?)\s+/i);
        const hadOriginalPrefix    = !!_origPrefixM || hadOriginalSuffix
            || (strippedPrefix && /\boriginal\b/i.test(s.slice(0, s.length - sStripped.length)));
        const _origWord = (_origPrefixM?.[1] || _origSuffixM?.[1] || 'Original');
        const _origBracket = _origWord.charAt(0).toUpperCase() + _origWord.slice(1).toLowerCase();
        const hadAdditionalPrefix  = /^additional\s+/i.test(s);
        const _addtPrefixM = s.match(/^(add(?:'t|\.t|`t|t|\.))\s+/i);
        const hadAddtPrefix = !!_addtPrefixM && !hadAdditionalPrefix;
        const hadSessionPrefix     = /^session\s+/i.test(s);
        const hadAssistantPrefix   = /^assistants?\s+|^assisting\s+/i.test(s);
        const _strippedPfxWords = strippedPrefix ? s.slice(0, s.length - sStripped.length).trim() : '';
        const _knownModPfx = /^(?:additional|original(?:ly)?|assistant|session|add(?:'t|\.t|`t|t|\.)|co[-\s]?)$/i;
        const _hasProperNounStrip = strippedPrefix && _strippedPfxWords.split(/\s+/).some(
            w => /^\p{Lu}/u.test(w) && !_knownModPfx.test(w));
        const bracketSrc = strippedPrefix && !_hasProperNounStrip ? s : strippedPrefix ? sStripped : null;
        const bracketSrcLow = bracketSrc ? bracketSrc.toLowerCase() : null;
        const matchesBase = cLow === official.toLowerCase() || cLow === oBase || isStemVariant;
        const _addtPfxWord = hadAddtPrefix ? (_addtPrefixM[1].charAt(0).toUpperCase() + _addtPrefixM[1].slice(1).toLowerCase()) : null;
        const _origBracketFull = (hadOriginalPrefix && !matchesBase && sStripped)
            ? _origBracket + ' ' + sStripped.charAt(0).toUpperCase() + sStripped.slice(1).toLowerCase()
            : _origBracket;
        const forcedBracket = hadOriginalPrefix ? _origBracketFull
            : hadAddtPrefix ? (matchesBase ? _addtPfxWord : _addtPfxWord + ' ' + sStripped.charAt(0).toUpperCase() + sStripped.slice(1).toLowerCase())
            : hadAssistantPrefix ? (matchesBase ? 'Assistant' : 'Assistant ' + sStripped.charAt(0).toUpperCase() + sStripped.slice(1).toLowerCase())
            : hadSessionPrefix ? 'Session'
            : (hadAdditionalPrefix && matchesBase) ? 'Additional'
            : null;
        const trimSharedPrefix = (bracketText) => {
            if (!bracketText) return bracketText;
            const offWords = official.toLowerCase().split(/\s+/);
            const bWords   = bracketText.split(/\s+/);
            let i = 0;
            while (i < bWords.length && i < offWords.length && bWords[i].toLowerCase() === offWords[i]) i++;
            const trimmed = bWords.slice(i).join(' ');
            return trimmed || bracketText;
        };
        const bracket = forcedBracket
            ? forcedBracket
            : matchesBase
                ? null
                : strippedPrefix
                    ? (bracketSrcLow === official.toLowerCase() || bracketSrcLow === oBase ? (hadAdditionalPrefix ? 'Additional' : null) : trimSharedPrefix(bracketSrc.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase())))
                    : trimSharedPrefix(s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase()));
        return { official, bracket };
    }
    function formatTrackPositions(positions) {
        const nums   = [...new Set(positions.filter(p => typeof p === 'number'))].sort((a,b) => a-b);
        const alphas = [...new Set(positions.filter(p => typeof p === 'string'))].sort();
        const parts = [];
        let i = 0;
        while (i < nums.length) {
            let j = i;
            while (j + 1 < nums.length && nums[j+1] === nums[j] + 1) j++;
            if (j - i >= 2) {
                parts.push(nums[i] + ' to ' + nums[j]);
            } else {
                for (let k = i; k <= j; k++) parts.push(String(nums[k]));
            }
            i = j + 1;
        }
        parts.push(...alphas);
        return parts.join(', ');
    }
    function parseCreditLines(lines) {
        const results = [];
        lines = lines.flatMap(l => {
            if (!/\.\s+[A-Z\[]/.test(l)) return [l];
            const segs = l.split(/\.\s+(?=[A-Z\[])/);
            if (segs.length > 1) {
                if (segs.every(s => /\bby\b/i.test(s))) {
                    const numPrefixM = segs[0].match(/^((?:[A-Za-z]\d+|\d)[\w,\s\-]*)(?=\s+[A-Za-z])/);
                    if (numPrefixM) return segs.map((seg, i) => i === 0 ? seg : numPrefixM[1].trim() + ' ' + seg);
                    return segs;
                }
                if (segs.every(s => /:/.test(s))) return segs;
                if ((l.match(/\bby\b/gi) || []).length >= 2) return segs;
                if (segs.some((s, i) => i > 0 && s.trim().startsWith('['))) return segs;
            }
            return [l];
        });
        lines = lines.flatMap(l => {
            const exceptM = l.match(/\bexcept\b(.*)/i);
            if (!exceptM) return [l];
            const tail = exceptM[1];
            const extra = [];
            const knownRoleKw = 'written|vocalized|vocalize|composed|lyrics|music|arranged|produced|mastered|mixed|performed|sung|played|recorded|engineered|edited|programmed|designed|illustrated|photographed|artwork|remixed';
            const rolePosRe = new RegExp(`\\b(${knownRoleKw})\\s+by\\s+`, 'gi');
            const stopRe = new RegExp(`\\s*/\\s*|\\s+(?:${knownRoleKw})\\s+by\\s`, 'i');
            const beforeExcept = l.slice(0, l.search(/\bexcept\b/i)).trim().replace(/[.,;]+$/, '').trim();
            const inheritedRoleM = beforeExcept.match(new RegExp(`\\b(${knownRoleKw})\\s+by\\b`, 'i'));
            const inheritedRole = inheritedRoleM ? inheritedRoleM[1].toLowerCase() : null;
            const exceptClauses = tail.split(/\s*(?:,\s*and|\s+and|,)\s+(?=(?:tracks?\s+)?\d)/i);
            for (const clause of exceptClauses) {
                const trackNumM = clause.match(/^\s*(?:tracks?\s+)?(\d+(?:\s*[-,]\s*\d+)*)\s+/i);
                const trackPrefix = trackNumM ? trackNumM[1].trim() + ' ' : '';
                const roleBody = trackNumM ? clause.slice(trackNumM[0].length) : clause.trim();
                let foundRole = false;
                let m;
                rolePosRe.lastIndex = 0;
                while ((m = rolePosRe.exec(roleBody)) !== null) {
                    const afterBy = roleBody.slice(m.index + m[0].length);
                    const stopIdx = afterBy.search(stopRe);
                    const nameStr = (stopIdx === -1 ? afterBy : afterBy.slice(0, stopIdx)).trim().replace(/[.,;]+$/, '');
                    if (nameStr) { extra.push(`${trackPrefix}${m[1].toLowerCase()} by ${nameStr}`); foundRole = true; }
                }
                if (!foundRole && inheritedRole) {
                    const bareByM = roleBody.match(/^by\s+(.+)/i);
                    if (bareByM) {
                        const nameStr = bareByM[1].trim().replace(/[.,;]+$/, '');
                        if (nameStr) extra.push(`${trackPrefix}${inheritedRole} by ${nameStr}`);
                    } else if (roleBody.trim()) {
                        const nameStr = roleBody.replace(/^by\s+/i, '').trim().replace(/[.,;]+$/, '');
                        if (nameStr) extra.push(`${trackPrefix}${inheritedRole} by ${nameStr}`);
                    }
                }
            }
            return [...(beforeExcept ? [beforeExcept] : []), ...extra];
        });
        for (let line of lines) {
            if (/^[©℗]/.test(line.trim())) continue;
            if (/@/.test(line) && !/\bby\b/i.test(line)) continue;
            const _bracketFirstM = line.trim().match(/^\[([^\]]+)\]\s*(.+)$/);
            line = /^\([A-Za-z]+\)\s*\w/.test(line.trim())
                ? line.trim()
                : line.replace(/^[^\p{L}\p{N}'"(]+/u, '').trim();
            if (!line) continue;
            if (/^released/i.test(line)) continue;
            if (/^(?:special\s+)?thanks?(?:\s+to)?[:\s]/i.test(line)) continue;
            if (/\bcopyright\b/i.test(line) && !/\bby\b/i.test(line)) continue;
            if (/\ball\s+rights?\s+reserved\b/i.test(line) || /^©/.test(line)) continue;
            if (!/\bby\b/i.test(line) && (
                /\bpublish(?:ing|er)?\b/i.test(line) ||
                /\((?:SOCAN|ASCAP|BMI|PRS|SESAC|APRA|SABAM|SACEM|GEMA|SIAE|JASRAC|BUMA|STEMRA|IMRO|SAMRO|NCB|CASH|ARTISJUS|AKM|SUISA|TEOSTO|STIM|KODA|TONO|MCPS|PPL|IFPI|SPA)\b/i.test(line)
            )) continue;
            if (/^[\w\s&,]+@\s+\w/i.test(line) && !/\bby\b/i.test(line)) continue;
            if (/^[^:\n]{1,60}:\s*(?:https?:\/\/|www\.)[\S]+/.test(line) && !/\bby\b/i.test(line)) continue;
            if (/\bannounces?\s+the\s+release\b/i.test(line) ||
                /\bset\s+for\s+release\b/i.test(line) ||
                /\blimited\s+edition\b/i.test(line) ||
                /\bfollowing\s+the\b/i.test(line) ||
                /\bdark\s+ambient\s+project\b/i.test(line) ||
                /\bcompilation\b.*\bfollowing\b/i.test(line)) continue;
            if (/^promo(?:tional)?\s+text\s*:/i.test(line) || /^notes?\s*:/i.test(line) || /^info\s*:/i.test(line)) continue;
            if (/:\s*$/.test(line) && !/\bby\b/i.test(line)) continue;
            const parseNames = (s) => {
                const cleaned = /:\S+:$/.test(s.trim()) ? s.trim() : s.replace(/\s*:(?:\s.*)?$/, '');
                const parts = [];
                const _csep = CONFIG.CREDIT_SEPARATOR_PATTERNS;
                const _csepHasComma  = _csep.includes(',');
                const _csepHasAmp    = _csep.includes('&');
                const _csepHasSlash  = _csep.includes('/');
                let depth = 0, buf = '';
                for (let ci = 0; ci < cleaned.length; ci++) {
                    const ch = cleaned[ci];
                    if (ch === '(') { depth++; buf += ch; }
                    else if (ch === ')') { depth = Math.max(0, depth - 1); buf += ch; }
                    else if (depth === 0 && _csepHasComma && /,/.test(ch)) { parts.push(buf.trim()); buf = ''; }
                    else if (depth === 0 && _csepHasAmp   && /&/.test(ch)) { parts.push(buf.trim()); buf = ''; }
                    else if (depth === 0 && _csepHasSlash && ch === '/') {
                        const prevCh = cleaned[ci - 1] || '';
                        const nextCh = cleaned[ci + 1] || '';
                        const spacedSlash = /\s/.test(prevCh) && /\s/.test(nextCh);
                        const bufTrim = buf.trim();
                        const isAcronymSlash = /^[A-Z0-9]{1,4}$/.test(bufTrim.split(/\s+/).pop() || '') && /^[A-Z0-9]/.test(nextCh);
                        const noSpaceNameSlash = !spacedSlash && /[A-Za-z]/.test(prevCh) && /[A-Z]/.test(nextCh) && /[A-Za-z]{2,}/.test(bufTrim) && !isAcronymSlash;
                        if (spacedSlash || noSpaceNameSlash) { parts.push(buf.trim()); buf = ''; }
                        else buf += ch;
                    }
                    else if (depth === 0 && _csep.includes('and') && /\band\b/i.test(cleaned.slice(ci, ci + 3)) && /\s/.test(cleaned[ci - 1] || ' ') && /\s/.test(cleaned[ci + 3] || ' ')) {
                        parts.push(buf.trim()); buf = ''; ci += 2;
                    } else buf += ch;
                }
                if (buf.trim()) parts.push(buf.trim());
                const _splitParts = [];
                for (const _p of parts) {
                    let _segs = [_p];
                    const _symSplitters = CONFIG.CREDIT_SEPARATOR_PATTERNS.filter(t => !isAlphaToken(t) && t !== ',' && t !== '&' && t !== '/');
                    for (const sym of _symSplitters) {
                        const re = new RegExp(`\\s*${escapeRegExp(sym)}\\s*`, 'g');
                        _segs = _segs.flatMap(seg => seg.split(re).map(s => s.trim()).filter(Boolean));
                    }
                    const _wordSplitters = [
                        ...CONFIG.CREDIT_SEPARATOR_PATTERNS.filter(t => isAlphaToken(t) && t.length > 1),
                        ...CONFIG.FEATURING_PATTERNS.filter(t => isAlphaToken(t))
                    ];
                    if (_wordSplitters.length) {
                        const _wordRe = new RegExp(`(?<=\\s|^)(?:${_wordSplitters.map(escapeRegExp).join('|')})\\.?(?=\\s|$)`, 'gi');
                        _segs = _segs.flatMap(seg => seg.split(_wordRe).map(s => s.trim()).filter(Boolean));
                    }
                    _splitParts.push(..._segs);
                }
                return _splitParts
                .filter(n => n.length >= 1 && (n.length > 1 || /^[A-Z0-9]/.test(n)) && !/^v\.?a\.?$|^various(\s+artists?)?$/i.test(n))
                .filter(n => {
                    const t = n.trim();
                    if (!t.includes(' ')) return !normalizeCreditRole(t);
                    const compound = getCompound(t.toLowerCase().replace(/\s+/g, ' '));
                    if (compound) return false;
                    const sNormDirect = t.toLowerCase().replace(/[.,;]+$/, '');
                    if (DISCOGS_OFFICIAL_CREDITS.get(sNormDirect) || DISCOGS_OFFICIAL_CREDITS.get(sNormDirect + ' by')) return false;
                    if (/^.+?\s+recorded(?:\s+by)?$/i.test(t)) return false;
                    if (/^.+?\s+performed(?:\s+by)?$/i.test(t)) return false;
                    return true;
                })
                .filter(n => !/^in\s/i.test(n.trim()) && !/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*\([A-Z]{2,3}\)$/.test(n.trim()))
                .filter(n => !/^(?:live|studio|live\s+at|online|remote|digital|worldwide)$/i.test(n.trim()))
                .filter(n => {
                    const _byM = n.trim().match(/^(.+?)\s+\bby\b\s+\S/i);
                    if (_byM && normalizeCreditRole(_byM[1].trim())) return false;
                    return true;
                });
            };
            const _roleKwPat = 'writ(?:ten|ing)|mix(?:ed|ing)|master(?:ed|ing)|produc(?:ed|ing|tion)|record(?:ed|ing)|engineer(?:ed|ing)|arrang(?:ed|ing|ement)|programm(?:ed|ing)';
            const _roleKwSpaceRe = new RegExp(`\\b(${_roleKwPat})\\s+(${_roleKwPat})\\b`, 'gi');
            const preNorm = (s) => {
                s = s
                    .replace(/\ball\s+original\b\s*/gi, 'all original ')
                    .replace(/\b(?:words?\s*(?:[&]|and)\s*music|music\s*(?:[&]|and)\s*words?)(?=\s*,|\s*$)/gi, 'words, music')
                    .replace(/\b(vocals?|lyrics|mixing|mastering|production|arrangement|sequencing|sampling|recording|editing|engineering|writ(?:ten|ing)|produc(?:ed|tion))\s+and\s+(vocals?|lyrics|mixing|mastering|production|arrangement|sequencing|sampling|recording|editing|engineering|writ(?:ten|ing)|produc(?:ed|tion))\b/gi, '$1, $2')
                    .replace(/^album\s+/gi, '');
                let prev;
                do { prev = s; s = s.replace(_roleKwSpaceRe, '$1, $2'); } while (s !== prev);
                return s;
            };
            const parseRoles = (s) => {
                const wpResult = [];
                const sRaw = s.trim().replace(/[.,;]+$/, '');
                const _parenExpM = sRaw.match(/^(.+?)\s*\(\s*(?:and\s+)?(.+?)\s*\)$/i);
                if (_parenExpM) {
                    const outerPart = _parenExpM[1].trim();
                    const innerPart = _parenExpM[2].trim();
                    const _looksLikeRoles = /^[a-z]/.test(innerPart)
                        || /^(?:and\s+)?(?:composition|production|mixing|mastering|lyrics|vocals?|writing|recording|engineering|arrangement|programming|cover\s+photo|photography|font|design|artwork)/i.test(innerPart);
                    if (_looksLikeRoles) {
                        const innerPieces = innerPart.split(/,\s*|\s+and\s+/i).map(p => p.trim()).filter(Boolean);
                        const innerResolved = innerPieces.flatMap(p => {
                            const x = normalizeCreditRole(p);
                            return Array.isArray(x) ? x : x ? [x] : [];
                        });
                        if (innerResolved.length > 0) {
                            const oxRaw = normalizeCreditRole(outerPart);
                            const outerResolved = !oxRaw ? [] : (Array.isArray(oxRaw) ? oxRaw : [oxRaw]);
                            const _genericContainers = new Set(['music by', 'music', 'cover', 'artwork']);
                            const outerIsGeneric = outerResolved.length === 1
                                && _genericContainers.has((outerResolved[0].official || outerResolved[0]).toLowerCase().replace(/ by$/, ''));
                            if (outerResolved.length > 0) {
                                const outerOfficial = (outerResolved[0].official || outerResolved[0]).toLowerCase();
                                if (outerOfficial === 'cover') {
                                    return [...outerResolved, ...innerResolved];
                                } else if (outerIsGeneric) {
                                    return innerResolved;
                                } else {
                                    return [...outerResolved, ...innerResolved];
                                }
                            }
                            const combined = getCompound((outerPart + ' and ' + innerPart).toLowerCase().replace(/\s+/g, ' '));
                            if (combined) return combined.map(e => typeof e === 'string' ? { official: e, bracket: null } : e);
                        }
                    }
                }
                const sRawKey = sRaw.toLowerCase().replace(/\s+/g, ' ');
                const _allPfxRe = /^(?:(?:all\s+)?(?:all\s+original\s+)?(?:music|songs?|tracks?)|album|remixes?|original(?:ly)?|cover|additional|add(?:'t|\.t|`t|t|\.)|session)\s+/i;
                let sRawKeyStripped = sRawKey.replace(/^all\s+(?:tracks?|songs?)\s+(?:are|were|have\s+been)\s+/, '');
                while (_allPfxRe.test(sRawKeyStripped)) sRawKeyStripped = sRawKeyStripped.replace(_allPfxRe, '').trim();
                const rawCompound = getCompound(sRawKey) || getCompound(sRawKeyStripped);
                if (rawCompound) return rawCompound.map(e => typeof e === 'string' ? { official: e, bracket: null } : e);
                const sNorm = preNorm(s).trim().replace(/[.,;]+$/, '')
                    .replace(/\.\s+/g, ', ')
                    .replace(/\s*\/\s*/g, ', ');
                const sNormKey = sNorm.toLowerCase().replace(/\s+/g, ' ')
                    .replace(/^all\s+(?:tracks?|songs?)\s+(?:are|were|have\s+been)\s+/, '');
                let sNormKeyStripped = sNormKey;
                while (_allPfxRe.test(sNormKeyStripped)) sNormKeyStripped = sNormKeyStripped.replace(_allPfxRe, '').trim();
                const wholeCompound = getCompound(sNormKey) || getCompound(sNormKeyStripped) || getCompound(sNorm.toLowerCase().replace(/\s+/g, ' '));
                if (wholeCompound) return wholeCompound.map(e => typeof e === 'string' ? { official: e, bracket: null } : e);
                const wpHandled = sNorm.replace(/\bW\s*[&+]\s*P\b/gi, () => {
                    wpResult.push(
                        { official: 'Written-By', bracket: 'W' },
                        { official: 'Producer',   bracket: 'P' }
                    );
                    return '';
                }).trim().replace(/^[,\s]+|[,\s]+$/g, '');
                const rest = wpHandled
                    ? splitOutsideQuotes(wpHandled)
                          .flatMap(r => { const x = normalizeCreditRole(r); return Array.isArray(x) ? x : x ? [x] : []; })
                    : [];
                return [...wpResult, ...rest];
            };
            const toRoleStr = (r) => r.bracket ? `${r.official} [${r.bracket}]` : r.official;

            const prefixNums = [];
            const _posTok  = '(?:[A-Za-z]\\d+|\\d+)';
            const _posRange = `${_posTok}[-\\u2013]${_posTok}`;
            const _posUnit  = `(?:${_posRange}|${_posTok})`;
            const _posSep   = `(?:[\\s,\\|+]+|\\s*(?:&|and)\\s*)`;
            const _posList  = `(${_posUnit}(?:${_posSep}${_posUnit})*)`;
            const prefixRe = new RegExp(
                `^(?:(?:Tracks?|Tacks?|Tracsk?|Traks?|Trakcs?|Trcaks?|Tarck s?)\\s+)?${_posList}\\s+(?=\\S)`, 'i'
            );
            const prefixM = line.match(prefixRe);
            if (prefixM) {
                (prefixM[1].match(/[A-Za-z]\d+|\d+(?:[-\u2013]\d+)?/g) || []).forEach(tok => {
                    if (/^[A-Za-z]/.test(tok)) {
                        prefixNums.push(tok.toUpperCase());
                    } else {
                        const p = tok.split(/[-\u2013]/);
                        if (p.length === 2) { for (let x = +p[0]; x <= +p[1]; x++) prefixNums.push(x); }
                        else prefixNums.push(+p[0]);
                    }
                });
                line = line.slice(prefixM[0].length);
            }
            line = line.replace(/\s*\(\s*(?:(?:Tracks?|Tacks?|Tracsk?|Traks?|Trakcs?|Trcaks?|Tarck s?))\s+([\d\s,\-\u2013]+)\)/gi, (_, g) => {
                (g.match(/\d+(?:\s*[-\u2013]\s*\d+)?/g) || []).forEach(tok => {
                    const p = tok.split(/\s*[-\u2013]\s*/);
                    if (p.length === 2) { for (let x = +p[0]; x <= +p[1]; x++) prefixNums.push(x); }
                    else prefixNums.push(+p[0]);
                }); return '';
            });

            const splitNameClauses = (namePart) => {
                const _roleWordRe2 = /\b(?:lyrics?|vocals?|voices?|music|mix(?:ed|ing)?|master(?:ed|ing)?|produc(?:ed|tion|ing)?|record(?:ed|ing)?|engineer(?:ed|ing)?|arrang(?:ed|ing|ement)?|programm(?:ed|ing)?|additional|backing|lead|performed|composed|written|artwork|design|photogr\w*|illustr\w*|remix(?:ed)?|editing|manipulat\w*)\b/i;

                let bestSplitPos = -1, bestSplitAfter = null;

                let _depth = 0;
                for (let _i = 0; _i < namePart.length; _i++) {
                    const _ch = namePart[_i];
                    if (_ch === '(') _depth++;
                    else if (_ch === ')') _depth = Math.max(0, _depth - 1);
                    else if (_ch === ',' && _depth === 0) {
                        const _after = namePart.slice(_i + 1).replace(/^\s+/, '');
                        const _byM   = _after.match(/\bby\b/i);
                        if (_byM && _byM.index > 0) {
                            const _sentEnd = _after.search(/\.\s+[A-Z]/);
                            const _candEnd = _sentEnd >= 0 ? Math.min(_byM.index, _sentEnd) : _byM.index;
                            const _pure    = _after.slice(0, _candEnd).trim();
                            if (_roleWordRe2.test(_pure)) {
                                const _capWords = (_pure.match(/\b([A-Z][a-zA-ZÀ-ÿ]{1,})\b/g) || []);
                                const _nonRoleCaps = _capWords.filter(w => !_roleWordRe2.test(w));
                                if (!_nonRoleCaps.length) {
                                    bestSplitPos   = _i;
                                    bestSplitAfter = _after;
                                    break;
                                }
                            }
                        }
                    } else if (/[-\u2013\u2014]/.test(_ch) && _depth === 0) {
                        const _afterDash = namePart.slice(_i + 1).replace(/^\s*/, '');
                        const _byM = _afterDash.match(/\bby\b/i);
                        if (_byM && _byM.index > 0) {
                            const _pure = _afterDash.slice(0, _byM.index).trim();
                            if (_roleWordRe2.test(_pure)) {
                                const _capWords = (_pure.match(/\b([A-Z][a-zA-ZÀ-ÿ]{1,})\b/g) || []);
                                const _nonRoleCaps = _capWords.filter(w => !_roleWordRe2.test(w));
                                if (!_nonRoleCaps.length && (bestSplitPos < 0 || _i < bestSplitPos)) {
                                    bestSplitPos   = _i;
                                    bestSplitAfter = _afterDash;
                                }
                            }
                        }
                    }
                }

                const _sentByRe = /\.\s+(?=[\w][\w\s\-]{0,80}\bby\b)/i;
                const _sentM = _sentByRe.exec(namePart);
                if (_sentM && (bestSplitPos < 0 || _sentM.index < bestSplitPos)) {
                    bestSplitPos   = _sentM.index;
                    bestSplitAfter = namePart.slice(_sentM.index + _sentM[0].length);
                }

                if (bestSplitPos >= 0) return [namePart.slice(0, bestSplitPos), bestSplitAfter];

                const _fallbackRe = /(?:\s+with\s+|\s*\/\s*|\s+(?=(?:remixed?|reworked?|rework|covered?|re-?edit(?:ed)?)\s+by\b))(?=[\w][\w\s\-]{0,80}\bby\b)/i;
                const _fM = _fallbackRe.exec(namePart);
                if (_fM) return [namePart.slice(0, _fM.index), namePart.slice(_fM.index + _fM[0].length)];

                return [namePart, null];
            };
            const cleanName = (s) => {
                const t = s.trim().replace(/^by[\s:]+/i, '').replace(/^:\s*/, '').replace(/[.,;]+$/, '')
                    .replace(/[©℗]\s*/g, '')
                    .replace(/\s+except\b.*/i, '')
                    .replace(/\s+at\s+\S.*$/gi, '')
                    .replace(/\s+@\s*\S.*$/g, '')
                    .replace(/\s*\(@[^)]*\)/g, '')
                    .replace(/\s*\([^)]*\bby\b[^)]*\)/gi, '')
                    .replace(/\s+\(?\d{4}(?:\s*[-\u2013]\s*(?:\d{4}|present))?\)?\s*$/i, '')
                    .replace(/\s*\/\s*$/, '')
                    .replace(/\s+\b(?:in|at|on|from|since|between|during)\b\s*$/i, '')
                    .replace(/^((?:\S+\s+){1,}\S+?)\s+\bin\b\s+\S.*$/i, '$1')
                    .trim();
                if (/^@/.test(t) || /^in\s/i.test(t) || /^at\s/.test(t) || /^on\s+tracks?\b/i.test(t)) return '';
                if (/^\[[A-Z]{1,6}\]$/.test(t)) return '';
                if (/^\d{4}(?:[-\u2013]\d{2,4})*$/.test(t) || /^\d{4}-\d{2}-\d{2}$/.test(t)) return '';
                return t;
            };

            const extractTrackPos = (roleStr) => {
                const atNumTitleRe = /\s*\bat\s+(\d+)\b\.?\s+[A-Z].*/g;
                const nums = [...prefixNums];
                let s1 = roleStr.replace(atNumTitleRe, (_, n) => { nums.push(+n); return ' '; });
                const trackParenRe = /\s*\(\s*[Tt]racks?\s+([\d\s,&\-\u2013]+)\)/g;
                s1 = s1.replace(trackParenRe, (_, g) => {
                    (g.match(/\d+(?:[\-\u2013]\d+)?/g) || []).forEach(tok => {
                        const p = tok.split(/[\-\u2013]/);
                        if (p.length === 2) { for (let x = +p[0]; x <= +p[1]; x++) nums.push(x); }
                        else nums.push(+p[0]);
                    }); return ' ';
                });
                const re = /\s*,?\s*\b(?:on|for)\s+(?:(?:CD|disc|vinyl|tape|side|lp|ep)\s+\w+\s+)?(?:tracks?\s+)?((?:(?:[A-Za-z]\d+|\d+)(?:[\-\u2013](?:[A-Za-z]\d+|\d+))?[\s,\/&]*(?:\band\b\s*)?)+)/gi;
                const clean = s1.replace(re, (match, g) => {
                    (g.match(/[A-Za-z]\d+|\d+(?:[\-\u2013]\d+)?/g) || []).forEach(tok => {
                        if (/^[A-Za-z]/.test(tok)) {
                            nums.push(tok.toUpperCase());
                        } else {
                            const p = tok.split(/[\-\u2013]/);
                            if (p.length === 2) { for (let x = +p[0]; x <= +p[1]; x++) nums.push(x); }
                            else nums.push(+p[0]);
                        }
                    }); return match.includes(',') ? ', ' : ' ';
                });
                return { clean: clean.trim().replace(/^,\s*|,\s*$/g, '').replace(/\s+/g, ' '), positions: nums.length ? formatTrackPositions(nums) : null };
            };
            const processClause = (roleStr, nameStr) => {
                const roleStrClean = roleStr.replace(/\s*@\s*\S.*$/g, '').trim();
                const { clean: cleanRole, positions: rolePositions } = extractTrackPos(roleStrClean);
                const { clean: cleanedNameStr, positions: namePositions } = extractTrackPos(nameStr);
                const positions = rolePositions || namePositions
                    ? [...(rolePositions ? rolePositions.split(', ') : []), ...(namePositions ? namePositions.split(', ') : [])].filter((v,i,a) => a.indexOf(v)===i).join(', ') || null
                    : null;
                const r = parseRoles(cleanRole).filter(role =>
                    !(role.official === 'Remix' && !role.bracket)
                );
                const n = parseNames(cleanName(cleanedNameStr));
                if (r.length > 0 && n.length > 0) {
                    for (const name of n) {
                        const parenM = name.replace(/[\u200b\u200c\u200d\u200e\u200f\u00ad\ufeff\u2060\u180e]/g, '').trim().match(/^(.+?)\s*\(([^()]+)\)\s*$/);
                        if (parenM) {
                            const baseName = parenM[1].trim();
                            const extraRoles = parseRoles(parenM[2].trim()).filter(role => !(role.official === 'Remix' && !role.bracket));
                            if (extraRoles.length > 0 && baseName) {
                                results.push({ name: baseName, roles: r.map(toRoleStr), trackPositions: positions });
                                results.push({ name: baseName, roles: extraRoles.map(toRoleStr), trackPositions: positions });
                                continue;
                            }
                        }
                        results.push({ name: name.trim(), roles: r.map(toRoleStr), trackPositions: positions });
                    }
                }
            };

            if (_bracketFirstM && !/\breleased?\s+by\b/i.test(_bracketFirstM[1])) {
                processClause(_bracketFirstM[1], _bracketFirstM[2]);
                continue;
            }
            const byMatch = line.match(/^(.+?)\bby\b(.+)$/i);
            if (byMatch) {
                let currentRoles = byMatch[1];
                const _titleColonM = currentRoles.match(/^(.+?)\s*:\s*(.+?)\s*$/);
                if (_titleColonM) {
                    const _titleNoParen = _titleColonM[1].trim().replace(/\s*\([^)]*\)/g, '').trim();
                    if (!parseRoles(_titleNoParen).length) {
                        currentRoles = _titleColonM[2];
                    } else if (parseRoles(_titleColonM[2].trim()).length) {
                        currentRoles = _titleColonM[2];
                    }
                }
                let remaining = byMatch[2];
                while (remaining !== null) {
                    const [namePart, rest] = splitNameClauses(remaining);
                    processClause(currentRoles, namePart);
                    if (rest) {
                        const nextBy = rest.match(/^(.+?)\bby\b(.+)$/i);
                        if (nextBy) { currentRoles = nextBy[1]; remaining = nextBy[2]; }
                        else break;
                    } else break;
                }
            } else {
                const artistParenRolesM = line.match(/^([^()\[\]]{1,60}?)\s*\(([^()]+)\)\s*$/);
                if (artistParenRolesM && !normalizeCreditRole(artistParenRolesM[1].trim())) {
                    const r = parseRoles(artistParenRolesM[2].trim());
                    const n = parseNames(cleanName(artistParenRolesM[1].trim()));
                    if (r.length > 0 && n.length > 0) {
                        for (const name of n) results.push({ name: name.trim(), roles: r.map(toRoleStr) });
                        continue;
                    }
                }
                const colonMatch = line.match(/^([^:\n]{1,60}):\s*(.+)$/);
                if (colonMatch) {
                    const rolesFirst = parseRoles(colonMatch[1]);
                    if (rolesFirst.length) {
                        processClause(colonMatch[1], colonMatch[2]);
                    } else {
                        const rolesSecond = parseRoles(colonMatch[2]);
                        if (rolesSecond.length) {
                            const names = parseNames(cleanName(colonMatch[1]));
                            for (const name of names) results.push({ name: name.trim(), roles: rolesSecond.map(toRoleStr) });
                        }
                    }
                } else {
                    const dashMatch = line.match(/^(.+?)\s*[-\u2013\u2014]\s+([A-Za-z].*\S)$/);
                    if (dashMatch) {
                        for (const [roleSide, nameSide] of [[dashMatch[2], dashMatch[1]], [dashMatch[1], dashMatch[2]]]) {
                            const roleStr = roleSide.replace(/\//g, ', ');
                            const { clean: cleanRole, positions } = extractTrackPos(roleStr);
                            const roles = parseRoles(cleanRole);
                            if (roles.length) {
                                const n = parseNames(cleanName(nameSide));
                                if (n.length > 0) {
                                    for (const name of n) results.push({ name: name.trim(), roles: roles.map(toRoleStr), trackPositions: positions });
                                    break;
                                }
                            }
                        }
                    } else {
                        const words = line.split(/\s+/);
                        const allPiecesMatch = (candidate) => {
                            if (normalizeCreditRole(candidate.trim())) return true;
                            const pieces = splitOutsideQuotes(candidate);
                            return pieces.length > 0 && pieces.every(p => !!normalizeCreditRole(p.trim()));
                        };
                        let bestRoles = [], bestNameStart = -1;
                        for (let wi = 1; wi < words.length; wi++) {
                            if (wi > 4) break;
                            const roleCandidate = words.slice(0, wi).join(' ');
                            if (/\bvia\b/i.test(roleCandidate)) break;
                            if (/@/.test(roleCandidate)) break;
                            const { clean: cleanRoleCandidate } = extractTrackPos(roleCandidate);
                            if (allPiecesMatch(cleanRoleCandidate)) {
                                const r = parseRoles(cleanRoleCandidate);
                                if (r.length > 0) { bestRoles = r; bestNameStart = wi; }
                            }
                        }
                        if (bestRoles.length && bestNameStart > 0) {
                            const rawNamePart = words.slice(bestNameStart).join(' ');
                            const firstNameWord = rawNamePart.trim().split(/\s+/)[0] || '';
                            const isSentenceFiller = /^(?:@|live|on|at|in|during|from|for|with|the|a|an|and|or|by|of|to|as|via|over|under|between|across|through|throughout|after|before|since|until|within|without)$/i.test(firstNameWord);
                            const startsLowercase = /^\p{Ll}/u.test(firstNameWord);
                            if (!isSentenceFiller && !startsLowercase) {
                                const namePart = cleanName(rawNamePart);
                                const n = parseNames(namePart);
                                if (n.length > 0) {
                                    const { positions } = extractTrackPos(words.slice(0, bestNameStart).join(' '));
                                    for (const name of n) results.push({ name: name.trim(), roles: bestRoles.map(toRoleStr), trackPositions: positions });
                                }
                            }
                        }
                    }
                }
            }
        }
        return results;
    }

    function parseBandcampCredits(doc) {
        const toLines = (el) => el.innerHTML
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
            .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/[\u200b\u200c\u200d\u200e\u200f\u00ad\ufeff\u2060\u180e]/g, '')
            .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
            .split('\n').map(l => l.trim()).filter(Boolean);

        const expandInlineTrackLists = (lines) => {
            const inlineRe = /,\s*(?=(?:(?:Tracks?|Tacks?|Tracsk?|Traks?|Trakcs?|Trcaks?|Tarck s?)\s+)?\d+\s+(?!\d|[&]|and\s).*?\bby\b)/i;
            return lines.flatMap(l => {
                if (!inlineRe.test(l)) return [l];
                const segs = l.split(inlineRe).map(s => s.trim()).filter(Boolean);
                if (segs.length > 1 && segs.slice(1).every(s => /\bby\b/i.test(s)) && /\bby\b/i.test(segs[0])) {
                    return segs;
                }
                return [l];
            });
        };

        const joinContinuations = (lines) => {
            const out = [];
            const trackPrefixRe = /^(?:(?:Tracks?|Tacks?|Tracsk?|Traks?|Trakcs?|Trcaks?|Tarck s?)\s+)?(?:[A-Za-z]\d+|\d)[\w,\s\|\/\-+]*(?:\s*(?:&|and)\s*(?:[A-Za-z]\d+|\d)[\w,\s\|\/\-+]*)*\s+/i;
            let lastTrackPrefix = '';
            let lastByHeaderRole = '';
            for (let i = 0; i < lines.length; i++) {
                const l = lines[i];
                const lCore = l.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/gu, '').trim();
                const prefixMatch = lCore.match(trackPrefixRe);
                if (prefixMatch && /\bby\b/i.test(lCore)) lastTrackPrefix = prefixMatch[0].trim() + ' ';
                else if (!prefixMatch && (!/\bby\b/i.test(lCore) || /^(?:all\s+(?:tracks?|songs?)\b|layout|design|artwork|pictures?|photography|photo|cover|(?:re-?)?master(?:ed|ing)?|mix(?:ed|ing)?|record(?:ed|ing)?|engineer)/i.test(lCore))) lastTrackPrefix = '';
                if (/\bby\b/i.test(lCore)) lastByHeaderRole = '';
                if (out.length && /,\s*$/.test(out[out.length - 1])) {
                    out[out.length - 1] = out[out.length - 1].replace(/,\s*$/, ', ') + lCore;
                } else if (out.length && /\bby\s*$/i.test(out[out.length - 1])) {
                    lastByHeaderRole = out[out.length - 1];
                    out[out.length - 1] = out[out.length - 1] + ' ' + lCore;
                } else if (lastByHeaderRole && !/\bby\b/i.test(lCore) && /^[\p{L}]/u.test(lCore) && !/@/.test(lCore)) {
                    out.push(lastByHeaderRole + ' ' + lCore);
                } else if (lastTrackPrefix && !prefixMatch && /\bby\b/i.test(lCore) && !/^[A-Z][a-z]+\s*(?:,|\s+[A-Z])/.test(lCore.replace(/^\d+\s+/, ''))) {
                    out.push(lastTrackPrefix + lCore);
                } else if (/^.+\s+on\s+tracks?\s*$/i.test(lCore) && !(/\bby\b/i.test(lCore))) {
                    const roleBase = lCore.replace(/\s+on\s+tracks?\s*$/i, '').trim();
                    let pendingNums = '';
                    let absorbed = false;
                    while (i + 1 < lines.length) {
                        const next = lines[i + 1].trim();
                        if (!next) break;
                        if (/^[\d,\s]+$/.test(next)) {
                            i++;
                            pendingNums += (pendingNums ? ', ' : '') + next.replace(/,\s*$/, '').trim();
                            absorbed = true;
                            continue;
                        }
                        const numsByM = next.match(/^([\d,\s]+)\s+by\s+(.+)$/i);
                        if (numsByM) {
                            i++;
                            const allNums = (pendingNums ? pendingNums + ', ' : '') + numsByM[1].replace(/,\s*$/, '').trim();
                            out.push(allNums + ' ' + roleBase + ' by ' + numsByM[2].trim());
                            pendingNums = '';
                            absorbed = true;
                            continue;
                        }
                        break;
                    }
                    if (!absorbed) out.push(l);
                } else if (/^.+\s+on\s*$/i.test(l) && !(/\bby\b/i.test(l))) {
                    const roleBase = lCore.replace(/\s+on\s*$/, '').trim();
                    const trackLineRe = /^((?:[A-Za-z]\d+|\d)[\w,\s|\/\-]*)\s+(?:by\s+)?(.+)$/i;
                    let absorbed = false;
                    while (i + 1 < lines.length) {
                        const next = lines[i + 1].trim();
                        if (!next) break;
                        const tm = next.match(trackLineRe);
                        if (!tm) break;
                        i++;
                        out.push(tm[1].trim() + ' ' + roleBase + ' by ' + tm[2].trim());
                        absorbed = true;
                    }
                    if (!absorbed) out.push(lCore);
                } else if (/\bby\s*:\s*$/i.test(lCore)) {
                    const base = lCore.replace(/:\s*$/, '');
                    const names = [];
                    while (i + 1 < lines.length) {
                        const next = lines[i + 1].trim();
                        if (!next || /\bby\b/i.test(next) || /^[^:]{1,60}:\s*.+$/.test(next) || /^released\b/i.test(next)) break;
                        i++;
                        names.push(lines[i].replace(/\s+on\s+[\d\s,|&\-]+$/i, '').trim());
                    }
                    out.push(names.length ? base + ' ' + names.join(', ') : lCore);
                } else {
                    const looksLikeName = !(/\bby\b/i.test(lCore)) && !(/[:\-\u2013\u2014]/.test(lCore)) && !/^\d/.test(lCore) && !/^released\b/i.test(lCore);
                    if (looksLikeName && i + 1 < lines.length) {
                        const next = lines[i + 1].trim();
                        const looksLikeRoleList = next && !(/\bby\b/i.test(next)) && !(/[:\-\u2013\u2014]/.test(next))
                            && /^[A-Za-z]/.test(next) && /,|&/.test(next);
                        if (looksLikeRoleList) {
                            i++;
                            out.push(next.replace(/[.,;]+$/, '') + ' by ' + lCore);
                        } else {
                            out.push(lCore);
                        }
                    } else {
                        out.push(lCore);
                    }
                }
            }
            return out;
        };

        const creditsEl = doc.querySelector('div.tralbumData.tralbum-credits');
        if (creditsEl) {
            const results = parseCreditLines(joinContinuations(expandInlineTrackLists(toLines(creditsEl))));
            if (results.length) return { credits: results, source: 'credits' };
        }

        const aboutEl = doc.querySelector('div.tralbumData.tralbum-about');
        if (aboutEl) {
            const aboutLines = joinContinuations(expandInlineTrackLists(toLines(aboutEl)));
            const creditLike = aboutLines.filter(l => {
                const hasCreditSignal = /\bby\s*:/i.test(l) || /^\[/.test(l.trim())
                    || /\]\s*by\b/i.test(l) || /\bexcept\b.*\bby\b/i.test(l)
                    || /^[^,\-]{1,40}\s*[-\u2013\u2014]\s*\w/.test(l.trim());
                if (l.length > 150 && !hasCreditSignal) return false;
                if (l.length > 100 && !hasCreditSignal && !/\b(?:writing|production|mixing|mastering|sampling|instruments?|vocals?|lyrics|arrangement|programming|engineering)\b/i.test(l)) return false;
                if (/\bby\b/i.test(l) && /\bby\s+(?:this|the|a|an|his|her|its|their|our|my|your|some|such|many|very|already|only|just|most|more|well|quite|so)\b/i.test(l)) return false;
                return true;
            });
            const results = parseCreditLines(creditLike);
            if (results.length) return { credits: results, source: 'about' };
        }
        return { credits: [], source: 'none' };
    }

    function mergeCreditsForApply(credits) {
        const mergeMap = new Map();
        const mergeOrder = [];
        const parseNums = (pos) => {
            if (!pos) return [];
            return pos.split(/[\s,]+/).filter(Boolean).map(t => /^[A-Za-z]\d+$/.test(t) ? t.toUpperCase() : (/^\d+$/.test(t) ? Number(t) : null)).filter(p => p !== null);
        };
        for (const credit of credits) {
            const key = credit.name.trim().toLowerCase() + '|' + [...credit.roles].sort().join(',');
            const incomingNums = parseNums(credit.trackPositions);
            if (mergeMap.has(key)) {
                const existing = mergeMap.get(key);
                if (incomingNums.length > 0 && existing._nums.length > 0) {
                    const allNums = [...existing._nums, ...incomingNums];
                    existing._nums = [...new Set(allNums)];
                    existing.trackPositions = formatTrackPositions(existing._nums);
                } else if (incomingNums.length > 0 || existing._nums.length === 0) {
                    const entry = { ...credit, _nums: incomingNums };
                    mergeOrder.push(entry);
                }
            } else {
                const entry = { ...credit, _nums: incomingNums };
                mergeMap.set(key, entry);
                mergeOrder.push(entry);
            }
        }
        return mergeOrder;
    }
    async function wiApplyReleaseCredits(credits, wiFields, addedCreditRemoveBtns, appendOnly = false) {
        if (!credits || credits.length === 0) return;

        const getAddCreditBtn = () => document.querySelector('[data-path="/extraartists"] > button.button-small');
        const getCreditItems  = () => {
            const addBtn = document.querySelector('[data-path="/extraartists"] > button.button-small');
            if (!addBtn) return [];
            const container = addBtn.closest('ul, ol, div') || addBtn.parentElement?.parentElement;
            if (container) {
                const items = Array.from(container.querySelectorAll('li, div.editable_item')).filter(el =>
                    el.querySelector('input.add-credit-role-input, input[aria-label="Add Artist Role"]'));
                if (items.length) return items;
            }
            return Array.from(document.querySelectorAll('input.add-credit-role-input, input[aria-label="Add Artist Role"]'))
                .map(inp => inp.closest('li, div.editable_item')).filter(Boolean);
        };

        if (!appendOnly) {
            for (const item of [...getCreditItems()]) {
                const removeBtn = item.querySelector('button[title="Remove"], button[aria-label="Remove"], button.drag_drop_field_remove_row');
                if (removeBtn) { removeBtn.click(); await new Promise(r => setTimeout(r, 150)); }
            }
        }

        const deduped = mergeCreditsForApply(credits);
        for (const { name, anv, roles, trackPositions } of deduped) {
            const addBtn = getAddCreditBtn();
            if (!addBtn) { log('Credits: Add button not found', 'warning'); break; }

            const before = getCreditItems().length;
            addBtn.click();
            await new Promise(r => setTimeout(r, 300));

            const deadline = Date.now() + 2000;
            while (getCreditItems().length <= before && Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 50));
            }

            const items = getCreditItems();
            const newItem = items[items.length - 1];
            if (!newItem) continue;

            const roleInput = newItem.querySelector('input.add-credit-role-input, input[aria-label="Add Artist Role"]');
            const nameInput = newItem.querySelector('input.credit-artist-name-input, input[data-type="artist-name-credits"]');
            const trackPosInput = newItem.querySelector('input.track-positions-input, input[aria-label="Add Track Positions"]');
            const removeBtn = newItem.querySelector('button[title="Remove"], button[aria-label="Remove"], button.drag_drop_field_remove_row');

            if (roleInput) {
                for (const role of roles) {
                    roleInput.focus();
                    setReactValue(roleInput, role);
                    roleInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
                    roleInput.dispatchEvent(new KeyboardEvent('keyup',  { bubbles: true, key: 'Enter', keyCode: 13 }));
                    await new Promise(r => setTimeout(r, 100));
                    setReactValue(roleInput, '');
                }
            }
            if (nameInput) {
                wiFields.push({ el: nameInput, oldVal: nameInput.value });
                const capName = (!appendOnly && state.capitalizeFields.creditNames) ? capitalizeTitleString(name) : name;
                setReactValue(nameInput, capName);
            }
            if (anv) {
                const anvBtn = newItem.querySelector('button[aria-label="Add ANV"], button.remove-artist-credits-anv');
                if (anvBtn) {
                    anvBtn.click();
                    await new Promise(r => setTimeout(r, 200));
                    const anvInput = newItem.querySelector('input[data-type="artist-credit-anv"]');
                    if (anvInput) setReactValue(anvInput, anv);
                }
            }
            if (trackPosInput && trackPositions) {
                wiFields.push({ el: trackPosInput, oldVal: trackPosInput.value });
                setReactValue(trackPosInput, trackPositions);
            }
            if (removeBtn) addedCreditRemoveBtns.push(removeBtn);
            const logName = (!appendOnly && state.capitalizeFields.creditNames) ? capitalizeTitleString(name) : name;
            const posStr = trackPositions ? ` [${trackPositions}]` : '';
            const anvStr = anv ? ` (ANV: ${anv})` : '';
            log(`Credit: ${roles.join(', ')} — ${logName}${anvStr}${posStr}`, 'success');
        }
    }

    function wiGenericOG(doc, url, storeName) {
        const ogTitle  = wiGetMeta(doc, 'og:title')  || '';
        const ogImage  = wiGetMeta(doc, 'og:image')  || '';
        const ogSite   = wiGetMeta(doc, 'og:site_name') || '';
        const parts    = ogTitle.split(' - ');
        const artist   = parts.length > 1 ? parts[0].trim() : '';
        const title    = parts.length > 1 ? parts.slice(1).join(' - ').trim() : ogTitle;
        return { artist, title, label: '', catno: null, date: '', tracks: [], imageUrl: ogImage,
                 storeName: storeName || ogSite || '' };
    }

    async function wiParseBandcamp(url, preloadedHtml = null) {
        const html = preloadedHtml || await wiCrossFetch(url);
        const doc = wiParseHTML(html);
        const tralbumEl = doc.querySelector('script[data-tralbum]');
        if (!tralbumEl) {
            const pageTitle = doc.title || '';
            const bodyText  = (doc.body?.textContent || '').slice(0, 4000);
            const bodyLower = bodyText.toLowerCase();

            return wiGenericOG(doc, url, 'Bandcamp');
        }
        let tralbum;
        try { tralbum = JSON.parse(tralbumEl.dataset.tralbum); } catch(e) { return wiGenericOG(doc, url, 'Bandcamp'); }
        let ldMeta = null;
        try {
            const ldEl = doc.querySelector('script[type="application/ld+json"]');
            if (ldEl) ldMeta = JSON.parse(ldEl.textContent);
        } catch(e) {}
        const artist   = ldMeta?.byArtist?.name || tralbum.artist || '';
        const title    = ldMeta?.name || tralbum.current?.title || '';
        const backLabelEl   = doc.querySelector('a.back-to-label-link span.back-link-text');
        const backLabelName = backLabelEl
            ? (backLabelEl.lastChild?.textContent?.trim() || backLabelEl.textContent.trim().replace(/^more\s+from\s*/i, '').trim())
            : null;
        const publisherName = ldMeta?.publisher?.name || '';
        const label    = backLabelName
            || (publisherName && publisherName.toLowerCase() !== artist.toLowerCase() ? publisherName : '')
            || doc.querySelector('p#band-name-location > span.title')?.textContent?.trim()
            || '';
        let date     = wiNormalizeDate(ldMeta?.datePublished || tralbum.current?.release_date || tralbum.album_release_date || '');
        const locationText = doc.querySelector('p#band-name-location > span.location')?.textContent?.trim() || '';
        const backLabelHref = doc.querySelector('a.back-to-label-link[href]')?.getAttribute('href') || '';
        let country = '';
        if (backLabelHref) {
            try {
                const labelUrl = new URL(backLabelHref, url).origin;
                const labelHtml = await withTimeout(wiCrossFetch(labelUrl), 8000, 'Label page fetch');
                const labelDoc = wiParseHTML(labelHtml);
                const labelLocationText = labelDoc.querySelector('p#band-name-location > span.location')?.textContent?.trim() || '';
                country = parseCountryFromLocationText(labelLocationText);
            } catch (e) {}
        } else {
            country = parseCountryFromLocationText(locationText);
        }
        const _rawPublish = tralbum.current?.publish_date || '';
        const _publishNorm = _rawPublish ? wiNormalizeDate(_rawPublish) : '';
        const BANDCAMP_LAUNCH_DATE = '2008-09-16';
        let invalidDate = '';
        if (date && date.slice(0, 10) < BANDCAMP_LAUNCH_DATE && _publishNorm && _publishNorm.slice(0, 10) >= BANDCAMP_LAUNCH_DATE) {
            invalidDate = date.slice(0, 10);
            date = _publishNorm;
        }
        const publishDate  = (_publishNorm && _publishNorm.slice(0, 10) !== date.slice(0, 10)) ? _publishNorm.slice(0, 10) : '';
        const imageUrl = (ldMeta?.image || '').replace(/_\d+(?=\.\w+$)/, '_16') || wiGetMeta(doc, 'og:image');

        let bitdepth = null, samplerate = null, fileType = 'FLAC', freeText = null;
        const qualityText = doc.querySelector('div.audio-quality')?.textContent?.trim() || '';
        const qualityMatch = qualityText.match(/(\d+)-bit\s*\/\s*([\d.]+)\s*kHz/i);
        if (qualityMatch) {
            bitdepth   = parseInt(qualityMatch[1], 10);
            samplerate = Math.round(parseFloat(qualityMatch[2]) * 1000);
            fileType   = 'FLAC';
        }

        const ldDurations = new Map();
        if (ldMeta?.['@type'] === 'MusicAlbum' && ldMeta.track?.itemListElement) {
            for (const it of ldMeta.track.itemListElement) {
                const sec = parseISODuration(it.item?.duration || '');
                if (sec > 0) ldDurations.set(String(it.position), sec);
            }
        } else if (ldMeta?.['@type'] === 'MusicRecording' && ldMeta.duration) {
            const sec = parseISODuration(ldMeta.duration);
            if (sec > 0) ldDurations.set('1', sec);
        }
        const rawTracks = (tralbum.trackinfo || []).map((t, i) => {
            let trackTitle = (t.title || '').trim();
            if (tralbum.trackinfo.length === 1 && ldMeta?.['@type'] === 'MusicRecording' && ldMeta.name) {
                trackTitle = ldMeta.name.trim();
            }
            return {
                position:    String((tralbum.initial_track_num || 0) + (t.track_num || i + 1)),
                title:       trackTitle,
                duration:    (() => {
                    const pos = String((tralbum.initial_track_num || 0) + (t.track_num || i + 1));
                    const ldSec = ldDurations.get(pos);
                    if (ldSec) return wiFormatDuration(ldSec);
                    return t.duration ? wiFormatDuration(Math.round(t.duration)) : '';
                })(),
                trackArtist: (t.artist || '').trim(),
            };
        });

        const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.trackArtist.toLowerCase()).filter(Boolean))];
        const isVAPerTrack = uniqueArtistGroups.length > 1;

        let filledWithMain = 0;
        const tracks = rawTracks.map(t => {
            let trackTitle = t.title;
            let effectiveArtist = t.trackArtist;
            if (isVAPerTrack && !effectiveArtist && artist) {
                effectiveArtist = artist;
                filledWithMain++;
            }
            if (isVAPerTrack && effectiveArtist && trackTitle.startsWith(effectiveArtist + ' - ')) {
                trackTitle = trackTitle.slice(effectiveArtist.length + 3).trim();
            }
            return {
                position: t.position, title: trackTitle, duration: t.duration,
                ...(isVAPerTrack && effectiveArtist ? { artists: [effectiveArtist] } : {}),
            };
        });
        if (isVAPerTrack && filledWithMain > 0) {
            log(`VA mode: filled ${filledWithMain} track${filledWithMain !== 1 ? 's' : ''} with main artist "${artist}" (no per-track artist listed)`, 'info');
        }

        const tagEls = doc.querySelectorAll('.tralbumData.tralbum-tags a.tag');
        const tags = tagEls.length > 0
            ? Array.from(tagEls).map(a => a.textContent.trim())
            : [];


        const { credits, source: creditsSource } = parseBandcampCredits(doc);
        const creditsSourceInfo = creditsSource;

        return {
            artist, title, label,
            catno: tralbum.current?.sku || null,
            date, publishDate, tracks, imageUrl, tags, credits, creditsSource: creditsSourceInfo,
            bitdepth, samplerate, fileType, freeText, country, invalidDate,
            storeName: 'Bandcamp',
        };
    }
    async function wiParseBeatport(url) {
        const html = await wiCrossFetch(url);
        const doc = wiParseHTML(html);

        let releaseData = {
            artist: '', title: '', label: '', catno: '', date: '', tracks: [],
            imageUrl: wiGetMeta(doc, 'og:image'), storeName: 'Beatport', isVA: false
        };

        const nextEl = doc.getElementById('__NEXT_DATA__');
        if (nextEl) {
            try {
                const state = JSON.parse(nextEl.textContent);
                const pp = state.props?.pageProps || {};
                const rel = pp.release || pp.dehydratedState?.queries?.find(q => q.queryKey?.[0] === 'release')?.state?.data;
                const jsonTracks = pp.tracks || pp.dehydratedState?.queries?.find(q => q.queryKey?.[0] === 'tracks')?.state?.data?.results;

                if (rel) {
                    releaseData.title = rel.name || rel.title;
                    const albumArtists = (rel.artists || []).map(a => a.name).filter(Boolean);
                    releaseData.artist = albumArtists.join(', ');
                    releaseData.artists = albumArtists.length > 1 ? albumArtists : undefined;
                    releaseData.label = rel.label?.name || rel.label;
                    releaseData.catno = rel.catalog_number || rel.catalog;
                    releaseData.date = (rel.publish_date || rel.release_date || "").slice(0, 10);
                }

                if (jsonTracks && jsonTracks.length > 0) {
                    const trackArtistRegistry = [];
                    const genreSet = new Set();

                    releaseData.tracks = jsonTracks.map((t, i) => {
                        const trackArtists = (t.artists || []).map(a => a.name);
                        trackArtistRegistry.push(trackArtists.join('|').toLowerCase());

                        const genreName = t.genre?.name || t.sub_genre?.name || '';
                        if (genreName) genreName.split('/').forEach(g => { const s = g.trim(); if (s) genreSet.add(s); });

                        return {
                            position: String(t.number || t.track_number || (i + 1)),
                            title: t.mix_name ? `${t.name} (${t.mix_name})` : t.name,
                            duration: wiFormatDuration((t.length_ms || t.duration_ms || 0) / 1000),
                            artists: trackArtists
                        };
                    });

                    const uniqueArtistGroups = [...new Set(trackArtistRegistry)];
                    if (releaseData.artist.toLowerCase().includes('various artists') || /v\/a/i.test(releaseData.artist) || uniqueArtistGroups.length > 1) {
                        releaseData.isVA = true;
                        log("Various Artists / Split release detected.", "info");
                    }

                    if (genreSet.size > 0) releaseData.tags = [...genreSet];
                }
            } catch (e) { log("Beatport JSON parse error: " + e.message, "error"); }
        }

        if (!releaseData.tags || releaseData.tags.length === 0) {
            const genreSet = new Set();
            doc.querySelectorAll('a[href*="/genre/"]').forEach(a => {
                a.textContent.split('/').forEach(g => { const s = g.trim(); if (s) genreSet.add(s); });
            });
            if (genreSet.size > 0) releaseData.tags = [...genreSet];
        }

        return releaseData;
    }

    async function wiParseJunoDownload(url) {
    const html = await wiCrossFetch(url);
    const doc = wiParseHTML(html);

    const artistEl = doc.querySelector('h2.product-artist');
    const artistLinks = artistEl
        ? Array.from(artistEl.querySelectorAll('a')).map(a => a.textContent.trim()).filter(Boolean)
        : [];
    const artist = artistLinks.join(', ')
        || artistEl?.textContent?.trim()
        || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';
    const artists = artistLinks.length > 1 ? artistLinks : undefined;

    const title = doc.querySelector('h2.product-title > a, h2.product-title')?.textContent?.trim()
        || wiGetMeta(doc, 'og:title') || '';

    const label = doc.querySelector('h3.product-label > a, .product-label a')?.textContent?.trim() || '';

    let catno = null;
    for (const strong of doc.querySelectorAll('div.mb-3 > strong, .mb-3 strong')) {
        if (strong.textContent.startsWith('Cat:') || strong.textContent.startsWith('Catalogue:')) {
            const sibling = strong.nextSibling;
            if (sibling?.nodeType === Node.TEXT_NODE) {
                catno = sibling.textContent.trim() || null;
            }
            break;
        }
    }

    const dateEl = doc.querySelector('span[itemprop="datePublished"]');
    let date = '';
    if (dateEl?.firstChild?.data) {
        date = wiNormalizeDate(dateEl.firstChild.data.trim());
    } else if (dateEl?.textContent) {
        date = wiNormalizeDate(dateEl.textContent.trim());
    }

    const imageUrl = wiGetMeta(doc, 'og:image') || '';

    const rawTracks = [];
    const trackDivs = doc.querySelectorAll('div.product-tracklist > div[itemprop="track"]');

    let junoId = null;
    const idMatch = url.match(/\/([a-z0-9\-]+)\/?(?:\?|$)/i);
    if (idMatch) {
        junoId = idMatch[1];
    }

    const apiDataByPos = new Map();
    if (junoId) {
        try {
            const apiUrl = `https://www.junodownload.com/api/1.2/playlist/getplaylistdetails/?product_key=${encodeURIComponent(junoId)}`;
            const apiHtml = await wiCrossFetch(apiUrl);
            const apiDoc = wiParseHTML(apiHtml);

            Array.from(apiDoc.querySelectorAll('track')).forEach((trackEl, idx) => {
                const isrc = trackEl.querySelector('isrc')?.textContent?.trim() || '';
                const lengthSecs = trackEl.querySelector('length')?.textContent?.trim();
                let duration = '';
                if (lengthSecs) {
                    const secs = parseInt(lengthSecs, 10);
                    duration = wiFormatDuration(secs);
                }
                apiDataByPos.set(idx, { isrc, duration });
            });
        } catch (e) {
            log(`Juno API fetch failed for ${junoId}: ${e.message}`, 'warning');
        }
    }

    Array.from(trackDivs).forEach((tr, i) => {
        let pos = String(i + 1);

        const titleCol = tr.querySelector('.col.track-title');
        if (titleCol) {
            for (const node of titleCol.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.data.trim()) {
                    const text = node.data.trim();
                    const numMatch = text.match(/^(\d+|[A-Za-z]\d+)/);
                    if (numMatch) {
                        pos = numMatch[1];
                        break;
                    }
                }
            }
        }

        const trackArtist = tr.querySelector('meta[itemprop="byArtist"]')?.content?.trim()
            || tr.querySelector('span.track-artist')?.textContent?.trim() || '';

        let trackTitle = tr.querySelector('span[itemprop="name"]')?.textContent?.trim() || '';
        if (trackArtist && trackTitle.startsWith(trackArtist + ' - ')) {
            trackTitle = trackTitle.slice(trackArtist.length + 3).trim();
        }

        let duration = '';

        const durMeta = tr.querySelector('meta[itemprop="duration"]');
        if (durMeta?.content) {
            duration = wiNormalizeDuration(durMeta.content.trim());
        }

        if (!duration && apiDataByPos.has(i)) {
            duration = apiDataByPos.get(i).duration || '';
        }

        if (!duration) {
            const timeEl = tr.querySelector('[class*="duration"], time, .track-time');
            if (timeEl?.textContent) {
                duration = wiNormalizeDuration(timeEl.textContent.trim());
            }
        }

        if (trackTitle) {
            rawTracks.push({ position: pos, title: trackTitle, duration, trackArtist });
        }
    });

    const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.trackArtist.toLowerCase()).filter(Boolean))];
    const isVAPerTrack = uniqueArtistGroups.length > 1;

    const tracks = rawTracks.map(t => ({
        position: t.position,
        title: t.title,
        duration: t.duration,
        ...(isVAPerTrack && t.trackArtist ? { artists: [t.trackArtist] } : {}),
    }));

    const genreMeta = doc.querySelector('meta[itemprop="genre"]');
    const genreRaw = genreMeta?.getAttribute('content')?.trim() || '';
    const tags = genreRaw ? genreRaw.split('/').map(g => g.trim()).filter(Boolean) : [];

    if (tags.length === 0) {
        const genreLinks = Array.from(doc.querySelectorAll('div.mb-3 a[href*="/genre/"]'));
        genreLinks.forEach(a => {
            const genreText = a.textContent.trim();
            if (genreText) {
                genreText.split('/').forEach(g => {
                    const s = g.trim();
                    if (s && !tags.includes(s)) tags.push(s);
                });
            }
        });
    }

    return {
        artist,
        artists,
        title,
        label,
        catno,
        date,
        tracks,
        ...(tags.length ? { tags } : {}),
        imageUrl,
        storeName: 'Juno Download',
    };
}

    async function wiParseTraxsource(url) {
    const html = await wiCrossFetch(url);
    const doc  = wiParseHTML(html);

    const artistEls = doc.querySelectorAll('h1.artists > a.com-artists');
    const artistsArr = Array.from(artistEls).map(a => a.textContent.trim()).filter(Boolean);
    const artist = artistsArr.join(', ')
        || doc.querySelector('h1.artists')?.textContent?.trim()
        || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';
    const artists = artistsArr.length > 1 ? artistsArr : undefined;

    const title  = doc.querySelector('h1.title')?.textContent?.trim() || wiGetMeta(doc, 'og:title') || '';
    const label  = doc.querySelector('a.com-label')?.textContent?.trim() || '';
    let catno = null, date = '';
    const catRdate = doc.querySelector('div.cat-rdate')?.textContent?.trim() || '';
    if (catRdate) {
        const [rawCat, rawDate] = catRdate.split('|').map(s => s.trim());
        catno = rawCat || null;
        date  = wiNormalizeDate(rawDate || '');
    }
    const imageUrl = wiGetMeta(doc, 'og:image');
    const tracks = Array.from(doc.querySelectorAll('div.trklist > div.trk-row')).map((row, i) => {
        let name = row.querySelector('div.title > a')?.textContent?.trim() || '';
        const versionNode = row.querySelector('span.version')?.firstChild;
        if (versionNode?.nodeType === 3) {
            const v = versionNode.textContent.trim();
            if (v) name += ` (${v})`;
        }
        const pos = row.querySelector('div.tnum')?.textContent?.trim() || String(i + 1);
        let durRaw = row.querySelector('span.duration')?.textContent?.trim()
            || row.querySelector('span.time')?.textContent?.trim()
            || row.querySelector('[data-duration]')?.dataset?.duration
            || '';
        if (!durRaw) {
            const m = row.textContent.match(/(\d{1,3}:\d{2})/g);
            if (m) durRaw = m[m.length - 1];
        }
        const duration = wiNormalizeDuration(durRaw);
        const trackArtistEls = row.querySelectorAll('div.trk-cell.artists a.com-artists');
        const trackArtists = Array.from(trackArtistEls).map(a => a.textContent.trim()).filter(Boolean);
        return {
            position: pos,
            title: name,
            duration,
            ...(trackArtists.length > 0 ? { artists: trackArtists } : {})
        };
    }).filter(t => t.title);

    const genreLink = doc.querySelector('div.trk-cell.genre a, div.trk-cell.genre ellip a');
    const genreRaw = genreLink?.textContent?.trim() || '';
    const tags = genreRaw ? genreRaw.split('/').map(g => g.trim()).filter(Boolean) : [];

    return { artist, ...(artists ? { artists } : {}), title, label, catno, date, tracks, imageUrl, ...(tags.length ? { tags } : {}), storeName: 'Traxsource' };
}

    async function wiParseVolumo(url) {
        const html = await wiCrossFetch(url);
        const doc  = wiParseHTML(html);

        const title = doc.querySelector('h1[title]')?.getAttribute('title')?.trim()
            || doc.querySelector('h1')?.textContent?.trim()
            || '';

        const infoSpan = doc.querySelector('[class*="AlbumHeader_info"]');
        const label    = infoSpan?.querySelector('a[href*="/label/"]')?.textContent?.trim()
            || doc.querySelector('a[href*="/label/"]')?.textContent?.trim()
            || '';
        let catno = null, date = '';
        if (infoSpan) {
            const catnoCandid = infoSpan.querySelector('[title="Catalog number"]');
            if (catnoCandid) catno = catnoCandid.textContent.trim() || null;
            const origDate = infoSpan.querySelector('[class*="AlbumReleaseDate"][title="Original release date"]')
                ?? infoSpan.querySelector('[title="Original release date"] [class*="AlbumReleaseDate"]')
                ?? infoSpan.querySelector('[title="Original release date"]');
            const pubDate  = infoSpan.querySelector('[title="Publish date"]');
            const altDate  = infoSpan.querySelector('[title="Volumo release date"]')
                ?? infoSpan.querySelector('[title$="release date" i]');
            date = wiNormalizeDate((origDate ?? pubDate ?? altDate)?.textContent?.trim() || '');
        }
        if (!date) {
            const fallbackDate = doc.querySelector('[title="Volumo release date"], [title="Original release date"], [title="Publish date"], [title$="release date" i]');
            if (fallbackDate) date = wiNormalizeDate(fallbackDate.textContent?.trim() || '');
        }

        const firstArtistEl = doc.querySelector('[data-test-id="artists"]');
        const artistLinks   = Array.from(firstArtistEl?.querySelectorAll('a[href*="/artist/"]') ?? [])
            .map(a => a.textContent.trim()).filter(Boolean);
        const artistsArr = artistLinks.length > 0
            ? artistLinks
            : (firstArtistEl?.textContent?.trim()
                ? firstArtistEl.textContent.trim().split(/\s*[,•]\s*/).map(s => s.trim()).filter(Boolean)
                : []);
        const pageTitle    = doc.querySelector('title')?.textContent?.trim() || '';
        const fallback     = pageTitle.match(/^(.+?)\s*[-\u2013\u2014]\s*.+?\s+by\s+/)?.[1]?.trim() || '';
        const artist       = artistsArr.join(', ') || fallback;
        const artists      = artistsArr.length > 1 ? artistsArr : undefined;

        const genreEl  = doc.querySelector('[data-test-id="genres"]');
        const stripParens = s => s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
        const rawTags  = Array.from(genreEl?.querySelectorAll('a') ?? [])
            .map(a => stripParens(a.textContent.trim())).filter(Boolean);
        if (rawTags.length === 0 && genreEl) {
            stripParens(genreEl.textContent).split(/[•,]/).map(s => s.trim()).filter(Boolean).forEach(t => rawTags.push(t));
        }
        const tags = [...new Set(rawTags.flatMap(t => t.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean)))];

        const relatedSection = doc.querySelector('[data-test-id="related-releases"]');
        const seen = new Set();
        const tracks = [];
        let pos = 1;

        for (const btn of doc.querySelectorAll('button[aria-label]')) {
            const lbl = btn.getAttribute('aria-label') || '';
            if (!lbl.startsWith('Play "')) continue;
            if (relatedSection && !(btn.compareDocumentPosition(relatedSection) & 4 /* FOLLOWING */)) break;

            const m = lbl.match(/^Play "(.+)"$/);
            if (!m) continue;
            const fullName = m[1];
            if (seen.has(fullName)) continue;
            seen.add(fullName);

            let durEl = null, row = btn.parentElement;
            for (let i = 0; i < 8 && row; i++, row = row.parentElement) {
                durEl = row.querySelector('[data-test-id="duration"]');
                if (durEl) break;
            }
            const duration = wiNormalizeDuration(durEl?.textContent?.trim() || '');

            const emDash  = ' \u2014 ';
            const dashIdx = fullName.indexOf(emDash);
            let trackTitle   = fullName;
            let trackArtists;
            if (dashIdx >= 0) {
                const artistPart = fullName.slice(0, dashIdx);
                trackTitle  = fullName.slice(dashIdx + emDash.length);
                const arr = artistPart.split(', ').map(s => s.trim()).filter(Boolean);
                if (arr.length > 0) trackArtists = arr;
            }

            tracks.push({
                position: String(pos++),
                title: trackTitle,
                duration,
                ...(trackArtists ? { artists: trackArtists } : {})
            });
        }

        const coverImg = doc.querySelector('img[alt^="Artwork for"]');
        let imageUrl = '';
        if (coverImg) {
            const srcset = coverImg.getAttribute('srcset') || '';
            const srcsetMatch = srcset.match(/\/img\/size\/\d+x\d+\/([a-f0-9-]+)\.\w+/);
            if (srcsetMatch) {
                imageUrl = `https://volumo.com/img/size/600x0/${srcsetMatch[1]}.webp`;
            } else {
                const src = coverImg.getAttribute('src') || '';
                if (!src.startsWith('data:')) {
                    imageUrl = src.startsWith('http') ? src : `https://volumo.com${src}`;
                }
            }
        }
        imageUrl = imageUrl || wiGetMeta(doc, 'og:image') || '';

        return { artist, ...(artists ? { artists } : {}), title, label, catno, date,
                 tracks, imageUrl, ...(tags.length ? { tags } : {}), storeName: 'Volumo' };
    }

    async function wiParseQobuz(url) {
        const idMatch = url.match(/\/album\/(?:[^\/]+\/)?([a-z0-9]+)\/?(?:[?#].*)?$/i);
        const albumId = idMatch ? idMatch[1] : null;

        function parseQobuzQuality(doc) {
            let bitdepth = null, samplerate = null;
            doc.querySelectorAll('.album-quality__info').forEach(el => {
                const t = el.textContent.trim();
                const bdM = t.match(/\b(\d+)[\s-]*bit/i);
                const srM = t.match(/\b([\d.]+)\s*kHz/i);
                if (bdM) { const v = parseInt(bdM[1], 10); if (v >= 16 && v <= 32 && (!bitdepth || v > bitdepth)) bitdepth = v; }
                if (srM) { const v = Math.round(parseFloat(srM[1]) * 1000); if (v >= 44100 && v <= 384000 && (!samplerate || v > samplerate)) samplerate = v; }
            });
            return { bitdepth, samplerate };
        }

        function parseQobuzGenres(doc) {
            const tags = [];
            doc.querySelectorAll('li.album-meta__item').forEach(li => {
                if (/^\s*Genre\s*:/i.test(li.textContent)) {
                    const link = li.querySelector('a.album-meta__link');
                    const val = (link?.textContent || '').trim();
                    if (val) tags.push(val);
                }
            });
            return tags;
        }

        function parseQobuzArtists(doc) {
            const mainArtistLi = Array.from(doc.querySelectorAll('li.album-meta__item'))
                .find(li => /main\s*artist/i.test(li.textContent));
            if (mainArtistLi) {
                const names = Array.from(mainArtistLi.querySelectorAll('a.album-meta__link'))
                    .map(a => a.textContent.trim()).filter(Boolean);
                if (names.length > 0) return names;
            }
            const h1Artist = doc.querySelector('h1.album-meta__title .artist-name')?.textContent?.trim();
            return h1Artist ? h1Artist.split(',').map(s => s.trim()).filter(Boolean) : [];
        }

        function parseQobuzFullTitle(doc, knownArtists = []) {
            const h1 = doc.querySelector('h1.album-meta__title');
            if (h1) {
                const titleAttr = h1.getAttribute('title') || h1.getAttribute('aria-label');
                if (titleAttr) {
                    const byIdx = titleAttr.lastIndexOf(' by ');
                    const fromAttr = byIdx > 0 ? titleAttr.slice(0, byIdx) : titleAttr;
                    if (fromAttr) return fromAttr;
                }
                const spanTitle = h1.querySelector('.album-title')?.textContent?.trim();
                if (spanTitle) return spanTitle;
            }
            const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
            if (ogTitle) {
                const withoutQobuz = ogTitle.replace(/ - Qobuz$/i, '');
                const knownArtist = knownArtists[0] || '';
                return (knownArtist && withoutQobuz.endsWith(`, ${knownArtist}`))
                    ? withoutQobuz.slice(0, -(`, ${knownArtist}`).length)
                    : withoutQobuz;
            }
            return '';
        }

        function buildResult(album, bitdepth, samplerate, artistsArray, htmlDoc) {
            const multiDisc = (album.media_count || 1) > 1;
            const items = album.tracks?.items || [];
            let img = album.image?.large || '';
            img = img.replace(/_\d+(?=\.\w+$)/, '_org');

            const albumArtists = (artistsArray && artistsArray.length > 0)
                ? artistsArray
                : (album.artists?.map(a => a.name).filter(Boolean) || (album.artist?.name ? [album.artist.name] : []));

            const rawTracks = items.map((t, i) => ({
                position: multiDisc ? `${t.media_number || 1}-${t.track_number || i + 1}` : String(t.track_number || i + 1),
                title:    t.title || '',
                duration: t.duration ? wiFormatDuration(t.duration) : '',
                artists:  t.performer ? [t.performer.name] : (t.artists ? t.artists.map(a => a.name) : [])
            }));

            const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.artists.join('|').toLowerCase()).filter(Boolean))];
            const isVAPerTrack = uniqueArtistGroups.length > 1;
            const tracks = rawTracks.map(t => ({
                position: t.position, title: t.title, duration: t.duration,
                ...(isVAPerTrack && t.artists.length > 0 ? { artists: t.artists } : {})
            }));

            const tags = htmlDoc ? parseQobuzGenres(htmlDoc) : [];
            return {
                artist:    albumArtists.join(', '),
                artists:   albumArtists.length > 1 ? albumArtists : undefined,
                title:     (() => {
                    if (album.version) return `${album.title} (${album.version})`;
                    if (htmlDoc) {
                        const fullTitle = parseQobuzFullTitle(htmlDoc, albumArtists);
                        if (fullTitle) return fullTitle;
                    }
                    return album.title || '';
                })(),
                label:     album.label?.name || '',
                catno:     null,
                date:      wiNormalizeDate(album.release_date_download || album.release_date_original || ''),
                tracks,
                imageUrl:  img,
                bitdepth,
                samplerate,
                ...(tags.length ? { tags } : {}),
                storeName: 'Qobuz',
            };
        }

        if (albumId) {
            let htmlDoc = null;
            try { const html = await wiCrossFetch(url); htmlDoc = wiParseHTML(html); } catch(e) {}
            const { bitdepth, samplerate } = htmlDoc ? parseQobuzQuality(htmlDoc) : { bitdepth: null, samplerate: null };
            const artistsArray = htmlDoc ? parseQobuzArtists(htmlDoc) : [];

            for (const appId of ['950096963', '285473059', '873914395', '2026183555']) {
                try {
                    const json = await wiCrossFetch(
                        `https://www.qobuz.com/api.json/0.2/album/get?album_id=${encodeURIComponent(albumId)}&app_id=${appId}`,
                        { headers: { 'X-App-Id': appId } }
                    );
                    const album = JSON.parse(json);
                    if (album?.title && !album.code) return buildResult(album, bitdepth, samplerate, artistsArray, htmlDoc);
                } catch(e) {}
            }

            if (htmlDoc) return scrapeQobuzDoc(htmlDoc, bitdepth, samplerate, artistsArray);
        }

        const html = await wiCrossFetch(url);
        const doc  = wiParseHTML(html);
        const { bitdepth, samplerate } = parseQobuzQuality(doc);
        const artistsArray = parseQobuzArtists(doc);
        return scrapeQobuzDoc(doc, bitdepth, samplerate, artistsArray);

        function scrapeQobuzDoc(doc, bitdepth, samplerate, artistsArray) {
            let title = '', label = '', date = '', imageUrl = '';

            doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
                try {
                    const data = JSON.parse(s.textContent);
                    const node = Array.isArray(data) ? data[0] : data;
                    if (node['@type'] === 'MusicAlbum' || node['@type'] === 'Product') {
                        title = node.name || title;
                        if (node.releaseDate) date = wiNormalizeDate(node.releaseDate);
                        if (node.image) imageUrl = Array.isArray(node.image) ? node.image[node.image.length - 1] : node.image;
                    }
                } catch(e) {}
            });

            const fullTitle = parseQobuzFullTitle(doc, artistsArray);
            if (fullTitle) title = fullTitle;

            if (imageUrl.includes('static.qobuz.com')) {
                imageUrl = imageUrl.replace(/_\d+(?=\.\w+$)/, '_org');
            }

            const labelMeta = doc.querySelector('.album-meta__item');
            if (labelMeta && labelMeta.textContent.includes('by')) {
                label = labelMeta.querySelector('a')?.textContent.trim() || '';
            }

            const rawTracks = [];
            doc.querySelectorAll('.track').forEach((row, i) => {
                const pos  = row.querySelector('.track__item--number span')?.textContent.trim() || String(i + 1);
                const name = row.querySelector('.track__item--name span')?.textContent.trim() || '';
                const dur  = row.querySelector('.track__item--duration')?.textContent.trim() || '';
                const trackArtist = row.querySelector('.track__item--artist span')?.textContent.trim() || '';
                if (name) rawTracks.push({ position: pos, title: name, duration: wiNormalizeDuration(dur), artists: trackArtist ? [trackArtist] : [] });
            });

            const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.artists.join('|').toLowerCase()).filter(Boolean))];
            const isVAPerTrack = uniqueArtistGroups.length > 1;
            const tracks = rawTracks.map(t => ({
                position: t.position, title: t.title, duration: t.duration,
                ...(isVAPerTrack && t.artists.length > 0 ? { artists: t.artists } : {})
            }));

            if (tracks.length > 0 || title) {
                const tags = parseQobuzGenres(doc);
                return {
                    artist:  artistsArray.join(', '),
                    artists: artistsArray.length > 1 ? artistsArray : undefined,
                    title, label, date, tracks, imageUrl, bitdepth, samplerate,
                    ...(tags.length ? { tags } : {}),
                    storeName: 'Qobuz'
                };
            }

            return wiGenericURL(url, 'Qobuz');
        }
    }

    async function wiParsePrestoMusic(url) {
    const html = await wiCrossFetch(url);
    const doc  = wiParseHTML(html);

    const h1 = doc.querySelector('h1.o-text--blsk-b-32');
    const title = h1?.textContent?.replace(/^New\.\s+/i, '').trim() || wiGetMeta(doc, 'og:title');

    const artistsArray = [];
    const contributorText = doc.querySelector('.c-newproduct-block__contributors p, .c-newproduct-block__contributors')
        ?.textContent?.trim() || '';
    if (contributorText) {
        contributorText.split(',').forEach(part => {
            const name = part.replace(/\(.*?\)/g, '').trim()
                             .replace(/^(.+?),\s+(.+)$/, '$2 $1');
            if (name) artistsArray.push(name);
        });
    }
    const artist = artistsArray.join(', ') || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';

    let label = '', date = '', catno = '';
    doc.querySelectorAll('.c-product-block__metadata li').forEach(li => {
        const text = li.textContent || '';
        if (text.includes('Release date:')) {
            const raw = text.replace('Release date:', '').trim();
            const ordinalMatch = raw.match(/(\d+)(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})/);
            if (ordinalMatch) {
                const months = {
                    jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
                    jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12'
                };
                const day   = ordinalMatch[1].padStart(2, '0');
                const month = months[ordinalMatch[2].toLowerCase().slice(0, 3)] || '01';
                const year  = ordinalMatch[3];
                date = `${year}-${month}-${day}`;
            } else {
                date = wiNormalizeDate(raw);
            }
        } else if (text.includes('Label:')) {
            label = li.querySelector('a')?.textContent?.trim() || text.replace('Label:', '').trim();
        } else if (text.includes('Catalogue number:')) {
            catno = text.replace('Catalogue number:', '').trim();
        }
    });

    let bitdepth = null, samplerate = null;
    doc.querySelectorAll('.c-purchase__format__name p.o-text--sharp-med-14').forEach(el => {
        const t = el.textContent || '';
        const srMatch = t.match(/([\d.]+)\s*kHz/i);
        const bdMatch = t.match(/(\d+)\s*bit/i);
        if (srMatch) {
            const sr = Math.round(parseFloat(srMatch[1]) * 1000);
            if (!samplerate || sr > samplerate) samplerate = sr;
        }
        if (bdMatch) {
            const bd = parseInt(bdMatch[1], 10);
            if (!bitdepth || bd > bitdepth) bitdepth = bd;
        }
    });

    const imageUrl = doc.querySelector('div.c-product-block__aside > a')?.getAttribute('href')?.replace(/\?\d+$/, '')
        || doc.querySelector('a.is--primary-image[href]')?.getAttribute('href')?.split('?')[0]
        || wiGetMeta(doc, 'og:image') || '';

    const rawTracks = [];

    doc.querySelectorAll('.c-tracklist__work').forEach(work => {
        const titleEl = work.querySelector('.c-track__title');
        const fullTitleText = titleEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const colonIdx = fullTitleText.indexOf(': ');
        const trackTitle = colonIdx !== -1
            ? fullTitleText.slice(colonIdx + 2).trim()
            : fullTitleText;

        const durEl = work.querySelector('.c-track__duration');
        let duration = '';
        if (durEl) {
            durEl.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const t = node.textContent.trim();
                    if (t) duration = t;
                }
            });
        }

        const trackArtist = work.querySelector('.c-track__details li')
            ?.textContent?.replace(/\s+/g, ' ').trim() || '';

        const subTracks = work.querySelectorAll('.c-track--track');
        if (subTracks.length > 0) {
            subTracks.forEach(tr => {
                const subTitleEl = tr.querySelector('.c-track__title');
                const subFull = subTitleEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
                const subColon = subFull.indexOf(': ');
                const subTitle = subColon !== -1 ? subFull.slice(subColon + 2).trim() : subFull;

                const subDurEl = tr.querySelector('.c-track__duration');
                let subDur = '';
                if (subDurEl) {
                    subDurEl.childNodes.forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const t = node.textContent.trim();
                            if (t) subDur = t;
                        }
                    });
                }
                const subArtist = tr.querySelector('.c-track__details li')
                    ?.textContent?.replace(/\s+/g, ' ').trim() || trackArtist;

                if (subTitle) rawTracks.push({ title: subTitle, duration: wiNormalizeDuration(subDur), trackArtist: subArtist });
            });
        } else {
            if (trackTitle) rawTracks.push({ title: trackTitle, duration: wiNormalizeDuration(duration), trackArtist });
        }
    });

    if (rawTracks.length === 0) {
        doc.querySelectorAll('.c-track').forEach(tr => {
            const titleEl = tr.querySelector('.c-track__title');
            const fullText = titleEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
            const colonIdx = fullText.indexOf(': ');
            const trackTitle = colonIdx !== -1 ? fullText.slice(colonIdx + 2).trim() : fullText;
            const durEl = tr.querySelector('.c-track__duration');
            let dur = '';
            if (durEl) {
                durEl.childNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const t = node.textContent.trim();
                        if (t) dur = t;
                    }
                });
            }
            const trackArtist = tr.querySelector('.c-track__details li')
                ?.textContent?.replace(/\s+/g, ' ').trim() || '';
            if (trackTitle) rawTracks.push({ title: trackTitle, duration: wiNormalizeDuration(dur), trackArtist });
        });
    }

    const uniqueArtists = new Set(rawTracks.map(t => t.trackArtist).filter(Boolean));
    const isVAPerTrack = uniqueArtists.size > 1;

    const tracks = rawTracks.map((t, i) => ({
        position: String(i + 1),
        title: t.title,
        duration: t.duration,
        ...(isVAPerTrack && t.trackArtist ? { artists: [t.trackArtist] } : {})
    }));

    return { artist, artists: artistsArray, title, label, catno, date, bitdepth, samplerate, tracks, imageUrl, storeName: 'Presto Music' };
}

    async function wiParseHighResAudio(url) {
        const html = await wiCrossFetch(url);
        const doc  = wiParseHTML(html);
        const h1El  = doc.getElementById('h1-album-title');
        const title = h1El?.firstChild?.textContent?.trim() || h1El?.textContent?.trim() || wiGetMeta(doc, 'og:title');
        const artist = doc.querySelector('h1 > span.artist')?.textContent?.trim()
            || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';
        let label = '', date = '';
        doc.querySelectorAll('div.album-col-info-data > div > p').forEach(p => {
            const key   = (p.firstChild?.textContent || '').trim();
            const value = (p.lastChild?.textContent  || '').trim();
            if (/^Label/i.test(key))                          label = value;
            else if (/^HRA.?Release|^Release.?Date/i.test(key)) date  = wiNormalizeDate(value);
            else if (!date && /^Album.?Release/i.test(key))   date  = wiNormalizeDate(value);
        });
        const imageUrl = wiGetMeta(doc, 'og:image');
        const tracks = [];
        doc.querySelectorAll('ul.playlist > li').forEach((li, idx) => {
            if (!li.classList.contains('pltrack')) return;
            const pos      = li.querySelector('span.track')?.textContent?.trim() || String(tracks.length + 1);
            const name     = li.querySelector('span.title')?.textContent?.replace(/\s+/g, ' ').trim() || '';
            const duration = wiNormalizeDuration(li.querySelector('span.time')?.textContent?.trim() || '');
            if (name) tracks.push({ position: pos, title: name, duration });
        });
        const tags = [];
        doc.querySelectorAll('div.col-info1 p, div.album-col-info-data > div > p').forEach(p => {
            const key = (p.querySelector('strong')?.textContent || p.firstChild?.textContent || '').trim();
            if (/^(?:Genre|Subgenre)/i.test(key)) {
                const link = p.querySelector('a');
                const val = (link?.textContent || p.lastChild?.textContent || '').trim();
                const segment = val.split('/').pop().trim();
                if (segment) tags.push(segment);
            }
        });

        return { artist, title, label, catno: null, date, tracks, imageUrl, ...(tags.length ? { tags } : {}), storeName: 'HighResAudio' };
    }

    async function wiParseNativeDSD(url) {
    const html = await wiCrossFetch(url);
    const doc  = wiParseHTML(html);

    const artistLinks = doc.querySelectorAll('div.product-intro-text > h3 > a');
    const artistsArr = Array.from(artistLinks).map(a => a.textContent.trim()).filter(Boolean);
    const artist = artistsArr.join(', ')
        || doc.querySelector('div.product-intro-text > h3')?.textContent?.trim()
        || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';
    const artists = artistsArr.length > 1 ? artistsArr : undefined;

    const title  = doc.querySelector('div.product-intro-text > h1')?.textContent?.trim()
        || wiGetMeta(doc, 'og:title') || '';
    let label = '', catno = null, date = '';
    doc.querySelectorAll('table.shop_attributes > tbody > tr').forEach(tr => {
        const key = tr.querySelector('th')?.textContent?.trim().toLowerCase() || '';
        const val = tr.querySelector('td > p')?.textContent?.trim() || tr.querySelector('td')?.textContent?.trim() || '';
        if (key === 'label')        label = val;
        else if (key === 'sku')     catno = val || null;
        else if (key === 'release date') date = wiNormalizeDate(val);
    });
    const imageUrl = wiGetMeta(doc, 'og:image')
        || doc.querySelector('div.woocommerce-product-gallery img, figure.woocommerce-product-image img')?.src
        || doc.querySelector('img.wp-post-image, .nativedsd-cover img, .product-image img')?.src
        || '';
    const trackEls = doc.querySelectorAll(
        'div#tracklist > div.nativedsd-player, ' +
        'div#tracklist > div.nativedsd-playlist-item, ' +
        'div.tracklist-wrapper div.nativedsd-player, ' +
        'div#tracklist > div'
    );
    let tracks = Array.from(trackEls).map((div, i) => {
        let pos  = div.querySelector('[class*="number"]')?.textContent?.trim() || String(i + 1);
        let name = div.querySelector('[class*="title"]')?.textContent?.trim() || '';
        let dur  = wiNormalizeDuration(div.querySelector('[class*="duration"]')?.textContent?.trim() || '');
        if (!name && div.tagName === 'TR') {
            pos  = div.querySelector('td:first-child')?.textContent?.trim() || String(i + 1);
            name = div.querySelector('td:nth-child(2)')?.textContent?.trim() || '';
            dur  = wiNormalizeDuration(div.querySelector('td:last-child')?.textContent?.trim() || '');
        }
        return { position: pos, title: name.replace(/\s+/g, ' ').trim(), duration: dur };
    }).filter(t => t.title.length > 2);
    if (!tracks.length) {
        tracks = Array.from(doc.querySelectorAll('table.tracklist tr, div#tracklist table tr')).map((tr, i) => {
            const tds = tr.querySelectorAll('td');
            if (tds.length < 2) return null;
            return {
                position: tds[0]?.textContent?.trim() || String(i + 1),
                title:    tds[1]?.textContent?.trim() || '',
                duration: wiNormalizeDuration(tds[tds.length - 1]?.textContent?.trim() || ''),
            };
        }).filter(t => t?.title?.length > 2);
    }
    return { artist, ...(artists ? { artists } : {}), title, label, catno, date, tracks, imageUrl, storeName: 'NativeDSD' };
}

    async function wiParseHDtracks(url) {
        const hashMatch = url.match(/#\/(\w+)\/(\w+)/);
        if (!hashMatch) return wiGenericOG(wiParseHTML(await wiCrossFetch(url)), url, 'HDtracks');
        const entity = hashMatch[1];
        const id     = hashMatch[2];

        function normaliseRate(rate) {
            if (!rate) return null;
            const n = parseFloat(rate);
            if (isNaN(n) || n <= 0) return null;
            return n < 400 ? Math.round(n * 1000) : Math.round(n);
        }

        function parseQualityCell(text) {
            if (!text) return { bitdepth: null, samplerate: null };
            const srM = text.match(/([\d.]+)\s*kHz/i);
            const bdM = text.match(/(\d+)\s*bit/i);
            return {
                samplerate: srM ? Math.round(parseFloat(srM[1]) * 1000) : null,
                bitdepth:   bdM ? parseInt(bdM[1], 10) : null,
            };
        }

        function parseHTMLTracks(doc) {
            const items = doc.querySelectorAll('li[data-type="track"]');
            if (!items.length) return [];
            const result = [];
            items.forEach((li, i) => {
                const numEl    = li.querySelector('.number.item-cell');
                const titleEl  = li.querySelector('.title.item-cell');
                const artistEl = li.querySelector('.artist.item-cell');
                const qualEl   = li.querySelector('.quality.item-cell');
                const durEl    = li.querySelector('.duration-container');
                let title = '';
                if (titleEl) {
                    const clone = titleEl.cloneNode(true);
                    clone.querySelectorAll('.subtitle').forEach(n => n.remove());
                    title = clone.textContent.trim();
                }
                const pos      = numEl?.textContent?.trim() || String(i + 1);
                const duration = wiNormalizeDuration(durEl?.textContent?.trim() || '');
                const { bitdepth, samplerate } = parseQualityCell(qualEl?.textContent?.trim() || '');
                const artistStr = artistEl?.textContent?.trim() || '';
                const artists   = artistStr ? artistStr.split(',').map(s => s.trim()).filter(Boolean) : [];
                if (title) result.push({ position: pos, title, duration, artists, bitdepth, samplerate });
            });
            return result;
        }

        function albumQualityFromHTMLTracks(tracks) {
            let bitdepth = null, samplerate = null;
            for (const t of tracks) {
                if (t.bitdepth   && (!bitdepth   || t.bitdepth   > bitdepth))   bitdepth   = t.bitdepth;
                if (t.samplerate && (!samplerate || t.samplerate > samplerate)) samplerate = t.samplerate;
            }
            return { bitdepth, samplerate };
        }

        const html       = await wiCrossFetch(url.split('#')[0]);
        const doc        = wiParseHTML(html);
        const htmlTracks = parseHTMLTracks(doc);

        try {
            const apiUrl  = `https://hdtracks.azurewebsites.net/api/v1/${entity}/${id}`;
            const rawJson = await wiCrossFetch(apiUrl, { headers: { Accept: 'application/json' } });
            const result  = JSON.parse(rawJson);
            if (result?.status?.toLowerCase() === 'ok' || result?.name) {
                const album = result;
                const albumArtistsArr = Array.isArray(album.artists) && album.artists.length > 0
                    ? album.artists
                    : (album.mainArtist ? album.mainArtist.split(/\s*[,&]\s*/).map(s => s.trim()).filter(Boolean) : []);
                const albumArtist = albumArtistsArr.join(', ') || album.mainArtist || '';
                const { bitdepth: htmlBd, samplerate: htmlSr } = albumQualityFromHTMLTracks(htmlTracks);
                const rawTracks = (album.tracks || []).map((t, i) => {
                    const h = htmlTracks[i];
                    const trackArtistStr = t.mainArtist || t.artist || '';
                    const artists = h?.artists?.length
                        ? h.artists
                        : (trackArtistStr ? trackArtistStr.split(',').map(s => s.trim()).filter(Boolean) : []);
                    return {
                        position: String(t.index || t.track_number || i + 1),
                        title:    t.name || t.title || '',
                        duration: t.duration ? wiFormatDuration(t.duration) : (t.length ? wiFormatDuration(t.length) : (h?.duration || '')),
                        artists,
                    };
                }).filter(t => t.title);
                const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.artists.join('|').toLowerCase()).filter(Boolean))];
                const isVAPerTrack = uniqueArtistGroups.length > 1;
                const tracks = rawTracks.map(t => ({
                    position: t.position, title: t.title, duration: t.duration,
                    ...(isVAPerTrack && t.artists.length > 0 ? { artists: t.artists } : {}),
                }));
                return {
                    artist:    albumArtist,
                    artists:   albumArtistsArr.length > 1 ? albumArtistsArr : undefined,
                    title:     album.name || '',
                    label:     album.label || '',
                    catno:     null,
                    date:      (album.release || album.releaseDate || album.originalRelease || '').slice(0, 10),
                    tracks,
                    imageUrl:  album.cover || album.coverImage || album.image || '',
                    bitdepth:  album.resolution || album.bit_depth || htmlBd || null,
                    samplerate: normaliseRate(album.rate) || htmlSr || null,
                    storeName: 'HDtracks',
                };
            }
        } catch(e) {}

        const nextEl = doc.getElementById('__NEXT_DATA__');
        if (nextEl) {
            try {
                const nextState = JSON.parse(nextEl.textContent);
                const product   = nextState?.props?.pageProps?.product || nextState?.props?.pageProps?.album;
                if (product?.name || product?.title) {
                    const albumArtistsArr = Array.isArray(product.artists) && product.artists.length > 0
                        ? product.artists.map(a => (typeof a === 'string' ? a : (a.name || ''))).filter(Boolean)
                        : (product.mainArtist ? product.mainArtist.split(/\s*[,&]\s*/).map(s => s.trim()).filter(Boolean) : []);
                    const albumArtist = albumArtistsArr.join(', ') || product.mainArtist || product.artist?.name || product.artist || '';
                    const { bitdepth: htmlBd, samplerate: htmlSr } = albumQualityFromHTMLTracks(htmlTracks);
                    const rawTracks = (product.tracks || []).map((t, i) => {
                        const h = htmlTracks[i];
                        const trackArtistStr = t.mainArtist || t.artist || '';
                        const artists = h?.artists?.length
                            ? h.artists
                            : (trackArtistStr ? trackArtistStr.split(',').map(s => s.trim()).filter(Boolean) : []);
                        return {
                            position: String(t.index || t.track_number || i + 1),
                            title:    t.name || t.title || '',
                            duration: t.duration ? wiFormatDuration(t.duration) : (h?.duration || ''),
                            artists,
                        };
                    }).filter(t => t.title);
                    const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.artists.join('|').toLowerCase()).filter(Boolean))];
                    const isVAPerTrack = uniqueArtistGroups.length > 1;
                    const tracks = rawTracks.map(t => ({
                        position: t.position, title: t.title, duration: t.duration,
                        ...(isVAPerTrack && t.artists.length > 0 ? { artists: t.artists } : {}),
                    }));
                    return {
                        artist:    albumArtist,
                        artists:   albumArtistsArr.length > 1 ? albumArtistsArr : undefined,
                        title:     product.name || product.title || '',
                        label:     product.label?.name || product.label || '',
                        catno:     null,
                        date:      (product.release || product.release_date || product.releaseDate || '').slice(0, 10),
                        tracks,
                        imageUrl:  product.cover || product.cover_image || product.image || wiGetMeta(doc, 'og:image'),
                        bitdepth:  product.resolution || product.bit_depth || htmlBd || null,
                        samplerate: normaliseRate(product.rate) || normaliseRate(product.sample_rate) || htmlSr || null,
                        storeName: 'HDtracks',
                    };
                }
            } catch(e) {}
        }

        if (htmlTracks.length > 0) {
            const { bitdepth, samplerate } = albumQualityFromHTMLTracks(htmlTracks);
            const uniqueArtistGroups = [...new Set(htmlTracks.map(t => t.artists.join('|').toLowerCase()).filter(Boolean))];
            const isVAPerTrack = uniqueArtistGroups.length > 1;
            const tracks = htmlTracks.map(t => ({
                position: t.position, title: t.title, duration: t.duration,
                ...(isVAPerTrack && t.artists.length > 0 ? { artists: t.artists } : {})
            }));
            return {
                artist:   wiGetMeta(doc, 'og:title').split(' - ')[0] || '',
                title:    wiGetMeta(doc, 'og:title').split(' - ').slice(1).join(' - ') || wiGetMeta(doc, 'og:title'),
                label: '', catno: null, date: '',
                tracks, imageUrl: wiGetMeta(doc, 'og:image'), bitdepth, samplerate,
                storeName: 'HDtracks',
            };
        }

        return wiGenericOG(doc, url, 'HDtracks');
    }
    async function wiParse7digital(url) {
        const html = await wiCrossFetch(url);
        const doc  = wiParseHTML(html);

        const artistLinks  = Array.from(doc.querySelectorAll('h2.release-info-artist > a'))
            .map(a => a.textContent.trim()).filter(Boolean);
        const artistMetas  = Array.from(doc.querySelectorAll('h2.release-info-artist span[itemprop="byArtist"] meta[itemprop="name"]'))
            .map(m => m.content?.trim()).filter(Boolean);
        const artistsArray = artistLinks.length > artistMetas.length ? artistLinks : artistMetas;
        const artist  = artistsArray.join(', ')
            || doc.querySelector('h2.release-info-artist')?.textContent?.trim()
            || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';
        const artists = artistsArray.length > 1 ? artistsArray : undefined;

        const title    = doc.querySelector('h1.release-info-title')?.textContent?.trim() || wiGetMeta(doc, 'og:title') || '';
        const label    = doc.querySelector('div.release-label-info > p')?.textContent?.trim() || '';
        const date     = wiNormalizeDate(doc.querySelector('div.release-date-info > p')?.textContent?.trim() || '');
        const imgEl    = doc.querySelector('img[itemprop="image"]');
        const imageUrl = imgEl?.src || wiGetMeta(doc, 'og:image');

        let bitdepth = null, samplerate = null, fileType = 'FLAC', freeText = null;
        const formatLabels = Array.from(doc.querySelectorAll('li.release-format-selector-row span.release-format-label'))
            .map(el => el.textContent.trim());
        let bestLossless = null;
        for (const lbl of formatLabels) {
            const bdM = lbl.match(/(\d+)-bit/i);
            const srM = lbl.match(/([\d.]+)kHz/i);
            if (bdM && srM) {
                const bd = parseInt(bdM[1], 10);
                if (!bestLossless || bd > bestLossless.bd)
                    bestLossless = { bd, sr: Math.round(parseFloat(srM[1]) * 1000) };
            }
        }
        if (bestLossless) {
            bitdepth = bestLossless.bd; samplerate = bestLossless.sr; fileType = 'FLAC';
        } else if (formatLabels.some(l => /320\s*kbps/i.test(l) || /MP3/i.test(l))) {
            fileType = 'MP3'; freeText = '320 kbps';
        }

        const rawTracks = [];
        doc.querySelectorAll('table.release-track-list').forEach(table => {
            table.querySelectorAll('tbody > tr.release-track').forEach(tr => {
                const pos  = tr.querySelector('td.release-track-preview > em.release-track-preview-text')?.textContent?.trim()
                    || String(rawTracks.length + 1);
                const name = tr.querySelector('td.release-track-name > meta[itemprop="name"]')?.content?.trim()
                    || tr.querySelector('td.release-track-name')?.textContent?.trim() || '';
                const durMeta = tr.querySelector('meta[itemprop="duration"]');
                let duration = '';
                if (durMeta?.content) {
                    const m = /^PT?(?:(?:(\d+)H)?(\d+)M)?(\d+)S$/i.exec(durMeta.content);
                    if (m) {
                        const secs = (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + parseInt(m[3]||0);
                        duration = wiFormatDuration(secs);
                    } else {
                        duration = wiNormalizeDuration(durMeta.content);
                    }
                }
                const trackArtist = tr.querySelector('td.release-track-name p.release-track-list-additional > a')?.textContent?.trim() || '';
                if (name) rawTracks.push({ position: pos, title: name, duration, trackArtist });
            });
        });

        if (rawTracks.length === 0) {
            const bodyLower = (doc.body?.textContent || '').slice(0, 4000).toLowerCase();
            const pageTitle = doc.title || '';

        }

        const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.trackArtist.toLowerCase()).filter(Boolean))];
        const isVAPerTrack = uniqueArtistGroups.length > 1;
        const tracks = rawTracks.map(t => ({
            position: t.position, title: t.title, duration: t.duration,
            ...(isVAPerTrack && t.trackArtist ? { artists: [t.trackArtist] } : {}),
        }));

        return { artist, artists, title, label, catno: null, date, tracks, imageUrl,
                 bitdepth, samplerate, fileType, freeText, storeName: '7digital' };
    }
    async function wiParseBleep(url) {
        const html = await wiCrossFetch(url);
        const doc  = wiParseHTML(html);
        const artistEls = doc.querySelectorAll('div.product-details dl > dd.artist > a');
        const artist = Array.from(artistEls).map(a => (a.title || a.textContent).trim()).filter(Boolean).join(', ')
            || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';
        const title  = doc.querySelector('div.product-details dl > dd.release-title')?.textContent?.trim()
            || wiGetMeta(doc, 'og:title') || '';
        const label  = Array.from(doc.querySelectorAll('div.product-details dl > dd.label > a'))
            .map(a => (a.title || a.textContent).trim()).join(' / ') || '';
        const catno  = doc.querySelector('div.product-details dl > dd.catalogue-number')?.textContent?.trim() || null;
        const date   = wiNormalizeDate(doc.querySelector('div.product-details dl > dd.product-release-date')?.textContent?.trim() || '');
        const imgEl  = doc.querySelector('div.overlay-images li.current > img') || doc.querySelector('img[itemprop="image"]');
        const imageUrl = (imgEl?.src || wiGetMeta(doc, 'og:image')).replace(/\/r\/[a-z]\//i, '/r/');
        const rawTracks = Array.from(doc.querySelectorAll('ol.track-list > li.track')).map((li, i) => {
            const pos  = li.querySelector('span.track-number')?.textContent?.trim() || String(i + 1);
            const name = li.querySelector('span[itemprop="name"]')?.textContent?.trim()
                || li.querySelector('a.play-link span')?.textContent?.trim()
                || li.querySelector('span.track-name')?.textContent?.trim() || '';
            const duration = wiNormalizeDuration(li.querySelector('span.track-duration')?.textContent?.trim() || '');
            const mainArtistEls = li.querySelectorAll('ul.track-main-artists > li > a');
            const artists = mainArtistEls.length
                ? Array.from(mainArtistEls).map(a => a.textContent.trim()).filter(Boolean)
                : [li.querySelector('span.track-display-artist')?.textContent?.trim() || '']
                    .filter(Boolean);
            return { position: pos, title: name, duration, artists };
        }).filter(t => t.title);
        const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.artists.join('|').toLowerCase()).filter(Boolean))];
        const isVAPerTrack = uniqueArtistGroups.length > 1;
        const tracks = rawTracks.map(t => ({
            position: t.position, title: t.title, duration: t.duration,
            ...(isVAPerTrack && t.artists.length > 0 ? { artists: t.artists } : {}),
        }));
        return { artist, title, label, catno, date, tracks, imageUrl, storeName: 'Bleep' };
    }

    async function wiParseBoomkat(url) {
        const html = await wiCrossFetch(url);
        const doc  = wiParseHTML(html);
        const artistEls = doc.querySelectorAll('div#right_content > h1.detail--artists > a, h1.detail--artists > a');
        const artist = Array.from(artistEls).map(a => a.textContent.trim()).filter(Boolean).join(', ')
            || doc.querySelector('h1.detail--artists')?.textContent?.trim()
            || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';
        const title  = doc.querySelector('div#right_content > h2.detail_album, h2.detail_album')?.textContent?.trim()
            || wiGetMeta(doc, 'og:title') || '';
        const imgEl  = doc.querySelector('img[itemprop="image"]');
        const imageUrl = imgEl?.src?.replace(/\/(?:large)\//i, '/original/') || wiGetMeta(doc, 'og:image');

        let label = '', catno = null, date = '';
        const firstTab = doc.querySelector('li.tab-title > a[data-release-date], li.tab-title > a[data-label]');
        if (firstTab) {
            date  = wiNormalizeDate(firstTab.dataset.releaseDate || firstTab.dataset.release_date || '');
            label = firstTab.dataset.label || '';
            catno = firstTab.dataset.catalogueNumber || firstTab.dataset.catalogue_number || null;
        }

        const allTabs = Array.from(doc.querySelectorAll('ul.tabs.product-page-tabs li.tab-title > a'));
        const tabTexts = allTabs.map(a => a.textContent.trim().toUpperCase());
        let fileType = null, freeText = null;
        if (tabTexts.includes('FLAC')) {
            fileType = 'FLAC';
        } else if (tabTexts.includes('WAV')) {
            fileType = 'WAV';
        } else if (tabTexts.includes('MP3')) {
            fileType = 'MP3';
            freeText = '320 kbps';
        }
        if (fileType === 'MP3' || (fileType === null && firstTab)) {
            fileType = fileType || 'MP3';
            freeText = '320 kbps';
        }

        const prodListing = doc.querySelector('[data-release-format-id]');
        let tracks = [];
        if (prodListing?.dataset?.releaseFormatId) {
            try {
                const tHtml = await wiCrossFetch(`https://boomkat.com/tracklist/${prodListing.dataset.releaseFormatId}`);
                const tDoc  = wiParseHTML(tHtml);
                const rawTracks = Array.from(tDoc.querySelectorAll('div.table.tracklist > div.track, div.tracklist > div.track')).map((div, i) => {
                    const titleSpan = div.querySelector('span.title');
                    const raw   = titleSpan?.textContent?.trim() || '';
                    const m     = /^(?:(\d+)\.\s*)?(.+)$/.exec(raw);
                    const pos   = m?.[1] ? String(parseInt(m[1])) : String(i + 1);
                    const name  = m?.[2]?.trim() || raw;
                    const duration = wiNormalizeDuration(div.querySelector('span.time, span.duration')?.textContent?.trim() || '');
                    const artistAttr = div.querySelector('a[data-artist]')?.dataset?.artist?.trim() || '';
                    const artists = artistAttr ? [artistAttr] : [];
                    return { position: pos, title: name, duration, artists };
                }).filter(t => t.title);
                const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.artists.join('|').toLowerCase()).filter(Boolean))];
                const isVAPerTrack = uniqueArtistGroups.length > 1;
                tracks = rawTracks.map(t => ({
                    position: t.position, title: t.title, duration: t.duration,
                    ...(isVAPerTrack && t.artists.length > 0 ? { artists: t.artists } : {}),
                }));
            } catch(e) {}
        }
        const genreLinks = Array.from(doc.querySelectorAll('span > a[href*="/t/genre/"]'));
        const tags = genreLinks.flatMap(a =>
            a.textContent.trim().split('/').map(g => g.trim()).filter(Boolean)
        );

        return { artist, title, label, catno, date, tracks, imageUrl, fileType, freeText, ...(tags.length ? { tags } : {}), storeName: 'Boomkat' };
    }
    async function wiParseProStudioMasters(url) {
        const html = await wiCrossFetch(url);
        const doc  = wiParseHTML(html);
        const imageUrl = doc.querySelector('img.album-art')?.src || wiGetMeta(doc, 'og:image');

        function getAlbumDetails() {
            const result = { date: '', label: '', catno: null };
            const rows = doc.querySelectorAll('table.album-details tr');
            for (const row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) continue;
                const key = cells[0].textContent.trim();
                const val = cells[1].textContent.trim();
                if (/^released$/i.test(key) && val) {
                    result.date = wiNormalizeDate(val);
                } else if (/^record.?label$/i.test(key) && val) {
                    result.label = val;
                } else if (/^catalogue/i.test(key) && val) {
                    result.catno = val;
                }
            }
            if (!result.label) {
                const pline = doc.querySelector('div.pline, .pline');
                if (pline) {
                    const m = pline.textContent.match(/[\u2117\u00a9]\s*\d{4}\s+(.+?)(?:\s+under\s|\s+licensed|\s+LLC|\s*$)/i);
                    if (m && m[1]) result.label = m[1].trim();
                }
            }
            return result;
        }

        function parsePsmFormatString(str) {
            if (!str) return { bitdepth: null, samplerate: null };
            const m = str.match(/([\d.]+)\s*kHz\s*[|\/]\s*(\d+)\s*-?\s*bit/i);
            if (!m) return { bitdepth: null, samplerate: null };
            return { samplerate: Math.round(parseFloat(m[1]) * 1000), bitdepth: parseInt(m[2], 10) };
        }

        function getAlbumFormat() {
            const fileKhz = doc.querySelector('span.filekhz');
            if (fileKhz) return parsePsmFormatString(fileKhz.textContent.trim());
            const trackFmt = doc.querySelector('td.track-format span.track-format');
            if (trackFmt) return parsePsmFormatString(trackFmt.textContent.trim());
            return { bitdepth: null, samplerate: null };
        }

        function parseTrackFormat(tr) {
            const fmtEl = tr.querySelector('td.track-format span.track-format');
            if (!fmtEl) return { bitdepth: null, samplerate: null };
            return parsePsmFormatString(fmtEl.textContent.trim());
        }

        function getArtistsArray() {
            return Array.from(doc.querySelectorAll('h2.ArtistName > a'))
                .map(a => a.textContent.trim()).filter(Boolean);
        }

        function parseTrackArtists(tr) {
            const small = tr.querySelector('td.track-name div.name small');
            if (!small) return [];
            return small.textContent.split(';').map(s => s.trim()).filter(Boolean);
        }

        const albumFormat = getAlbumFormat();
        const artistsArray = getArtistsArray();
        const htmlTrackRows = Array.from(doc.querySelectorAll('div.album-tracks div.tracks table tbody tr.track-playable'));

        let albumMeta = null;
        for (const s of doc.querySelectorAll('script:not([src])')) {
            const txt = s.textContent;
            const idx = txt.indexOf('PSM.album');
            if (idx < 0) continue;
            const start = txt.indexOf('{', idx);
            if (start < 0) continue;
            let depth = 0, end = -1;
            for (let i = start; i < txt.length; i++) {
                if (txt[i] === '{') depth++;
                else if (txt[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
            }
            if (end < 0) continue;
            try { albumMeta = JSON.parse(txt.slice(start, end + 1)); break; } catch(e) {}
        }

        if (albumMeta) {
            const artistStr = albumMeta.ArtistName || '';
            const artists = artistsArray.length > 0 ? artistsArray : (artistStr ? [artistStr] : []);
            const artist  = artists.join(', ');
            const title   = albumMeta.AlbumName || '';
            const details = getAlbumDetails();
            const label   = albumMeta.LabelName || albumMeta.RecordLabel || albumMeta.Label
                || albumMeta.PublisherName || albumMeta.CopyrightOwner || details.label;
            const catno   = albumMeta.CatalogNumber || details.catno;
            const rawDate = (albumMeta.OriginalReleaseDate || albumMeta.StreetDate
                || albumMeta.ReleaseDate || albumMeta.PublishDate || albumMeta.release_date || '').slice(0, 10);
            const date    = wiNormalizeDate(rawDate) || details.date;

            let { bitdepth, samplerate } = albumFormat;

            const filteredTracks = (albumMeta.tracks || []).filter(t => t.duration !== '0');
            const isMultiDisc = filteredTracks.some(t => parseInt(t.DiscSeq) > 1);

            const tracks = filteredTracks.map((t, i) => {
                const trackObj = {
                    position: isMultiDisc
                        ? `${t.DiscSeq}-${t.TrackSeq}`
                        : String(t.TrackSeq || i + 1),
                    title: t.TrackName || '',
                    duration: t.duration ? wiFormatDuration(parseInt(t.duration)) : '',
                };
                const jsonArtists = t.ArtistName
                    ? t.ArtistName.split(';').map(s => s.trim()).filter(Boolean)
                    : [];
                const htmlArtists = htmlTrackRows[i] ? parseTrackArtists(htmlTrackRows[i]) : [];
                const trackArtists = jsonArtists.length > 0 ? jsonArtists : htmlArtists;
                if (trackArtists.length > 0) trackObj.artists = trackArtists;
                if (!bitdepth && htmlTrackRows[i]) {
                    const fmt = parseTrackFormat(htmlTrackRows[i]);
                    if (fmt.bitdepth) { bitdepth = fmt.bitdepth; samplerate = fmt.samplerate; }
                }
                return trackObj;
            }).filter(t => t.title);

            const uniqueArtistGroups = [...new Set(tracks.map(t => (t.artists || []).join('|').toLowerCase()).filter(Boolean))];
            if (uniqueArtistGroups.length <= 1) tracks.forEach(t => delete t.artists);

            return { artist, artists, title, label, catno, date, bitdepth, samplerate, tracks, imageUrl, storeName: 'ProStudioMasters' };
        }

        const details = getAlbumDetails();
        const artist = artistsArray.join(', ') || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';
        const title  = doc.querySelector('h3.AlbumName')?.textContent?.trim() || wiGetMeta(doc, 'og:title');

        let { bitdepth, samplerate } = albumFormat;

        const rawTracks = htmlTrackRows.map((tr, i) => {
            const nameDiv = tr.querySelector('td.track-name div.name');
            let name = '';
            if (nameDiv) {
                name = Array.from(nameDiv.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE)
                    .map(n => n.textContent.trim()).filter(Boolean).join('');
                if (!name) {
                    const titleAttr = nameDiv.getAttribute('title') || '';
                    name = titleAttr.split('|')[0].trim();
                }
            }
            const pos  = tr.querySelector('div.num')?.firstChild?.textContent?.trim() || String(i + 1);
            const dur  = wiNormalizeDuration(tr.querySelector('td.right')?.textContent?.trim() || '');
            const trackArtists = parseTrackArtists(tr);
            if (!bitdepth) {
                const fmt = parseTrackFormat(tr);
                if (fmt.bitdepth) { bitdepth = fmt.bitdepth; samplerate = fmt.samplerate; }
            }
            return { position: pos, title: name, duration: dur, artists: trackArtists };
        });

        const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.artists.join('|').toLowerCase()).filter(Boolean))];
        const isVAPerTrack = uniqueArtistGroups.length > 1;

        const tracks = rawTracks
            .map(t => ({
                position: t.position,
                title: t.title,
                duration: t.duration,
                ...(isVAPerTrack && t.artists.length > 0 ? { artists: t.artists } : {})
            }))
            .filter(t => t.title);

        return { artist, artists: artistsArray, title, label: details.label, catno: details.catno, date: details.date, bitdepth, samplerate, tracks, imageUrl, storeName: 'ProStudioMasters' };
    }


    function parseISODuration(iso) {
        if (!iso) return 0;
        const s = String(iso).trim();
        const withT = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/i);
        if (withT && (withT[1] || withT[2] || withT[3]))
            return (parseInt(withT[1] || 0) * 3600) + (parseInt(withT[2] || 0) * 60) + parseFloat(withT[3] || 0);
        const noT = s.match(/^P(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
        if (noT && (noT[1] || noT[2] || noT[3]))
            return (parseInt(noT[1] || 0) * 3600) + (parseInt(noT[2] || 0) * 60) + parseFloat(noT[3] || 0);
        return 0;
    }

    function wiNormalizeDuration(raw) {
        if (!raw) return '';
        const s = String(raw).trim().replace(/^[\s(\[{]+|[\s)\]}]+$/g, '').trim();
        if (!s) return '';
        if (/^P/i.test(s)) {
            const sec = parseISODuration(s);
            return sec > 0 ? wiFormatDuration(sec) : '';
        }
        const parts = s.split(':').map(p => p.trim());
        if (parts.length === 2) {
            const m = parseInt(parts[0], 10), sec = parseInt(parts[1], 10);
            if (!isNaN(m) && !isNaN(sec)) return `${m}:${String(sec).padStart(2, '0')}`;
        }
        if (parts.length === 3) {
            const h = parseInt(parts[0], 10), m = parseInt(parts[1], 10), sec = parseInt(parts[2], 10);
            if (!isNaN(h) && !isNaN(m) && !isNaN(sec)) {
                if (h === 0) return `${m}:${String(sec).padStart(2, '0')}`;
                return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
            }
        }
        const n = parseFloat(s);
        if (!isNaN(n) && n > 0) return wiFormatDuration(n);
        return '';
    }


    async function wiParseMora(url) {
    const html = await wiCrossFetch(url);
    const doc  = wiParseHTML(html);
    const appArgEl = doc.querySelector('meta[name="msApplication-Arguments"][content]');
    if (!appArgEl) return wiGenericOG(doc, url, 'Mora');
    let appArgs;
    try { appArgs = JSON.parse(appArgEl.content); } catch(e) { return wiGenericOG(doc, url, 'Mora'); }
    const matNo = String(appArgs.materialNo).padStart(10, '0');
    let offset = 0;
    const parts = [4, 3, 3].map(len => { const s = matNo.slice(offset, offset += len); return s; });
    const pkgUrl = `https://cf.mora.jp/contents/${appArgs.type}/${appArgs.mountPoint}/${appArgs.labelId}/${parts.join('/')}/`;
    let pkg;
    try {
        const jsonp = await wiCrossFetch(pkgUrl + 'packageMeta.jsonp');
        const m = /^\s*\w+\(\s*(\{[\s\S]+\})\s*\);\s*$/.exec(jsonp);
        if (!m) return wiGenericOG(doc, url, 'Mora');
        pkg = JSON.parse(m[1]);
    } catch(e) { return wiGenericOG(doc, url, 'Mora'); }
    const rawArtist = pkg.artistName || '';
    const artistsArr = rawArtist
        .split(/,\s*|\s+&\s+/)
        .map(s => s.trim())
        .filter(Boolean);
    const artist  = rawArtist;
    const artists = artistsArr.length > 1 ? artistsArr : undefined;
    const title  = pkg.title || wiGetMeta(doc, 'og:title');
    const label  = pkg.labelcompanyname || pkg.displayLabelname || pkg.labelname || '';
    const catno  = pkg.distPartNo?.replace(/_\S+$/, '') || null;
    const date   = wiNormalizeDate(pkg.dispStartDate || pkg.dispStartDateStr || pkg.startDate || '');
    const imgBase = pkg.packageUrl || pkgUrl;
    const imageUrl = pkg.fullsizeimage ? imgBase + pkg.fullsizeimage : wiGetMeta(doc, 'og:image');
    const rawTracks = (pkg.trackList || []).map((t, i) => ({
        position: String(t.trackNo || i + 1),
        title:    t.title || '',
        duration: t.duration ? wiFormatDuration(parseInt(t.duration)) : '',
        artists:  t.artistName ? t.artistName.split(/,\s*|\s+&\s+/).map(s => s.trim()).filter(Boolean) : [],
    })).filter(t => t.title);
    const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.artists.join('|').toLowerCase()).filter(Boolean))];
    const isVAPerTrack = uniqueArtistGroups.length > 1;
    const tracks = rawTracks.map(t => ({
        position: t.position, title: t.title, duration: t.duration,
        ...(isVAPerTrack && t.artists.length > 0 ? { artists: t.artists } : {})
    }));
    return { artist, ...(artists ? { artists } : {}), title, label, catno, date, tracks, imageUrl, storeName: 'Mora' };
}
    async function wiParseOtotoy(url) {
        const html = await wiCrossFetch(url);
        const doc  = wiParseHTML(html);
        const artist = Array.from(doc.querySelectorAll('span.album-artist > *'))
            .map(el => el.textContent.trim()).filter(Boolean).join(', ')
            || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';
        const title  = doc.querySelector('h1.album-title')?.textContent?.trim() || wiGetMeta(doc, 'og:title');
        const label  = Array.from(doc.querySelectorAll('p.label-name > a')).map(a => a.textContent.trim()).join(' / ');
        const catnoEl = doc.querySelector('p.catalog-id');
        const catno  = catnoEl ? (catnoEl.textContent.replace(/^.*Catalog\s*number:\s*/i, '').trim() || null) : null;
        const dateEl  = doc.querySelector('p.release-day');
        const date    = dateEl ? wiNormalizeDate((/\d{4}-\d{2}-\d{2}/.exec(dateEl.textContent) || [''])[0]) : '';

    let bitdepth = null, samplerate = null;
    const specCells = doc.querySelectorAll('td.package_td4');
    const specTexts = specCells.length
        ? Array.from(specCells).map(el => el.textContent)
        : [doc.querySelector('div#package_data')?.textContent || ''];
    for (const s of specTexts) {
        const bdM = s.match(/\b(\d+)\s*bit/i);
        const srM = s.match(/\b([\d.]+)\s*kHz/i);
        if (bdM) { const v = parseInt(bdM[1], 10); if (v >= 16 && v <= 32 && (!bitdepth || v > bitdepth)) bitdepth = v; }
        if (srM) { const v = Math.round(parseFloat(srM[1]) * 1000); if (v >= 44100 && v <= 384000 && (!samplerate || v > samplerate)) samplerate = v; }
    }

        const rawImage = doc.querySelector('div#jacket-full-wrapper > img, img[itemprop="image"]')?.getAttribute('data-src')
            || doc.querySelector('div#jacket-full-wrapper > img, img[itemprop="image"]')?.src
            || wiGetMeta(doc, 'og:image')
            || '';
        let imageUrl = '', previewImageUrl = '';
        if (rawImage) {
            const base = rawImage.split('?')[0];
            const m = base.match(/^(https?:\/\/imgs\.ototoy\.jp\/.+?)(?:orig|_\d+)(\.jpe?g)$/i);
            if (m) {
                imageUrl        = m[1] + '_320' + m[2];
                previewImageUrl = m[1] + '_320' + m[2];
            } else {
                imageUrl = previewImageUrl = base;
            }
        }

        const rawTracks = Array.from(doc.querySelectorAll('table#tracklist > tbody > tr[class]')).map((tr, i) => {
            const titleTd = tr.querySelector('td.item:not(.center)');
            const name = titleTd?.querySelector('span[id^="title-"]')?.textContent?.trim() || '';
            const trackArtists = Array.from(titleTd?.querySelectorAll('a.artist') || [])
                .map(a => a.textContent.trim()).filter(Boolean);
            let dur = tr.querySelector('td.item.center')?.textContent?.trim() || '';
            if (dur) dur = wiNormalizeDuration(dur);
            if (!dur) {
                const m = tr.textContent.match(/(\d{1,3}:\d{2})/g);
                if (m) dur = wiNormalizeDuration(m[m.length - 1]);
            }
            return { position: String(i + 1), title: name, duration: dur, artists: trackArtists };
        }).filter(t => t.title);

        const uniqueArtistGroups = [...new Set(rawTracks.map(t => t.artists.join('|').toLowerCase()).filter(Boolean))];
        const isVAPerTrack = uniqueArtistGroups.length > 1;
        const tracks = rawTracks.map(t => ({
            position: t.position, title: t.title, duration: t.duration,
            ...(isVAPerTrack && t.artists.length > 0 ? { artists: t.artists } : {})
        }));

        return { artist, title, label, catno, date, bitdepth, samplerate, tracks, imageUrl, previewImageUrl, storeName: 'OTOTOY' };
    }

    async function wiParseKompakt(url) {
    const html = await wiCrossFetch(url);
    const doc  = wiParseHTML(html);
    const artist = doc.querySelector('div.player-data > ul.release > li.artist')?.textContent?.trim()
        || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';
    const title  = doc.querySelector('div.player-data > ul.release > li.title')?.textContent?.trim()
        || wiGetMeta(doc, 'og:title') || '';
    let label = '', date = '', catno = null;
    doc.querySelectorAll('div.mt-3 > div > div.mt-2').forEach(div => {
        const k = (div.querySelector(':scope > span.fw-bold')?.textContent || '').trim().replace(/:\s*$/, '').toLowerCase();
        const v = (div.querySelector(':scope h2')?.textContent?.trim()
            || div.querySelector(':scope > span:not(.fw-bold)')?.textContent?.trim()
            || '').trim();
        if (k === 'label')             label = v;
        else if (k === 'release date') date  = wiNormalizeDate(v);
        else if (k === 'cat no')       catno = v || null;
    });
    const imageUrl = wiGetMeta(doc, 'og:image');
    const tracks = Array.from(doc.querySelectorAll('div.player-data > ul.tracks > li.track')).map((li, i) => {
        const pos  = li.querySelector('li.position')?.textContent?.trim() || String(i + 1);
        const name = li.querySelector('li.title')?.textContent?.trim() || '';
        const dur  = wiNormalizeDuration(li.querySelector('li.duration')?.textContent?.trim() || '');
        return { position: pos, title: name, duration: dur };
    }).filter(t => t.title);
    return { artist, title, label, catno, date, tracks, imageUrl, fileType: 'AIFF', storeName: 'Kompakt' };
}

    async function wiParseEClassical(url) {
    const html = await wiCrossFetch(url);
    const doc  = wiParseHTML(html);

    const title = doc.querySelector('h1.h3, h1.h4')?.textContent?.trim()
               || wiGetMeta(doc, 'og:title');

    const catnoRaw = doc.querySelector('p.articlenumber')?.textContent?.trim() || '';
    const catno = catnoRaw.replace(/^.*?:\s*/, '').trim() || null;

    let label = '', artist = '';
    const performers = [], composers = [];

    const articleGroups = doc.querySelectorAll('div#showInArticlegroups .article-group');
    if (articleGroups.length > 0) {
        articleGroups.forEach(group => {
            const link = group.querySelector('a');
            if (!link) return;
            const urlParts = (link.getAttribute('href') || link.href || '').split('/').filter(Boolean);
            const category = (urlParts[urlParts.length - 2] || '').toLowerCase();
            const name = link.textContent.trim().replace(/^(.+?),\s+(.+)$/, '$2 $1');
            if (!name) return;
            if (category === 'performers')                               performers.push(name);
            else if (category === 'composers')                           composers.push(name);
            else if (category === 'labels')                              label = label ? label + ' / ' + name : name;
            else if (category === 'orchestras-ensembles' && !performers.includes(name)) performers.push(name);
            else if (category === 'conductors' && !performers.length)   performers.push(name);
        });
    } else {
        doc.querySelectorAll('div#showInArticlegroups .row').forEach(row => {
            const k = row.querySelector('b, strong')?.textContent?.trim().toLowerCase() || '';
            const allCols = row.querySelectorAll('[class*="col-"]');
            if (allCols.length < 2 || !k) return;
            const vEl = allCols[allCols.length - 1];
            const links = Array.from(vEl.querySelectorAll('a')).map(a =>
                a.textContent.trim().replace(/^(.+?),\s+(.+)$/, '$2 $1'));
            if (!links.length) return;
            if (k === 'performers')                performers.push(...links);
            else if (k === 'composers')            composers.push(...links);
            else if (k === 'labels')               label = links.join(' / ');
            else if (k === 'orchestras-ensembles') performers.push(...links.filter(l => !performers.includes(l)));
            else if (k === 'conductors' && !performers.length) performers.push(...links);
        });
    }

    const artistsArray = performers.length ? performers : composers;
    artist = artistsArray.join(', ') || wiGetMeta(doc, 'og:title').split(' - ')[0] || '';

    let date = '';
    doc.querySelectorAll('div#articleAttributes > div.row, div#articleAttributes .row').forEach(row => {
        const cols = row.querySelectorAll('[class*="col-"]');
        const k = cols[0]?.textContent?.trim().toLowerCase() || '';
        const v = cols[1]?.textContent?.trim() || '';
        if (/published date/i.test(k)) date = wiNormalizeDate(v);
    });

    let samplerate = null;
    const sampleRateText = doc.querySelector('div#sampleRate [class*="col-"]:last-child')
        ?.textContent?.trim() || '';
    if (sampleRateText) {
        const srMatch = sampleRateText.match(/(\d+)\s*[Hh]z/);
        if (srMatch) samplerate = parseInt(srMatch[1], 10);
    }

    let bitdepth = null;
    const studioRadio = Array.from(doc.querySelectorAll('input.quality-choice'))
        .find(el => (el.getAttribute('data-quality') || '').toLowerCase().includes('studio'));
    if (studioRadio) {
        const formats = (studioRadio.getAttribute('data-entitled-formats') || '').split(',').map(s => s.trim());
        if (formats.includes('flac_24'))      bitdepth = 24;
        else if (formats.includes('flac_16')) bitdepth = 16;
    }
    if (!bitdepth) {
        const anyRadio = doc.querySelector('input.quality-choice');
        if (anyRadio) {
            const formats = (anyRadio.getAttribute('data-entitled-formats') || '').split(',').map(s => s.trim());
            if (formats.includes('flac_24'))      bitdepth = 24;
            else if (formats.includes('flac_16')) bitdepth = 16;
        }
    }
    if (!bitdepth && samplerate) bitdepth = 16;

    const rawImage = doc.querySelector('a[data-image]')?.getAttribute('data-image')
                  || doc.querySelector('div.prodimg img, .ratio img')?.getAttribute('src')
                  || wiGetMeta(doc, 'og:image')
                  || '';
    const imageUrl = rawImage ? rawImage.split('?')[0] : '';

    const tracks = [];
    try {
        const container = doc.querySelector('div#related-articles-container');
        const relationLists = JSON.parse(container?.getAttribute('data-article-relation-lists') || '[]');
        const articles      = JSON.parse(container?.getAttribute('data-article-related-list-articles') || '[]');
        const byUid         = Object.fromEntries(articles.map(a => [String(a.uid), a.name?.en || '']));
        const seen          = new Set();
        relationLists.flatMap(rl => rl.articles || []).forEach(uid => {
            if (seen.has(uid)) return;
            seen.add(uid);
            const name = byUid[String(uid)] || '';
            if (name) tracks.push({ position: String(tracks.length + 1), title: name, duration: '' });
        });
    } catch (e) {
        doc.querySelectorAll('ul#article-list > li.track').forEach((li, i) => {
            const name = li.querySelector('div > div')?.textContent?.replace(/^\d+\.\s*/, '').trim() || '';
            if (name) tracks.push({ position: String(i + 1), title: name, duration: '' });
        });
    }

    return { artist, artists: artistsArray, title, label, catno, date, tracks, imageUrl, bitdepth, samplerate, storeName: 'eClassical' };
}
    async function wiParseGenericURL(url, storeName) {
        const html = await wiCrossFetch(url);
        const doc = wiParseHTML(html);
        if (doc.querySelector('[data-tralbum]') ||
            wiGetMeta(doc, 'og:site_name').toLowerCase() === 'bandcamp') {
            log('Detected Bandcamp page via content sniff', 'info');
            return wiParseBandcamp(url, html);
        }
        return wiGenericOG(doc, url, storeName || detectStoreName(url));
    }

    async function wiFetchReleaseData(url) {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');
        if (host.endsWith('discogs.com'))
            throw new Error('This import link is not valid.\nPaste a Discogs release URL or release ID to import credits.');
        if (host.endsWith('music.apple.com'))      return wiParseAppleMusic(url);
        if (host.endsWith('7digital.com'))         return wiParse7digital(url);
        if (host.endsWith('beatport.com'))         return wiParseBeatport(url);
        if (host.endsWith('bandcamp.com') || (u.hostname.split('.').length >= 3 && !u.hostname.startsWith('www.') && u.pathname.startsWith('/album/')))
            return wiParseBandcamp(url);
        if (host.endsWith('traxsource.com'))       return wiParseTraxsource(url);
        if (host.endsWith('volumo.com'))           return wiParseVolumo(url);
        if (host.endsWith('junodownload.com'))     return wiParseJunoDownload(url);
        if (host.endsWith('qobuz.com'))            return wiParseQobuz(url);
        if (host.endsWith('prestomusic.com'))      return wiParsePrestoMusic(url);
        if (host.endsWith('highresaudio.com'))     return wiParseHighResAudio(url);
        if (host.endsWith('nativedsd.com'))        return wiParseNativeDSD(url);
        if (host.endsWith('hdtracks.com'))         return wiParseHDtracks(url);
        if (host.endsWith('bleep.com'))            return wiParseBleep(url);
        if (host.endsWith('boomkat.com'))          return wiParseBoomkat(url);
        if (host.endsWith('prostudiomasters.com')) return wiParseProStudioMasters(url);
        if (host.endsWith('eclassical.com'))       return wiParseEClassical(url);
        if (host.endsWith('kompakt.fm'))           return wiParseKompakt(url);
        if (host.endsWith('ototoy.jp'))            return wiParseOtotoy(url);
        if (host.endsWith('mora.jp'))           return wiParseMora(url);
        return wiParseGenericURL(url, detectStoreName(url));
    }

    function _applyThemeToWebImporter(overlay, isDark) {
        if (!overlay) return;
        const previewEl = overlay.querySelector('#dh-wi-preview');
        const urlInput  = overlay.querySelector('#dh-wi-url');
        const cancelBtn = overlay.querySelector('#dh-wi-cancel');
        const closeBtn  = overlay.querySelector('#dh-wi-close');
        const titleEl   = overlay.querySelector('.dh-wi-header strong');
        const header    = overlay.querySelector('.dh-wi-header');
        const footer    = overlay.querySelector('.dh-wi-footer');
        if (isDark) {
            overlay.style.background  = '#111216';
            overlay.style.color       = '#ddd';
            overlay.style.borderColor = '#262626';
            if (header)    header.style.borderBottomColor = 'rgba(255,255,255,0.07)';
            if (footer)    footer.style.borderTopColor    = 'rgba(255,255,255,0.07)';
            if (urlInput)  { urlInput.style.background = '#1a1c1f'; urlInput.style.color = '#ddd'; urlInput.style.borderColor = '#333'; }
            if (previewEl) { previewEl.style.background = '#1a1c1f'; previewEl.style.borderColor = '#333'; }
            if (cancelBtn) { cancelBtn.style.background = '#1f2224'; cancelBtn.style.color = '#ddd'; cancelBtn.style.borderColor = '#333'; }
            if (closeBtn)  closeBtn.style.color = '#ddd';
            if (titleEl)   titleEl.style.color  = '#eee';
        } else {
            overlay.style.background  = '#fff';
            overlay.style.color       = '#111';
            overlay.style.borderColor = '#ccc';
            if (header)    header.style.borderBottomColor = 'rgba(0,0,0,0.09)';
            if (footer)    footer.style.borderTopColor    = 'rgba(0,0,0,0.07)';
            if (urlInput)  { urlInput.style.background = '#fff'; urlInput.style.color = '#222'; urlInput.style.borderColor = '#ccc'; }
            if (previewEl) { previewEl.style.background = '#f8f9fa'; previewEl.style.borderColor = '#e0e0e0'; }
            if (cancelBtn) { cancelBtn.style.background = '#f1f3f5'; cancelBtn.style.color = '#111'; cancelBtn.style.borderColor = '#ccc'; }
            if (closeBtn)  closeBtn.style.color = '#555';
            if (titleEl)   titleEl.style.color  = '#111';
        }
    }

    const ALLOWED_COUNTRIES = [
        'Australia',
        'Belgium',
        'Brazil',
        'Canada',
        'China',
        'Cuba',
        'France',
        'Germany',
        'Italy',
        'Ireland',
        'India',
        'Jamaica',
        'Japan',
        'Mexico',
        'Netherlands',
        'New Zealand',
        'Spain',
        'Sweden',
        'Switzerland',
        'UK',
        'US',
        'Africa',
        'Asia',
        'Benelux',
        'Australasia',
        'Central America',
        'Europe',
        'Gulf Cooperation Council',
        'Middle East',
        'North America (inc Mexico)',
        'South America',
        'Scandinavia',
        'South East Asia',
        'Worldwide',
        'Afghanistan',
        'Abkhazia',
        'Albania',
        'Algeria',
        'American Samoa',
        'Andorra',
        'Angola',
        'Anguilla',
        'Antarctica',
        'Antigua & Barbuda',
        'Argentina',
        'Armenia',
        'Aruba',
        'Austria',
        'Azerbaijan',
        'Bahamas, The',
        'Bahrain',
        'Bangladesh',
        'Barbados',
        'Belarus',
        'Belize',
        'Benin',
        'Bermuda',
        'Bhutan',
        'Bolivia',
        'Bosnia & Herzegovina',
        'Botswana',
        'British Indian Ocean Territory',
        'British Virgin Islands',
        'Brunei',
        'Bulgaria',
        'Burkina Faso',
        'Burma',
        'Burundi',
        'Cambodia',
        'Cameroon',
        'Cape Verde',
        'Cayman Islands',
        'Central African Republic',
        'Chad',
        'Chile',
        'Christmas Island',
        'Cocos (Keeling) Islands',
        'Colombia',
        'Comoros',
        'Congo, Democratic Republic of the',
        'Congo, Republic of the',
        'Cook Islands',
        'Costa Rica',
        'Croatia',
        'Curaçao',
        'Cyprus',
        'Czech Republic',
        'Denmark',
        'Djibouti',
        'Dominica',
        'Dominican Republic',
        'East Timor',
        'Ecuador',
        'Egypt',
        'El Salvador',
        'Equatorial Guinea',
        'Eritrea',
        'Estonia',
        'Ethiopia',
        'Falkland Islands',
        'Faroe Islands',
        'Fiji',
        'Finland',
        'French Guiana',
        'French Polynesia',
        'French Southern & Antarctic Lands',
        'Gabon',
        'Gambia, The',
        'Gaza Strip',
        'Georgia',
        'Ghana',
        'Gibraltar',
        'Greece',
        'Greenland',
        'Grenada',
        'Guadeloupe',
        'Guam',
        'Guatemala',
        'Guernsey',
        'Guinea',
        'Guinea-Bissau',
        'Guyana',
        'Haiti',
        'Honduras',
        'Hong Kong',
        'Hungary',
        'Iceland',
        'Indonesia',
        'Iran',
        'Iraq',
        'Israel',
        'Ivory Coast',
        'Isle Of Man',
        'Jersey',
        'Jordan',
        'Kazakhstan',
        'Kenya',
        'Kiribati',
        'Kuwait',
        'Kosovo',
        'Kyrgyzstan',
        'Laos',
        'Latvia',
        'Lebanon',
        'Lesotho',
        'Liberia',
        'Libya',
        'Liechtenstein',
        'Lithuania',
        'Luxembourg',
        'Macau',
        'Macedonia',
        'Madagascar',
        'Malawi',
        'Malaysia',
        'Maldives',
        'Mali',
        'Malta',
        'Marshall Islands',
        'Martinique',
        'Mauritania',
        'Mauritius',
        'Mayotte',
        'Micronesia, Federated States of',
        'Moldova, Republic of',
        'Monaco',
        'Mongolia',
        'Montserrat',
        'Montenegro',
        'Morocco',
        'Mozambique',
        'Namibia',
        'Nauru',
        'Nepal',
        'New Caledonia',
        'Nicaragua',
        'Niger',
        'Nigeria',
        'Niue',
        'Norfolk Island',
        'Northern Mariana Islands',
        'North Korea',
        'Norway',
        'Oman',
        'Pakistan',
        'Palau',
        'Palestine',
        'Panama',
        'Papua New Guinea',
        'Paraguay',
        'Peru',
        'Philippines',
        'Pitcairn Islands',
        'Poland',
        'Portugal',
        'Puerto Rico',
        'Qatar',
        'Reunion',
        'Romania',
        'Russia',
        'Rwanda',
        'Saint Helena',
        'Saint Kitts and Nevis',
        'Saint Lucia',
        'Saint Pierre and Miquelon',
        'Saint Vincent and the Grenadines',
        'Samoa',
        'San Marino',
        'Sao Tome and Principe',
        'Saudi Arabia',
        'Senegal',
        'Serbia',
        'Seychelles',
        'Sierra Leone',
        'Singapore',
        'Sint Maarten',
        'Slovakia',
        'Slovenia',
        'Solomon Islands',
        'Somalia',
        'South Africa',
        'South Georgia and the South Sandwich Islands',
        'South Korea',
        'South Pacific',
        'Southern Sudan',
        'Sri Lanka',
        'Sudan',
        'Suriname',
        'Swaziland',
        'Syria',
        'Taiwan',
        'Tajikistan',
        'Tanzania',
        'Thailand',
        'Togo',
        'Tibet',
        'Tokelau',
        'Tonga',
        'Trinidad & Tobago',
        'Tunisia',
        'Turkey',
        'Turkmenistan',
        'Turks and Caicos Islands',
        'Tuvalu',
        'Uganda',
        'Ukraine',
        'United Arab Emirates',
        'Uruguay',
        'Uzbekistan',
        'Vanuatu',
        'Vatican City',
        'Venezuela',
        'Vietnam',
        'Virgin Islands',
        'Wake Island',
        'Wallis and Futuna',
        'West Bank',
        'Western Sahara',
        'Yemen',
        'Zambia',
        'Zanzibar',
        'Zimbabwe'
    ];

    const COUNTRY_ALIAS_MAP = new Map([
        ['north america', 'North America (inc Mexico)'],
        ['united states', 'US'],
        ['united states of america', 'US'],
        ['usa', 'US'],
        ['alabama', 'US'],
        ['alaska', 'US'],
        ['arizona', 'US'],
        ['arkansas', 'US'],
        ['california', 'US'],
        ['colorado', 'US'],
        ['connecticut', 'US'],
        ['delaware', 'US'],
        ['district of columbia', 'US'],
        ['florida', 'US'],
        ['georgia', 'US'],
        ['hawaii', 'US'],
        ['idaho', 'US'],
        ['illinois', 'US'],
        ['indiana', 'US'],
        ['iowa', 'US'],
        ['kansas', 'US'],
        ['kentucky', 'US'],
        ['louisiana', 'US'],
        ['maine', 'US'],
        ['maryland', 'US'],
        ['massachusetts', 'US'],
        ['michigan', 'US'],
        ['minnesota', 'US'],
        ['mississippi', 'US'],
        ['missouri', 'US'],
        ['montana', 'US'],
        ['nebraska', 'US'],
        ['nevada', 'US'],
        ['new hampshire', 'US'],
        ['new jersey', 'US'],
        ['new mexico', 'US'],
        ['new york', 'US'],
        ['north carolina', 'US'],
        ['north dakota', 'US'],
        ['ohio', 'US'],
        ['oklahoma', 'US'],
        ['oregon', 'US'],
        ['pennsylvania', 'US'],
        ['rhode island', 'US'],
        ['south carolina', 'US'],
        ['south dakota', 'US'],
        ['tennessee', 'US'],
        ['texas', 'US'],
        ['utah', 'US'],
        ['vermont', 'US'],
        ['virginia', 'US'],
        ['washington', 'US'],
        ['west virginia', 'US'],
        ['wisconsin', 'US'],
        ['wyoming', 'US'],

        ['england', 'UK'],
        ['gb', 'UK'],
        ['great britain', 'UK'],
        ['northern ireland', 'UK'],
        ['scotland', 'UK'],
        ['united kingdom', 'UK'],
        ['wales', 'UK'],

        ['czechia', 'Czech Republic'],
        ['eu', 'Europe'],
        ['holland', 'Netherlands'],
        ['moldova', 'Moldova, Republic of'],
        ['russian federation', 'Russia'],
        ['the netherlands', 'Netherlands'],

        ['syrian arab republic', 'Syria'],
        ['uae', 'United Arab Emirates'],

        ['brunei darussalam', 'Brunei'],
        ['dprk', 'North Korea'],
        ['korea', 'South Korea'],
        ['lao peoples democratic republic', 'Laos'],
        ['macao', 'Macau'],
        ['myanmar', 'Burma'],

        ['congo', 'Congo, Republic of the'],
        ['cote divoire', 'Ivory Coast'],
        ['democratic republic of congo', 'Congo, Democratic Republic of the'],
        ['drc', 'Congo, Democratic Republic of the'],
        ['gambia', 'Gambia, The'],

        ['bahamas', 'Bahamas, The'],
        ['micronesia', 'Micronesia, Federated States of'],

        ['bolivarian republic of venezuela', 'Venezuela'],
    ]);

    const LOWERCASE_ALLOWED_COUNTRIES = new Map(ALLOWED_COUNTRIES.map(c => [c.toLowerCase(), c]));

    function generateCountryVariants(officialName) {
        const variants = new Set();
        if (officialName.includes(' & ')) variants.add(officialName.replace(/ & /g, ' and '));
        if (officialName.includes(' and ')) variants.add(officialName.replace(/ and /g, ' & '));
        const parenMatch = officialName.match(/^(.+?)\s*\([^)]*\)\s*$/);
        if (parenMatch) variants.add(parenMatch[1].trim());
        const ofMatch = officialName.match(/^(.+?),\s*((?:Federated States|Republic|Democratic Republic) of(?: the)?)$/i);
        if (ofMatch) {
            variants.add(`${ofMatch[2]} ${ofMatch[1]}`);
            variants.add(ofMatch[1].trim());
        }
        const theMatch = officialName.match(/^(.+?),\s*The$/i);
        if (theMatch) {
            variants.add(`The ${theMatch[1]}`);
            variants.add(theMatch[1].trim());
        }
        variants.delete(officialName);
        return Array.from(variants);
    }

    const COUNTRY_VARIANT_MAP = (() => {
        const owners = new Map();
        for (const official of ALLOWED_COUNTRIES) {
            for (const variant of generateCountryVariants(official)) {
                const key = variant.toLowerCase();
                if (!owners.has(key)) owners.set(key, new Set());
                owners.get(key).add(official);
            }
        }
        const map = new Map();
        for (const [variant, ownerSet] of owners) {
            if (ownerSet.size === 1) map.set(variant, Array.from(ownerSet)[0]);
        }
        return map;
    })();

    function normalizeCountryName(raw) {
        if (!raw) return '';
        const cleaned = raw.replace(/\./g, '').trim().toLowerCase();
        if (!cleaned) return '';
        const aliased = COUNTRY_ALIAS_MAP.get(cleaned);
        if (aliased) return aliased;
        const direct = LOWERCASE_ALLOWED_COUNTRIES.get(cleaned);
        if (direct) return direct;
        return COUNTRY_VARIANT_MAP.get(cleaned) || '';
    }

    function parseCountryFromLocationText(locationText) {
        if (!locationText) return '';
        const parts = locationText.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length === 0) return '';
        const lastPart = parts[parts.length - 1];
        const normalized = normalizeCountryName(lastPart);
        if (normalized) return normalized;
        if (parts.length > 1) {
            const secondLast = parts[parts.length - 2];
            const normalizedSecondLast = normalizeCountryName(secondLast);
            if (normalizedSecondLast) return normalizedSecondLast;
        }
        return '';
    }

    const TITLE_FORMAT = {
        'Mini-Album':         ['mini-album', 'mini album'],
        'EP':                 ['EP', 'E.P', 'E.P.', 'extended play'],
        'Maxi-Single':        ['maxi-single', 'maxi single'],
        'Compilation':        ['compilation', 'compiled by'],
        'Mixed':              ['DJ Mix'],
        'Reissue':            ['reissue', 're-issue'],
        'Remastered':         ['remastered', 're-mastered', 'remaster'],
        'Sampler':            ['sampler'],
        'Unofficial Release': ['unofficial release', 'unofficial', 'non-official', 'non official'],
        'Single':             ['single'],
        'Album':              ['album'],
    };

    function buildKeywordRegex(keyword, description) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const startsWord = /^[A-Za-z0-9]/.test(keyword);
        const endsWord = /[A-Za-z0-9]$/.test(keyword);
        let prefix = startsWord ? '(?<![A-Za-z0-9])' : '';
        if (description === 'Album') prefix = '(?<!mini[- ]?)' + prefix;
        if (description === 'Single') prefix = '(?<!maxi[- ]?)' + prefix;
        return prefix + escaped + (endsWord ? '(?![A-Za-z0-9])' : '');
    }

    function extractFormatFromTitle(title) {
        if (!title) return [];
        const detected = [];
        for (const [description, keywords] of Object.entries(TITLE_FORMAT)) {
            const joined = keywords.map(k => buildKeywordRegex(k, description)).join('|');
            const re = new RegExp(joined, 'i');
            if (re.test(title)) detected.push(description);
        }
        return detected;
    }

    async function wiSetFormatDescriptions(title, wiFields = null) {
        const knownValues = Object.keys(TITLE_FORMAT);
        const allCbs = Array.from(document.querySelectorAll('input[type="checkbox"][value]'))
            .filter(cb => knownValues.includes(cb.value));
        for (const cb of allCbs) {
            if (wiFields) wiFields.push({ el: cb, oldVal: cb.value, oldChecked: cb.checked, isCb: true });
            if (cb.checked) cb.click();
        }
        const detected = extractFormatFromTitle(title);
        for (const description of detected) {
            const cb = allCbs.find(c => c.value === description);
            if (cb && !cb.checked) cb.click();
        }
        return detected;
    }

    async function wiSetFormatToFile(trackCount, fileType = 'FLAC') {
    const formatSelect = document.querySelector('#release-format-select');
    if (!formatSelect) { log('Format select not found', 'warning'); return; }
    setReactValue(formatSelect, 'File');

    const cb = await wiWaitForElement(`input[type="checkbox"][value="${fileType}"]`, 6000);
    if (cb) {
        const cbContainer = cb.closest('ul, div, fieldset, section') || document.body;
        const allTypeCbs = cbContainer.querySelectorAll('input[type="checkbox"]');
        for (const other of allTypeCbs) {
            if (other !== cb && other.checked) other.click();
        }
        if (!cb.checked) cb.click();
    } else {
        log(`${fileType} checkbox not found — select manually`, 'warning');
    }
    if (trackCount > 0) {
        const qtyInput = document.querySelector('li[data-path^="/format/"] input[size="2"]');
        if (qtyInput) setReactValue(qtyInput, String(trackCount));
    }
}

    async function wiUploadImage(imageUrl, storeName) {
    if (!imageUrl) return;
    log('Fetching cover image...', 'info');
    try {
        const blob = await Promise.race([
            new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: 'GET', url: imageUrl, responseType: 'blob',
                        onload: r => resolve(r.response),
                        onerror: () => reject(new Error('Image fetch failed')),
                        timeout: 20000,
                    });
                    return;
                }
                const runtimeId = (typeof chrome !== 'undefined' && chrome.runtime?.id)
                    || (typeof browser !== 'undefined' && browser.runtime?.id);
                if (runtimeId) {
                    const api = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
                    try {
                        api.sendMessage({ type: 'dh_fetch_blob', url: imageUrl }, response => {
                            const err = (typeof chrome !== 'undefined' && chrome.runtime?.lastError)
                                || (typeof browser !== 'undefined' && browser.runtime?.lastError);
                            if (err || !response || !response.ok) {
                                fetch(imageUrl).then(r => r.blob()).then(resolve).catch(reject);
                                return;
                            }
                            const binary = atob(response.base64);
                            const bytes = new Uint8Array(binary.length);
                            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                            resolve(new Blob([bytes], { type: 'image/jpeg' }));
                        });
                    } catch(e) {
                        fetch(imageUrl).then(r => r.blob()).then(resolve).catch(reject);
                    }
                    return;
                }
                fetch(imageUrl).then(r => r.blob()).then(resolve).catch(reject);
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Image fetch timed out')), 25000)),
        ]);

        const needsConvert = storeName === 'Presto Music'
            || blob.size > 3.9 * 1024 * 1024
            || !/image\/(jpeg|jpg|png|gif)/.test(blob.type)
            || /\.webp$/i.test(imageUrl);

        const finalBlob = needsConvert ? await wiConvertImageToJpeg(blob, 600) : blob;

        const ext = needsConvert ? 'jpg'
            : (imageUrl.match(/\.(jpe?g|png|gif)(?:\?|$)/i)?.[1] || 'jpg');
        const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };
        const file = new File([finalBlob], `cover.${ext}`,
            { type: mimeMap[ext.toLowerCase()] || 'image/jpeg' });

        const fileInput = document.querySelector('#image_uploader_beta input[type="file"]')
            || document.querySelector('.uploader input[type="file"]')
            || document.querySelector('input[type="file"][accept*="image"]');

        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files').set;
            if (nativeSetter) {
                nativeSetter.call(fileInput, dataTransfer.files);
            } else {
                Object.defineProperty(fileInput, 'files', { value: dataTransfer.files, writable: true });
            }
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input',  { bubbles: true }));
            log('Cover image queued for upload', 'success');
            return;
        }

        const dropZone = document.getElementById('image_uploader_beta')
            || document.querySelector('[id*="uploader"] label, .uploader [tabindex="0"]');
        if (!dropZone) { log('Image upload area not found', 'warning'); return; }
        const dt = new DataTransfer();
        dt.items.add(file);
        dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        log('Cover image queued for upload', 'success');
    } catch(e) {
        log('Cover image: ' + e.message, 'warning');
    }
}

function wiConvertImageToJpeg(blob, maxDim = 600) {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            let w = img.naturalWidth  || img.width;
            let h = img.naturalHeight || img.height;
            if (w > maxDim || h > maxDim) {
                if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
                else        { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width  = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob(
                jpegBlob => resolve(jpegBlob || blob),
                'image/jpeg',
                0.90
            );
        };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(blob); };
        img.src = objectUrl;
    });
}
    function wiNormalizeDate(raw) {
        if (!raw) return '';
        const s = String(raw).trim();
        if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return s;
        try {
            const d = new Date(s);
            if (!isNaN(d.getTime())) {
                const Y = d.getFullYear();
                const M = String(d.getMonth() + 1).padStart(2, '0');
                const D = String(d.getDate()).padStart(2, '0');
                return `${Y}-${M}-${D}`;
            }
        } catch(e) {}
        const dmy = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
        if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
        const partial = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
        if (partial) {
            const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
            const m = monthNames.indexOf(partial[1].toLowerCase().slice(0,3));
            if (m >= 0) return `${partial[2]}-${String(m+1).padStart(2,'0')}`;
        }
        return s.slice(0, 10);
    }

  function wiDetectVA(data) {
        if (!data.tracks || data.tracks.length === 0) return false;
        if (data.artist && (data.artist.toLowerCase().includes('various artists') || /v\/a/i.test(data.artist))) return true;
        const trackArtistSets = data.tracks.map(t =>
            (t.artists || []).map(a => a.trim().toLowerCase()).join('|')
        ).filter(s => s !== "");
        const uniqueSets = [...new Set(trackArtistSets)];
        return uniqueSets.length > 1;
    }

  function wiSetTextareaValue(el, value) {
    if (!el || !el.isConnected) return;
    el.focus();
    el.select();
    const ok = document.execCommand('insertText', false, value);
    if (!ok || el.value !== value) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        const node = el.wrappedJSObject || el;
        const tracker = node._valueTracker;
        if (tracker) tracker.setValue('');
        nativeSetter.call(el, value);
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }
    el.blur();
}

    function wiActivateShield(storeName = '', shieldTimeout = 30000) {
        const origScrollTo       = window.scrollTo.bind(window);
        const origScrollIntoView = Element.prototype.scrollIntoView;
        const origPushState      = history.pushState.bind(history);
        const origReplaceState   = history.replaceState.bind(history);
        try { window.scrollTo = () => {}; } catch(e) {}
        try { Element.prototype.scrollIntoView = function() {}; } catch(e) {}
        let _pendingStateChange = null;
        try { history.pushState    = (...args) => { _pendingStateChange = { fn: origPushState,    args }; }; } catch(e) {}
        try { history.replaceState = (...args) => { _pendingStateChange = { fn: origReplaceState, args }; }; } catch(e) {}

        const _staleOverlay = document.getElementById('dh-import-processing-loader');
        if (_staleOverlay) _staleOverlay.remove();
        const _staleShield = document.getElementById('dh-import-shield-style');
        if (_staleShield) _staleShield.remove();

        let processingOverlay = null;
        let shield            = null;

        if (!processingOverlay) {
            processingOverlay = document.createElement('div');
            processingOverlay.id = 'dh-import-processing-loader';
            processingOverlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: #fff; z-index: 999999; display: flex;
                flex-direction: column; align-items: center; justify-content: center;
                font-family: Arial, sans-serif; transition: opacity 0.4s;
            `;
            const isDark = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark';
            if (isDark) {
                processingOverlay.style.background = '#111216';
                processingOverlay.style.color = '#ddd';
            }
            processingOverlay.innerHTML = `
                <div style="font-size: 24px; margin-bottom: 20px;">Applying Metadata...</div>
                <div style="font-size: 14px; opacity: 0.7;">${storeName ? 'Importing from ' + storeName + ' to Discogs' : 'Working...'}</div>
                <div style="font-size: 12px; opacity: 0.5; margin-top: 10px;">Keep this page active during the process</div>
                <div id="dh-shield-eta" style="font-size: 12px; opacity: 0.42; margin-top: 8px; min-height: 16px;"></div>
                <div style="margin-top: 22px; width: 50px; height: 50px; border: 5px solid rgba(0,0,0,0.1); border-top-color: #28a745; border-radius: 50%; animation: dh-spin 1s linear infinite;"></div>
                <style>@keyframes dh-spin { to { transform: rotate(360deg); } }</style>
            `;
            processingOverlay.setAttribute('tabindex', '-1');
            document.body.appendChild(processingOverlay);
            processingOverlay.focus();
        }

        if (!shield) {
            shield = document.createElement('style');
            shield.id = 'dh-import-shield-style';
            shield.textContent = `
                form.release_editor, #page_content > .content_area, .release_edit_block, #page {
                    opacity: 0 !important;
                    pointer-events: none !important;
                }
            `;
            document.head.appendChild(shield);
        }

        let _scrollToTopOnRestore = false;
        let _cancelled = false;
        let _done = false;
        let _countdownInterval = null;
        let _timeoutHandle = null;
        const _etaHandle = null;

        const restoreAll = () => {
            _done = true;
            clearTimeout(_timeoutHandle);
            clearInterval(_countdownInterval);
            clearTimeout(_etaHandle);
            try { window.removeEventListener('keydown', _escHandler, true); } catch(e) {}
            try { window.scrollTo = origScrollTo; } catch(e) {}
            try { Element.prototype.scrollIntoView = origScrollIntoView; } catch(e) {}
            try { history.pushState    = origPushState; } catch(e) {}
            try { history.replaceState = origReplaceState; } catch(e) {}
            if (_pendingStateChange) {
                try { _pendingStateChange.fn(..._pendingStateChange.args); } catch(e) {}
            }
            processingOverlay.style.opacity = '0';
            setTimeout(() => {
                processingOverlay.remove();
                shield.remove();
                if (_scrollToTopOnRestore) {
                    window.scrollTo(0, 0);
                    const a = document.querySelector('input[data-type="artist-name"], #artist-name-input');
                    if (a) a.focus();
                }
            }, 400);
        };

        const _escHandler = (e) => {
            if (e.key !== 'Escape') return;
            _cancelled = true;
            restoreAll();
            log('Import cancelled by user (ESC)', 'warning');
        };
        window.addEventListener('keydown', _escHandler, true);

        _timeoutHandle = setTimeout(() => {
            if (_done) return;
            let count = 3;
            const countdownEl = document.createElement('div');
            countdownEl.style.cssText = 'font-size: 13px; color: #dc3545; margin-top: 12px; font-weight: 600;';
            countdownEl.textContent = `Error occurred, exiting in ${count}...`;
            processingOverlay.appendChild(countdownEl);
            _countdownInterval = setInterval(() => {
                if (_done) { clearInterval(_countdownInterval); return; }
                count--;
                if (count > 0) {
                    countdownEl.textContent = `Error occurred, exiting in ${count}...`;
                } else {
                    clearInterval(_countdownInterval);
                    log('Import timed out after 30s, shield removed', 'error');
                    restoreAll();
                }
            }, 1000);
        }, shieldTimeout);

        return { processingOverlay, shield, origScrollTo, origScrollIntoView, restoreAll,
                 get cancelled() { return _cancelled; },
                 get scrollToTopOnRestore() { return _scrollToTopOnRestore; },
                 set scrollToTopOnRestore(v) { _scrollToTopOnRestore = v; } };
    }

    async function wiSmartCleanupForReimport(incomingData) {
        const historySnapshot = [...state.actionHistory];

        await wiClearAllStyles();

        const combinedPreReactIds = new Set();
        for (const action of historySnapshot) {
            if (action.type === 'webImport')
                for (const id of (action.preImageReactIds || [])) combinedPreReactIds.add(id);
        }
        const newThumbs = Array.from(document.querySelectorAll('span.thumbnail_link[data-reactid]'))
            .filter(el => !combinedPreReactIds.has(el.dataset.reactid));
        for (const thumb of newThumbs) {
            const container = thumb.closest('li, div.image_item, div[class*="image"]') || thumb.parentElement?.parentElement;
            if (!container) continue;
            const delBtn = Array.from(container.querySelectorAll('a, button, [role="button"]')).find(el => {
                const t = (el.textContent || '').trim().toLowerCase();
                const c = (el.className || '').toLowerCase();
                const h = (el.getAttribute('title') || el.getAttribute('aria-label') || '').toLowerCase();
                return t === 'delete' || t === 'remove' || t === '×' || t === '✕' || t === 'x'
                    || c.includes('delete') || c.includes('remove')
                    || h.includes('delete') || h.includes('remove');
            });
            if (delBtn) { delBtn.click(); await new Promise(r => setTimeout(r, 200)); }
        }
        if (newThumbs.length > 0) {
            await new Promise(r => setTimeout(r, 300));
            log('Smart cleanup: previous cover image removed', 'info');
        }

        const incomingType = (incomingData.fileType || 'FLAC').toUpperCase();
        const checkedTypeCbs = Array.from(
            document.querySelectorAll('input[type="checkbox"][value]')
        ).filter(cb => cb.checked && cb.value.toUpperCase() !== incomingType
            && ['FLAC','MP3','AAC','ALAC','WAV','AIFF','OGG','OPUS','DSD'].includes(cb.value.toUpperCase()));
        for (const cb of checkedTypeCbs) cb.click();
        if (checkedTypeCbs.length > 0)
            log(`Smart cleanup: unchecked file type(s) ${checkedTypeCbs.map(c=>c.value).join(', ')}`, 'info');

        const allAddedRows = [];
        for (const action of historySnapshot) {
            if (action.type === 'webImport' && action.tracklistAction?.addedRows)
                allAddedRows.push(...action.tracklistAction.addedRows.filter(r => r?.isConnected));
            if (action.type === 'tracklistImport' && action.addedRows)
                allAddedRows.push(...action.addedRows.filter(r => r?.isConnected));
        }
        if (allAddedRows.length > 0) {
            try { await removeTracksBatch(allAddedRows); }
            catch(e) { log('Smart cleanup: track removal error — ' + e.message, 'warning'); }
            log(`Smart cleanup: removed ${allAddedRows.length} extra track row(s)`, 'info');
        }

        const allArtistFields = [];
        for (const action of historySnapshot) {
            const tla = action.type === 'webImport' ? action.tracklistAction : action;
            if (tla?.changes) {
                for (const change of tla.changes)
                    if (change.addedArtistFields?.length > 0) allArtistFields.push(...change.addedArtistFields);
            }
        }
        if (allArtistFields.length > 0) {
            for (const field of allArtistFields) {
                const creditItem = field.artistContainer || null;
                let removeEl = null;
                if (creditItem) {
                    const li = creditItem.tagName?.toLowerCase() === 'li'
                        ? creditItem
                        : creditItem.closest?.('li.editable_item') || creditItem.closest?.('li');
                    if (li?.isConnected) removeEl = findRemoveButtonIn(li);
                }
                if (!removeEl && field.removeButton?.isConnected) removeEl = field.removeButton;
                if (removeEl?.isConnected) { try { dispatchMouseClick(removeEl); } catch(e) {} }
            }
            await new Promise(r => setTimeout(r, 200));
            log(`Smart cleanup: removed ${allArtistFields.length} VA track artist field(s)`, 'info');
        }

        const allCreditRemoveBtns = [];
        for (const action of historySnapshot) {
            if ((action.type === 'webImport' || action.type === 'discogsCreditsImport') && action.addedCreditRemoveBtns?.length > 0)
                allCreditRemoveBtns.push(...action.addedCreditRemoveBtns.filter(b => b?.isConnected));
        }
        if (allCreditRemoveBtns.length > 0) {
            for (const btn of [...allCreditRemoveBtns].reverse()) {
                try { btn.click(); } catch(e) {}
                await new Promise(r => setTimeout(r, 40));
            }
            await new Promise(r => setTimeout(r, 200));
            log(`Smart cleanup: removed ${allCreditRemoveBtns.length} credit row(s)`, 'info');
        }

        state.actionHistory = [];
    }

    function withTimeout(promise, ms, label) {
        let done = false;
        const wrapped = promise.then(v => { done = true; return v; }, e => { done = true; throw e; });
        return Promise.race([
            wrapped,
            new Promise(resolve => setTimeout(() => {
                if (!done) log(`${label} timed out after ${ms / 1000}s, skipping`, 'warning');
                resolve();
            }, ms))
        ]);
    }

    function buildTracksPresplit(tracks) {
        return tracks.map(t => {
            if (!state.splitImport) {
                if (!t.artists || t.artists.length === 0) return t;
                return { ...t, artistsWithJoins: t.artists.map((a, i) => ({ name: a, joinBefore: i > 0 ? '/' : undefined })) };
            }
            if (!t.artists || t.artists.length === 0) return t;
            let flatEntries = [];
            t.artists.forEach((a, i) => {
                const parts = wiSplitArtistForImport(a);
                parts.forEach((p, j) => {
                    if (i > 0 && j === 0 && !p.joinBefore) p = { ...p, joinBefore: '/' };
                    flatEntries.push(p);
                });
            });
            return { ...t, artistsWithJoins: flatEntries };
        });
    }
    function convertJoinsToDiscogsFormat(entries) {
        if (!entries || entries.length === 0) return [{ name: '', join: '' }];
        return entries.map((e, i) => {
            const name = (typeof e === 'string') ? e : (e.name || '');
            const nextEntry = entries[i + 1];
            const nextJoin = nextEntry ? ((typeof nextEntry === 'string') ? ',' : (nextEntry.joinBefore || ',')) : '';
            return { name, join: i < entries.length - 1 ? nextJoin : '' };
        });
    }

    function extractRemixersFromTracks(tracks) {
        const activeTokens = getActiveRemixTokens();
        const remixPatternWords = activeTokens.map(p => patternToRegex(p)).join('|');
        const remixByPatternWords = CONFIG.REMIX_BY_PATTERNS.map(p => patternToRegex(p)).join('|');
        const remixByRegexFull = new RegExp(`\\b(?:${remixByPatternWords})\\b`, 'i');
        const splitterRegex = buildSplitterRegexNoGlobal();
        const remixAnyPattern = [remixPatternWords, remixByPatternWords].filter(Boolean).join('|');
        const remixAnyRegex = remixAnyPattern ? new RegExp(`\\b(?:${remixAnyPattern})\\b`, 'i') : null;

        function normalizeForCompare(name) {
            if (!name) return '';
            return String(name).replace(/\s*\(\d+\)\s*$/g, '').replace(/^[\(\[]+|[\)\]]+$/g, '').trim().toLowerCase();
        }
        function cleanParts(rawParts) {
            const out = [];
            for (let raw of rawParts) {
                const orig = String(raw || '').trim();
                if (!orig) continue;
                let cleaned = orig.replace(getRemixByRegex(), '').replace(/^by\s+/i, '');
                cleaned = cleanupArtistName(cleaned, true).replace(/[\(\[]+$/g, '').replace(/^[\)\]]+/g, '').trim();
                if (orig.startsWith('[') && !cleaned.endsWith(']')) cleaned = '[' + cleaned.replace(/^\[+/, '') + ']';
                if (orig.startsWith('(') && !cleaned.endsWith(')')) cleaned = '(' + cleaned.replace(/^\(+/, '') + ')';
                out.push(cleaned);
            }
            return out;
        }

        const results = [];
        for (let i = 0; i < tracks.length; i++) {
            const title = (tracks[i].title || '').trim();
            if (!title) continue;
            const pos = tracks[i].position || String(i + 1);
            const seen = new Set();
            const containerRegex = /([\(\[\uFF08\uFF3B]\s*(.*?)\s*[\)\]\uFF09\uFF3D])/g;
            let m;
            while ((m = containerRegex.exec(title)) !== null) {
                const inner = (m[2] || '').trim();
                if (!inner) continue;
                if (/^\s*original(?:\s+(?:mix|version|dub|edit|instrumental|vocal|radio\s+edit|club\s+mix|extended\s+mix))?\s*$/i.test(inner)) continue;
                let remixes = [];
                const remByRegex = new RegExp(`(?:${remixByPatternWords})\\s+(.+)$`, 'i');
                const remByMatch = inner.match(remByRegex);
                if (remByMatch && remByMatch[1]) {
                    let raw = remByMatch[1].trim().replace(/^[-–—]\s*/, '').replace(/^by\s+/i, '').trim();
                    const featTokens = CONFIG.FEATURING_PATTERNS.map(escapeRegExp).join('|');
                    const featMatch = new RegExp(`(?:${featTokens})`, 'i').exec(raw);
                    if (featMatch) {
                        const before = raw.substring(0, featMatch.index).trim();
                        remixes = cleanParts(before.split(splitterRegex).map(s => s.trim()).filter(Boolean));
                    } else {
                        remixes = cleanParts(raw.split(splitterRegex).map(s => s.trim()).filter(Boolean));
                    }
                } else if (remixAnyRegex) {
                    const remMatch = inner.match(remixAnyRegex);
                    if (!remMatch) continue;
                    const beforeRemix = inner.substring(0, remMatch.index).trim();
                    const afterRemix = inner.substring(remMatch.index + remMatch[0].length).trim();
                    if (!beforeRemix && afterRemix) {
                        const featTokens = CONFIG.FEATURING_PATTERNS.map(escapeRegExp).join('|');
                        const featMatch = new RegExp(`(?:${featTokens})`, 'i').exec(afterRemix);
                        const cand = featMatch ? afterRemix.substring(0, featMatch.index).trim() : afterRemix;
                        remixes = cleanParts(cand.split(splitterRegex).map(s => s.trim()).filter(Boolean));
                    } else if (beforeRemix) {
                        if (hasSplitterToken(beforeRemix)) {
                            remixes = cleanParts(beforeRemix.split(splitterRegex).map(s => s.trim()).filter(Boolean));
                        } else {
                            const p = cleanParts([beforeRemix]);
                            if (p.length) remixes = [p[0]];
                        }
                    }
                }
                remixes.forEach(r => { const n = normalizeForCompare(r); if (!seen.has(n)) { seen.add(n); results.push({ name: r, roles: ['Remix'], trackPositions: pos }); } });
            }
        }
        return results;
    }

    function extractFeaturingFromTracks(tracks) {
        const featPattern = buildFeaturingPattern();
        const remixTerminatorPattern = getAllRemixTokensRegex();
        const results = [];

        function normalizeForCompare(name) {
            if (!name) return '';
            return String(name).replace(/\s*\(\d+\)\s*$/g, '').replace(/^[\(\[]+|[\)\]]+$/g, '').trim().toLowerCase();
        }

        const globalSeen = new Set();
        for (let i = 0; i < tracks.length; i++) {
            const title = (tracks[i].title || '').trim();
            if (!title) continue;
            const pos = tracks[i].position || String(i + 1);
            const featSearchRegex = new RegExp(`(${featPattern})\\s*(.*?)(?=\\b(?:${remixTerminatorPattern})\\b|[\\(\\)\\[\\]]|$)`, 'gi');
            let match;
            while ((match = featSearchRegex.exec(title)) !== null) {
                let featArtistsText = match[2].trim();
                if (!featArtistsText) continue;
                const parts = splitArtistsByConfiguredPatterns(featArtistsText);
                parts.forEach(p => {
                    const n = normalizeForCompare(p);
                    if (!globalSeen.has(n)) { globalSeen.add(n); results.push({ name: p, roles: ['Featuring'], trackPositions: pos }); }
                });
            }
        }
        return results;
    }

    function buildDraftPayload(data, sourceUrl) {
        const { label, catno, date, bitdepth, samplerate, fileType, freeText: dataFreeText, country: dataCountry } = data;
        const cf = state.capitalizeFields;
        const capIf = (flag, s) => flag && s ? capitalizeTitleString(s) : s;
        const title   = capIf(cf.albumTitle, data.title) || '';
        const _rawArtist = data.artist || '';
        const _isVAName = (s) => /^(various\s*artists?|v\.?\s*a\.?|v\/a)$/i.test(s.trim());
        const artist  = _isVAName(_rawArtist) ? 'Various' : capIf(cf.albumArtists, _rawArtist);
        const artists = data.artists?.map(a => _isVAName(a) ? 'Various' : capIf(cf.albumArtists, a));

        const artistsToFill = (() => {
            if (artists && artists.length > 0) return artists.map((a, i) => ({ name: a, joinBefore: i > 0 ? '/' : undefined }));
            if (!artist) return [];
            if (state.splitImport) {
                const split = wiSplitArtistForImport(artist);
                if (split.length > 1) return split.map(e => ({ ...e, joinBefore: e.joinBefore && cf.joiners ? capitalizeTitleString(e.joinBefore) : e.joinBefore }));
            }
            return [{ name: artist }];
        })();
        const payloadArtists = convertJoinsToDiscogsFormat(artistsToFill.length > 0 ? artistsToFill : [{ name: '' }]);

        let lbl = capIf(cf.label, (label || '').trim());
        if (!lbl || (artist.trim() && lbl.toLowerCase() === artist.trim().toLowerCase())) lbl = `Not On Label (${artist.trim()} Self-released)`;

        const resolvedCountry = (state.importCountry && dataCountry) ? dataCountry : 'Worldwide';

        const releaseFormat = state.importAutoDescr ? extractFormatFromTitle(title) : [];
        let freeText = dataFreeText || null;
        if (bitdepth && samplerate) freeText = `${bitdepth}-bit/${(samplerate / 1000)}kHz`;

        const tracksRaw = data.tracks ? data.tracks.map(t => ({
            ...t,
            title: capIf(cf.trackTitles, t.title),
            artists: t.artists ? t.artists.map(a => _isVAName(a) ? 'Various' : capIf(cf.vaArtists, a)) : t.artists,
            artistsWithJoins: t.artistsWithJoins ? t.artistsWithJoins.map(e => ({ ...e, name: capIf(_isVAName(e.name) ? false : cf.vaArtists, e.name) })) : t.artistsWithJoins,
        })) : [];
        const isVA = wiDetectVA(data);
        const tracksPresplit = buildTracksPresplit(tracksRaw);

        const remixersByPos  = new Map();
        const featByPos      = new Map();
        if (state.importAutoRemixers) {
            for (const { name, trackPositions } of extractRemixersFromTracks(tracksPresplit)) {
                const p = String(trackPositions);
                if (!remixersByPos.has(p)) remixersByPos.set(p, []);
                remixersByPos.get(p).push({ name, role: 'Remix' });
            }
        }
        if (state.importAutoFeat) {
            for (const { name, trackPositions } of extractFeaturingFromTracks(tracksPresplit)) {
                const p = String(trackPositions);
                if (!featByPos.has(p)) featByPos.set(p, []);
                featByPos.get(p).push({ name, role: 'Featuring' });
            }
        }

        function groupForApi(arr) {
            if (!arr || !arr.length) return [];
            const nameKeys = new Map();
            const roleGroups = new Map();
            arr.forEach(({ name, role }) => {
                if (!name || !role) return;
                const key = name.trim().toLowerCase();
                if (!nameKeys.has(key)) { nameKeys.set(key, name.trim()); roleGroups.set(key, new Set()); }
                roleGroups.get(key).add(role.trim());
            });
            return Array.from(nameKeys.entries()).map(([key, n]) => ({ name: n, role: Array.from(roleGroups.get(key)).sort().join(', ') }));
        }

        const payloadTracks = tracksPresplit.map(t => {
            const pos = t.position || '';
            const trackLevelCredits = [
                ...(remixersByPos.get(pos) || []),
                ...(featByPos.get(pos) || []),
            ];
            return {
                pos,
                title: t.title || '',
                duration: t.duration || '',
                artists: (isVA && t.artistsWithJoins && t.artistsWithJoins.length > 0) ? convertJoinsToDiscogsFormat(t.artistsWithJoins) : [],
                extraartists: groupForApi(trackLevelCredits),
            };
        });

        const payloadExtraArtists = (() => {
            if (!state.importCredits) return [];
            const dedupedCredits = (data.credits && data.credits.length > 0) ? mergeCreditsForApply(data.credits) : [];
            return dedupedCredits.map(({ name, anv, roles, trackPositions }) => {
                const capName = cf.creditNames ? capitalizeTitleString(name) : name;
                const entry = { name: capName, role: roles.join(', ') };
                if (anv) entry.anv = anv;
                if (trackPositions) entry.tracks = trackPositions;
                return entry;
            });
        })();

        const submissionNotes = sourceUrl
            ? `Metadata imported with Discogs Edit Helper.\nRelease URL: ${sourceUrl}`
            : 'Metadata imported with Discogs Edit Helper.';

        const payload = {
            title,
            artists: payloadArtists,
            extraartists: payloadExtraArtists,
            country: resolvedCountry,
            released: date ? wiNormalizeDate(date) : '',
            labels: [{ name: lbl, catno: catno || 'none', entity_type: '1' }],
            format: [{
                name: 'File',
                qty: String(tracksPresplit.length || 1),
                desc: [fileType || 'FLAC', ...releaseFormat],
                text: freeText || '',
            }],
            tracks: payloadTracks,
            notes: '',
            submissionNotes,
        };

        return {
            _previewObject: payload,
            full_data: JSON.stringify(payload),
            sub_notes: submissionNotes,
            cover: data.imageUrl || null,
        };
    }

    function wiDiscogsApiRequest(options, retries = 2) {
        const isFormData = options.data instanceof FormData;

        const attempt = (currentTry) => new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest === 'undefined') {
                if (options.responseType === 'blob') {
                    const _extApi = (typeof browser !== 'undefined' && browser.runtime?.id)
                        ? browser.runtime
                        : (typeof chrome !== 'undefined' && chrome.runtime?.id)
                        ? chrome.runtime : null;
                    if (_extApi) {
                        try {
                            _extApi.sendMessage({ type: 'dh_fetch_blob', url: options.url }, response => {
                                const lastErr = (typeof chrome !== 'undefined' && chrome.runtime?.lastError)
                                             || (typeof browser !== 'undefined' && browser.runtime?.lastError);
                                if (lastErr || !response || !response.ok) {
                                    reject(new Error(lastErr?.message || 'Blob fetch failed'));
                                    return;
                                }
                                const binary = atob(response.base64);
                                const bytes  = new Uint8Array(binary.length);
                                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                                resolve(new Blob([bytes], { type: response.mimeType || 'image/jpeg' }));
                            });
                        } catch(e) {
                            reject(e);
                        }
                        return;
                    }
                }
                const controller = new AbortController();
                const timeoutId  = setTimeout(() => controller.abort(), options.timeout || 20000);
                const fetchOpts  = {
                    method:      options.method || 'GET',
                    credentials: 'include',
                    signal:      controller.signal,
                };
                if (options.data && !isFormData) {
                    fetchOpts.body = options.data;
                } else if (isFormData) {
                    fetchOpts.body = options.data;
                }
                if (options.headers && Object.keys(options.headers).length) {
                    fetchOpts.headers = options.headers;
                }
                fetch(options.url, fetchOpts)
                    .then(r => {
                        clearTimeout(timeoutId);
                        if (r.status >= 200 && r.status < 300) {
                            if (options.responseType === 'json')  return r.json();
                            if (options.responseType === 'blob')  return r.blob();
                            return r.text();
                        }
                        throw new Error(`HTTP Error: ${r.status}`);
                    })
                    .then(resolve)
                    .catch(err => {
                        clearTimeout(timeoutId);
                        reject(err);
                    });
                return;
            }

            GM_xmlhttpRequest({
                method:       options.method || 'GET',
                url:          options.url,
                data:         options.data,
                headers:      options.headers || {},
                responseType: options.responseType || 'text',
                timeout:      options.timeout || 20000,
                anonymous:    false,
                fetch:        isFormData ? true : undefined,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        if (options.responseType === 'json') {
                            try {
                                resolve(typeof response.response === 'object' && response.response !== null ? response.response : JSON.parse(response.responseText));
                            } catch (e) { reject(new Error('Failed to parse JSON response')); }
                        } else {
                            resolve(options.responseType === 'blob' ? response.response : response.responseText);
                        }
                    } else {
                        reject(new Error(`HTTP Error: ${response.status} ${response.statusText || ''}`.trim()));
                    }
                },
                onerror:   () => reject(new Error('Network error')),
                ontimeout: () => reject(new Error('Request timed out')),
            });
        }).catch((error) => {
            if (currentTry < retries) return attempt(currentTry + 1);
            throw error;
        });
        return attempt(0);
    }

    async function wiSaveReleaseAsDraft(data, sourceUrl) {
        await setInfoProcessing();
        log(`Saving release from ${data.storeName || 'store'} as draft...`, 'info');

        try {
            const built = buildDraftPayload(data, sourceUrl);

            const basePayload = JSON.parse(built.full_data);

            if (data.tags && data.tags.length > 0 && state.importStyles) {
                const gsMap = wiMatchTagsToGenresStyles(data.tags);
                const genresArr = [];
                const stylesArr = [];
                for (const [genre, styleSet] of (gsMap || new Map())) {
                    genresArr.push(genre);
                    stylesArr.push(...styleSet);
                }
                if (genresArr.length > 0) basePayload.genre = genresArr;
                if (stylesArr.length > 0) basePayload.style = stylesArr;
            }

            const formData = new FormData();
            formData.append('full_data', JSON.stringify(basePayload));
            formData.append('sub_notes', built.sub_notes);

            const jsonResponse = await wiDiscogsApiRequest({
                method: 'POST',
                url: 'https://www.discogs.com/submission/release/create',
                data: formData,
                responseType: 'json',
            });

            if (!jsonResponse?.id) throw new Error('Response missing release ID');
            const releaseId = jsonResponse.id;
            log(`Draft created (release ID ${releaseId})`, 'success');

            let coverUploadFailed = false;
            if (built.cover) {
                try {
                    const coverBlob = await wiDiscogsApiRequest({ url: built.cover, method: 'GET', responseType: 'blob' });

                    const storeName = data.storeName || '';
                    const needsConvert = storeName === 'Presto Music'
                        || coverBlob.size > 3.9 * 1024 * 1024
                        || !/image\/(jpeg|jpg|png|gif)/.test(coverBlob.type)
                        || /\.webp$/i.test(built.cover);

                    const finalBlob = needsConvert ? await wiConvertImageToJpeg(coverBlob, 600) : coverBlob;

                    const imageFormData = new FormData();
                    imageFormData.append('image', finalBlob, 'cover.jpg');
                    imageFormData.append('pos', '1');
                    await wiDiscogsApiRequest({
                        method: 'POST',
                        url: `https://www.discogs.com/release/${releaseId}/images/upload`,
                        data: imageFormData,
                    });
                    log('Cover image uploaded', 'success');
                } catch (e) {
                    coverUploadFailed = true;
                    log('Cover upload failed — please add it manually', 'warning');
                }
            }

            const draftUrl = `https://www.discogs.com/release/edit/${releaseId}`;
            if (typeof GM_openInTab !== 'undefined') {
                GM_openInTab(draftUrl, true);
            } else {
                window.open(draftUrl, '_blank');
            }

            await clearInfoProcessing();
            setInfoSingleLine('Done! Draft created in new tab', true);

            if (coverUploadFailed) {
                log('Done! Draft created, but cover upload failed — please review before publishing', 'warning');
            } else {
                log('Done! Draft created in new tab', 'success');
            }
            return releaseId;

        } catch (err) {
            await clearInfoProcessing();
            throw err;
        }
    }

    async function wiApplyRelease(data, sourceUrl = '', existingShield = null) {
        const { label, catno, date, imageUrl, bitdepth, samplerate, fileType, freeText: dataFreeText, storeName, country: dataCountry } = data;
        const cf = state.capitalizeFields;
        const capIf = (flag, s) => flag && s ? capitalizeTitleString(s) : s;
        const title   = capIf(cf.albumTitle, data.title);
        const _rawArtist = data.artist || '';
        const _isVAName = (s) => /^(various\s*artists?|v\.?\s*a\.?|v\/a)$/i.test(s.trim());
        const artist  = _isVAName(_rawArtist) ? 'Various' : capIf(cf.albumArtists, _rawArtist);
        const artists = data.artists?.map(a => _isVAName(a) ? 'Various' : capIf(cf.albumArtists, a));
        const tracks  = data.tracks ? data.tracks.map(t => ({
            ...t,
            title: capIf(cf.trackTitles, t.title),
            artists: t.artists ? t.artists.map(a => _isVAName(a) ? 'Various' : capIf(cf.vaArtists, a)) : t.artists,
            artistsWithJoins: t.artistsWithJoins ? t.artistsWithJoins.map(e => ({ ...e, name: capIf(_isVAName(e.name) ? false : cf.vaArtists, e.name), joinBefore: e.joinBefore && cf.joiners ? capitalizeTitleString(e.joinBefore) : e.joinBefore })) : t.artistsWithJoins,
            joinBefore: t.joinBefore,
        })) : data.tracks;
        const isVA = wiDetectVA(data);
        log(`Applying release from ${storeName}... (VA Mode: ${isVA})`, 'info');

        const _sh = existingShield || wiActivateShield(storeName);
        const { origScrollTo, origScrollIntoView, restoreAll } = _sh;

        try {
            const wiFields = [];
            const snap   = (el) => { if (el) wiFields.push({ el, oldVal: el.value, oldChecked: el.type === 'checkbox' ? el.checked : undefined }); };
            const snapCb = (el) => { if (el) wiFields.push({ el, oldVal: el.value, oldChecked: el.checked, isCb: true }); };

            snap(document.querySelector('input[data-type="artist-name"]'));
            snap(document.querySelector('#release-title-input'));
            snap(document.querySelector('#label-name-input-0'));
            snap(document.querySelector('#catalog-number-input-0'));
            snap(document.querySelector('#release-date'));
            snap(document.querySelector('#release-submission-notes-textarea'));

            const artistsToFill = (() => {
                if (artists && artists.length > 0) return artists.map((a, i) => ({ name: a, joinBefore: i > 0 ? '/' : undefined }));
                if (!artist) return [];
                if (state.splitImport) {
                    const split = wiSplitArtistForImport(artist);
                    if (split.length > 1) return split;
                }
                return [{ name: artist }];
            })();
            const addedArtistRemoveBtns = [];

            const existingArtistRows = Array.from(document.querySelectorAll('input[data-type="artist-name"]'));
            if (existingArtistRows.length > 1) {
                const extraRemoveBtns = existingArtistRows.slice(1)
                    .map(inp => inp.closest('li')?.querySelector('button.drag_drop_field_remove_row'))
                    .filter(Boolean);
                for (const btn of [...extraRemoveBtns].reverse()) {
                    try { btn.click(); } catch(e) {}
                    await new Promise(r => setTimeout(r, 40));
                }
                const deadline = Date.now() + 2000;
                while (document.querySelectorAll('input[data-type="artist-name"]').length > 1 && Date.now() < deadline) {
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            if (artistsToFill.length > 0) {
                const firstInput = document.querySelector('input[data-type="artist-name"]');
                if (firstInput) setReactValue(firstInput, artistsToFill[0].name || artistsToFill[0]);
                if (artistsToFill.length > 1) {
                    const extraCount = artistsToFill.length - 1;
                    for (let i = 0; i < extraCount; i++) {
                        const addArtistBtn = document.querySelector('[data-path="/artists"] > button.button-small');
                        if (addArtistBtn) addArtistBtn.click();
                    }
                    await withTimeout(wiWaitForCount(() => document.querySelectorAll('input[data-type="artist-name"]').length, artistsToFill.length), 10000, 'Artist fields');
                    const allInputs = document.querySelectorAll('input[data-type="artist-name"]');
                    for (let i = 1; i < artistsToFill.length; i++) {
                        const entry = artistsToFill[i];
                        const input = allInputs[i];
                        if (input) {
                            setReactValue(input, entry.name || entry);
                            const row = input.closest('li');
                            if (row) addedArtistRemoveBtns.push(row.querySelector('button'));
                        }
                    }
                    await new Promise(r => setTimeout(r, 150));
                    const artistsSection = document.querySelector('[data-path="/artists"]') || document.body;
                    const allJoinInputs = Array.from(artistsSection.querySelectorAll('input[size="10"]'));
                    for (let i = 1; i < artistsToFill.length; i++) {
                        const entry = artistsToFill[i];
                        if (!entry.joinBefore) continue;
                        const joinInput = allJoinInputs[i - 1];
                        if (joinInput) setReactValue(joinInput, cf.joiners && entry.joinBefore ? capitalizeTitleString(entry.joinBefore) : entry.joinBefore);
                    }
                }
            }

            if (artistsToFill.length > 0) log(`Artist: ${artistsToFill.map(e => e.name || e).join(' / ')}`, 'success');

            if (title) { setReactValue(document.querySelector('#release-title-input'), title); log(`Title: ${title}`, 'success'); }
            const labelEl = document.querySelector('#label-name-input-0');
            if (labelEl) {
                let lbl = capIf(cf.label, (label || '').trim());
                if (!lbl || (artist.trim() && lbl.toLowerCase() === artist.trim().toLowerCase())) lbl = `Not On Label (${artist.trim()} Self-released)`;
                setReactValue(labelEl, lbl);
                log(`Label: ${lbl} / Cat: ${catno || 'none'}`, 'success');
            }
            setReactValue(document.querySelector('#catalog-number-input-0'), catno || 'none');
            if (date) setReactValue(document.querySelector('#release-date'), wiNormalizeDate(date));

            const countryEl = document.querySelector('#release-country-select');
            const wiPreImageReactIds = new Set(Array.from(document.querySelectorAll('span.thumbnail_link[data-reactid]')).map(el => el.dataset.reactid));

            const _formatCbs = Array.from(document.querySelectorAll('input[type="checkbox"][value]'))
                .filter(cb => ['FLAC','MP3','AAC','ALAC','WAV','AIFF','OGG','OPUS','DSD'].includes((cb.value||'').toUpperCase()));
            for (const cb of _formatCbs) snapCb(cb);
            const _formatSelect = document.querySelector('#release-format-select');
            if (_formatSelect) snap(_formatSelect);
            await withTimeout(wiSetFormatToFile(tracks.length, fileType || 'FLAC'), 10000, 'Format');

            let freeText = dataFreeText || null;
            if (bitdepth && samplerate) freeText = `${bitdepth}-bit/${(samplerate/1000)}kHz`;
            const freeTextField = await withTimeout(wiWaitForElement('#free-text-input-0', 3000), 5000, 'Free text field');
            if (freeTextField) { snap(freeTextField); setReactValue(freeTextField, freeText || ''); }
            log(`Format: File / ${fileType || 'FLAC'}${freeText ? ' [' + freeText + ']' : ''}`, 'success');

            if (state.importAutoDescr) {
                const detectedDescr = await wiSetFormatDescriptions(title, wiFields);
                if (detectedDescr.length > 0) log(`Description: ${detectedDescr.join(', ')}`, 'success');
            }

            if (countryEl) {
                snap(countryEl);
                const resolvedCountry = (state.importCountry && dataCountry) ? dataCountry : 'Worldwide';
                setReactValue(countryEl, resolvedCountry);
                log(`Country: ${resolvedCountry}`, 'success');
            }

            const addedCreditRemoveBtns = [];
            let tracklistAction = null;
            if (tracks.length > 0) {
                const origAdd = addActionToHistory;
                addActionToHistory = (action) => { if (action.type === 'tracklistImport') tracklistAction = action; };
                const tracksPresplit = buildTracksPresplit(tracks);
                await withTimeout(applyTracklist(tracksPresplit, isVA, true), Math.max(20000, tracksPresplit.length * 300), 'Tracklist');
                addActionToHistory = origAdd;
                log(`Tracklist: ${tracks.length} track${tracks.length !== 1 ? 's' : ''} applied`, 'success');
                if (state.importAutoRemixers) {
                    const origAdd2 = addActionToHistory;
                    addActionToHistory = (action) => {
                        if (action.type === 'remixers' && action.changes) {
                            for (const ch of action.changes) if (ch.removeButton) addedCreditRemoveBtns.push(ch.removeButton);
                        }
                    };
                    await extractRemixers(false, true);
                    addActionToHistory = origAdd2;
                }
                if (state.importAutoFeat) {
                    const origAdd2 = addActionToHistory;
                    addActionToHistory = (action) => {
                        if (action.type === 'featuring' && action.changes) {
                            for (const ch of action.changes) if (ch.removeButton) addedCreditRemoveBtns.push(ch.removeButton);
                        }
                    };
                    await extractFeaturing(true);
                    addActionToHistory = origAdd2;
                }
            }

            if (data.tags && data.tags.length > 0 && state.importStyles) {
                const genreStyleMap = wiMatchTagsToGenresStyles(data.tags);
                if (genreStyleMap.size > 0) {
                    const genreSnaps = await withTimeout(wiApplyGenresAndStyles(genreStyleMap), 10000, 'Genres/Styles');
                    if (genreSnaps.length > 0) wiFields.push(...genreSnaps);
                    const matched = [];
                    for (const [g, ss] of genreStyleMap) matched.push(`${g}: ${[...ss].join(', ')}`);
                    log(`Genres/Styles: ${matched.join(' | ')}`, 'success');
                } else {
                    const genreOnlyMap = new Map();
                    for (const tag of data.tags) {
                        const key = String(tag).toLowerCase().replace(/[^a-z0-9]/g, '');
                        const genreMatch = Object.keys(DISCOGS_GENRE_CHECKBOX_ID).find(g =>
                            g.toLowerCase().replace(/[^a-z0-9]/g, '') === key
                        );
                        if (genreMatch && !genreOnlyMap.has(genreMatch)) genreOnlyMap.set(genreMatch, new Set());
                    }
                    if (genreOnlyMap.size > 0) {
                        const genreSnaps = await withTimeout(wiApplyGenresAndStyles(genreOnlyMap), 10000, 'Genres/Styles');
                        if (genreSnaps.length > 0) wiFields.push(...genreSnaps);
                        log(`Genres/Styles: Only genre was found: ${[...genreOnlyMap.keys()].join(', ')}`, 'info');
                    } else {
                        log(`No Discogs genre/style matches found in tags`, 'info');
                    }
                }
            }

            if (sourceUrl) {
                const snEl = document.querySelector('#release-submission-notes-textarea')
                    || await withTimeout(wiWaitForElement('#release-submission-notes-textarea', 3000), 5000, 'Submission notes textarea');
                if (snEl) {
                    const urlLine = 'Metadata imported with Discogs Edit Helper.\nRelease URL: ' + sourceUrl;
                    const existing = snEl.value.replace(/Metadata imported with Discogs Edit Helper\.\n?Release URL:.*$/m, '').trimEnd();
                    const newVal = existing ? existing + '\n' + urlLine : urlLine;
                    wiSetTextareaValue(snEl, newVal);
                    log('Submission Notes: release URL added', 'success');
                } else {
                    log('Submission Notes: textarea not found', 'warning');
                }
            }

                        for (const btn of document.querySelectorAll('button.image_delete')) {
                try { btn.click(); } catch(e) {}
                await new Promise(r => setTimeout(r, 300));
            }
            await withTimeout(wiUploadImage(imageUrl, storeName), 10000, 'Image upload');

            if (state.importCredits) {
                if (data.credits && data.credits.length > 0) {
                    if (data.creditsSource === 'about') log('No credits section — credits imported from About notes', 'info');
                    await wiApplyReleaseCredits(data.credits, wiFields, addedCreditRemoveBtns);
                } else {
                    if (data.creditsSource === 'none' || !data.credits || data.credits.length === 0) {
                        log('No credits found', 'info');
                    }
                }
            }

            addActionToHistory({
                type: 'webImport',
                fields: wiFields,
                tracklistAction,
                preImageReactIds: wiPreImageReactIds,
                addedArtistRemoveBtns,
                addedCreditRemoveBtns,
            });

            log(`Done! Imported from ${storeName}`, 'success');
            setInfoSingleLine(`Done! Imported from ${storeName}`, true);

        } catch(e) {
            log('Apply error: ' + e.message, 'error');
            throw e;
        } finally {
            restoreAll();
        }
    }


    async function wiParseDiscogsCredits(input) {
        const trimmed = input.trim();
        let releaseId = null;
        if (/^\d+$/.test(trimmed)) {
            releaseId = trimmed;
        } else {
            const m = trimmed.match(/discogs\.com\/(?:[a-z]{2}\/)?release(?:\/edit)?\/(\d+)/i);
            if (m) releaseId = m[1];
        }
        if (!releaseId) throw new Error('Could not extract a Discogs release ID from the input.');

        const url = `https://www.discogs.com/release/${releaseId}`;
        let html;
        try {
            html = await wiCrossFetch(url);
        } catch (e) {
            throw new Error(
                `Could not fetch Discogs page. <a href="${url}" target="_blank" style="color:#00e6ff;font-weight:bold;">Open the page in your browser</a>, complete the check, return and "Fetch" again.`
            );
        }

        const lower = html.toLowerCase();
        if (
wiIsAntiBotPage(html)) {
            throw new Error(wiAntiBotError(url));
        }

        const doc = wiParseHTML(html);

        const pageTitle = doc.querySelector('h1.title_1p40B')?.textContent?.trim()
            || doc.querySelector('h1[class*="title"]')?.textContent?.trim()
            || doc.querySelector('h1')?.textContent?.trim() || '';
        const artistEl = doc.querySelector('h2[class*="artist"] a, span[class*="artist"] a, div[class*="artist"] a');
        const artist = artistEl?.textContent?.trim() || '';

        const creditsSection = doc.querySelector('section#release-credits');
        if (!creditsSection) throw new Error('No credits section found on this Discogs page.');

        const credits = [];
        const items = creditsSection.querySelectorAll('li');
        for (const li of items) {
            const roleEl  = li.querySelector('span[class*="role_"]');
            const nameEls = li.querySelectorAll('a[href*="/artist/"]');
            if (!roleEl || nameEls.length === 0) continue;
            const roleRaw = roleEl.textContent.trim();
            const roleParts = [];
            let depth = 0, buf = '';
            for (const ch of roleRaw) {
                if (ch === '[') { depth++; buf += ch; }
                else if (ch === ']') { depth = Math.max(0, depth - 1); buf += ch; }
                else if (ch === ',' && depth === 0) { roleParts.push(buf.trim()); buf = ''; }
                else buf += ch;
            }
            if (buf.trim()) roleParts.push(buf.trim());

            const liText = li.textContent;
            const trackPosMatch = liText.match(/\(\s*tracks?\s*:?\s*([\d,\s]+)\)/i);
            const trackPositions = trackPosMatch
                ? trackPosMatch[1].split(',').map(s => s.trim()).filter(Boolean).join(', ')
                : null;

            for (const nameEl of nameEls) {
                const displayedName = nameEl.textContent.trim();
                if (!displayedName) continue;

                const parentSpan = nameEl.parentElement;
                const hasAnv = parentSpan && [...parentSpan.childNodes].some(
                    n => n.nodeType === Node.TEXT_NODE && n.textContent.includes('*')
                );

                let name = displayedName;
                let anv = null;
                if (hasAnv) {
                    const href = nameEl.getAttribute('href') || '';
                    const hrefMatch = href.match(/\/artist\/\d+-(.+)/);
                    if (hrefMatch) {
                        const canonical = hrefMatch[1].replace(/-/g, ' ').trim();
                        if (canonical && canonical.toLowerCase() !== displayedName.toLowerCase()) {
                            name = canonical;
                            anv  = displayedName;
                        }
                    }
                }
                credits.push({ name, anv, roles: roleParts, trackPositions });
            }
        }

        if (credits.length === 0) throw new Error('No credits found in the credits section of this page.');

        return { releaseId, url, pageTitle, artist, credits };
    }

    function openWebImporter() {
        const existing = document.getElementById('dh-web-importer-overlay');
        if (existing) {
            const existingSaveWrap = existing.querySelector('#dh-wi-savedraft-wrap');
            const existingApplyWrap = existing.querySelector('#dh-wi-apply-wrap');
            const existingSaveBtn  = existing.querySelector('#dh-wi-savedraft');
            const existingPreview  = existing.querySelector('#dh-wi-preview');

            if (existingSaveWrap) {
                existingSaveWrap.style.opacity = '0.45';
                existingSaveWrap.style.pointerEvents = 'none';
            }
            if (existingApplyWrap) {
                existingApplyWrap.style.opacity = '0.45';
                existingApplyWrap.style.pointerEvents = 'none';
            }
            if (existingSaveBtn) existingSaveBtn.innerHTML = 'Save To<br>Draft';

            if (existingPreview) {
                existingPreview.style.display = 'none';
                existingPreview.innerHTML = '';
            }

            existing.style.display = 'flex';
            existing.querySelector('#dh-wi-url')?.focus();
            return;
        }
        const panel = document.getElementById('helper-panel');
        const panelRect = panel ? panel.getBoundingClientRect() : { top: 165, right: window.innerWidth - 20, width: 255 };
        const rightOffset = window.innerWidth - panelRect.right;
        const overlay = document.createElement('div');
        overlay.id = 'dh-web-importer-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: ${panelRect.top - 1}px;
            right: ${rightOffset}px;
            width: ${panelRect.width + 220}px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            z-index: 10001;
            display: flex;
            flex-direction: column;
            font-family: Arial, sans-serif;
            max-height: 88vh;
            box-sizing: border-box;
        `;
        overlay.innerHTML = `
            <div class="dh-wi-header" style="display:flex; align-items:center; justify-content:space-between; padding:5px 8px 7px; border-bottom:1px solid rgba(0,0,0,0.09); flex-shrink:0; gap:6px;">
                <div id="dh-wi-mode-wrap" style="display:flex; align-items:center; gap:6px; min-width:0;">
                    <strong style="font-size:13px; font-weight:600; color:#111; user-select:none; -webkit-user-select:none; cursor:default; white-space:nowrap; letter-spacing:0.01em; flex-shrink:0;"><span style="font-weight:normal; margin-right:4px;">🌐</span>Web Import</strong>
                    <span id="dh-wi-supported-stores" title="Supported Stores:&#10;7digital&#10;Apple Music&#10;Bandcamp&#10;Beatport&#10;Bleep&#10;Boomkat&#10;eClassical&#10;HDtracks&#10;HighResAudio&#10;Kompakt&#10;Mora&#10;NativeDSD&#10;OTOTOY&#10;Presto Music&#10;ProStudioMasters&#10;Qobuz&#10;Traxsource&#10;Volumo" style="font-size:10px; color:#888; cursor:default; white-space:nowrap; user-select:none; flex-shrink:0;">Supported Stores</span>
                </div>
                <button id="dh-wi-close" style="background:none; border:none; cursor:pointer; font-size:13px; padding:1px 4px; line-height:1; flex-shrink:0; opacity:0.65; color:#555;">✕</button>
            </div>
            <div style="padding:6px 10px 7px; flex-shrink:0;">
                <input type="text" id="dh-wi-url" placeholder="Paste store URL (Bandcamp, Beatport, Qobuz, etc.) or Discogs URL for credits import" style="width:100%; font-size:11px; border:1px solid #ccc; border-radius:4px; padding:5px 7px; box-sizing:border-box; box-shadow:none;">
            </div>
            <div id="dh-wi-preview" style="flex:1; overflow-y:auto; margin:0 10px 6px; padding:8px 8px 7px 8px; background:#f8f9fa; border:1px solid #e0e0e0; border-radius:4px; font-size:11px; display:none; min-height:60px; box-sizing:border-box;"></div>
            <div class="dh-wi-footer" style="display:flex; align-items:center; gap:6px; padding:7px 10px 8px; border-top:1px solid rgba(0,0,0,0.07); flex-shrink:0;">
                <button id="dh-wi-fetch"  style="flex:0 0 166px; width:166px; height:34px; background:#1a6fbf; color:#fff; border:1px solid transparent; border-radius:5px; cursor:pointer; font-size:13px; font-weight:600; box-sizing:border-box;">Fetch</button>
                <div id="dh-wi-apply-wrap" style="flex:0 0 166px; width:166px; display:flex; height:34px; opacity:0.45; pointer-events:none;">
                    <button id="dh-wi-apply"  style="flex:1; height:34px; background:#28a745; color:#fff; border:1px solid transparent; border-radius:5px 0 0 5px; cursor:pointer; font-size:13px; font-weight:600; padding:0 8px; box-sizing:border-box;">Apply</button>
                    <button id="dh-wi-apply-arrow" style="width:24px; height:34px; background:#28a745; color:#fff; border:1px solid transparent; border-left:1px solid rgba(255,255,255,0.25); border-radius:0 5px 5px 0; cursor:pointer; font-size:10px; padding:0; flex-shrink:0; box-sizing:border-box;"><span style="pointer-events:none; user-select:none;">▾</span></button>
                </div>
                <div id="dh-wi-savedraft-wrap" style="flex:0 0 52px; width:52px; box-sizing:border-box; height:34px; opacity:0.45; pointer-events:none;" title="Create draft with all metadata and open in new tab">
                    <button id="dh-wi-savedraft" style="width:100%; height:34px; background:#28a745; color:#fff; border:1px solid transparent; border-radius:5px; cursor:pointer; font-size:10px; font-weight:600; line-height:1.25; box-sizing:border-box; padding:0;">Save To<br>Draft</button>
                </div>
                <button id="dh-wi-cancel" style="flex:0 0 51px; width:51px; box-sizing:border-box; height:34px; background:#f1f3f5; color:#111; border:1px solid #ccc; border-radius:5px; cursor:pointer; font-size:13px; padding:0; text-align:center;">Cancel</button>
            </div>
        `;
        document.body.appendChild(overlay);

        let fetchedData = null;
        const urlInput    = overlay.querySelector('#dh-wi-url');
        const previewEl   = overlay.querySelector('#dh-wi-preview');
        const fetchBtn    = overlay.querySelector('#dh-wi-fetch');
        const applyBtn    = overlay.querySelector('#dh-wi-apply');
        const applyArrow  = overlay.querySelector('#dh-wi-apply-arrow');
        const applyWrap   = overlay.querySelector('#dh-wi-apply-wrap');
        const savedraftWrap = overlay.querySelector('#dh-wi-savedraft-wrap');
        const savedraftBtn  = overlay.querySelector('#dh-wi-savedraft');
        const cancelBtn   = overlay.querySelector('#dh-wi-cancel');
        const closeBtn    = overlay.querySelector('#dh-wi-close');

        const applyMenu = document.createElement('div');
        applyMenu.style.cssText = 'display:none; position:fixed; z-index:10200; border-radius:5px; overflow:hidden; box-shadow:0 3px 10px rgba(0,0,0,0.25); font-family:Arial,sans-serif;';
        document.body.appendChild(applyMenu);

        const _buildApplyMenu = () => {
            const greenBg = '#28a745';
            const greenHover = '#1e7e34';

            applyMenu.style.boxShadow = '0 3px 10px rgba(0,0,0,0.25)';
            applyMenu.style.background = greenBg;
            applyMenu.style.border = 'none';
            applyMenu.style.borderRadius = '5px';
            applyMenu.style.width = applyWrap.offsetWidth + 'px';

            applyMenu.innerHTML = '';

            const isDiscogsImport = /discogs\.com\/release\/\d+|discogs\.com\/.*\/release\/\d+|^\d{5,}$/.test(urlInput.value.trim());

            const menuItems = [
                {
                    label: 'Without Capitalization Rules',
                    title: 'Apply without normalizing capitalization',
                    disabled: false,
                    onClick: () => { _noCapMode = true; if (_isDiscogsUrl(urlInput.value)) _discogsApply(); else _storeApply(); }
                },
                {
                    label: 'Without Artist Splitters',
                    title: 'Apply without splitting main and track artists (album credits are still split)',
                    disabled: isDiscogsImport,
                    onClick: () => { _noSplitMode = true; if (_isDiscogsUrl(urlInput.value)) _discogsApply(); else _storeApply(); }
                },
                {
                    split: [
                        {
                            label: 'Durations',
                            title: 'Import only track durations, skipping all other fields',
                            disabled: isDiscogsImport,
                            onClick: () => { _durationsOnlyMode = true; if (_isDiscogsUrl(urlInput.value)) _discogsApply(); else _storeApply(); }
                        },
                        {
                            label: 'Credits Only',
                            title: 'Import only credits, skipping all other fields',
                            disabled: isDiscogsImport,
                            onClick: () => { _creditsOnlyMode = true; if (_isDiscogsUrl(urlInput.value)) _discogsApply(); else _storeApply(); }
                        },
                    ]
                },
            ];

            menuItems.forEach((def, idx) => {
                const isFirst = idx === 0;
                const isLast  = idx === menuItems.length - 1;
                const disabledBg = 'rgba(40,167,69,0.45)';

                if (!isFirst) {
                    const sep = document.createElement('div');
                    sep.style.cssText = 'height:1px; background:rgba(255,255,255,0.2); width:100%;';
                    applyMenu.appendChild(sep);
                }

                if (def.split) {
                    const row = document.createElement('div');
                    row.style.cssText = `display:flex; width:100%; box-sizing:border-box; border-radius:${isFirst ? '5px 5px 0 0' : isLast ? '0 0 5px 5px' : '0'}; overflow:hidden;`;
                    def.split.forEach((sub, subIdx) => {
                        if (subIdx > 0) {
                            const vsep = document.createElement('div');
                            vsep.style.cssText = 'width:1px; background:rgba(255,255,255,0.2); flex-shrink:0;';
                            row.appendChild(vsep);
                        }
                        const half = document.createElement('div');
                        half.title = sub.title;
                        half.style.cssText = `
                            height: 30px;
                            flex: 1 1 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            cursor: ${sub.disabled ? 'not-allowed' : 'pointer'};
                            font-size: 11px;
                            font-weight: bold;
                            color: ${sub.disabled ? 'rgba(255,255,255,0.45)' : '#fff'};
                            background: ${sub.disabled ? disabledBg : greenBg};
                            white-space: nowrap;
                            box-sizing: border-box;
                            padding: 0 6px;
                            transition: background 0.1s;
                        `;
                        half.textContent = sub.label;
                        if (!sub.disabled) {
                            half.addEventListener('mouseenter', () => { half.style.background = greenHover; });
                            half.addEventListener('mouseleave', () => { half.style.background = greenBg; });
                        }
                        half.addEventListener('click', () => { if (sub.disabled) return; applyMenu.style.display = 'none'; sub.onClick(); });
                        row.appendChild(half);
                    });
                    applyMenu.appendChild(row);
                    return;
                }

                const item = document.createElement('div');
                item.title = def.title;
                item.style.cssText = `
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: ${def.disabled ? 'not-allowed' : 'pointer'};
                    font-size: 11px;
                    font-weight: bold;
                    color: ${def.disabled ? 'rgba(255,255,255,0.45)' : '#fff'};
                    background: ${def.disabled ? disabledBg : greenBg};
                    white-space: nowrap;
                    width: 100%;
                    box-sizing: border-box;
                    border-radius: ${isFirst ? '5px 5px 0 0' : isLast ? '0 0 5px 5px' : '0'};
                    padding: 0 10px;
                    transition: background 0.1s;
                `;
                item.textContent = def.label;
                if (!def.disabled) {
                    item.addEventListener('mouseenter', () => { item.style.background = greenHover; });
                    item.addEventListener('mouseleave', () => { item.style.background = greenBg; });
                }
                item.addEventListener('click', () => { if (def.disabled) return; applyMenu.style.display = 'none'; def.onClick(); });
                applyMenu.appendChild(item);
            });
        };

        applyArrow.addEventListener('click', (e) => {
            e.stopPropagation();
            if (applyMenu.style.display !== 'none') { applyMenu.style.display = 'none'; return; }

            _buildApplyMenu();

            const r = applyWrap.getBoundingClientRect();
            applyMenu.style.display = 'block';

            requestAnimationFrame(() => {
                applyMenu.style.top  = (r.bottom + 3) + 'px';
                applyMenu.style.left = r.left + 'px';
                applyMenu.style.width = applyWrap.offsetWidth + 'px';
            });
        });
        document.addEventListener('click', (e) => {
            if (applyMenu.style.display !== 'none' && !applyArrow.contains(e.target) && !applyMenu.contains(e.target))
                applyMenu.style.display = 'none';
        });
        document.addEventListener('dh-theme-change', () => { if (applyMenu.style.display !== 'none') _buildApplyMenu(); });

        let _noCapMode = false;
        let _creditsOnlyMode = false;
        let _durationsOnlyMode = false;
        let _noSplitMode = false;
        const _noCapFields = { albumArtists: false, albumTitle: false, label: false, vaArtists: false, trackTitles: false, joiners: false, creditNames: false, trackCredits: false };

        const supportedSpan = overlay.querySelector('#dh-wi-supported-stores');
        urlInput.addEventListener('input', () => {
            const val = urlInput.value.trim();
            const isDiscogs = _isDiscogsUrl(val);
            if (supportedSpan) supportedSpan.style.display = isDiscogs ? 'none' : '';
            const name = val ? detectStoreName(val) : '';
        });

        urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') fetchBtn.click(); });

        let _discogsData = null;

        const _storeFetch = async () => {
            const url = urlInput.value.trim();
            if (!url) return;
            let u;
            try { u = new URL(url); } catch(e) { previewEl.innerHTML = '<span style="color:#dc3545">Invalid URL</span>'; previewEl.style.display = 'block'; return; }
            fetchBtn.disabled = true;
            fetchBtn.textContent = 'Fetching…';
            previewEl.style.display = 'block';
            previewEl.innerHTML = '<span style="color:#888;">Loading…</span>';
            applyBtn.disabled = true; applyWrap.style.opacity = '0.45'; applyWrap.style.pointerEvents = 'none'; savedraftWrap.style.opacity = '0.45'; savedraftWrap.style.pointerEvents = 'none';
            try {
                fetchedData = await wiFetchReleaseData(url);
                if (!fetchedData) throw new Error('No data returned');
                const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAA4CAYAAACohjseAAAACXBIWXMAAAsTAAALEwEAmpwYAAATyklEQVRo3r1aeZRkVXn/3ffefe/V1rUv3WP3dPcwqzCDDAIelqBOUBMTwSWJoiAoIooobjFuR5JIPEbUcUGOikHFwNGQCckRxMiiMYd1YJhhFmbonunp6q6u7q6urnr16m13yR+90EtVdw9K7jn9R1e9uvf+vvu93/f7vu+Sm2++GcViEbFYDNPT07BtGy9l9PX1xfft2/dZx3HfJ6VMA4BO9f1d67r+gVLtnjPOOENKKdv+/sSJE6jVaohGoxgaGgLnfP47TaPIZNKglGJsbAxSSkSjMQSBD8uy4Hle23m1hf8oigJFUU4dnUTsuecO/tJx3PMBgBACAAhYsH1oaOiuzs7CZwght6w4xQrg/5CxCGA8Hoemaac8SaVS+bRlWee3W2N0tPTlp59+5le6rh9sB873Paiq+vIC5JxD0zTouo7ZQ1j98KTUjx6dumKlZwghhud578rn859r98zY2NjLf4IA4Ps+ms0mgiBYK8C0ECK92nO2bW9RFNLSFScmJgDI/x+AcyORSCASiaw6AefCLhZHgjUYYrpcLi/7XFFU6LoOxtiqa816lUoIASHgfxBA27ZBqYZweGWQlJJ6JBJ5tNFovGklAunq6vxVNpvFUlILAobp6eqqwHw/OHN8fPyGZtM5FwBc13sqGonsBvD0SwIopUSj0YDn+fOs2G5kMpkv2LZ9oZQy2ur7cDj8u61bt+5ZOo+u6ygWiy1OVQFjc05B4Lne1dXqydsIIXQBX2xzXfedhq5/tK+v/3vtWFhbxf1gGAoajQaazWbb58Lh8N7OzsI7yuXx2znnXQuMJEKm+Ztzzzv3PYqqLvJBTVXbGi4ej0PXjVlO8M4aGjr5nYXgFjqQ63m7TdN8MhQynzplgHPW3LJ1Kw4cOAC/TUBljCGbzf6qt7d328mTw385OTmxnVLayGQyj+i6/j+qqoql4FaKt5qmQUgBFgSoTE1dDyC0AkPT4WLxxr7e9Ze3OsU1BT1VVUEphes4bQEahoHRkRGfUu2efD5/J6WaNMwQfM9ftnllyclJKWNCyPM4Dzoo9Q9IKY+FTFOOTE7CaTqvXpWhG42dx08MqcBy4tH+GFTMGFs3MVH5e8cLds0ckPpEJGJ+qb+//1lICV3XQSmFBLDUKR3H3TVds34opVwPANXpemAY+h0h4AZCFJeArBo/CCB0quEluegc4WTSaURbhA3Oeb48PvnbpuNsWPDZpZWp6sXZev21qWRynxACnueh0WigYTVeNAxnpxVHSv9GCOILXc73g2vqdave09P9yePHjz9ar1tnrLS/UDj8WEdHnP9BAEPhcEtSKI2VP6aq6oZWoXToxMkvm4bx5jmV7bkems6LZFWvN967ENzC4fnB1a7r/mM4HPl2vW5dDiDSZm/+5s2bvhFuE7PX7KKhUAjVqSksfI8JIQpj7HXtftNsNs95/PEnogAsAEilkujpWT9PXlPV2pYVloz29fXnBwcHnmOMXTU5OfkjAEvDkFUo5K+Nx+MH1homCAB9Zu/EByAWEk02m4PnuQsBysrUVLBChGaJRHx+jlQqDd3QIYWEohCYpjHg+35b+wSBP1EoFGDb9i/W967fP12tXmNZjfM1TUMkEnlS09TbQqHQobUEelKtTr++XC5/otlsng2A6pQeTqVT34nGYnfPsZMZMiEEX+iqMt7R8V+VqWrLTCIWiz7Y39drz1iXgOoUnueBBTriCYpsNnNHrVb7MCFKZLnHmHdZljU1Z1yd0udzudwngyBAZ2cnKKWo1+urSliNMYbpWu2G8fL41xaeqOf755VKY+dwzs9LxOMfnTtNx3Vh1evzcUzT1O+apvFG1/UuXjixEGJw08bTPptMJiGlBOMcdqMxJyAUzoTIpNOHHce9cmSkdCshyM1xD6Xaf8SikU+NjIzMuDNRlueOa9Tmal9f31mjo6W7Z11zmZM1GvarKaWHKdUPzgniQqGAM888E93d3ejp6fEBeY/rOFU/8KmqqiVKtZ+8+uyd14ZCodG6ZUFKCUVR4PtBr++zW4givyCkvKBu1Y+omvq7XDb9Y0LIU6GQ+d++593c2Vn4FmPM8zwPM8KaQJ1VPpZlIRqNQlVVeLM5ZCqVan+Cnue9H4CxglIgIyMjHzIM4xeAFDPsV4Omqejq6prbQCOZTHzN9/1bTNNEOBySjuur1eq0pumUSSkB3885jveQlOgDJBhjOzVNvyQcDZ/LAn8omcTPgyBAvV5buj48z0M8HgchymyuSlaKyWCMQdO0GVFRr1tnrnbMnudtnJ6umtPT0/A8D6FQBMViEfv3718kuRKJuMxmszKZSl/n+cFTRNEOSomvCSHCnhe8XUrZt2TqvO9671WIio6OOCjVoWkaOBcQQoAQAmdWPamqCl03UCgUYJomMtksotEo6Cxgx3EwNjaGUqmEer0OxhiklNAArKXK5BuGIQghyOVyYEwgCDiGhoYgpUQ4HIZpmjBNE6pKb2BM7J5/F7n8hFDJeoWoR3iLFE4ImeaMIxIOIxwOo7e3Hxs29MLzfDzyyCMtY7KUErGOGOKJOAghEEKgPD6OZrMJShdrcqWjo+O3q6FLJBKP5nI5V9M0CCEWuU+lUoFtO3BdH67rUy7kB1tUCS5TFBwCsDSrFYahP8SFWMcYOwdAQkoJTaPLNtpOgMzvp00cVDZu3Ph9VVWHV9KyPT09X3E9D47jRJtNZ6frujuknHlvfd+H4zTBOQfnXG2j/NUg4Ps1Tf0cAGd2Kx6l2tc913uNEGKwVrcedz3/OOf86jliWQBko203r7Us63rOxc4WkrZ9NtTZWRjfsWPH2wAcb0EwU4V8/op167r216ZrV3k+O1Ien3iiPD6+tzw+8Sxj/A0AYFl1cB5ACOZyFjzQIuU6GItFjmma+lVDp5uymdTrwiFzi5TyGSHlpxYweELV6K0Dg8e3DQ4eBwDCuPi8otJnrYZ9W61e/7bVsB+rW43vCCHoUjJqyaKdnZ1IJBJPDg0NncU5e6freudrqqZRXdtHKf1ZJpsZHh0tvdVuOj8ghKgL4txmoqj3MMYuIITsM00T8XgcXIi/9X3WCZA3A1AIIQc4898zUR7zw9EoVEUrhkNmkQUMfsBuXnoaUkpDVbTXNYPmIc7FWwzDvAnAwkCoBQG7rjhcHMjnc19fraaqvZinqdOGQb8XCoW+l06nYds2AsZACFFKY+XPLAS3YESExI0KcGU+n4fneVHO5eVSkklFVb4BKe/VDfoY80VAaRiKqgAgqNUseH4AKeVkq00JKWq2bQOEfABStsqMyWRl6v1c8G8BYK7jgp5KuiSlBGccxeFhjBSLNJPNb2yXgSuKuiOZiCu5XE479sLgHiHkLkIAKQSklH/qe+7FmqpWAYAzhng8io6OGADAddzbx8oT7wMQXuBqg7ls+j8PHz6oCiG7V2CYQnG4qBGAdcQ72gJU2gR3JFNJbN++A9vP2M5VVa20W0dwPqppmhgZHXurEHLXknm2U2peZ5pRGEYEnsdQrU5j6MQohk4UETD2LCB3EULuA8hhIfgdpklfyxirSSE5ITi8QpVh8MILLwgKnQUoijKveJa+iy1hJ5MpxGKxWd8mzGfsZ1NT1S+2sqMQ/KfxeAcC3+9rNZfjOH2NhoVIOALOBRRFgDMBQIQtq/ERKcklikIqCiHXa6r6EJmtckspQIDdErgUwNKYIdKZ9O5icYTbtt1l2/Y1k5OT50ohiWmaj+cL+dsBDLcFWCjkF1W2+/t6v1KpTG0BIe8gs6QghGCaqu6WCrlbCImAsX2z5elFJoyEQ3s1apLAb1IAfiikI5vNKqVS+Q7fD95BCOZi2VsMXXuTlPIhQhRQqkMI/r+EKFe6nn8LgM5Zr5iGFDel06k7R0dG31gqjf1USpmZW8/1vDdO12of27Jl81WdnZ171pTwKori6FS9nFL9B4yxizRK2dYtm+8fGBjY67qu3LZtKxRFeeDo0YF/YZy/d9b1paKQBxhnTc+3npFSduk6fVJK3Dg9XVc5F29fsozu+ewzvuc/NFM6TKBarSCZTNyVz+fve2bfvlfpVNe6X7Fun+N6k+Pl8mnHjh27S0qZaFV5PHLk+R9ns9mjp1J0Ypqm/sY0jd+YpolUKoWBgYH5d1ZRFGGa9AN1y7tTp/oOLuSAqiosCPi9cy5GCPmzIOBbhHBubBWspRAF1/UUAEJR6HynS1XVmqooj2iagoAxUKpheHj4I23Azaejx4698HGtHcmsFkAXDtd1EZ6p2XBI8bCi4GFNowgYu3Pp+yOl7BcCWQBVAMlFxKGpD6fTHQKEgABQVbGoZ+H7AaampsA5V1Zo1y1s6lygzTU9Z0SrhG3buO+++8AYQ0dHHIVCHpTStr073/dx7733Ytu2bXBcF52FAup1C5RKcCHMNqrKDYfNa2zb+REhpGPmNSCPqiq5SXAO13Vh2zbq9TqSyeR8DccwDPh+AABESqmvpbWn7dmzB5xzjI+PL3sgCAI0m01UKhVcfPGfYP/+A7P5FoeUEp7ngXM+r+ibto1oNIpDhw5hXXcPdKr/O+fisiXhaFLTlIeDwB+F5I+oGn2NptFK07aeUAyD12o1+L4P13XRbM5o3HQ6jVAoBEVVoVEKAnDTNJ8OgmDFcmI4HN6rZrNZWJbV8oHZ5BWO42D9+l6USiV4ngfbbmJsrDzfzxdCIJPJkGazmY1Eo5vL5TJ3HcfJ57KHFKJIweVZs7KtCIgrQqHQfsYYBJeOopCjtVp1pFqt9gspL3BdN0EImWCM8TkDTkxMYMOG05BJp5FMJGZbe9HSyMjIlW0UFgAZbNjQ/7GX0JCfaWdxziDETGIqJTrGJyZ/UKvbw3v3PvO0F/Bh23buZIzFFQU3CcgeKehWoiibOGcP1ms1xGIxFAp5aJoaKY9P/GS6Zh0pFkfvrUxNPzZZqe4NGDsrGo0iGo0iHA6jXB4DIer8Xy6XezyRSH4aQNDCNVkul/tiJBJ9UFs7KLLk+CNIJBIghCiVqeodtt28jBCAzBSIDCHlu44eG0ht2bzpL6RgNQJam8vbwpEIfNdD4PnkhRcGv+n7wbuXpEenBwHbc8HFf7IzFApNvlhZ8DExMTlf4TRNc7euZ56xrMaNvu+fTQhRdF3f2939it3JZPLBSCQCcskll6yQ6CZJJBK6aGJi8j2GbvR7vl8zDOOBcDj8E8M0mqlkEp7n7ZysVB9rJRqklOjqzF8YjUZ+r6oGVI2iVqugadsACITgXdXp+gAhxGz5DoXM6yOR8HcXlyI7EI8noKoqnnrqSQAShmkCEmqhkCfVapXNGh7RaBRaoVBo0xvkaqVS+WalUrmOEKK6rjcXEi61LOtDmUzmzw2dDnMhT2+niAgheP75o6/yPPf3c0y4a9cuyPRMS79Wq6+vTtfNtoEsFtu6Y8f2JdV0oFKpLrXkTIhqkTpp3d09rW89lErXBQG7vlUcFEKcMTU19a/5fO71oVBo0rLal3W61nWVQ6EXk/zDhw8vrMeMzW6sJVE4rnPy+eefbwG8A4Zhru0SQr1eb2V7rTw+fsUq5bnzbLt5eiQS2SelrM/FsyWGcLpf0f1UKGTOn+jY2BgY43MuPDIxMXlQAttbBLFAVZTfLqwBzY1GowHTDK0NYCsQjLF1ruvuWO23lcrUGxRF+adMJv2FycmprxPy4klIKXk+l/tSJBIenPMaKSU2bdoERSFzSs0vlUrXHjx05JeEkNTC1ne8I/YVIcQTrQ6AEIJMJrs2gMePD7ZSAMk2le4llrRSiqLgbW+77NvP7Nt3ZGJ88sOu521UCBmMRiO3d3ev25NIJBeRjuM0wRjDwMAAUqk0otHIY4l4/Gzf96/1fX+7YRgTlGo/zWYzD544cUK2a6uv9eqX1tPT0+rywejAwIAlpYytVLLL5XLHY7EOTExMyGQi8WtNpb/mPNDK5TLXdbro8p2UEs2mDSEEgoBhcrIC3/ehU4rh4aGhdevW/R2lYZlOp2FZ9fn6Z7u113wRaFbbLdOppmk84Dju21dIoaYzmcy9lGqoVqswDAOAhJTLap+QckbjSrm4puo47q6xsfJVruttHR4etijVH45EwrcahjG+efNm9PX1tW1aO467NoC5fL6lkeKJxI0H9u8/l3Peqi7CYrHoxwcGXhiZu+9yzjnntLW2bTcWWZ0QqJVK5Z+DILhhTmp5ng/P8y967sBz73/lK1/5FsMw9up6+7ckFosilUphaqqyMsA5hlsuVEPFvr7ei0qlsa82GvalUs7UIXVdP5ROpz6vquqehQzXiu045zh27Niy76rV6rsZYze2JDjO1x08dOjudCa90zCM+kqb7+1djyDwsUITdeWbTqqmnejs7Pwr226kstlsTxAE0+VyecjQDck4W1Xa1Wo1KAqBoiwKc7RYLH56pd8GQXDa8HDxb/r7+76/mgv29vbi5PBJeK73Unv0EoSQqVAoNEUIWXPjsdl0UBotLdOwUsqc7/u9qxlndHT0HM9zv7+WtRhjbfPVP8o9meUERNBsNmcLvcvstcYhCVnjpVVKKWKxWMvX5GUBaJohdHS0LZeM1+vWEGNs60pzbNy48YnTTz/9lNa1LAvVavXlBUgpxfr161e6ixYwxnYfOnTotnYnRAgZ6urq+rnruqe0tq7riMViLy/AWCzW1l3mxoYN/T8cHBw8w3W9Dy6Ud7OtgLHOzvxf33///dW1uujionUS/f39L6+LrqEYxFOp5EeFkA9Uq9WrgyDYpqqKHYvFHkgkEreu0q9ctSm6cPwf7EUsdLMbeW4AAAAASUVORK5CYII=';

                const panelImgUrl = fetchedData.previewImageUrl || fetchedData.imageUrl || '';
                const imgHtml = panelImgUrl
                    ? `<img id="dh-wi-cover-img" src="${PLACEHOLDER}" style="width:56px;height:56px;object-fit:cover;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,0.08);pointer-events:none;user-select:none;">`
                    : '';
                const _previewIsVA = wiDetectVA(fetchedData);
                const trackRows = fetchedData.tracks.map((t, idx) => {
                    const ta = _previewIsVA ? (t.artists?.join(', ') || t.trackArtist || '') : '';
                    const isLast = idx === fetchedData.tracks.length - 1;
                    const borderStyle = isLast ? '' : 'border-bottom:1px solid rgba(0,0,0,0.04);';
                    return `
                        <div style="display:flex;align-items:center;height:18px;box-sizing:border-box;${borderStyle}white-space:nowrap;font-size:10px;">
                            <span style="color:#888;width:16px;flex-shrink:0;user-select:none;">${esc(t.position)}</span>
                            <span style="display:inline-flex;align-items:center;min-width:0;flex:1;">
                                <span style="overflow:hidden;text-overflow:ellipsis;flex-shrink:1;white-space:nowrap;">
                                    ${ta ? esc(ta) + ' – ' : ''}${esc(t.title)}
                                </span>
                                ${t.duration ? `<span style="color:#aaa;margin-left:6px;flex-shrink:0;">${esc(t.duration)}</span>` : ''}
                            </span>
                        </div>
                    `;
                }).join('');
                if (fetchedData.tracks.length === 0) {
                    previewEl.innerHTML = `<span style="color:#dc3545;">${wiAntiBotError(urlInput.value.trim()).replace(/\n/g, '<br>')}</span>`;
                } else {
                    const overflowStyle = fetchedData.tracks.length > 9 ? 'overflow-y:auto;' : 'overflow-y:hidden;';
                    previewEl.innerHTML = `
                        <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:5px;">
                            ${imgHtml}
                            <div style="min-width:0;overflow:hidden;">
                                <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(fetchedData.artist)}${fetchedData.artist && fetchedData.title ? ' – ' : ''}${esc(fetchedData.title)}</div>
                                <div style="color:#888;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${[fetchedData.label, fetchedData.catno, (state.importCountry && fetchedData.country) ? fetchedData.country : 'Worldwide', fetchedData.invalidDate ? `${fetchedData.invalidDate} (Invalid); ${wiNormalizeDate(fetchedData.date)} (Pub.)` : wiNormalizeDate(fetchedData.date) + (fetchedData.publishDate ? '; ' + fetchedData.publishDate + ' (Pub.)' : '')].filter(Boolean).join(' · ')}</div>
                                <div style="color:#888;font-size:10px;">${[
                                    `${fetchedData.tracks.length} track${fetchedData.tracks.length !== 1 ? 's' : ''}`,
                                    fetchedData.fileType || 'FLAC',
                                    (fetchedData.bitdepth && fetchedData.samplerate)
                                        ? `${fetchedData.bitdepth}-bit/${fetchedData.samplerate / 1000}kHz`
                                        : (fetchedData.freeText || null),
                                    esc(fetchedData.storeName),
                                ].filter(Boolean).join(' · ')}</div>
                            </div>
                        </div>
                        <div style="max-height:162px;${overflowStyle}"><div style="display:flex;flex-direction:column;min-width:100%;box-sizing:border-box;">${trackRows}</div></div>
                    `;
                    applyBtn.disabled = false; applyWrap.style.opacity = '1'; applyWrap.style.pointerEvents = 'auto'; savedraftWrap.style.opacity = '1'; savedraftWrap.style.pointerEvents = 'auto';
                }
                if (panelImgUrl) {
                    const coverImg = previewEl.querySelector('#dh-wi-cover-img');
                    if (coverImg) {
                        const fetchViaGM = (imgUrl) => new Promise((resolve, reject) => {
                            if (typeof GM_xmlhttpRequest !== 'undefined') {
                                GM_xmlhttpRequest({
                                    method: 'GET', url: imgUrl, responseType: 'blob',
                                    onload:  r => resolve(r.response),
                                    onerror: () => reject(new Error('img fetch failed')),
                                    timeout: 15000,
                                });
                            } else {
                                fetch(imgUrl).then(r => r.blob()).then(resolve).catch(reject);
                            }
                        });
                        fetchViaGM(panelImgUrl).then(blob => {
                            if (!coverImg.isConnected) return;
                            const objUrl = URL.createObjectURL(blob);
                            coverImg.onload  = () => URL.revokeObjectURL(objUrl);
                            coverImg.onerror = () => URL.revokeObjectURL(objUrl);
                            coverImg.src = objUrl;
                        }).catch(() => { });
                    }
                }
            } catch(err) {
                fetchedData = null;
                previewEl.innerHTML = `<span style="color:#dc3545;">${err.message.replace(/\n/g, '<br>')}</span>`;
            }
            fetchBtn.disabled = false;
            fetchBtn.textContent = 'Fetch';
        };

        const _storeApply = async () => {
            if (!fetchedData) return;
            overlay.style.display = 'none';
            resetHideTimer();
            await setInfoProcessing();
            const _isReimport = state.actionHistory.some(a => a.type === 'webImport');
            const _existingTrackCount = _isReimport ? getTrackInputRows().length : 0;
            const _shieldTimeout = Math.max(30000,
                (fetchedData.tracks?.length || 0) * 250 +
                _existingTrackCount * 200 +
                15000
            );
            const _noOpShield = { restoreAll: () => {}, processingOverlay: null };
            const _outerShield = _durationsOnlyMode
                ? _noOpShield
                : wiActivateShield(fetchedData.storeName || '', _shieldTimeout);
            if (!_durationsOnlyMode && !_creditsOnlyMode && (fetchedData.tracks?.length || 0) > 100) {
                const _etaEl = document.getElementById('dh-shield-eta');
                if (_etaEl) _etaEl.textContent = 'That\'s a lot of metadata! This might take a while…';
            }
            const _savedCap = _noCapMode ? state.capitalizeFields : null;
            if (_noCapMode) state.capitalizeFields = { ..._noCapFields };
            const _savedSplit    = _noSplitMode ? state.splitImport        : null;
            const _savedAutoFeat = _noSplitMode ? state.importAutoFeat     : null;
            const _savedAutoRmx  = _noSplitMode ? state.importAutoRemixers : null;
            if (_noSplitMode) { state.splitImport = false; state.importAutoFeat = false; state.importAutoRemixers = false; }
            try {
                if (_creditsOnlyMode) {
                    if (fetchedData.credits && fetchedData.credits.length > 0) {
                        const addedCreditRemoveBtns = [];
                        const wiFields = [];
                        if (fetchedData.creditsSource === 'about') log('No credits section — credits imported from About notes', 'info');
                        await wiApplyReleaseCredits(fetchedData.credits, wiFields, addedCreditRemoveBtns);
                        addActionToHistory({ type: 'webImport', fields: wiFields, tracklistAction: null, preImageReactIds: new Set(), addedArtistRemoveBtns: [], addedCreditRemoveBtns });
                        const n = addedCreditRemoveBtns.length;
                        log(`Done! Imported ${n} credit${n !== 1 ? 's' : ''} from ${fetchedData.storeName}`, 'success');
                        setInfoSingleLine(`Done! Imported ${n} credit${n !== 1 ? 's' : ''}`, true);
                    } else {
                        log('No credits found', 'info');
                        setInfoSingleLine('No credits found', false);
                    }
                    _outerShield.restoreAll();
                } else if (_durationsOnlyMode) {
                    const DUR_SEL = 'td.subform_track_duration input, input[aria-label*="duration" i]';
                    const tracksWithDur = (fetchedData.tracks || []).filter(t => t.duration);
                    if (!tracksWithDur.length) {
                        log('No durations found in fetched data', 'info');
                        setInfoSingleLine('No durations found', false);
                        _outerShield.restoreAll();
                    } else {
                        const trackRows = getTrackInputRows();
                        let filled = 0;
                        const changes = [];
                        const matchedPositions = new Set();
                        for (const row of trackRows) {
                            const posInput = row.querySelector('input.track-number-input');
                            const pos = posInput?.value?.trim().toLowerCase();
                            if (!pos) continue;
                            const match = tracksWithDur.find(t => trimLeadingZeros(t.position || '').toLowerCase() === pos);
                            if (!match) continue;
                            const durInput = row.querySelector(DUR_SEL);
                            if (!durInput) continue;
                            const oldDuration = durInput.value || '';
                            setReactValue(durInput, trimLeadingZeros(match.duration));
                            filled++;
                            matchedPositions.add(pos);
                            changes.push({ durationInput: durInput, oldDuration });
                        }
                        if (changes.length > 0) addActionToHistory({ type: 'missingDurationImport', changes });
                        const s = filled !== 1 ? 's' : '';
                        if (filled > 0) {
                            log(`Done! Imported ${filled} duration${s}: ${[...matchedPositions].join(', ')} from ${fetchedData.storeName}`, 'success');
                            setInfoSingleLine(`Done! Imported ${filled} duration${s}`, true);
                        } else {
                            log('No matching track positions found', 'warning');
                            setInfoSingleLine('No matching positions found', false);
                        }
                        _outerShield.restoreAll();
                    }
                } else {
                    if (fetchedData.tags && fetchedData.tags.length > 0) log(`Found tags: ${fetchedData.tags.join(', ')}`, 'info');
                    if (state.actionHistory.some(a => a.type === 'webImport')) {
                        log('Previous import detected — running smart cleanup…', 'info');
                        await wiSmartCleanupForReimport(fetchedData);
                        await new Promise(r => setTimeout(r, 300));
                    }
                    await wiApplyRelease(fetchedData, urlInput.value.trim(), _outerShield);
                }
            } catch(e) { log('Apply error: ' + e.message, 'error'); _outerShield.restoreAll(); }
            finally { if (_savedCap) state.capitalizeFields = _savedCap; if (_noSplitMode) { state.splitImport = _savedSplit; state.importAutoFeat = _savedAutoFeat; state.importAutoRemixers = _savedAutoRmx; } _noCapMode = false; _creditsOnlyMode = false; _durationsOnlyMode = false; _noSplitMode = false; }
            await clearInfoProcessing();
        };

        const _discogsFetch = async () => {
            const raw = urlInput.value.trim();
            if (!raw) return;
            fetchBtn.disabled = true;
            fetchBtn.textContent = 'Fetching…';
            previewEl.style.display = 'block';
            previewEl.innerHTML = '<span style="color:#888;">Loading…</span>';
            applyBtn.disabled = true; applyWrap.style.opacity = '0.45'; applyWrap.style.pointerEvents = 'none'; savedraftWrap.style.opacity = '0.45'; savedraftWrap.style.pointerEvents = 'none';
            _discogsData = null;
            try {
                _discogsData = await wiParseDiscogsCredits(raw);
                const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const creditRows = _discogsData.credits.map((c, idx) => {
                    const isLast = idx === _discogsData.credits.length - 1;
                    const borderStyle = isLast ? '' : 'border-bottom:1px solid rgba(0,0,0,0.05);';
                    return `
                        <div style="display:flex;align-items:center;height:18px;box-sizing:border-box;${borderStyle}white-space:nowrap;font-size:10px;">
                            <span style="display:inline-flex;align-items:center;min-width:0;flex:1;">
                                <span style="overflow:hidden;text-overflow:ellipsis;flex-shrink:1;white-space:nowrap;">
                                    <span style="color:#888;">${esc(c.roles.join(', '))}</span> — ${esc(c.name)}
                                </span>
                                ${c.anv ? `<span style="color:#888;font-style:italic;margin-left:6px;flex-shrink:0;">(ANV: ${esc(c.anv)})</span>` : ''}
                            </span>
                        </div>
                    `;
                }).join('');
                const overflowStyle = _discogsData.credits.length > 9 ? 'overflow-y:auto;' : 'overflow-y:hidden;';
                previewEl.innerHTML = `
                    <div style="font-weight:600;font-size:12px;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${esc(_discogsData.artist)}${_discogsData.artist ? ' – ' : ''}${esc(_discogsData.pageTitle)}
                    </div>
                    <div style="color:#888;font-size:10px;margin-bottom:5px;">
                        ${_discogsData.credits.length} credit${_discogsData.credits.length !== 1 ? 's' : ''} · Discogs #${esc(_discogsData.releaseId)}
                    </div>
                    <div style="max-height:162px;${overflowStyle}"><div style="display:flex;flex-direction:column;min-width:100%;box-sizing:border-box;">${creditRows}</div></div>
                `;
                applyBtn.disabled = false; applyWrap.style.opacity = '1'; applyWrap.style.pointerEvents = 'auto'; savedraftWrap.style.opacity = '1'; savedraftWrap.style.pointerEvents = 'auto';
            } catch(err) {
                _discogsData = null;
                previewEl.innerHTML = `<span style="color:#dc3545;">${err.message.replace(/\n/g, '<br>')}</span>`;
            }
            fetchBtn.disabled = false;
            fetchBtn.textContent = 'Fetch';
        };

        const _discogsApply = async () => {
            if (!_discogsData || !_discogsData.credits.length) return;
            overlay.style.display = 'none';
            resetHideTimer();
            await setInfoProcessing();
            const _shield = wiActivateShield('Discogs');
            const _savedCap = _noCapMode ? state.capitalizeFields : null;
            if (_noCapMode) state.capitalizeFields = { ..._noCapFields };
            try {
                const addedCreditRemoveBtns = [];
                const wiFields = [];
                await wiApplyReleaseCredits(_discogsData.credits, wiFields, addedCreditRemoveBtns, true);
                addActionToHistory({
                    type: 'discogsCreditsImport',
                    addedCreditRemoveBtns,
                    sourceUrl: _discogsData.url,
                    releaseId: _discogsData.releaseId,
                });
                const n = addedCreditRemoveBtns.length;
                log(`Done! Imported ${n} credit${n !== 1 ? 's' : ''} from Discogs #${_discogsData.releaseId}`, 'success');
                setInfoSingleLine(`Done! Imported ${n} credit${n !== 1 ? 's' : ''} from Discogs`, true);
            } catch(e) {
                log('Discogs credits apply error: ' + e.message, 'error');
            } finally {
                _shield.restoreAll();
                if (_savedCap) state.capitalizeFields = _savedCap;
                _noCapMode = false;
                _creditsOnlyMode = false;
                _durationsOnlyMode = false;
                _noSplitMode = false;
            }
            await clearInfoProcessing();
        };

        const _isDiscogsUrl = (val) => /discogs\.com\/release\/\d+|discogs\.com\/.*\/release\/\d+|^\d{5,}$/.test(val.trim());

        fetchBtn.onclick = () => { if (_isDiscogsUrl(urlInput.value)) _discogsFetch(); else _storeFetch(); };
        applyBtn.onclick = () => { if (_isDiscogsUrl(urlInput.value)) _discogsApply(); else _storeApply(); };

        const close = () => { overlay.style.display = 'none'; };
        cancelBtn.onclick = close;
        closeBtn.onclick  = close;

        savedraftBtn.onclick = async (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            if (!fetchedData) return;
            savedraftWrap.style.opacity = '0.45'; savedraftWrap.style.pointerEvents = 'none';
            applyWrap.style.opacity     = '0.45'; applyWrap.style.pointerEvents     = 'none';
            fetchBtn.disabled = true;
            savedraftBtn.innerHTML = 'Saving…';
            try {
                await wiSaveReleaseAsDraft(fetchedData, urlInput.value.trim());
                close();
            } catch (e) {
                log(`Save to Draft failed: ${e.message}`, 'error');
            } finally {
                savedraftBtn.innerHTML = 'Save To<br>Draft';
                fetchBtn.disabled = false;
                savedraftWrap.style.opacity = '1'; savedraftWrap.style.pointerEvents = 'auto';
                applyWrap.style.opacity     = '1'; applyWrap.style.pointerEvents     = 'auto';
            }
        };

        overlay.addEventListener('mousemove', resetHideTimer);
        overlay.addEventListener('click',     resetHideTimer);
        overlay.addEventListener('keydown',   resetHideTimer);
        _applyThemeToWebImporter(overlay, localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark');
        urlInput.focus();
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
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            z-index: 10001;
            display: flex;
            flex-direction: column;
            font-family: Arial, sans-serif;
            box-sizing: border-box;
        `;
        overlay.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:5px 8px 6px; border-bottom:1px solid rgba(0,0,0,0.09); gap:6px;">
                <strong style="font-size:13px; font-weight:600; color:#111; user-select:none; -webkit-user-select:none; cursor:default; white-space:nowrap; letter-spacing:0.01em; flex-shrink:0;"><span style="font-weight:normal; margin-right:4px;">📝</span>Tracklist Import</strong>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    <button id="dh-missing-artist-toggle" title="Missing Artists Mode: fill in track-level artists only" style="background:none; border:1px solid #ccc; border-radius:4px; cursor:pointer; font-size:11px; padding:2px 6px; line-height:1.4; white-space:nowrap; opacity:0.75;">👤 Missing Artists</button>
                    <button id="dh-missing-duration-toggle" title="Missing Durations Mode: fill in durations only" style="background:none; border:1px solid #ccc; border-radius:4px; cursor:pointer; font-size:11px; padding:2px 6px; line-height:1.4; white-space:nowrap; opacity:0.75;">🕛 Missing Durations</button>
                    <button id="dh-importer-close" title="Close" style="background:none; border:none; cursor:pointer; font-size:13px; padding:1px 4px; line-height:1; flex-shrink:0; opacity:0.65; color:#555;">✕</button>
                </div>
            </div>
            <div style="padding:7px 10px 7px;">
                <textarea id="dh-importer-textarea" placeholder="" style="width:100%; height:${textareaHeight}px; font-size:12px; font-family:monospace; border:1px solid #ccc; border-radius:4px; padding:6px; box-sizing:border-box; resize:vertical;"></textarea>
            </div>
            <div style="display:flex; align-items:center; gap:6px; padding:7px 10px 8px; border-top:1px solid rgba(0,0,0,0.07);">
                <button id="dh-importer-confirm" style="flex:1; height:34px; background:#28a745; color:#fff; border:1px solid transparent; border-radius:5px; cursor:pointer; font-size:13px; font-weight:600; box-sizing:border-box;">Apply</button>
                <button id="dh-importer-cancel" style="flex:1; height:34px; background:#f1f3f5; color:#111; border:1px solid #ccc; border-radius:5px; cursor:pointer; font-size:13px; box-sizing:border-box;">Cancel</button>
            </div>
        `;
        document.body.appendChild(overlay);
        _applyThemeToImporterOverlay(overlay, localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark');
        const textarea = document.getElementById('dh-importer-textarea');
        textarea.value = state.importerText;
        const NORMAL_PLACEHOLDER = `Positions and durations will be auto-detected.\nRecommended tracklist formatting patterns:\n1 - Artist - Track Title 03:45\n02. Artist — Track Title 40:01\n03) Artist - Track Title 3:18\n[A4] - Track Title [0:04:15]\n(B5) Track Title (00:07:38)\n1-6 - Track Title 01:17:19\nTrack Title 10:06:21\netc`;
        const MISSING_ARTIST_PLACEHOLDER = `Four modes — auto-detected:\n1) Single artist (fills all tracks where artist is missing):\nArtist\n2) From tracklist (matches by position):\n1 - Artist - Track Title 3:45\n3) Per-position (position + artist, matches by position):\n1 Artist\n4) Line-by-line (each line = track row, blank line = skip):\nArtist One\nArtist Two`;
        const MISSING_DURATION_PLACEHOLDER = `Three modes — auto-detected:\n1) From tracklist (matches by position):\n1 - Track Title 3:45\n2) Per-position (position + duration, matches by position):\n1 3:45\n3) Line-by-line (each line = track row, blank line = skip):\n3:45\n\n4:20`;
        function updateToggleStyle() {
            const isDark = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark';
            const btnA = document.getElementById('dh-missing-artist-toggle');
            const btnD = document.getElementById('dh-missing-duration-toggle');
            const applyBtn = (btn, active) => {
                if (!btn) return;
                btn.style.opacity     = active ? '1' : '0.75';
                btn.style.background  = active ? '#0d6efd' : 'none';
                btn.style.color       = active ? '#fff' : (isDark ? '#bbb' : '');
                btn.style.borderColor = active ? '#0d6efd' : (isDark ? '#555' : '#ccc');
            };
            applyBtn(btnA, state.importerMissingArtistMode);
            applyBtn(btnD, state.importerMissingDurationMode);
            if (state.importerMissingArtistMode)       textarea.placeholder = MISSING_ARTIST_PLACEHOLDER;
            else if (state.importerMissingDurationMode) textarea.placeholder = MISSING_DURATION_PLACEHOLDER;
            else                                        textarea.placeholder = NORMAL_PLACEHOLDER;
        }
        updateToggleStyle();
        document.getElementById('dh-missing-artist-toggle').onclick = () => {
            state.importerMissingArtistMode   = !state.importerMissingArtistMode;
            if (state.importerMissingArtistMode) state.importerMissingDurationMode = false;
            updateToggleStyle();
        };
        document.getElementById('dh-missing-duration-toggle').onclick = () => {
            state.importerMissingDurationMode   = !state.importerMissingDurationMode;
            if (state.importerMissingDurationMode) state.importerMissingArtistMode = false;
            updateToggleStyle();
        };
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
            if (state.importerMissingArtistMode) {
                if (!state.importerText.trim()) { log('Nothing to import — no artist data entered', 'warning'); return; }
                await applyMissingArtists(state.importerText);
            } else if (state.importerMissingDurationMode) {
                if (!state.importerText.trim()) { log('Nothing to import — no duration data entered', 'warning'); return; }
                await applyMissingDurations(state.importerText);
            } else {
                const parsed = parseTracklist(state.importerText);
                if (!parsed.length) { log('Nothing to import — no tracks detected', 'warning'); setInfoSingleLine('Nothing to import', false); return; }
                log(`Importing ${parsed.length} ${parsed.length === 1 ? 'track' : 'tracks'}...`);
                await applyTracklist(parsed);
            }
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
                padding: 6px 8px;
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
                    <button id="web-import"                   class="dh-btn dh-icon-btn" style="flex:1 1 0; min-width:34px; justify-content:center;">🌐</button>
                    <button id="tracklist-import"             class="dh-btn dh-icon-btn" style="flex:1 1 0; min-width:34px; justify-content:center;">📝</button>
                    <div id="capitalize-all-wrap" style="position:relative; flex:1 1 0; min-width:0;">
                        <button id="capitalize-all" class="dh-btn dh-icon-btn" style="width:100% !important; height:100%; flex:1 1 0; min-width:34px; justify-content:center;">🔠</button>
                        <div id="capitalize-all-menu" style="display:none; position:absolute; top:100%; left:0; z-index:9999; background:#fff; border:1px solid #ccc; border-radius:4px; padding:4px 4px 4px 4px; box-shadow:0 2px 8px rgba(0,0,0,0.35); margin-top:2px; width:max-content;">
                        </div>
                    </div>
                    <button id="save-all-fields"              class="dh-btn dh-icon-btn" style="flex:1 1 0; min-width:34px; justify-content:center;">💾</button>
                    <button id="additional-tools-toggle"      class="dh-btn dh-icon-btn" style="flex:1 1 0; min-width:34px; justify-content:center;" title="Additional tools">▶</button>
                </div>

                <div id="additional-tools-dropdown" style="display:none; flex-wrap:wrap; gap:5px; margin-bottom:5px;">
                    <button id="extract-track-numbers" class="dh-btn dh-icon-btn" style="flex:1 1 0; min-width:34px; justify-content:center;">🔢</button>
                    <button id="scan-and-extract"       class="dh-btn dh-icon-btn" style="flex:1 1 0; min-width:34px; justify-content:center;">🕛</button>
                    <button id="strip-whitespace"       class="dh-btn dh-icon-btn" style="flex:1 1 0; min-width:34px; justify-content:center;">⇥⇤</button>
                    <button id="clean-titles" class="dh-btn dh-icon-btn" style="flex:1 1 0; min-width:34px; justify-content:center; position:relative;" title="Clean titles">✂️</button>
                    <div id="clean-titles-menu" style="display:none; position:absolute; z-index:9999; background:#fff; border:1px solid #ccc; border-radius:4px; padding:4px 4px 4px 4px; box-shadow:0 2px 8px rgba(0,0,0,0.35); flex-direction:column; gap:2px; width:max-content; margin-top:2px;">
                        <button id="clean-titles-std" style="display:block; width:100%; text-align:left; font-size:11px; padding:4px 8px; border:none; border-radius:3px; cursor:pointer; white-space:nowrap; background:transparent; color:#111;">Standard Removal</button>
                        <button id="clean-titles-cst" style="display:block; width:100%; text-align:left; font-size:11px; padding:4px 8px; border:none; border-radius:3px; cursor:pointer; white-space:nowrap; background:transparent; color:#111;">Custom Removal</button>
                    </div>
                    <button id="brackets-to-parens"     class="dh-btn dh-icon-btn" style="flex:1 1 0; min-width:34px; justify-content:center; position:relative;" title="Convert version titles to parentheses">( )</button>
                    <div id="brackets-to-parens-menu" style="display:none; position:absolute; z-index:9999; background:#fff; border:1px solid #ccc; border-radius:4px; padding:4px; box-shadow:0 2px 8px rgba(0,0,0,0.35); flex-direction:column; gap:2px; width:max-content; margin-top:2px;">
                        <button id="btp-brackets" style="display:block; width:100%; text-align:left; font-size:11px; padding:4px 8px; border:none; border-radius:3px; cursor:pointer; white-space:nowrap; background:transparent; color:#111;" title="Convert bracketed titles to parentheses\ne.g., &quot;Title [Remix]&quot; to &quot;Title (Remix)&quot;">Convert [ ]</button>
                        <button id="btp-dashes"   style="display:block; width:100%; text-align:left; font-size:11px; padding:4px 8px; border:none; border-radius:3px; cursor:pointer; white-space:nowrap; background:transparent; color:#111;" title="Convert dash-separated titles to parentheses\ne.g., &quot;Title - Remix&quot; to &quot;Title (Remix)&quot;">Convert –</button>
                    </div>
                </div>

                <hr class="dh-divider">

                <button id="extract-artists"   class="dh-btn" style="width:100%;">👤 Extract Artists</button>
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
            if (btn.classList.contains('dh-icon-btn')) {
                btn.style.flex           = '1 1 0';
                btn.style.minWidth       = '0';
                btn.style.justifyContent = 'center';
            } else {
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

            const swapBtn = document.createElement('span');
            swapBtn.id = 'swap-artist-title';
            swapBtn.setAttribute('role', 'button');
            swapBtn.setAttribute('tabindex', '0');
            swapBtn.textContent = '⇄';
            swapBtn.title = 'Swap artist ↔ title for all tracks';
            swapBtn.style.cssText = `flex:0 0 auto; margin:0; margin-left:auto; padding:0;
                cursor:pointer; display:inline-flex; align-items:center; justify-content:center; user-select:none;`;
            swapBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); swapArtistTitle(); });
            swapBtn.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); swapBtn.click(); } });
            mainBtn.appendChild(swapBtn);

            const removeMain = document.createElement('span');
            removeMain.id = 'remove-main-from-title';
            removeMain.setAttribute('role', 'button');
            removeMain.setAttribute('tabindex', '0');
            removeMain.textContent = '✂️';
            removeMain.title = 'Remove main artists from titles';
            removeMain.style.cssText = `flex:0 0 auto; margin:0; padding:0; width:30px; height:30px;
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

        [
            ['save-all-fields',      'Save / edit all open credit fields',                              saveAllFields],
            ['scan-and-extract',     'Extract durations from titles',                                   scanAndExtract],
            ['extract-track-numbers','Extract track positions from titles',                             extractTrackPositions],
            ['strip-whitespace',     'Strip leading/trailing whitespace from all fields',               stripWhitespace],
            ['capitalize-all',       'Capitalize artists, label/company, joiners, titles and credits' + (state.capitalizeMixedCase ? '\n(mixed-case words like DnB, iTunes preserved - toggle in Config)' : ''),                 null],
            ['tracklist-import',     'Import tracklist from plain text',                                openTracklistImporter],
            ['web-import',           'Import metadata from a web store or credits from Discogs',        openWebImporter],
            ['extract-artists',      null,                                                               extractArtists],
            ['extract-featuring',    null,                                                               extractFeaturing],
            ['extract-remixers',     null,                                                               extractRemixers],
            ['revert-last',          'Revert last action',                                              revertLastAction],
            ['revert-all',           'Revert all actions',                                              revertAllActions],
            ['brackets-to-parens',   'Convert version titles to parentheses',                          null],
        ].forEach(([id, title, handler]) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (title)   el.title   = title;
            if (handler) el.onclick = handler;
        });
        document.getElementById('extract-artists').title = wrapTitle('Separator patterns: ' + CONFIG.ARTIST_SPLITTER_PATTERNS.join(', ') + '\nIncl. feat separators: ' + CONFIG.FEATURING_PATTERNS.join(', '));

        (() => {
            const _ctBtn  = document.getElementById('clean-titles');
            const _ctMenu = document.getElementById('clean-titles-menu');
            const _ctStd  = document.getElementById('clean-titles-std');
            const _ctCst  = document.getElementById('clean-titles-cst');
            if (!_ctBtn || !_ctMenu) return;

            const _ctDark   = () => localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark';
            const _btnHover = (b) => {
                b.addEventListener('mouseover', () => b.style.background = _ctDark() ? '#2a2d30' : '#f0f0f0');
                b.addEventListener('mouseout',  () => b.style.background = 'transparent');
            };
            if (_ctStd) {
                _ctStd.title   = wrapTitle('Clean titles from redundant bracket contents:\n' + CONFIG.CLEAN_TITLE_PATTERNS.join(', '));
                _ctStd.onclick = (e) => { e.stopPropagation(); _ctMenu.style.display = 'none'; cleanTitles(); };
                _btnHover(_ctStd);
            }
            if (_ctCst) {
                _ctCst.title   = 'Remove any custom text from all track titles';
                _ctCst.onclick = (e) => { e.stopPropagation(); _ctMenu.style.display = 'none'; openCleanTitlesCustomOverlay(); };
                _btnHover(_ctCst);
            }

            const _ctApplyTheme = (isDark) => {
                _ctMenu.style.background  = isDark ? '#1f2224' : '#fff';
                _ctMenu.style.borderColor = isDark ? '#333' : '#ccc';
                if (_ctStd) { _ctStd.style.color = isDark ? '#ddd' : '#111'; }
                if (_ctCst) { _ctCst.style.color = isDark ? '#ddd' : '#111'; }
            };
            _ctApplyTheme(_ctDark());
            document.addEventListener('dh-theme-change', (e) => _ctApplyTheme(e.detail?.dark));

            document.addEventListener('click', (e) => {
                if (_ctMenu.style.display === 'none') return;
                if (!_ctMenu.contains(e.target) && e.target !== _ctBtn) {
                    _ctMenu.style.display = 'none';
                }
            });
            _ctBtn.onclick = (e) => {
                e.stopPropagation();
                if (_ctMenu.style.display !== 'none') {
                    _ctMenu.style.display = 'none';
                    return;
                }
                const r = _ctBtn.getBoundingClientRect();
                _ctMenu.style.top      = r.bottom + 'px';
                _ctMenu.style.left     = '';
                _ctMenu.style.right    = (window.innerWidth - r.right - 7) + 'px';
                _ctMenu.style.position = 'fixed';
                _ctMenu.style.display  = 'flex';
                _ctApplyTheme(_ctDark());
                const _capm = document.getElementById('capitalize-all-menu');
                if (_capm) _capm.style.display = 'none';
            };

            const _ctUpdateTooltip = () => {
                if (_ctStd) _ctStd.title = wrapTitle('Clean titles from redundant bracket contents:\n' + CONFIG.CLEAN_TITLE_PATTERNS.join(', '));
            };
            document.addEventListener('dh-settings-saved', _ctUpdateTooltip);
        })();

        (() => {
            const _btpBtn      = document.getElementById('brackets-to-parens');
            const _btpMenu     = document.getElementById('brackets-to-parens-menu');
            const _btpBrackets = document.getElementById('btp-brackets');
            const _btpDashes   = document.getElementById('btp-dashes');
            if (!_btpBtn || !_btpMenu) return;

            const _btpDark   = () => localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark';
            const _btnHover  = (b) => {
                b.addEventListener('mouseover', () => b.style.background = _btpDark() ? '#2a2d30' : '#f0f0f0');
                b.addEventListener('mouseout',  () => b.style.background = 'transparent');
            };
            if (_btpBrackets) { _btpBrackets.onclick = (e) => { e.stopPropagation(); _btpMenu.style.display = 'none'; bracketsToParen(); }; _btnHover(_btpBrackets); }
            if (_btpDashes)   { _btpDashes.onclick   = (e) => { e.stopPropagation(); _btpMenu.style.display = 'none'; dashToParens(); };   _btnHover(_btpDashes);   }

            const _btpApplyTheme = (isDark) => {
                _btpMenu.style.background  = isDark ? '#1f2224' : '#fff';
                _btpMenu.style.borderColor = isDark ? '#333' : '#ccc';
                if (_btpBrackets) _btpBrackets.style.color = isDark ? '#ddd' : '#111';
                if (_btpDashes)   _btpDashes.style.color   = isDark ? '#ddd' : '#111';
            };
            _btpApplyTheme(_btpDark());
            document.addEventListener('dh-theme-change', (e) => _btpApplyTheme(e.detail?.dark));

            document.addEventListener('click', (e) => {
                if (_btpMenu.style.display === 'none') return;
                if (!_btpMenu.contains(e.target) && e.target !== _btpBtn) _btpMenu.style.display = 'none';
            });
            _btpBtn.onclick = (e) => {
                e.stopPropagation();
                if (_btpMenu.style.display !== 'none') { _btpMenu.style.display = 'none'; return; }
                const r = _btpBtn.getBoundingClientRect();
                _btpMenu.style.top      = r.bottom + 'px';
                _btpMenu.style.left     = '';
                _btpMenu.style.right    = (window.innerWidth - r.right - 7) + 'px';
                _btpMenu.style.position = 'fixed';
                _btpMenu.style.display  = 'flex';
                _btpApplyTheme(_btpDark());
                const _ctm = document.getElementById('clean-titles-menu');
                if (_ctm) _ctm.style.display = 'none';
            };
        })();

        (function() {
            const _capFieldDefs = [
                { key: 'albumArtists', label: 'Album Artists',
                  sel: () => {
                    const trackRowEls = new Set(getTrackInputRows());
                    return Array.from(document.querySelectorAll('input[data-type="artist-name"], #artist-name-input'))
                        .filter(el => !Array.from(trackRowEls).some(row => row.contains(el)));
                  },
                  editableItems: () => {
                    const trackRowEls = new Set(getTrackInputRows());
                    return Array.from(document.querySelectorAll('li.editable_item'))
                        .filter(item => !Array.from(trackRowEls).some(row => row.contains(item))
                                     && !item.querySelector('span.credit_role'));
                  }
                },
                { key: 'albumTitle',   label: 'Album Title',     sel: () => [document.getElementById('release-title-input')].filter(Boolean) },
                { key: 'label',        label: 'Label/Company',   sel: () => Array.from(document.querySelectorAll('input[id^="label-name-input"]')) },
                { key: 'joiners',      label: 'Joiners',
                  sel: () => Array.from(document.querySelectorAll('input[size="10"]')),
                  openContainersFn: () => getJoinerContainersNeedingWork()
                },
                { key: 'vaArtists',    label: 'Track Artists',
                  sel: () => {
                    const inputs = [];
                    for (const row of getTrackInputRows()) {
                        inputs.push(...row.querySelectorAll('td.subform_track_artists input[data-type="artist-name"], td.subform_track_artists input.credit-artist-name-input'));
                    }
                    return inputs;
                  },
                  editableItems: () => {
                    const items = [];
                    for (const row of getTrackInputRows())
                        items.push(...row.querySelectorAll('td.subform_track_artists li.editable_item'));
                    return items;
                  }
                },
                { key: 'trackTitles',  label: 'Track Titles',    sel: () => Array.from(document.querySelectorAll('input[data-type="track-title"], input[id*="track-title"]')) },
                { key: 'trackCredits', label: 'Track Credits',
                  sel: () => {
                    const inputs = [];
                    for (const row of getTrackInputRows()) {
                        inputs.push(...row.querySelectorAll('td.subform_track_title input.credit-artist-name-input, td.subform_track_title input[data-type="artist-name-credits"]'));
                    }
                    return inputs;
                  },
                  editableItems: () => {
                    const items = [];
                    for (const row of getTrackInputRows())
                        items.push(...row.querySelectorAll('td.subform_track_title li.editable_item'));
                    return items;
                  }
                },
                { key: 'creditNames',  label: 'Album Credits',
                  sel: () => {
                    const trackRowEls = new Set(getTrackInputRows());
                    return Array.from(document.querySelectorAll('input.credit-artist-name-input, input[data-type="artist-name-credits"]'))
                        .filter(el => !Array.from(trackRowEls).some(row => row.contains(el)));
                  },
                  editableItems: () => {
                    const trackRowEls = new Set(getTrackInputRows());
                    return Array.from(document.querySelectorAll('li.editable_item'))
                        .filter(item => !Array.from(trackRowEls).some(row => row.contains(item))
                                     && !!item.querySelector('span.credit_role'));
                  }
                },
            ];
            const _menu = document.getElementById('capitalize-all-menu');
            const _btn  = document.getElementById('capitalize-all');
            if (!_menu || !_btn) return;

            const ARTIST_CREDIT_KEYS = new Set(['albumArtists', 'vaArtists', 'trackCredits', 'creditNames']);
            const _capOne = async (selFn, label, editableItemsFn = null, openContainersFn = null) => {
                await setInfoProcessing();
                if (editableItemsFn) {
                    const editableItems = editableItemsFn();
                    await openSavedLinksIfNeeded(editableItems);
                } else {
                }
                if (openContainersFn) {
                    await openContainersIfSaved(openContainersFn());
                }
                const fields = typeof selFn === 'function' ? selFn() : selFn;
                const trackRows = getTrackInputRows();
                const trackRowEls = new Set(trackRows);
                const albumArtistEls = new Set(
                    Array.from(document.querySelectorAll('input[data-type="artist-name"], #artist-name-input'))
                        .filter(el => !Array.from(trackRowEls).some(row => row.contains(el)))
                );
                log(`Capitalizing ${label || 'fields'}...`, 'info');
                const changes = []; let processed = 0;
                for (const el of fields) {
                    if (!el?.isConnected) continue;
                    const orig = (el.value || '').trim();
                    const cand = orig ? capitalizeTitleString(orig) : orig;
                    if (cand && cand !== orig) {
                        setReactValue(el, cand);
                        changes.push({ titleInput: el, oldTitle: orig, newTitle: cand });
                        log(`${getFieldLabel(el, trackRows, albumArtistEls)}: "${orig}" → "${cand}"`, 'success');
                        processed++;
                    }
                }
                if (changes.length) addActionToHistory({ type: 'capitalization', changes });
                await clearInfoProcessing();
                const msg = processed > 0 ? `Done! Capitalized ${processed} field${processed !== 1 ? 's' : ''}` : 'Already capitalized';
                setInfoSingleLine(msg, processed > 0);
                log(msg, processed > 0 ? 'success' : 'info');
            };

            const _isDark = () => localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark';
            const _buildMenu = () => {
                _menu.innerHTML = '';
                const dark = _isDark();
                _menu.style.background   = dark ? '#1f2224' : '#fff';
                _menu.style.borderColor  = dark ? '#444'    : '#ccc';
                const btnBase = 'display:block; width:100%; text-align:left; font-size:11px; padding:4px 8px; border:none; border-radius:3px; cursor:pointer; white-space:nowrap;';
                const btnStyle = btnBase + (dark ? 'background:#1f2224; color:#ddd;' : 'background:transparent; color:#111;');
                const btnHover = dark ? '#2a2d30' : '#f0f0f0';
                const _allBtn = document.createElement('button');
                _allBtn.textContent = 'Everything';
                _allBtn.title = 'Capitalizes all fields (individual fields can be toggled in config)';
                _allBtn.style.cssText = btnBase + (dark ? 'background:#1f2224; color:#aad4ff; font-weight:600;' : 'background:transparent; color:#0057b8; font-weight:600;');
                _allBtn.addEventListener('mouseover', () => _allBtn.style.background = btnHover);
                _allBtn.addEventListener('mouseout',  () => _allBtn.style.background = dark ? '#1f2224' : 'transparent');
                _allBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); _menu.style.display = 'none';
                    const enabledDefs = _capFieldDefs.filter(({ key }) => state.capitalizeBtnFields[key] !== false);
                    const seenItems = new Set();
                    const collectEditableItems = () => {
                        const items = [];
                        for (const def of enabledDefs) {
                            if (!def.editableItems) continue;
                            for (const item of def.editableItems()) {
                                if (!seenItems.has(item)) { seenItems.add(item); items.push(item); }
                            }
                        }
                        return items;
                    };
                    const collectOpenContainers = enabledDefs.some(d => d.openContainersFn)
                        ? () => enabledDefs.flatMap(d => d.openContainersFn ? d.openContainersFn() : [])
                        : null;
                    const collectAll = () => {
                        const seen = new Set();
                        return enabledDefs
                            .flatMap(({ sel }) => (typeof sel === 'function' ? sel() : sel))
                            .filter(el => { if (!el || seen.has(el)) return false; seen.add(el); return true; });
                    };
                    _capOne(collectAll, 'everything', collectEditableItems, collectOpenContainers);
                });
                _menu.appendChild(_allBtn);

                const _div = document.createElement('hr');
                _div.style.cssText = 'margin:3px 0; border:none; border-top:1px solid ' + (dark ? '#444' : '#ddd') + ';';
                _menu.appendChild(_div);

                for (const { key, label, sel, editableItems, openContainersFn } of _capFieldDefs) {
                    const b = document.createElement('button');
                    b.textContent = label;
                    b.style.cssText = btnStyle;
                    b.addEventListener('mouseover', () => b.style.background = btnHover);
                    b.addEventListener('mouseout',  () => b.style.background = dark ? '#1f2224' : 'transparent');
                    b.addEventListener('click', (e) => { e.stopPropagation(); _menu.style.display = 'none'; _capOne(sel, label.toLowerCase(), editableItems || null, openContainersFn || null); });
                    _menu.appendChild(b);
                }
            };

            _btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = _menu.style.display === 'none';
                _menu.style.display = open ? 'block' : 'none';
                if (open) {
                    _buildMenu();
                    const _ctm = document.getElementById('clean-titles-menu');
                    if (_ctm) _ctm.style.display = 'none';
                }
            });

            document.addEventListener('click', (e) => {
                if (!document.getElementById('capitalize-all-wrap')?.contains(e.target)) {
                    _menu.style.display = 'none';
                }
            });

            const _capApplyTheme = (isDark) => {
                _menu.style.background  = isDark ? '#1f2224' : '#fff';
                _menu.style.borderColor = isDark ? '#333' : '#ccc';
                _menu.style.color       = isDark ? '#ddd' : '#111';
            };
            _capApplyTheme(_isDark());
            document.addEventListener('dh-theme-change', (e) => _capApplyTheme(e.detail?.dark));
        })();


        const additionalToggle = document.getElementById('additional-tools-toggle');
        const additionalDropdown = document.getElementById('additional-tools-dropdown');
        if (additionalToggle && additionalDropdown) {
            additionalToggle.addEventListener('click', () => {
                const open = additionalDropdown.style.display !== 'none';
                additionalDropdown.style.display = open ? 'none' : 'flex';
                additionalToggle.textContent = open ? '▶' : '◀';
                additionalToggle.title = open ? 'Additional tools' : 'Hide additional tools';
                const isDark = localStorage.getItem(STORAGE_KEYS.THEME_KEY) === 'dark';
                additionalToggle.style.background = open
                    ? (isDark ? '#1f2224' : '#f1f3f5')
                    : (isDark ? '#2a3040' : '#dde4ef');
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
        const webImporter = document.getElementById('dh-web-importer-overlay');
        if (webImporter && webImporter.style.display !== 'none' && webImporter.style.display !== '') return;
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
