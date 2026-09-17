import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");

const sectionFor = (version: string): string | undefined => {
  const versions = [...changelog.matchAll(/^## (\S+)$/gm)];
  const index = versions.findIndex((match) => match[1] === version);
  if (index < 0) return undefined;
  const start = versions[index]!.index! + versions[index]![0].length;
  return changelog.slice(start, versions[index + 1]?.index ?? changelog.length);
};

describe("release notes", () => {
  it("documents the version that will be published", () => {
    expect(sectionFor(manifest.version)).toBeDefined();
  });

  it("describes the release with the sections the release notes use", () => {
    const section = sectionFor(manifest.version) ?? "";
    const headings = [...section.matchAll(/^### (.+)$/gm)].map((match) => match[1]);

    expect(headings.length).toBeGreaterThan(0);
    expect(headings).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(Added|Changed|Fixed)$/)])
    );
    for (const heading of headings) {
      expect(heading).toMatch(/^(Added|Changed|Fixed|Verification|Distribution)$/);
    }
  });

  it("writes entries as sentences rather than commit subjects", () => {
    const section = sectionFor(manifest.version) ?? "";
    const entries = section
      .split(/^### .+$/m)
      .flatMap((subsection) => subsection.split(/^- /m).slice(1))
      .map((entry) => entry.trim());

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry).toMatch(/^\*{0,2}[A-Z]/);
      expect(entry).toMatch(/\.$/);
      expect(entry).not.toMatch(/^(fix|feat|chore|docs|ci|build|refactor|test)[(:]/i);
    }
  });
});
