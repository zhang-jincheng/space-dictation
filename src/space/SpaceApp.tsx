import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, BookOpenIcon, CheckIcon, XMarkIcon, SpeakerWaveIcon, AdjustmentsHorizontalIcon, ArrowPathIcon, PlusIcon, DocumentDuplicateIcon, FolderOpenIcon, HomeIcon, PencilSquareIcon, TrashIcon, ExclamationCircleIcon, PauseIcon, MicrophoneIcon } from '@heroicons/react/24/outline';
import * as api from '../lib/api';
import { t } from '../lib/i18n';
import Select from '../components/Select';
import type { Deck } from '../types';
import { initialState, advance, makeSession, wrongWords, accuracy, parseWords, duplicateIds, keyAction, latchKey } from './model';
import type { AppState, Session, Word, WordDeck } from './model';
import { buildImportPrompt } from './importPrompt';
import { macInstallCommand } from './macInstall';
import { applyTheme, readTheme, themeStorageKey, watchTheme } from './theme';
import type { ThemePreference } from './theme';
import './space.css';

const initialSpeechSeq = Date.now() * 1000;
const tr = (key: string, params?: Record<string, string | number>) => t(`space.${key}`, params);
type Page = 'home' | 'decks' | 'wrong' | 'settings' | 'listen' | 'review' | 'editor';
const deckTitle = (deck: Deck) => deck.id.startsWith('builtin-') ? tr(`builtin${deck.name}`) : deck.name;
export default function SpaceApp() {
  const [theme, setTheme] = useState<ThemePreference>(readTheme);
  useEffect(() => watchTheme(theme), [theme]);
  const chooseTheme = (value: ThemePreference) => {
    applyTheme(value);
    setTheme(value);
    try { localStorage.setItem(themeStorageKey, value); } catch { /* Keep the choice for this window. */ }
  };
  const themeChoices = (location: string) => <div className="theme-choices" role="group" aria-label={tr('themeTitle')} data-location={location}>{(['light', 'dark', 'system'] as const).map(value => <button type="button" key={value} aria-pressed={theme === value} onClick={() => chooseTheme(value)}><span aria-hidden="true">{value === 'light' ? '☀' : value === 'dark' ? '☾' : '◐'}</span>{tr(`theme${value}`)}</button>)}</div>;
  const [update, setUpdate] = useState<api.SpaceUpdate | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateProgress, setUpdateProgress] = useState<api.SpaceUpdateProgress | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = (refresh = false) => { void api.spaceCheckUpdate(refresh).then(info => { if (!cancelled) setUpdate(info); }); };
    let cleanup: (() => void) | undefined;
    check();
    void api.spaceOnReopen(() => check(true)).then(fn => { if (cancelled) fn(); else cleanup = fn; }).catch(() => {});
    return () => { cancelled = true; cleanup?.(); };
  }, []);
  const installUpdate = async () => {
    if (!update || updating) return;
    setUpdating(true); setUpdateError(''); setUpdateProgress(null);
    let cleanup: (() => void) | undefined;
    try {
      cleanup = await api.spaceOnUpdateProgress(setUpdateProgress);
      await api.spaceDownloadUpdate(update.version);
    }
    catch (error) { setUpdateError(String(error)); setUpdating(false); setUpdateProgress(null); }
    finally { cleanup?.(); }
  };
  const [data, setData] = useState<AppState | null>(null);
  const latest = useRef<AppState>(initialState);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [pendingAudio, setPendingAudio] = useState<{ session: Session; report: api.SpaceAudioReport } | null>(null);
  const [recordWord, setRecordWord] = useState<string | null>(null);
  const [micStatus, setMicStatus] = useState<'idle' | 'starting' | 'recording' | 'saving' | 'saved'>('idle');
  const [micError, setMicError] = useState('');
  const [micSeconds, setMicSeconds] = useState(0);
  const micGeneration = useRef(0);
  const micFinishing = useRef(false);
  const [recording, setRecording] = useState<api.SpaceRecording | null>(null);
  const [page, setPage] = useState<Page>('home');
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  const [selected, setSelected] = useState('builtin-CET4');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [installCopied, setInstallCopied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [audioProgress, setAudioProgress] = useState<{ ready: number; total: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'saveFailed'>('saved');
  const saveVersion = useRef(0);
  const heldKeys = useRef(new Set<string>());
  const seq = useRef(initialSpeechSeq);
  const [speech, setSpeech] = useState({ seq: 0, playing: false });
  const currentPage = useRef<Page>('home');
  const [editor, setEditor] = useState<WordDeck | null>(null);
  const [raw, setRaw] = useState('');
  const [format, setFormat] = useState<'txt' | 'csv'>('txt');
  const [preview, setPreview] = useState(false);
  const [blanks, setBlanks] = useState(0);
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'restore'; value: string; name: string } | null>(null);
  const [viewSession, setViewSession] = useState<string | null>(null);
  const [importHelp, setImportHelp] = useState<api.SpaceImportHelp | null>(null);
  const [promptAssistant, setPromptAssistant] = useState<'chatgpt' | 'doubao'>('chatgpt');
  const [deckDetail, setDeckDetail] = useState<WordDeck | null>(null);

  const selectDeck = useCallback((id: string) => {
    setSelected(id);
    window.localStorage.setItem('space.selectedDeck', id);
  }, []);

  const report = useCallback((e: unknown) => { setError(tr('error', { message: String(e) })); }, []);
  const commit = useCallback((value: AppState) => {
    latest.current = value;
    setData(value);
    const v = ++saveVersion.current;
    setSaveStatus('saving');
    void api.spaceSave(value).then(() => { if (v === saveVersion.current) setSaveStatus('saved'); }).catch(e => { if (v === saveVersion.current) { setSaveStatus('saveFailed'); report(e); } });
  }, [report]);
  const stop = useCallback(() => {
    const id = ++seq.current;
    setSpeech({ seq: id, playing: false });
    void api.spaceStop(id).catch(report);
  }, [report]);
  const go = useCallback((next: Page) => {
    stop();
    setRecording(null);
    currentPage.current = next;
    setPage(next); setError(''); setNotice('');
  }, [stop]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.spaceLoad(), api.getDecks()]).then(([saved, ds]) => {
      if (cancelled) return;
      const s = saved || structuredClone(initialState);
      s.settings.voice = 'recordings-v1';
      latest.current = s; setData(s); setDecks(ds); setLoadError(false);
      const remembered = window.localStorage.getItem('space.selectedDeck');
      const initialDeck = ds.find(d => d.id === remembered)
        || ds.find(d => !d.id.startsWith('builtin-'))
        || ds.find(d => d.id === 'builtin-CET4')
        || ds[0];
      if (initialDeck) selectDeck(initialDeck.id);
    }).catch(e => { if (!cancelled) { setLoadError(true); report(e); } });
    return () => { cancelled = true; };
  }, [reload, report, selectDeck]);
  useEffect(() => {
    let cancelled = false;
    const loadHelp = () => { void api.spaceImportHelp().then(info => { if (!cancelled) setImportHelp(info); }).catch(report); };
    loadHelp();
    window.addEventListener('focus', loadHelp);
    return () => { cancelled = true; window.removeEventListener('focus', loadHelp); };
  }, [report]);
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;
    void api.spaceGuardClose(report).then(unlisten => { if (disposed) unlisten(); else cleanup = unlisten; }).catch(report);
    return () => { disposed = true; cleanup?.(); };
  }, [report]);
  useEffect(() => {
    if (!speech.playing) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void api.spaceSpeechStatus(speech.seq).then(status => {
        if (!cancelled && seq.current === speech.seq && status !== 'playing') setSpeech({ seq: speech.seq, playing: false });
      }).catch(e => { if (!cancelled && seq.current === speech.seq) { setSpeech({ seq: speech.seq, playing: false }); report(e); } });
    }, 200);
    return () => { cancelled = true; clearInterval(timer); };
  }, [speech, report]);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void api.spaceAudioProgress(setAudioProgress).then(fn => { if (disposed) fn(); else cleanup = fn; }).catch(report);
    return () => { disposed = true; cleanup?.(); };
  }, [report]);
  const speak = useCallback((word: Word) => {
    const options = latest.current.settings;
    const id = ++seq.current;
    setSpeech({ seq: id, playing: true });
    void api.spaceSpeak(id, word.front, options.accent, options.rate).catch(e => {
      if (seq.current === id) { setSpeech({ seq: id, playing: false }); report(e); }
    });
  }, [report]);
  const updateSession = useCallback((session: Session) => {
    commit({ ...latest.current, sessions: latest.current.sessions.map(s => s.id === session.id ? session : s) });
  }, [commit]);
  const next = useCallback(() => {
    const s = latest.current.sessions.find(x => x.id === latest.current.active);
    if (!s || s.phase !== 'listen') return;
    const advanced = advance(s);
    updateSession(advanced);
    if (advanced.phase === 'review') { setViewSession(s.id); go('review'); }
    else speak(advanced.words[advanced.index]);
  }, [go, speak, updateSession]);
  const repeat = useCallback(() => {
    const s = latest.current.sessions.find(x => x.id === latest.current.active);
    if (s && s.phase === 'listen' && s.index >= 0) speak(s.words[s.index]);
  }, [speak]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (currentPage.current !== 'listen') return;
      const target = e.target instanceof Element ? e.target : null;
      const blocked = !!update || !!confirm || !!pendingAudio || !!recordWord || busy || !!target?.closest('input,textarea,select,button,[contenteditable="true"],[role="dialog"],[role="combobox"]');
      const action = keyAction(e, document.hasFocus() && document.visibilityState === 'visible', blocked);
      if (!action) { if (e.key === ' ' && e.repeat && !blocked) e.preventDefault(); return; }
      e.preventDefault();
      if (!latchKey(heldKeys.current, e.key)) return;
      if (action === 'next') next(); else repeat();
    };
    const onUp = (e: KeyboardEvent) => { heldKeys.current.delete(e.key.toLowerCase()); };
    const onBlur = () => { heldKeys.current.clear(); stop(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    const visibility = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', visibility); };
  }, [next, repeat, stop, busy, confirm, pendingAudio, recordWord, update]);

  const session = data?.sessions.find(s => s.id === (viewSession || data.active));
  const active = data?.sessions.find(s => s.id === data.active && s.phase !== 'done');
  const wrong = data ? wrongWords(data.sessions) : [];
  const refreshDecks = async () => setDecks(await api.getDecks());
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { report(e); } finally { setBusy(false); setAudioProgress(null); } };
  const startWords = async (name: string, words: Word[]) => {
    if (!words.length) { setError(tr('noMatching')); return; }
    const s = makeSession(name, words, latest.current.settings);
    setAudioProgress({ ready: 0, total: s.words.length });
    const result = await api.spacePrepareAudio(s.words, s.options.accent, s.options.rate);
    if (result.missing.length) { setPendingAudio({ session: s, report: result }); return; }
    beginPrepared(s);
  };
  const beginPrepared = (s: Session) => {
    commit({ ...latest.current, active: s.id, sessions: [...latest.current.sessions, s] });
    setPendingAudio(null); setViewSession(null); go('listen');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };
  const replay = (word: Word) => void run(async () => {
    stop();
    const options = latest.current.settings;
    const result = await api.spacePrepareAudio([word], options.accent, options.rate);
    if (result.missing.length) { setRecordWord(word.front); setMicStatus('idle'); setMicError(result.missing[0].error); return; }
    setRecording(result.sources[0] || null); speak(word);
  });
  const start = () => void run(async () => {
    const d = decks.find(x => x.id === selected);
    if (d) await startWords(deckTitle(d), await api.spaceWords(d.id));
  });
  const resume = (target: Session | undefined = active) => void run(async () => {
    if (!target) return;
    if (target.phase === 'listen') {
      setAudioProgress({ ready: 0, total: target.words.length });
      const result = await api.spacePrepareAudio(target.words, target.options.accent, target.options.rate);
      if (result.missing.length) throw new Error(result.missing.map(m => `${m.word}: ${m.error}`).join('；'));
    }
    commit({ ...latest.current, active: target.id, settings: { ...latest.current.settings, accent: target.options.accent, rate: target.options.rate } });
    setViewSession(null); go(target.phase === 'listen' ? 'listen' : 'review');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const openEditor = () => { setEditor({ id: crypto.randomUUID(), name: '', words: [] }); setRaw(''); setFormat('txt'); setPreview(false); setBlanks(0); go('editor'); };
  const importFile = () => void run(async () => {
    const file = await api.spaceReadImport(); if (!file) return;
    const result = parseWords(file.text, file.csv ? 'csv' : 'txt');
    setEditor({ id: crypto.randomUUID(), name: file.name, words: result.words }); setBlanks(result.blanks); setPreview(true); go('editor');
  });
  const previewInbox = (file: api.SpaceImportHelp['files'][number]) => void run(async () => {
    const text = await api.spaceReadPath(file.path);
    const result = parseWords(text, /\.csv$/i.test(file.name) ? 'csv' : 'txt');
    setEditor({ id: crypto.randomUUID(), name: file.name.replace(/\.(txt|csv)$/i, ''), words: result.words });
    setBlanks(result.blanks); setPreview(true); go('editor');
  });
  const previewImport = () => {
    try { const parsed = parseWords(raw, format); if (!parsed.words.length) { setError(tr('emptyImport')); return; } setEditor(e => e ? { ...e, words: parsed.words } : e); setBlanks(parsed.blanks); setPreview(true); setError(''); }
    catch { setError(tr('csvError')); }
  };
  const saveDeck = () => void run(async () => {
    if (!editor) return;
    if (!editor.name.trim()) { setError(tr('nameRequired')); return; }
    if (editor.words.some(w => w.front.length > 500 || w.back.length > 20000)) { setError(tr('tooLong')); return; }
    const dups = duplicateIds(editor.words);
    const cleaned = { ...editor, words: editor.words.filter(w => w.front.trim() && !dups.has(w.id)).map(w => ({ ...w, front: w.front.trim(), back: w.back.trim() })) };
    await api.spacePutDeck(cleaned); await refreshDecks(); selectDeck(cleaned.id); setDeckDetail(null); go('decks');
  });
  const setSetting = (patch: Partial<AppState['settings']>) => commit({ ...latest.current, settings: { ...latest.current.settings, ...patch } });
  const mark = (index: number, value: boolean) => { if (session) { const marks = [...session.marks]; marks[index] = value; updateSession({ ...session, marks }); } };
  const finish = () => {
    if (!session || accuracy(session) === null) return;
    commit({ ...latest.current, active: latest.current.active === session.id ? null : latest.current.active, sessions: latest.current.sessions.map(s => s.id === session.id ? { ...session, phase: 'done' } : s) });
    stop();
  };
  const confirmAction = () => void run(async () => {
    if (!confirm) return;
    if (confirm.kind === 'delete') { await api.spaceDeleteDeck(confirm.value); await refreshDecks(); setDeckDetail(null); selectDeck('builtin-CET4'); }
    else { const restored = await api.spaceRestore(confirm.value); latest.current = restored; setData(restored); setSaveStatus('saved'); setViewSession(null); setDeckDetail(null); await refreshDecks(); setNotice(tr('restored')); }
    setConfirm(null);
  });
  const reviewWords = session?.words.filter((_, i) => session.marks[i] === false) || [];
  const duplicates = editor ? duplicateIds(editor.words) : new Set<string>();
  const importPrompt = importHelp ? buildImportPrompt(importHelp.folder, promptAssistant) : '';
  const openRecorder = (word: string) => { stop(); setRecordWord(word); setMicStatus('idle'); setMicError(''); setMicSeconds(0); };
  const cancelRecorder = useCallback(() => {
    ++micGeneration.current;
    stop();
    void api.spaceCancelRecording().catch(report);
    setRecordWord(null); setMicStatus('idle'); setMicError('');
  }, [report, stop]);
  const finishRecording = useCallback(async () => {
    if (micFinishing.current) return;
    micFinishing.current = true;
    const generation = micGeneration.current;
    setMicStatus('saving');
    try {
      const source = await api.spaceFinishRecording();
      if (generation !== micGeneration.current) return;
      setRecording(source); setMicStatus('saved');
      setPendingAudio(pending => {
        if (!pending) return pending;
        const matches = (word: string) => word.trim().toLowerCase() === source.word;
        return { ...pending, report: {
          ready: [...new Set([...pending.report.ready, ...pending.session.words.filter(w => matches(w.front)).map(w => w.id)])],
          missing: pending.report.missing.filter(w => !matches(w.word)),
          sources: [...pending.report.sources.filter(w => !matches(w.word)), source],
        } };
      });
    } catch (e) { if (generation === micGeneration.current) { setMicError(String(e)); setMicStatus('idle'); } }
    finally { micFinishing.current = false; }
  }, []);
  const beginRecording = async () => {
    if (!recordWord) return;
    const generation = ++micGeneration.current;
    stop(); setMicStatus('starting'); setMicError(''); setMicSeconds(0);
    try {
      await api.spaceStartRecording(recordWord);
      if (generation === micGeneration.current) setMicStatus('recording');
    } catch (e) { if (generation === micGeneration.current) { setMicError(String(e)); setMicStatus('idle'); } }
  };
  useEffect(() => {
    if (micStatus !== 'recording') return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setMicSeconds(seconds);
      if (seconds >= 59) { clearInterval(timer); void finishRecording(); }
    }, 200);
    const blur = () => cancelRecorder();
    window.addEventListener('blur', blur);
    return () => { clearInterval(timer); window.removeEventListener('blur', blur); };
  }, [micStatus, finishRecording, cancelRecorder]);
  const copyImportPrompt = (assistant: 'chatgpt' | 'doubao') => void run(async () => {
    const prompt = importHelp ? buildImportPrompt(importHelp.folder, assistant) : '';
    if (!prompt) throw new Error(tr('promptMissing'));
    await api.spaceCopyText(prompt);
    setPromptAssistant(assistant);
    setNotice(tr('copiedFor', { assistant: assistant === 'doubao' ? '豆包' : 'ChatGPT', n: prompt.length }));
  });

  if (!data) return <div className="boot"><span className="brand-mark">⌴</span><h1>{tr('name')}</h1><p>{tr(loadError ? 'loadFailed' : 'loading')}</p>{loadError && <button className="primary" onClick={() => setReload(v => v + 1)}>{tr('retry')}</button>}</div>;
  const nav = [
    { id: 'home' as Page, label: tr('home'), icon: HomeIcon },
    { id: 'decks' as Page, label: tr('decks'), icon: BookOpenIcon },
    { id: 'wrong' as Page, label: tr('wrong'), icon: PencilSquareIcon },
    { id: 'settings' as Page, label: tr('settings'), icon: AdjustmentsHorizontalIcon },
  ];
  return <div className="space-app">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">⌴</span><div><strong>{tr('name')}</strong><span>SPACE DICTATION</span></div></div>
      <nav>{nav.map(n => <button disabled={busy} key={n.id} className={(page === n.id || n.id === 'home' && ['listen', 'review'].includes(page) || n.id === 'decks' && page === 'editor') ? 'nav-item active' : 'nav-item'} onClick={() => { setDeckDetail(null); go(n.id); }}><n.icon />{n.label}{n.id === 'wrong' && wrong.length > 0 && <span className="nav-count">{wrong.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><p className="theme-label">{tr('themeTitle')}</p>{themeChoices('sidebar')}<div className="sidebar-note"><span className="tiny-dot" />{tr('local')}<small>{tr('based')}</small></div></div>
    </aside>
    <main>
      <header className="topbar"><span>{page === 'listen' ? tr('listening') : page === 'review' ? tr('review') : page === 'editor' ? tr('editorTitle') : nav.find(n => n.id === page)?.label}</span><span className={`save-state ${saveStatus === 'saveFailed' ? 'failed' : ''}`}><span className="tiny-dot" />{tr(saveStatus)}{saveStatus === 'saveFailed' && <button onClick={() => commit(latest.current)}>{tr('retrySave')}</button>}</span></header>
      {error && <div className="alert" role="alert"><ExclamationCircleIcon />{error}<button aria-label={tr('cancel')} onClick={() => setError('')}><XMarkIcon /></button></div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      <div className="content" key={page}>
      {page === 'home' && <>
        <section className="hero"><div><p className="eyebrow">{tr('eyebrow')}</p><h1>{tr('hero')}</h1><span className="hero-sticker">{tr('pressStart')} ↗</span><p className="intro">{tr('intro')}</p><div className="step-line"><span>01 {tr('step1')}</span><i>—</i><span>02 {tr('step2')}</span><i>—</i><span>03 {tr('step3')}</span></div></div><div className="space-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="keycap">space<span>空 格</span></div><span className="art-caption">ONE WORD AT A TIME</span></div></section>
        {active && <section className="resume-panel"><div><p className="eyebrow">{tr('pending')}</p><h2>{active.name}</h2><p>{tr('progress', { n: active.index + 1, total: active.words.length })} · {tr('confirmExit')}</p></div><button className="primary" disabled={busy} onClick={() => resume()}>{tr(active.phase === 'listen' ? 'resume' : 'reviewResume')}<ArrowRightIcon /></button></section>}<section className="setup"><div className="section-heading"><h2>{tr('setup')}</h2><span>{tr('noAuto')}</span></div><div className="setup-fields"><Select label={tr('source')} options={decks.map(d => ({ value: d.id, label: `${deckTitle(d)} · ${d.card_count}` }))} value={selected} onChange={selectDeck} /><label className="field">{tr('count')}<input aria-label={tr('count')} type="number" min="1" max="1000" value={data.settings.count} onChange={e => setSetting({ count: Math.min(1000, Math.max(1, Math.trunc(Number(e.target.value) || 1))) })} /></label><Select label={tr('order')} value={data.settings.shuffle ? 'shuffle' : 'sequential'} onChange={v => setSetting({ shuffle: v === 'shuffle' })} options={[{ value: 'shuffle', label: tr('shuffle') }, { value: 'sequential', label: tr('sequential') }]} /><button className="primary" disabled={busy || !decks.length} onClick={start}>{tr('start')}<ArrowRightIcon /></button></div><p className="muted small">{tr('countHint')} {tr('audioHint')} {tr('switchSessionHint')}</p></section>
        <section className="history"><div className="section-heading"><h2>{tr('recent')}</h2><span>{tr('doneCount', { n: data.sessions.filter(s => s.phase === 'done').length })}</span></div>{data.sessions.length ? [...data.sessions].reverse().slice(0, 8).map(s => <button className="history-row" key={s.id} disabled={busy} onClick={() => { if (s.phase === 'listen') resume(s); else { setViewSession(s.id); go('review'); } }}><span className="history-icon"><BookOpenIcon /></span><span><strong>{s.name}</strong><small>{new Date(s.created).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · {tr('words', { n: s.words.length })}</small></span><span className="history-result">{accuracy(s) === null ? tr('unmarked', { n: s.marks.filter(m => m === null).length }) : tr('result', { n: accuracy(s)! })}</span><ArrowRightIcon /></button>) : <div className="empty-history"><p>{tr('noHistory')}</p><small>{tr('historyHint')}</small></div>}</section>
      </>}
      {page === 'listen' && session && <section className="listen-panel" tabIndex={-1}>
        <div className="listen-header"><span>{session.name}</span><button className="text-button" onClick={() => go('home')}>{tr('exit')} ↗</button></div>
        <div className="progress-track"><div style={{ transform: `scaleX(${(session.index + 1) / session.words.length})` }} /></div>
        <div className="listen-center"><p className="eyebrow">{tr('noInput')}</p><div className={`sound-symbol ${speech.playing ? 'speaking' : ''}`} aria-hidden="true">{[0, 1, 2, 3, 4].map(n => <i key={n} />)}</div><h1>{session.index < 0 ? '—' : String(session.index + 1).padStart(2, '0')}</h1><p className="listen-total">/ {String(session.words.length).padStart(2, '0')}</p><h2>{session.index < 0 ? tr('ready') : tr('wordNumber', { n: session.index + 1 })}</h2><p className="listen-status" aria-live="polite">{speech.playing ? tr('playing') : session.index < 0 ? tr('pressStart') : session.index === session.words.length - 1 ? tr('last') : tr('waiting')}</p></div>
        <div className="listen-actions"><button className="secondary" disabled={session.index < 0} onClick={e => { e.currentTarget.blur(); repeat(); }}><SpeakerWaveIcon />{tr('repeat')}<kbd>R</kbd></button><button className="primary space-next" onClick={e => { e.currentTarget.blur(); next(); }}><span>{session.index < 0 ? tr('pressStart') : session.index === session.words.length - 1 ? tr('review') : tr('next')}</span><kbd>{tr('space')}</kbd><ArrowRightIcon /></button></div><p className="listen-footer">{tr('hidden')} {tr('audioReady')}</p>
      </section>}
      {page === 'review' && session && <>
        <div className="page-heading"><p className="eyebrow">{session.name}</p><h1>{tr(session.phase === 'done' ? 'finished' : 'review')}</h1><p>{tr(session.phase === 'done' ? 'finishHint' : 'reviewHint')}</p></div>
        <div className="review-summary"><strong>{accuracy(session) === null ? tr('reviewed', { n: session.marks.filter(m => m !== null).length, total: session.words.length }) : tr('result', { n: accuracy(session)! })}</strong><span>{tr('reviewOnlyWrong')} {reviewWords.length}</span></div>
        <div className="word-table review-table">{session.words.map((w, i) => <div className="word-row" key={w.id}><span className="row-number">{String(i + 1).padStart(2, '0')}</span><div className="word-content"><button className="word-play" disabled={busy} aria-label={tr('playWord', { word: w.front })} onClick={() => replay(w)}><strong lang="en">{w.front}</strong><SpeakerWaveIcon /></button><p>{w.back || tr('noDefinition')}</p><button className="record-link" aria-label={tr('recordFor', { word: w.front })} onClick={() => openRecorder(w.front)}><MicrophoneIcon />{tr('recordOwn')}</button></div><div className="mark-actions"><button className={`mark correct ${session.marks[i] === true ? 'selected' : ''}`} disabled={session.phase === 'done'} aria-pressed={session.marks[i] === true} aria-label={`${tr('correct')} ${w.front}`} onClick={() => mark(i, true)}><CheckIcon />{tr('correct')}</button><button className={`mark incorrect ${session.marks[i] === false ? 'selected' : ''}`} disabled={session.phase === 'done'} aria-pressed={session.marks[i] === false} aria-label={`${tr('incorrect')} ${w.front}`} onClick={() => mark(i, false)}><XMarkIcon />{tr('incorrect')}</button>{session.marks[i] === null && <small>{tr('pendingMark')}</small>}</div></div>)}</div>
        <div className="bottom-actions"><button className="secondary" onClick={() => go('home')}>{tr('back')}</button>{session.phase !== 'done' ? <button className="primary" disabled={accuracy(session) === null} title={accuracy(session) === null ? tr('finishRequired') : undefined} onClick={finish}>{tr('finish')}<CheckIcon /></button> : reviewWords.length > 0 && <button className="primary" disabled={busy} onClick={() => void run(async () => { await startWords(tr('reviewOnlyWrong'), reviewWords); })}>{tr('wrongPractice')}<ArrowRightIcon /></button>}</div>
      </>}
      {page === 'decks' && <>
        <div className="page-heading heading-actions"><div><p className="eyebrow">YOUR WORDS, YOUR WORLD</p><h1>{tr('decks')}</h1><p>{tr('noPersonalHint')}</p></div><div className="button-group"><button className="secondary" disabled={busy} onClick={importFile}><ArrowUpTrayIcon />{tr('import')}</button><button className="primary" onClick={openEditor}><PlusIcon />{tr('create')}</button></div></div>
        {!deckDetail && importHelp && <section className="import-helper"><div className="helper-heading"><div><p className="eyebrow">{tr('helperEyebrow')}</p><h2>{tr('helperTitle')}</h2></div><div className="button-group"><button className="primary" disabled={busy || !importPrompt} onClick={() => copyImportPrompt('doubao')}><DocumentDuplicateIcon />{tr('copyDoubaoPrompt')}</button><button className="secondary" disabled={busy || !importPrompt} onClick={() => copyImportPrompt('chatgpt')}><DocumentDuplicateIcon />{tr('copyChatGPTPrompt')}</button></div></div><p>{tr('helperHint')}</p><p className="inbox-path">{tr('promptPath')}：{importHelp.folder}</p><p className="small muted">{tr('promptPreviewFor', { assistant: promptAssistant === 'doubao' ? '豆包' : 'ChatGPT' })}</p><textarea className="prompt-preview" readOnly value={importPrompt} aria-label={tr('promptPreview')} /><div className="button-group"><button className="secondary" onClick={() => void run(api.spaceOpenInbox)}><FolderOpenIcon />{tr('openInbox')}</button><button className="text-button" onClick={() => void run(async () => setImportHelp(await api.spaceImportHelp()))}><ArrowPathIcon />{tr('refreshInbox')}</button></div><div className="inbox-list">{importHelp.files.length ? importHelp.files.map(file => <div className="inbox-row" key={file.path}><span>{file.name}</span><button className="text-button" disabled={busy} onClick={() => previewInbox(file)}>{tr('inboxPreview')} →</button></div>) : <p className="muted small">{tr('inboxEmpty')}</p>}</div></section>}
        {deckDetail ? <section><div className="deck-detail-toolbar"><Select label={tr('switchDeck')} value={deckDetail.id} onChange={id => void run(async () => { const d = decks.find(x => x.id === id); if (d) setDeckDetail({ id: d.id, name: deckTitle(d), words: await api.spaceWords(d.id) }); })} options={decks.map(d => ({ value: d.id, label: `${deckTitle(d)} · ${d.card_count}` }))} /><button className="primary" disabled={busy || !deckDetail.words.length} onClick={() => { selectDeck(deckDetail.id); go('home'); }}>{tr('useDeck')}<ArrowRightIcon /></button></div><div className="section-heading"><div><h2>{deckDetail.name}</h2><p className="muted small">{tr('deckPreviewCount', { total: deckDetail.words.length, shown: Math.min(300, deckDetail.words.length) })}</p></div><div className="button-group"><button className="secondary" onClick={() => setDeckDetail(null)}>{tr('cancel')}</button>{!deckDetail.id.startsWith('builtin-') && <><button className="secondary" onClick={() => { setEditor(structuredClone(deckDetail)); setPreview(true); setBlanks(0); go('editor'); }}>{tr('edit')}</button><button className="danger" onClick={() => setConfirm({ kind: 'delete', value: deckDetail.id, name: deckDetail.name })}>{tr('deleteDeck')}</button></>}</div></div><div className="word-table">{deckDetail.words.slice(0, 300).map((w, i) => <div className="word-row" key={w.id}><span className="row-number">{i + 1}</span><div className="word-content"><strong lang="en">{w.front}</strong><p>{w.back || tr('noDefinition')}</p></div></div>)}</div></section> : <>{['personal', 'builtin'].map(kind => { const list = decks.filter(d => kind === 'builtin' ? d.id.startsWith('builtin-') : !d.id.startsWith('builtin-')); return <section className="deck-section" key={kind}><div className="section-heading"><h2>{tr(kind)}</h2><span>{list.length}</span></div><div className="deck-grid">{list.map((d, i) => <button className={`deck-tile tone-${i % 3} ${selected === d.id ? 'selected' : ''}`} key={d.id} onClick={() => void run(async () => setDeckDetail({ id: d.id, name: deckTitle(d), words: await api.spaceWords(d.id) }))}><BookOpenIcon /><span className="deck-label">{kind === 'builtin' ? d.name : tr('personal')}</span><h3>{deckTitle(d)}</h3><span>{tr('words', { n: d.card_count })}</span><ArrowRightIcon className="tile-arrow" /></button>)}</div>{!list.length && <div className="empty-history"><p>{tr('noPersonal')}</p><button className="text-button" onClick={openEditor}>{tr('paste')} →</button></div>}</section>; })}</>}
      </>}
      {page === 'editor' && editor && <>
        <div className="page-heading"><p className="eyebrow">MAKE IT YOURS</p><h1>{tr(preview ? 'previewTitle' : 'create')}</h1><p>{tr(preview ? 'previewHint' : 'noPersonalHint')}</p></div>
        <label className="field name-field">{tr('deckName')}<input aria-label={tr('deckName')} maxLength={200} placeholder={tr('namePlaceholder')} value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
        {!preview ? <><Select label={tr('format')} value={format} onChange={v => setFormat(v as 'txt' | 'csv')} options={[{ value: 'txt', label: tr('plain') }, { value: 'csv', label: tr('csv') }]} /><textarea aria-label={tr('paste')} className="paste-area" value={raw} placeholder={tr('pastePlaceholder')} onChange={e => setRaw(e.target.value)} /><div className="bottom-actions"><button className="secondary" onClick={() => go('decks')}>{tr('cancel')}</button><button className="primary" onClick={previewImport}>{tr('preview')}<ArrowRightIcon /></button></div></> : <>
          {blanks > 0 && <p className="import-note">{tr('blankWarning', { n: blanks })}</p>}{duplicates.size > 0 && <p className="import-note">{tr('duplicateWarning', { n: duplicates.size })}</p>}
          <div className="editor-table"><div className="editor-labels"><span>{tr('english')}</span><span>{tr('meaning')}</span></div>{editor.words.map((w, i) => <div className={`editor-row ${duplicates.has(w.id) ? 'duplicate' : ''}`} key={w.id}><input aria-label={tr('wordLabel', { n: i + 1 })} value={w.front} onChange={e => setEditor({ ...editor, words: editor.words.map(x => x.id === w.id ? { ...x, front: e.target.value } : x) })} /><input aria-label={tr('meaningLabel', { n: i + 1 })} value={w.back} onChange={e => setEditor({ ...editor, words: editor.words.map(x => x.id === w.id ? { ...x, back: e.target.value } : x) })} /><button className="icon-button danger" aria-label={tr('deleteRow', { n: i + 1 })} onClick={() => setEditor({ ...editor, words: editor.words.filter(x => x.id !== w.id) })}><TrashIcon /></button></div>)}</div>
          {!editor.words.length && <p className="empty-history">{tr('emptyDeck')}</p>}<div className="bottom-actions"><button className="secondary" onClick={() => go('decks')}>{tr('cancel')}</button><button className="primary" disabled={busy} onClick={saveDeck}>{tr('saveDeck')}<CheckIcon /></button></div>
        </>}
      </>}
      {page === 'wrong' && <>
        <div className="page-heading heading-actions"><div><p className="eyebrow">A LITTLE MORE PRACTICE</p><h1>{tr('wrongTitle')}</h1><p>{tr('wrongHint')}</p></div>{wrong.length > 0 && <button className="primary" disabled={busy} onClick={() => void run(async () => { await startWords(tr('wrong'), wrong); })}>{tr('wrongPractice')}<ArrowRightIcon /></button>}</div>
        {wrong.length ? <div className="word-table">{wrong.map((w, i) => <div className="word-row" key={w.front}><span className="row-number">{i + 1}</span><div className="word-content"><strong lang="en">{w.front}</strong><p>{w.back || tr('noDefinition')}</p></div></div>)}</div> : <div className="empty-state"><CheckIcon /><h2>{tr('noWrong')}</h2><p>{tr('noWrongHint')}</p></div>}
      </>}
      {page === 'settings' && <>
        <div className="page-heading"><p className="eyebrow">JUST THE WAY YOU LIKE IT</p><h1>{tr('settings')}</h1><p>{tr('language')}</p></div>
        {/Macintosh|Mac OS X/.test(navigator.userAgent) && <section className="settings-section install-help"><h2>{tr('installHelpTitle')}</h2><p>{tr('installHelpHint')}</p><ol><li>{tr('installHelpSettings')}</li><li>{tr('installHelpTerminal')}</li></ol><textarea className="install-command" readOnly aria-label={tr('installCommandLabel')} value={macInstallCommand} /><button className="primary" disabled={busy} onClick={() => void run(async () => { await api.spaceCopyText(macInstallCommand); setInstallCopied(true); })}><DocumentDuplicateIcon />{tr(installCopied ? 'installCopied' : 'copyInstallCommand')}</button>{installCopied && <p role="status">{tr('installCommandCopied')}</p>}<p className="small muted">{tr('installCommandNotice')}</p></section>}
        <section className="settings-section appearance-section"><h2>{tr('themeTitle')}</h2><p className="muted small">{tr('themeHint')}</p>{themeChoices('settings')}</section>
        <section className="settings-section"><h2>{tr('voiceTitle')}</h2><p>{tr('recordingHint')}</p><div className="settings-grid"><Select label={tr('accent')} value={data.settings.accent} onChange={accent => { stop(); setSetting({ accent }); }} options={[{ value: 'en_US', label: tr('us') }, { value: 'en_GB', label: tr('uk') }]} /><label className="field">{tr('rate')}<input aria-label={tr('rate')} type="range" min="80" max="300" step="5" value={data.settings.rate} onChange={e => setSetting({ rate: Number(e.target.value) })} /><span className="small muted">{tr('rateHint', { n: (data.settings.rate / 175).toFixed(2) })}</span></label></div><button className="secondary" disabled={busy} onClick={() => { if (speech.playing) stop(); else replay({ id: 'test', front: 'apple', back: '' }); }}>{speech.playing ? <PauseIcon /> : <SpeakerWaveIcon />}{tr(speech.playing ? 'stop' : 'testVoice')}</button></section>
        <p className="muted small">{tr('cacheHint')}</p><section className="settings-section backup-section"><h2>{tr('backupTitle')}</h2><p>{tr('backupHint')}</p><div className="button-group"><button className="primary" disabled={busy} onClick={() => void run(async () => { if (await api.spaceExport(latest.current)) setNotice(tr('exported')); })}><ArrowDownTrayIcon />{tr('export')}</button><button className="secondary" disabled={busy} onClick={() => void run(async () => { const path = await api.spaceChooseBackup(); if (path) setConfirm({ kind: 'restore', value: path, name: path.split('/').pop() || path }); })}><ArrowPathIcon />{tr('restore')}</button></div></section>
      </>}
      {recording && ['review', 'settings'].includes(page) && <section className="recording-source"><strong>{tr('recordingSource', { word: recording.word })}</strong><p>{tr('actualAccent')}：{tr(recording.accent === 'personal' ? 'recordPersonal' : recording.accent === 'en_US' ? 'usActual' : recording.accent === 'en_GB' ? 'ukActual' : 'otherAccent')} · {recording.author || tr('sourceAuthor')} · {recording.license}</p><p>{recording.source}</p><p>{recording.license_url}</p>{recording.accent === 'personal' && <button className="secondary" onClick={() => openRecorder(recording.word)}><MicrophoneIcon />{tr('recordAgain')}</button>}</section>}
      </div>
      {busy && <div className="busy-indicator" role="status">{audioProgress ? tr('preparingAudio', audioProgress) : tr('busy')}{audioProgress && <button className="text-button" onClick={() => void api.spaceCancelAudio().catch(report)}>{tr('cancelAudio')}</button>}</div>}
    </main>
    {update && !confirm && !pendingAudio && !recordWord && !busy && <div className="modal-shade"><section role="dialog" aria-modal="true" aria-labelledby="update-title" className="confirm-modal update-modal" aria-busy={updating}><h2 id="update-title">{tr('updateTitle')}</h2><p>{tr('updateVersion', { current: update.current, version: update.version })}</p><p className="small muted">{tr('updateAsset', { filename: update.filename })}</p><section className="update-notes" aria-label={tr('updateChanges')}><h3>{tr('updateChanges')}</h3><p>{update.notes || tr('updateNotesMissing')}</p></section><p>{tr('updateHint')}</p>{updateError && <p className="import-note" role="alert">{updateError}</p>}{updating && <div role="status" className="update-progress"><p>{tr(updateProgress?.stage === 'installing' ? 'updateInstalling' : updateProgress?.stage === 'restarting' ? 'updateRestarting' : 'updateDownloading')}{updateProgress?.stage === 'downloading' && !!updateProgress.total && ` ${Math.min(100, Math.floor(updateProgress.received * 100 / updateProgress.total))}%`}</p><progress aria-label={tr('updateDownloading')} max={100} value={updateProgress?.stage === 'downloading' && updateProgress.total ? Math.min(100, updateProgress.received * 100 / updateProgress.total) : undefined} /></div>}<div className="button-group"><button className="update-later" autoFocus disabled={updating} onClick={() => setUpdate(null)}>{tr('updateLater')}</button><button className="update-now" disabled={updating} onClick={() => void installUpdate()}>{tr(updating ? 'updateDownloading' : 'updateNow')}</button></div></section></div>}
    {pendingAudio && <div className="modal-shade" inert={!!recordWord}><section role="dialog" aria-modal="true" aria-labelledby="audio-title" className="confirm-modal"><h2 id="audio-title">{tr(pendingAudio.report.missing.length ? 'missingAudioTitle' : 'recordAllReady')}</h2>{pendingAudio.report.missing.length > 0 && <p>{tr('missingAudioHint')}</p>}<div className="missing-recordings">{pendingAudio.report.missing.map(item => <div className="missing-recording-row" key={item.word}><div><strong lang="en">{item.word}</strong><p>{item.error}</p></div><button className="secondary" onClick={() => openRecorder(item.word)}><MicrophoneIcon />{tr('recordStart')}</button></div>)}{!pendingAudio.report.missing.length && <p>{tr('recordAllReady')}</p>}</div><div className="button-group"><button className="secondary" onClick={() => setPendingAudio(null)}>{tr('cancel')}</button><button className="primary" disabled={!pendingAudio.report.ready.length} onClick={() => { const words = pendingAudio.session.words.filter(w => pendingAudio.report.ready.includes(w.id)); beginPrepared({ ...pendingAudio.session, words, marks: words.map(() => null) }); }}>{tr('startAvailable', { n: pendingAudio.report.ready.length })}</button></div></section></div>}
    {recordWord && <div className="modal-shade recorder-shade"><section role="dialog" aria-modal="true" aria-labelledby="record-title" className="confirm-modal recorder-modal"><h2 id="record-title">{tr('recordTitle')}</h2><p className="record-word" lang="en">{recordWord}</p><p>{tr('recordHint')}</p><div className={`mic-status ${micStatus === 'recording' ? 'is-recording' : ''}`} role="status"><MicrophoneIcon /><span>{tr(`recordStatus${micStatus}`, { n: micSeconds })}</span></div>{micError && <p className="import-note" role="alert">{micError}</p>}<div className="button-group"><button className="secondary" disabled={micStatus === 'saving'} onClick={cancelRecorder}>{tr(micStatus === 'saved' ? 'recordDone' : 'cancel')}</button>{micStatus === 'saved' && <button className="secondary" onClick={() => speak({ id: 'personal-preview', front: recordWord, back: '' })}><SpeakerWaveIcon />{tr('recordPreview')}</button>}{micStatus === 'recording' ? <button className="primary" onClick={() => void finishRecording()}><CheckIcon />{tr('recordSave')}</button> : <button className="primary" disabled={micStatus === 'starting' || micStatus === 'saving'} autoFocus onClick={() => void beginRecording()}><MicrophoneIcon />{tr(micStatus === 'saved' ? 'recordAgain' : 'recordStart')}</button>}</div></section></div>}
    {confirm && <div className="modal-shade"><section role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="confirm-modal"><h2 id="confirm-title">{tr(confirm.kind === 'delete' ? 'deleteDeck' : 'restore')}</h2><p>{confirm.kind === 'delete' ? tr('deleteConfirm', { name: confirm.name }) : tr('restoreConfirm')}</p>{confirm.kind === 'restore' && <p className="small muted">{tr('restoreFile', { name: confirm.name })}</p>}{error && <p className="import-note" role="alert">{error}</p>}<div className="button-group"><button className="secondary" autoFocus disabled={busy} onClick={() => setConfirm(null)}>{tr('cancel')}</button><button className="primary" disabled={busy} onClick={confirmAction}>{tr(confirm.kind === 'delete' ? 'confirmDelete' : 'confirmRestore')}</button></div></section></div>}
  </div>;
}
