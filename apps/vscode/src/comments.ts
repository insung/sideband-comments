import * as vscode from "vscode";
import { captureAnchor, resolveAnchor, type ThreadState } from "@sideband-comments/core";
import type { WorkspaceComments } from "./workspace.js";

class SidebandComment implements vscode.Comment {
  readonly mode = vscode.CommentMode.Preview;
  readonly contextValue = "sideband.comment";
  readonly body: vscode.MarkdownString;
  readonly author: vscode.CommentAuthorInformation;
  readonly timestamp: Date;

  constructor(readonly id: string, state: ThreadState["comments"][number]) {
    this.body = new vscode.MarkdownString(state.body);
    this.author = { name: state.author.name };
    this.timestamp = new Date(state.createdAt);
  }
}

interface ThreadMetadata {
  id: string;
  status: ThreadState["status"];
}

export class SidebandCommentController implements vscode.Disposable {
  readonly controller = vscode.comments.createCommentController("sidebandComments", "Sideband Comments");
  private readonly metadata = new Map<vscode.CommentThread, ThreadMetadata>();
  private readonly byDocument = new Map<string, vscode.CommentThread[]>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly workspaceFor: (uri: vscode.Uri) => WorkspaceComments | undefined) {
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (document) => {
        if (!this.workspaceFor(document.uri)) return [];
        return [new vscode.Range(0, 0, Math.max(0, document.lineCount - 1), 0)];
      }
    };
    this.controller.options = { placeHolder: "Comment…", prompt: "Comment" };
    this.disposables.push(
      this.controller,
      vscode.window.onDidChangeVisibleTextEditors((editors) => void this.syncVisible(editors)),
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (vscode.window.visibleTextEditors.some((editor) => editor.document.uri.toString() === document.uri.toString())) {
          void this.load(document);
        }
      })
    );
    void this.syncVisible(vscode.window.visibleTextEditors);
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    for (const threads of this.byDocument.values()) for (const thread of threads) thread.dispose();
  }

  idFor(thread: vscode.CommentThread): string | undefined {
    return this.metadata.get(thread)?.id;
  }

  private clear(uri: vscode.Uri): void {
    const key = uri.toString();
    for (const thread of this.byDocument.get(key) ?? []) {
      this.metadata.delete(thread);
      thread.dispose();
    }
    this.byDocument.delete(key);
  }

  async syncVisible(editors: readonly vscode.TextEditor[]): Promise<void> {
    const visible = new Set(editors.map((editor) => editor.document.uri.toString()));
    for (const [key, threads] of this.byDocument) {
      if (visible.has(key)) continue;
      for (const thread of threads) {
        this.metadata.delete(thread);
        thread.dispose();
      }
      this.byDocument.delete(key);
    }
    await Promise.all(editors.map((editor) => this.load(editor.document)));
  }

  async reloadVisible(): Promise<void> {
    await this.syncVisible(vscode.window.visibleTextEditors);
  }

  async load(document: vscode.TextDocument): Promise<void> {
    const workspace = this.workspaceFor(document.uri);
    if (!workspace) return;
    this.clear(document.uri);
    const showResolved = vscode.workspace.getConfiguration("sidebandComments").get("showResolved", true);
    const states = await workspace.repository.listByDocument(workspace.relativePath(document.uri));
    const threads: vscode.CommentThread[] = [];
    for (const state of states) {
      if (state.status === "resolved" && !showResolved) continue;
      const resolution = resolveAnchor(document.getText(), state.anchor);
      const range = resolution.kind === "resolved"
        ? new vscode.Range(document.positionAt(resolution.start), document.positionAt(resolution.end))
        : new vscode.Range(0, 0, 0, 0);
      const thread = this.controller.createCommentThread(document.uri, range, []);
      thread.comments = state.comments.map((comment) => new SidebandComment(comment.id, comment));
      thread.canReply = true;
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
      thread.contextValue = resolution.kind === "resolved" ? `sideband.${state.status}` : "sideband.orphaned";
      if (resolution.kind !== "resolved") thread.label = `⚠ ${resolution.kind}`;
      else if (state.status === "resolved") thread.label = "✓ resolved";
      thread.state = state.status === "resolved" && !showResolved
        ? vscode.CommentThreadState.Resolved
        : vscode.CommentThreadState.Unresolved;
      this.metadata.set(thread, { id: state.id, status: state.status });
      threads.push(thread);
    }
    this.byDocument.set(document.uri.toString(), threads);
  }

  addOnSelection(editor: vscode.TextEditor): void {
    const selection = editor.selection;
    const range = selection.isEmpty ? editor.document.lineAt(selection.active.line).range : selection;
    const thread = this.controller.createCommentThread(editor.document.uri, range, []);
    thread.canReply = true;
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    const key = editor.document.uri.toString();
    this.byDocument.set(key, [...(this.byDocument.get(key) ?? []), thread]);
  }

  async submit(reply: vscode.CommentReply): Promise<void> {
    const workspace = this.workspaceFor(reply.thread.uri);
    const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === reply.thread.uri.toString());
    if (!workspace || !document) return;
    const metadata = this.metadata.get(reply.thread);
    if (metadata) {
      await workspace.service.reply(metadata.id, reply.text);
    } else {
      const range = reply.thread.range;
      if (!range) throw new Error("a new comment requires an editor range");
      const start = document.offsetAt(range.start);
      const end = document.offsetAt(range.end);
      await workspace.service.create({
        documentPath: workspace.relativePath(document.uri),
        anchor: captureAnchor(document.getText(), start, end),
        body: reply.text
      });
    }
    await this.load(document);
  }

  async setStatus(thread: vscode.CommentThread, status: "open" | "resolved"): Promise<void> {
    const workspace = this.workspaceFor(thread.uri);
    const metadata = this.metadata.get(thread);
    if (!workspace || !metadata || metadata.status === status) return;
    if (status === "resolved") await workspace.service.resolve(metadata.id);
    else await workspace.service.reopen(metadata.id);
    const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === thread.uri.toString());
    if (document) await this.load(document);
  }

  async reanchor(thread: vscode.CommentThread): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const workspace = this.workspaceFor(thread.uri);
    const metadata = this.metadata.get(thread);
    if (!editor || editor.document.uri.toString() !== thread.uri.toString() || editor.selection.isEmpty || !workspace || !metadata) {
      void vscode.window.showWarningMessage("Select the new anchor text in the same editor first.");
      return;
    }
    await workspace.service.reanchor(metadata.id, captureAnchor(
      editor.document.getText(),
      editor.document.offsetAt(editor.selection.start),
      editor.document.offsetAt(editor.selection.end)
    ));
    await this.load(editor.document);
  }
}
