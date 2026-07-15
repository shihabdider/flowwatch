const MIN_BREAK_MINUTES = 3;
const MAX_BREAK_MINUTES = 20;
const TIMER_ALARM_NAME = 'flowWatchTimer';
const SESSION_ALARM_NAME = 'flowWatchSessionEnd';
// Badge/colors + defaults
const BADGE_BLUE = '#3b82f6';   // focus
const BADGE_GREEN = '#10b981';  // break
const DEFAULT_FOCUS_MINUTES = 15;
const AUDIO_SETTING_KEYS = ['focusHz', 'relaxHz', 'musicStyle', 'playAudio'];
const AUDIO_KEY_HISTORY_KEY = 'flowWatchAudioKeyOffsets';
const DEFAULT_AUDIO_SETTINGS = {
  focusHz: 12,
  relaxHz: 8,
  musicStyle: 'ambient'
};

function minutesFromSeconds(sec) {
  return Math.floor(sec / 60);
}

async function setBadge(mode, text) {
  const color = mode === 'break' ? BADGE_GREEN : BADGE_BLUE;
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
}

function computeFocusBadgeText(elapsedSec, plannedMin) {
  const elapsedMin = minutesFromSeconds(elapsedSec);
  if (elapsedMin < plannedMin) {
    // count down remaining minutes
    return String(Math.max(0, plannedMin - elapsedMin));
  }
  // time is up; count up showing total elapsed minutes
  return String(elapsedMin);
}

function computeBreakBadgeText(elapsedSec, plannedMin) {
  const elapsedMin = minutesFromSeconds(elapsedSec);
  // break only counts down
  return String(Math.max(0, plannedMin - elapsedMin));
}

function updateBadge() {
  chrome.storage.local.get(
    ['isRunning', 'mode', 'startTime', 'plannedMinutes'],
    async (res) => {
      if (!res.isRunning || !res.startTime) {
        clearBadge();
        return;
      }
      const elapsedSec = Math.max(
        0,
        Math.floor((Date.now() - res.startTime) / 1000)
      );

      let planned = Number(res.plannedMinutes);
      if (!planned || planned <= 0) {
        planned = DEFAULT_FOCUS_MINUTES;
      }

      const text =
        res.mode === 'break'
          ? computeBreakBadgeText(elapsedSec, planned)
          : computeFocusBadgeText(elapsedSec, planned);

      setBadge(res.mode, text);
    }
  );
}

chrome.runtime.onStartup.addListener(updateBadge);

chrome.runtime.onInstalled.addListener(async () => {
  const local = await chrome.storage.local.get([
    'isRunning', 'mode', 'startTime', 'focusDuration', 'intention', 'sessions'
  ]);
  const localDefaults = {};
  if (local.isRunning === undefined) localDefaults.isRunning = false;
  if (local.mode === undefined) localDefaults.mode = 'focus';
  if (local.startTime === undefined) localDefaults.startTime = null;
  if (local.focusDuration === undefined) localDefaults.focusDuration = 0;
  if (local.intention === undefined) localDefaults.intention = '';
  if (!Array.isArray(local.sessions)) localDefaults.sessions = [];
  if (Object.keys(localDefaults).length) await chrome.storage.local.set(localDefaults);

  const settings = await chrome.storage.sync.get([
    'focusMinutes', 'focusHz', 'relaxHz', 'musicStyle'
  ]);
  const syncDefaults = {};
  if (!Number.isFinite(Number(settings.focusMinutes))) {
    syncDefaults.focusMinutes = DEFAULT_FOCUS_MINUTES;
  }
  for (const [key, value] of Object.entries(DEFAULT_AUDIO_SETTINGS)) {
    if (settings[key] === undefined) syncDefaults[key] = value;
  }
  if (Object.keys(syncDefaults).length) await chrome.storage.sync.set(syncDefaults);
  updateBadge();
});

// Offscreen helpers for audio playback
async function readAudioSettings() {
  return chrome.storage.sync.get(AUDIO_SETTING_KEYS);
}

async function ensureOffscreenDocument() {
  try {
    if (chrome.offscreen && chrome.offscreen.hasDocument) {
      const has = await chrome.offscreen.hasDocument();
      if (has) return;
    }
  } catch (_) {}
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: 'Play generated focus and relax music plus session alarms'
  });
}

async function readAudioKeyHistory() {
  if (!chrome.storage?.session) return {};
  try {
    const stored = await chrome.storage.session.get(AUDIO_KEY_HISTORY_KEY);
    const history = stored?.[AUDIO_KEY_HISTORY_KEY];
    return history && typeof history === 'object' && !Array.isArray(history) ? history : {};
  } catch (_) {
    return {};
  }
}

async function rememberAudioKey(history, response) {
  if (!chrome.storage?.session) return;
  if (!response || typeof response.style !== 'string' || !Number.isFinite(response.keyOffset)) return;
  try {
    await chrome.storage.session.set({
      [AUDIO_KEY_HISTORY_KEY]: { ...history, [response.style]: response.keyOffset },
    });
  } catch (_) {}
}

async function sendPlaybackMessage(type, settings, mode = null) {
  const previousKeyOffsets = await readAudioKeyHistory();
  const message = {
    type,
    ...(mode ? { mode } : {}),
    settings,
    ...(Object.keys(previousKeyOffsets).length > 0 ? { previousKeyOffsets } : {}),
  };
  const response = await chrome.runtime.sendMessage(message);
  await rememberAudioKey(previousKeyOffsets, response);
}

function playModeAudio(mode, settings) {
  void sendPlaybackMessage('audio:play', settings, mode).catch(() => {});
}

async function forwardAudioSettingsToOffscreen(changes, areaName) {
  if (areaName !== 'sync') return;
  if (!AUDIO_SETTING_KEYS.some((key) => key in changes)) return;

  try {
    if (chrome.offscreen?.hasDocument && !(await chrome.offscreen.hasDocument())) return;
    const settings = await readAudioSettings();
    await sendPlaybackMessage('audio:update', settings);
  } catch (_) {}
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  void forwardAudioSettingsToOffscreen(changes, areaName);
});

function stopGeneratedAudio() {
  chrome.runtime.sendMessage({ type: 'audio:stop' });
}

function playAlarm() {
  chrome.runtime.sendMessage({ type: 'audio:alarm' });
}

async function closeOffscreenDocument() {
  try {
    if (chrome.offscreen) {
      await chrome.offscreen.closeDocument();
    }
  } catch (_) {}
}

function calculateBreakTime(focusMinutes) {
  const proposed = Math.round(focusMinutes * 0.2);
  return Math.max(MIN_BREAK_MINUTES, Math.min(MAX_BREAK_MINUTES, proposed));
}

function updateTimer() {
  chrome.storage.local.get(['isRunning', 'mode', 'startTime'], (res) => {
    if (!res.isRunning || !res.startTime) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - res.startTime) / 1000));
    chrome.runtime.sendMessage({ type: 'updateTimer', elapsed, mode: res.mode });
    updateBadge();
  });
}

async function getUserIntention() {
  const { promptIntention } = await chrome.storage.sync.get('promptIntention');
  if (promptIntention === false) return '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return '';
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        try {
          // Return null on Cancel; '' on OK with empty input.
          return window.prompt('What will you focus on?', '');
        } catch (_) {
          return '';
        }
      },
    });
    if (result === null) return null; // user clicked Cancel
    return typeof result === 'string' ? result : '';
  } catch (_) {
    return '';
  }
}

async function startFocusSession(intention) {
  chrome.alarms.clear(SESSION_ALARM_NAME);
  const now = Date.now();
  const { focusMinutes } = await chrome.storage.sync.get('focusMinutes').catch(() => ({}));
  const plannedMinutes = Math.max(1, Number(focusMinutes) || DEFAULT_FOCUS_MINUTES);

  await chrome.storage.local.set({
    isRunning: true,
    mode: 'focus',
    startTime: now,
    intention: intention || '',
    plannedMinutes
  });
  chrome.alarms.create(TIMER_ALARM_NAME, { periodInMinutes: 1 / 60 });
  updateBadge();
  const audioSettings = await readAudioSettings();
  if (audioSettings.playAudio !== false) {
    await ensureOffscreenDocument();
    playModeAudio('focus', audioSettings);
  }
}

function endFocusSession() {
  const now = Date.now();
  chrome.storage.local.get(['startTime', 'sessions', 'intention', 'plannedMinutes'], async (res) => {
    const start = res.startTime || now;
    const focusDurationSeconds = Math.max(0, Math.floor((now - start) / 1000));
    const planned = Number(res.plannedMinutes) || 0;
    const endedEarly = planned > 0 && focusDurationSeconds < planned * 60;


    const sessions = Array.isArray(res.sessions) ? res.sessions : [];
    const startISO = new Date(start).toISOString();
    const endISO = new Date(now).toISOString();

    if (focusDurationSeconds > 0) {
      sessions.push({
        start: startISO,
        end: endISO,
        durationSec: focusDurationSeconds,
        intention: res.intention || ''
      });
      chrome.storage.local.set({ sessions });
    }

    if (endedEarly) {
      // Ended before planned time: stop cleanly without alarm or break, but record the session
      chrome.alarms.clear(TIMER_ALARM_NAME);
      chrome.alarms.clear(SESSION_ALARM_NAME);
      stopGeneratedAudio();
      closeOffscreenDocument();
      await chrome.storage.local.set({
        isRunning: false,
        mode: 'focus',
        startTime: null,
        plannedMinutes: 0
      });
      clearBadge();
      return;
    }

    await ensureOffscreenDocument();
    stopGeneratedAudio();
    playAlarm();

    const breakMinutes = calculateBreakTime(focusDurationSeconds / 60);
    chrome.storage.local.set({
      isRunning: true,
      mode: 'break',
      startTime: now,
      plannedMinutes: breakMinutes
    });
    chrome.alarms.create(SESSION_ALARM_NAME, { when: now + breakMinutes * 60 * 1000 });
    updateBadge();

    const audioSettings = await readAudioSettings().catch(() => ({}));
    if (audioSettings.playAudio !== false) playModeAudio('relax', audioSettings);

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon96.png',
      title: 'Break time',
      message: `Take a ${breakMinutes} min break`
    });
  });
}

function finishBreak() {
  chrome.storage.local.get(['mode'], (res) => {
    if (res.mode !== 'break') return;
    chrome.storage.local.set({
      isRunning: false,
      mode: 'focus',
      startTime: null,
      plannedMinutes: 0
    });
    stopGeneratedAudio();
    closeOffscreenDocument();
    clearBadge();
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon96.png',
      title: 'Break over',
      message: 'Ready to focus again'
    });
  });
}

function resetTimer() {
  chrome.alarms.clearAll();
  stopGeneratedAudio();
  closeOffscreenDocument();
  chrome.storage.local.set({
    isRunning: false,
    mode: 'focus',
    startTime: null,
    focusDuration: 0,
    intention: '',
    plannedMinutes: 0
  });
  clearBadge();
  chrome.runtime.sendMessage({ type: 'resetUI' });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TIMER_ALARM_NAME) {
    updateTimer();
  } else if (alarm.name === SESSION_ALARM_NAME) {
    finishBreak();
  }
});

chrome.action.onClicked.addListener(async () => {
  chrome.storage.local.get(['isRunning', 'mode'], async (res) => {
    try {
      if (res.isRunning) {
        if (res.mode === 'focus') {
          endFocusSession();
        } else if (res.mode === 'break') {
          finishBreak();
        }
        return;
      }

      const intention = await getUserIntention();
      if (intention === null) {
        // User canceled the prompt; do not start.
        return;
      }
      await startFocusSession(intention);
    } catch (_) {}
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg && msg.type) {
    case 'startFocus':
      startFocusSession(msg.intention || '');
      sendResponse({ ok: true });
      return true;
    case 'endFlow':
      chrome.storage.local.get(['mode'], (res) => {
        if (res.mode === 'focus') {
          endFocusSession();
        }
      });
      sendResponse({ ok: true });
      return true;
    case 'reset':
      resetTimer();
      sendResponse({ ok: true });
      return true;
    case 'getSessions':
      chrome.storage.local.get(['sessions'], (res) =>
        sendResponse({ sessions: res.sessions || [] })
      );
      return true;
    default:
      break;
  }
});
