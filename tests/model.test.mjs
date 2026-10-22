import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, makeSession, advance, keyAction, latchKey, parseWords, duplicateIds, accuracy, wrongWords } from '../src/space/model.ts';
import { buildImportPrompt } from '../src/space/importPrompt.ts';
const options = { ...initialState.settings, shuffle: false, count: 20 };
const words = [{ id: 'a', front: 'apple', back: '苹果' }, { id: 'b', front: 'a lot of', back: '许多' }];
test('starts silent, advances once per press, final press reviews without wrapping', () => {
  const s = makeSession('test', words, options);
  assert.equal(s.index, -1);
  const first = advance(s); assert.equal(first.index, 0); assert.equal(first.phase, 'listen');
  const last = advance(first); assert.equal(last.index, 1); assert.equal(last.phase, 'listen');
  const review = advance(last); assert.equal(review.index, 1); assert.equal(review.phase, 'review'); assert.equal(advance(review), review);
});
test('long press, IME, modifiers, background and editor keys do not advance', () => {
  const base = { key: ' ', repeat: false };
  assert.equal(keyAction(base, true, false), 'next');
  for (const change of [{ repeat: true }, { isComposing: true }, { metaKey: true }, { ctrlKey: true }, { altKey: true }]) assert.equal(keyAction({ ...base, ...change }, true, false), null);
  assert.equal(keyAction(base, false, false), null); assert.equal(keyAction(base, true, true), null);
  assert.equal(keyAction({ ...base, key: 'R' }, true, false), 'repeat');
});
test('fixed shuffled order and options survive JSON persistence', () => {
  const s = makeSession('test', words, { ...options, shuffle: true }, () => 0);
  assert.deepEqual(s.words.map(w => w.id), ['b', 'a']);
  const restored = JSON.parse(JSON.stringify(advance(s))); assert.deepEqual(restored.words, s.words); assert.equal(restored.index, 0);
  assert.equal(s.words.length, 2); assert.throws(() => makeSession('empty', [], options));
});
test('import handles BOM, CRLF, phrases, blanks, duplicate casing and CSV quoting', () => {
  const txt = parseWords('\uFEFFapple\r\n\r\nApple\r\na lot of\r\n', 'txt'); assert.equal(txt.blanks, 1); assert.equal(txt.words[2].front, 'a lot of'); assert.equal(duplicateIds(txt.words).size, 1);
  const csv = parseWords('translation,word\r\n"你好,朋友",hello\r\n"two ""quotes""\nnext",phrase', 'csv');
  assert.equal(csv.words[0].back, '你好,朋友'); assert.equal(csv.words[1].back, 'two "quotes"\nnext');
  assert.throws(() => parseWords('word,meaning\n"broken,meaning', 'csv'));
  assert.equal(parseWords('英文,中文释义\napple,苹果', 'csv').words[0].back, '苹果');
});
test('unmarked is neither correct nor incorrect; later correct review clears wrong word', () => {
  const s = makeSession('test', words, options); assert.equal(accuracy(s), null); assert.deepEqual(wrongWords([s]), []);
  s.marks = [false, true]; assert.equal(accuracy(s), 50); assert.deepEqual(wrongWords([s]).map(w => w.front), ['apple']);
  const retry = makeSession('retry', [words[0]], options); retry.marks = [true]; assert.deepEqual(wrongWords([s, retry]), []);
});

test('a held key is accepted only once even when WebKit omits repeat flag', () => {
 const held = new Set();
 assert.equal(latchKey(held, ' '), true);
 for (let i = 0; i < 10; i++) assert.equal(latchKey(held, ' '), false);
 held.delete(' '); assert.equal(latchKey(held, ' '), true);
 assert.equal(latchKey(held, 'R'), true); assert.equal(latchKey(held, 'r'), false);
});

test('ChatGPT import prompt is complete and contains the actual inbox path', () => {
  const folder = '/Users/test/Space Dictation Inbox';
  const prompt = buildImportPrompt(folder);
  assert.ok(prompt.length > 300);
  assert.match(prompt, /word,translation/);
  assert.match(prompt, /UTF-8/);
  assert.ok(prompt.includes(folder));
});
