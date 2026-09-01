import { describe, expect, it } from "vitest";
import {
  createEventFactory,
  foldThread,
  type Actor,
  type ThreadEvent
} from "../src/index.js";

const actor: Actor = { id: "insung", name: "insung" };
const at = "2026-09-01T00:00:00.000Z";

describe("thread event fold", () => {
  it("folds replies, resolved state, reanchor and relocation", () => {
    const events: ThreadEvent[] = [
      createEventFactory.created({
        eventId: "e0",
        threadId: "t1",
        revision: 0,
        occurredAt: at,
        actor,
        documentPath: "docs/old.md",
        anchor: { exact: "old", prefix: "", suffix: "", position: 0 },
        body: "검토해줘"
      }),
      createEventFactory.replied({
        eventId: "e1",
        threadId: "t1",
        revision: 1,
        occurredAt: at,
        actor,
        body: "확인했어"
      }),
      createEventFactory.resolved({ eventId: "e2", threadId: "t1", revision: 2, occurredAt: at, actor }),
      createEventFactory.relocated({
        eventId: "e3",
        threadId: "t1",
        revision: 3,
        occurredAt: at,
        actor,
        documentPath: "docs/new.md"
      }),
      createEventFactory.reanchored({
        eventId: "e4",
        threadId: "t1",
        revision: 4,
        occurredAt: at,
        actor,
        anchor: { exact: "new", prefix: "", suffix: "", position: 5 }
      })
    ];

    const thread = foldThread(events);
    expect(thread.status).toBe("resolved");
    expect(thread.documentPath).toBe("docs/new.md");
    expect(thread.anchor.exact).toBe("new");
    expect(thread.comments.map((comment) => comment.body)).toEqual(["검토해줘", "확인했어"]);
  });

  it("is deterministic for merged logs and ignores duplicate event ids", () => {
    const created = createEventFactory.created({
      eventId: "created",
      threadId: "t1",
      revision: 0,
      occurredAt: at,
      actor,
      documentPath: "README.md",
      anchor: { exact: "text", prefix: "", suffix: "", position: 0 },
      body: "first"
    });
    const replyA = createEventFactory.replied({
      eventId: "a",
      threadId: "t1",
      revision: 1,
      occurredAt: "2026-09-01T00:00:02.000Z",
      actor,
      body: "A"
    });
    const replyB = createEventFactory.replied({
      eventId: "b",
      threadId: "t1",
      revision: 1,
      occurredAt: "2026-09-01T00:00:01.000Z",
      actor,
      body: "B"
    });

    const first = foldThread([replyA, created, replyB, replyA]);
    const second = foldThread([replyB, replyA, created]);
    expect(first).toEqual(second);
    expect(first.comments.map((comment) => comment.body)).toEqual(["first", "B", "A"]);
  });
});
