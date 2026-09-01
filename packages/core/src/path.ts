import { posix } from "node:path";

export function normalizeDocumentPath(input: string): string {
  const normalized = posix.normalize(input.replaceAll("\\", "/")).replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    throw new Error("document path must be relative to the workspace root");
  }
  return normalized;
}
