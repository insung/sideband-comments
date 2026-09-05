import * as vscode from "vscode";
import {
  buildDocumentGroups,
  buildDocumentTree,
  type CommentTreeNode,
  collectWorkspaceThreads,
  commentCountLabel,
  type DocumentGroup
} from "./tree-model.js";
import type { WorkspaceComments } from "./workspace.js";

export class SidebandCommentsView implements vscode.TreeDataProvider<CommentTreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<CommentTreeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly tree: vscode.TreeView<CommentTreeNode>;

  constructor(
    context: vscode.ExtensionContext,
    private readonly workspaces: () => readonly WorkspaceComments[],
    private readonly onSelect: (group: DocumentGroup) => void | Promise<void>,
    private readonly log: (message: string) => void = () => {}
  ) {
    this.tree = vscode.window.createTreeView("sidebandComments.overviewView", {
      treeDataProvider: this,
      showCollapseAll: true
    });
    context.subscriptions.push(
      this.tree,
      vscode.commands.registerCommand("sidebandComments.openDocument", (group: DocumentGroup) => this.onSelect(group))
    );
  }

  dispose(): void {
    this.changed.dispose();
  }

  refresh(): void {
    this.changed.fire(undefined);
  }

  getTreeItem(node: CommentTreeNode): vscode.TreeItem {
    const isDocument = node.kind === "document";
    const count = commentCountLabel(isDocument ? node.group.threads.length : node.threadCount);
    const item = new vscode.TreeItem(node.name, isDocument
      ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded);
    item.id = node.id;
    item.description = count;
    item.contextValue = `sideband.${node.kind}`;
    if (node.kind === "document") {
      item.command = { command: "sidebandComments.openDocument", title: "Open Comment File", arguments: [node.group] };
      item.tooltip = `${node.group.workspaceName}/${node.group.documentPath} · ${count}`;
      item.iconPath = new vscode.ThemeIcon("file");
    } else {
      item.tooltip = `${node.name} · ${count}`;
      item.iconPath = new vscode.ThemeIcon(node.kind === "workspace" ? "repo" : "folder");
    }
    return item;
  }

  async getChildren(node?: CommentTreeNode): Promise<CommentTreeNode[]> {
    if (node) return node.kind === "document" ? [] : node.children;

    const collection = await collectWorkspaceThreads(this.workspaces().map((workspace) => ({
      workspaceKey: workspace.folder.uri.toString(),
      workspaceName: workspace.folder.name,
      list: async () => {
        const threads = await workspace.repository.list();
        this.log(`Explorer repository=${workspace.folder.uri.toString()} threads=${threads.length}`);
        return threads;
      }
    })));
    this.tree.message = collection.failures.length
      ? `Could not read: ${collection.failures.map((failure) => failure.workspaceName).join(", ")}`
      : "";
    const showResolved = vscode.workspace.getConfiguration("sidebandComments").get("showResolved", true);
    const groups = buildDocumentGroups(collection.entries, showResolved);
    this.log(`Explorer getChildren repositories=${this.workspaces().length} files=${groups.length} threads=${collection.entries.length} failures=${JSON.stringify(collection.failures)}`);
    return buildDocumentTree(groups);
  }
}
