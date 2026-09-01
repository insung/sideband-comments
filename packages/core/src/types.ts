export const SCHEMA_VERSION = 1 as const;

export interface Actor {
  id: string;
  name: string;
}

export interface QuoteAnchor {
  exact: string;
  prefix: string;
  suffix: string;
  position: number;
}

export interface ThreadComment {
  id: string;
  author: Actor;
  createdAt: string;
  body: string;
}

export interface Suggestion {
  replacement: string;
  author: Actor;
  createdAt: string;
  result?: "accepted" | "declined";
}

interface EventBase {
  schemaVersion: typeof SCHEMA_VERSION;
  eventId: string;
  threadId: string;
  revision: number;
  occurredAt: string;
  actor: Actor;
}

export interface ThreadCreatedEvent extends EventBase {
  type: "thread.created";
  documentPath: string;
  anchor: QuoteAnchor;
  body: string;
}

export interface CommentRepliedEvent extends EventBase {
  type: "comment.replied";
  body: string;
}

export interface ThreadResolvedEvent extends EventBase {
  type: "thread.resolved";
}

export interface ThreadReopenedEvent extends EventBase {
  type: "thread.reopened";
}

export interface ThreadReanchoredEvent extends EventBase {
  type: "thread.reanchored";
  anchor: QuoteAnchor;
}

export interface ThreadRelocatedEvent extends EventBase {
  type: "thread.relocated";
  documentPath: string;
}

export interface SuggestionProposedEvent extends EventBase {
  type: "suggestion.proposed";
  replacement: string;
}

export interface SuggestionAcceptedEvent extends EventBase {
  type: "suggestion.accepted";
}

export interface SuggestionDeclinedEvent extends EventBase {
  type: "suggestion.declined";
}

export type ThreadEvent =
  | ThreadCreatedEvent
  | CommentRepliedEvent
  | ThreadResolvedEvent
  | ThreadReopenedEvent
  | ThreadReanchoredEvent
  | ThreadRelocatedEvent
  | SuggestionProposedEvent
  | SuggestionAcceptedEvent
  | SuggestionDeclinedEvent;

export interface ThreadState {
  id: string;
  documentPath: string;
  anchor: QuoteAnchor;
  status: "open" | "resolved";
  comments: ThreadComment[];
  suggestion?: Suggestion;
  revision: number;
  updatedAt: string;
}

export type AnchorResolution =
  | { kind: "resolved"; start: number; end: number; confidence: "exact" | "context" }
  | { kind: "ambiguous"; candidates: number[] }
  | { kind: "orphaned" };
