# Sideband Comments

<p align="center">
  <img src="apps/vscode/resources/sideband-comments-icon.png" width="144" alt="Sideband Comments icon">
</p>

<p align="center"><strong>Work with AI where the document lives.</strong></p>

![Sideband Comments keeps one comment history across Obsidian and VS Code](media/release/sideband-comments-1.0.0-hero.png)

AI conversations move fast, but the reasoning behind a change often disappears into chat history. Sideband Comments anchors questions, replies, and decisions to the exact text under review while keeping the document itself clean.

Open the same review history in Obsidian or VS Code. Writers, knowledge workers, developers, and file-aware AI tools can discuss a document, inspect the resulting change, and resolve the thread only after it has been verified.

## Why

- **Context attached to the exact text** — keep each discussion beside the passage, paragraph, or code range it concerns.
- **One review history across two editors** — continue the same conversation in Obsidian and VS Code.
- **Original text preserved for verification** — compare what was reviewed with what the document says now.
- **Local-first, append-only storage** — retain the full discussion history without embedding review data in the document.

## Built for code and writing

Sideband Comments is not limited to developer code review. A developer can review AI-assisted code in VS Code while a writer, researcher, or knowledge worker reviews AI-assisted prose in Obsidian. Both workflows use the same document-grounded conversation model: comment on an exact passage, inspect the change, and resolve only after verification.

![A developer and a writer using the same Sideband Comments workflow](media/release/sideband-comments-audiences.png)

When a file-aware AI tool has access to the workspace, instructions and replies can stay attached to the source instead of being repeatedly transferred through a separate chat. Sideband Comments does not call an AI service or require MCP, agent, or skill integration; it provides the durable local review layer that people and tools can share.

## How it works

1. Select the exact text or code that needs discussion.
2. Create a Sideband comment and continue the thread with people or a workspace-aware AI tool.
3. Review the creation-time original text, the current document, and the full reply history together.
4. Resolve the thread only after the resulting document has been verified.

Markdown and source files remain unchanged when a comment is created, replied to, edited, deleted, resolved, or re-anchored. Both editor extensions share one append-only store:

```text
.comments/
└── threads/
    └── <thread-id>.jsonl
```

## Installation

### VS Code

Comments Explorer groups commented files by workspace and directory. In Comment Details, double-click a comment body to open Save/Cancel editing (or focus it and press Enter). Delete opens a VS Code confirmation dialog; confirming hides the comment while preserving its JSONL history.

```bash
npm run package --workspace sideband-comments-vscode
code --install-extension apps/vscode/dist/sideband-comments-vscode-1.0.0.vsix --force
```

### Obsidian

```bash
npm run package --workspace sideband-comments-obsidian
```

Copy these files from `apps/obsidian/dist/` to `<vault>/.obsidian/plugins/sideband-comments/`:

- `main.js`
- `manifest.json`
- `styles.css`

The Obsidian adapter is desktop-only. It provides Live Preview highlights plus a two-part sidebar: a directory-tree comment explorer above the selected note's inline comment, reply, edit, delete, resolve, re-anchor, and resolved-visibility controls. The new-comment composer previews the current editor selection, and existing comment bodies open inline editing on double-click. Reading View range mapping is not included yet.

## Migrating Tandem Comments

Migration is a dry-run unless `--write` is explicitly supplied.

```bash
npm run build --workspace @sideband-comments/migrate
node packages/migrate/dist/sideband-migrate.js /path/to/vault
node packages/migrate/dist/sideband-migrate.js /path/to/vault --write
```

The write path records JSONL events before atomically replacing each Markdown file. Existing thread IDs with different events stop the migration instead of being overwritten.

## Architecture

```text
packages/core/          editor-neutral domain and use cases
packages/jsonl-store/   .comments/threads persistence adapter
packages/migrate/       Tandem fenced-block migration
apps/vscode/            VS Code CommentController adapter
apps/obsidian/          Obsidian sidebar and Live Preview adapter
```

The core owns thread events, deterministic folding, quote anchors, edit/delete history, resolve/reopen, re-anchor, and file relocation. Editor packages only translate host API events into core use cases. VS Code and Obsidian both present a workspace-wide file explorer above a selected-file detail editor, including re-anchor and show/hide-resolved controls.

## Development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm test
npm run typecheck
npm run build
```

## App version policy

VS Code and Obsidian releases may increment their patch versions independently, but they must share the same `major.minor` line. For example, VS Code `1.0.3` and Obsidian `1.0.7` are valid; `1.1.x` and `1.0.x` are not. Obsidian's package and manifest versions must match exactly.

`npm test`, the root build, each app package command, and the `App version policy` GitHub Actions check run the same validation:

```bash
npm run check:app-versions
```

Require the `app-version-policy` status check in the default branch protection rules to prevent mismatched version lines from being merged.

## Git synchronization

Tracking `.comments/` in Git keeps comment history available on other computers and allows the VS Code and Obsidian extensions to share it. This removes review-only changes from Markdown and code files, but comment activity still creates changes under `.comments/`. Ignoring `.comments/` avoids Git changes at the cost of requiring another synchronization mechanism.

## Inspiration and license

Sideband Comments is inspired by Tandem Comments and Anchored Comments. This repository is a new MIT-licensed implementation of the sidecar protocol and editor adapters; it does not include MCP, agent, or skill integration.
