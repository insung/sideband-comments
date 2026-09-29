import { captureAnchor, threadAtOffset } from "@sideband-comments/core";
import { describe, expect, it } from "vitest";
import { anchorRanges } from "../src/thread-focus.js";

const text = "Deploy with npm run deploy. Roll back with npm run rollback.";

const thread = (id: string, quote: string, source = text) => {
  const start = source.indexOf(quote);
  return { id, anchor: captureAnchor(source, start, start + quote.length) };
};

describe("anchorRanges", () => {
  it("places each comment on the text its anchor resolves to", () => {
    const ranges = anchorRanges(text, [thread("deploy", "npm run deploy"), thread("rollback", "Roll back")]);

    expect(ranges).toEqual([
      { id: "deploy", start: 12, end: 26 },
      { id: "rollback", start: 28, end: 37 }
    ]);
    expect(threadAtOffset(ranges, text.indexOf("run deploy"))).toBe("deploy");
  });

  it("leaves out comments whose anchor text is gone, so the cursor never points at them", () => {
    const orphan = thread("orphan", "old wording", "Some old wording here.");

    expect(anchorRanges(text, [orphan])).toEqual([]);
  });
});
