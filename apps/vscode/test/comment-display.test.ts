import { describe, expect, it } from "vitest";
import { commentBodyWithOriginalText } from "../src/comment-display.js";

describe("commentBodyWithOriginalText", () => {
  it("shows the creation-time original above the first comment", () => {
    expect(commentBodyWithOriginalText("old first line\nold second line", "Please revise this.")).toBe(
      "**Original text**\n\n> old first line\n> old second line\n\n---\n\n**Comment**\n\nPlease revise this."
    );
  });

  it("leaves reply bodies unchanged when no original is supplied", () => {
    expect(commentBodyWithOriginalText(undefined, "Reply")).toBe("Reply");
  });
});
