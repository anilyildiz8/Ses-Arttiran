(function () {
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  if (window.__volumeBooster) {
    return;
  }

  const state = {
    audioCtx: null,
    compressor: null,
    observer: null,
    elementMap: new Map(),
    currentGain: 1.0,
    initialized: false
  };

  window.__volumeBooster = state;

  function getAudioContext() {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      state.compressor = state.audioCtx.createDynamicsCompressor();
      state.compressor.threshold.value = -24;
      state.compressor.knee.value = 30;
      state.compressor.ratio.value = 12;
      state.compressor.attack.value = 0.003;
      state.compressor.release.value = 0.25;
      state.compressor.connect(state.audioCtx.destination);
    }
    return state.audioCtx;
  }

  async function resumeAudioContext() {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn('[VolumeBooster] Could not resume AudioContext:', e);
      }
    }
  }

  function smoothGainChange(gainNode, targetGain, duration) {
    const ctx = gainNode.context;
    const now = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.setTargetAtTime(targetGain, now, duration);
  }

  function cleanupElement(element) {
    const nodeState = state.elementMap.get(element);
    if (nodeState) {
      try {
        nodeState.source.disconnect();
        nodeState.gainNode.disconnect();
      } catch (e) {
      }
      state.elementMap.delete(element);
    }
  }

  function connectBoostChain(nodeState) {
    nodeState.source.disconnect();
    nodeState.gainNode.disconnect();
    nodeState.source.connect(nodeState.gainNode);
    nodeState.gainNode.connect(state.compressor);
    nodeState.bypassed = false;
  }

  function connectBypassChain(nodeState) {
    nodeState.source.disconnect();
    nodeState.gainNode.disconnect();
    nodeState.source.connect(state.audioCtx.destination);
    nodeState.bypassed = true;
  }

  function applyGainToElement(element, gain) {
    if (state.elementMap.has(element)) {
      const nodeState = state.elementMap.get(element);
      const { gainNode } = nodeState;
      if (nodeState.bypassed) {
        connectBoostChain(nodeState);
      }
      smoothGainChange(gainNode, gain, 0.02);
      return;
    }

    if (!element.isConnected) {
      return;
    }

    const ctx = getAudioContext();

    try {
      const source = ctx.createMediaElementSource(element);
      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;
      const nodeState = { source, gainNode, bypassed: false };

      connectBoostChain(nodeState);
      state.elementMap.set(element, nodeState);
    } catch (e) {
      console.warn('[VolumeBooster] Failed to process media element:', e.message);
    }
  }

  function scanExistingElements() {
    const elements = document.querySelectorAll('audio, video');
    elements.forEach((el) => applyGainToElement(el, state.currentGain));
  }

  function setupMutationObserver() {
    if (state.observer) {
      return;
    }

    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
              applyGainToElement(node, state.currentGain);
            }

            const children = node.querySelectorAll('audio, video');
            children.forEach((el) => applyGainToElement(el, state.currentGain));
          }

          for (const node of mutation.removedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
              cleanupElement(node);
            }

            const children = node.querySelectorAll('audio, video');
            children.forEach((el) => cleanupElement(el));
          }
        }
      }
    });

    const target = document.documentElement || document.body;
    if (target) {
      state.observer.observe(target, {
        childList: true,
        subtree: true
      });
    }
  }

  function handleMessage(message, sender, sendResponse) {
    if (message.type === 'INIT_AUDIO_BOOST') {
      state.currentGain = message.gain;

      (async () => {
        try {
          await resumeAudioContext();
          scanExistingElements();
          setupMutationObserver();
          state.initialized = true;
          sendResponse({ enabled: true, gain: state.currentGain });
        } catch (e) {
          console.error('[VolumeBooster] Init failed:', e);
          sendResponse({ enabled: false, error: e.message });
        }
      })();
      return true;
    }

    if (message.type === 'UPDATE_AUDIO_BOOST') {
      state.currentGain = message.gain;

      if (!state.initialized) {
        sendResponse({ ok: false, error: 'Not initialized' });
        return;
      }

      try {
        state.elementMap.forEach(({ gainNode }) => {
          smoothGainChange(gainNode, state.currentGain, 0.02);
        });
        sendResponse({ ok: true });
      } catch (e) {
        console.error('[VolumeBooster] Update failed:', e);
        sendResponse({ ok: false, error: e.message });
      }
      return;
    }

    if (message.type === 'GET_AUDIO_BOOST_STATE') {
      sendResponse({ enabled: state.initialized, gain: state.currentGain });
      return;
    }

    if (message.type === 'DISABLE_AUDIO_BOOST') {
      state.elementMap.forEach((nodeState) => {
        try {
          connectBypassChain(nodeState);
        } catch (e) {
        }
      });

      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }

      state.initialized = false;

      sendResponse({ ok: true });
      return;
    }
  }

  browserAPI.runtime.onMessage.addListener(handleMessage);
})();
