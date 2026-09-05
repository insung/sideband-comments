import { resolveAnchor, type ThreadState } from "@sideband-comments/core";

export interface ThreadViewModel extends ThreadState {
  anchorState: "resolved" | "ambiguous" | "orphaned";
  range?: { start: number; end: number };
}

export interface DocumentThreadViewModel {
  documentPath: string;
  threads: ThreadViewModel[];
}

export function buildThreadViewModels(
  markdown: string,
  threads: readonly ThreadState[],
  showResolved = true
): ThreadViewModel[] {
  return threads
    .filter((thread) => showResolved || thread.status !== "resolved")
    .map((thread): ThreadViewModel => {
      const resolution = resolveAnchor(markdown, thread.anchor);
      if (resolution.kind !== "resolved") return { ...thread, anchorState: resolution.kind };
      return {
        ...thread,
        anchorState: "resolved" as const,
        range: { start: resolution.start, end: resolution.end }
      };
    })
    .sort((a, b) => (a.range?.start ?? Number.MAX_SAFE_INTEGER) - (b.range?.start ?? Number.MAX_SAFE_INTEGER));
}

export function groupThreadViewModels(models: readonly ThreadViewModel[]): DocumentThreadViewModel[] {
  const groups = new Map<string, ThreadViewModel[]>();
  for (const model of models) {
    const threads = groups.get(model.documentPath) ?? [];
    threads.push(model);
    groups.set(model.documentPath, threads);
  }
  return [...groups.entries()]
    .map(([documentPath, threads]) => ({ documentPath, threads }))
    .sort((left, right) => left.documentPath.localeCompare(right.documentPath));
}
