import * as os from "node:os";
import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { CommentService, type Actor } from "@sideband-comments/core";
import { JsonlThreadRepository } from "@sideband-comments/jsonl-store";
import { workspaceRelativePath } from "./paths.js";

export class WorkspaceComments {
  readonly repository: JsonlThreadRepository;
  readonly service: CommentService;

  constructor(readonly folder: vscode.WorkspaceFolder) {
    this.repository = new JsonlThreadRepository(folder.uri.fsPath);
    this.service = new CommentService(this.repository, {
      actor: () => this.actor(),
      id: randomUUID,
      now: () => new Date().toISOString()
    });
  }

  relativePath(uri: vscode.Uri): string {
    return workspaceRelativePath(this.folder.uri.fsPath, uri.fsPath);
  }

  private actor(): Actor {
    const configured = vscode.workspace.getConfiguration("sidebandComments", this.folder.uri).get<string>("authorName")?.trim();
    const name = configured || os.userInfo().username || "user";
    return { id: name.toLocaleLowerCase().replace(/[^\p{L}\p{N}_.-]+/gu, "-"), name };
  }
}
