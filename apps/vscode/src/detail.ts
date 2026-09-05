import * as vscode from "vscode";
import { captureAnchor, resolveAnchor, type ThreadState } from "@sideband-comments/core";
import type { WorkspaceComments } from "./workspace.js";

interface SelectedDocument {
  uri: vscode.Uri;
  workspace: WorkspaceComments;
  documentPath: string;
}

interface DetailMessage {
  action?: string;
  threadId?: string;
  commentId?: string;
  body?: string;
}

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const nonce = (): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
};

export class SidebandCommentsDetailView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private selected?: SelectedDocument;
  private renderRevision = 0;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    context: vscode.ExtensionContext,
    private readonly workspaceFor: (uri: vscode.Uri) => WorkspaceComments | undefined,
    private readonly onChanged: () => Promise<void>
  ) {
    this.disposables.push(vscode.window.registerWebviewViewProvider(
      "sidebandComments.detailView",
      this,
      { webviewOptions: { retainContextWhenHidden: true } }
    ));
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((message: DetailMessage) => void this.handleMessage(message));
    await this.render();
  }

  selectUri(uri: vscode.Uri | undefined): void {
    if (!uri) return;
    const workspace = this.workspaceFor(uri);
    if (!workspace) return;
    this.selected = { uri, workspace, documentPath: workspace.relativePath(uri) };
    void this.render();
  }

  refresh(): void {
    void this.render();
  }

  private async handleMessage(message: DetailMessage): Promise<void> {
    try {
      const selected = this.selected;
      if (!selected || !message.action) return;
      const body = message.body?.trim();
      switch (message.action) {
        case "newComment":
          if (!body) return;
          await this.createFromSelection(selected, body);
          break;
        case "reply":
          if (!message.threadId || !body) return;
          await selected.workspace.service.reply(message.threadId, body);
          break;
        case "edit":
          if (!message.threadId || !message.commentId || !body) return;
          await selected.workspace.service.editComment(message.threadId, message.commentId, body);
          break;
        case "delete":
          if (!message.threadId || !message.commentId) return;
          await selected.workspace.service.deleteComment(message.threadId, message.commentId);
          break;
        case "toggleStatus":
          if (!message.threadId) return;
          if ((await selected.workspace.service.get(message.threadId)).status === "resolved") {
            await selected.workspace.service.reopen(message.threadId);
          } else {
            await selected.workspace.service.resolve(message.threadId);
          }
          break;
        case "openAnchor":
          if (!message.threadId) return;
          await this.openAnchor(selected, message.threadId);
          return;
        default:
          return;
      }
      await this.onChanged();
      await this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Sideband Comments: ${message}`);
    }
  }

  private async createFromSelection(selected: SelectedDocument, body: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== selected.uri.toString() || editor.selection.isEmpty) {
      throw new Error("Select text in the active file before adding a comment.");
    }
    await selected.workspace.service.create({
      documentPath: selected.documentPath,
      anchor: captureAnchor(
        editor.document.getText(),
        editor.document.offsetAt(editor.selection.start),
        editor.document.offsetAt(editor.selection.end)
      ),
      body
    });
  }

  private async openAnchor(selected: SelectedDocument, threadId: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(selected.uri);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const thread = await selected.workspace.service.get(threadId);
    const resolution = resolveAnchor(document.getText(), thread.anchor);
    if (resolution.kind !== "resolved") {
      void vscode.window.showWarningMessage(`Sideband Comments: anchor is ${resolution.kind}.`);
      return;
    }
    const range = new vscode.Range(document.positionAt(resolution.start), document.positionAt(resolution.end));
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private async render(): Promise<void> {
    const view = this.view;
    if (!view) return;
    const revision = ++this.renderRevision;
    const selected = this.selected;
    if (!selected) {
      view.webview.html = this.page("", `<p class="empty">Open a file with comments to begin.</p>`);
      return;
    }
    const showResolved = vscode.workspace.getConfiguration("sidebandComments").get("showResolved", true);
    const threads = (await selected.workspace.repository.listByDocument(selected.documentPath))
      .filter((thread) => showResolved || thread.status !== "resolved");
    if (revision !== this.renderRevision) return;
    view.title = "Comment Details";
    view.description = selected.documentPath;
    view.webview.html = this.page(selected.documentPath, this.content(threads));
  }

  private content(threads: readonly ThreadState[]): string {
    const cards = threads.length
      ? threads.map((thread) => this.threadCard(thread)).join("")
      : `<p class="empty">No comments for this file.</p>`;
    return `
      <form class="composer new-comment" data-action="newComment">
        <label for="new-comment">New comment on editor selection</label>
        <textarea id="new-comment" name="body" rows="3" placeholder="Select text in the editor, then write a comment…" required></textarea>
        <div class="form-actions"><button type="submit">Comment</button></div>
      </form>
      <div class="threads">${cards}</div>`;
  }

  private threadCard(thread: ThreadState): string {
    const comments = thread.comments.map((comment) => `
      <article class="comment">
        <header><strong>${escapeHtml(comment.author.name)}</strong><time>${escapeHtml(new Date(comment.createdAt).toLocaleString())}</time></header>
        <div class="body">${escapeHtml(comment.body)}</div>
        <div class="comment-actions">
          <details>
            <summary>Edit</summary>
            <form data-action="edit" data-thread="${escapeHtml(thread.id)}" data-comment="${escapeHtml(comment.id)}">
              <textarea name="body" rows="3" required>${escapeHtml(comment.body)}</textarea>
              <div class="form-actions"><button type="submit">Save</button></div>
            </form>
          </details>
          <button class="secondary danger" data-action="delete" data-thread="${escapeHtml(thread.id)}" data-comment="${escapeHtml(comment.id)}">Delete</button>
        </div>
      </article>`).join("");
    const status = thread.status === "resolved" ? "Reopen" : "Resolve";
    return `
      <section class="thread ${thread.status === "resolved" ? "resolved" : ""}">
        <div class="thread-heading">
          <button class="anchor" data-action="openAnchor" data-thread="${escapeHtml(thread.id)}" title="Open anchor in editor">${escapeHtml(thread.originalAnchor.exact)}</button>
          <button class="secondary" data-action="toggleStatus" data-thread="${escapeHtml(thread.id)}">${status}</button>
        </div>
        ${comments}
        <form class="composer" data-action="reply" data-thread="${escapeHtml(thread.id)}">
          <label>Reply</label>
          <textarea name="body" rows="3" placeholder="Write a reply…" required></textarea>
          <div class="form-actions"><button type="submit">Reply</button></div>
        </form>
      </section>`;
  }

  private page(documentPath: string, content: string): string {
    const scriptNonce = nonce();
    const title = documentPath ? `<h2>${escapeHtml(documentPath)}</h2>` : `<h2>Comment Details</h2>`;
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          :root { color-scheme: light dark; }
          body { padding: 0 12px 18px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
          h2 { position: sticky; top: 0; z-index: 2; margin: 0 -12px 12px; padding: 10px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--vscode-sideBar-background); font-size: 13px; }
          .empty { color: var(--vscode-descriptionForeground); }
          .thread { margin: 12px 0; padding: 10px; border-left: 3px solid var(--vscode-focusBorder); background: var(--vscode-sideBarSectionHeader-background); }
          .thread.resolved { opacity: .72; }
          .thread-heading, .comment header, .comment-actions, .form-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
          .anchor { padding: 0; overflow: hidden; color: var(--vscode-textLink-foreground); border: 0; background: transparent; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
          .comment { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--vscode-widget-border); }
          .comment header { justify-content: flex-start; color: var(--vscode-descriptionForeground); font-size: 11px; }
          .body { margin: 7px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
          label { display: block; margin-bottom: 5px; font-weight: 600; }
          textarea { box-sizing: border-box; width: 100%; padding: 7px; resize: vertical; color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); outline: none; background: var(--vscode-input-background); font: inherit; }
          textarea:focus { border-color: var(--vscode-focusBorder); }
          button { padding: 4px 10px; color: var(--vscode-button-foreground); border: 0; background: var(--vscode-button-background); cursor: pointer; }
          button:hover { background: var(--vscode-button-hoverBackground); }
          button.secondary, summary { color: var(--vscode-descriptionForeground); background: transparent; }
          button.danger { color: var(--vscode-errorForeground); }
          summary { cursor: pointer; }
          details { flex: 1; }
          details form, .composer { margin-top: 8px; }
          .new-comment { margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--vscode-widget-border); }
          .form-actions { justify-content: flex-end; margin-top: 6px; }
        </style>
      </head>
      <body>${title}${content}
        <script nonce="${scriptNonce}">
          const vscode = acquireVsCodeApi();
          document.addEventListener('submit', (event) => {
            event.preventDefault();
            const form = event.target;
            if (!(form instanceof HTMLFormElement)) return;
            const body = new FormData(form).get('body');
            if (typeof body !== 'string' || !body.trim()) return;
            vscode.postMessage({
              action: form.dataset.action,
              threadId: form.dataset.thread,
              commentId: form.dataset.comment,
              body
            });
          });
          document.addEventListener('click', (event) => {
            const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
            if (!(button instanceof HTMLButtonElement) || button.type === 'submit') return;
            if (button.dataset.action === 'delete' && !confirm('Delete this comment?')) return;
            vscode.postMessage({
              action: button.dataset.action,
              threadId: button.dataset.thread,
              commentId: button.dataset.comment
            });
          });
        </script>
      </body>
      </html>`;
  }
}
