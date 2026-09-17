import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
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
    const bundles = await readdir(repository.documentsDirectory);
    expect(bundles).toHaveLength(1);
    const raw = await readFile(join(repository.documentsDirectory, bundles[0]!), "utf8");
    expect(raw.trim().split("\n")).toHaveLength(3);
  });

  it("keeps every thread of one document in a single bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-bundle-"));
    const repository = new JsonlThreadRepository(root);
    const create = (threadId: string, documentPath: string) => repository.append(createEventFactory.created({
      eventId: `created-${threadId}`,
      threadId,
      revision: 0,
      occurredAt: "2026-09-01T00:00:00.000Z",
      actor,
      documentPath,
      anchor: { exact: "hello", prefix: "", suffix: "", position: 0 },
      body: "comment"
    }));

    await create("thread-a", "docs/one.md");
    await create("thread-b", "docs/one.md");
    await create("thread-c", "docs/two.md");

    expect(await readdir(repository.documentsDirectory)).toHaveLength(2);
    expect((await repository.listByDocument("docs/one.md")).map((thread) => thread.id).sort())
      .toEqual(["thread-a", "thread-b"]);
  });

  it("ignores a duplicate append instead of doubling the log", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-duplicate-"));
    const repository = new JsonlThreadRepository(root);
    const created = createEventFactory.created({
      eventId: "created",
      threadId: "thread-1",
      revision: 0,
      occurredAt: "2026-09-01T00:00:00.000Z",
      actor,
      documentPath: "docs/one.md",
      anchor: { exact: "hello", prefix: "", suffix: "", position: 0 },
      body: "comment"
    });

    await repository.append(created);
    await repository.append(created);

    expect(await repository.readEvents("thread-1")).toHaveLength(1);
  });

  it("migrates legacy per-thread files into document bundles without losing events", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-migrate-"));
    const repository = new JsonlThreadRepository(root);
    await mkdir(repository.threadsDirectory, { recursive: true });
    const legacy = createEventFactory.created({
      eventId: "created",
      threadId: "thread-legacy",
      revision: 0,
      occurredAt: "2026-09-01T00:00:00.000Z",
      actor,
      documentPath: "docs/one.md",
      anchor: { exact: "hello", prefix: "", suffix: "", position: 0 },
      body: "comment"
    });
    await writeFile(repository.threadFile("thread-legacy"), `${JSON.stringify(legacy)}\n`);

    expect((await repository.listByDocument("docs/one.md"))[0]?.id).toBe("thread-legacy");

    const result = await repository.migrateLegacy();

    expect(result.removedFiles).toBe(1);
    expect(result.documentFiles).toBe(1);
    expect(await readdir(repository.threadsDirectory)).toEqual([]);
    expect((await repository.listByDocument("docs/one.md"))[0]?.id).toBe("thread-legacy");
  });

  it("hides deleted threads from list unless asked for them", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-hidden-"));
    const repository = new JsonlThreadRepository(root);
    await repository.append(createEventFactory.created({
      eventId: "created",
      threadId: "thread-1",
      revision: 0,
      occurredAt: "2026-09-01T00:00:00.000Z",
      actor,
      documentPath: "docs/one.md",
      anchor: { exact: "hello", prefix: "", suffix: "", position: 0 },
      body: "comment"
    }));
    await repository.append(createEventFactory.commentDeleted({
      eventId: "deleted",
      threadId: "thread-1",
      revision: 1,
      occurredAt: "2026-09-01T00:01:00.000Z",
      actor,
      commentId: "created"
    }));

    expect(await repository.list()).toEqual([]);
    expect((await repository.list(true)).map((thread) => thread.id)).toEqual(["thread-1"]);
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
