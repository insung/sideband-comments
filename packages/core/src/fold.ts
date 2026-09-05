import type { ThreadComment, ThreadCreatedEvent, ThreadEvent, ThreadState } from "./types.js";

function compareEvents(a: ThreadEvent, b: ThreadEvent): number {
  return a.revision - b.revision || a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId);
}

export function foldThread(input: readonly ThreadEvent[]): ThreadState {
  const unique = new Map<string, ThreadEvent>();
  for (const event of input) unique.set(event.eventId, event);
  const events = [...unique.values()].sort(compareEvents);
  const created = events.find((event): event is ThreadCreatedEvent => event.type === "thread.created");
  if (!created) throw new Error("thread.created event is required");
  if (events.some((event) => event.threadId !== created.threadId)) {
    throw new Error("cannot fold events from different threads");
  }

  const comments: ThreadComment[] = [{
    id: created.eventId,
    author: created.actor,
    createdAt: created.occurredAt,
    body: created.body
  }];
  const deletedCommentIds = new Set<string>();
  const state: ThreadState = {
    id: created.threadId,
    documentPath: created.documentPath,
    originalAnchor: created.anchor,
    anchor: created.anchor,
    status: "open",
    deleted: false,
    comments,
    revision: created.revision,
    updatedAt: created.occurredAt
  };

  for (const event of events) {
    if (event.eventId === created.eventId || event.type === "thread.created") continue;
    state.revision = Math.max(state.revision, event.revision);
    if (event.occurredAt > state.updatedAt) state.updatedAt = event.occurredAt;
    switch (event.type) {
      case "comment.replied":
        state.comments.push({ id: event.eventId, author: event.actor, createdAt: event.occurredAt, body: event.body });
        break;
      case "comment.deleted":
        deletedCommentIds.add(event.commentId);
        break;
      case "thread.resolved":
        state.status = "resolved";
        break;
      case "thread.reopened":
        state.status = "open";
        break;
      case "thread.reanchored":
        state.anchor = event.anchor;
        break;
      case "thread.relocated":
        state.documentPath = event.documentPath;
        break;
      case "thread.deleted":
        state.deleted = true;
        break;
      case "suggestion.proposed":
        state.suggestion = {
          replacement: event.replacement,
          author: event.actor,
          createdAt: event.occurredAt
        };
        break;
      case "suggestion.accepted":
        if (state.suggestion) state.suggestion.result = "accepted";
        break;
      case "suggestion.declined":
        if (state.suggestion) state.suggestion.result = "declined";
        break;
    }
  }
  state.comments = state.comments.filter((comment) => !deletedCommentIds.has(comment.id));
  return state;
}
