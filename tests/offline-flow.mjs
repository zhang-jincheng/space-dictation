// CLI integration test. No UI automation, user data or system network settings are touched.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import { makeSession, advance, parseWords, duplicateIds, accuracy, wrongWords, initialState, latchKey } from '../src/space/model.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.SPACE_OFFLINE_CHILD !== '1') {
  // Deny IP egress while preserving the local Unix sockets used by macOS speech services.
  const policy = '(version 1)(allow default)(deny network-outbound (remote ip "*:*"))';
  const child = spawnSync('/usr/bin/sandbox-exec', ['-p', policy, process.execPath, fileURLToPath(import.meta.url)], {
    cwd: root, env: { ...process.env, SPACE_OFFLINE_CHILD: '1' }, stdio: 'inherit', timeout: 180000,
  });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
await new Promise((resolvePromise, reject) => {
  const socket = createConnection({ host: '1.1.1.1', port: 443 });
  socket.setTimeout(2000);
  socket.once('connect', () => { socket.destroy(); reject(new Error('External network unexpectedly allowed')); });
  socket.once('timeout', () => { socket.destroy(); reject(new Error('Cannot prove network denial: timed out')); });
  socket.once('error', error => {
    socket.destroy();
    if (['EPERM', 'EACCES'].includes(error.code)) resolvePromise(); else reject(error);
  });
});
console.log('OFFLINE_NETWORK_OK: external IP connection denied by OS');
const options = { ...initialState.settings, voice: 'recordings-v1', shuffle: true, count: 3 };
const parsed = parseWords('\uFEFFword,translation\napple,苹果\nhello,你好\nApple,重复项\nopportunity,机会\n', 'csv');
const duplicates = duplicateIds(parsed.words);
const words = parsed.words.filter(word => !duplicates.has(word.id));
assert.equal(words.length, 3);
const session = makeSession('离线验收', words, options, () => 0);
const state = current => ({ settings: options, active: current.phase === 'done' ? null : current.id, sessions: [structuredClone(current)] });
const stages = [state(session)];
const held = new Set();
let current = advance(session);
assert.equal(latchKey(held, ' '), true);
assert.equal(latchKey(held, ' '), false);
assert.equal(current.index, 0);
stages.push(state(current));
const persisted = JSON.parse(JSON.stringify(current));
assert.deepEqual(persisted.words, current.words);
while (current.phase === 'listen') current = advance(current);
assert.equal(current.index, 2);
assert.equal(current.phase, 'review');
assert.equal(accuracy(current), null);
stages.push(state(current));
current = { ...current, phase: 'done', marks: [false, true, true] };
assert.equal(accuracy(current), 67);
stages.push(state(current));
const mistakes = wrongWords([current]);
assert.equal(mistakes.length, 1);
let retry = makeSession('错词重练', mistakes, options);
while (retry.phase === 'listen') retry = advance(retry);
retry = { ...retry, phase: 'done', marks: [true] };
assert.deepEqual(wrongWords([current, retry]), []);
stages.push({ settings: options, active: null, sessions: [current, retry] });
const scenario = { deck: { id: 'offline-acceptance-only', name: '离线验收词表', words }, stages };
const temporary = mkdtempSync(join(tmpdir(), 'space-offline-flow-'));
try {
  const fixture = join(temporary, 'frontend-scenario.json');
  writeFileSync(fixture, JSON.stringify(scenario));
  const deps = join(root, 'src-tauri/target/debug/deps');
  const binaries = readdirSync(deps).filter(name => /^app_lib-[a-f0-9]+$/.test(name)).map(name => join(deps, name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  assert.ok(binaries.length, 'Build Rust tests first');
  const child = spawnSync(binaries[0], ['--ignored', '--exact', 'space::offline_flow_tests::frontend_native_workflow', '--nocapture'], {
    env: { ...process.env, SPACE_OFFLINE_SCENARIO: fixture }, encoding: 'utf8', timeout: 120000,
  });
  process.stdout.write(child.stdout || ''); process.stderr.write(child.stderr || '');
  assert.equal(child.status, 0, child.error?.message || 'Native integration test failed');
  assert.match(child.stdout, /OFFLINE_NATIVE_OK/);
  console.log('OFFLINE_FLOW_OK: real frontend state and native services passed with external networking denied');
} finally { rmSync(temporary, { recursive: true, force: true }); }
