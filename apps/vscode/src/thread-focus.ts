import { resolveAnchor, type ThreadRange, type ThreadState } from "@sideband-comments/core";

/** Where each comment sits in the document. Comments without a unique anchor are left out. */
export function anchorRanges(text: string, threads: readonly Pick<ThreadState, "id" | "anchor">[]): ThreadRange[] {
  return threads.flatMap((thread) => {
    const resolution = resolveAnchor(text, thread.anchor);
    return resolution.kind === "resolved" ? [{ id: thread.id, start: resolution.start, end: resolution.end }] : [];
  });
}
