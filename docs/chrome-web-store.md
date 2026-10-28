# Chrome Web Store listing

Publication copy and asset guidance for Sideband Comments. This document does not indicate that the extension has been published. Review the copy against the packaged version before submitting it.

## Submission status

The publisher reported the initial 2.0.0 submission as awaiting review on 2026-10-28. That archive predates PR #13 and does not contain Chrome Reopen. The final release source includes PR #13; keep the submitted archive and final release package distinct, and update the store package through its own submission process. The copy below describes the initial submission unless noted.

## Product details

- Language: English.
- Category: Workflow & Planning.
- Official URL: leave blank until a site owned by the publisher has been verified.
- Homepage: <https://github.com/insung/sideband-comments>.
- Support: <https://github.com/insung/sideband-comments/issues>.
- Privacy policy: [Privacy and local data](privacy.md). The dashboard needs a publicly accessible URL to the version that has actually been merged; do not submit a URL that only exists in a local worktree.

## Description

Read local Markdown in Chrome and keep review comments attached to the exact text. Continue the same conversation in VS Code and Obsidian, or ask Claude Code and Codex to read and respond using the optional Sideband Comments plugin.

IMPORTANT: This version supports macOS and requires Node.js 20 or newer, a separately installed Sideband Comments Native Messaging host, and Chrome's “Allow access to file URLs” setting. Installing the extension alone does not complete setup. Read the setup guide before getting started:
https://github.com/insung/sideband-comments/blob/main/docs/chrome.md

READ AND REVIEW IN CHROME

- Read Markdown with a clean layout, table of contents, Mermaid diagrams, and syntax highlighting.
- Select a passage to start a comment thread.
- Add replies, edit or delete your own comments, and resolve discussions.
- Adjust the contents and comment panel widths to fit your workspace.
- Use Chrome independently, without keeping VS Code open.

ONE DOCUMENT. ONE CONVERSATION.

Open the same local document and comment history in Chrome, VS Code, and Obsidian. Each integration uses the same project's .comments folder. Refresh the Chrome document tab to read changes made by another tool. Sideband does not provide a cloud synchronization service.

WORK WITH YOUR AI TOOLS

With the optional Sideband Comments plugin, ask Claude Code or Codex to read review threads, make requested changes, and reply with what changed. Review the result yourself before resolving the discussion.

The Chrome extension does not include an AI assistant or call an AI service. AI tools are installed and used separately; the plugin runs when you ask.

KEEP THE REQUEST WITH THE DOCUMENT

Sideband Comments grew out of repeatedly quoting document passages into Claude, asking for one change after another, and losing sight of the original goal. Anchored comments keep the request and reply beside the text so you can review the change in context.

KEEP YOUR DOCUMENT CLEAN

Comments are stored separately in a local, append-only history. Comment actions do not insert review markup into your Markdown. An AI tool you ask to revise the document can change its contents.

Sideband Comments does not upload your documents or comments. External images in Markdown may still make normal browser requests. If you use a separate AI tool, its own data handling policies apply.

Built for reviewing technical documentation, project plans, research notes, and AI-assisted writing.

## Images and scenes

Keep publication assets under `docs/assets/`. The README hero and origin story are concept illustrations, not screenshots or proof of an installed build. Do not use the supplied private work screenshots in public assets; they are layout references only.

| Asset | Content | Intended placement |
| --- | --- | --- |
| `assets/readme/sideband-comments-2.0.0-hero-v4.png` | Code in VS Code, Markdown in Obsidian/Chrome and optional Claude Code; plain background | README representative image |
| `assets/story/v2/02-keep-the-goal-in-view.png` | Repeated code and documentation revisions obscure the original goal | README origin story |
| `assets/store/icon-128.png` | 128×128 derivative of the existing Sideband brand icon | Store icon |
| `assets/store/promo-small-440x280.png` | Brand icon and anchored-comment motif, no text | Store promotional tile |
| `assets/store/promo-marquee-1400x560.png` | AI reply attached to a document connected to the three clients | Store marquee |

Promotional source renders are retained in `assets/store/sources/`. These are raster source images, not editable vector masters. Earlier hero concepts remain as design history and are not the README's active image. See [the asset index](assets/README.md) for provenance and existing-image handling.

For the five-scene conceptual origin story, see [the English story](review-story.md) or [한국어 이야기](review-story.ko.md). Its illustrations are for explanation, not substitutes for screenshot evidence. The existing icon and promotional tiles are reused.

The store's actual-use scene candidates are the following four views. These are scene specifications, not fabricated evidence of a real agent run:

1. **Attach a request:** in Chrome, select a passage in `review-plan.md` and comment “Please specify the required checks.” Show Contents, document, selected quote and thread together.
2. **Continue in another tool:** open that same Markdown document and thread in VS Code and Obsidian. Preserve each app's own layout with the same prose, quotation and replies. Related source-code feedback belongs in VS Code on its own file, not in a Chrome code block or a task checkbox.
3. **Ask the agent:** in Claude Code, explicitly ask it to read the related code, documentation and review threads and make the requested changes. Show the actual reading, edits and replies when real evidence is available. Label the integration as optional and installed separately.
4. **Review the result:** inspect code changes in VS Code and refresh Chrome to inspect the local Markdown and agent reply. The person decides whether to resolve. Do not portray the agent automatically resolving on the user's behalf.

Google requires at least one screenshot, with up to five allowed, at 1280×800 or 640×400. Its image guide says screenshots should demonstrate the actual user experience, and its listing policy prohibits misleading metadata. It does not explicitly guarantee acceptance of generated lookalikes. Use concept illustrations for the README and promotional artwork. An actual public-safe Chrome screenshot was recommended before submission; the publisher submitted the listing without authorizing a new capture. Additional scenes can be explained with concept artwork outside the screenshot evidence. No new app capture has been authorized yet.

## Permissions and review preparation

- `nativeMessaging`: communicate with the separately registered local host to read project Markdown and append comment events. The extension does not use this permission to contact an AI service.
- `storage`: remember reader preferences such as resolved-thread visibility and panel widths. Project roots and author settings belong to the local host configuration.
- `file:///*`: recognize supported local Markdown tabs. Chrome's file URL access must be enabled by the user. The host independently restricts file access to registered project roots.

The scope is local Markdown, not arbitrary web pages. Review the final dashboard privacy answers against [the policy](privacy.md) and actual behavior; this document does not automatically fill in declarations.

For reviewer instructions, supply the final extension ID and the exact candidate source commit or host distribution being reviewed. Follow [Chrome installation](chrome.md), register a disposable project, open its Markdown, then create a comment, reply, reload and verify persistence. Include a path to uninstall the host while retaining comments. No account is required by the extension; optional third-party AI tools have their own requirements.

## Sources

- [Listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [Listing policy](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
- [Publish and deferred publication](https://developer.chrome.com/docs/webstore/publish)

Checked on 2026-10-28. The Chrome Web Store dashboard and review decision remain authoritative.
