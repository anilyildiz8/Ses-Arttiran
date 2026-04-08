(function () {
  'use strict';

  if (window.__volumeBoosterInjected) return;
  window.__volumeBoosterInjected = true;

  var boosterGains = [];
  var currentGain = 1.0;

  var OrigAudioContext = window.AudioContext;
  var OrigWebkitAudioContext = window.webkitAudioContext;

  function patchContext(ctx) {
    try {
      var realDestination = ctx.destination;
      var gainNode = ctx.createGain();
      gainNode.gain.value = currentGain;
      gainNode.connect(realDestination);

      Object.defineProperty(ctx, 'destination', {
        get: function () {
          return gainNode;
        },
        configurable: true,
        enumerable: true
      });

      ctx.__boosterGainNode = gainNode;
      ctx.__realDestination = realDestination;

      boosterGains.push(gainNode);
    } catch (e) {
      // Silently fail — context might be in an invalid state
    }
  }

  function wrapConstructor(Original) {
    if (!Original) return null;
    return new Proxy(Original, {
      construct: function (target, args) {
        var ctx = Reflect.construct(target, args);
        patchContext(ctx);
        return ctx;
      }
    });
  }

  if (OrigAudioContext) {
    window.AudioContext = wrapConstructor(OrigAudioContext);
  }

  if (OrigWebkitAudioContext && OrigWebkitAudioContext !== OrigAudioContext) {
    window.webkitAudioContext = wrapConstructor(OrigWebkitAudioContext);
  }

  // Listen for gain updates from content script via postMessage
  window.addEventListener('message', function (e) {
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
        } catch (err) {
          // Context is closed, remove it
          boosterGains.splice(i, 1);
          i--;
        }
      }
    }

    if (e.data.type === 'get-state') {
      window.postMessage({
        __volumeBooster: true,
        type: 'state',
        gain: currentGain,
        contextCount: boosterGains.length
      }, '*');
    }
  });
})();
