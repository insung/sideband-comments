# Sideband Comments

Sideband Comments keeps anchored review threads outside source documents and shows the same comments in VS Code and Obsidian.

Markdown and source files remain unchanged when a comment is created, replied to, edited, deleted, resolved, or re-anchored. Both editor extensions share one append-only store:

```text
.comments/
└── threads/
    └── <thread-id>.jsonl
```

## Why

Sideband Comments is inspired by Tandem Comments and Anchored Comments.

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

VS Code and Obsidian releases may increment their patch versions independently, but they must share the same `major.minor` line. For example, VS Code `0.2.3` and Obsidian `0.2.7` are valid; `0.3.x` and `0.2.x` are not. Obsidian's package and manifest versions must match exactly.

`npm test`, the root build, each app package command, and the `App version policy` GitHub Actions check run the same validation:

```bash
npm run check:app-versions
```

Require the `app-version-policy` status check in the default branch protection rules to prevent mismatched version lines from being merged.

### VS Code package

Comments Explorer groups commented files by workspace and directory. In Comment Details, double-click a comment body to open Save/Cancel editing (or focus it and press Enter). Delete opens a VS Code confirmation dialog; confirming hides the comment while preserving its JSONL history.

```bash
npm run package --workspace sideband-comments-vscode
code --install-extension apps/vscode/dist/sideband-comments-vscode-0.2.0.vsix --force
```

### Obsidian package

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

## Git synchronization

Tracking `.comments/` in Git keeps comment history available on other computers and allows the VS Code and Obsidian extensions to share it. This removes review-only changes from Markdown and code files, but comment activity still creates changes under `.comments/`. Ignoring `.comments/` avoids Git changes at the cost of requiring another synchronization mechanism.

## License

MIT. This repository is a new implementation of the sidecar protocol and editor adapters; it does not include MCP, agent, or skill integration.
