import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventFactory, type Actor } from "../../core/src/index.js";
import { JsonlThreadRepository } from "../src/index.js";

const actor: Actor = { id: "tester", name: "Tester" };

describe("JsonlThreadRepository", () => {
  it("appends one event per line and finds threads by current path", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-store-"));
    const repository = new JsonlThreadRepository(root);
    const created = createEventFactory.created({
      eventId: "created",
      threadId: "thread-1",
      revision: 0,
      occurredAt: "2026-09-01T00:00:00.000Z",
      actor,
      documentPath: "docs/old.md",
      anchor: { exact: "hello", prefix: "", suffix: "", position: 0 },
      body: "comment"
    });
    await repository.append(created);
    await repository.append(createEventFactory.relocated({
      eventId: "moved",
      threadId: "thread-1",
      revision: 1,
      occurredAt: "2026-09-01T00:01:00.000Z",
      actor,
      documentPath: "docs/new.md"
    }));

    expect(await repository.listByDocument("docs/old.md")).toEqual([]);
    expect((await repository.listByDocument("docs/new.md"))[0]?.id).toBe("thread-1");
    await repository.append(createEventFactory.commentDeleted({
      eventId: "deleted",
      threadId: "thread-1",
      revision: 2,
      occurredAt: "2026-09-01T00:02:00.000Z",
      actor,
      commentId: "created"
    }));
    expect(await repository.listByDocument("docs/new.md")).toEqual([]);
    expect((await repository.read("thread-1"))?.comments).toEqual([]);
    const raw = await readFile(join(root, ".comments/threads/thread-1.jsonl"), "utf8");
    expect(raw.trim().split("\n")).toHaveLength(3);
  });

  it("rejects path traversal in thread ids", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-store-"));
    const repository = new JsonlThreadRepository(root);
    await expect(repository.read("../outside")).rejects.toThrow(/thread id/i);
  });

  it("reads Anchored Comments v2 logs and can continue them with Sideband events", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-legacy-store-"));
    const repository = new JsonlThreadRepository(root);
    await mkdir(repository.threadsDirectory, { recursive: true });
    await writeFile(repository.threadFile("th_legacy"), [
      JSON.stringify({
        id: "ev_created", type: "created", seq: 1, ts: "2026-08-30T00:00:00.000Z",
        actor: { name: "insung", kind: "human" }, version: 2, file: "src/old.ts",
        anchor: {
          baseline: null, start: { line: 2, char: 0 }, end: { line: 2, char: 5 },
          text: "hello", prefix: "before ", suffix: " after"
        },
        body: "first", commentId: "c_1"
      }),
      JSON.stringify({
        id: "ev_reply", type: "replied", seq: 2, ts: "2026-08-30T00:01:00.000Z",
        actor: { name: "Codex", kind: "agent" }, body: "second", commentId: "c_2"
      }),
      JSON.stringify({
        id: "ev_anchor", type: "reanchored", seq: 3, ts: "2026-08-30T00:02:00.000Z",
        actor: { name: "Codex", kind: "agent" },
        anchor: {
          baseline: null, start: { line: 4, char: 0 }, end: { line: 4, char: 7 },
          text: "updated", prefix: "new ", suffix: " context"
        }
      }),
      JSON.stringify({
        id: "ev_renamed", type: "renamed", seq: 4, ts: "2026-08-30T00:03:00.000Z",
        actor: { name: "Codex", kind: "agent" }, file: "src/new.ts"
      }),
      JSON.stringify({
        id: "ev_resolved", type: "resolved", seq: 5, ts: "2026-08-30T00:04:00.000Z",
        actor: { name: "insung", kind: "human" }, reason: "fixed"
      })
    ].join("\n") + "\n");

    const legacy = await repository.read("th_legacy");
    expect(legacy).toMatchObject({
      id: "th_legacy",
      documentPath: "src/new.ts",
      status: "resolved",
      anchor: { exact: "updated", prefix: "new ", suffix: " context" }
    });
    expect(legacy?.comments.map((comment) => [comment.author.name, comment.body])).toEqual([
      ["insung", "first"],
      ["Codex", "second"]
    ]);

    await repository.append(createEventFactory.reopened({
      eventId: "sideband_reopen",
      threadId: "th_legacy",
      revision: 5,
      occurredAt: "2026-08-30T00:05:00.000Z",
      actor
    }));
    expect((await repository.read("th_legacy"))?.status).toBe("open");
  });
});
