import * as vscode from "vscode";
import { captureAnchor, resolveAnchor, type ThreadState } from "@sideband-comments/core";
import { nonEmptyAnchorOffsets, singleLineDisplayOffsets } from "./comment-anchor.js";
import { KeyedSingleFlight, planVisibleDocumentSync } from "./comment-lifecycle.js";
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
  private readonly commentMetadata = new WeakMap<vscode.Comment, { threadId: string; commentId: string; uri: vscode.Uri }>();
  private readonly byDocument = new Map<string, vscode.CommentThread[]>();
  private readonly loads = new KeyedSingleFlight();
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

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
      vscode.window.onDidChangeActiveTextEditor((editor) => void this.syncActive(editor))
    );
    void this.syncActive(vscode.window.activeTextEditor);
  }

  dispose(): void {
    this.disposed = true;
    for (const key of [...this.byDocument.keys()]) this.clearKey(key);
    for (const disposable of this.disposables) disposable.dispose();
  }

  idFor(thread: vscode.CommentThread): string | undefined {
    return this.metadata.get(thread)?.id;
  }

  private clearKey(key: string): void {
    for (const thread of this.byDocument.get(key) ?? []) {
      this.metadata.delete(thread);
      thread.dispose();
    }
    this.byDocument.delete(key);
  }

  async syncActive(editor: vscode.TextEditor | undefined): Promise<void> {
    const documents = new Map<string, vscode.TextDocument>();
    if (editor && this.workspaceFor(editor.document.uri)) {
      documents.set(editor.document.uri.toString(), editor.document);
    }
    const plan = planVisibleDocumentSync(
      [...documents.keys()],
      [...this.byDocument.keys()],
      this.loads.keys()
    );
    for (const key of plan.unload) this.clearKey(key);
    await Promise.all(plan.load.map((key) => this.load(documents.get(key)!)));
    if (documents.size) void vscode.commands.executeCommand("comments.expand");
  }

  async reloadActive(): Promise<void> {
    await this.syncActive(vscode.window.activeTextEditor);
    const document = vscode.window.activeTextEditor?.document;
    if (document && this.workspaceFor(document.uri)) await this.load(document);
  }

  async load(document: vscode.TextDocument): Promise<void> {
    const key = document.uri.toString();
    return this.loads.run(key, () => this.loadNow(document));
  }

  private async loadNow(document: vscode.TextDocument): Promise<void> {
    const workspace = this.workspaceFor(document.uri);
    if (!workspace || this.disposed) return;
    const showResolved = vscode.workspace.getConfiguration("sidebandComments").get("showResolved", true);
    const states = await workspace.repository.listByDocument(workspace.relativePath(document.uri));
    if (this.disposed) return;
    this.clearKey(document.uri.toString());
    const threads: vscode.CommentThread[] = [];
    for (const state of states) {
      if (state.status === "resolved" && !showResolved) continue;
      const resolution = resolveAnchor(document.getText(), state.anchor);
      const display = resolution.kind === "resolved"
        ? singleLineDisplayOffsets(document.getText(), resolution.start, resolution.end)
        : undefined;
      const range = display
        ? new vscode.Range(document.positionAt(display.start), document.positionAt(display.end))
        : new vscode.Range(0, 0, 0, 0);
      const thread = this.controller.createCommentThread(document.uri, range, []);
      const comments = state.comments.map((comment) => new SidebandComment(comment.id, comment));
      for (const comment of comments) {
        this.commentMetadata.set(comment, { threadId: state.id, commentId: comment.id, uri: document.uri });
      }
      thread.comments = comments;
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

  async addOnSelection(editor: vscode.TextEditor): Promise<boolean> {
    const selection = editor.selection;
    if (selection.isEmpty) {
      void vscode.window.showWarningMessage("Select the text to anchor the Sideband comment first.");
      return false;
    }
    const workspace = this.workspaceFor(editor.document.uri);
    if (!workspace) {
      void vscode.window.showWarningMessage("Open the file inside a VS Code workspace before adding a comment.");
      return false;
    }
    const body = await vscode.window.showInputBox({
      title: "Add Sideband Comment",
      prompt: "Write a comment for the selected text",
      placeHolder: "Comment…",
      ignoreFocusOut: true,
      validateInput: (value) => value.trim() ? undefined : "Comment cannot be empty."
    });
    if (body === undefined) return false;

    await workspace.service.create({
      documentPath: workspace.relativePath(editor.document.uri),
      anchor: captureAnchor(
        editor.document.getText(),
        editor.document.offsetAt(selection.start),
        editor.document.offsetAt(selection.end)
      ),
      body
    });
    await this.load(editor.document);
    return true;
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
      const offsets = nonEmptyAnchorOffsets(
        document.getText(),
        document.offsetAt(range.start),
        document.offsetAt(range.end)
      );
      if (!offsets) throw new Error("Select non-empty text or comment on a non-blank line.");
      await workspace.service.create({
        documentPath: workspace.relativePath(document.uri),
        anchor: captureAnchor(document.getText(), offsets.start, offsets.end),
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

  async deleteComment(comment: vscode.Comment): Promise<boolean> {
    const metadata = this.commentMetadata.get(comment);
    if (!metadata) return false;
    const workspace = this.workspaceFor(metadata.uri);
    if (!workspace) return false;
    const confirmed = await vscode.window.showWarningMessage(
      "Delete this Sideband comment?",
      {
        modal: true,
        detail: "Only this comment will disappear from the thread. Its append-only JSONL history remains recoverable."
      },
      "Delete"
    );
    if (confirmed !== "Delete") return false;
    await workspace.service.deleteComment(metadata.threadId, metadata.commentId);
    const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === metadata.uri.toString());
    if (document) await this.load(document);
    return true;
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
