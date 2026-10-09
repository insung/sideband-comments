import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
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
  readonly service: CommentService;
}

/** Seeds a store the way the editors do, so the tool is read against real editor output. */
async function seedThread(
  documentText: string,
  anchor: ReturnType<typeof captureAnchor>,
  body = "Is there really no approval step before production?"
): Promise<Store> {
  const root = await mkdtemp(join(tmpdir(), "sideband-agent-"));
  await mkdir(join(root, "docs"), { recursive: true });
  const document = join(root, "docs/guide.md");
  await writeFile(document, documentText, "utf8");

  const repository = new JsonlThreadRepository(root);
  let counter = 0;
  const service = new CommentService(repository, {
    actor: () => ({ id: "bruce", name: "bruce" }),
    id: () => `seed-${++counter}`,
    now: () => "2026-09-16T02:10:00.000Z"
  });
  const thread = await service.create({
    documentPath: "docs/guide.md",
    anchor,
    body
  });
  return { root, document, threadId: thread.id, repository, service };
}

const seed = () => seedThread(
  guide,
  captureAnchor(guide, guide.indexOf(QUOTE), guide.indexOf(QUOTE) + QUOTE.length)
);

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

    expect(subcommands.sort()).toEqual(["create", "list", "reanchor", "reply"]);
  });
});

describe("sideband_comments.py on a thread whose quoted text was deleted", () => {
  let store: Store;
  beforeAll(async () => {
    store = await seed();
    await writeFile(store.document, guide.replace(`${QUOTE}\n\n`, ""), "utf8");
  });

  it("replies without re-anchoring and reports the anchor as still orphaned", async () => {
    const { stdout } = await tell(store, "reply", store.threadId, "Deleted the sentence as requested.");

    expect(stdout).toContain("anchor=orphaned");
  });

  it("writes a reply the editors fold into the orphaned thread, with the anchor untouched", async () => {
    const thread = await store.repository.read(store.threadId);

    expect(thread?.anchor.exact).toBe(QUOTE);
    expect(thread?.status).toBe("open");
    expect(thread?.comments.map((comment) => [comment.author.name, comment.body])).toEqual([
      ["bruce", "Is there really no approval step before production?"],
      ["Claude", "Deleted the sentence as requested."]
    ]);
  });

  it("does not tell the agent to re-anchor before replying", async () => {
    const { stdout } = await tell(store, "list", store.document);

    expect(stdout).toContain("anchor=orphaned");
    expect(stdout).not.toContain("re-anchor before replying");
  });
});

describe("sideband_comments.py write guards", () => {
  it("requires an explicit root before replying", async () => {
    const store = await seed();

    await expect(run("python3", [tool, "--author", "Claude", "reply", store.threadId, "Documented it."], {
      cwd: store.root
    })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("--root")
    });
  });

  it("requires an explicit root before re-anchoring", async () => {
    const store = await seed();

    await expect(run("python3", [tool, "--author", "Claude", "reanchor", store.threadId, "--exact", QUOTE], {
      cwd: store.root
    })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("--root")
    });
  });

  it("refuses to reply when the anchor is ambiguous", async () => {
    const text = "same--same";
    const store = await seedThread(text, { exact: "same", prefix: "", suffix: "", position: 3 });

    await expect(tell(store, "reply", store.threadId, "Documented it.")).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("ambiguous")
    });
  });

  it("refuses to reply when the document is missing", async () => {
    const store = await seed();
    await unlink(store.document);

    await expect(tell(store, "reply", store.threadId, "Documented it.")).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("missing-file")
    });
  });

  it("refuses to reply to a resolved thread", async () => {
    const store = await seed();
    await store.service.resolve(store.threadId);

    await expect(tell(store, "reply", store.threadId, "Documented it.")).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("resolved")
    });
  });

  it("refuses to reply to a deleted thread", async () => {
    const store = await seed();
    await store.service.delete(store.threadId);

    await expect(tell(store, "reply", store.threadId, "Documented it.")).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("deleted")
    });
  });

  it("reads a reply body from a file without changing shell-sensitive text", async () => {
    const store = await seed();
    const body = "Ran `npm run deploy` with $HOME and 'single quotes'.\nNothing was expanded.";
    const bodyFile = join(store.root, "reply.txt");
    await writeFile(bodyFile, body, "utf8");

    await tell(store, "reply", store.threadId, "--body-file", bodyFile);

    const thread = await store.repository.read(store.threadId);
    expect(thread?.comments.at(-1)?.body).toBe(body);
  });

  it("reads an exact replacement anchor from a file", async () => {
    const store = await seed();
    const replacement = "Use `$HOME` only after the operator's approval.";
    const exactFile = join(store.root, "anchor.txt");
    await writeFile(store.document, guide.replace(QUOTE, replacement), "utf8");
    await writeFile(exactFile, replacement, "utf8");

    await tell(store, "reanchor", store.threadId, "--exact-file", exactFile);

    const thread = await store.repository.read(store.threadId);
    expect(thread?.anchor.exact).toBe(replacement);
  });

  it("refuses to re-anchor a resolved thread", async () => {
    const store = await seed();
    await store.service.resolve(store.threadId);

    await expect(tell(store, "reanchor", store.threadId, "--exact", QUOTE)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("resolved")
    });
  });
});

/** A project that has adopted Sideband Comments but holds no thread on the document yet. */
async function emptyStore(documentText = guide): Promise<Omit<Store, "threadId" | "service">> {
  const root = await mkdtemp(join(tmpdir(), "sideband-create-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, ".comments"), { recursive: true });
  const document = join(root, "docs/guide.md");
  await writeFile(document, documentText, "utf8");
  return { root, document, repository: new JsonlThreadRepository(root) };
}

const createTell = (root: string, ...args: string[]) =>
  run("python3", [tool, "--root", root, "--author", "MI Delivery Harness", ...args]);

async function bodyFile(root: string, name: string, text: string): Promise<string> {
  const file = join(root, name);
  await writeFile(file, text, "utf8");
  return file;
}

describe("sideband_comments.py create", () => {
  it("creates a thread on a line and the editors fold it", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "[unclear-wording] CLEAR-001\n\n「immediately」가 어느 시점인지 알 수 없다.");

    const { stdout } = await createTell(store.root, "create", "docs/guide.md", "--line", "5", "--body-file", body, "--json");
    const [created] = JSON.parse(stdout);

    const thread = await store.repository.read(created.threadId);
    expect(created).toMatchObject({ documentPath: "docs/guide.md", quoted: QUOTE });
    expect(thread?.anchor.exact).toBe(QUOTE);
    expect(thread?.status).toBe("open");
    expect(thread?.comments).toHaveLength(1);
    expect(thread?.comments[0]?.author).toEqual({ id: "mi-delivery-harness", name: "MI Delivery Harness" });
    expect(thread?.comments[0]?.body).toBe("[unclear-wording] CLEAR-001\n\n「immediately」가 어느 시점인지 알 수 없다.");
  });

  it("lists the created thread as resolved and accepts a reply on it", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "Which step approves the release?");
    const { stdout } = await createTell(store.root, "create", "docs/guide.md", "--line", "5", "--body-file", body, "--json");
    const [created] = JSON.parse(stdout);

    const listed = JSON.parse((await createTell(store.root, "list", "--json", store.document)).stdout);
    expect(listed).toEqual([expect.objectContaining({ id: created.threadId, anchor: "resolved", status: "open" })]);

    await createTell(store.root, "reply", created.threadId, "The approval step is documented now.");
    const thread = await store.repository.read(created.threadId);
    expect(thread?.comments.map((comment) => comment.body)).toEqual([
      "Which step approves the release?",
      "The approval step is documented now."
    ]);
  });

  it("a second thread on the same document joins the existing bundle", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "Note.");
    await createTell(store.root, "create", "docs/guide.md", "--line", "5", "--body-file", body);
    await createTell(store.root, "create", "docs/guide.md", "--line", "9", "--body-file", body);

    expect(await store.repository.listByDocument("docs/guide.md")).toHaveLength(2);
    expect(await readdir(join(store.root, ".comments/documents"))).toHaveLength(1);
  });

  it("quotes a line range as one anchor, trimmed of surrounding whitespace", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "The heading and the step disagree.");
    const { stdout } = await createTell(store.root, "create", "docs/guide.md", "--line", "3-5", "--body-file", body, "--json");
    const [created] = JSON.parse(stdout);

    const thread = await store.repository.read(created.threadId);
    expect(thread?.anchor.exact).toBe(`## Running a release\n\n${QUOTE}`);
  });

  it("quotes a sentence inside a line from --exact-file", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "Immediately?");
    const exact = await bodyFile(store.root, "exact.txt", "pushes to production immediately");
    const { stdout } = await createTell(store.root, "create", "docs/guide.md", "--exact-file", exact, "--body-file", body, "--json");
    const [created] = JSON.parse(stdout);

    const thread = await store.repository.read(created.threadId);
    expect(thread?.anchor.exact).toBe("pushes to production immediately");
  });

  it("creates several threads from a batch file in one pass and reports their ids as JSON", async () => {
    const store = await emptyStore();
    const batch = await bodyFile(store.root, "batch.json", JSON.stringify([
      { path: "docs/guide.md", line: 5, body: "[unclear-wording] CLEAR-001\n\nWhen is immediately?" },
      { path: "docs/guide.md", line: { start: 7, end: 9 }, body: "[undefined-term] CLEAR-002\n\nWho is on call?" },
      { path: "docs/guide.md", exact: "Deployment Guide", body: "[missing-subject-object-action] CLEAR-003\n\nDeploy what?" }
    ]));

    const { stdout } = await createTell(store.root, "create", "--batch-file", batch, "--json");
    const created = JSON.parse(stdout);

    expect(created.map((item: { index: number; quoted: string }) => [item.index, item.quoted])).toEqual([
      [0, QUOTE],
      [1, "## Rollback\n\nContact the on-call engineer."],
      [2, "Deployment Guide"]
    ]);
    expect(await store.repository.listByDocument("docs/guide.md")).toHaveLength(3);
    expect(await readdir(join(store.root, ".comments/documents"))).toHaveLength(1);
  });

  it("writes nothing when one batch item fails, and names the failing item", async () => {
    const store = await emptyStore();
    const batch = await bodyFile(store.root, "batch.json", JSON.stringify([
      { path: "docs/guide.md", line: 5, body: "Fine." },
      { path: "docs/guide.md", line: 40, body: "Beyond the end." }
    ]));

    await expect(createTell(store.root, "create", "--batch-file", batch)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("[1]")
    });
    expect(await store.repository.list()).toHaveLength(0);
  });

  it("refuses a blank line", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "Nothing here.");

    await expect(createTell(store.root, "create", "docs/guide.md", "--line", "4", "--body-file", body)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("blank")
    });
  });

  it("refuses a line outside the document", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "Nothing here.");

    await expect(createTell(store.root, "create", "docs/guide.md", "--line", "40", "--body-file", body)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("outside")
    });
  });

  it("refuses a line whose surrounding context does not separate it from a twin", async () => {
    const pad = `${"=".repeat(40)}\n`;
    const block = "alpha\nsame line here\nomega\n";
    const store = await emptyStore(`${pad}${block}${pad}${block}${pad}`);
    const body = await bodyFile(store.root, "body.txt", "Which one?");

    await expect(createTell(store.root, "create", "docs/guide.md", "--line", "3", "--body-file", body)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("ambiguous")
    });
    expect(await store.repository.list()).toHaveLength(0);
  });

  it("refuses an --exact quote that occurs more than once", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "Which one?");

    await expect(createTell(store.root, "create", "docs/guide.md", "--exact", "the", "--body-file", body)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("occurs 2 times")
    });
  });

  it("refuses an empty body", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "   \n");

    await expect(createTell(store.root, "create", "docs/guide.md", "--line", "5", "--body-file", body)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("empty")
    });
  });

  it("refuses a document outside the project root", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "Elsewhere.");
    const outside = await mkdtemp(join(tmpdir(), "sideband-outside-"));
    await writeFile(join(outside, "other.md"), guide, "utf8");

    await expect(createTell(store.root, "create", join(outside, "other.md"), "--line", "5", "--body-file", body)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("inside")
    });
  });

  it("requires an explicit root before creating", async () => {
    const store = await emptyStore();
    const body = await bodyFile(store.root, "body.txt", "No root.");

    await expect(run("python3", [tool, "--author", "Claude", "create", "docs/guide.md", "--line", "5", "--body-file", body], {
      cwd: store.root
    })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("--root")
    });
  });
});
