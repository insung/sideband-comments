# Image assets

## Current README artwork

- `readme/sideband-comments-2.0.0-hero-v4.png`: code in VS Code, the same Markdown review in Obsidian and Chrome, and an optional Claude Code integration. The three clients have equal weight; Chrome is a local Markdown reader.
- `story/v2/02-keep-the-goal-in-view.png`: repeated requests across code and documentation make the original goal harder to keep in view.
- `story/v2/04-read-code-and-docs.png`: explicit request to inspect code and related documentation, proposed edits and replies.

These are explanatory illustrations with simplified app layouts and sample code, not captures or evidence of an actual agent run. Per-image footer labels have been removed as requested; this index and the linked story carry the disclosure. The supplied work screenshots were used for layout only. Private paths, business content and account identities are not used in the active artwork.

## Active five-scene series

| File | Scene | Placement |
| --- | --- | --- |
| `story/v2/01-one-more-change.png` | Repeated quoting of code and prose | Linked story, scene 1 |
| `story/v2/02-keep-the-goal-in-view.png` | One person's original goal fades from attention | README and linked story, scene 2 |
| `story/v2/03-anchor-code-and-docs.png` | Select an actual code line or prose sentence; leave a file-bound comment in the sidebar | Linked story, scene 3 |
| `story/v2/04-read-code-and-docs.png` | Agent is asked to read code, surrounding logic and documentation, then edit and reply | README workflow and linked story, scene 4 |
| `story/v2/05-review-both-changes.png` | Person reviews both files and chooses follow-up feedback or resolution | Linked story, scene 5 |

All five PNGs and hero V4 are 1672×941. The design uses a plain light background, restrained accents, substantial headings and explanation, and a thinking person at the bottom. There are no task-checklist examples. `review-filter.ts` and `review-guide.md` have separate review threads in the same project's history. The filter example is not production source or a claim of a shipped fix. See the full [English](../review-story.md) or [Korean](../review-story.ko.md) story.

Scene 02 now shows the person resting a hand on their head with a small question mark, emphasizing uncertainty. Scene 03 adds a small exclamation mark for realization. Their copy and app composition are retained. Pre-edit sources are preserved in `story/v2/history/02-before-gesture.png` and `03-before-gesture.png`; the matching 1280×800 gallery exports have also been refreshed.

The supplied [Adobe Acrobat](https://chromewebstore.google.com/detail/efaidnbmnnnibpcajpcglclefindmkaj), [Adblock Plus](https://chromewebstore.google.com/detail/cfhdojbkjhnklbpkdaibdccddilifddb) and [Session Buddy](https://chromewebstore.google.com/detail/edacconmaakjimmfgnblocblbcdcpbko) listing images informed the headline/explanation/focused-interface structure. Their artwork and copy were not reused. Generated raster files are the source assets; editable vector masters are not supplied.

## Store artwork

The five story images have separate **1280×800 PNG upload-size exports** under `store/gallery/`, with the same filenames as `story/v2/`. Their aspect ratio is preserved by fitting the artwork to the width and extending the light background above and below. The original 1672×941 sources remain unchanged. These exports correct the upload dimensions; they remain explanatory illustrations, not actual screenshot evidence or a guarantee of store review acceptance.

| File | Dimensions | Source |
| --- | --- | --- |
| `store/icon-128.png` | 128×128 | Export from existing `apps/vscode/resources/sideband-comments-icon.png`; app source unchanged |
| `store/promo-small-440x280.png` | 440×280 | Export from `store/sources/promo-small-v1.png` |
| `store/promo-marquee-1400x560.png` | 1400×560 | Export from `store/sources/promo-marquee-v1.png` |

These existing store exports are retained; this revision replaces the README/story artwork, not the previously approved store icon or tiles. Store screenshots remain pending and separate from these illustrations. [The listing guide](../chrome-web-store.md) distinguishes the intended scenes from actual screenshot evidence. No new Sideband app capture, installation, release-note edit or publication was performed for this revision.

## Previous artwork and existing assets

- Hero concepts V1–V3 and `readme/sideband-comments-origin-story-v1.png` are retained as earlier designs, not referenced by the active READMEs.
- The five original `story/01-…05-…` images are retained as the V1 narrative. Their checklist-only examples have been superseded by `story/v2/`.
- Keep `flow.svg` and `step-1-anchored.svg` through `step-6-reply.svg`: both language versions of the agent guide still use them.
- Keep `media/release/sideband-comments-1.0.0-hero.png` and `media/release/sideband-comments-audiences.png` at their original paths as historical artwork. They are no longer embedded in the active READMEs.
- Keep the existing app brand icon as the original; store exports do not replace installed app resources.
