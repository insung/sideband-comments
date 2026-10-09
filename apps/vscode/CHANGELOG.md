# Changelog

Release notes for the Sideband Comments extension for VS Code. Notes for the Obsidian plugin
are published with each [GitHub release](https://github.com/insung/sideband-comments/releases).

## 1.0.10

### Changed

- Let the agent tool reply on a thread whose quoted text was deleted, so an agent that removes a sentence on request answers the thread where it is instead of moving it onto an unrelated neighbouring sentence.

### Verification

- Typecheck and 137 tests passed.

## 1.0.9

### Added

- Highlight the comment whose quoted text holds the editor cursor in **Comment Details** and scroll the panel to it, choosing the innermost comment when quotes overlap.

### Verification

- Typecheck and 135 tests passed.

## 1.0.8

### Added

- Start a review thread from the agent tool with `create`, quoting a line (`--line 12`), a line range (`--line 12-14`), or an exact text read from a file, so an agent can leave its review as comments instead of editing the document.
- Create several threads in one run from a JSON batch file; every request is checked before anything is written, and one failing request creates no thread at all.
- Store threads the tool creates in the document's existing bundle, exactly where the editors would put them, instead of starting a new file per thread.
- Refuse a quote whose surrounding text cannot tell it apart from an identical passage, so a later edit above it cannot move the thread to the wrong place.

### Verification

- Typecheck and 128 tests passed.

## 1.0.7

### Fixed

- Keep agent replies in the selected project by requiring its root, and refuse replies when the review thread is closed or its quoted text is ambiguous, detached, or missing.
- Read agent reply and re-anchor text from UTF-8 files or standard input, so shell syntax in review text is stored literally instead of being expanded.

### Verification

- Typecheck and 114 tests passed.

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
