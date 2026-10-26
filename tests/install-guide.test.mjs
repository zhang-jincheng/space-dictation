import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const macInstallCommand = 'sudo xattr -rd com.apple.quarantine "/Applications/空格听写.app"';
const html = readFileSync(new URL('../docs/mac-install-copy.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function guide(writeText, fallback) {
  let click;
  const command = { value: html.match(/readonly spellcheck="false">([^<]+)<\/textarea>/)[1], focus() {}, select() {} };
  const status = { textContent: '' };
  const document = {
    getElementById(id) { return id === 'command' ? command : id === 'status' ? status : { addEventListener(_, fn) { click = fn; } }; },
    execCommand: fallback,
  };
  runInNewContext(script, { document, navigator: { clipboard: { writeText } } });
  return { command, status, click: () => click() };
}
test('downloadable guide copies the complete installation command', async () => {
  let copied;
  const page = guide(async text => { copied = text; });
  assert.equal(page.command.value, macInstallCommand);
  assert.ok(!macInstallCommand.includes('\n'));
  await page.click();
  assert.equal(copied, macInstallCommand);
  assert.match(page.status.textContent, /^已复制/);
});
test('clipboard denial uses fallback; a failed fallback never claims success', async () => {
  const reject = async () => { throw new Error('clipboard denied'); };
  const success = guide(reject, () => true);
  await success.click(); assert.match(success.status.textContent, /^已复制/);
  const failure = guide(reject, () => false);
  await failure.click(); assert.match(failure.status.textContent, /未允许复制/);
  assert.doesNotMatch(failure.status.textContent, /^已复制/);
});
