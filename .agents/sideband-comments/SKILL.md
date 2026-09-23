---
name: sideband-comments
description: Use when the user refers to review comments left on a file or directory ("check the comments", "코멘트 확인해줘", "I left notes on that doc", "did you see my comment?") in a project containing a .comments directory, when editing a file that has Sideband Comments anchored to it, or when asked to leave review findings as comments instead of editing ("코멘트로 남겨줘", "leave your review as comments").
---

# Sideband Comments

Sideband Comments keeps review threads as append-only JSONL in `<project root>/.comments`, beside the
document. A thread is bound to a **quote of the document text**, not a line number. People write these
threads in VS Code and Obsidian. From here you answer them — and, when asked or when a review harness
hands you findings, you start them.

Run `python3 <this skill's directory>/scripts/sideband_comments.py` — resolve that path from where you read
this file. `list` finds the project root by walking up from the path you give it. The commands that
write, `create`, `reply` and `reanchor`, require `--root <project-root>` so they cannot select a different
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

## Creating

Start a thread only when one of these holds:

- The reader asked you to leave your review as comments instead of editing the file.
- A review harness (the MI delivery harness, or an adapter like it) hands you final findings to publish.

| Do not create when | Why |
|---|---|
| The point is style or taste | Threads are for clarity and correctness, not preference |
| An open thread already raises the same problem at that place | Reply on it; two threads split one conversation |
| You are about to fix the problem yourself | Fix it. A thread you orphan a minute later helps nobody |
| Another review round is still to come | Your threads become the next reviewer's input and get echoed back |

```bash
sideband_comments.py --root <project-root> --author "MI Delivery Harness" \
  create docs/guide.md --line 12 --body-file <body-file>            # quote line 12
sideband_comments.py --root <project-root> --author "MI Delivery Harness" \
  create docs/guide.md --line 12-14 --body-file <body-file>         # quote lines 12 to 14
sideband_comments.py --root <project-root> --author "MI Delivery Harness" \
  create docs/guide.md --exact-file <quote-file> --body-file <body-file>
sideband_comments.py --root <project-root> --author "MI Delivery Harness" \
  create --batch-file <requests.json> --json
```

The path is relative to `--root`. `--line` quotes the line's text with surrounding whitespace trimmed;
a Markdown paragraph is usually one line, so this quotes the whole paragraph. Use `--exact-file` for a
sentence inside it. The quote must be one the document can tell apart: `--line` refuses a line whose
twin has the same surrounding text, and an exact quote must occur exactly once.

`--batch-file` takes a JSON array. Each request has `path`, `body`, and either `line` (`12` or
`{"start": 12, "end": 14}`) or `exact`:

```json
[
  {"path": "docs/guide.md", "line": 12, "body": "[unclear-wording] CLEAR-003\n\n..."},
  {"path": "docs/guide.md", "exact": "a sentence that occurs once", "body": "..."}
]
```

Every request is checked before anything is written — the file is under the root, the line is in
range and not blank, the quote is unambiguous, the body is not empty. One failure creates no thread,
and stderr names each failing request by index. That guarantee covers validation only: a process
killed or a disk error mid-write is not rolled back. `--json` prints `index`, `threadId`,
`documentPath` and `quoted` per thread so the caller can record them.

Write the body for the person who opens the editor: what is wrong, why it matters, what to do. When
the finding came from a reviewer, put its category and id on the first line
(`[unclear-wording] CLEAR-003`) and the reviewer's name in the body. `--author` names who writes the
event: a harness passes its own name, not the reviewer's, because the reviewer never touched the store.

Two flows — do not mix them:

- **Publishing findings.** Create the threads after the final review round and leave the document
  alone. The reader picks them up in the editor.
- **Answering the reader.** Edit, `list`, `reanchor` the orphans, `reply`. Never create a thread for
  a problem you are fixing in the same pass.

The project must already have a `.comments` directory; the tool does not start a store.

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
they ask you to close one, tell them to resolve it in VS Code or Obsidian. You may start threads; you
still never resolve, reopen or delete them.

## Common mistakes

| Mistake | What happens |
|---|---|
| Editing the JSONL, or copying the project's `dist/` to script against it | Broken revisions and ids; the editors reject or mis-fold the thread |
| Replying first, then editing the quoted text | The thread orphans and your reply points at nothing |
| Re-anchoring with `--exact "deploy"` | It occurs many times; the tool refuses. Quote the sentence |
| Reporting the fix only in chat | The reader is in their editor, not your terminal, and never sees it |
| Passing generated text directly in a shell command | Quotes or substitutions change or execute the text; use a UTF-8 input file |
| Creating a thread, then rewriting the quoted line in the same pass | The thread orphans at once; either fix the text or leave the comment, not both |
| Passing the reviewer's name as `--author` when a harness writes the event | The store then says someone wrote who never did; name the harness, put the reviewer in the body |
| Publishing findings between review rounds | The next reviewer reads your threads as input and echoes them |
