import * as vscode from "vscode";
import {
  buildDocumentGroups,
  collectWorkspaceThreads,
  commentCountLabel,
  type DocumentGroup
} from "./tree-model.js";
import type { WorkspaceComments } from "./workspace.js";

interface DocumentNode {
  kind: "document";
  group: DocumentGroup;
}

export class SidebandCommentsView implements vscode.TreeDataProvider<DocumentNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<DocumentNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly tree: vscode.TreeView<DocumentNode>;

  constructor(
    context: vscode.ExtensionContext,
    private readonly workspaces: () => readonly WorkspaceComments[],
    private readonly onSelect: (group: DocumentGroup) => void
  ) {
    this.tree = vscode.window.createTreeView("sidebandComments.overviewView", {
      treeDataProvider: this,
      showCollapseAll: true
    });
    context.subscriptions.push(
      this.tree,
      this.tree.onDidChangeSelection(({ selection }) => {
        const node = selection[0];
        if (node) this.onSelect(node.group);
      })
    );
  }

  dispose(): void {
    this.changed.dispose();
  }

  refresh(): void {
    this.changed.fire(undefined);
  }

  getTreeItem(node: DocumentNode): vscode.TreeItem {
    const count = commentCountLabel(node.group.threads.length);
    const item = new vscode.TreeItem(node.group.documentPath, vscode.TreeItemCollapsibleState.None);
    item.description = this.workspaces().length > 1 ? `${node.group.workspaceName} · ${count}` : count;
    item.tooltip = `${node.group.workspaceName}/${node.group.documentPath} · ${count}`;
    item.iconPath = new vscode.ThemeIcon("file");
    item.contextValue = "sideband.document";
    return item;
  }

  async getChildren(node?: DocumentNode): Promise<DocumentNode[]> {
    if (node) return [];

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
}
