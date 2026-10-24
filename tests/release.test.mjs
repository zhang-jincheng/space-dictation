import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createManifest, updateFiles } from '../scripts/build-update-manifest.mjs';
const files = Object.values(updateFiles('1.3.0'));
const assets = files.map(name => ({ name, state: 'uploaded', size: 1000 }));
const signature = Buffer.from('untrusted comment: test\n' + 'x'.repeat(150)).toString('base64');
const signatures = Object.fromEntries(files.map(name => [name, signature]));
const notes = '相比上一版：新增自动更新说明和双版收词提示词。';
test('release manifest includes changes and exact platform packages', () => {
  const m = createManifest('1.3.0', notes, assets, signatures);
  assert.equal(m.notes, notes);
  assert.ok(m.platforms['darwin-aarch64'].url.endsWith('.app.tar.gz'));
  assert.ok(m.platforms['windows-x86_64'].url.endsWith('-setup.exe'));
  assert.equal(m.platforms['darwin-aarch64'].signature, signature);
});
test('incomplete platform, signature or release notes prevent publication', () => {
  assert.throws(() => createManifest('1.3.0', notes, assets.slice(1), signatures));
  assert.throws(() => createManifest('1.3.0', notes, assets, {}));
  assert.throws(() => createManifest('1.3.0', '', assets, signatures));
  assert.throws(() => createManifest('1.3.1', notes, assets, signatures));
});
