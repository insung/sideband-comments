import { SCHEMA_VERSION, type Actor, type QuoteAnchor, type ThreadEvent } from "./types.js";

interface BaseInput {
  eventId: string;
  threadId: string;
  revision: number;
  occurredAt: string;
  actor: Actor;
}

function base(input: BaseInput) {
  if (!input.eventId || !input.threadId) throw new Error("event and thread ids are required");
  if (!Number.isInteger(input.revision) || input.revision < 0) throw new Error("revision must be non-negative");
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw new Error("occurredAt must be ISO-8601 compatible");
  return { schemaVersion: SCHEMA_VERSION, ...input };
}

export const createEventFactory = {
  created(input: BaseInput & { documentPath: string; anchor: QuoteAnchor; body: string }): ThreadEvent {
    return { ...base(input), type: "thread.created", documentPath: input.documentPath, anchor: input.anchor, body: input.body };
  },
  replied(input: BaseInput & { body: string }): ThreadEvent {
    return { ...base(input), type: "comment.replied", body: input.body };
  },
  commentEdited(input: BaseInput & { commentId: string; body: string }): ThreadEvent {
    if (!input.commentId) throw new Error("comment id is required");
    return { ...base(input), type: "comment.edited", commentId: input.commentId, body: input.body };
  },
  commentDeleted(input: BaseInput & { commentId: string }): ThreadEvent {
    if (!input.commentId) throw new Error("comment id is required");
    return { ...base(input), type: "comment.deleted", commentId: input.commentId };
  },
  resolved(input: BaseInput): ThreadEvent {
    return { ...base(input), type: "thread.resolved" };
  },
  reopened(input: BaseInput): ThreadEvent {
    return { ...base(input), type: "thread.reopened" };
  },
  reanchored(input: BaseInput & { anchor: QuoteAnchor }): ThreadEvent {
    return { ...base(input), type: "thread.reanchored", anchor: input.anchor };
  },
  relocated(input: BaseInput & { documentPath: string }): ThreadEvent {
    return { ...base(input), type: "thread.relocated", documentPath: input.documentPath };
  },
  deleted(input: BaseInput): ThreadEvent {
    return { ...base(input), type: "thread.deleted" };
  },
  suggestionProposed(input: BaseInput & { replacement: string }): ThreadEvent {
    return { ...base(input), type: "suggestion.proposed", replacement: input.replacement };
  },
  suggestionAccepted(input: BaseInput): ThreadEvent {
    return { ...base(input), type: "suggestion.accepted" };
  },
  suggestionDeclined(input: BaseInput): ThreadEvent {
    return { ...base(input), type: "suggestion.declined" };
  }
};

export function isThreadEvent(value: unknown): value is ThreadEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ThreadEvent>;
  return event.schemaVersion === SCHEMA_VERSION &&
    typeof event.eventId === "string" &&
    typeof event.threadId === "string" &&
    typeof event.revision === "number" &&
    typeof event.occurredAt === "string" &&
    typeof event.type === "string" &&
    !!event.actor && typeof event.actor.id === "string" && typeof event.actor.name === "string";
}
