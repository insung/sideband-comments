import { createEventFactory, type Actor, type QuoteAnchor, type ThreadEvent } from "@sideband-comments/core";

interface TandemComment {
  author: string;
  ts: string;
  text: string;
}

interface TandemThread {
  anchor: { exact: string; prefix?: string; suffix?: string; pos?: number };
  status?: "open" | "resolved";
  thread: TandemComment[];
  suggestion?: { replacement: string; author: string; ts: string; result?: "accepted" | "declined" };
}

export interface ParsedTandemDocument {
  prose: string;
  trailing: string;
  threads: Record<string, TandemThread>;
}

const OPEN = "```tandem-comments";

export function parseTandemDocument(raw: string): ParsedTandemDocument {
  const openStart = raw.lastIndexOf(OPEN);
  if (openStart < 0 || (openStart > 0 && raw[openStart - 1] !== "\n")) {
    return { prose: raw, trailing: "", threads: {} };
  }
  const bodyStart = openStart + OPEN.length;
  if (raw[bodyStart] !== "\n") throw new Error("tandem-comments opening fence must end at the line boundary");
  const closeStart = raw.indexOf("\n```", bodyStart + 1);
  if (closeStart < 0) throw new Error("tandem-comments block is not closed");
  const closeLineEnd = raw.indexOf("\n", closeStart + 4);
  const trailing = closeLineEnd < 0 ? "" : raw.slice(closeLineEnd + 1);
  const body = raw.slice(bodyStart + 1, closeStart);
  const json = body.split("\n").filter((line) => !line.trimStart().startsWith("//")).join("\n").trim();
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("tandem-comments body must be an object");
  const before = raw.slice(0, openStart).replace(/\n$/, "");
  return { prose: before, trailing, threads: parsed as Record<string, TandemThread> };
}

function actor(name: string): Actor {
  const normalized = name.trim() || "unknown";
  return { id: normalized.toLocaleLowerCase().replace(/[^\p{L}\p{N}_.-]+/gu, "-"), name: normalized };
}

function anchorOf(value: TandemThread["anchor"]): QuoteAnchor {
  return {
    exact: value.exact,
    prefix: value.prefix ?? "",
    suffix: value.suffix ?? "",
    position: value.pos ?? 0
  };
}

export interface TandemMigration {
  markdown: string;
  eventsByThread: Record<string, ThreadEvent[]>;
}

export function migrateTandemDocument(
  documentPath: string,
  raw: string,
  eventId: () => string = () => crypto.randomUUID()
): TandemMigration {
  const parsed = parseTandemDocument(raw);
  const eventsByThread: Record<string, ThreadEvent[]> = {};
  let counter = 0;
  const nextId = () => `${eventId()}-${counter++}`;

  for (const [threadId, tandem] of Object.entries(parsed.threads)) {
    if (!Array.isArray(tandem.thread) || tandem.thread.length === 0) continue;
    const first = tandem.thread[0]!;
    const events: ThreadEvent[] = [createEventFactory.created({
      eventId: nextId(),
      threadId,
      revision: 0,
      occurredAt: first.ts,
      actor: actor(first.author),
      documentPath,
      anchor: anchorOf(tandem.anchor),
      body: first.text
    })];
    let revision = 1;
    for (const comment of tandem.thread.slice(1)) {
      events.push(createEventFactory.replied({
        eventId: nextId(), threadId, revision: revision++, occurredAt: comment.ts,
        actor: actor(comment.author), body: comment.text
      }));
    }
    if (tandem.suggestion) {
      events.push(createEventFactory.suggestionProposed({
        eventId: nextId(), threadId, revision: revision++, occurredAt: tandem.suggestion.ts,
        actor: actor(tandem.suggestion.author), replacement: tandem.suggestion.replacement
      }));
      if (tandem.suggestion.result === "accepted") {
        events.push(createEventFactory.suggestionAccepted({
          eventId: nextId(), threadId, revision: revision++, occurredAt: tandem.suggestion.ts,
          actor: actor(tandem.suggestion.author)
        }));
      } else if (tandem.suggestion.result === "declined") {
        events.push(createEventFactory.suggestionDeclined({
          eventId: nextId(), threadId, revision: revision++, occurredAt: tandem.suggestion.ts,
          actor: actor(tandem.suggestion.author)
        }));
      }
    }
    if (tandem.status === "resolved") {
      const last = tandem.thread[tandem.thread.length - 1]!;
      events.push(createEventFactory.resolved({
        eventId: nextId(), threadId, revision, occurredAt: last.ts, actor: actor(last.author)
      }));
    }
    eventsByThread[threadId] = events;
  }

  return { markdown: parsed.prose + parsed.trailing, eventsByThread };
}
