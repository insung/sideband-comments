import * as vscode from "vscode";
import type { ThreadState } from "@sideband-comments/core";
import {
  buildDocumentGroups,
  buildThreadMessages,
  collectWorkspaceThreads,
  commentCountLabel,
  type DocumentGroup,
  type ThreadMessage
} from "./tree-model.js";
import type { WorkspaceComments } from "./workspace.js";

interface DocumentNode {
  kind: "document";
  group: DocumentGroup;
}

interface ThreadNode {
  kind: "thread";
  group: DocumentGroup;
  thread: ThreadState;
  message: ThreadMessage;
}

interface ReplyNode {
  kind: "reply";
  group: DocumentGroup;
  thread: ThreadState;
  message: ThreadMessage;
}

type SidebandTreeNode = DocumentNode | ThreadNode | ReplyNode;

export class SidebandCommentsView implements vscode.TreeDataProvider<SidebandTreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<SidebandTreeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly tree: vscode.TreeView<SidebandTreeNode>;

  constructor(
    context: vscode.ExtensionContext,
    private readonly workspaces: () => readonly WorkspaceComments[]
  ) {
    this.tree = vscode.window.createTreeView("sidebandComments.overviewView", {
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
    if (node.kind === "thread") return this.threadItem(node);
    if (node.kind === "reply") return this.replyItem(node);

    const count = commentCountLabel(node.group.threads.length);
    const item = new vscode.TreeItem(node.group.documentPath, vscode.TreeItemCollapsibleState.Collapsed);
    item.description = this.workspaces().length > 1 ? `${node.group.workspaceName} · ${count}` : count;
    item.tooltip = `${node.group.workspaceName}/${node.group.documentPath} · ${count}`;
    item.iconPath = new vscode.ThemeIcon("file");
    item.contextValue = "sideband.document";
    return item;
  }

  async getChildren(node?: SidebandTreeNode): Promise<SidebandTreeNode[]> {
    if (node?.kind === "reply") return [];
    if (node?.kind === "thread") {
      return buildThreadMessages(node.thread).slice(1).map((message) => ({
        kind: "reply",
        group: node.group,
        thread: node.thread,
        message
      }));
    }
    if (node?.kind === "document") {
      return node.group.threads.flatMap((thread) => {
        const message = buildThreadMessages(thread)[0];
        return message ? [{ kind: "thread" as const, group: node.group, thread, message }] : [];
      });
    }

    const collection = await collectWorkspaceThreads(this.workspaces().map((workspace) => ({
      workspaceKey: workspace.folder.uri.toString(),
      workspaceName: workspace.folder.name,
      list: () => workspace.repository.list()
    })));
    this.tree.message = collection.failures.length
      ? `Could not read: ${collection.failures.map((failure) => failure.workspaceName).join(", ")}`
      : "";
    const showResolved = vscode.workspace.getConfiguration("sidebandComments").get("showResolved", true);
    return buildDocumentGroups(collection.entries, showResolved).map((group) => ({ kind: "document", group }));
  }

  private threadItem(node: ThreadNode): vscode.TreeItem {
    const replyCount = Math.max(0, node.thread.comments.length - 1);
    const item = new vscode.TreeItem(
      node.message.preview,
      replyCount ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    item.description = `${node.message.comment.author.name} · ${node.thread.status}`;
    item.tooltip = [
      `Original text: ${node.thread.originalAnchor.exact}`,
      "",
      `${node.message.comment.author.name}:`,
      node.message.comment.body
    ].join("\n");
    item.iconPath = new vscode.ThemeIcon(node.thread.status === "resolved" ? "pass-filled" : "comment-discussion");
    item.contextValue = `sideband.treeThread.${node.thread.status}`;
    const command = this.openCommand(node.group);
    if (command) item.command = command;
    return item;
  }

  private replyItem(node: ReplyNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.message.preview, vscode.TreeItemCollapsibleState.None);
    item.description = node.message.comment.author.name;
    item.tooltip = `${node.message.comment.author.name}:\n\n${node.message.comment.body}`;
    item.iconPath = new vscode.ThemeIcon("reply");
    item.contextValue = "sideband.treeReply";
    const command = this.openCommand(node.group);
    if (command) item.command = command;
    return item;
  }

  private openCommand(group: DocumentGroup): vscode.Command | undefined {
    const workspace = this.workspaces().find((candidate) => candidate.folder.uri.toString() === group.workspaceKey);
    if (!workspace) return undefined;
    return {
      command: "vscode.open",
      title: "Open File",
      arguments: [vscode.Uri.joinPath(workspace.folder.uri, ...group.documentPath.split("/"))]
    };
  }

}
