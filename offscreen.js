import { NeuralAudioEngine } from './audio/engine.mjs';
import { normalizeAudioSettings } from './audio/policy.mjs';

const engine = new NeuralAudioEngine();
let alarmAudio;
let activeMode = null;

function ensureAlarmAudio() {
  if (!alarmAudio) {
    alarmAudio = new Audio('audio/alarm.wav');
    alarmAudio.volume = 1;
  }
  return alarmAudio;
}

function settingsForPlayback(rawSettings) {
  const settings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  return {
    ...normalizeAudioSettings(settings),
    playAudio: settings.playAudio !== false,
  };
}

async function playMode(mode, rawSettings) {
  const settings = settingsForPlayback(rawSettings);
  if (!settings.playAudio) {
    activeMode = null;
    engine.stop();
    return;
  }
  activeMode = mode;
  await engine.play(mode, settings);
}

function stopAudio() {
  activeMode = null;
  engine.stop();
}

async function updateAudioSettings(rawSettings) {
  const settings = settingsForPlayback(rawSettings);
  if (!settings.playAudio) {
    stopAudio();
    return;
  }
  if (activeMode) await engine.update(settings);
}

function playAlarm() {
  const audio = ensureAlarmAudio();
  try {
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type?.startsWith('audio:')) return false;

  const handle = async () => {
    switch (message.type) {
      case 'audio:play':
        if (message.mode !== 'focus' && message.mode !== 'relax') {
          return { ok: false, error: 'unsupported-mode' };
        }
        await playMode(message.mode, message.settings);
        return { ok: true };
      case 'audio:update':
        await updateAudioSettings(message.settings);
        return { ok: true };
      case 'audio:stop':
      case 'audio:pause': // backward-compatible with the previous offscreen protocol
        stopAudio();
        return { ok: true };
      case 'audio:alarm':
        playAlarm();
        return { ok: true };
      default:
        return { ok: false, error: 'unsupported-audio-message' };
    }
  };

  void handle()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error?.message || 'audio-error' }));
  return true;
});
