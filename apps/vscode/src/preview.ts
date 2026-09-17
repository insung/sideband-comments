import * as vscode from "vscode";
import type { QuoteAnchor } from "@sideband-comments/core";
import { capturePreviewAnchor, readPreviewSelection } from "./preview-anchor.js";
import type { WorkspaceComments } from "./workspace.js";

export interface PreviewAnchor {
  readonly uri: vscode.Uri;
  readonly workspace: WorkspaceComments;
  readonly version: number;
  readonly anchor: QuoteAnchor;
  readonly text: string;
}

/**
 * Turns a Markdown preview right-click into an anchor on the source document.
 *
 * The built-in preview never tells an extension about its selection on its own, so this
 * context-menu payload is the only moment we learn what the reader picked.
 */
export async function capturePreviewSelection(
  context: unknown,
  workspaceFor: (uri: vscode.Uri) => WorkspaceComments | undefined
): Promise<PreviewAnchor> {
  const selection = readPreviewSelection(context);
  if (!selection) throw new Error("Select text in the Markdown preview and use its right-click Add Comment menu.");
  const uri = vscode.Uri.parse(selection.uri);
  const workspace = uri.scheme === "file" ? workspaceFor(uri) : undefined;
  if (!workspace) throw new Error("Open the Markdown file inside a workspace before adding a comment.");
  const document = await vscode.workspace.openTextDocument(uri);
  if (document.languageId !== "markdown") throw new Error("This command requires a Markdown document.");
  if (selection.version !== document.version) throw new Error("The preview is out of date. Refresh it and select the text again.");
  return {
    uri,
    workspace,
    version: document.version,
    anchor: capturePreviewAnchor(document.getText(), selection.text, selection.startLine, selection.endLine),
    text: selection.text
  };
}

interface MarkdownIt {
  renderer: { render: (tokens: unknown, options: unknown, env: { currentDocument?: vscode.Uri }) => string };
  utils: { escapeHtml: (value: string) => string };
}

/** Injects the source uri/version the preview script needs to describe a selection. */
export function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
  const render = md.renderer.render.bind(md.renderer);
  md.renderer.render = (tokens, options, env) => {
    const uri = env.currentDocument?.toString();
    const version = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri)?.version ?? -1;
    const metadata = uri
      ? `<span hidden class="sideband-preview-source" data-version="${version}" data-uri="${md.utils.escapeHtml(uri)}"></span>`
      : "";
    return metadata + render(tokens, options, env);
  };
  return md;
}
