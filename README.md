<div align="center">

<img src="https://github.com/chr1sx/Discogs-Edit-Helper/blob/main/Images/icon-1024.png?raw=true" width="200" alt="Logo">
  
# Discogs Edit Helper

[![Install Script](https://img.shields.io/badge/Install%20Script-brightgreen?style=for-the-badge)](https://github.com/chr1sx/Discogs-Edit-Helper/raw/main/Discogs%20Edit%20Helper.user.js)
[![Firefox Add-on](https://img.shields.io/amo/v/discogs-edit-helper?style=for-the-badge&logo=firefox&logoColor=white&color=orange&label=Firefox)](https://addons.mozilla.org/en-US/firefox/addon/discogs-edit-helper/)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/eaokknhgjhjelnafpakjdmbigjklmdhd?style=for-the-badge&logo=google-chrome&logoColor=white&color=EA4335&label=Chrome)](https://chrome.google.com/webstore/detail/discogs-edit-helper/eaokknhgjhjelnafpakjdmbigjklmdhd)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

*Automatically extracts info from track titles and assigns to the appropriate fields.  
For best experience use along with [**Audio To Discogs CSV Exporter**](https://github.com/chr1sx/Audio-To-Discogs-CSV-Exporter) or [**Bandcamp to Discogs**](https://github.com/Serhii-DV/bandcamp-to-discogs).*

</div>

---

## Features

- **🔢 Position Extraction** - Extracts and assigns track positions (e.g., “01”, “A1”) to position fields
- **🕛 Duration Extraction** - Extracts and assigns track durations (e.g., “3:45”) to duration fields
- **🔠 Title Capitalization** - Capitalizes the first letter of each word in titles (including Unicode / non-Latin)
- **📝 Tracklist Import** - Paste a tracklist in plain text and automatically populate positions, titles, and durations
- **👤 Main Artist Extraction** - Extracts and assigns track artists from the “Artist - Title” format
- **👥 Feat Artist Extraction** - Extracts and assigns featuring artists (e.g., “featuring”, “feat.”, etc.) to credits
- **🎶 Remixer Extraction** - Extracts and assigns remixers (e.g., “remix”, “rmx”, etc.) to credits
- **✂️ Clean Titles** - Removes redundant bracket content from titles (e.g., “(Original Mix)”, “(Bonus Track)”)
- **↩️ Undo Support** - Revert any action with a single click
- **⚙️ Config Panel** - Fully customizable patterns for artist splitters, featuring, remix and capitalization rules
- **🌓 Dark/Light Theme** - Toggle between dark and light themes

---

## Requirements

- A userscript manager extension for the web browser:  
  - [Violentmonkey](https://violentmonkey.github.io/) (recommended) or [Tampermonkey](https://www.tampermonkey.net/)

---

## Installation

1. Install a userscript manager for your web browser.  
2. [Install the userscript](https://github.com/chr1sx/Discogs-Edit-Helper/raw/refs/heads/main/Discogs%20Edit%20Helper.user.js).  
3. Your userscript manager will open and prompt you to install.  
4. Click Install.

---

## Usage
1. Navigate to an edit page on Discogs ([example page](https://www.discogs.com/release/add)).  
2. The helper panel appears automatically on the right side of the page.  
3. Use the extraction buttons to process your tracks.  
4. Complete the edit as usual.

---

## License

This userscript is available under the [MIT License](LICENSE).

---

## Screenshots

<div align="left">
<img src="https://github.com/chr1sx/Discogs-Edit-Helper/blob/main/Images/screenshot1.png?raw=true" width="250" alt="Screenshot">
<img src="https://github.com/chr1sx/Discogs-Edit-Helper/blob/main/Images/screenshot2.png?raw=true" width="250" alt="Screenshot">
<img src="https://github.com/chr1sx/Discogs-Edit-Helper/blob/main/Images/screenshot3.png?raw=true" width="250" alt="Screenshot">
</div>

---

## Disclaimer
- This tool does not automate or submit data on your behalf.  
- It assists with formatting and extraction, and errors may occur.  
- You are solely responsible for reviewing and submitting accurate information.  
