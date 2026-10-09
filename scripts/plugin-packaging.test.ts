import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const pluginRoot = join(root, "plugin");

function readJson(path: string) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [relative(pluginRoot, path)];
  });
}

function skill(name: string) {
  return readFileSync(join(pluginRoot, "skills", name, "SKILL.md"), "utf8");
}

describe("plugin packaging", () => {
  it("points both marketplaces at the plugin directory only", () => {
    const claude = readJson(".claude-plugin/marketplace.json");
    const codex = readJson(".agents/plugins/marketplace.json");

    expect(claude.plugins).toEqual([expect.objectContaining({ name: "sideband-comments", source: "./plugin" })]);
    expect(codex.plugins).toEqual([
      expect.objectContaining({ name: "sideband-comments", source: { source: "local", path: "./plugin" } })
    ]);
  });

  it("ships the skills and their tool but no editor code or hooks", () => {
    const files = filesUnder(pluginRoot);

    expect(files).toEqual(
      expect.arrayContaining([
        ".claude-plugin/plugin.json",
        ".codex-plugin/plugin.json",
        "skills/sideband-comments/SKILL.md",
        "skills/sideband-comments/scripts/sideband_comments.py",
        "skills/setup/SKILL.md"
      ])
    );
    expect(files.filter((file) => /^(apps|packages|hooks)\//.test(file) || file.endsWith("hooks.json"))).toEqual([]);
  });

  it("names the Claude Code and Codex plugins the same", () => {
    const claude = readJson("plugin/.claude-plugin/plugin.json");
    const codex = readJson("plugin/.codex-plugin/plugin.json");

    expect(claude.name).toBe("sideband-comments");
    expect(codex.name).toBe("sideband-comments");
    expect(codex.skills).toBe("./skills/");
    expect(codex.interface.capabilities).toEqual([]);
  });

  it("makes setup the Codex onboarding skill", () => {
    const codex = readJson("plugin/.codex-plugin/plugin.json");
    const onboarding = codex.extensions["com.openai"].onboardingSkill;

    expect(onboarding).toBe("./skills/setup/SKILL.md");
    expect(existsSync(join(pluginRoot, onboarding))).toBe(true);
    expect(skill("setup")).toMatch(/^---\nname: setup\n/);
  });

  it("asks before installing the VS Code extension and falls back to the Marketplace link", () => {
    const setup = skill("setup");

    expect(setup).toContain("code --list-extensions");
    expect(setup).toContain("code --install-extension insung.sideband-comments-vscode");
    expect(setup).toContain("https://marketplace.visualstudio.com/items?itemName=insung.sideband-comments-vscode");
    expect(setup).toMatch(/only after the user agrees/i);
  });

  it("opens the Obsidian plugin page instead of copying files", () => {
    const setup = skill("setup");

    expect(setup).toContain("obsidian://show-plugin?id=sideband-comments");
    expect(setup).not.toMatch(/\bcp\b|\bcurl\b|releases\/latest\/download/);
  });

  it("creates .comments only after the user agrees", () => {
    const setup = skill("setup");

    expect(setup).toContain("mkdir .comments");
    expect(setup).toMatch(/Never install, open or create anything the user has not agreed to/);
  });
});
