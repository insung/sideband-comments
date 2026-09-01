import * as vscode from "vscode";
import { SidebandCommentController } from "./comments.js";
import { mapRenamedDocument } from "./paths.js";
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

  const workspaceFor = (uri: vscode.Uri) => {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return folder ? workspaces.get(folder.uri.toString()) : undefined;
  };
  const comments = new SidebandCommentController(workspaceFor);
  const register = (command: string, handler: (...args: never[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));

  register("sidebandComments.add", () => {
    if (vscode.window.activeTextEditor) comments.addOnSelection(vscode.window.activeTextEditor);
  });
  register("sidebandComments.create", (reply: vscode.CommentReply) => comments.submit(reply));
  register("sidebandComments.resolve", (thread: vscode.CommentThread) => comments.setStatus(thread, "resolved"));
  register("sidebandComments.reopen", (thread: vscode.CommentThread) => comments.setStatus(thread, "open"));
  register("sidebandComments.reanchor", (thread: vscode.CommentThread) => comments.reanchor(thread));
  register("sidebandComments.reload", () => comments.reloadVisible());

  const watcher = vscode.workspace.createFileSystemWatcher("**/.comments/threads/*.jsonl");
  let reloadTimer: NodeJS.Timeout | undefined;
  const scheduleReload = () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined;
      void comments.reloadVisible();
    }, 100);
  };
  watcher.onDidCreate(scheduleReload);
  watcher.onDidChange(scheduleReload);
  watcher.onDidDelete(scheduleReload);

  context.subscriptions.push(
    comments,
    watcher,
    { dispose: () => { if (reloadTimer) clearTimeout(reloadTimer); } },
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshWorkspaces();
      void comments.reloadVisible();
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
    })
  );
}

export function deactivate(): void {}
