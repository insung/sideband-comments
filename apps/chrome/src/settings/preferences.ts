export interface ResolvedPreferenceStore {
  get(): Promise<unknown>;
  set(value: boolean): Promise<void>;
  subscribe(listener: (value: unknown) => void): () => void;
}
export async function watchResolvedPreference(store: ResolvedPreferenceStore, apply: (hidden: boolean) => void): Promise<() => void> {
  let changed = false;
  const stop = store.subscribe(value => { changed = true; apply(value === true); });
  try { const value = await store.get(); if (!changed) apply(value === true); }
  catch (error) { stop(); throw error; }
  return stop;
}
export async function installResolvedSettings(document: Document, store: ResolvedPreferenceStore): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>('#resolved')!;
  const status = document.querySelector<HTMLElement>('#resolved-status')!;
  let hidden = false, busy = false;
  const render = () => { button.textContent = hidden ? 'Show Resolved' : 'Hide Resolved'; button.setAttribute('aria-pressed', String(hidden)); button.disabled = busy; };
  button.disabled = true;
  try {
    await watchResolvedPreference(store, value => { hidden = value; render(); });
    button.addEventListener('click', () => {
      if (busy) return;
      busy = true; render();
      void store.set(!hidden).then(() => {
        status.textContent = 'Comment display saved. Open Markdown tabs update automatically.';
      }).catch(error => { status.textContent = error instanceof Error ? error.message : String(error); }).finally(() => { busy = false; render(); });
    });
  } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); button.disabled = true; }
}
export function chromeResolvedPreferences(): ResolvedPreferenceStore {
  return {
    get: async () => (await chrome.storage.local.get('hideResolved')).hideResolved,
    set: async value => { await chrome.storage.local.set({hideResolved:value}); },
    subscribe: listener => {
      const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'local' && 'hideResolved' in changes) listener(changes.hideResolved!.newValue);
      };
      chrome.storage.onChanged.addListener(changed);
      return () => chrome.storage.onChanged.removeListener(changed);
    }
  };
}
