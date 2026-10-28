# Your code. Your docs. One review history.

[한국어](review-story.ko.md)

Sideband Comments grew out of quoting passages into Claude, asking for another revision, and losing sight of the original goal. The review can concern a line of code, a function's behavior, a paragraph, or how documentation explains that behavior.

These images use simplified layouts based on the supplied app references. They are explanatory illustrations, not screenshots or evidence of a recorded agent run. The code is a sample, not a shipped Sideband implementation. Claude Code is optional, installed separately, and runs when asked.

## 1. One more change. One more explanation.

The person quotes a line from `review-filter.ts`, pastes a paragraph from `review-guide.md`, and asks Claude to try again. A change in one file prompts another explanation in the other.

![Code and prose repeatedly quoted into Claude](assets/story/v2/01-one-more-change.png)

## 2. The changes kept coming. The goal became harder to see.

The goal is written in the guide: **Keep every review thread available.** As revisions accumulate, the person pauses: “What were we trying to achieve?” The goal has not been erased; attention has shifted toward the next small change. This portrays the author's experience, not an inevitable result of using Claude.

![One person repeats requests while the original code and documentation goal becomes harder to keep in view](assets/story/v2/02-keep-the-goal-in-view.png)

## 3. Comment on the code. Clarify the document.

In VS Code, select the code that always filters out resolved comments and leave **“Show resolved comments when the filter is off.”** In Obsidian, select “Resolved comments are hidden.” and leave **“Explain how to show them again.”** Chrome can read the same local Markdown review; it does not turn arbitrary source files into editable or selectable code-review pages.

Comments belong beside selected code or prose, not inside task checkboxes. Code and documentation have separate file-bound threads in the same project's local history. App layouts remain distinct.

![VS Code shows a selected code line and its comment; Obsidian shows a selected sentence and a separate documentation comment](assets/story/v2/03-anchor-code-and-docs.png)

## 4. Ask AI to read the code and the documentation around it.

The person explicitly asks:

> Read the code, surrounding logic and related docs. Address the comments and reply.

In this example, the agent makes the filter respect `hideResolved` and explains in the guide how to show resolved threads again. When quoted text is rewritten, the skill reattaches the thread to its replacement before replying:

> Updated the filter and its documentation. Please review both changes.

Reading surrounding code and documentation is a user request, not a guarantee of model understanding. This describes edits, not proof that tests ran or passed.

![An explicit request leads to sample code and documentation edits, reanchoring and replies](assets/story/v2/04-read-code-and-docs.png)

## 5. Review both changes. Decide what comes next.

The person inspects the code and its explanation together. The updated guide is readable in Chrome as local Markdown. The person adds **“Add an example for each setting.”** and explicitly asks the agent to continue, or resolves the thread when the review is complete. The agent does not decide that the user's review is finished.

![The person reviews source code in VS Code and local Markdown in Chrome, then leaves follow-up feedback](assets/story/v2/05-review-both-changes.png)

In another session, ask the agent to reread the same accessible files and related comment history. Stored history does not automatically transfer the previous chat or guarantee that context cannot be missed.

## Common example

Initial sample code in `review-filter.ts`:

```typescript
type Comment = { body: string; resolved: boolean };

export function filterComments(comments: Comment[]) {
  const visible = comments.filter(c => !c.resolved);
  return visible;
}
```

The proposed edit introduces a visibility choice:

```typescript
export function filterComments(comments: Comment[], hideResolved: boolean) {
  return hideResolved
    ? comments.filter(c => !c.resolved)
    : comments;
}
```

The guide begins with “Goal: Keep every review thread available.” and “Resolved comments are hidden.” Its clarification is:

> Use the resolved-comment visibility setting to show resolved threads again.

This example explains feedback on two related files. Production Sideband uses its own thread model and client-specific filtering. It does not introduce one shared Settings screen, restore deleted comments to ordinary view, or guarantee that all historical items are visible. The goal is ordinary project text, not a Sideband goal-tracking feature.

## Design and use

The revised series uses a plain background, readable headings and explanations, restrained accents, and a thinking person at the bottom. Repeated footer labels were removed; the illustrated nature is disclosed here and in the asset index. Supplied work screenshots were layout references only, with private content excluded. Chrome is shown as a local Markdown reader, without an editing toolbar or file-tree comment explorer.

The storefront references informed the headline, explanation and focused interface composition; their artwork and copy were not reused:

- [Adobe Acrobat](https://chromewebstore.google.com/detail/efaidnbmnnnibpcajpcglclefindmkaj)
- [Adblock Plus](https://chromewebstore.google.com/detail/cfhdojbkjhnklbpkdaibdccddilifddb)
- [Session Buddy](https://chromewebstore.google.com/detail/edacconmaakjimmfgnblocblbcdcpbko)

Use this series for the README and explanatory story. Store screenshot evidence remains separate. No new Sideband app captures were taken. See [asset provenance](assets/README.md) and [store scene guidance](chrome-web-store.md).
