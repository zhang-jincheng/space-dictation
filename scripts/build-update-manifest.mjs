import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = 'zhang-jincheng/space-dictation';
export const updateFiles = version => ({
  'darwin-aarch64': `Space-Dictation_${version}_macOS-Apple-Silicon.app.tar.gz`,
  'windows-x86_64': `Space-Dictation_${version}_Windows-x64-setup.exe`,
});
export function createManifest(version, notes, assets, signatures) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(notes.trim().length > 20, 'Release notes must explain changes');
  const platforms = {};
  for (const [target, filename] of Object.entries(updateFiles(version))) {
    assert.ok(assets.some(a => a.name === filename && a.state === 'uploaded' && a.size > 0), `Missing complete ${target} package`);
    const signature = signatures[filename]?.trim();
    assert.ok(signature?.length > 100 && Buffer.from(signature, 'base64').toString().startsWith('untrusted comment:'), `Missing valid signature for ${target}`);
    platforms[target] = { signature, url: `https://github.com/${repository}/releases/download/v${version}/${filename}` };
  }
  return { version, notes: notes.trim(), platforms };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [version, output] = process.argv.slice(2);
  await mkdir(output, { recursive: true });
  const release = JSON.parse(execFileSync('gh', ['release', 'view', `v${version}`, '--repo', repository, '--json', 'assets'], { encoding: 'utf8' }));
  const signatures = {};
  for (const filename of Object.values(updateFiles(version))) {
    execFileSync('gh', ['release', 'download', `v${version}`, '--repo', repository, '--pattern', `${filename}.sig`, '--dir', output, '--clobber']);
    signatures[filename] = await readFile(join(output, `${filename}.sig`), 'utf8');
  }
  const notes = await readFile(`docs/releases/v${version}.md`, 'utf8');
  const manifest = createManifest(version, notes, release.assets, signatures);
  await writeFile(join(output, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Created complete signed-platform update manifest for v${version}.`);
}
