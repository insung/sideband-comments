import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface ExtensionManifest {
  contributes: {
    commands?: Array<{ command: string; title: string }>;
    viewsContainers?: { activitybar?: Array<{ id: string; title: string }> };
    views?: Record<string, Array<{ id: string; name: string; contextualTitle?: string }>>;
    menus: Record<string, Array<{ command: string; group: string; when?: string }>>;
  };
}

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as ExtensionManifest;

describe("VS Code contributions", () => {
  it("puts the Sideband Comments overview in the Primary Side Bar", () => {
    expect(manifest.contributes.viewsContainers?.activitybar).toContainEqual(
      expect.objectContaining({ id: "sidebandComments.overview", title: "Sideband Comments" })
    );
    expect(manifest.contributes.views?.["sidebandComments.overview"]).toContainEqual(
      expect.objectContaining({
        id: "sidebandComments.overviewView",
        name: "Sideband Comments",
        contextualTitle: "Sideband Comments"
      })
    );
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
});
