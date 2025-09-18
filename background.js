const MIN_BREAK_MINUTES = 3;
const MAX_BREAK_MINUTES = 20;
const TIMER_ALARM_NAME = 'flowWatchTimer';
const SESSION_ALARM_NAME = 'flowWatchSessionEnd';
const MIN_RECORD_MINUTES = 15;

// Badge/colors + defaults
const BADGE_BLUE = '#3b82f6';   // focus
const BADGE_GREEN = '#10b981';  // break
const DEFAULT_FOCUS_MINUTES = 15;

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

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isRunning: false,
    mode: 'focus',
    startTime: null,
    focusDuration: 0,
    intention: '',
    sessions: []
  });
  chrome.storage.sync.get('focusMinutes', ({ focusMinutes }) => {
    if (!Number.isFinite(focusMinutes)) {
      chrome.storage.sync.set({ focusMinutes: DEFAULT_FOCUS_MINUTES });
    }
  });
  updateBadge();
});

// Offscreen helpers for audio playback
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
    justification: 'Play binaural beats and alarm sounds during sessions'
  });
}

function playFocusAudio() {
  chrome.runtime.sendMessage({ type: 'audio:play' });
}

function pauseFocusAudio() {
  chrome.runtime.sendMessage({ type: 'audio:pause' });
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
  chrome.storage.sync.get(['playAudio'], async (res) => {
    if (res.playAudio !== false) {
      await ensureOffscreenDocument();
      playFocusAudio();
    }
  });
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
      pauseFocusAudio();
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
    pauseFocusAudio();
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
    pauseFocusAudio();
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
  pauseFocusAudio();
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
