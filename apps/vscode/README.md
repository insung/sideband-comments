# Sideband Comments for VS Code

<p align="center">
  <img src="https://raw.githubusercontent.com/insung/sideband-comments/main/apps/vscode/resources/sideband-comments-icon.png" width="144" alt="Sideband Comments icon">
</p>

<p align="center"><strong>Work with AI where the document lives.</strong></p>

![Sideband Comments keeps one comment history across Obsidian and VS Code](https://raw.githubusercontent.com/insung/sideband-comments/main/media/release/sideband-comments-1.0.0-hero.png)

AI conversations move fast, but the reasoning behind a change often disappears into chat history. Sideband Comments anchors questions, replies, and decisions to the exact text under review while keeping the document itself clean.

Open the same review history in Obsidian or VS Code. Writers, knowledge workers, developers, and file-aware AI tools can discuss a document, inspect the resulting change, and resolve the thread only after it has been verified.

## Why Sideband Comments

- **Context attached to the exact text** — keep each discussion beside the passage, paragraph, or code range it concerns.
- **One review history across two editors** — continue the same conversation in Obsidian and VS Code.
- **Original text preserved for verification** — compare what was reviewed with what the document says now.
- **Local-first, append-only storage** — retain the full discussion history in `.comments/threads/*.jsonl` without embedding review data in the document.

## Built for code and writing

Sideband Comments is not limited to developer code review. Developers can review AI-assisted code in VS Code while writers, researchers, and knowledge workers use the same document-grounded workflow in Obsidian.

![A developer and a writer using the same Sideband Comments workflow](https://raw.githubusercontent.com/insung/sideband-comments/main/media/release/sideband-comments-audiences.png)

When a file-aware AI tool has access to the workspace, instructions and replies can stay attached to the source instead of being repeatedly transferred through a separate chat. Sideband Comments does not call an AI service; it provides the durable local review layer that people and tools can share.

## How it works

1. Select the exact text or code that needs discussion.
2. Open **Sideband Comments** in the Secondary Side Bar and write in **New comment on editor selection**.
3. Continue the thread in Comment Details and inspect the creation-time original text alongside the current document.
4. Resolve the thread only after the resulting document has been verified.

Comments Explorer groups commented files by workspace and directory. Comment Details keeps original text, comments, replies, and inline create, edit, delete, resolve, reopen, and re-anchor controls together. Native editor comment markers remain available, while the detail view is the main editing surface.

Existing Anchored Comments v2 event logs are read in place, so their comments and replies remain visible without rewriting the original JSONL history. External JSONL reload and file relocation are also supported.

Sideband Comments does not require MCP, agent, or skill integration. See the [GitHub repository](https://github.com/insung/sideband-comments) for architecture, development, Obsidian installation, and Tandem Comments migration instructions.
