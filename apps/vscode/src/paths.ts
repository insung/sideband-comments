import { isAbsolute, relative, resolve } from "node:path";
import { normalizeDocumentPath } from "@sideband-comments/core";

export function workspaceRelativePath(workspaceRoot: string, documentPath: string): string {
  const root = resolve(workspaceRoot);
  const document = resolve(documentPath);
  const result = relative(root, document);
  if (!result || result === ".." || result.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(result)) {
    if (!result) throw new Error("document path points to the workspace root, not a file");
    throw new Error("document is outside the workspace");
  }
  return normalizeDocumentPath(result);
}

export function mapRenamedDocument(
  documentPath: string,
  oldPath: string,
  newPath: string
): string | undefined {
  const document = normalizeDocumentPath(documentPath);
  const source = normalizeDocumentPath(oldPath);
  const destination = normalizeDocumentPath(newPath);
  if (document === source) return destination;
  if (!document.startsWith(`${source}/`)) return undefined;
  return `${destination}/${document.slice(source.length + 1)}`;
}
