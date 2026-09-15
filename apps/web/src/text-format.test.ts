import { describe, expect, it } from "vitest";
import { applyStyleToRange, toBold, toItalic } from "./text-format";

describe("toBold", () => {
  it("maps letters and digits to their bold Unicode counterparts", () => {
    expect(toBold("Ab9")).toBe("𝗔𝗯𝟵");
  });

  it("leaves accents, punctuation, and spaces unchanged", () => {
    expect(toBold("café, sim!")).toBe("𝗰𝗮𝗳é, 𝘀𝗶𝗺!");
  });
});

describe("toItalic", () => {
  it("maps letters to their italic Unicode counterparts", () => {
    expect(toItalic("Ab")).toBe("𝘈𝘣");
  });

  it("leaves digits unchanged since no italic digit block exists", () => {
    expect(toItalic("v9")).toBe("𝘷9");
  });
});

describe("applyStyleToRange", () => {
  it("bolds only the selected substring, leaving the rest untouched", () => {
    const result = applyStyleToRange("hello world", 6, 11, "bold");
    expect(result).toBe("hello 𝘄𝗼𝗿𝗹𝗱");
  });

  it("italicizes only the selected substring", () => {
    const result = applyStyleToRange("hello world", 0, 5, "italic");
    expect(result).toBe("𝘩𝘦𝘭𝘭𝘰 world");
  });

  it("re-applying a different style overwrites the previous one (last style wins)", () => {
    // Styled characters are astral codepoints (UTF-16 surrogate pairs), so
    // "hello" now spans twice as many UTF-16 units as before — exactly what
    // a live DOM selection over the re-rendered text would also report.
    const bolded = applyStyleToRange("hello world", 0, 5, "bold");
    const boldedHelloUnits = bolded.length - " world".length;
    const reItalicized = applyStyleToRange(bolded, 0, boldedHelloUnits, "italic");
    expect(reItalicized).toBe("𝘩𝘦𝘭𝘭𝘰 world");
  });

  it("returns the text unchanged for an invalid or empty range", () => {
    expect(applyStyleToRange("hello", 3, 3, "bold")).toBe("hello");
    expect(applyStyleToRange("hello", -1, 3, "bold")).toBe("hello");
    expect(applyStyleToRange("hello", 2, 99, "bold")).toBe("hello");
  });
});
