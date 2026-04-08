(function () {
  'use strict';

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  if (window.__volumeBooster) return;

  // === State ===
  const state = {
    audioCtx: null,
    compressor: null,
    observer: null,
    elementMap: new Map(),
    currentGain: 1.0,
    pageGains: [],
    setPageGainFn: null
  };

  window.__volumeBooster = state;

  // ========================================================================
  // PHASE 1: Patch AudioContext constructor in page context
  // Every AudioContext the site creates gets a GainNode before its destination.
  // NO play() hooking — that breaks cross-origin audio.
  // ========================================================================

  function patchViaXray() {
    if (typeof exportFunction !== 'function') return false;

    try {
      const pw = window.wrappedJSObject;
      if (!pw || !pw.AudioContext || pw.__volumeBoosterInjected) return false;

      const OrigAC = pw.AudioContext;
      const OrigWebkitAC = pw.webkitAudioContext;
      const pageGains = state.pageGains;
      let currentGain = 1.0;

      state.setPageGainFn = function (gain) {
        currentGain = gain;
        for (let i = pageGains.length - 1; i >= 0; i--) {
          try {
            const node = pageGains[i];
            const now = node.context.currentTime;
            node.gain.cancelScheduledValues(now);
            node.gain.setValueAtTime(node.gain.value, now);
            node.gain.setTargetAtTime(gain, now, 0.02);
          } catch (e) {
            pageGains.splice(i, 1);
          }
        }
      };

      function patchContext(ctx) {
        try {
          const realDest = ctx.destination;
          const gainNode = ctx.createGain();
          gainNode.gain.value = currentGain;
          gainNode.connect(realDest);

          Object.defineProperty(ctx, 'destination', {
            get: exportFunction(function () { return gainNode; }, pw),
            configurable: true,
            enumerable: true
          });

          pageGains.push(gainNode);
        } catch (e) {}
      }

      function makeWrapper(Original) {
        const wrapper = exportFunction(function () {
          const ctx = Reflect.construct(Original, arguments);
          patchContext(ctx);
          return ctx;
        }, pw);
        wrapper.prototype = Original.prototype;
        return wrapper;
      }

      pw.AudioContext = makeWrapper(OrigAC);
      if (OrigWebkitAC && OrigWebkitAC !== OrigAC) {
        pw.webkitAudioContext = makeWrapper(OrigWebkitAC);
      }

      pw.__volumeBoosterInjected = true;

      window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        if (!e.data || !e.data.__volumeBooster) return;
        if (e.data.type === 'set-gain' && state.setPageGainFn) {
          state.setPageGainFn(e.data.gain);
        }
      });

      return true;
    } catch (e) {
      console.warn('[VolumeBooster] XRay patching failed:', e);
      return false;
    }
  }

  // --- Fallback: Inline script injection (for non-Firefox or if XRay fails) ---
  const INJECT_CODE = `(function() {
    if (window.__volumeBoosterInjected) return;
    window.__volumeBoosterInjected = true;

    var boosterGains = [];
    var currentGain = 1.0;
    var OrigAC = window.AudioContext;
    var OrigWebkitAC = window.webkitAudioContext;

    function patchContext(ctx) {
      try {
        var realDest = ctx.destination;
        var gainNode = ctx.createGain();
        gainNode.gain.value = currentGain;
        gainNode.connect(realDest);
        Object.defineProperty(ctx, 'destination', {
          get: function() { return gainNode; },
          configurable: true, enumerable: true
        });
        boosterGains.push(gainNode);
      } catch(e) {}
    }

    function wrap(Original) {
      if (!Original) return null;
      return new Proxy(Original, {
        construct: function(target, args) {
          var ctx = Reflect.construct(target, args);
          patchContext(ctx);
          return ctx;
        }
      });
    }

    if (OrigAC) window.AudioContext = wrap(OrigAC);
    if (OrigWebkitAC && OrigWebkitAC !== OrigAC)
      window.webkitAudioContext = wrap(OrigWebkitAC);

    window.addEventListener('message', function(e) {
      if (e.source !== window) return;
      if (!e.data || !e.data.__volumeBooster) return;
      if (e.data.type === 'set-gain') {
        currentGain = e.data.gain;
        for (var i = 0; i < boosterGains.length; i++) {
          try {
            var node = boosterGains[i];
            var now = node.context.currentTime;
            node.gain.cancelScheduledValues(now);
            node.gain.setValueAtTime(node.gain.value, now);
            node.gain.setTargetAtTime(currentGain, now, 0.02);
          } catch(err) { boosterGains.splice(i, 1); i--; }
        }
      }
    });
  })();`;

  function patchViaInlineScript() {
    try {
      const script = document.createElement('script');
      script.textContent = INJECT_CODE;
      (document.documentElement || document.head).prepend(script);
      script.remove();
    } catch (e) {}
  }

  function patchViaExternalScript() {
    try {
      const script = document.createElement('script');
      script.src = browserAPI.runtime.getURL('inject.js');
      (document.documentElement || document.head).prepend(script);
      script.addEventListener('load', () => script.remove());
      script.addEventListener('error', () => script.remove());
    } catch (e) {}
  }

  const xrayWorked = patchViaXray();
  if (!xrayWorked) {
    patchViaInlineScript();
    patchViaExternalScript();
  }

  // ========================================================================
  // PHASE 2: Media element boost (for same-origin <audio>/<video> in the DOM)
  // Skips cross-origin elements to avoid silencing them.
  // ========================================================================

  function isCrossOrigin(element) {
    try {
      const src = element.currentSrc || element.src;
      if (!src) return false;
      if (src.startsWith('blob:') || src.startsWith('data:')) return false;
      const url = new URL(src, window.location.href);
      return url.origin !== window.location.origin;
    } catch (e) {
      return true;
    }
  }

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
      try { await ctx.resume(); } catch (e) {}
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
      } catch (e) {}
      state.elementMap.delete(element);
    }
  }

  function applyGainToElement(element, gain) {
    if (state.elementMap.has(element)) {
      smoothGainChange(state.elementMap.get(element).gainNode, gain, 0.02);
      return;
    }

    if (!element.isConnected) return;

    // Skip cross-origin elements — createMediaElementSource would silence them
    if (isCrossOrigin(element)) return;

    const ctx = getAudioContext();
    try {
      const source = ctx.createMediaElementSource(element);
      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;
      source.connect(gainNode);
      gainNode.connect(state.compressor);
      state.elementMap.set(element, { source, gainNode });
    } catch (e) {
      // Already connected to another context — page-level patch handles it
    }
  }

  function scanAndBoostElements() {
    document.querySelectorAll('audio, video').forEach(
      (el) => applyGainToElement(el, state.currentGain)
    );
  }

  function setupMutationObserver() {
    if (state.observer) return;
    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
            applyGainToElement(node, state.currentGain);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('audio, video').forEach(
              (el) => applyGainToElement(el, state.currentGain)
            );
          }
        }
        for (const node of mutation.removedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
            cleanupElement(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('audio, video').forEach(
              (el) => cleanupElement(el)
            );
          }
        }
      }
    });
    const target = document.documentElement || document.body;
    if (target) {
      state.observer.observe(target, { childList: true, subtree: true });
    }
  }

  setupMutationObserver();

  // ========================================================================
  // PHASE 3: Message handling
  // ========================================================================

  function setPageGain(gain) {
    if (state.setPageGainFn) {
      state.setPageGainFn(gain);
    }
    window.postMessage(
      { __volumeBooster: true, type: 'set-gain', gain: gain },
      '*'
    );
  }

  function applyGain(gain) {
    state.currentGain = gain;
    setPageGain(gain);

    if (gain !== 1.0 && state.elementMap.size === 0) {
      resumeAudioContext().then(() => scanAndBoostElements()).catch(() => {});
    } else {
      state.elementMap.forEach(({ gainNode }) => {
        smoothGainChange(gainNode, gain, 0.02);
      });
    }
  }

  browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SET_GAIN') {
      applyGain(message.gain);
      sendResponse({ ok: true });
    }
  });
})();
