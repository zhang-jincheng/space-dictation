export interface Word { id: string; front: string; back: string }
export interface WordDeck { id: string; name: string; words: Word[] }
export interface Options { accent: string; voice: string; rate: number; shuffle: boolean; count: number }
export interface Session { id: string; name: string; created: string; words: Word[]; index: number; phase: 'listen' | 'review' | 'done'; marks: (boolean | null)[]; options: Options }
export interface AppState { settings: Options; sessions: Session[]; active: string | null }
export interface Voice { name: string; accent: string }
export const initialState: AppState = { settings: { accent: 'en_US', voice: 'recordings-v1', rate: 175, shuffle: true, count: 20 }, sessions: [], active: null };
export function makeSession(name: string, words: Word[], options: Options, random = Math.random): Session {
  if (!words.length) throw new Error('empty');
  const order = [...words];
  if (options.shuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const chosen = order.slice(0, Math.min(options.count, 1000));
  return { id: crypto.randomUUID(), name, created: new Date().toISOString(), words: chosen, index: -1, phase: 'listen', marks: chosen.map(() => null), options: { ...options } };
}
export function advance(s: Session): Session {
  if (s.phase !== 'listen') return s;
  if (s.index === s.words.length - 1) return { ...s, phase: 'review' };
  return { ...s, index: s.index + 1 };
}
export function keyAction(e: { key: string; repeat: boolean; isComposing?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }, focused: boolean, blocked: boolean): 'next' | 'repeat' | null {
  if (!focused || blocked || e.repeat || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return null;
  return e.key === ' ' ? 'next' : e.key.toLowerCase() === 'r' ? 'repeat' : null;
}
export function latchKey(held: Set<string>, key: string): boolean {
  const normalized = key.toLowerCase();
  if (held.has(normalized)) return false;
  held.add(normalized);
  return true;
}
export function wordKey(w: Word): string { return w.front.trim().toLocaleLowerCase().replace(/\s+/g, ' '); }
export function wrongWords(sessions: Session[]): Word[] {
  const marked = new Map<string, Word>();
  for (const s of sessions) s.words.forEach((w, i) => {
    if (s.marks[i] === false) marked.set(wordKey(w), w);
    if (s.marks[i] === true) marked.delete(wordKey(w));
  });
  return [...marked.values()];
}
export function accuracy(s: Session): number | null {
  return s.marks.some(m => m === null) ? null : Math.round(s.marks.filter(Boolean).length / s.words.length * 100);
}
// RFC 4180 quoting, including embedded commas, CRLF, escaped quotes and quoted newlines.
export function csvRows(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false; let closed = false;
  const text = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === ',') { row.push(field); field = ''; closed = false; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; closed = false; }
    else { if (closed && c.trim()) throw new Error('csv'); field += c; }
  }
  if (quoted) throw new Error('csv');
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  return rows;
}
export function parseWords(text: string, format: 'txt' | 'csv'): { words: Word[]; blanks: number } {
  const rows = format === 'csv' ? csvRows(text) : text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).map(l => [l]);
  if (format === 'txt' && !rows.at(-1)?.[0] && /[\r\n]$/.test(text)) rows.pop();
  let front = 0, back = 1;
  const header = rows[0]?.map(c => c.trim().toLowerCase()) || [];
  const fi = header.findIndex(c => ['word', 'front', 'english', '单词', '英文'].includes(c));
  if (format === 'csv' && fi >= 0) { front = fi; back = header.findIndex(c => ['back', 'translation', 'meaning', 'chinese', '释义', '中文', '中文释义'].includes(c)); rows.shift(); }
  let blanks = 0;
  const words: Word[] = [];
  for (const row of rows) {
    const word = (row[front] || '').trim();
    if (!word) { blanks++; continue; }
    words.push({ id: crypto.randomUUID(), front: word, back: format === 'csv' ? (row[back] || '').trim() : '' });
  }
  return { words, blanks };
}
export function duplicateIds(words: Word[]): Set<string> {
  const keys = new Set<string>(); const duplicates = new Set<string>();
  for (const w of words) { const key = wordKey(w); if (keys.has(key)) duplicates.add(w.id); else keys.add(key); }
  return duplicates;
}
