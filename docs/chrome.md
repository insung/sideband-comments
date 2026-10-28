# Chrome Markdown reader

Sideband Comments can read local Markdown in Chrome with a GitHub light theme, a left table of contents, Mermaid diagrams, syntax highlighting, and a right comment panel. Comments use the same `.comments/` store as VS Code, Obsidian and the agent tool. VS Code does not have to be running.

This first version targets **macOS + desktop Chrome**. It uses an unpacked Chrome extension and a small **Native Messaging** program running on Node.js 20 or newer. No web server, cloud account or continuously running daemon is needed. Chrome starts the local program when a request needs it.

## Install on macOS

Keep this checkout in a stable directory: the local registration points to the bundled host inside it. Run these commands from the repository root on the branch containing the Chrome reader:

```sh
node --version
npm ci
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and choose `apps/chrome/dist` inside the checkout.
3. Open the extension's **Details** and enable **Allow access to file URLs**.
4. Copy its extension ID. The checked-in development key makes it stable; the expected ID is also in `apps/chrome/dist/extension-id.txt`.
5. Register the local program using that actual ID:

```sh
node apps/native-host/scripts/install.mjs --extension-id YOUR_32_LETTER_EXTENSION_ID
```

The installer records the absolute path of the Node executable running it. If you replace Node or move the checkout, rebuild and run the registration command again. It preserves existing project and author settings. Rebuilds do not modify your Markdown or comment history.

6. Click the Sideband Comments extension icon to open **Settings**. Enter the absolute project folder containing your Markdown and `.comments`, and your author name. You can register multiple project folders, one per line. Click **Save settings**.
7. Drag a `.md` file from that folder into Chrome, or use **File → Open File**. Existing tabs need reloading after installing/updating the extension.

You can also set the first project and author while registering the host:

```sh
node apps/native-host/scripts/install.mjs --extension-id YOUR_32_LETTER_EXTENSION_ID \
  --project "/Users/your-name/Documents/my-project" --author "Your name"
```

Choose the same project root as your other Sideband clients. For an Obsidian vault, use the vault root. A missing `.comments` store is created only when you write your first comment. Nested registered roots use the most specific matching root. Open files through their real project path; files reached through escaping symlinks and symlinked comment stores are refused.

The registration files are:

- `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sideband_comments.chrome.json`
- `~/Library/Application Support/Sideband Comments/chrome-host.sh`
- `~/Library/Application Support/Sideband Comments/chrome-host.json`

The last file contains project paths, author name, and the allowed extension ID. It contains no online service credentials.

## Chrome Web Store installation preparation

The initial Chrome Web Store submission is awaiting review, as reported by the publisher on 2026-10-28. It predates the Reopen change in PR #13; the final 2.0.0 source and packages include that change. The submitted ZIP and final release ZIP are different artifacts. Do not use the Reopen workflow below as a claim about the pending submission. There is no public store URL to use at this stage.

The store extension and Native Messaging host are separate installations. A store download does not install Node.js, clone or build this repository, or register the host. The initial host installation uses the source checkout and build steps above; there is no standalone host installer package yet.

Once an approved store version is available:

1. Install that version from its actual listing and enable **Allow access to file URLs** in its extension Details.
2. Copy the installed extension's actual ID from `chrome://extensions`. Do not use the development ID or assume the store ID matches it.
3. Build the host from the source revision corresponding to that release and keep the checkout in a stable location. Register it with the actual store ID:

```sh
node apps/native-host/scripts/install.mjs --extension-id YOUR_ACTUAL_STORE_EXTENSION_ID
```

4. Open Settings to check the registered folders and author. Open a disposable Markdown file from a registered project, create a comment, reply, reload, and verify both persisted before using your normal documents.

Re-registering without `--project` or `--author` preserves saved project roots and author settings. It replaces the allowed extension ID: this installer authorizes one extension ID at a time, not development and store extensions simultaneously. Changing the registered ID can disconnect the previous extension; plan the switch deliberately. No change to your existing registration is needed merely to prepare or upload a ZIP.

If the development and store IDs should match for future work, obtain the public key of the uploaded store item and evaluate a deliberate development-key migration. Do not replace the checked-in development key as part of ZIP packaging or overwrite an active host registration to test an upload.

## Comment on a document

1. Select text inside one paragraph, heading, list item or table cell. Its quote appears above **New comment** on the right and remains highlighted while you type. Supported inline emphasis and link labels are mapped to their exact source positions.
2. Enter your comment and click **Add comment**.
3. Enter a **Reply** under an open thread and click **Reply**.
4. Reload the tab to confirm persistence, or inspect the same document in your existing Sideband client.
5. Click a thread's quoted text to scroll to and highlight its source passage. Click the link-styled **Resolve** at the top right of an open thread to record its resolved state. Open the extension's Settings tab and use **Hide Resolved / Show Resolved** to filter resolved threads; open threads remain visible. To reopen a resolved thread, show resolved threads in Settings and click **Reopen** at the top right of the thread. Chrome remembers the choice in this profile and updates open Markdown tabs without reloading or discarding drafts.
6. Comments and replies matching your configured author name allow editing by double-clicking the comment body or focusing it and pressing Enter. The edit form provides **Save / Cancel**. **Delete** appears at the bottom right of each comment. Delete asks for confirmation and removes only that comment; the thread, other comments and append-only history remain. These actions also work on resolved threads without reopening them.

Author names are local settings, not authenticated accounts. A comment written by another Sideband client with the same exact author name is treated as yours; different names are not merged. If the document, thread revision or author settings change before saving, the host rejects the old request. Your edit draft remains available to copy before reloading.

Markdown files are unchanged. Events are appended to `.comments/documents/*.jsonl`; existing `.comments/threads/*.jsonl` files remain readable. Keep `.comments` synchronized with the same mechanism you already use for your project.

Selection endpoints must map to exact source text. Bold/italic text and explicit link labels are supported, including repeated phrases using parser source positions. A selection across formatting may quote Markdown syntax between its endpoints. Transformed text such as entities, normalized inline code or autolinks may be refused when their source positions cannot be proven. Multiple blocks, code blocks and diagrams are not selectable. The panel explains unsupported selections; it never guesses an anchor or silently widens a selection to an entire paragraph.

Resolved threads are readable but do not accept replies. Orphaned or ambiguous anchors also do not accept replies; the panel shows the reason beside the disabled reply form. Open threads can be resolved even when their quote moved. Use **Reopen** in Chrome to resume a resolved thread. Re-anchor moved quotes in an existing editor client; reopening does not repair an orphaned or ambiguous anchor.

## Refresh and limits

- Use Chrome's tab reload (Command-R on macOS) to read document and comment changes. There are no in-page Refresh or Toggle contents buttons, autoreload or background polling. Copy any unsaved drafts before reloading.
- If a document changes while you are reading it, a comment/reply/resolve/reopen using the old version is refused. Reload the Markdown tab, then select again.
- The center column is at most 1200px wide. ToC lists H1 and H2 only; deeper headings remain in the article. On desktop the ToC, article and comments scroll independently. On narrower screens the ToC appears above the article; small screens stack the comments below it.
- Drag the divider beside either side panel to adjust its width, or focus the divider and use Left/Right (Home/End for its limits). Chrome remembers these widths locally across documents and tabs. Widths are constrained to keep the article readable; narrow screens keep the stacked layout.
- A closed YAML frontmatter block at the start of a file is hidden from the article and table of contents. The original Markdown and comment anchor offsets stay unchanged.
- Open Settings from the extension icon or Chrome's extension details page. The comment panel contains no Settings button.
- The extension toolbar and Markdown tab use the existing Sideband Comments brand icon. Loading Sideband replaces any previous document favicon; disable other Markdown viewer extensions to prevent competing page rewrites.
- Local files up to 256 KiB and comment bodies up to 16,000 characters are supported. Very large comment histories may exceed Chrome Native Messaging's 1 MiB response limit; the host reports this instead of emitting a corrupt frame.
- Supported extensions: `.md`, `.markdown`, `.mdown`, `.mkdn`, `.mkd`.
- GitHub-style Markdown tables and strikethrough, Mermaid, and common code languages are supported. Unknown code languages remain readable without highlighting.
- Raw HTML is displayed as text. Diagrams use Mermaid's strict security mode. Comment bodies are displayed as text.
- There is no emoji conversion, MathJax, theme selector, remote-web-document support, comment reopen UI, browser store publication, or automatic updater.

Markdown and comments are not uploaded by Sideband Comments. Markdown can contain external links or image URLs; normal browser requests for those resources still follow Chrome's network settings. The extension only renders `file:` Markdown tabs. The local host only reads Markdown inside registered projects and writes their comment stores. Project registration is accepted from the extension settings page, never from document content.

## Troubleshooting

**The file is still plain text:** verify the extension is loaded, the file URL toggle is enabled, and the filename has a supported extension. Reload the tab. Managed Chrome policies may prohibit unpacked extensions or file URLs; those policies require your administrator's supported configuration.

**The viewer loads but comments do not:** install the native host, check that its manifest allows the ID actually shown in `chrome://extensions`, and use Settings to register the project. If the native host exits, check that the registered Node executable and checkout still exist. Rebuild and rerun the installer after moving them.

**Settings cannot connect:** both the extension and native host must come from the same checkout/build. A native host installed for another Chrome profile/product may not be found. Chrome Beta/Canary, other Chromium browsers and Windows are outside the first supported installation path.

**Comment storage is locked:** stop other writers and follow the existing Sideband store-lock guidance. Do not remove the lock while an editor or host is writing.

## Remove

Close the document tabs, remove the extension in `chrome://extensions`, then run from this checkout:

```sh
node apps/native-host/scripts/install.mjs --remove
```

This removes the Chrome registration and launcher. It preserves saved settings and all project `.comments` history. To erase the remaining local settings, remove only the `Sideband Comments` folder listed above after checking you no longer need its project/author configuration.

## Build and validation

From the repository root:

```sh
npm run typecheck
npm test
npm run build
npm run package --workspace apps/chrome
```

The archive is `apps/chrome/dist/sideband-comments-chrome.zip`. Extract it before using **Load unpacked**. The native host is installed separately using the instructions above.

For a **store upload**, use the separate packaging command:

```sh
npm run package:webstore --workspace apps/chrome
```

This produces `apps/chrome/dist/sideband-comments-chrome-webstore.zip`. It excludes the development manifest `key` and `extension-id.txt`, without changing the unpacked `dist/manifest.json`, development ZIP or existing Chrome installation. Upload this ZIP without extracting it. Packaging neither submits for review nor publishes anything.

See [store listing copy and image guidance](chrome-web-store.md) and [privacy and local data](privacy.md). Before a review submission, record the actual store ID and exact source revision used for the host, and verify a complete installation with that candidate.

Browser checks use a separately installed Chromium executable; `playwright-core` does not download a browser:

```sh
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:ui --workspace apps/chrome
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:browser --workspace apps/chrome
```

`test:ui` renders the actual built reader/settings scripts in Chromium, runs the built background authorization code through a test transport, and talks to the real bundled native-host subprocess using framed stdin/stdout. It covers Mermaid SVG output, selection, create/reply, reload persistence, the existing Python reader, stale writes, and a narrow viewport. **It does not prove that Chrome loaded the extension or found a native-host registration.**

`test:browser` additionally loads the unpacked extension and uses Chrome's actual Native Messaging API. This isolated test runs on **Linux only**, with a temporary Chromium native-host registration. It refuses macOS/Windows before launching a browser so it cannot discover or alter an existing user installation. It requires an unmanaged Chromium permitting unpacked extensions and local file access. The production installer defaults to macOS Chrome; use the manual macOS installation checks above. The cloud environment's managed Chromium blocks unpacked extensions and file URLs, so this check was blocked there. Actual macOS Chrome installation and cross-editor UI verification remain manual delivery checks.

## Reuse and licensing

The layout and workflow are inspired by [simov/markdown-viewer](https://github.com/simov/markdown-viewer). Its application code and icons are not copied. This reader uses markdown-it, Mermaid, Prism, and github-markdown-css directly. Builds emit `THIRD_PARTY_NOTICES.txt` containing the project license and notices for actual bundled code and copied styles. Keep that file with distributed extension builds.
