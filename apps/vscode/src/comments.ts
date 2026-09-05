import * as vscode from "vscode";
import { captureAnchor, resolveAnchor, type ThreadState } from "@sideband-comments/core";
import { nonEmptyAnchorOffsets, singleLineDisplayOffsets } from "./comment-anchor.js";
import { commentBodyWithOriginalText } from "./comment-display.js";
import { KeyedSingleFlight, planActiveDocumentSync } from "./comment-lifecycle.js";
import type { WorkspaceComments } from "./workspace.js";

class SidebandComment implements vscode.Comment {
  readonly mode = vscode.CommentMode.Preview;
  readonly contextValue = "sideband.comment";
  readonly body: vscode.MarkdownString;
  readonly author: vscode.CommentAuthorInformation;
  readonly timestamp: Date;

  constructor(readonly id: string, state: ThreadState["comments"][number], originalText?: string) {
    this.body = new vscode.MarkdownString(commentBodyWithOriginalText(originalText, state.body));
    this.author = { name: state.author.name };
    this.timestamp = new Date(state.createdAt);
  }
}

interface ThreadMetadata {
  id: string;
  status: ThreadState["status"];
  commentsSignature?: string;
}

export class SidebandCommentController implements vscode.Disposable {
  readonly controller = vscode.comments.createCommentController("sidebandComments", "Sideband Comments");
  private readonly metadata = new Map<vscode.CommentThread, ThreadMetadata>();
  private readonly commentMetadata = new WeakMap<vscode.Comment, { threadId: string; commentId: string; uri: vscode.Uri }>();
  private readonly byDocument = new Map<string, Map<string, vscode.CommentThread>>();
  private activeKey: string | null | undefined;
  private readonly submissions = new Map<vscode.CommentThread, Promise<void>>();
  private readonly loads = new KeyedSingleFlight();
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  constructor(private readonly workspaceFor: (uri: vscode.Uri) => WorkspaceComments | undefined,
    private readonly log: (message: string) => void = () => {}) {
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (document) => {
        if (!this.workspaceFor(document.uri)) return [];
        return [new vscode.Range(0, 0, Math.max(0, document.lineCount - 1), 0)];
      }
    };
    this.controller.options = { placeHolder: "Write a Sideband comment…", prompt: "Add Sideband Comment" };
    this.disposables.push(
      this.controller,
      vscode.window.onDidChangeActiveTextEditor((editor) => void this.syncActive(editor).catch(error => this.log(`active editor error=${error}`)))
    );
    this.log("reload reason=activation");
    void this.syncActive(vscode.window.activeTextEditor).catch(error => this.log(`activation error=${error}`));
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
    for (const thread of this.byDocument.get(key)?.values() ?? []) {
      this.metadata.delete(thread);
      thread.dispose();
    }
    this.log(`threads uri=${key} disposed=${this.byDocument.get(key)?.size ?? 0} reason=unload`);
    this.byDocument.delete(key);
  }

  async syncActive(editor: vscode.TextEditor | undefined): Promise<void> {
    // Native comment inputs are text editors too. Focusing one is not a file switch.
    if (editor?.document.uri.scheme === "comment") return;
    const documents = new Map<string, vscode.TextDocument>();
    const activeKey = editor
      ? (this.workspaceFor(editor.document.uri) ? editor.document.uri.toString() : null)
      : undefined;
    if (editor && activeKey) {
      documents.set(editor.document.uri.toString(), editor.document);
    }
    if (activeKey !== undefined) this.activeKey = activeKey;
    const plan = planActiveDocumentSync(
      activeKey,
      [...this.byDocument.keys()],
      this.loads.keys()
    );
    for (const key of plan.unload) this.clearKey(key);
    await Promise.all(plan.load.map((key) => this.load(documents.get(key)!)));
  }

  async reloadActive(reason = "explicit refresh"): Promise<void> {
    this.log(`reload reason=${reason}`);
    await this.syncActive(vscode.window.activeTextEditor);
    const active = vscode.window.activeTextEditor?.document;
    const document = active && this.workspaceFor(active.uri) ? active
      : vscode.workspace.textDocuments.find(document => document.uri.toString() === this.activeKey);
    if (document && this.workspaceFor(document.uri)) await this.load(document, reason);
  }

  async load(document: vscode.TextDocument, reason = "active editor change"): Promise<void> {
    const key = document.uri.toString();
    this.log(`load reason=${reason} uri=${key}`);
    return this.loads.run(key, () => this.loadNow(document));
  }

  private async loadNow(document: vscode.TextDocument): Promise<void> {
    const workspace = this.workspaceFor(document.uri);
    if (!workspace || this.disposed) return;
    const showResolved = vscode.workspace.getConfiguration("sidebandComments").get("showResolved", true);
    const states = await workspace.repository.listByDocument(workspace.relativePath(document.uri));
    const key = document.uri.toString();
    if (this.disposed || (this.activeKey !== undefined && this.activeKey !== key)) return;
    const threads = this.byDocument.get(key) ?? new Map<string, vscode.CommentThread>();
    const retained = new Set<string>();
    let created = 0, updated = 0, reused = 0, disposed = 0;
    for (const state of states) {
      if (state.status === "resolved" && !showResolved) continue;
      const resolution = resolveAnchor(document.getText(), state.anchor);
      const display = resolution.kind === "resolved"
        ? singleLineDisplayOffsets(document.getText(), resolution.start, resolution.end)
        : undefined;
      const range = display
        ? new vscode.Range(document.positionAt(display.start), document.positionAt(display.end))
        : new vscode.Range(0, 0, 0, 0);
      retained.add(state.id);
      let thread = threads.get(state.id);
      if (!thread) {
        thread = this.controller.createCommentThread(document.uri, range, []);
        thread.canReply = true;
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
        threads.set(state.id, thread);
        created++;
      } else {
        reused++;
      }
      const commentsSignature = JSON.stringify([state.originalAnchor.exact, state.comments]);
      let changed = false;
      if (this.metadata.get(thread)?.commentsSignature !== commentsSignature) {
        const comments = state.comments.map((comment, index) => new SidebandComment(
          comment.id, comment, index === 0 ? state.originalAnchor.exact : undefined
        ));
        for (const comment of comments) {
          this.commentMetadata.set(comment, { threadId: state.id, commentId: comment.id, uri: document.uri });
        }
        thread.comments = comments;
        changed = true;
      }
      if (!thread.range?.isEqual(range)) { thread.range = range; changed = true; }
      const contextValue = resolution.kind === "resolved" ? `sideband.${state.status}` : "sideband.orphaned";
      const label = resolution.kind !== "resolved" ? `⚠ ${resolution.kind}` : state.status === "resolved" ? "✓ resolved" : "";
      // The extension's resolved filter owns visibility, including in VS Code's Comments view.
      const nativeState = vscode.CommentThreadState.Unresolved;
      if (thread.contextValue !== contextValue) { thread.contextValue = contextValue; changed = true; }
      if (thread.label !== label) { thread.label = label; changed = true; }
      if (thread.state !== nativeState) { thread.state = nativeState; changed = true; }
      this.metadata.set(thread, { id: state.id, status: state.status, commentsSignature });
      if (changed) updated++;
    }
    for (const [id, thread] of threads) {
      if (retained.has(id)) continue;
      this.metadata.delete(thread);
      thread.dispose();
      threads.delete(id);
      disposed++;
    }
    this.byDocument.set(key, threads);
    this.log(`threads uri=${key} created=${created} reused=${reused} updated=${updated} disposed=${disposed}`);
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

  submit(reply: vscode.CommentReply): Promise<void> {
    if (!reply?.thread || typeof reply.text !== "string") return Promise.reject(new Error("A comment reply is required."));
    const pending = this.submissions.get(reply.thread);
    if (pending) return pending;
    const operation = this.submitNow(reply).finally(() => this.submissions.delete(reply.thread));
    this.submissions.set(reply.thread, operation);
    return operation;
  }

  private async submitNow(reply: vscode.CommentReply): Promise<void> {
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
      const state = await workspace.service.create({
        documentPath: workspace.relativePath(document.uri),
        anchor: captureAnchor(document.getText(), offsets.start, offsets.end),
        body: reply.text
      });
      // Adopt the native draft instead of replacing the widget after the first write.
      const key = document.uri.toString();
      if (this.disposed || (this.activeKey !== undefined && this.activeKey !== key)) {
        reply.thread.dispose();
      } else {
        this.metadata.set(reply.thread, { id: state.id, status: state.status });
        const threads = this.byDocument.get(key) ?? new Map<string, vscode.CommentThread>();
        const duplicate = threads.get(state.id);
        if (duplicate && duplicate !== reply.thread) {
          this.metadata.delete(duplicate);
          duplicate.dispose();
        }
        threads.set(state.id, reply.thread);
        this.byDocument.set(key, threads);
      }
    }
    this.log(`submit uri=${document.uri.toString()} saved=1`);
    await this.load(document, "native write");
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
