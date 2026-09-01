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

export class KeyedSingleFlight {
  private readonly running = new Map<string, Promise<void>>();

  has(key: string): boolean {
    return this.running.has(key);
  }

  keys(): string[] {
    return [...this.running.keys()];
  }

  run(key: string, task: () => Promise<void>): Promise<void> {
    const current = this.running.get(key);
    if (current) return current;

    const pending = task().finally(() => {
      if (this.running.get(key) === pending) this.running.delete(key);
    });
    this.running.set(key, pending);
    return pending;
  }
}
