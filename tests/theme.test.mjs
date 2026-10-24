import test from 'node:test';
import assert from 'node:assert/strict';
const listeners = new Set();
const system = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null };
globalThis.matchMedia = () => system;
const classes = new Set();
globalThis.document = { documentElement: { dataset: {}, style: {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } } };
const { readTheme, applyTheme, watchTheme, themeStorageKey } = await import('../src/space/theme.ts');
const root = document.documentElement;
test('first render follows system; saved and invalid preferences are handled safely', () => {
  assert.equal(root.dataset.theme, 'light');
  for (const value of ['light', 'dark', 'system', 'invalid']) {
    values.set(themeStorageKey, value);
    assert.equal(readTheme(), value === 'invalid' ? 'system' : value);
  }
  localStorage.getItem = () => { throw new Error('storage unavailable'); };
  assert.equal(readTheme(), 'system');
});
test('system changes update immediately, explicit selection wins, and listeners are removed', () => {
  const cleanup = watchTheme('system');
  system.matches = true;
  for (const fn of listeners) fn();
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.style.colorScheme, 'dark');
  assert.ok(classes.has('dark'));
  cleanup();
  assert.equal(listeners.size, 0);
  const stop = watchTheme('light');
  for (const fn of listeners) fn();
  assert.equal(root.dataset.theme, 'light');
  assert.ok(!classes.has('dark'));
  stop();
  system.matches = false;
  applyTheme('dark');
  assert.equal(root.dataset.theme, 'dark');
});
