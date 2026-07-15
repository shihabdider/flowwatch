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

function harness(localOverrides = {}, { hasOffscreenDocument = false } = {}) {
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
    focusHz: 16,
    relaxHz: 10,
    musicStyle: 'ambient',
    instrument: 'existing',
    playAudio: true,
  });
  const event = (name) => ({ addListener(listener) { listeners[name] = listener; } });
  const chrome = {
    storage: { local, sync, onChanged: event('storageChanged') },
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
      sendMessage(message) { sent.push(message); return Promise.resolve(); },
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
  return { context, local, sync, sent, listeners };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const plain = (value) => JSON.parse(JSON.stringify(value));

test('starting focus requests focus-mode generated audio', async () => {
  const app = harness();
  await vm.runInContext('startFocusSession("write tests")', app.context);
  await settle();
  assert.equal(app.local.data.mode, 'focus');
  assert.equal(app.local.data.isRunning, true);
  assert.deepEqual(plain(app.sent.at(-1)), {
    type: 'audio:play',
    mode: 'focus',
    settings: {
      focusHz: 16,
      relaxHz: 10,
      musicStyle: 'ambient',
      instrument: 'existing',
      playAudio: true,
    },
  });
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
      settings: {
        focusHz: 16,
        relaxHz: 10,
        musicStyle: 'ambient',
        instrument: 'existing',
        playAudio: true,
      },
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
      focusHz: 16,
      relaxHz: 10,
      musicStyle: 'baroque',
      instrument: 'existing',
      playAudio: true,
    },
  }]);
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
