import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

function parseVersion(label, version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) throw new Error(`${label} has an invalid SemVer version: ${version}`);
  return { version, line: `${match[1]}.${match[2]}` };
}

function requireArtifactVersion(label, packageJson, suffix) {
  const artifact = `${label}-${packageJson.version}.${suffix}`;
  if (!packageJson.scripts?.package?.includes(artifact)) {
    throw new Error(`${label} package output must include its full version: ${artifact}`);
  }
}

export function assertAppVersionPolicy({
  vscodePackage,
  obsidianPackage,
  obsidianManifest,
  rootObsidianManifest,
  obsidianVersions
}) {
  const vscode = parseVersion("VS Code", vscodePackage.version);
  const obsidian = parseVersion("Obsidian", obsidianPackage.version);

  if (vscode.line !== obsidian.line) {
    throw new Error(
      `VS Code and Obsidian must share major.minor: ${vscode.version} != ${obsidian.version}`
    );
  }
  if (obsidianPackage.version !== obsidianManifest.version) {
    throw new Error(
      `Obsidian package and manifest versions must match exactly: ${obsidianPackage.version} != ${obsidianManifest.version}`
    );
  }
  if (JSON.stringify(rootObsidianManifest) !== JSON.stringify(obsidianManifest)) {
    throw new Error("Root and app Obsidian manifests must match exactly");
  }
  if (obsidianVersions[obsidian.version] !== obsidianManifest.minAppVersion) {
    throw new Error(
      `Obsidian versions.json must map ${obsidian.version} to ${obsidianManifest.minAppVersion}`
    );
  }

  requireArtifactVersion("sideband-comments-vscode", vscodePackage, "vsix");
  requireArtifactVersion("sideband-comments-obsidian", obsidianPackage, "zip");
  return { vscode: vscode.version, obsidian: obsidian.version };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = assertAppVersionPolicy({
    vscodePackage: readJson("apps/vscode/package.json"),
    obsidianPackage: readJson("apps/obsidian/package.json"),
    obsidianManifest: readJson("apps/obsidian/manifest.json"),
    rootObsidianManifest: readJson("manifest.json"),
    obsidianVersions: readJson("versions.json")
  });
  console.log(`App version policy passed: VS Code ${result.vscode}, Obsidian ${result.obsidian}`);
}
