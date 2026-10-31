import { describe, it, expect } from "vitest";
import { followHighJumpCamera } from "../src/game/renderer";
describe("presentation-only high-jump camera", () => {
  it("preserves original framing for ordinary walking and baseline jumps", () => {
    for (const y of [400, 350, 270, 440, 520])
      expect(followHighJumpCamera(0, y, 48)).toBe(0);
  });
  it("immediately keeps a restored moon-jump courier below the HUD and above the footer", () => {
    for (const y of [-23.1, -45, -500, -1500]) {
      const camera = followHighJumpCamera(0, y, 48);
      expect(y - camera).toBeGreaterThanOrEqual(120);
      expect(y + 48 - camera).toBeLessThanOrEqual(560);
    }
  });
  it("keeps a giant visible through upward motion and return while restoring ordinary framing", () => {
    let camera = 0;
    for (const y of [400, 130, 20, -100, -800, -100, 20, 200, 400]) {
      camera = followHighJumpCamera(camera, y, 76.8);
      expect(y - camera).toBeGreaterThanOrEqual(120);
      expect(y + 76.8 - camera).toBeLessThanOrEqual(560);
    }
    for (let frame = 0; frame < 150; frame++)
      camera = followHighJumpCamera(camera, 400, 48);
    expect(camera).toBeCloseTo(0, 5);
  });
  it("uses immediate framing for reduced motion and never changes the supplied world coordinates", () => {
    expect(followHighJumpCamera(0, -45, 48, true)).toBe(-225);
    expect(followHighJumpCamera(-225, 400, 48, true)).toBe(0);
  });
});
