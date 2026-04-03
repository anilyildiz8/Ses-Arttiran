# Firefox Add-on Store Submission

## Summary
Boost volume up to 600% on supported HTML5 media sites.

## Description
Volume Booster 600% lets you increase audio volume on supported websites with standard HTML5 audio or video players.

Click the extension icon, enable it on the current tab, and adjust the boost level from 0% to 600%.

Features:
- Per-tab volume boost
- Click-to-activate access using `activeTab`
- Works without host permissions
- Handles dynamically added media elements on supported sites
- Disable on the current tab at any time

Known limitations:
- Does not work on every website
- Unsupported on sites that use custom audio pipelines instead of standard HTML5 media elements
- Cross-origin iframes and some protected/custom streaming implementations are not supported

## Reviewer Notes
How to test:
1. Open a supported site with standard HTML5 media playback, such as YouTube, Twitch, or Kick.
2. Click the toolbar icon.
3. Click `Enable on this tab`.
4. Move the slider above 100% and confirm audio gets louder.
5. Click `Disable on this tab` and confirm playback returns to normal.
6. Re-enable on the same tab and confirm boosting works again.

Permissions used:
- `activeTab`: grants temporary access only after the user clicks the extension action
- `scripting`: injects the content script into the active tab after user action

No remote code, analytics, telemetry, or network requests are used.

## Privacy
This extension does not collect, store, or transmit personal data.

It does not use analytics, telemetry, cookies, or remote code.

It only activates on the current tab after explicit user action.
