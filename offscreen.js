let focusAudio;
let alarmAudio;

function ensureFocusAudio() {
  if (!focusAudio) {
    focusAudio = new Audio('audio/focus_compressed.opus');
    focusAudio.loop = true;
    focusAudio.volume = 1.0;
  }
}
function ensureAlarmAudio() {
  if (!alarmAudio) {
    alarmAudio = new Audio('audio/alarm.wav');
    alarmAudio.volume = 1.0;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'audio:play') {
    ensureFocusAudio();
    try {
      focusAudio.currentTime = 0;
      focusAudio.play().catch(() => {});
    } catch (_) {}
  } else if (msg.type === 'audio:pause') {
    if (focusAudio) {
      try {
        focusAudio.pause();
        focusAudio.currentTime = 0;
      } catch (_) {}
    }
  } else if (msg.type === 'audio:alarm') {
    ensureAlarmAudio();
    try {
      alarmAudio.currentTime = 0;
      alarmAudio.play().catch(() => {});
    } catch (_) {}
  }
});
