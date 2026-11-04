import { createInterface } from "node:readline";
import { handle } from "./handler.js";

/**
 * One JSON request per stdin line, one JSON response per stdout line:
 * `{ id, ok: true, result }` or `{ id, ok: false, error }`.
 * Requests run in order, so writes to one store never overlap from this process.
 */
let queue = Promise.resolve();
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  queue = queue.then(async () => {
    let id: unknown = null;
    try {
      const request: unknown = JSON.parse(line);
      if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Request must be a JSON object.");
      id = (request as Record<string, unknown>).id ?? null;
      const result = await handle(request as Record<string, unknown>);
      process.stdout.write(JSON.stringify({ id, ok: true, result }) + "\n");
    } catch (error) {
      process.stdout.write(JSON.stringify({ id, ok: false, error: error instanceof Error ? error.message : String(error) }) + "\n");
    }
  });
});
