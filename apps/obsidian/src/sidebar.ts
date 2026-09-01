import { ItemView, MarkdownRenderer, MarkdownView, Notice, WorkspaceLeaf } from "obsidian";
import type { ThreadViewModel } from "./view-model.js";
import type SidebandCommentsPlugin from "./main.js";

export const SIDEBAND_VIEW_TYPE = "sideband-comments-sidebar";

export class SidebandSidebarView extends ItemView {
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
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("sideband-sidebar");
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      container.createEl("p", { text: "Open a Markdown note to view its comments." });
      return;
    }
    const models = await this.plugin.modelsFor(view.file.path, view.editor.getValue());
    const heading = container.createDiv({ cls: "sideband-sidebar-header" });
    heading.createEl("h3", { text: `Comments (${models.length})` });
    const add = heading.createEl("button", { text: "Add from selection" });
    add.addEventListener("click", () => void this.plugin.addCommentFromSelection());
    if (models.length === 0) {
      container.createEl("p", { text: "No comments for this note." });
      return;
    }
    for (const model of models) await this.renderThread(container, model, view);
  }

  private async renderThread(container: HTMLElement, model: ThreadViewModel, view: MarkdownView): Promise<void> {
    const card = container.createDiv({ cls: `sideband-thread${model.status === "resolved" ? " is-resolved" : ""}` });
    const title = card.createDiv();
    title.createEl("strong", { text: model.status === "resolved" ? "✓ Resolved" : "Open" });
    if (model.anchorState !== "resolved") title.createSpan({ text: ` · ⚠ ${model.anchorState}` });
    const quote = card.createEl("blockquote", { text: model.anchor.exact });
    if (model.range) {
      quote.addEventListener("click", () => {
        const from = view.editor.offsetToPos(model.range!.start);
        const to = view.editor.offsetToPos(model.range!.end);
        view.editor.setSelection(from, to);
        view.editor.focus();
      });
    }
    for (const comment of model.comments) {
      const item = card.createDiv({ cls: "sideband-comment" });
      item.createEl("strong", { text: comment.author.name });
      item.createSpan({ text: ` · ${new Date(comment.createdAt).toLocaleString()}` });
      const body = item.createDiv();
      await MarkdownRenderer.render(this.app, comment.body, body, model.documentPath, this);
    }
    const actions = card.createDiv({ cls: "sideband-actions" });
    const reply = actions.createEl("button", { text: "Reply" });
    reply.addEventListener("click", async () => {
      const body = await this.plugin.prompt("Reply");
      if (!body) return;
      await this.plugin.service.reply(model.id, body);
      await this.plugin.refresh();
    });
    const status = actions.createEl("button", { text: model.status === "resolved" ? "Reopen" : "Resolve" });
    status.addEventListener("click", async () => {
      if (model.status === "resolved") await this.plugin.service.reopen(model.id);
      else await this.plugin.service.resolve(model.id);
      await this.plugin.refresh();
    });
    const reanchor = actions.createEl("button", { text: "Re-anchor" });
    reanchor.addEventListener("click", async () => {
      const ok = await this.plugin.reanchorFromSelection(model.id);
      if (!ok) new Notice("Select replacement text in the active note first.");
    });
  }
}
