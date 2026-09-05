export interface VisibleDocumentSyncPlan {
  load: string[];
  unload: string[];
}

export function planVisibleDocumentSync(
  visibleKeys: readonly string[],
  loadedKeys: readonly string[],
  loadingKeys: readonly string[]
): VisibleDocumentSyncPlan {
  const visible = new Set(visibleKeys);
  const loaded = new Set(loadedKeys);
  const loading = new Set(loadingKeys);
  return {
    load: [...visible].filter((key) => !loaded.has(key) && !loading.has(key)),
    unload: [...loaded].filter((key) => !visible.has(key))
  };
}

export function planActiveDocumentSync(
  activeKey: string | null | undefined,
  loadedKeys: readonly string[],
  loadingKeys: readonly string[]
): VisibleDocumentSyncPlan {
  if (activeKey === undefined) return { load: [], unload: [] };
  return planVisibleDocumentSync(activeKey === null ? [] : [activeKey], loadedKeys, loadingKeys);
}

export function commentRenderSignature(
  documentVersion: number,
  showResolved: boolean,
  threads: readonly unknown[]
): string {
  return JSON.stringify({ documentVersion, showResolved, threads });
}

export class KeyedSingleFlight {
  private readonly queued = new Map<string, () => Promise<void>>();
  private readonly running = new Map<string, Promise<void>>();

  has(key: string): boolean {
    return this.running.has(key);
  }

  keys(): string[] {
    return [...this.running.keys()];
  }

  run(key: string, task: () => Promise<void>): Promise<void> {
    const current = this.running.get(key);
    if (current) {
      this.queued.set(key, task);
      return current;
    }

    const pending = (async () => {
      let next: (() => Promise<void>) | undefined = task;
      while (next) {
        this.queued.delete(key);
        await next();
        next = this.queued.get(key);
      }
    })().finally(() => {
      this.queued.delete(key);
      if (this.running.get(key) === pending) this.running.delete(key);
    });
    this.running.set(key, pending);
    return pending;
  }
}
