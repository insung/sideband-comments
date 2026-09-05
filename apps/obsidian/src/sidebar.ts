import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import type { ThreadViewModel } from "./view-model.js";
import { groupThreadViewModels } from "./view-model.js";
import type SidebandCommentsPlugin from "./main.js";

export const SIDEBAND_VIEW_TYPE = "sideband-comments-sidebar";

export class SidebandSidebarView extends ItemView {
  private readonly expandedDocuments = new Set<string>();
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
    const groups = groupThreadViewModels(models);
    const heading = container.createDiv({ cls: "sideband-sidebar-header" });
    heading.createEl("h3", { text: `Comments (${models.length})` });
    const add = heading.createEl("button", { text: "Add from selection" });
    add.addEventListener("click", () => void this.plugin.addCommentFromSelection());
    if (models.length === 0) {
      container.createEl("p", { text: "No comments in this vault." });
      return;
    }
    const activePath = this.plugin.activeDocumentPath();
    for (const group of groups) {
      const section = container.createEl("details", { cls: "sideband-document" });
      section.open = this.expandedDocuments.has(group.documentPath) || group.documentPath === activePath;
      section.addEventListener("toggle", () => {
        if (section.open) this.expandedDocuments.add(group.documentPath);
        else this.expandedDocuments.delete(group.documentPath);
      });
      const summary = section.createEl("summary", { cls: "sideband-document-summary" });
      summary.createSpan({ text: group.documentPath });
      summary.createSpan({
        cls: "sideband-document-count",
        text: `${group.threads.length} comment${group.threads.length === 1 ? "" : "s"}`
      });
      const threads = section.createDiv({ cls: "sideband-document-threads" });
      for (const model of group.threads) await this.renderThread(threads, model);
    }
  }

  private async renderThread(container: HTMLElement, model: ThreadViewModel): Promise<void> {
    const card = container.createDiv({ cls: `sideband-thread${model.status === "resolved" ? " is-resolved" : ""}` });
    const title = card.createDiv();
    title.createEl("strong", { text: model.status === "resolved" ? "✓ Resolved" : "Open" });
    if (model.anchorState !== "resolved") title.createSpan({ text: ` · ⚠ ${model.anchorState}` });
    const quote = card.createEl("blockquote", { text: model.anchor.exact });
    if (model.range) {
      quote.addEventListener("click", () => void this.plugin.openThread(model.documentPath, model.id));
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
