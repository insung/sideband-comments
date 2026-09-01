import { describe, expect, it } from "vitest";
import { foldThread } from "../../core/src/index.js";
import { migrateTandemDocument, parseTandemDocument } from "../src/index.js";

const markdown = `# Note

Review this sentence.

\`\`\`tandem-comments
// Schema hint
{
  "a1f3": {
    "anchor": { "exact": "this sentence", "prefix": "Review ", "suffix": ".", "pos": 14 },
    "status": "resolved",
    "thread": [
      { "author": "insung", "ts": "2026-08-30T00:00:00Z", "text": "검토" },
      { "author": "Codex", "ts": "2026-08-30T00:01:00Z", "text": "완료" }
    ]
  }
}
\`\`\`
`;

describe("Tandem migration", () => {
  it("parses the terminal block without treating it as prose", () => {
    const parsed = parseTandemDocument(markdown);
    expect(parsed.prose).toBe("# Note\n\nReview this sentence.\n");
    expect(Object.keys(parsed.threads)).toEqual(["a1f3"]);
  });

  it("creates equivalent sideband events and clean Markdown", () => {
    const result = migrateTandemDocument("notes/example.md", markdown, () => "event-id");
    expect(result.markdown).toBe("# Note\n\nReview this sentence.\n");
    const thread = foldThread(result.eventsByThread.a1f3 ?? []);
    expect(thread.status).toBe("resolved");
    expect(thread.comments.map((comment) => comment.body)).toEqual(["검토", "완료"]);
  });
});
