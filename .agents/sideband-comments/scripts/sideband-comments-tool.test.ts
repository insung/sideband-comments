import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { CommentService, captureAnchor } from "../../../packages/core/src/index.js";
import { JsonlThreadRepository } from "../../../packages/jsonl-store/src/index.js";

const run = promisify(execFile);
const tool = new URL("./sideband_comments.py", import.meta.url).pathname;

const QUOTE = "Run `npm run deploy` and the pipeline pushes to production immediately.";
const REPLACEMENT = "The pipeline waits for a release approval before it pushes to production.";
const guide = [
  "# Deployment Guide",
  "",
  "## Running a release",
  "",
  QUOTE,
  "",
  "## Rollback",
  "",
  "Contact the on-call engineer.",
  ""
].join("\n");

interface Store {
  readonly root: string;
  readonly document: string;
  readonly threadId: string;
  readonly repository: JsonlThreadRepository;
}

/** Seeds a store the way the editors do, so the tool is read against real editor output. */
async function seed(): Promise<Store> {
  const root = await mkdtemp(join(tmpdir(), "sideband-agent-"));
  await mkdir(join(root, "docs"), { recursive: true });
  const document = join(root, "docs/guide.md");
  await writeFile(document, guide, "utf8");

  const repository = new JsonlThreadRepository(root);
  let counter = 0;
  const service = new CommentService(repository, {
    actor: () => ({ id: "bruce", name: "bruce" }),
    id: () => `seed-${++counter}`,
    now: () => "2026-09-16T02:10:00.000Z"
  });
  const thread = await service.create({
    documentPath: "docs/guide.md",
    anchor: captureAnchor(guide, guide.indexOf(QUOTE), guide.indexOf(QUOTE) + QUOTE.length),
    body: "Is there really no approval step before production?"
  });
  return { root, document, threadId: thread.id, repository };
}

const tell = (store: Store, ...args: string[]) =>
  run("python3", [tool, "--root", store.root, "--author", "Claude", ...args]);

describe("sideband_comments.py against the editors' store", () => {
  let store: Store;
  beforeAll(async () => { store = await seed(); });

  it("reads a thread the editors wrote", async () => {
    const { stdout } = await tell(store, "list", "--json", store.document);
    const [thread] = JSON.parse(stdout);

    expect(thread).toMatchObject({ id: store.threadId, documentPath: "docs/guide.md", anchor: "resolved" });
    expect(thread.comments).toEqual([
      expect.objectContaining({ author: "bruce", body: "Is there really no approval step before production?" })
    ]);
  });

  it("reports the thread as orphaned once its quoted text is edited away", async () => {
    await writeFile(store.document, guide.replace(QUOTE, REPLACEMENT), "utf8");
    const { stdout } = await tell(store, "list", "--json", store.document);

    expect(JSON.parse(stdout)[0].anchor).toBe("orphaned");
  });

  it("refuses to reply while the thread is orphaned, and says how to fix it", async () => {
    await expect(tell(store, "reply", store.threadId, "Added the approval gate.")).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("reanchor")
    });
  });

  it("re-anchors to the replacement text and then accepts the reply", async () => {
    await tell(store, "reanchor", store.threadId, "--exact", REPLACEMENT);
    await tell(store, "reply", store.threadId, "Documented the approval gate on the release step.");

    const { stdout } = await tell(store, "list", "--json", store.document);
    expect(JSON.parse(stdout)[0]).toMatchObject({ anchor: "resolved", quoted: REPLACEMENT });
  });

  it("writes events the editors fold into the same thread", async () => {
    const thread = await store.repository.read(store.threadId);

    expect(thread?.anchor.exact).toBe(REPLACEMENT);
    expect(thread?.status).toBe("open");
    expect(thread?.comments.map((comment) => [comment.author.name, comment.body])).toEqual([
      ["bruce", "Is there really no approval step before production?"],
      ["Claude", "Documented the approval gate on the release step."]
    ]);
  });

  it("keeps the whole document in one bundle rather than starting a second store", async () => {
    const bundles = await store.repository.listByDocument("docs/guide.md");
    expect(bundles).toHaveLength(1);
  });

  it("migrates a legacy per-thread file into a document bundle, as the editors do", async () => {
    const root = await mkdtemp(join(tmpdir(), "sideband-legacy-"));
    await mkdir(join(root, "docs"), { recursive: true });
    const document = join(root, "docs/guide.md");
    await writeFile(document, guide, "utf8");
    const repository = new JsonlThreadRepository(root);
    await mkdir(repository.threadsDirectory, { recursive: true });
    await writeFile(repository.threadFile("legacy-thread"), `${JSON.stringify({
      schemaVersion: 1,
      eventId: "legacy-created",
      threadId: "legacy-thread",
      revision: 0,
      occurredAt: "2026-09-16T02:10:00.000Z",
      actor: { id: "bruce", name: "bruce" },
      type: "thread.created",
      documentPath: "docs/guide.md",
      anchor: captureAnchor(guide, guide.indexOf(QUOTE), guide.indexOf(QUOTE) + QUOTE.length),
      body: "Is there really no approval step before production?"
    })}\n`, "utf8");

    await run("python3", [tool, "--root", root, "--author", "Claude", "reply", "legacy-thread", "Documented it."]);

    // The whole thread moves into the bundle; the legacy file stays and is deduplicated on read.
    const thread = await repository.read("legacy-thread");
    expect(thread?.comments.map((comment) => comment.body)).toEqual([
      "Is there really no approval step before production?",
      "Documented it."
    ]);
    expect(await repository.listByDocument("docs/guide.md")).toHaveLength(1);
  });

  it("offers no way for an agent to resolve or delete a thread", async () => {
    const help = await readFile(tool, "utf8");
    const subcommands = [...help.matchAll(/sub\.add_parser\("([a-z-]+)"/g)].map((match) => match[1]);

    expect(subcommands.sort()).toEqual(["list", "reanchor", "reply"]);
  });
});
