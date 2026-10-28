# Changelog

Release notes for the Sideband Comments extension for VS Code. Notes for the Obsidian plugin
are published with each [GitHub release](https://github.com/insung/sideband-comments/releases).

## 2.0.0

**Sideband Comments comes to Chrome.** Read local Markdown and continue the same document review in Chrome, VS Code and Obsidian, with comments stored beside your project in one shared `.comments/` history. The Chrome extension makes this workflow available without running VS Code.

This release introduces Chrome as a new supported client; existing comment history remains compatible. Chrome initially supports macOS with Node.js 20 or newer and a separately installed Native Messaging host. Install it in developer mode using the [Chrome setup guide](../../docs/chrome.md); The initial Chrome Web Store submission is awaiting review; store availability will be announced after publication.

### Added

- Read local Markdown in Chrome with a GitHub light theme, H1/H2 contents, Mermaid, syntax highlighting and a shared comment panel using a separately installed macOS Native Messaging host.
- Create comments and replies, edit your own comments by double-clicking or pressing Enter, confirm deletions and resolve threads while preserving Markdown and append-only history.
- Keep resolved-comment visibility in Chrome Settings and remember panel widths across documents.
- Reopen a resolved Chrome thread and continue replying when its anchor is valid, while preserving the original quote and comment history ([#13](https://github.com/insung/sideband-comments/pull/13)).
- Install the agent tools as a Claude Code or Codex plugin and use the setup skill to choose which editor integrations to install when upgrading from the published 1.0.9 line.

### Changed

- Use one release version for Chrome, VS Code, Obsidian and the agent plugins, with automatic checks for Chrome package and manifest mismatches.
- Match Chrome comment action names and placement to the editor experience while restricting Chrome edits and deletions to the configured author name.
- Reply to orphaned review threads from the agent when the reviewed text was removed, preserving their original quote and unresolved anchor state.

### Fixed

- Keep YAML frontmatter out of the Chrome article and contents without shifting comment anchors.
- Map formatted text, punctuation in link labels and whole-paragraph browser selections to source positions without guessing ambiguous locations.
- Reject stale document or comment changes under the shared write lock and preserve unsaved edit drafts after conflicts.

### Distribution

- Load the Chrome extension in developer mode and separately register the Native Messaging host with Node.js 20 or newer on macOS.
- Separate the store-upload ZIP from the development ZIP without changing the development extension ID, local host settings or project comment stores during packaging.
- Register the separately installed host with the actual store extension ID when deliberately switching to a future store installation.
- Distinguish the initial Chrome store submission, which predates Reopen, from this release candidate, which includes it; the pending submission is not the final release archive.
- Distribute Obsidian assets through the bare version GitHub Release and offer the VS Code VSIX for manual installation; Marketplace publication is deferred for this release.

### Verification

- Passed typecheck, 266 application tests and 10 version-policy tests for the integrated 2.0.0 candidate, using TMPDIR=/private/tmp for native-host tests on macOS.
- Passed 11 VS Code Extension Host scenarios covering shared replies, duplicate submission, resolved visibility, multi-root navigation and delayed reads or writes.
- Verified full Chrome restart, persisted comments and reply creation while VS Code was closed in the preceding development build.
- Verified shared Chrome replies, edited comments, deleted replies and resolved state in the preceding installed VS Code and Obsidian integrations.
- Verified panel resizing and persistence, narrow-screen layouts and stale-document rejection in the preceding development build.
- Verified Chrome Reopen, reply persistence after refresh and unchanged Markdown through the integration checks recorded in PR #13; the publisher subsequently reported manual verification of the final 2.0.0 installations in VS Code and Obsidian.

## 1.0.11

### Added

- Install the agent skills as a Claude Code or Codex plugin with `claude plugin install sideband-comments@sideband-comments` or `codex plugin add sideband-comments@sideband-comments`, instead of linking the repository by hand.
- Set up the editors from the agent with a `setup` skill that checks the VS Code extension, the Obsidian plugin and the `.comments` directory, and installs the extension, opens the Obsidian plugin page or creates the directory only after you agree.

### Changed

- Keep the plugin version the same as the VS Code extension and the Obsidian plugin.

### Verification

- Typecheck and 144 tests passed.
- Installed the plugin from a local marketplace in Claude Code 2.1.282 and Codex 0.157.1; both list the `setup` and `sideband-comments` skills, and Codex reports `setup` as the onboarding skill.

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
