import { ItemView, MarkdownRenderer, WorkspaceLeaf } from "obsidian";
import type { DocumentTreeNode, ThreadViewModel } from "./view-model.js";
import {
  buildDocumentTree,
  groupThreadViewModels,
  resolvedToggleLabel,
  selectionPreviewText,
  selectDocumentPath
} from "./view-model.js";
import type SidebandCommentsPlugin from "./main.js";

export const SIDEBAND_VIEW_TYPE = "sideband-comments-sidebar";

export class SidebandSidebarView extends ItemView {
  private selectedDocumentPath: string | undefined;
  private selectionPreview: HTMLElement | undefined;
  private selectionPreviewPath: string | undefined;
  private readonly collapsedDirectories = new Set<string>();
  private renderRevision = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SidebandCommentsPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return SIDEBAND_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Sideband Comments";
  }

  getIcon(): string {
    return "messages-square";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    const revision = ++this.renderRevision;
    const models = await this.plugin.allModels();
    if (revision !== this.renderRevision) return;
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("sideband-sidebar");
    this.selectionPreview = undefined;
    this.selectionPreviewPath = undefined;
    const groups = groupThreadViewModels(models);
    const activePath = this.plugin.activeDocumentPath();
    this.selectedDocumentPath = selectDocumentPath(groups, this.selectedDocumentPath, activePath) ?? activePath;

    const explorer = container.createDiv({ cls: "sideband-explorer" });
    const explorerHeading = explorer.createDiv({ cls: "sideband-pane-header" });
    explorerHeading.createEl("h3", { text: `Comments Explorer (${models.length})` });
    const explorerActions = explorerHeading.createDiv({ cls: "sideband-pane-actions" });
    const resolvedToggle = explorerActions.createEl("button", {
      text: resolvedToggleLabel(this.plugin.settings.showResolved),
      attr: { "aria-pressed": String(this.plugin.settings.showResolved) }
    });
    resolvedToggle.addEventListener("click", () =>
      void this.plugin.setShowResolved(!this.plugin.settings.showResolved)
    );
    const files = explorer.createDiv({ cls: "sideband-file-list" });
    if (groups.length === 0) files.createEl("p", { cls: "sideband-empty", text: "No comments in this vault." });
    this.renderDocumentTree(files, buildDocumentTree(groups));

    const detail = container.createDiv({ cls: "sideband-detail" });
    const selectedPath = this.selectedDocumentPath;
    const selected = groups.find((group) => group.documentPath === selectedPath);
    const detailHeading = detail.createDiv({ cls: "sideband-pane-header" });
    detailHeading.createEl("h3", { text: "Comment Details" });
    if (selectedPath) detailHeading.createEl("small", { text: selectedPath });
    if (!selectedPath) {
      detail.createEl("p", { cls: "sideband-empty", text: "Open a Markdown note to add or view comments." });
      return;
    }
    this.renderNewComment(detail, selectedPath);
    if (!selected) {
      detail.createEl("p", { cls: "sideband-empty", text: "No comments for this note." });
      return;
    }
    const threads = detail.createDiv({ cls: "sideband-document-threads" });
    for (const model of selected.threads) await this.renderThread(threads, model);
  }

  updateSelectionPreview(documentPath: string, selection: string): void {
    if (this.selectionPreviewPath !== documentPath || !this.selectionPreview) return;
    this.selectionPreview.setText(selectionPreviewText(selection));
    this.selectionPreview.toggleClass("has-selection", Boolean(selection.trim()));
  }

  private renderDocumentTree(container: HTMLElement, nodes: readonly DocumentTreeNode[]): void {
    for (const node of nodes) {
      if (node.kind === "directory") {
        const directory = container.createEl("details", { cls: "sideband-directory" });
        directory.open = !this.collapsedDirectories.has(node.path);
        directory.createEl("summary", { text: node.name });
        const children = directory.createDiv({ cls: "sideband-directory-children" });
        this.renderDocumentTree(children, node.children);
        directory.addEventListener("toggle", () => {
          if (directory.open) this.collapsedDirectories.delete(node.path);
          else this.collapsedDirectories.add(node.path);
        });
        continue;
      }
      const group = node.group;
      const row = container.createEl("button", {
        cls: `sideband-file${group.documentPath === this.selectedDocumentPath ? " is-selected" : ""}`
      });
      row.createSpan({ text: node.name, attr: { title: group.documentPath } });
      row.createSpan({
        cls: "sideband-document-count",
        text: `${group.threads.length} comment${group.threads.length === 1 ? "" : "s"}`
      });
      row.addEventListener("click", async () => {
        this.selectedDocumentPath = group.documentPath;
        await this.plugin.openDocument(group.documentPath);
        await this.render();
      });
    }
  }

  private renderNewComment(container: HTMLElement, documentPath: string): void {
    const composer = container.createDiv({ cls: "sideband-composer sideband-new-comment" });
    const selection = this.plugin.selectionFor(documentPath);
    this.selectionPreviewPath = documentPath;
    this.selectionPreview = composer.createEl("label", {
      cls: `sideband-selection-preview${selection.trim() ? " has-selection" : ""}`,
      text: selectionPreviewText(selection)
    });
    const input = composer.createEl("textarea");
    input.rows = 3;
    input.placeholder = "Select text in the editor, then write a comment…";
    const actions = composer.createDiv({ cls: "sideband-form-actions" });
    const submit = actions.createEl("button", { text: "Comment" });
    submit.addEventListener("click", async () => {
      const body = input.value.trim();
      if (!body) return;
      if (await this.plugin.createCommentFromSelection(documentPath, body)) input.value = "";
    });
  }

  private async renderThread(container: HTMLElement, model: ThreadViewModel): Promise<void> {
    const card = container.createDiv({ cls: `sideband-thread${model.status === "resolved" ? " is-resolved" : ""}` });
    const heading = card.createDiv({ cls: "sideband-thread-heading" });
    const title = heading.createDiv();
    title.createEl("strong", { text: model.status === "resolved" ? "✓ Resolved" : "Open" });
    if (model.anchorState !== "resolved") title.createSpan({ text: ` · ⚠ ${model.anchorState}` });
    const reanchor = heading.createEl("button", {
      text: "Re-anchor",
      attr: { title: "Move this thread to the current editor selection" }
    });
    reanchor.addEventListener("click", () =>
      void this.plugin.reanchorFromSelection(model.documentPath, model.id)
    );
    const original = card.createDiv({ cls: "sideband-original-label", text: "Original text" });
    const quote = card.createEl("blockquote", { text: model.originalAnchor.exact });
    if (model.range) {
      quote.addEventListener("click", () => void this.plugin.openThread(model.documentPath, model.id));
    }
    for (const comment of model.comments) {
      const item = card.createDiv({ cls: "sideband-comment" });
      const header = item.createDiv({ cls: "sideband-comment-header" });
      header.createEl("strong", { text: comment.author.name });
      header.createSpan({ text: new Date(comment.createdAt).toLocaleString() });
      const body = item.createDiv({ cls: "sideband-comment-body", attr: { title: "Double-click to edit" } });
      await MarkdownRenderer.render(this.app, comment.body, body, model.documentPath, this);
      const commentActions = item.createDiv({ cls: "sideband-comment-actions" });
      body.addEventListener("dblclick", () => {
        const existing = item.querySelector(".sideband-edit-form");
        if (existing) return;
        const form = item.createDiv({ cls: "sideband-edit-form" });
        const input = form.createEl("textarea");
        input.rows = 3;
        input.value = comment.body;
        const formActions = form.createDiv({ cls: "sideband-form-actions" });
        const cancel = formActions.createEl("button", { text: "Cancel" });
        cancel.addEventListener("click", () => form.remove());
        const save = formActions.createEl("button", { text: "Save" });
        save.addEventListener("click", async () => {
          const value = input.value.trim();
          if (!value) return;
          await this.plugin.service.editComment(model.id, comment.id, value);
          await this.plugin.refresh();
        });
        input.focus();
      });
      const remove = commentActions.createEl("button", { text: "Delete", cls: "mod-warning" });
      remove.addEventListener("click", async () => {
        if (!window.confirm("Delete this comment?")) return;
        await this.plugin.service.deleteComment(model.id, comment.id);
        await this.plugin.refresh();
      });
    }
    const composer = card.createDiv({ cls: "sideband-composer" });
    composer.createEl("label", { text: "Reply" });
    const replyInput = composer.createEl("textarea");
    replyInput.rows = 3;
    replyInput.placeholder = "Write a reply…";
    const actions = composer.createDiv({ cls: "sideband-form-actions sideband-actions" });
    const status = actions.createEl("button", { text: model.status === "resolved" ? "Reopen" : "Resolve" });
    status.addEventListener("click", async () => {
      if (model.status === "resolved") await this.plugin.service.reopen(model.id);
      else await this.plugin.service.resolve(model.id);
      await this.plugin.refresh();
    });
    const reply = actions.createEl("button", { text: "Reply", cls: "mod-cta" });
    reply.addEventListener("click", async () => {
      const value = replyInput.value.trim();
      if (!value) return;
      await this.plugin.service.reply(model.id, value);
      await this.plugin.refresh();
    });
  }
}
