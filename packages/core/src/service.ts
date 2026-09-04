import { createEventFactory } from "./events.js";
import { foldThread } from "./fold.js";
import { normalizeDocumentPath } from "./path.js";
import type { Actor, QuoteAnchor, ThreadEvent, ThreadState } from "./types.js";

export interface ThreadRepository {
  append(event: ThreadEvent): Promise<void>;
  readEvents(threadId: string): Promise<ThreadEvent[]>;
  list(): Promise<ThreadState[]>;
  listByDocument(documentPath: string): Promise<ThreadState[]>;
}

export interface CommentServiceDependencies {
  actor: () => Actor;
  id: () => string;
  now: () => string;
}

export interface CreateThreadInput {
  documentPath: string;
  anchor: QuoteAnchor;
  body: string;
}

export class CommentService {
  constructor(
    private readonly repository: ThreadRepository,
    private readonly dependencies: CommentServiceDependencies
  ) {}

  private body(value: string): string {
    const body = value.trim();
    if (!body) throw new Error("comment body cannot be blank");
    return body;
  }

  private async revision(threadId: string): Promise<number> {
    const events = await this.repository.readEvents(threadId);
    if (events.length === 0) throw new Error(`thread not found: ${threadId}`);
    return events.reduce((maximum, event) => Math.max(maximum, event.revision), -1) + 1;
  }

  private eventBase(threadId: string, revision: number) {
    return {
      eventId: this.dependencies.id(),
      threadId,
      revision,
      occurredAt: this.dependencies.now(),
      actor: this.dependencies.actor()
    };
  }

  async create(input: CreateThreadInput): Promise<ThreadState> {
    if (!input.anchor.exact) throw new Error("anchor exact text cannot be blank");
    const threadId = this.dependencies.id();
    await this.repository.append(createEventFactory.created({
      ...this.eventBase(threadId, 0),
      documentPath: normalizeDocumentPath(input.documentPath),
      anchor: input.anchor,
      body: this.body(input.body)
    }));
    return this.get(threadId);
  }

  async get(threadId: string): Promise<ThreadState> {
    const events = await this.repository.readEvents(threadId);
    if (events.length === 0) throw new Error(`thread not found: ${threadId}`);
    return foldThread(events);
  }

  async reply(threadId: string, body: string): Promise<ThreadState> {
    await this.repository.append(createEventFactory.replied({
      ...this.eventBase(threadId, await this.revision(threadId)),
      body: this.body(body)
    }));
    return this.get(threadId);
  }

  async deleteComment(threadId: string, commentId: string): Promise<ThreadState> {
    const current = await this.get(threadId);
    if (!current.comments.some((comment) => comment.id === commentId)) {
      throw new Error(`comment not found: ${commentId}`);
    }
    await this.repository.append(createEventFactory.commentDeleted({
      ...this.eventBase(threadId, await this.revision(threadId)),
      commentId
    }));
    return this.get(threadId);
  }

  async resolve(threadId: string): Promise<ThreadState> {
    await this.repository.append(createEventFactory.resolved(this.eventBase(threadId, await this.revision(threadId))));
    return this.get(threadId);
  }

  async reopen(threadId: string): Promise<ThreadState> {
    await this.repository.append(createEventFactory.reopened(this.eventBase(threadId, await this.revision(threadId))));
    return this.get(threadId);
  }

  async reanchor(threadId: string, anchor: QuoteAnchor): Promise<ThreadState> {
    if (!anchor.exact) throw new Error("anchor exact text cannot be blank");
    await this.repository.append(createEventFactory.reanchored({
      ...this.eventBase(threadId, await this.revision(threadId)), anchor
    }));
    return this.get(threadId);
  }

  async relocate(threadId: string, documentPath: string): Promise<ThreadState> {
    await this.repository.append(createEventFactory.relocated({
      ...this.eventBase(threadId, await this.revision(threadId)),
      documentPath: normalizeDocumentPath(documentPath)
    }));
    return this.get(threadId);
  }

  async delete(threadId: string): Promise<ThreadState> {
    await this.repository.append(createEventFactory.deleted(
      this.eventBase(threadId, await this.revision(threadId))
    ));
    return this.get(threadId);
  }

  async relocateDocument(from: string, to: string): Promise<ThreadState[]> {
    const source = normalizeDocumentPath(from);
    const destination = normalizeDocumentPath(to);
    const threads = await this.repository.listByDocument(source);
    return Promise.all(threads.map((thread) => this.relocate(thread.id, destination)));
  }

  async proposeSuggestion(threadId: string, replacement: string): Promise<ThreadState> {
    await this.repository.append(createEventFactory.suggestionProposed({
      ...this.eventBase(threadId, await this.revision(threadId)),
      replacement
    }));
    return this.get(threadId);
  }

  async acceptSuggestion(threadId: string): Promise<ThreadState> {
    await this.repository.append(createEventFactory.suggestionAccepted(
      this.eventBase(threadId, await this.revision(threadId))
    ));
    return this.get(threadId);
  }

  async declineSuggestion(threadId: string): Promise<ThreadState> {
    await this.repository.append(createEventFactory.suggestionDeclined(
      this.eventBase(threadId, await this.revision(threadId))
    ));
    return this.get(threadId);
  }
}
