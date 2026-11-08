import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const app = readFileSync(new URL('../src/space/SpaceApp.tsx', import.meta.url), 'utf8');
const recordings = readFileSync(new URL('../src-tauri/src/recordings.rs', import.meta.url), 'utf8');

test('online misses show the reason and retain the personal-recording entry', () => {
  assert.match(app, /pendingAudio\.report\.missing\.map/);
  assert.match(app, /<p>\{item\.error\}<\/p>/);
  assert.match(app, /onClick=\{\(\) => openRecorder\(item\.word\)\}/);
  assert.match(app, /ready: \[\.\.\.new Set\(\[\.\.\.pending\.report\.ready/);
});

test('personal recording cache remains first and unchanged', () => {
  assert.match(recordings, /if let Some\(recording\) = crate::personal_recordings::cached\(dir, text\) \{\s+return Some\(recording\);/);
  assert.match(recordings, /let path = audio_path\(dir, text, accent\);/);
});
