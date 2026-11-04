# Sideband Comments for IntelliJ (local build)

This plugin shows and writes Sideband Comments in IntelliJ IDEA. It uses the same `.comments/` store as the VS Code, Obsidian and Chrome clients and the agent skill. It is not on the JetBrains Marketplace. Build it and install it from disk.

## How it works

The plugin does not write `.comments/` itself. It starts `bridge.cjs` with Node.js. The bridge calls the shared `packages/core` and `packages/jsonl-store` code. Thus the anchors, events and store lock are the same as in the other clients.

```text
IntelliJ plugin (Kotlin) ── one JSON line per request ──▶ bridge.cjs (Node) ──▶ packages/core + jsonl-store ──▶ .comments/
```

## Requirements

| Item | Version |
| --- | --- |
| IntelliJ IDEA | 2026.3 (build 263) or later |
| Node.js | 20 or later, for the build and when the plugin runs |
| JDK for the build | Java 25. The JBR that IntelliJ includes is sufficient |

## Build

Run from the repository root once, then from `apps/intellij`:

```bash
npm install
```

```bash
cd apps/intellij && JAVA_HOME="/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home" ./gradlew buildPlugin
```

The result is `apps/intellij/build/distributions/sideband-comments-intellij-0.1.0.zip`.

`gradle.properties` sets `localIdePath` to `/Applications/IntelliJ IDEA CE.app`. The build compiles against that IDE. If your IDE is in a different location, add `-PlocalIdePath=<path to the .app>`.

To run the tests (Kotlin unit tests and a headless IDE test that uses the agent tool as the other client):

```bash
cd apps/intellij && JAVA_HOME="/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home" ./gradlew test
```

## Install

1. In IntelliJ, open **Settings → Plugins → ⚙ → Install Plugin from Disk…**.
2. Select the `.zip` file from the build.
3. Restart IntelliJ.

To update, build again and install the new `.zip` in the same way. To remove, uninstall **Sideband Comments** in **Settings → Plugins**.

## Use

| Task | Where |
| --- | --- |
| Start a thread | Select text in the editor → right-click → **Add Sideband Comment** |
| See threads | Highlighted text and a gutter icon in the editor. Click the icon to open the thread |
| Browse all threads | **Sideband Comments** tool window (right side) → Comments Explorer. Double-click a thread to go to its text |
| Reply, Resolve, Reopen | Comment Details (lower part of the tool window). ⌘/Ctrl+Enter sends a reply |
| Attach a thread to new text | Select the new text in the same file → **Re-anchor to Selection** |
| Edit or delete a comment | **Edit** / **Delete** next to the comment. Delete hides the comment. Its JSONL history stays |
| Show or hide resolved threads | Eye button in the tool window toolbar |

The project root of a file is the nearest folder above it that contains `.comments` or `.git` (the same rule as VS Code). The plugin checks the store files every 2 seconds. Thus replies that an agent writes show up without **Reload**.

## Settings

**Settings → Tools → Sideband Comments**

| Setting | Default |
| --- | --- |
| Author name | Empty: the operating-system user name |
| Show resolved threads | On |
| Node.js executable | Empty: `/opt/homebrew/bin/node`, `/usr/local/bin/node`, then the shell `PATH` |

## Limits

- IntelliJ shows every file with `\n` line endings. In a file with `\r\n` line endings, a quote that spans lines does not match in the other clients.
- There is no Markdown preview comment and no **Consolidate Comment Storage** command. Use VS Code for these.
- The app version is not part of the shared release version check (`npm run check:app-versions`).
