---
name: sideband-comments
description: Use when the user refers to review comments left on a file or directory ("check the comments", "코멘트 확인해줘", "I left notes on that doc", "did you see my comment?") in a project containing a .comments directory, or when editing a file that has Sideband Comments anchored to it.
---

# Sideband Comments

Sideband Comments keeps review threads as append-only JSONL in `<project root>/.comments`, beside the
document. A thread is bound to a **quote of the document text**, not a line number. People write these
threads in VS Code and Obsidian; you answer them from here.

Run `python3 <this skill's directory>/scripts/sideband_comments.py` — resolve that path from where you read
this file. `list` finds the project root by walking up from the path you give it. The commands that
write, `reply` and `reanchor`, require `--root <project-root>` so they cannot select a different
comment store from the current working directory. Examples below shorten the command.

Read `.comments/*.jsonl` if you are curious, but **never write it by hand and never import the
project's TypeScript to do it.** The events carry ids, per-thread revisions, a store lock and
quoted-text anchors; this tool is the only supported way in.

## Reading

```bash
sideband_comments.py list docs/guide.md          # a file, or a directory
sideband_comments.py list --json --open-only docs/
```

Every thread reports an `anchor` state:

| State | Meaning |
|---|---|
| `resolved` | The quote is in the document; the comment points at it |
| `ambiguous` | The quote occurs several times and context cannot separate them |
| `orphaned` | The quote is gone — an edit removed or rewrote it |
| `missing-file` | The document no longer exists at the stored path |

`anchor=resolved` means the quote is attached. It does not mean the review thread is closed; thread
status is reported separately as `open` or `resolved`.

## Answering

```bash
sideband_comments.py --root <project-root> --author Codex \
  reply <thread-id> --body-file <reply-file>
```

Reply only when the thread is `open` and its anchor is `resolved`. The tool refuses deleted or
closed threads and `orphaned`, `ambiguous`, or `missing-file` anchors.

Pass `--author` with your own name so the reader can tell your comments from theirs. Write in the
language the comment is written in. If the latest comment is already yours and the reader has not
added another comment, do not repeat the reply.

**The reply is two or three sentences, in this order: what you changed, then anything you could not
settle.** That is the whole reply. The reader has the diff and wrote the comment — they need neither
restated. If a thread needs no change to the document, say so first and why.

When a comment asks for something the project gives you no way to verify, make the smallest change
the comment justifies and name the unverified part in the reply. Do not invent specifics — roles and
steps you cannot check belong in the reply as open questions, not in the document as fact.

## After you edit the document

Rewriting the quoted text orphans its thread, and a reply on an orphaned thread points at nothing.
Run this loop every time you edit a commented file — do not wait for an error to remind you:

1. Edit the document.
2. `sideband_comments.py list docs/guide.md` — read the `anchor` state of every thread.
3. For each `orphaned` thread, `reanchor` it to the text that took the old text's place.
4. `list` again and confirm every thread reads `resolved`.
5. Then `reply`.

```bash
sideband_comments.py --root <project-root> --author Codex \
  reanchor <thread-id> --exact-file <anchor-file>
```

The UTF-8 anchor file is matched literally, whitespace and newlines included, and must occur exactly
once in the document as it now stands — so copy a whole sentence rather than a word. Pass `-` as the
file name to read from stdin when the execution environment can supply stdin without shell
interpolation.

Use `--body-file` and `--exact-file` for generated text. Do not interpolate reader or document text
into a shell command: prose routinely contains backticks, `$`, `!`, and quotes that a shell can
expand or execute. The direct `body` and `--exact` forms remain available for simple manual use.

## Leave the thread open

Only the person who wrote a comment decides it is answered, so the tool has no `resolve` command. If
they ask you to close one, tell them to resolve it in VS Code or Obsidian.

## Common mistakes

| Mistake | What happens |
|---|---|
| Editing the JSONL, or copying the project's `dist/` to script against it | Broken revisions and ids; the editors reject or mis-fold the thread |
| Replying first, then editing the quoted text | The thread orphans and your reply points at nothing |
| Re-anchoring with `--exact "deploy"` | It occurs many times; the tool refuses. Quote the sentence |
| Reporting the fix only in chat | The reader is in their editor, not your terminal, and never sees it |
| Passing generated text directly in a shell command | Quotes or substitutions change or execute the text; use a UTF-8 input file |
