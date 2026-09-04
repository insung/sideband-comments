# Sideband Comments

Sideband Comments keeps anchored review threads outside source documents and shows the same comments in VS Code and Obsidian.

Markdown and source files remain unchanged when a comment is created, replied to, resolved, or re-anchored. Both editor extensions share one append-only store:

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

The core owns thread events, deterministic folding, quote anchors, resolve/reopen, re-anchor, and file relocation. Editor packages only translate host API events into core use cases.

## Development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm test
npm run typecheck
npm run build
```

### VS Code package

```bash
npm run package --workspace sideband-comments-vscode
code --install-extension apps/vscode/dist/sideband-comments-vscode-0.1.8.vsix --force
```

### Obsidian package

```bash
npm run build --workspace sideband-comments-obsidian
```

Copy these files from `apps/obsidian/dist/` to `<vault>/.obsidian/plugins/sideband-comments/`:

- `main.js`
- `manifest.json`
- `styles.css`

The initial Obsidian adapter is desktop-only. It provides Live Preview highlights and a sidebar; Reading View range mapping is not included yet.

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
