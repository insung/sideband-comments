import { describe, expect, it } from "vitest";
import {
  CommentService,
  foldThread,
  type Actor,
  type ThreadEvent,
  type ThreadRepository
} from "../src/index.js";

class MemoryRepository implements ThreadRepository {
  readonly events = new Map<string, ThreadEvent[]>();

  async append(event: ThreadEvent): Promise<void> {
    this.events.set(event.threadId, [...(this.events.get(event.threadId) ?? []), event]);
  }

  async readEvents(threadId: string): Promise<ThreadEvent[]> {
    return this.events.get(threadId) ?? [];
  }

  async list() {
    return [...this.events.values()].map(foldThread);
  }

  async listByDocument(documentPath: string) {
    return (await this.list()).filter((thread) => thread.documentPath === documentPath);
  }
}

describe("CommentService", () => {
  it("drives the complete editor-neutral thread lifecycle", async () => {
    const repository = new MemoryRepository();
    let id = 0;
    const actor: Actor = { id: "user", name: "User" };
    const service = new CommentService(repository, {
      actor: () => actor,
      id: () => `id-${id++}`,
      now: () => "2026-09-01T00:00:00.000Z"
    });

    const created = await service.create({
      documentPath: "docs/a.md",
      anchor: { exact: "hello", prefix: "", suffix: "", position: 0 },
      body: "first"
    });
    const replied = await service.reply(created.id, "second");
    await service.editComment(created.id, replied.comments[1]!.id, "edited second");
    await service.resolve(created.id);
    await service.reopen(created.id);
    await service.relocateDocument("docs/a.md", "docs/moved.md");
    await service.deleteComment(created.id, replied.comments[1]!.id);

    const state = foldThread(await repository.readEvents(created.id));
    expect(state.status).toBe("open");
    expect(state.documentPath).toBe("docs/moved.md");
    expect(state.comments.map((comment) => comment.body)).toEqual(["first"]);
    expect(state.revision).toBe(6);
    expect(state.deleted).toBe(false);
  });

  it("rejects blank comments", async () => {
    const service = new CommentService(new MemoryRepository(), {
      actor: () => ({ id: "user", name: "User" }),
      id: () => "id",
      now: () => "2026-09-01T00:00:00.000Z"
    });
    await expect(service.create({
      documentPath: "a.md",
      anchor: { exact: "a", prefix: "", suffix: "", position: 0 },
      body: "   "
    })).rejects.toThrow(/blank/i);
  });

  it("rejects edits for comments that do not exist", async () => {
    const repository = new MemoryRepository();
    const service = new CommentService(repository, {
      actor: () => ({ id: "user", name: "User" }),
      id: () => crypto.randomUUID(),
      now: () => "2026-09-01T00:00:00.000Z"
    });
    const thread = await service.create({
      documentPath: "a.md",
      anchor: { exact: "a", prefix: "", suffix: "", position: 0 },
      body: "first"
    });

    await expect(service.editComment(thread.id, "missing", "edited")).rejects.toThrow(/not found/i);
  });
});
