# Volume Booster

A Firefox extension that boosts audio volume up to 600% on any tab.

## Features

- Boost volume from 0% (mute) to 600%
- Per-tab volume control
- Click-to-activate (no always-on injection)
- Automatic detection of new media elements
- Dynamics compressor prevents clipping at high gain
- Minimal permissions: only `storage`, `activeTab`, `scripting`

## Installation

### Development

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on..."
4. Select the `manifest.json` file from this directory

### Using web-ext

```bash
npm install -g web-ext
web-ext run
```

## Usage

1. Navigate to any page with audio or video content
2. Click the extension icon in the toolbar
3. Click "Enable on this tab"
4. Adjust the volume slider or use preset buttons

## Known Limitations (v1)

- Cross-origin iframe audio is not boosted
- Page-created Web Audio graphs that don't use media elements are not boosted
- WebRTC streams are not boosted

## File Structure

```
volume-booster-600/
├── manifest.json       # Extension manifest
├── background.js       # Background script (service worker / event page)
├── content.js          # Content script (injected on demand)
├── popup.html          # Popup UI
├── popup.js            # Popup logic
├── icons/              # Extension icons
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── test/
    └── test-page.html  # Test page with media elements
```

## Architecture

- **background.js**: Manages per-tab state, handles injection via `scripting.executeScript`
- **content.js**: Creates Web Audio API chain (MediaElementSource → GainNode → DynamicsCompressorNode → destination)
- **popup.html/js**: Two-state UI (disabled/enabled) with slider and presets

## Privacy

- No data collection
- No network requests
- No host permissions
- Injection only occurs after explicit user action
