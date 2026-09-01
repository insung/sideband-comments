import type { ThreadState } from "@sideband-comments/core";

export interface WorkspaceThreadEntry {
  workspaceKey: string;
  workspaceName: string;
  thread: ThreadState;
}

export interface DocumentGroup {
  workspaceKey: string;
  workspaceName: string;
  documentPath: string;
  threads: ThreadState[];
}

export function buildDocumentGroups(entries: readonly WorkspaceThreadEntry[]): DocumentGroup[] {
  const groups = new Map<string, DocumentGroup>();
  for (const entry of entries) {
    const key = `${entry.workspaceKey}\0${entry.thread.documentPath}`;
    const group = groups.get(key) ?? {
      workspaceKey: entry.workspaceKey,
      workspaceName: entry.workspaceName,
      documentPath: entry.thread.documentPath,
      threads: []
    };
    group.threads.push(entry.thread);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      threads: group.threads.sort((left, right) =>
        Number(left.status === "resolved") - Number(right.status === "resolved") ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.id.localeCompare(right.id)
      )
    }))
    .sort((left, right) =>
      left.workspaceName.localeCompare(right.workspaceName) ||
      left.documentPath.localeCompare(right.documentPath)
    );
}
