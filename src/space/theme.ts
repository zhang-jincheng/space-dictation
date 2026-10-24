export type ThemePreference = 'light' | 'dark' | 'system';
export const themeStorageKey = 'space.theme';
export function readTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem(themeStorageKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* The system theme still works when storage is unavailable. */ }
  return 'system';
}
export function applyTheme(preference: ThemePreference) {
  const dark = preference === 'dark' || preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
export function watchTheme(preference: ThemePreference) {
  applyTheme(preference);
  const system = matchMedia('(prefers-color-scheme: dark)');
  const update = () => applyTheme(preference);
  system.addEventListener('change', update);
  return () => system.removeEventListener('change', update);
}
// Apply before React renders, including the loading screen.
applyTheme(readTheme());
