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

export type CommentTreeNode = {
  kind: "document";
  id: string;
  name: string;
  group: DocumentGroup;
} | {
  kind: "workspace" | "directory";
  id: string;
  name: string;
  workspaceKey: string;
  path: string;
  threadCount: number;
  children: CommentTreeNode[];
};

export function buildDocumentTree(groups: readonly DocumentGroup[]): CommentTreeNode[] {
  const roots = new Map<string, Extract<CommentTreeNode, { children: CommentTreeNode[] }>>();
  for (const group of groups) {
    let root = roots.get(group.workspaceKey);
    if (!root) {
      root = {
        kind: "workspace", id: JSON.stringify([group.workspaceKey, "workspace"]),
        name: group.workspaceName, workspaceKey: group.workspaceKey, path: "", threadCount: 0, children: []
      };
      roots.set(group.workspaceKey, root);
    }
    root.threadCount += group.threads.length;
    let parent = root;
    const parts = group.documentPath.split("/");
    for (let index = 0; index < parts.length - 1; index++) {
      const path = parts.slice(0, index + 1).join("/");
      let directory = parent.children.find((node) => node.kind === "directory" && node.path === path);
      if (!directory || directory.kind === "document") {
        directory = {
          kind: "directory", id: JSON.stringify([group.workspaceKey, "directory", path]),
          name: parts[index]!, workspaceKey: group.workspaceKey, path, threadCount: 0, children: []
        };
        parent.children.push(directory);
      }
      directory.threadCount += group.threads.length;
      parent = directory;
    }
    parent.children.push({
      kind: "document", id: JSON.stringify([group.workspaceKey, "document", group.documentPath]),
      name: parts.at(-1)!, group
    });
  }
  const sort = (nodes: CommentTreeNode[]): CommentTreeNode[] => {
    nodes.sort((a, b) => Number(a.kind === "document") - Number(b.kind === "document")
      || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    for (const node of nodes) if (node.kind !== "document") sort(node.children);
    return nodes;
  };
  return sort([...roots.values()]);
}
