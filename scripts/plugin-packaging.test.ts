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

// The skill text is wrapped by hand; compare its sentences, not its line breaks.
function prose(name: string) {
  return skill(name).replace(/\s+/g, " ");
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

    expect(setup).toContain('mkdir "<project root>/.comments"');
    expect(setup).toMatch(/Never install, open or create anything the user has not agreed to/);
  });

  it("asks which editors the user works in before checking any", () => {
    const setup = prose("setup");
    const question = setup.indexOf("VS Code, Obsidian, or both");

    expect(question).toBeGreaterThan(-1);
    expect(question).toBeLessThan(setup.indexOf("## 2. Check"));
    expect(setup).toMatch(/Check, report and install only the editors the user chose/);
  });

  it("finds the project root the way the tool and VS Code do, and confirms it", () => {
    const setup = prose("setup");

    expect(setup).toMatch(/first directory that contains `\.comments` or `\.git`/);
    expect(setup).toMatch(/If no directory has either, offer the current directory/);
    expect(setup).toMatch(/Show the root to the user and ask them to confirm it/);
  });

  it("warns when the Obsidian vault root is not the project root", () => {
    const setup = prose("setup");

    expect(setup).toMatch(/nearest directory that contains `\.obsidian\/`/);
    expect(setup).toMatch(/vault root is not the project root/);
  });

  it("reports whether the Obsidian plugin is enabled, not only installed", () => {
    const setup = prose("setup");

    expect(setup).toContain(".obsidian/community-plugins.json");
    expect(setup).toMatch(/enabled.*installed but disabled.*missing/s);
  });

  it("checks Python without installing it", () => {
    const setup = prose("setup");

    expect(setup).toContain("python3 --version");
    expect(setup).toMatch(/3\.9 or later/);
    expect(setup).toMatch(/Do not install Python/);
  });

  it("recommends tracking a new .comments directory in Git", () => {
    const setup = prose("setup");

    expect(setup).toMatch(/Recommend tracking `\.comments\/` in Git/);
    expect(setup).toContain(".comments/.gitkeep");
  });

  it("points the comments skill at setup when the store is missing", () => {
    expect(prose("sideband-comments")).toMatch(/does not start a store.*`setup` skill/s);
  });
});
