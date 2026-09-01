import * as vscode from "vscode";
import { SidebandCommentController } from "./comments.js";
import { mapRenamedDocument } from "./paths.js";
import { SidebandCommentsView, type ThreadNode } from "./tree.js";
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
      await vscode.commands.executeCommand("sidebandComments.comments.focus");
    }
  });
  register("sidebandComments.create", async (reply: vscode.CommentReply) => {
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
  register("sidebandComments.reload", async () => {
    await comments.reloadVisible();
    tree.refresh();
  });
  register("sidebandComments.openThread", (node: ThreadNode) => tree.openThread(node));

  const watcher = vscode.workspace.createFileSystemWatcher("**/.comments/threads/*.jsonl");
  let reloadTimer: NodeJS.Timeout | undefined;
  const scheduleReload = () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined;
      void comments.reloadVisible();
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
      void comments.reloadVisible();
      tree.refresh();
    }),
    vscode.workspace.onDidSaveTextDocument((document) => void comments.load(document)),
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
      await comments.reloadVisible();
      tree.refresh();
    })
  );
}

export function deactivate(): void {}
