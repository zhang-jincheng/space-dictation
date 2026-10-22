// Keep the webview and process alive; a Dock reopen shows the same window.
export async function flushBeforeClose(event: { preventDefault(): void }, save: Promise<void>, hide: () => Promise<void>, onError: (error: unknown) => void): Promise<void> {
  event.preventDefault();
  try { await save; await hide(); }
  catch (error) { onError(error); }
}
