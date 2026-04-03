(function () {
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  const disabledState = document.getElementById('disabledState');
  const enabledState = document.getElementById('enabledState');
  const enableBtn = document.getElementById('enableBtn');
  const disableBtn = document.getElementById('disableBtn');
  const gainValue = document.getElementById('gainValue');
  const gainSlider = document.getElementById('gainSlider');
  const presetBtns = document.querySelectorAll('.preset-btn');

  let updateTimeout = null;

  function showDisabledState() {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
      updateTimeout = null;
    }
    enableBtn.textContent = 'Enable on this tab';
    enableBtn.disabled = false;
    disabledState.style.display = 'block';
    enabledState.style.display = 'none';
  }

  function showEnabledState(gain) {
    disabledState.style.display = 'none';
    enabledState.style.display = 'block';
    updateDisplay(gain);
  }

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
        type: 'GET_ACTIVE_TAB_STATE'
      });

      if (response && response.enabled) {
        showEnabledState(response.gain);
      } else {
        showDisabledState();
      }
    } catch (e) {
      showDisabledState();
    }
  }

  async function enableOnTab() {
    enableBtn.textContent = 'Enabling...';
    enableBtn.disabled = true;

    try {
      const response = await browserAPI.runtime.sendMessage({
        type: 'ENABLE_ON_ACTIVE_TAB'
      });

      if (response && response.enabled) {
        showEnabledState(response.gain);
      } else {
        enableBtn.textContent = 'Enable on this tab';
        enableBtn.disabled = false;
      }
    } catch (e) {
      enableBtn.textContent = 'Enable on this tab';
      enableBtn.disabled = false;
    }
  }

  function sendGainUpdate(gain) {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }

    updateTimeout = setTimeout(() => {
      browserAPI.runtime.sendMessage({
        type: 'SET_ACTIVE_TAB_GAIN',
        gain: gain
      }).then((response) => {
        if (response && !response.ok) {
          showDisabledState();
        }
        updateTimeout = null;
      }).catch(() => {
        showDisabledState();
        updateTimeout = null;
      });
    }, 50);
  }

  async function disableOnTab() {
    try {
      await browserAPI.runtime.sendMessage({
        type: 'DISABLE_ON_ACTIVE_TAB'
      });
      showDisabledState();
    } catch (e) {
      showDisabledState();
    }
  }

  enableBtn.addEventListener('click', enableOnTab);
  disableBtn.addEventListener('click', disableOnTab);

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
      browserAPI.runtime.sendMessage({
        type: 'SET_ACTIVE_TAB_GAIN',
        gain: gain
      }).then((response) => {
        if (response && !response.ok) {
          showDisabledState();
        }
      }).catch(() => {
        showDisabledState();
      });
    });
  });

  loadTabState();
})();
