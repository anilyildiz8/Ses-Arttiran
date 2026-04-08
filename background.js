(function () {
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // Stores gain per tab (default 1.0 = 100% = no boost)
  const tabGains = new Map();

  async function getActiveTabId() {
    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ? tabs[0].id : null;
  }

  async function sendGainToTab(tabId, gain) {
    try {
      await browserAPI.tabs.sendMessage(tabId, {
        type: 'SET_GAIN',
        gain: gain
      });
    } catch (e) {
      // Content script might not be loaded yet (tab opened before extension install).
      // Try injecting it as a fallback.
      try {
        await browserAPI.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        // Retry after injection
        await browserAPI.tabs.sendMessage(tabId, {
          type: 'SET_GAIN',
          gain: gain
        });
      } catch (e2) {
        console.warn('[Background] Could not reach tab:', e2.message);
      }
    }
  }

  browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      const tabId = (sender.tab && sender.tab.id) || (await getActiveTabId());
      if (!tabId) {
        sendResponse({ error: 'No active tab' });
        return;
      }

      if (message.type === 'GET_TAB_GAIN') {
        const gain = tabGains.get(tabId) ?? 1.0;
        sendResponse({ gain: gain });
        return;
      }

      if (message.type === 'SET_TAB_GAIN') {
        const gain = Math.max(0, Math.min(6, message.gain));
        tabGains.set(tabId, gain);
        await sendGainToTab(tabId, gain);
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ error: 'Unknown message' });
    })();

    return true;
  });

  browserAPI.tabs.onRemoved.addListener((tabId) => {
    tabGains.delete(tabId);
  });
})();
