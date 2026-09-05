# Sideband Comments for VS Code

Shows shared `.comments/threads/*.jsonl` review threads in the VS Code editor. The **Sideband Comments** container in the Secondary Side Bar stacks a workspace-wide file/count explorer above a selected-file detail editor. The detail editor keeps the creation-time original text, all comments and replies, and inline create, edit, delete, resolve, and reopen controls together. Native editor comment markers remain available, while the Sideband detail view is the main editing surface. Re-anchoring, external JSONL reload, and file relocation are also supported without MCP or agent integration.

Existing Anchored Comments v2 event logs are read in place, so their comments and replies remain visible without rewriting the original JSONL history.

Select text, open **Sideband Comments** in the Secondary Side Bar, and write in **New comment on editor selection**. You can also run **Sideband Comments: Add Comment on Selection** from the editor context menu. Both paths persist the thread to JSONL and show it in the selected file's detail editor.

See the repository root README for architecture, development, and Obsidian installation instructions.
