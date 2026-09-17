#!/usr/bin/env python3
"""Read and answer Sideband Comments from an agent session.

The comment store is append-only JSONL under `<root>/.comments`. Every anchor is a quote of
the document text, so an edit to the quoted text orphans the thread: `resolve` can no longer
find it, and the comment stops pointing at anything. This tool makes that state explicit —
`list` reports it, and `reply` refuses until the thread has been re-anchored.

Deliberately missing: resolving, reopening, deleting and starting threads. Those are the
reader's decisions, not the agent's.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
CONTEXT_LENGTH = 32
ROOT_MARKERS = (".comments", ".git")
LOCK_TIMEOUT_SECONDS = 3.0


class CommentError(Exception):
    """A problem the caller can act on, reported without a traceback."""


# --- anchors -------------------------------------------------------------------------------

def capture_anchor(text: str, start: int, end: int) -> dict:
    if not 0 <= start < end <= len(text):
        raise CommentError("anchor range must select non-empty text inside the document")
    return {
        "exact": text[start:end],
        "prefix": text[max(0, start - CONTEXT_LENGTH):start],
        "suffix": text[end:end + CONTEXT_LENGTH],
        "position": start,
    }


def occurrences(text: str, exact: str) -> list[int]:
    if not exact:
        return []
    found, index = [], 0
    while index <= len(text) - len(exact):
        at = text.find(exact, index)
        if at < 0:
            break
        found.append(at)
        index = at + max(1, len(exact))
    return found


def _common_suffix(left: str, right: str) -> int:
    limit, matched = min(len(left), len(right)), 0
    while matched < limit and left[-1 - matched] == right[-1 - matched]:
        matched += 1
    return matched


def _common_prefix(left: str, right: str) -> int:
    limit, matched = min(len(left), len(right)), 0
    while matched < limit and left[matched] == right[matched]:
        matched += 1
    return matched


def resolve_anchor(text: str, anchor: dict) -> dict:
    """Mirror of the TypeScript `resolveAnchor`, including its tie-breaking."""
    exact = anchor["exact"]
    candidates = occurrences(text, exact)
    if not candidates:
        return {"kind": "orphaned"}
    if len(candidates) == 1:
        start = candidates[0]
        return {"kind": "resolved", "start": start, "end": start + len(exact), "confidence": "exact"}

    ranked = []
    for start in candidates:
        before = text[max(0, start - len(anchor["prefix"])):start]
        after = text[start + len(exact):start + len(exact) + len(anchor["suffix"])]
        score = _common_suffix(before, anchor["prefix"]) + _common_prefix(after, anchor["suffix"])
        ranked.append((start, score, abs(start - anchor["position"])))
    ranked.sort(key=lambda item: (-item[1], item[2], item[0]))

    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    if second and best[1] == second[1] and best[2] == second[2]:
        return {"kind": "ambiguous", "candidates": candidates}
    return {"kind": "resolved", "start": best[0], "end": best[0] + len(exact), "confidence": "context"}


# --- events --------------------------------------------------------------------------------

def is_thread_event(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    actor = value.get("actor")
    return (
        value.get("schemaVersion") == SCHEMA_VERSION
        and isinstance(value.get("eventId"), str)
        and isinstance(value.get("threadId"), str)
        and isinstance(value.get("revision"), int)
        and isinstance(value.get("occurredAt"), str)
        and isinstance(value.get("type"), str)
        and isinstance(actor, dict)
        and isinstance(actor.get("id"), str)
        and isinstance(actor.get("name"), str)
    )


@dataclass
class Thread:
    id: str
    document_path: str
    anchor: dict
    status: str = "open"
    deleted: bool = False
    revision: int = 0
    updated_at: str = ""
    comments: list[dict] = field(default_factory=list)


def fold_thread(events: list[dict]) -> Thread:
    """Mirror of the TypeScript `foldThread`."""
    unique = {event["eventId"]: event for event in events}
    ordered = sorted(unique.values(), key=lambda e: (e["revision"], e["occurredAt"], e["eventId"]))
    created = next((e for e in ordered if e["type"] == "thread.created"), None)
    if created is None:
        raise CommentError("thread.created event is required")

    thread = Thread(
        id=created["threadId"],
        document_path=created["documentPath"],
        anchor=created["anchor"],
        revision=created["revision"],
        updated_at=created["occurredAt"],
        comments=[{
            "id": created["eventId"],
            "author": created["actor"],
            "createdAt": created["occurredAt"],
            "body": created["body"],
        }],
    )
    removed: set[str] = set()
    for event in ordered:
        if event["eventId"] == created["eventId"] or event["type"] == "thread.created":
            continue
        thread.revision = max(thread.revision, event["revision"])
        if event["occurredAt"] > thread.updated_at:
            thread.updated_at = event["occurredAt"]
        kind = event["type"]
        if kind == "comment.replied":
            thread.comments.append({
                "id": event["eventId"], "author": event["actor"],
                "createdAt": event["occurredAt"], "body": event["body"],
            })
        elif kind == "comment.edited":
            for comment in thread.comments:
                if comment["id"] == event["commentId"]:
                    comment["body"] = event["body"]
        elif kind == "comment.deleted":
            removed.add(event["commentId"])
        elif kind == "thread.resolved":
            thread.status = "resolved"
        elif kind == "thread.reopened":
            thread.status = "open"
        elif kind == "thread.reanchored":
            thread.anchor = event["anchor"]
        elif kind == "thread.relocated":
            thread.document_path = event["documentPath"]
        elif kind == "thread.deleted":
            thread.deleted = True
    thread.comments = [c for c in thread.comments if c["id"] not in removed]
    return thread


# --- store ---------------------------------------------------------------------------------

def normalize_document_path(value: str) -> str:
    normalized = os.path.normpath(value.replace("\\", "/")).replace(os.sep, "/")
    if normalized.startswith("./"):
        normalized = normalized[2:]
    if not normalized or normalized in (".", "..") or normalized.startswith("../") or normalized.startswith("/"):
        raise CommentError("document path must be relative to the project root")
    return normalized


def find_root(target: Path) -> Path:
    directory = target if target.is_dir() else target.parent
    for candidate in [directory, *directory.parents]:
        if any((candidate / marker).exists() for marker in ROOT_MARKERS):
            return candidate
    raise CommentError(
        f"no project root above {target}: expected a directory containing .comments or .git"
    )


class Store:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.comments_dir = root / ".comments"
        self.threads_dir = self.comments_dir / "threads"
        self.documents_dir = self.comments_dir / "documents"

    def _files(self, directory: Path) -> list[Path]:
        if not directory.is_dir():
            return []
        return sorted(p for p in directory.iterdir() if p.suffix == ".jsonl")

    def _parse(self, path: Path) -> list[dict]:
        if not path.exists():
            return []
        events = []
        for number, line in enumerate(path.read_text(encoding="utf8").splitlines(), start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise CommentError(f"{path}:{number}: invalid JSON") from error
            if not is_thread_event(value):
                # Anchored Comments v2 logs are readable by the editors but not by this tool.
                raise CommentError(f"{path}:{number}: not a Sideband event; open this file in the editor instead")
            events.append(value)
        return events

    def snapshot(self) -> tuple[dict[str, list[dict]], dict[str, Path]]:
        events: dict[str, list[dict]] = {}
        bundles: dict[str, Path] = {}
        for directory in (self.threads_dir, self.documents_dir):
            for path in self._files(directory):
                for event in self._parse(path):
                    group = events.setdefault(event["threadId"], [])
                    if not any(existing["eventId"] == event["eventId"] for existing in group):
                        group.append(event)
                    if directory == self.documents_dir:
                        bundles[event["threadId"]] = path
        return events, bundles

    def threads(self) -> list[Thread]:
        events, _ = self.snapshot()
        folded = [fold_thread(group) for group in events.values()]
        return [t for t in folded if not t.deleted and t.comments]

    def _lock(self):
        self.comments_dir.mkdir(parents=True, exist_ok=True)
        lock_path = self.comments_dir / "store.lock"
        deadline = time.time() + LOCK_TIMEOUT_SECONDS
        while True:
            try:
                handle = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(handle, str(os.getpid()).encode())
                return handle, lock_path
            except FileExistsError:
                if time.time() >= deadline:
                    raise CommentError(
                        f"comment storage is locked. If the editors have stopped, remove {lock_path} and retry."
                    )
                time.sleep(0.025)

    def append(self, event: dict) -> None:
        handle, lock_path = self._lock()
        try:
            events, bundles = self.snapshot()
            previous = events.get(event["threadId"], [])
            if any(existing["eventId"] == event["eventId"] for existing in previous):
                return
            # An existing bundle takes just the new event; anything else migrates the whole
            # thread into a document bundle, exactly as the editors do.
            target = bundles.get(event["threadId"])
            payload = [event]
            if target is None:
                document = fold_thread(previous).document_path if previous else None
                for thread_id, path in bundles.items():
                    if document and fold_thread(events[thread_id]).document_path == document:
                        target = path
                        break
                target = target or self.documents_dir / f"{uuid.uuid4()}.jsonl"
                payload = [*previous, event]
            self.documents_dir.mkdir(parents=True, exist_ok=True)
            with open(target, "a", encoding="utf8") as file:
                file.write("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in payload))
                file.flush()
                os.fsync(file.fileno())
        finally:
            os.close(handle)
            lock_path.unlink(missing_ok=True)


# --- commands ------------------------------------------------------------------------------

def actor_from(name: str) -> dict:
    return {"id": re.sub(r"[^\w.-]+", "-", name.lower(), flags=re.UNICODE), "name": name}


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def anchor_state(store: Store, thread: Thread) -> str:
    document = store.root / thread.document_path
    if not document.exists():
        return "missing-file"
    return resolve_anchor(document.read_text(encoding="utf8"), thread.anchor)["kind"]


def select(store: Store, target: Path) -> list[Thread]:
    try:
        relative = str(target.resolve().relative_to(store.root.resolve())).replace(os.sep, "/")
    except ValueError as error:
        raise CommentError(f"{target} is not inside {store.root}") from error
    threads = store.threads()
    if target.is_dir():
        if relative in ("", "."):
            return sorted(threads, key=lambda t: (t.document_path, t.updated_at))
        prefix = normalize_document_path(relative) + "/"
        matched = [t for t in threads if t.document_path.startswith(prefix)]
    else:
        wanted = normalize_document_path(relative)
        matched = [t for t in threads if t.document_path == wanted]
    return sorted(matched, key=lambda t: (t.document_path, t.updated_at))


def command_list(args) -> int:
    target = Path(args.path).resolve()
    store = Store(Path(args.root).resolve() if args.root else find_root(target))
    threads = select(store, target)
    if args.open_only:
        threads = [t for t in threads if t.status == "open"]
    report = []
    for thread in threads:
        state = anchor_state(store, thread)
        if args.orphaned_only and state != "orphaned":
            continue
        report.append({
            "id": thread.id,
            "documentPath": thread.document_path,
            "status": thread.status,
            "anchor": state,
            "quoted": thread.anchor["exact"],
            "comments": [{"author": c["author"]["name"], "at": c["createdAt"], "body": c["body"]}
                         for c in thread.comments],
        })
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    if not report:
        print("No comments found.")
        return 0
    for item in report:
        print(f"{item['documentPath']}  [{item['status']}]  anchor={item['anchor']}")
        print(f"  id: {item['id']}")
        print(f"  quoted: {item['quoted']!r}")
        for comment in item["comments"]:
            print(f"  - {comment['author']} ({comment['at']}): {comment['body']}")
        if item["anchor"] == "orphaned":
            print("  ! the quoted text is gone; re-anchor before replying")
        print()
    return 0


def load_thread(store: Store, thread_id: str) -> Thread:
    events, _ = store.snapshot()
    if thread_id not in events:
        raise CommentError(f"thread not found: {thread_id}")
    return fold_thread(events[thread_id])


def next_revision(store: Store, thread_id: str) -> int:
    events, _ = store.snapshot()
    return max((e["revision"] for e in events.get(thread_id, [])), default=-1) + 1


def open_store(args) -> Store:
    base = Path(args.root).resolve() if args.root else find_root(Path.cwd())
    return Store(base)


def command_reply(args) -> int:
    store = open_store(args)
    thread = load_thread(store, args.thread)
    body = args.body.strip()
    if not body:
        raise CommentError("comment body cannot be empty")
    state = anchor_state(store, thread)
    if state == "orphaned":
        raise CommentError(
            f"thread {thread.id} is orphaned: the quoted text is no longer in {thread.document_path}.\n"
            f"  quoted: {thread.anchor['exact']!r}\n"
            f"Re-anchor it to the text that replaced it, then reply:\n"
            f"  sideband_comments.py reanchor {thread.id} --exact '<new text>'"
        )
    store.append({
        "schemaVersion": SCHEMA_VERSION,
        "eventId": str(uuid.uuid4()),
        "threadId": thread.id,
        "revision": next_revision(store, thread.id),
        "occurredAt": now(),
        "actor": actor_from(args.author),
        "type": "comment.replied",
        "body": body,
    })
    print(f"Replied to {thread.id} on {thread.document_path} (anchor={state}).")
    return 0


def command_reanchor(args) -> int:
    store = open_store(args)
    thread = load_thread(store, args.thread)
    document = store.root / thread.document_path
    if not document.exists():
        raise CommentError(f"{thread.document_path} does not exist under {store.root}")
    text = document.read_text(encoding="utf8")
    found = occurrences(text, args.exact)
    if not found:
        raise CommentError(f"{args.exact!r} does not occur in {thread.document_path}")
    if len(found) > 1:
        raise CommentError(
            f"{args.exact!r} occurs {len(found)} times in {thread.document_path}; "
            "pass a longer quote that occurs once"
        )
    store.append({
        "schemaVersion": SCHEMA_VERSION,
        "eventId": str(uuid.uuid4()),
        "threadId": thread.id,
        "revision": next_revision(store, thread.id),
        "occurredAt": now(),
        "actor": actor_from(args.author),
        "type": "thread.reanchored",
        "anchor": capture_anchor(text, found[0], found[0] + len(args.exact)),
    })
    print(f"Re-anchored {thread.id} to {args.exact!r} in {thread.document_path}.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sideband_comments.py",
        description="Read and answer Sideband Comments. Resolving threads is left to the reader.",
    )
    parser.add_argument("--root", help="project root holding .comments (default: found above the path)")
    parser.add_argument("--author", default=os.environ.get("SIDEBAND_AUTHOR", "agent"),
                        help="name recorded on events this tool writes (default: $SIDEBAND_AUTHOR or 'agent')")
    sub = parser.add_subparsers(dest="command", required=True)

    listing = sub.add_parser("list", help="show comments on a file or directory, with anchor state")
    listing.add_argument("path")
    listing.add_argument("--json", action="store_true", help="machine-readable output")
    listing.add_argument("--open-only", action="store_true", help="skip resolved threads")
    listing.add_argument("--orphaned-only", action="store_true", help="only threads whose quoted text is gone")
    listing.set_defaults(handler=command_list)

    reply = sub.add_parser("reply", help="add a comment to an existing thread")
    reply.add_argument("thread")
    reply.add_argument("body")
    reply.set_defaults(handler=command_reply)

    reanchor = sub.add_parser("reanchor", help="point an orphaned thread at the text that replaced it")
    reanchor.add_argument("thread")
    reanchor.add_argument("--exact", required=True, help="text now in the document, occurring exactly once")
    reanchor.set_defaults(handler=command_reanchor)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.handler(args)
    except CommentError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
