---
name: sideband-comments
description: Use when the user refers to review comments left on a file or directory ("check the comments", "코멘트 확인해줘", "I left notes on that doc", "did you see my comment?") in a project containing a .comments directory, or when editing a file that has Sideband Comments anchored to it.
---

# Sideband Comments

Sideband Comments keeps review threads as append-only JSONL in `<project root>/.comments`, beside the
document. A thread is bound to a **quote of the document text**, not a line number. People write these
threads in VS Code and Obsidian; you answer them from here.

Run `python3 <this skill's directory>/scripts/sideband_comments.py` — resolve that path from where you read
this file. It finds the project root by walking up from the path you give it, so run it from
anywhere; `--root <dir>` names the project explicitly. Examples below shorten the command.

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

## Answering

```bash
sideband_comments.py --author Claude reply <thread-id> "<body>"
```

Reply only after the anchor check below — a reply on an orphaned thread points at nothing.

Pass `--author` with your own name so the reader can tell your comments from theirs. Write in the
language the comment is written in.

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
sideband_comments.py --author Claude reanchor <thread-id> --exact '<the text that replaced it>'
```

`--exact` is matched literally, whitespace and newlines included, and must occur exactly once in the
document as it now stands — so quote a whole sentence rather than a word, and copy it from the file.

**Single-quote every document quote you pass to the shell.** Prose routinely contains backticks,
`$`, and `!`, which a shell expands inside double quotes and stores wrong. Pick an anchor sentence
without a single quote in it.

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
| `--exact "…`npm run deploy`…"` in double quotes | The shell substitutes the backticks; the anchor is stored wrong |
