import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function storageArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get(keys, callback) {
      let result;
      if (keys == null) result = { ...data };
      else if (typeof keys === 'string') result = { [keys]: data[keys] };
      else if (Array.isArray(keys)) result = Object.fromEntries(keys.map((key) => [key, data[key]]));
      else result = { ...keys, ...Object.fromEntries(Object.keys(keys).filter((key) => key in data).map((key) => [key, data[key]])) };
      if (callback) callback(result);
      return Promise.resolve(result);
    },
    set(values, callback) {
      Object.assign(data, values);
      if (callback) callback();
      return Promise.resolve();
    },
  };
}

function harness(localOverrides = {}, {
  hasOffscreenDocument = false,
  syncOverrides = {},
  sessionOverrides = {},
  messageResponse = null,
} = {}) {
  const listeners = {};
  const sent = [];
  const local = storageArea({
    isRunning: false,
    mode: 'focus',
    startTime: null,
    sessions: [],
    intention: '',
    plannedMinutes: 0,
    ...localOverrides,
  });
  const sync = storageArea({
    focusMinutes: 15,
    focusHz: 12,
    relaxHz: 8,
    musicStyle: 'ambient',
    playAudio: true,
    ...syncOverrides,
  });
  const session = storageArea(sessionOverrides);
  const event = (name) => ({ addListener(listener) { listeners[name] = listener; } });
  const chrome = {
    storage: { local, sync, session, onChanged: event('storageChanged') },
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
      onClicked: event('actionClicked'),
    },
    alarms: {
      clear: async () => {},
      clearAll: async () => {},
      create: () => {},
      onAlarm: event('alarm'),
    },
    runtime: {
      onStartup: event('startup'),
      onInstalled: event('installed'),
      onMessage: event('runtimeMessage'),
      sendMessage(message) {
        sent.push(message);
        return Promise.resolve(typeof messageResponse === 'function' ? messageResponse(message) : messageResponse);
      },
    },
    offscreen: {
      Reason: { AUDIO_PLAYBACK: 'AUDIO_PLAYBACK' },
      hasDocument: async () => hasOffscreenDocument,
      createDocument: async () => {},
      closeDocument: async () => {},
    },
    notifications: { create: () => {} },
    tabs: { query: async () => [] },
    scripting: { executeScript: async () => [{ result: '' }] },
  };
  const context = vm.createContext({ chrome, console, Date, Math, setTimeout, clearTimeout });
  vm.runInContext(readFileSync('background.js', 'utf8'), context, { filename: 'background.js' });
  return { context, local, sync, session, sent, listeners };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const plain = (value) => JSON.parse(JSON.stringify(value));

const defaultAudioSettings = {
  focusHz: 12,
  relaxHz: 8,
  musicStyle: 'ambient',
  playAudio: true,
};

test('installation fills the approved 12/8 audio defaults without an instrument key', async () => {
  const app = harness({}, { syncOverrides: { focusHz: undefined, relaxHz: undefined, musicStyle: undefined } });
  await app.listeners.installed();
  assert.equal(app.sync.data.focusHz, 12);
  assert.equal(app.sync.data.relaxHz, 8);
  assert.equal(app.sync.data.musicStyle, 'ambient');
  assert.equal('instrument' in app.sync.data, false);
});

test('starting focus requests focus-mode generated audio', async () => {
  const app = harness();
  await vm.runInContext('startFocusSession("write tests")', app.context);
  await settle();
  assert.equal(app.local.data.mode, 'focus');
  assert.equal(app.local.data.isRunning, true);
  assert.deepEqual(plain(app.sent.at(-1)), {
    type: 'audio:play',
    mode: 'focus',
    settings: defaultAudioSettings,
  });
});

test('playback key history survives offscreen closure in browser-session storage', async () => {
  const chosenOffsets = [-5, -3];
  let responseIndex = 0;
  const app = harness({}, {
    syncOverrides: { musicStyle: 'baroque' },
    messageResponse: (message) => (
      message.type === 'audio:play'
        ? { ok: true, style: 'baroque', keyOffset: chosenOffsets[responseIndex++] }
        : { ok: true }
    ),
  });
  const settings = JSON.stringify({ ...defaultAudioSettings, musicStyle: 'baroque' });

  await vm.runInContext(`sendPlaybackMessage("audio:play", ${settings}, "focus")`, app.context);
  assert.deepEqual(plain(app.sent[0]), {
    type: 'audio:play',
    mode: 'focus',
    settings: { ...defaultAudioSettings, musicStyle: 'baroque' },
  });
  assert.deepEqual(plain(app.session.data.flowWatchAudioKeyOffsets), { baroque: -5 });

  await vm.runInContext(`sendPlaybackMessage("audio:play", ${settings}, "focus")`, app.context);
  assert.deepEqual(plain(app.sent[1].previousKeyOffsets), { baroque: -5 });
  assert.deepEqual(plain(app.session.data.flowWatchAudioKeyOffsets), { baroque: -3 });
});

test('ending a completed focus session transitions from focus to relax audio', async () => {
  const now = Date.now();
  const app = harness({
    isRunning: true,
    mode: 'focus',
    startTime: now - 20 * 60 * 1000,
    plannedMinutes: 15,
  });
  vm.runInContext('endFocusSession()', app.context);
  await settle();
  await settle();
  assert.equal(app.local.data.mode, 'break');
  assert.equal(app.local.data.isRunning, true);
  assert.deepEqual(plain(app.sent.slice(-3)), [
    { type: 'audio:stop' },
    { type: 'audio:alarm' },
    {
      type: 'audio:play',
      mode: 'relax',
      settings: defaultAudioSettings,
    },
  ]);
});

test('audio setting changes are forwarded when the offscreen document exists', async () => {
  const app = harness({}, { hasOffscreenDocument: true });
  app.sync.data.musicStyle = 'baroque';

  app.listeners.storageChanged({
    musicStyle: { oldValue: 'ambient', newValue: 'baroque' },
  }, 'sync');
  await settle();

  assert.deepEqual(plain(app.sent), [{
    type: 'audio:update',
    settings: {
      ...defaultAudioSettings,
      musicStyle: 'baroque',
    },
  }]);
});

test('legacy instrument changes are ignored by the active audio contract', async () => {
  const app = harness({}, { hasOffscreenDocument: true, syncOverrides: { instrument: 'piano' } });
  app.sync.data.instrument = 'harpsichord';
  app.listeners.storageChanged({
    instrument: { oldValue: 'piano', newValue: 'harpsichord' },
  }, 'sync');
  await settle();
  assert.deepEqual(app.sent, []);
});

test('ending focus early stops audio without starting relax mode', async () => {
  const app = harness({
    isRunning: true,
    mode: 'focus',
    startTime: Date.now() - 2 * 60 * 1000,
    plannedMinutes: 15,
  });
  vm.runInContext('endFocusSession()', app.context);
  await settle();
  await settle();
  assert.equal(app.local.data.mode, 'focus');
  assert.equal(app.local.data.isRunning, false);
  assert.deepEqual(plain(app.sent), [{ type: 'audio:stop' }]);
});

test('finishing a break stops generated audio', async () => {
  const app = harness({ isRunning: true, mode: 'break', startTime: Date.now() });
  vm.runInContext('finishBreak()', app.context);
  await settle();
  assert.equal(app.local.data.isRunning, false);
  assert.deepEqual(plain(app.sent), [{ type: 'audio:stop' }]);
});
