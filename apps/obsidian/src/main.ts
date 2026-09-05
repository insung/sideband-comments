import { watch, type FSWatcher } from "node:fs";
import { mkdir } from "node:fs/promises";
import * as os from "node:os";
import { join } from "node:path";
import {
  FileSystemAdapter,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  TFile,
  type TAbstractFile
} from "obsidian";
import { EditorView } from "@codemirror/view";
import { captureAnchor, CommentService, type Actor } from "@sideband-comments/core";
import { JsonlThreadRepository } from "@sideband-comments/jsonl-store";
import { randomUUID } from "node:crypto";
import { setSidebandHighlights, sidebandHighlightField } from "./highlight.js";
import { DEFAULT_SETTINGS, SidebandSettingTab, type SidebandSettings } from "./settings.js";
import { SIDEBAND_VIEW_TYPE, SidebandSidebarView } from "./sidebar.js";
import { buildThreadViewModels, type ThreadViewModel } from "./view-model.js";

class TextPromptModal extends Modal {
  private value: string | undefined;
  private resolve!: (value: string | undefined) => void;
  readonly result = new Promise<string | undefined>((resolve) => { this.resolve = resolve; });

  constructor(app: SidebandCommentsPlugin["app"], private readonly label: string) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl("h3", { text: this.label });
    const input = this.contentEl.createEl("textarea");
    input.rows = 5;
    input.style.width = "100%";
    const submit = this.contentEl.createEl("button", { text: "Save" });
    submit.addEventListener("click", () => {
      const value = input.value.trim();
      if (!value) return;
      this.value = value;
      this.close();
    });
    input.focus();
  }

  onClose(): void {
    this.resolve(this.value);
    this.contentEl.empty();
  }
}

export default class SidebandCommentsPlugin extends Plugin {
  settings: SidebandSettings = DEFAULT_SETTINGS;
  repository!: JsonlThreadRepository;
  service!: CommentService;
  private watcher?: FSWatcher;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private root = "";

  async onload(): Promise<void> {
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) {
      new Notice("Sideband Comments currently requires a desktop filesystem vault.");
      return;
    }
    this.root = this.app.vault.adapter.getBasePath();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<SidebandSettings> | null);
    this.repository = new JsonlThreadRepository(this.root);
    this.service = new CommentService(this.repository, {
      actor: () => this.actor(),
      id: randomUUID,
      now: () => new Date().toISOString()
    });

    await mkdir(this.repository.threadsDirectory, { recursive: true });
    this.watcher = watch(this.repository.threadsDirectory, () => this.scheduleRefresh());
    this.register(() => this.watcher?.close());
    this.registerEditorExtension(sidebandHighlightField);
    this.registerView(SIDEBAND_VIEW_TYPE, (leaf) => new SidebandSidebarView(leaf, this));
    this.addSettingTab(new SidebandSettingTab(this.app, this));
    this.addRibbonIcon("messages-square", "Sideband Comments", () => void this.openSidebar());
    this.addCommand({
      id: "add-comment-on-selection",
      name: "Add comment on selection",
      editorCallback: () => void this.addCommentFromSelection()
    });
    this.addCommand({ id: "open-sidebar", name: "Open comments sidebar", callback: () => void this.openSidebar() });

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => void this.refresh()));
    this.registerEvent(this.app.workspace.on("file-open", () => void this.refresh()));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md") void this.refresh();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => void this.onRename(file, oldPath)));
    this.registerDomEvent(window, "focus", () => void this.refresh());
    await this.refresh();
  }

  onunload(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.app.workspace.detachLeavesOfType(SIDEBAND_VIEW_TYPE);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh();
    }, 100);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private actor(): Actor {
    const name = this.settings.authorName.trim() || os.userInfo().username || "user";
    return { id: name.toLocaleLowerCase().replace(/[^\p{L}\p{N}_.-]+/gu, "-"), name };
  }

  async prompt(label: string): Promise<string | undefined> {
    const modal = new TextPromptModal(this.app, label);
    modal.open();
    return modal.result;
  }

  async modelsFor(path: string, markdown: string) {
    const threads = await this.repository.listByDocument(path);
    return buildThreadViewModels(markdown, threads, this.settings.showResolved);
  }

  async allModels(): Promise<ThreadViewModel[]> {
    const threads = await this.repository.list();
    const byDocument = new Map<string, typeof threads>();
    for (const thread of threads) {
      const documentThreads = byDocument.get(thread.documentPath) ?? [];
      documentThreads.push(thread);
      byDocument.set(thread.documentPath, documentThreads);
    }
    const models = await Promise.all([...byDocument.entries()].map(async ([path, documentThreads]) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      const markdown = file instanceof TFile ? await this.app.vault.cachedRead(file) : "";
      return buildThreadViewModels(markdown, documentThreads, this.settings.showResolved);
    }));
    return models.flat();
  }

  activeDocumentPath(): string | undefined {
    return this.app.workspace.getActiveFile()?.path;
  }

  private markdownView(path?: string): MarkdownView | undefined {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file && (!path || active.file.path === path)) return active;
    const target = path ?? this.app.workspace.getActiveFile()?.path;
    if (!target) return undefined;
    return this.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((candidate): candidate is MarkdownView => candidate instanceof MarkdownView && candidate.file?.path === target);
  }

  async addCommentFromSelection(): Promise<void> {
    const view = this.markdownView();
    if (!view?.file) return;
    const selection = view.editor.getSelection();
    if (!selection) {
      new Notice("Select text before adding a comment.");
      return;
    }
    const body = await this.prompt("New comment");
    if (!body) return;
    const markdown = view.editor.getValue();
    const from = view.editor.posToOffset(view.editor.getCursor("from"));
    const to = view.editor.posToOffset(view.editor.getCursor("to"));
    await this.service.create({ documentPath: view.file.path, anchor: captureAnchor(markdown, from, to), body });
    await this.openSidebar();
    await this.refresh();
  }

  async reanchorFromSelection(threadId: string): Promise<boolean> {
    const view = this.markdownView();
    if (!view?.file || !view.editor.getSelection()) return false;
    const markdown = view.editor.getValue();
    await this.service.reanchor(threadId, captureAnchor(
      markdown,
      view.editor.posToOffset(view.editor.getCursor("from")),
      view.editor.posToOffset(view.editor.getCursor("to"))
    ));
    await this.refresh();
    return true;
  }

  async refresh(): Promise<void> {
    if (!this.repository) return;
    const view = this.markdownView();
    if (view?.file) {
      const models = await this.modelsFor(view.file.path, view.editor.getValue());
      const editorView = (view.editor as unknown as { cm?: EditorView }).cm;
      editorView?.dispatch({ effects: setSidebandHighlights.of(models.flatMap((model) =>
        model.range ? [{ ...model.range, status: model.status }] : []
      )) });
    }
    for (const leaf of this.app.workspace.getLeavesOfType(SIDEBAND_VIEW_TYPE)) {
      const sidebar = leaf.view;
      if (sidebar instanceof SidebandSidebarView) await sidebar.render();
    }
  }

  async openThread(documentPath: string, threadId: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(documentPath);
    if (!(file instanceof TFile)) {
      new Notice(`Cannot open comment file: ${documentPath}`);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    const view = leaf.view instanceof MarkdownView ? leaf.view : this.markdownView(documentPath);
    if (!view) return;
    const model = (await this.modelsFor(documentPath, view.editor.getValue())).find((candidate) => candidate.id === threadId);
    if (!model?.range) return;
    const from = view.editor.offsetToPos(model.range.start);
    const to = view.editor.offsetToPos(model.range.end);
    view.editor.setSelection(from, to);
    view.editor.scrollIntoView({ from, to }, true);
    view.editor.focus();
  }

  private async openSidebar(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(SIDEBAND_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? undefined;
      if (leaf) await leaf.setViewState({ type: SIDEBAND_VIEW_TYPE, active: true });
    }
    if (leaf) this.app.workspace.revealLeaf(leaf);
  }

  private async onRename(file: TAbstractFile, oldPath: string): Promise<void> {
    const threads = await this.repository.list();
    const destination = file.path;
    for (const thread of threads) {
      const mapped = thread.documentPath === oldPath
        ? destination
        : thread.documentPath.startsWith(`${oldPath}/`)
          ? `${destination}/${thread.documentPath.slice(oldPath.length + 1)}`
          : undefined;
      if (mapped) await this.service.relocate(thread.id, mapped);
    }
    await this.refresh();
  }
}
