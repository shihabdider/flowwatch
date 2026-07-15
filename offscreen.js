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

async function playMode(mode, rawSettings, previousKeyOffsets = {}) {
  const settings = settingsForPlayback(rawSettings);
  if (!settings.playAudio) {
    activeMode = null;
    engine.stop();
    return { style: settings.musicStyle, keyOffset: null };
  }
  const previousOffset = Number(previousKeyOffsets?.[settings.musicStyle]);
  activeMode = mode;
  await engine.play(mode, settings, {
    ...(Number.isFinite(previousOffset) ? { avoidKeyOffset: previousOffset } : {}),
  });
  return {
    style: settings.musicStyle,
    keyOffset: engine.keyOffsetForStyle(settings.musicStyle),
  };
}

function stopAudio() {
  activeMode = null;
  engine.stop();
}

async function updateAudioSettings(rawSettings, previousKeyOffsets = {}) {
  const settings = settingsForPlayback(rawSettings);
  if (!settings.playAudio) {
    stopAudio();
    return { style: settings.musicStyle, keyOffset: null };
  }
  if (activeMode) return playMode(activeMode, settings, previousKeyOffsets);
  return { style: settings.musicStyle, keyOffset: null };
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
        return {
          ok: true,
          ...await playMode(message.mode, message.settings, message.previousKeyOffsets),
        };
      case 'audio:update':
        return {
          ok: true,
          ...await updateAudioSettings(message.settings, message.previousKeyOffsets),
        };
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
