# Sideband Comments: privacy and local data

Last updated: 2026-10-28.

This policy describes the Sideband Comments Chrome extension and its separately installed Native Messaging host. It also explains where optional editor and AI integrations differ.

## Local documents and comments

The extension renders supported local Markdown files. The local host reads Markdown inside project folders registered by the user and reads the project's `.comments` history. Comment actions append events to that local history; they do not insert review markup into the Markdown document.

Comment events can include the selected quotation and surrounding anchor context, comment and reply text, author names, document paths relative to the project, timestamps, and thread identifiers. Deleted or edited comments remain in the append-only history. Hiding a comment is not erasure of its previous content.

Sideband Comments does not upload documents or comments to a Sideband server or an AI service, and does not include analytics or advertising services. Other software with access to the project may read the files. If you commit or synchronize `.comments`, that mechanism determines who else receives the history.

## Settings and native communication

Chrome stores local reader preferences, including panel widths and resolved-thread visibility. The native host stores registered project folders, the configured author name, and the allowed extension ID in local configuration. The host launcher also records local executable paths needed to start the program.

The extension and host exchange requests and document/comment content through Chrome Native Messaging on the same computer. Author names are local labels, not authenticated identities. Configure project folders and author names accordingly.

## External content and AI tools

Markdown can contain external image URLs and links. Loading images or following links can send ordinary browser requests to those destinations, subject to Chrome's network settings. This is separate from Sideband's local comment storage.

Claude Code, Codex, and other AI tools are optional, separately installed software. When you ask one to read documents or Sideband comments, its configuration and provider policies govern what it sends and retains. Sideband's local storage does not make a separate AI service offline. An agent you ask to edit a document can change its contents.

## Retention and removal

Uninstalling the extension or host does not delete project Markdown or `.comments`. The host removal command preserves saved settings. To remove local history or settings, manage those local files deliberately, including any backups, version-control history, or synchronized copies. See [the Chrome guide](chrome.md#remove) for host removal and configuration locations.

## Questions

Use the [project issue tracker](https://github.com/insung/sideband-comments/issues) for questions. Do not include private documents, comment history, local configuration, or personal paths in a public issue.
