import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { flushBeforeClose } from '../src/space/closeGuard.ts';
test('close waits for pending save and hides the window without destroying or quitting', async () => {
  let release;
  let complete = false;
  let prevented = false;
  let hidden = false;
  const save = new Promise(resolve => { release = resolve; });
  const pending = flushBeforeClose({ preventDefault() { prevented = true; } }, save, async () => { hidden = true; }, assert.fail).then(() => { complete = true; });
  await Promise.resolve(); assert.equal(complete, false); assert.equal(prevented, true); assert.equal(hidden, false);
  release(); await pending; assert.equal(complete, true); assert.equal(prevented, true); assert.equal(hidden, true);
  const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url)));
  assert.ok(capability.permissions.includes('core:window:allow-hide'));
  assert.ok(!capability.permissions.includes('core:window:allow-destroy'));
});
test('failed save prevents close and reports the failure', async () => {
  let prevented = false; let failure;
  const error = new Error('disk full');
  await flushBeforeClose({ preventDefault() { prevented = true; } }, Promise.reject(error), async () => { assert.fail("Must not hide on failed save"); }, e => { failure = e; });
  assert.equal(prevented, true); assert.equal(failure, error);
});
