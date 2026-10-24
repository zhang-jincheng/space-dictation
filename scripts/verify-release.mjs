import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const [path, version] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(path, 'utf8'));
assert.equal(manifest.version.replace(/^v/, ''), version);
assert.ok(typeof manifest.notes === 'string' && manifest.notes.trim().length > 20, 'Release notes must describe changes');
const release = JSON.parse(execFileSync('gh', ['release', 'view', `v${version}`, '--json', 'assets'], { encoding: 'utf8' }));
for (const [target, suffix] of [['darwin-aarch64', '.app.tar.gz'], ['windows-x86_64', '.exe']]) {
  const platform = manifest.platforms[target] ?? manifest.platforms[`${target}-nsis`];
  assert.ok(platform, `Missing platform ${target}`);
  assert.ok(platform.signature?.length > 100, `Missing signature for ${target}`);
  const url = new URL(platform.url);
  assert.equal(url.origin, 'https://github.com');
  assert.ok(url.pathname.startsWith(`/zhang-jincheng/space-dictation/releases/download/v${version}/`));
  assert.ok(url.pathname.endsWith(suffix));
  const filename = decodeURIComponent(url.pathname.split('/').pop());
  const asset = release.assets.find(asset => asset.name === filename);
  assert.ok(asset?.size > 0 && asset.state === 'uploaded', `${target} asset is missing or incomplete`);
  assert.ok(release.assets.some(asset => asset.name === `${filename}.sig` && asset.size > 0), `${target} signature file is missing`);
}
console.log(`Verified v${version} notes, platform URLs and update signatures.`);
