(function () {
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  const tabState = new Map();

  function getDefaultState() {
    return { enabled: false, gain: 1.0 };
  }

  async function getActiveTabId() {
    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ? tabs[0].id : null;
  }

  async function sendMessageToTab(tabId, message) {
    try {
      const response = await browserAPI.tabs.sendMessage(tabId, message);
      if (browserAPI.runtime.lastError) {
        console.warn('[Background] sendMessage failed:', browserAPI.runtime.lastError.message);
        return null;
      }
      return response;
    } catch (e) {
      console.warn('[Background] sendMessage exception:', e.message);
      return null;
    }
  }

  async function injectContentScript(tabId) {
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      return true;
    } catch (e) {
      console.error('[Background] Injection failed:', e.message);
      return false;
    }
  }

  browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      let tabId;
      if (sender.tab && sender.tab.id) {
        tabId = sender.tab.id;
      } else {
        tabId = await getActiveTabId();
        if (!tabId) {
          sendResponse({ error: 'No active tab' });
          return;
        }
      }

      if (message.type === 'GET_ACTIVE_TAB_STATE') {
        const state = tabState.get(tabId) || getDefaultState();
        sendResponse(state);
        return;
      }

      if (message.type === 'ENABLE_ON_ACTIVE_TAB') {
        let state = tabState.get(tabId) || getDefaultState();
        state.enabled = true;
        tabState.set(tabId, state);

        const injected = await injectContentScript(tabId);
        if (!injected) {
          state.enabled = false;
          tabState.set(tabId, state);
          sendResponse({ enabled: false, gain: state.gain, error: 'Injection failed' });
          return;
        }

        const initResponse = await sendMessageToTab(tabId, {
          type: 'INIT_AUDIO_BOOST',
          gain: state.gain
        });

        if (!initResponse || !initResponse.enabled) {
          state.enabled = false;
          tabState.set(tabId, state);
          sendResponse({ enabled: false, gain: state.gain, error: initResponse?.error || 'Init failed' });
          return;
        }

        sendResponse({ enabled: true, gain: initResponse.gain });
        return;
      }

      if (message.type === 'SET_ACTIVE_TAB_GAIN') {
        const gain = Math.max(0, Math.min(6, message.gain));
        let state = tabState.get(tabId) || getDefaultState();
        state.gain = gain;
        tabState.set(tabId, state);

        const response = await sendMessageToTab(tabId, {
          type: 'UPDATE_AUDIO_BOOST',
          gain: gain
        });

        if (!response || !response.ok) {
          state.enabled = false;
          tabState.set(tabId, state);
          sendResponse({ ok: false, error: response?.error || 'Update failed' });
          return;
        }

        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'DISABLE_ON_ACTIVE_TAB') {
        await sendMessageToTab(tabId, {
          type: 'DISABLE_AUDIO_BOOST'
        });

        tabState.set(tabId, getDefaultState());
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ error: 'Unknown message' });
    })();

    return true;
  });

  browserAPI.tabs.onRemoved.addListener((tabId) => {
    tabState.delete(tabId);
  });

  browserAPI.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      const state = tabState.get(tabId);
      if (state && state.enabled) {
        state.enabled = false;
        tabState.set(tabId, state);
      }
    }
  });
})();
