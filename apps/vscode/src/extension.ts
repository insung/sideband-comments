import * as vscode from "vscode";
import { SidebandCommentController } from "./comments.js";
import { mapRenamedDocument } from "./paths.js";
import { SidebandCommentsView } from "./tree.js";
import { WorkspaceComments } from "./workspace.js";

export function activate(context: vscode.ExtensionContext): void {
  const workspaces = new Map<string, WorkspaceComments>();
  const refreshWorkspaces = () => {
    const active = new Set((vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.toString()));
    for (const key of workspaces.keys()) if (!active.has(key)) workspaces.delete(key);
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (!workspaces.has(folder.uri.toString())) workspaces.set(folder.uri.toString(), new WorkspaceComments(folder));
    }
  };
  refreshWorkspaces();
  const tree = new SidebandCommentsView(context, () => [...workspaces.values()]);

  const workspaceFor = (uri: vscode.Uri) => {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return folder ? workspaces.get(folder.uri.toString()) : undefined;
  };
  const comments = new SidebandCommentController(workspaceFor);
  const showResolved = () => vscode.workspace.getConfiguration("sidebandComments").get("showResolved", true);
  void vscode.commands.executeCommand("setContext", "sidebandComments.showResolved", showResolved());
  const register = (command: string, handler: (...args: any[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, async (...args: any[]) => {
      try {
        return await handler(...args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Sideband Comments: ${message}`);
        return undefined;
      }
    }));

  register("sidebandComments.add", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (await comments.addOnSelection(editor)) {
      tree.refresh();
      await vscode.commands.executeCommand("commentsView.focus");
    }
  });
  register("sidebandComments.create", async (reply: vscode.CommentReply) => {
    await comments.submit(reply);
    tree.refresh();
  });
  register("sidebandComments.reply", async (reply: vscode.CommentReply) => {
    await comments.submit(reply);
    tree.refresh();
  });
  register("sidebandComments.resolve", async (thread: vscode.CommentThread) => {
    await comments.setStatus(thread, "resolved");
    tree.refresh();
  });
  register("sidebandComments.reopen", async (thread: vscode.CommentThread) => {
    await comments.setStatus(thread, "open");
    tree.refresh();
  });
  register("sidebandComments.reanchor", async (thread: vscode.CommentThread) => {
    await comments.reanchor(thread);
    tree.refresh();
  });
  register("sidebandComments.deleteComment", async (comment: vscode.Comment) => {
    if (await comments.deleteComment(comment)) tree.refresh();
  });
  const setShowResolved = async (value: boolean) => {
    await vscode.workspace.getConfiguration("sidebandComments").update(
      "showResolved",
      value,
      vscode.ConfigurationTarget.Workspace
    );
    await vscode.commands.executeCommand("setContext", "sidebandComments.showResolved", value);
    await comments.reloadActive();
    tree.refresh();
  };
  register("sidebandComments.showResolved", () => setShowResolved(true));
  register("sidebandComments.hideResolved", () => setShowResolved(false));
  register("sidebandComments.reload", async () => {
    await comments.reloadActive();
    tree.refresh();
  });

  const watcher = vscode.workspace.createFileSystemWatcher("**/.comments/threads/*.jsonl");
  let reloadTimer: NodeJS.Timeout | undefined;
  const scheduleReload = () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined;
      void comments.reloadActive();
      tree.refresh();
    }, 100);
  };
  watcher.onDidCreate(scheduleReload);
  watcher.onDidChange(scheduleReload);
  watcher.onDidDelete(scheduleReload);

  context.subscriptions.push(
    comments,
    tree,
    watcher,
    { dispose: () => { if (reloadTimer) clearTimeout(reloadTimer); } },
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshWorkspaces();
      void comments.reloadActive();
      tree.refresh();
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) void comments.load(document);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("sidebandComments.showResolved")) return;
      void vscode.commands.executeCommand("setContext", "sidebandComments.showResolved", showResolved());
      void comments.reloadActive();
      tree.refresh();
    }),
    vscode.workspace.onDidRenameFiles(async ({ files }) => {
      refreshWorkspaces();
      for (const { oldUri, newUri } of files) {
        const workspace = workspaceFor(newUri) ?? workspaceFor(oldUri);
        if (!workspace) continue;
        let oldPath: string;
        let newPath: string;
        try {
          oldPath = workspace.relativePath(oldUri);
          newPath = workspace.relativePath(newUri);
        } catch {
          continue;
        }
        const threads = await workspace.repository.list();
        for (const thread of threads) {
          const destination = mapRenamedDocument(thread.documentPath, oldPath, newPath);
          if (destination) await workspace.service.relocate(thread.id, destination);
        }
      }
      await comments.reloadActive();
      tree.refresh();
    })
  );
}

export function deactivate(): void {}
