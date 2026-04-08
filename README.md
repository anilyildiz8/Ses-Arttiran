# Volume Booster 600%

A Firefox extension that boosts audio volume up to 600% on any tab.

[![Install](https://img.shields.io/badge/Install-Firefox%20Add--ons-orange)](https://addons.mozilla.org/en-US/firefox/addon/ses-arttiran/)

## How It Works

Intercepts the Web Audio API by patching `AudioContext` so every audio pipeline on a page flows through a controllable gain node. Also hooks into `<audio>` and `<video>` elements directly as a fallback.

## Limitations

- Cross-origin audio (e.g. SoundCloud, Bandcamp) cannot be boosted beyond 100% due to browser CORS restrictions
- WebRTC streams are not boosted

## Privacy

- No data collection
- No network requests
- All processing runs locally
