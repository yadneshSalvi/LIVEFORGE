import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);
const tokens = Object.fromEntries(
  [...css.matchAll(/--([a-z-]+)\s*:\s*(#[0-9a-f]{6})/gi)].map((match) => [
    match[1],
    match[2],
  ]),
);
function luminance(hex: string) {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return channels.reduce(
    (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
    0,
  );
}
function ratio(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
describe("the actual essential text palette", () => {
  for (const foreground of [
    "cream",
    "muted",
    "faint",
    "mint",
    "coral",
    "brass",
  ]) {
    for (const background of ["ink", "surface", "raised"]) {
      it(`${foreground} text on ${background} meets AA normal-text contrast`, () =>
        expect(
          ratio(tokens[foreground], tokens[background]),
        ).toBeGreaterThanOrEqual(4.5));
    }
  }
  it("primary action dark text is legible on mint", () =>
    expect(ratio("#14231e", tokens.mint)).toBeGreaterThanOrEqual(4.5));
});
