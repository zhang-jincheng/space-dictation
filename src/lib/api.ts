import { flushBeforeClose } from '../space/closeGuard';
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { Deck, Card, StudyCard, ReviewStats, HeatmapDay, SessionResult, DeckProgress, Article, ArticleSummary, Question, ProviderConfig, ImportReport, ImportPreview, FieldMappingSelection, Composition, CompositionSummary, CompositionReview, AiExample, StudyTimeEntry } from '../types';

const TAURI_AVAILABLE = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>, options?: unknown): Promise<T> {
  if (!TAURI_AVAILABLE) {
    return Promise.reject(new Error(`Tauri runtime not available (command: ${cmd})`));
  }
  return tauriInvoke<T>(cmd as never, args as never, options as never);
}

export async function getDecks(): Promise<Deck[]> {
  return invoke('get_decks');
}

export async function createDeck(name: string, description: string, languageFrom = 'en', languageTo = 'zh'): Promise<Deck> {
  return invoke('create_deck', { name, description, languageFrom, languageTo });
}

export async function deleteDeck(deckId: string): Promise<void> {
  return invoke('delete_deck', { deckId });
}

export async function getCards(deckId: string): Promise<Card[]> {
  return invoke('get_cards', { deckId });
}

export async function addCard(deckId: string, front: string, back: string, phonetic = '', exampleSentence = ''): Promise<Card> {
  return invoke('add_card', { deckId, front, back, phonetic, exampleSentence });
}

export async function deleteCard(cardId: string): Promise<void> {
  return invoke('delete_card', { cardId });
}

export async function getStudyCards(deckId: string, limit = 20): Promise<StudyCard[]> {
  return invoke('get_study_cards', { deckId, limit });
}

export async function getStudyCardsAvailable(deckId: string): Promise<number> {
  return invoke('get_study_cards_available', { deckId });
}

export async function submitReviewSimple(cardId: string, rating: number, mastered: boolean): Promise<void> {
  return invoke('submit_review_simple', { cardId, rating, mastered });
}

export async function masterCard(cardId: string): Promise<void> {
  return invoke('master_card', { cardId });
}

export async function unmasterCard(cardId: string): Promise<void> {
  return invoke('unmaster_card', { cardId });
}

export async function updateCardNotes(cardId: string, notes: string): Promise<void> {
  return invoke('update_card_notes', { cardId, notes });
}

export async function getHeatmapData(): Promise<HeatmapDay[]> {
  return invoke('get_heatmap_data');
}

export async function exportSessionCsv(deckId: string, results: SessionResult[], filePath: string): Promise<void> {
  return invoke('export_session_csv', { deckId, results, filePath });
}

export async function getDeckDueCount(): Promise<[string, number][]> {
  return invoke('get_deck_due_count');
}

export async function getDeckProgress(deckId: string): Promise<DeckProgress> {
  return invoke('get_deck_progress', { deckId });
}

export async function getStats(): Promise<ReviewStats> {
  return invoke('get_stats');
}

export async function previewImportFile(filePath: string): Promise<ImportPreview> {
  return invoke('preview_import_file', { filePath });
}

export async function importDeckFile(
  deckId: string,
  filePath: string,
  fieldMapping?: FieldMappingSelection,
): Promise<ImportReport> {
  return invoke('import_csv_file', { deckId, filePath, fieldMapping: fieldMapping ?? null });
}

export async function bulkAddCards(deckId: string, text: string): Promise<number> {
  return invoke('bulk_add_cards', { deckId, text });
}

export async function speakText(text: string, lang: string): Promise<void> {
  return invoke('speak_text', { text, lang });
}

export async function speakAi(text: string, apiUrl: string, apiKey: string, voice: string, model: string): Promise<void> {
  return invoke('speak_ai', { text, apiUrl, apiKey, voice, model });
}

export async function stopTts(): Promise<void> {
  return invoke('stop_tts');
}

export async function checkNativeTtsVoice(lang: string): Promise<boolean> {
  return invoke('check_native_tts_voice', { lang });
}

export async function getPlatform(): Promise<string> {
  return invoke('get_platform');
}

export async function getSetting(key: string): Promise<string | null> {
  return invoke('get_setting', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke('set_setting', { key, value });
}

// === Article Library ===

export async function getArticles(): Promise<ArticleSummary[]> {
  return invoke('get_articles');
}

export async function getArticle(id: string): Promise<Article> {
  return invoke('get_article', { id });
}

export async function createArticle(title: string, content: string, source: string): Promise<Article> {
  return invoke('create_article', { title, content, source });
}

export async function deleteArticle(id: string): Promise<void> {
  return invoke('delete_article', { id });
}

export async function importArticleTxt(filePath: string): Promise<Article> {
  return invoke('import_article_txt', { filePath });
}

// === Composition ===

export async function getCompositions(): Promise<CompositionSummary[]> {
  return invoke('get_compositions');
}

export async function getComposition(id: string): Promise<Composition> {
  return invoke('get_composition', { id });
}

export async function createComposition(title: string, content: string, source: string): Promise<Composition> {
  return invoke('create_composition', { title, content, source });
}

export async function deleteComposition(id: string): Promise<void> {
  return invoke('delete_composition', { id });
}

export async function importCompositionTxt(filePath: string): Promise<Composition> {
  return invoke('import_composition_txt', { filePath });
}

export async function reviewCompositionWithConfig(compositionId: string, config: ProviderConfig, prompt?: string): Promise<CompositionReview> {
  return invoke('review_composition_with_config', { compositionId, config, prompt: prompt ?? null });
}

export async function saveCompositionReview(compositionId: string, review: CompositionReview): Promise<void> {
  return invoke('save_composition_review', { compositionId, review });
}

export async function getCompositionReview(compositionId: string): Promise<CompositionReview> {
  return invoke('get_composition_review', { compositionId });
}

export async function getCompositionReviewPrompt(): Promise<string> {
  return invoke('get_composition_review_prompt');
}

export async function setCompositionReviewPrompt(prompt: string): Promise<void> {
  return invoke('set_composition_review_prompt', { prompt });
}

// === AI Quiz (legacy — kept for backward compatibility) ===

export async function generateQuestions(articleId: string, apiUrl: string, apiKey: string, model: string, prompt?: string): Promise<Question[]> {
  return invoke('generate_questions', { articleId, apiUrl, apiKey, model, prompt: prompt ?? null });
}

export async function saveQuestions(articleId: string, questions: Question[]): Promise<void> {
  return invoke('save_questions', { articleId, questions });
}

export async function getArticleQuestions(articleId: string): Promise<Question[]> {
  return invoke('get_article_questions', { articleId });
}

export async function testAiApi(apiUrl: string, apiKey: string, model: string): Promise<string> {
  return invoke('test_ai_api', { apiUrl, apiKey, model });
}

// === AI Quiz (multi-provider) ===

export async function generateQuestionsWithConfig(articleId: string, config: ProviderConfig, prompt?: string): Promise<Question[]> {
  return invoke('generate_questions_with_config', { articleId, config, prompt: prompt ?? null });
}

export async function generateAiExample(word: string, languageTo: string): Promise<AiExample> {
  return invoke('generate_ai_example', { word, languageTo });
}

export async function testAiConfig(config: ProviderConfig): Promise<string> {
  return invoke('test_ai_config', { config });
}

export async function getAiProviderConfig(): Promise<string | null> {
  return getSetting('ai_provider_config');
}

export async function setAiProviderConfig(configJson: string): Promise<void> {
  return setSetting('ai_provider_config', configJson);
}

export async function getAiPrompt(): Promise<string> {
  return invoke('get_ai_prompt');
}

export async function setAiPrompt(prompt: string): Promise<void> {
  return invoke('set_ai_prompt', { prompt });
}

// === Device Code Login ===

export interface DeviceCode {
  user_code: string;
  verification_url: string;
  device_auth_id: string;
  interval: number;
}

export async function requestDeviceCode(): Promise<DeviceCode> {
  return invoke('request_device_code');
}

export async function completeDeviceCodeLogin(deviceCode: DeviceCode): Promise<string> {
  return invoke('complete_device_code_login', { deviceCode });
}

export async function getChatgptLoginUrl(): Promise<string> {
  return invoke('get_chatgpt_login_url');
}

// === User / Avatar ===

export async function saveAvatarFile(sourcePath: string): Promise<string> {
  return invoke('save_avatar_file', { sourcePath });
}

export async function getAvatarBase64(filename: string): Promise<string> {
  return invoke('get_avatar_base64', { filename });
}

// === Study Time Tracking ===

export async function recordStudyTime(date: string, seconds: number): Promise<void> {
  return invoke('record_study_time', { date, seconds });
}

export async function getStudyTimeRange(startDate: string, endDate: string): Promise<number> {
  return invoke('get_study_time_range', { startDate, endDate });
}

export async function getStudyTimeDaily(startDate: string, endDate: string): Promise<StudyTimeEntry[]> {
  return invoke('get_study_time_daily', { startDate, endDate });
}

export async function getStudyStreak(): Promise<number> {
  return invoke('get_study_streak');
}

// === Cache Management ===

export async function clearLearningProgress(): Promise<void> {
  return invoke('clear_learning_progress');
}

export async function clearReviewLogs(): Promise<void> {
  return invoke('clear_review_logs');
}

export async function clearSettings(): Promise<void> {
  return invoke('clear_settings');
}

export async function clearAllCache(): Promise<void> {
  return invoke('clear_all_cache');
}


// Space Dictation: all native calls stay in this bridge.
import type { AppState as SpaceState, WordDeck, Word, Voice } from '../space/model';
export const spaceLoad = () => invoke<SpaceState | null>('space_load');
export const spaceWords = (deckId: string) => invoke<Word[]>('space_words', { deckId });
export const spaceVoices = () => invoke<Voice[]>('space_voices');
export const spacePutDeck = (deck: WordDeck) => invoke<void>('space_put_deck', { deck });
export const spaceDeleteDeck = (deckId: string) => invoke<void>('space_delete_deck', { deckId });
let saveQueue: Promise<void> = Promise.resolve();
export function spaceSave(state: SpaceState): Promise<void> {
  const next = saveQueue.catch(() => {}).then(() => invoke<void>('space_save', { state }));
  saveQueue = next;
  return next;
}
export const spaceSpeak = (seq: number, text: string, voice: string, rate: number) => invoke<void>('space_speak', { seq, text, voice, rate });
export const spaceStop = (seq: number) => invoke<void>('space_stop', { seq });
export const spaceSpeechStatus = (seq: number) => invoke<string>('space_speech_status', { seq });
export async function spaceReadImport(): Promise<{ name: string; text: string; csv: boolean } | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ multiple: false, filters: [{ name: 'TXT / CSV', extensions: ['txt', 'csv'] }] });
  if (!path || Array.isArray(path)) return null;
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  return { name: path.split('/').pop()?.replace(/\.(txt|csv)$/i, '') || '', text: await readTextFile(path), csv: /\.csv$/i.test(path) };
}
export async function spaceExport(state: SpaceState): Promise<boolean> {
  await saveQueue;
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: `空格听写备份-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!path) return false;
  await invoke('space_export', { state, path });
  return true;
}
export async function spaceChooseBackup(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
  return typeof path === 'string' ? path : null;
}
export async function spaceRestore(path: string): Promise<SpaceState> {
  await saveQueue;
  return invoke('space_restore', { path });
}
export async function spaceGuardClose(onError: (e: unknown) => void): Promise<() => void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  return win.onCloseRequested(event => flushBeforeClose(event, saveQueue, async () => { await spaceCancelRecording(); await win.hide(); }, onError));
}
export interface SpaceImportHelp { folder: string; files: { name: string; path: string }[] }
export const spaceImportHelp = () => invoke<SpaceImportHelp>('space_import_help');
export const spaceOpenInbox = () => invoke<void>('space_open_inbox');
export const spaceCopyText = (text: string) => invoke<void>('space_copy_text', { text });
export const spaceReadPath = (path: string) => invoke<string>('space_read_inbox', { path });
export const spacePrepareAudio = (words: Word[], voice: string, rate: number) => invoke<SpaceAudioReport>('space_prepare_audio', { words, voice, rate });
export const spaceCancelAudio = () => invoke<void>('space_cancel_audio');
export const spaceStartRecording = (word: string) => invoke<void>('space_start_recording', { word });
export const spaceFinishRecording = () => invoke<SpaceRecording>('space_finish_recording');
export const spaceCancelRecording = () => invoke<void>('space_cancel_recording');
export async function spaceAudioProgress(callback: (p: { ready: number; total: number }) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<{ ready: number; total: number }>('space-audio-progress', event => callback(event.payload));
}

export interface SpaceRecording { word: string; accent: string; author: string; source: string; license: string; license_url: string; url: string; digest: string }
export interface SpaceAudioReport { ready: string[]; missing: { word: string; error: string }[]; sources: SpaceRecording[] }

export interface SpaceUpdate { version: string; current: string; filename: string; notes: string }
let startupUpdate: Promise<SpaceUpdate | null> | undefined;
export function spaceCheckUpdate(refresh = false): Promise<SpaceUpdate | null> {
  if (refresh) startupUpdate = undefined;
  return startupUpdate ??= invoke<SpaceUpdate | null>('space_check_update').catch(() => null);
}
export async function spaceDownloadUpdate(version: string): Promise<void> {
  await saveQueue;
  return invoke<void>('space_download_update', { version });
}

export async function spaceOnReopen(callback: () => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen('space-check-update', callback);
}

export interface SpaceUpdateProgress { stage: 'downloading' | 'installing' | 'restarting'; received: number; total: number | null }
export async function spaceOnUpdateProgress(callback: (progress: SpaceUpdateProgress) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<SpaceUpdateProgress>('space-update-progress', event => callback(event.payload));
}
