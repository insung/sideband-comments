# Sideband Comments for VS Code

Shows shared `.comments/threads/*.jsonl` review threads in the VS Code editor. The Primary Side Bar provides a workspace-wide file/count overview, while VS Code's built-in **Comments** view shows the active file's full threads. It supports comments, replies, resolve/reopen, re-anchoring, individual comment deletion, external JSONL reload, and file relocation without MCP or agent integration.

Existing Anchored Comments v2 event logs are read in place, so their comments and replies remain visible without rewriting the original JSONL history.

Select text and run **Sideband Comments: Add Comment on Selection** from the editor context menu. The extension prompts for the comment immediately, persists it to JSONL, expands the inline thread, and focuses the built-in Comments view.

See the repository root README for architecture, development, and Obsidian installation instructions.
