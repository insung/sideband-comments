import assert from "node:assert/strict";
import test from "node:test";
import { assertAppVersionPolicy } from "./check-app-version-line.mjs";

function fixture(vscodeVersion, obsidianVersion, manifestVersion = obsidianVersion) {
  return {
    vscodePackage: {
      version: vscodeVersion,
      scripts: { package: `sideband-comments-vscode-${vscodeVersion}.vsix` }
    },
    obsidianPackage: {
      version: obsidianVersion,
      scripts: { package: `sideband-comments-obsidian-${obsidianVersion}.zip` }
    },
    obsidianManifest: { version: manifestVersion }
  };
}

test("allows independent patch revisions on the same major.minor line", () => {
  assert.deepEqual(assertAppVersionPolicy(fixture("0.2.3", "0.2.7")), {
    vscode: "0.2.3",
    obsidian: "0.2.7"
  });
});

test("rejects different major.minor lines", () => {
  assert.throws(
    () => assertAppVersionPolicy(fixture("0.3.0", "0.2.7")),
    /must share major\.minor/
  );
});

test("requires the Obsidian package and manifest revisions to match", () => {
  assert.throws(
    () => assertAppVersionPolicy(fixture("0.2.3", "0.2.7", "0.2.6")),
    /must match exactly/
  );
});
