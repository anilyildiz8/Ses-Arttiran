(function () {
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  const gainValue = document.getElementById('gainValue');
  const gainSlider = document.getElementById('gainSlider');
  const presetBtns = document.querySelectorAll('.preset-btn');

  let updateTimeout = null;

  function gainToPercentage(gain) {
    return Math.round(gain * 100);
  }

  function percentageToGain(percentage) {
    return percentage / 100;
  }

  function updateDisplay(gain) {
    const percentage = gainToPercentage(gain);
    gainValue.textContent = percentage + '%';
    gainSlider.value = percentage;

    presetBtns.forEach((btn) => {
      const btnGain = parseInt(btn.dataset.gain, 10);
      btn.classList.toggle('active', btnGain === percentage);
    });
  }

  async function loadTabState() {
    try {
      const response = await browserAPI.runtime.sendMessage({
        type: 'GET_TAB_GAIN'
      });
      if (response && typeof response.gain === 'number') {
        updateDisplay(response.gain);
      }
    } catch (e) {
      // Default display is fine
    }
  }

  function sendGainUpdate(gain) {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }

    updateTimeout = setTimeout(() => {
      browserAPI.runtime.sendMessage({
        type: 'SET_TAB_GAIN',
        gain: gain
      }).catch(() => {}).finally(() => {
        updateTimeout = null;
      });
    }, 50);
  }

  gainSlider.addEventListener('input', (e) => {
    const percentage = parseInt(e.target.value, 10);
    const gain = percentageToGain(percentage);
    updateDisplay(gain);
    sendGainUpdate(gain);
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const percentage = parseInt(btn.dataset.gain, 10);
      const gain = percentageToGain(percentage);
      updateDisplay(gain);
      sendGainUpdate(gain);
    });
  });

  loadTabState();
})();
