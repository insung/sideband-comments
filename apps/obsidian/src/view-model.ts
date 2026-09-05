import { resolveAnchor, type ThreadState } from "@sideband-comments/core";

export interface ThreadViewModel extends ThreadState {
  anchorState: "resolved" | "ambiguous" | "orphaned";
  range?: { start: number; end: number };
}

export interface DocumentThreadViewModel {
  documentPath: string;
  threads: ThreadViewModel[];
}

export interface DocumentTreeDirectory {
  kind: "directory";
  name: string;
  path: string;
  children: DocumentTreeNode[];
}

export interface DocumentTreeFile {
  kind: "file";
  name: string;
  group: DocumentThreadViewModel;
}

export type DocumentTreeNode = DocumentTreeDirectory | DocumentTreeFile;

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

export function buildDocumentTree(groups: readonly DocumentThreadViewModel[]): DocumentTreeNode[] {
  const root: DocumentTreeNode[] = [];
  for (const group of groups) {
    const segments = group.documentPath.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    let children = root;
    let directoryPath = "";
    for (const segment of segments.slice(0, -1)) {
      directoryPath = directoryPath ? `${directoryPath}/${segment}` : segment;
      let directory = children.find((node): node is DocumentTreeDirectory =>
        node.kind === "directory" && node.name === segment
      );
      if (!directory) {
        directory = { kind: "directory", name: segment, path: directoryPath, children: [] };
        children.push(directory);
      }
      children = directory.children;
    }
    children.push({ kind: "file", name: segments.at(-1)!, group });
  }
  const sort = (nodes: DocumentTreeNode[]): DocumentTreeNode[] => nodes
    .map((node) => node.kind === "directory" ? { ...node, children: sort(node.children) } : node)
    .sort((left, right) =>
      Number(left.kind === "file") - Number(right.kind === "file") || left.name.localeCompare(right.name)
    );
  return sort(root);
}

export function selectDocumentPath(
  groups: readonly DocumentThreadViewModel[],
  selectedPath?: string,
  activePath?: string
): string | undefined {
  const available = new Set(groups.map((group) => group.documentPath));
  if (activePath) return activePath;
  if (selectedPath && available.has(selectedPath)) return selectedPath;
  return groups[0]?.documentPath;
}

export function resolvedToggleLabel(showResolved: boolean): "Hide resolved" | "Show resolved" {
  return showResolved ? "Hide resolved" : "Show resolved";
}

export function selectionPreviewText(selection: string): string {
  return selection.trim() || "New comment on editor selection";
}
