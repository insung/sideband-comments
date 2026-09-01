import * as vscode from "vscode";
import { resolveAnchor, type ThreadComment, type ThreadState } from "@sideband-comments/core";
import { buildDocumentGroups, type DocumentGroup, type WorkspaceThreadEntry } from "./tree-model.js";
import type { WorkspaceComments } from "./workspace.js";

interface DocumentNode {
  kind: "document";
  group: DocumentGroup;
}

export interface ThreadNode {
  kind: "thread";
  workspaceKey: string;
  thread: ThreadState;
}

interface CommentNode {
  kind: "comment";
  threadId: string;
  comment: ThreadComment;
}

type SidebandTreeNode = DocumentNode | ThreadNode | CommentNode;

const oneLine = (value: string, maximum = 80): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
};

export class SidebandCommentsView implements vscode.TreeDataProvider<SidebandTreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<SidebandTreeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly tree: vscode.TreeView<SidebandTreeNode>;

  constructor(
    context: vscode.ExtensionContext,
    private readonly workspaces: () => readonly WorkspaceComments[]
  ) {
    this.tree = vscode.window.createTreeView("sidebandComments.comments", {
      treeDataProvider: this,
      showCollapseAll: true
    });
    context.subscriptions.push(this.tree);
  }

  dispose(): void {
    this.changed.dispose();
  }

  refresh(): void {
    this.changed.fire(undefined);
  }

  getTreeItem(node: SidebandTreeNode): vscode.TreeItem {
    if (node.kind === "document") {
      const item = new vscode.TreeItem(node.group.documentPath, vscode.TreeItemCollapsibleState.Expanded);
      if (this.workspaces().length > 1) item.description = node.group.workspaceName;
      item.iconPath = new vscode.ThemeIcon("file");
      item.contextValue = "sideband.document";
      return item;
    }
    if (node.kind === "thread") {
      const { thread } = node;
      const item = new vscode.TreeItem(oneLine(thread.anchor.exact), vscode.TreeItemCollapsibleState.Collapsed);
      const replies = Math.max(0, thread.comments.length - 1);
      item.description = `${thread.status}${replies ? ` · ${replies} repl${replies === 1 ? "y" : "ies"}` : ""}`;
      item.tooltip = new vscode.MarkdownString(
        `**${thread.status}** · ${thread.documentPath}\n\n${thread.comments.map((comment) =>
          `**${comment.author.name}:** ${comment.body}`
        ).join("\n\n")}`
      );
      item.iconPath = new vscode.ThemeIcon(thread.status === "resolved" ? "pass" : "comment-discussion");
      item.contextValue = `sideband.${thread.status}`;
      item.command = {
        command: "sidebandComments.openThread",
        title: "Open Comment",
        arguments: [node]
      };
      return item;
    }

    const item = new vscode.TreeItem(oneLine(node.comment.body), vscode.TreeItemCollapsibleState.None);
    item.description = node.comment.author.name;
    item.tooltip = new vscode.MarkdownString(node.comment.body);
    item.iconPath = new vscode.ThemeIcon("comment");
    item.contextValue = "sideband.comment";
    return item;
  }

  async getChildren(node?: SidebandTreeNode): Promise<SidebandTreeNode[]> {
    if (node?.kind === "document") {
      return node.group.threads.map((thread) => ({
        kind: "thread",
        workspaceKey: node.group.workspaceKey,
        thread
      }));
    }
    if (node?.kind === "thread") {
      return node.thread.comments.map((comment) => ({ kind: "comment", threadId: node.thread.id, comment }));
    }
    if (node?.kind === "comment") return [];

    const entries: WorkspaceThreadEntry[] = [];
    for (const workspace of this.workspaces()) {
      const threads = await workspace.repository.list();
      for (const thread of threads) {
        entries.push({
          workspaceKey: workspace.folder.uri.toString(),
          workspaceName: workspace.folder.name,
          thread
        });
      }
    }
    return buildDocumentGroups(entries).map((group) => ({ kind: "document", group }));
  }

  async openThread(node: ThreadNode): Promise<void> {
    const workspace = this.workspaces().find((candidate) => candidate.folder.uri.toString() === node.workspaceKey);
    if (!workspace) throw new Error("The comment workspace is no longer open.");

    const uri = vscode.Uri.joinPath(workspace.folder.uri, ...node.thread.documentPath.split("/"));
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, { preview: true });
    const resolution = resolveAnchor(document.getText(), node.thread.anchor);
    if (resolution.kind !== "resolved") {
      void vscode.window.showWarningMessage(`The comment anchor is ${resolution.kind}; re-anchor it from the editor.`);
      return;
    }
    const range = new vscode.Range(document.positionAt(resolution.start), document.positionAt(resolution.end));
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}
