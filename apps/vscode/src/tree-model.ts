import type { ThreadState } from "@sideband-comments/core";

export interface WorkspaceThreadEntry {
  workspaceKey: string;
  workspaceName: string;
  thread: ThreadState;
}

export interface WorkspaceThreadSource {
  workspaceKey: string;
  workspaceName: string;
  list: () => Promise<ThreadState[]>;
}

export interface WorkspaceThreadCollection {
  entries: WorkspaceThreadEntry[];
  failures: Array<{ workspaceName: string; message: string }>;
}

export async function collectWorkspaceThreads(
  sources: readonly WorkspaceThreadSource[]
): Promise<WorkspaceThreadCollection> {
  const results = await Promise.all(sources.map(async (source) => {
    try {
      const threads = await source.list();
      return {
        entries: threads.map((thread) => ({
          workspaceKey: source.workspaceKey,
          workspaceName: source.workspaceName,
          thread
        })),
        failure: undefined
      };
    } catch (error) {
      return {
        entries: [],
        failure: {
          workspaceName: source.workspaceName,
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }));
  return {
    entries: results.flatMap((result) => result.entries),
    failures: results.flatMap((result) => result.failure ? [result.failure] : [])
  };
}

export interface DocumentGroup {
  workspaceKey: string;
  workspaceName: string;
  documentPath: string;
  threads: ThreadState[];
}

export function commentCountLabel(count: number): string {
  return `${count} comment${count === 1 ? "" : "s"}`;
}

export interface ThreadMessage {
  kind: "comment" | "reply";
  comment: ThreadState["comments"][number];
  preview: string;
}

export function commentPreview(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

export function buildThreadMessages(thread: ThreadState): ThreadMessage[] {
  return thread.comments.map((comment, index) => ({
    kind: index === 0 ? "comment" : "reply",
    comment,
    preview: commentPreview(comment.body)
  }));
}

export function buildDocumentGroups(entries: readonly WorkspaceThreadEntry[], showResolved = true): DocumentGroup[] {
  const groups = new Map<string, DocumentGroup>();
  for (const entry of entries.filter(({ thread }) => showResolved || thread.status !== "resolved")) {
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
