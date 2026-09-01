import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface ExtensionManifest {
  contributes: {
    viewsContainers?: { secondarySidebar?: Array<{ id: string; title: string }> };
    views?: Record<string, Array<{ id: string; name: string; contextualTitle?: string }>>;
    menus: { "editor/context": Array<{ command: string; group: string }> };
  };
}

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as ExtensionManifest;

describe("VS Code contributions", () => {
  it("puts the Sideband Comments view in the Secondary Side Bar", () => {
    expect(manifest.contributes.viewsContainers?.secondarySidebar).toContainEqual(
      expect.objectContaining({ id: "sidebandComments", title: "Sideband Comments" })
    );
    expect(manifest.contributes.views?.sidebandComments).toContainEqual(
      expect.objectContaining({
        id: "sidebandComments.comments",
        name: "Sideband Comments",
        contextualTitle: "Sideband Comments"
      })
    );
  });

  it("places Add Comment near the bottom of the editor context menu", () => {
    const item = manifest.contributes.menus["editor/context"].find(
      (candidate) => candidate.command === "sidebandComments.add"
    );
    expect(item?.group).toBe("z_commands@100");
  });
});
