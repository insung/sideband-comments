import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlThreadRepository } from "../../jsonl-store/src/index.js";
import { migrateFile } from "../src/index.js";

const markdown = `Text to review.

\`\`\`tandem-comments
{
  "abcd": {
    "anchor": { "exact": "review", "prefix": "Text to ", "suffix": ".", "pos": 8 },
    "status": "open",
    "thread": [{ "author": "User", "ts": "2026-09-01T00:00:00Z", "text": "Check" }]
  }
}
\`\`\`
`;

describe("file migration", () => {
  it("is dry-run by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-migrate-"));
    const file = join(root, "note.md");
    await writeFile(file, markdown);

    const result = await migrateFile(root, file);
    expect(result).toMatchObject({ threadCount: 1, written: false });
    expect(await readFile(file, "utf8")).toBe(markdown);
    expect(await new JsonlThreadRepository(root).list()).toEqual([]);
  });

  it("writes sidecars before cleaning Markdown and is safe to rerun", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-migrate-"));
    const file = join(root, "note.md");
    await writeFile(file, markdown);

    const first = await migrateFile(root, file, { write: true });
    const second = await migrateFile(root, file, { write: true });
    const threads = await new JsonlThreadRepository(root).list();

    expect(first).toMatchObject({ threadCount: 1, written: true });
    expect(second).toMatchObject({ threadCount: 0, written: false });
    expect(await readFile(file, "utf8")).toBe("Text to review.\n");
    expect(threads).toHaveLength(1);
    expect(threads[0]?.comments).toHaveLength(1);
  });
});
