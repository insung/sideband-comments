import { mkdtemp, readFile } from "node:fs/promises";
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
    const raw = await readFile(join(root, ".comments/threads/thread-1.jsonl"), "utf8");
    expect(raw.trim().split("\n")).toHaveLength(2);
  });

  it("rejects path traversal in thread ids", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-store-"));
    const repository = new JsonlThreadRepository(root);
    await expect(repository.read("../outside")).rejects.toThrow(/thread id/i);
  });
});
