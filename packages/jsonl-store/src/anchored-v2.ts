import { createEventFactory, type Actor, type QuoteAnchor, type ThreadEvent } from "@sideband-comments/core";

interface AnchoredActor {
  name: string;
  kind?: string;
}

export interface AnchoredV2Event {
  id: string;
  type: string;
  seq: number;
  ts: string;
  actor: AnchoredActor;
  [key: string]: unknown;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

export function isAnchoredV2Event(value: unknown): value is AnchoredV2Event {
  const candidate = record(value);
  const actor = record(candidate?.actor);
  return typeof candidate?.id === "string" &&
    typeof candidate.type === "string" &&
    Number.isInteger(candidate.seq) &&
    typeof candidate.ts === "string" &&
    typeof actor?.name === "string";
}

function actorOf(event: AnchoredV2Event): Actor {
  const name = event.actor.name.trim() || "unknown";
  return {
    id: name.toLocaleLowerCase().replace(/[^\p{L}\p{N}_.-]+/gu, "-"),
    name
  };
}

function anchorOf(value: unknown): QuoteAnchor | undefined {
  const anchor = record(value);
  if (typeof anchor?.text !== "string" || !anchor.text) return undefined;
  return {
    exact: anchor.text,
    prefix: typeof anchor.prefix === "string" ? anchor.prefix : "",
    suffix: typeof anchor.suffix === "string" ? anchor.suffix : "",
    position: 0
  };
}

function base(event: AnchoredV2Event, threadId: string) {
  return {
    eventId: event.id,
    threadId,
    revision: Math.max(0, event.seq - 1),
    occurredAt: event.ts,
    actor: actorOf(event)
  };
}

export function convertAnchoredV2Events(events: readonly AnchoredV2Event[], threadId: string): ThreadEvent[] {
  const sorted = [...events].sort((left, right) =>
    left.seq - right.seq || left.ts.localeCompare(right.ts) || left.id.localeCompare(right.id)
  );
  const converted: ThreadEvent[] = [];

  for (const event of sorted) {
    switch (event.type) {
      case "created": {
        const anchor = anchorOf(event.anchor);
        if (typeof event.file !== "string" || !anchor || typeof event.body !== "string") {
          throw new Error(`invalid created event ${event.id}`);
        }
        converted.push(createEventFactory.created({
          ...base(event, threadId),
          documentPath: event.file,
          anchor,
          body: event.body
        }));
        break;
      }
      case "replied":
        if (typeof event.body === "string") {
          converted.push(createEventFactory.replied({ ...base(event, threadId), body: event.body }));
        }
        break;
      case "resolved":
        converted.push(createEventFactory.resolved(base(event, threadId)));
        break;
      case "reopened":
        converted.push(createEventFactory.reopened(base(event, threadId)));
        break;
      case "reanchored": {
        const anchor = anchorOf(event.anchor);
        if (anchor) converted.push(createEventFactory.reanchored({ ...base(event, threadId), anchor }));
        break;
      }
      case "renamed":
        if (typeof event.file === "string") {
          converted.push(createEventFactory.relocated({
            ...base(event, threadId),
            documentPath: event.file
          }));
        }
        break;
      case "suggested":
        if (typeof event.patch === "string") {
          converted.push(createEventFactory.suggestionProposed({
            ...base(event, threadId),
            replacement: event.patch
          }));
        }
        break;
      case "suggestion_accepted":
        converted.push(createEventFactory.suggestionAccepted(base(event, threadId)));
        break;
      case "suggestion_rejected":
        converted.push(createEventFactory.suggestionDeclined(base(event, threadId)));
        break;
      default:
        break;
    }
  }
  return converted;
}
