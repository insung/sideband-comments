import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface ExtensionManifest {
  contributes: {
    commands?: Array<{ command: string; title: string }>;
    viewsContainers?: { secondarySidebar?: Array<{ id: string; title: string }> };
    views?: Record<string, Array<{ id: string; name: string; contextualTitle?: string; type?: string }>>;
    menus: Record<string, Array<{ command: string; group: string; when?: string }>>;
  };
}

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as ExtensionManifest;

describe("VS Code contributions", () => {
  it("stacks an explorer and detail editor in the Secondary Side Bar", () => {
    expect(manifest.contributes.viewsContainers?.secondarySidebar).toContainEqual(
      expect.objectContaining({ id: "sideband-comments-overview", title: "Sideband Comments" })
    );
    expect(manifest.contributes.views?.["sideband-comments-overview"]).toEqual([
      expect.objectContaining({
        id: "sidebandComments.overviewView",
        name: "Comments Explorer",
        contextualTitle: "Sideband Comments"
      }),
      expect.objectContaining({
        id: "sidebandComments.detailView",
        name: "Comment Details",
        type: "webview"
      })
    ]);
  });

  it("separates new comments from replies for the Sideband controller", () => {
    expect(manifest.contributes.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "sidebandComments.create", title: "Comment" }),
      expect.objectContaining({ command: "sidebandComments.reply", title: "Reply" })
    ]));
    expect(manifest.contributes.menus["comments/commentThread/context"]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        command: "sidebandComments.create",
        when: "commentController == sidebandComments && commentThreadIsEmpty"
      }),
      expect.objectContaining({
        command: "sidebandComments.reply",
        when: "commentController == sidebandComments && !commentThreadIsEmpty"
      })
    ]));
  });

  it("places Add Comment near the bottom of the editor context menu", () => {
    const item = manifest.contributes.menus["editor/context"]?.find(
      (candidate) => candidate.command === "sidebandComments.add"
    );
    expect(item?.group).toBe("z_commands@100");
  });

  it("contributes deletion for individual editor comments", () => {
    expect(manifest.contributes.commands).toContainEqual(
      expect.objectContaining({ command: "sidebandComments.deleteComment", title: "Sideband Comments: Delete Comment" })
    );
    expect(manifest.contributes.menus["comments/comment/title"]).toContainEqual(
      expect.objectContaining({ command: "sidebandComments.deleteComment", group: "inline@3" })
    );
  });

  it("contributes show and hide controls for resolved threads", () => {
    expect(manifest.contributes.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "sidebandComments.showResolved" }),
      expect.objectContaining({ command: "sidebandComments.hideResolved" })
    ]));
    expect(manifest.contributes.menus["view/title"]).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "sidebandComments.showResolved", when: expect.stringContaining("workbench.panel.comments") }),
      expect.objectContaining({ command: "sidebandComments.hideResolved", when: expect.stringContaining("workbench.panel.comments") })
    ]));
  });

  it("does not require a separate original-text diff action", () => {
    expect(manifest.contributes.commands?.some(
      (command) => command.command === "sidebandComments.showOriginalDiff"
    )).toBe(false);
  });
});
