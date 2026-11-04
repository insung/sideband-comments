import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonlThreadRepository } from "@sideband-comments/jsonl-store";
import { handle, type ViewThread } from "../bridge/src/handler.js";

let root: string;
const author = "Bruce Hwang";
const text = "# 안내 😀\n\n즉시 배포한다.\n\n롤백은 즉시 한다.\n";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sideband-intellij-"));
  await mkdir(join(root, "docs"));
  await writeFile(join(root, "docs/guide.md"), text);
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function create(start: number, end: number, body = "언제인가?"): Promise<ViewThread> {
  return await handle({ type: "thread.create", root, path: "docs/guide.md", text, start, end, body, author }) as ViewThread;
}

describe("IntelliJ bridge", () => {
  it("TC-02-1 writes events the shared repository reads back", async () => {
    const start = text.indexOf("배포");
    const created = await create(start, start + 2);
    expect(created).toMatchObject({ documentPath: "docs/guide.md", status: "open", quote: "배포", anchorState: "resolved", start, end: start + 2 });
    expect(created.comments[0]).toMatchObject({ authorName: author, body: "언제인가?" });

    await handle({ type: "thread.reply", root, threadId: created.id, body: "확인함", author: "Codex" });
    await handle({ type: "thread.resolve", root, threadId: created.id, author });
    const edited = await handle({ type: "comment.edit", root, threadId: created.id, commentId: created.comments[0]!.id, body: "언제 배포하나?", author }) as ViewThread;
    expect(edited.comments.map((c) => c.body)).toEqual(["언제 배포하나?", "확인함"]);

    const stored = await new JsonlThreadRepository(root).read(created.id);
    expect(stored).toMatchObject({ status: "resolved", documentPath: "docs/guide.md" });
    expect(stored!.comments.map((c) => c.author)).toEqual([{ id: "bruce-hwang", name: author }, { id: "codex", name: "Codex" }]);

    const reopened = await handle({ type: "thread.reopen", root, threadId: created.id, author }) as ViewThread;
    expect(reopened.status).toBe("open");
    const deleted = await handle({ type: "comment.delete", root, threadId: created.id, commentId: created.comments[0]!.id, author }) as ViewThread;
    expect(deleted.comments.map((c) => c.body)).toEqual(["확인함"]);
  });

  it("TC-01-1 reports anchor state against the editor text", async () => {
    const second = text.lastIndexOf("즉시");
    const thread = await create(second, second + 2);
    const listed = await handle({ type: "document.threads", root, path: "docs/guide.md", text, includeResolved: true }) as { threads: ViewThread[] };
    expect(listed.threads[0]).toMatchObject({ id: thread.id, anchorState: "resolved", start: second });

    const rewritten = text;
    const changed = await handle({ type: "document.threads", root, path: "docs/guide.md", text: rewritten.replace(/즉시/g, "곧"), includeResolved: true }) as { threads: ViewThread[] };
    expect(changed.threads[0]).toMatchObject({ anchorState: "orphaned" });
    expect(changed.threads[0]!.start).toBeUndefined();
  });

  it("TC-01-2 uses UTF-16 offsets so emoji and Hangul ranges match the editor", async () => {
    const start = text.indexOf("배포");
    const thread = await create(start, start + 4);
    expect(thread.quote).toBe("배포한다");
    expect(text.slice(thread.start!, thread.end!)).toBe("배포한다");
  });

  it("re-anchors to a new selection", async () => {
    const thread = await create(text.indexOf("배포"), text.indexOf("배포") + 2);
    const next = text.indexOf("롤백");
    const moved = await handle({ type: "thread.reanchor", root, threadId: thread.id, path: "docs/guide.md", text, start: next, end: next + 2, author }) as ViewThread;
    expect(moved).toMatchObject({ quote: "롤백", originalQuote: "배포", start: next });
  });

  it("lists project threads with missing-file and resolved filter", async () => {
    const thread = await create(text.indexOf("배포"), text.indexOf("배포") + 2);
    await handle({ type: "thread.resolve", root, threadId: thread.id, author });
    expect((await handle({ type: "project.threads", root, includeResolved: false }) as { threads: ViewThread[] }).threads).toEqual([]);
    await rm(join(root, "docs/guide.md"));
    const all = await handle({ type: "project.threads", root, includeResolved: true }) as { threads: ViewThread[] };
    expect(all.threads[0]).toMatchObject({ id: thread.id, anchorState: "missing-file" });
  });

  it("TC-02-2 rejects invalid requests with a message", async () => {
    await expect(create(0, 1, "  ")).rejects.toThrow("comment body cannot be blank");
    await expect(handle({ type: "thread.reply", root, threadId: "nope", body: "x", author })).rejects.toThrow("thread not found");
    await expect(handle({ type: "document.threads", root, path: "../outside.md", text, includeResolved: true })).rejects.toThrow("relative to the workspace root");
    await expect(handle({ type: "thread.create", root, path: "docs/guide.md", text, start: 3, end: 3, body: "x", author })).rejects.toThrow(RangeError);
    await expect(handle({ type: "bogus" })).rejects.toThrow("Unknown request");
    await expect(handle({ type: "project.threads", root: "relative/root", includeResolved: true })).rejects.toThrow("absolute");
  });

  it("keeps serving line-delimited requests after an error", async () => {
    await writeFile(join(root, "probe.txt"), "");
    const entry = join(root, "bridge.cjs");
    execFileSync(resolvePath("node_modules/.bin/esbuild"), ["apps/intellij/bridge/src/main.ts", "--bundle", "--platform=node", "--format=cjs", `--outfile=${entry}`], { stdio: "pipe" });
    const child = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "inherit"] });
    const lines: string[] = [];
    let buffer = "";
    const done = new Promise<void>((resolve) => child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) { lines.push(buffer.slice(0, index)); buffer = buffer.slice(index + 1); }
      if (lines.length === 2) resolve();
    }));
    child.stdin.write("{not json\n");
    child.stdin.write(JSON.stringify({ id: 7, type: "project.threads", root, includeResolved: true }) + "\n");
    await done;
    child.kill();
    expect(JSON.parse(lines[0]!)).toMatchObject({ id: null, ok: false });
    expect(JSON.parse(lines[1]!)).toEqual({ id: 7, ok: true, result: { threads: [] } });
    expect(await readFile(join(root, "probe.txt"), "utf8")).toBe("");
  }, 20000);
});
