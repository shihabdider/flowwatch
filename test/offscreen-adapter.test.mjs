import test from 'node:test';
import assert from 'node:assert/strict';

test('offscreen adapter loads when runtime is the only available extension API', async () => {
  const previousChrome = globalThis.chrome;
  let messageListener;
  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        },
      },
    },
  };

  try {
    await import(`../offscreen.js?runtime-only=${Date.now()}`);
    assert.equal(typeof messageListener, 'function');
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});
