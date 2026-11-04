import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  captureAnchor,
  CommentService,
  normalizeDocumentPath,
  resolveAnchor,
  type Actor,
  type ThreadState
} from "@sideband-comments/core";
import { JsonlThreadRepository } from "@sideband-comments/jsonl-store";

/** Anchor states shared with the agent tool (`sideband_comments.py list`). */
export type AnchorState = "resolved" | "ambiguous" | "orphaned" | "missing-file";

export interface ViewComment {
  id: string;
  authorName: string;
  createdAt: string;
  body: string;
}

/** A thread as the IntelliJ plugin draws it. Offsets are UTF-16 code units, like a Java String. */
export interface ViewThread {
  id: string;
  documentPath: string;
  status: "open" | "resolved";
  quote: string;
  originalQuote: string;
  anchorState: AnchorState;
  start?: number;
  end?: number;
  comments: ViewComment[];
  revision: number;
  updatedAt: string;
}

type Request = Record<string, unknown>;

function field<T>(request: Request, name: string, kind: "string" | "number" | "boolean"): T {
  const value = request[name];
  if (typeof value !== kind) throw new Error(`Request field "${name}" must be a ${kind}.`);
  return value as T;
}

function rootOf(request: Request): string {
  const root = field<string>(request, "root", "string");
  if (!isAbsolute(root)) throw new Error("Project root must be an absolute path.");
  return root;
}

/** Same author id rule as the VS Code extension, so one person keeps one id across editors. */
export function actorFor(name: string): Actor {
  const trimmed = name.trim() || "user";
  return { id: trimmed.toLocaleLowerCase().replace(/[^\p{L}\p{N}_.-]+/gu, "-"), name: trimmed };
}

function view(thread: ThreadState, text: string | undefined): ViewThread {
  const base = {
    id: thread.id,
    documentPath: thread.documentPath,
    status: thread.status,
    quote: thread.anchor.exact,
    originalQuote: thread.originalAnchor.exact,
    comments: thread.comments.map((comment) => ({
      id: comment.id,
      authorName: comment.author.name,
      createdAt: comment.createdAt,
      body: comment.body
    })),
    revision: thread.revision,
    updatedAt: thread.updatedAt
  };
  if (text === undefined) return { ...base, anchorState: "missing-file" };
  const resolution = resolveAnchor(text, thread.anchor);
  if (resolution.kind === "resolved") return { ...base, anchorState: "resolved", start: resolution.start, end: resolution.end };
  return { ...base, anchorState: resolution.kind };
}

async function diskText(root: string, documentPath: string): Promise<string | undefined> {
  try {
    return await readFile(join(root, documentPath), "utf8");
  } catch {
    return undefined;
  }
}

function sortThreads(threads: ViewThread[]): ViewThread[] {
  return threads.sort((left, right) =>
    left.documentPath.localeCompare(right.documentPath) ||
    Number(left.status === "resolved") - Number(right.status === "resolved") ||
    (left.start ?? Number.MAX_SAFE_INTEGER) - (right.start ?? Number.MAX_SAFE_INTEGER) ||
    right.updatedAt.localeCompare(left.updatedAt));
}

const REQUEST_TYPES = new Set([
  "document.threads", "project.threads", "thread.create", "thread.reply", "thread.resolve",
  "thread.reopen", "thread.reanchor", "comment.edit", "comment.delete"
]);

export async function handle(request: Request): Promise<unknown> {
  const type = request.type;
  if (typeof type !== "string" || !REQUEST_TYPES.has(type)) throw new Error(`Unknown request type: ${String(type)}`);
  const root = rootOf(request);
  const repository = new JsonlThreadRepository(root);
  const includeResolved = () => field<boolean>(request, "includeResolved", "boolean");
  const service = () => new CommentService(repository, {
    actor: () => actorFor(field<string>(request, "author", "string")),
    id: randomUUID,
    now: () => new Date().toISOString()
  });
  // The editor's text wins over the file on disk: it holds unsaved edits and matches editor offsets.
  const anchorText = async (thread: ThreadState) => {
    if (typeof request.text === "string" && typeof request.path === "string" &&
        normalizeDocumentPath(request.path) === thread.documentPath) return request.text;
    return diskText(root, thread.documentPath);
  };
  const result = async (thread: ThreadState) => view(thread, await anchorText(thread));
  const selection = () => captureAnchor(
    field<string>(request, "text", "string"),
    field<number>(request, "start", "number"),
    field<number>(request, "end", "number")
  );
  const threadId = () => field<string>(request, "threadId", "string");

  switch (type) {
    case "document.threads": {
      const path = normalizeDocumentPath(field<string>(request, "path", "string"));
      const text = field<string>(request, "text", "string");
      const threads = (await repository.listByDocument(path))
        .filter((thread) => includeResolved() || thread.status !== "resolved");
      return { threads: sortThreads(threads.map((thread) => view(thread, text))) };
    }
    case "project.threads": {
      const threads = (await repository.list()).filter((thread) => includeResolved() || thread.status !== "resolved");
      const texts = new Map<string, string | undefined>();
      for (const path of new Set(threads.map((thread) => thread.documentPath))) texts.set(path, await diskText(root, path));
      return { threads: sortThreads(threads.map((thread) => view(thread, texts.get(thread.documentPath)))) };
    }
    case "thread.create": {
      const path = normalizeDocumentPath(field<string>(request, "path", "string"));
      const anchor = selection();
      return result(await service().create({ documentPath: path, anchor, body: field<string>(request, "body", "string") }));
    }
    case "thread.reply":
      return result(await service().reply(threadId(), field<string>(request, "body", "string")));
    case "thread.resolve":
      return result(await service().resolve(threadId()));
    case "thread.reopen":
      return result(await service().reopen(threadId()));
    case "thread.reanchor":
      return result(await service().reanchor(threadId(), selection()));
    case "comment.edit":
      return result(await service().editComment(threadId(), field<string>(request, "commentId", "string"), field<string>(request, "body", "string")));
    case "comment.delete":
      return result(await service().deleteComment(threadId(), field<string>(request, "commentId", "string")));
  }
  throw new Error(`Unknown request type: ${type}`);
}
