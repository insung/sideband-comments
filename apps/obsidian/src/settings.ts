import { App, PluginSettingTab, Setting } from "obsidian";
import type SidebandCommentsPlugin from "./main.js";

export interface SidebandSettings {
  authorName: string;
  showResolved: boolean;
}

export const DEFAULT_SETTINGS: SidebandSettings = {
  authorName: "",
  showResolved: true
};

export class SidebandSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SidebandCommentsPlugin) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName("Author name")
      .setDesc("Optional. Empty uses the neutral name \"user\".")
      .addText((text) => text
        .setValue(this.plugin.settings.authorName)
        .onChange(async (value) => {
          this.plugin.settings.authorName = value;
          await this.plugin.saveSettings();
        }));
    new Setting(this.containerEl)
      .setName("Show resolved threads")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showResolved)
        .onChange((value) => this.plugin.setShowResolved(value)));
  }
}
