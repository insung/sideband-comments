# Changelog

Release notes for the Sideband Comments extension for VS Code. Notes for the Obsidian plugin
are published with each [GitHub release](https://github.com/insung/sideband-comments/releases).

## 1.0.6

### Fixed

- Comment on a document that is open outside every workspace folder. Comments are stored in the
  nearest project above the file — a directory holding `.comments` or `.git`, including a
  `git worktree` — instead of the command reporting that the file is not in a workspace.
- Show **Add Comment on Selection** in the Markdown preview's right-click menu when the preview
  replaces the editor tab. Previously only the side-by-side preview offered the menu.
- Write a comment in the sidebar while the Markdown preview holds focus. The sidebar no longer
  requires an active text editor; it falls back to a visible editor, then to your last selection
  in that document.

### Changed

- **Add Comment on Selection** now pins the preview selection to the sidebar and puts the cursor
  in its composer, so the comment is written in the sidebar instead of a single-line input box.
  The pinned text stays visible above the composer and can be cleared.
- The sidebar composer is disabled, with an explanation of how to select text, while nothing is
  selected. It no longer accepts a comment only to reject it on submit.
- Comments Explorer also lists projects found outside the workspace, and their stores are watched
  for changes, so comments written in Obsidian appear without a manual refresh.

### Verification

- Typecheck and 105 tests passed.
- Extension packaged as `sideband-comments-vscode-1.0.6.vsix` with the preview script included.

## 1.0.5

### Added

- Add comments directly from selected text in the VS Code Markdown preview.
- Keep a document's comment history together when files or folders are renamed in VS Code or Obsidian.
- Provide a command to consolidate existing per-thread JSONL files into document-based history files.

### Changed

- New comments are stored by logical document in `.comments/documents/<bundle-id>.jsonl`, one
  file per document.
- Existing `.comments/threads/*.jsonl` files remain readable and can be consolidated without losing
  comment events.
