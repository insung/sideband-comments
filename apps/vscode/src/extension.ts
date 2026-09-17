import { readdir } from "node:fs/promises";
import { basename } from "node:path";
import * as vscode from "vscode";
import { SidebandCommentController } from "./comments.js";
import { SidebandCommentsDetailView } from "./detail.js";
import { mapRenamedDocument } from "./paths.js";
import { findProjectRoot } from "./project-root.js";
import { capturePreviewSelection, extendMarkdownIt } from "./preview.js";
import { SidebandCommentsView } from "./tree.js";
import { WorkspaceComments } from "./workspace.js";

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Sideband Comments", { log: true });
  context.subscriptions.push(output);
  const log = (message: string) => output.info(message);
  log(`activation version=${context.extension.packageJSON.version}`);
  const workspaces = new Map<string, WorkspaceComments>();
  const refreshWorkspaces = () => {
    log(`workspace folders=${JSON.stringify((vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.toString()))}`);
    const active = new Set((vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.toString()));
    for (const key of workspaces.keys()) if (!active.has(key)) workspaces.delete(key);
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (!workspaces.has(folder.uri.toString())) {
        const workspace = new WorkspaceComments(folder);
        log(`repository root=${folder.uri.toString()} comments=${workspace.repository.commentsDirectory}`);
        let foldSuccess = 0, foldFailure = 0;
        const list = workspace.repository.list.bind(workspace.repository);
        workspace.repository.list = async (includeHidden = false) => {
          const files = await readdir(workspace.repository.threadsDirectory).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return [];
            throw error;
          });
          log(`read repository=${folder.uri.toString()} threadFiles=${files.filter(file => file.endsWith(".jsonl")).length}`);
          return list(includeHidden);
        };
        const read = workspace.repository.read.bind(workspace.repository);
        workspace.repository.read = async (id) => {
          try {
            const state = await read(id);
            log(`fold repository=${folder.uri.toString()} thread=${id} success=${state ? ++foldSuccess : foldSuccess} failure=${foldFailure}`);
            return state;
          } catch (error) {
            log(`fold repository=${folder.uri.toString()} thread=${id} success=${foldSuccess} failure=${++foldFailure} error=${error}`);
            throw error;
          }
        };
        workspaces.set(folder.uri.toString(), workspace);
      }
    }
  };
  refreshWorkspaces();

  const watcher = vscode.workspace.createFileSystemWatcher("**/.comments/{threads,documents}/*.jsonl");
  let reloadTimer: NodeJS.Timeout | undefined;
  const scheduleReload = () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined;
      void comments.reloadActive("watcher").catch(error => log(`reload error=${error}`));
      tree.refresh();
      detail.refresh();
    }, 100);
  };
  watcher.onDidCreate(scheduleReload);
  watcher.onDidChange(scheduleReload);
  watcher.onDidDelete(scheduleReload);

  // Files opened outside every workspace folder still belong to a project on disk, so they
  // keep their comments beside the document instead of losing the feature entirely.
  const detached = new Map<string, WorkspaceComments>();
  const workspaceFor = (uri: vscode.Uri): WorkspaceComments | undefined => {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) return workspaces.get(folder.uri.toString());
    if (uri.scheme !== "file") return undefined;
    const root = findProjectRoot(uri.fsPath);
    if (!root) return undefined;
    const rootUri = vscode.Uri.file(root);
    const key = rootUri.toString();
    const existing = detached.get(key);
    if (existing) return existing;
    const workspace = new WorkspaceComments({ uri: rootUri, name: basename(root), index: -1 });
    log(`detached repository root=${key} comments=${workspace.repository.commentsDirectory}`);
    const storeWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(rootUri, ".comments/{threads,documents}/*.jsonl")
    );
    storeWatcher.onDidCreate(scheduleReload);
    storeWatcher.onDidChange(scheduleReload);
    storeWatcher.onDidDelete(scheduleReload);
    context.subscriptions.push(storeWatcher);
    detached.set(key, workspace);
    return workspace;
  };
  const allWorkspaces = () => [...workspaces.values(), ...detached.values()];
  const comments = new SidebandCommentController(workspaceFor, log);
  let tree!: SidebandCommentsView;
  const detail = new SidebandCommentsDetailView(context, workspaceFor, async () => {
    await comments.reloadActive("detail write");
    tree.refresh();
  }, log);
  tree = new SidebandCommentsView(context, allWorkspaces, async (group) => {
    const workspace = workspaces.get(group.workspaceKey) ?? detached.get(group.workspaceKey);
    if (!workspace) return;
    const uri = vscode.Uri.joinPath(workspace.folder.uri, ...group.documentPath.split("/"));
    log(`Explorer selected uri=${uri.toString()}`);
    detail.selectUri(uri);
    await vscode.commands.executeCommand("vscode.open", uri);
  }, log);
  detail.selectUri(vscode.window.activeTextEditor?.document.uri);
  const showResolved = () => vscode.workspace.getConfiguration("sidebandComments").get("showResolved", true);
  void vscode.commands.executeCommand("setContext", "sidebandComments.showResolved", showResolved());
  const register = (command: string, handler: (...args: any[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, async (...args: any[]) => {
      try {
        return await handler(...args);
      } catch (error) {
        log(`command=${command} error=${error}`);
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
      detail.selectUri(editor.document.uri);
      detail.refresh();
      await vscode.commands.executeCommand("sidebandComments.detailView.focus");
    }
  });
  register("sidebandComments.addFromPreview", async (previewContext: unknown) => {
    const { uri, version, anchor, text } = await capturePreviewSelection(previewContext, workspaceFor);
    detail.selectUri(uri);
    await vscode.commands.executeCommand("sidebandComments.detailView.focus");
    detail.pinPreviewAnchor({ uri: uri.toString(), version, anchor, text });
  });
  register("sidebandComments.consolidateStorage", async () => {
    for (const workspace of allWorkspaces()) {
      const result = await workspace.repository.migrateLegacy();
      log(`storage consolidated ${JSON.stringify(result)}`);
    }
    await comments.reloadActive("storage consolidation");
    tree.refresh();
    detail.refresh();
    void vscode.window.showInformationMessage("Sideband Comments: Comment history is grouped by document.");
  });
  register("sidebandComments.create", async (reply: vscode.CommentReply) => {
    await comments.submit(reply);
    tree.refresh();
    detail.refresh();
  });
  register("sidebandComments.reply", async (reply: vscode.CommentReply) => {
    await comments.submit(reply);
    tree.refresh();
    detail.refresh();
  });
  register("sidebandComments.resolve", async (thread: vscode.CommentThread) => {
    await comments.setStatus(thread, "resolved");
    tree.refresh();
    detail.refresh();
  });
  register("sidebandComments.reopen", async (thread: vscode.CommentThread) => {
    await comments.setStatus(thread, "open");
    tree.refresh();
    detail.refresh();
  });
  register("sidebandComments.reanchor", async (thread: vscode.CommentThread) => {
    await comments.reanchor(thread);
    tree.refresh();
    detail.refresh();
  });
  register("sidebandComments.deleteComment", async (comment: vscode.Comment) => {
    if (await comments.deleteComment(comment)) {
      tree.refresh();
      detail.refresh();
    }
  });
  const setShowResolved = async (value: boolean) => {
    await vscode.workspace.getConfiguration("sidebandComments").update(
      "showResolved",
      value,
      vscode.ConfigurationTarget.Workspace
    );
    await vscode.commands.executeCommand("setContext", "sidebandComments.showResolved", value);
    await comments.reloadActive("explicit refresh");
    tree.refresh();
    detail.refresh();
  };
  register("sidebandComments.showResolved", () => setShowResolved(true));
  register("sidebandComments.hideResolved", () => setShowResolved(false));
  register("sidebandComments.reload", async () => {
    await comments.reloadActive("explicit refresh");
    tree.refresh();
    detail.refresh();
  });


  context.subscriptions.push(
    comments,
    detail,
    tree,
    watcher,
    { dispose: () => { if (reloadTimer) clearTimeout(reloadTimer); } },
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      detached.clear();
      refreshWorkspaces();
      void comments.reloadActive("workspace folders").catch(error => log(`reload error=${error}`));
      tree.refresh();
      detail.refresh();
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      detail.selectUri(editor?.document.uri);
      if (editor) detail.noteSelection(editor);
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => detail.noteSelection(event.textEditor)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
        void comments.load(document, "save").catch(error => log(`reload error=${error}`));
        detail.refresh();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("sidebandComments.showResolved")) return;
      void vscode.commands.executeCommand("setContext", "sidebandComments.showResolved", showResolved());
      void comments.reloadActive("configuration change").catch(error => log(`reload error=${error}`));
      tree.refresh();
      detail.refresh();
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
        const threads = await workspace.repository.list(true);
        for (const thread of threads) {
          const destination = mapRenamedDocument(thread.documentPath, oldPath, newPath);
          if (destination) await workspace.service.relocate(thread.id, destination);
        }
      }
      await comments.reloadActive("explicit refresh");
      tree.refresh();
      detail.refresh();
    })
  );
  return { comments, tree, detail, extendMarkdownIt };
}

export function deactivate(): void {}
