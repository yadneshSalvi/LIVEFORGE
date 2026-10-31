import { describe, expect, it } from "vitest";
import { StudioViewFence } from "../src/lib/view-fence";

describe("studio view request fencing", () => {
  it("ignores an old current-show or lease response after create/resume completes", async () => {
    const fence = new StudioViewFence();
    let resolve!: (id: string) => void;
    const oldRequest = new Promise<string>((done) => {
      resolve = done;
    });
    const ticket = fence.ticket("old-show")!;
    const transition = fence.begin();
    expect(fence.ticket("old-show")).toBeNull();
    let visible = "new-show";
    fence.finish(transition);
    resolve("old-show");
    const response = await oldRequest;
    if (fence.accepts(ticket, visible, response)) visible = response;
    expect(visible).toBe("new-show");
    const fresh = fence.ticket(visible)!;
    expect(fence.accepts(fresh, visible, "new-show")).toBe(true);
  });

  it("does not adopt a different show when another tab changes the session cookie", () => {
    const fence = new StudioViewFence();
    const ticket = fence.ticket("this-tab")!;
    expect(fence.accepts(ticket, "this-tab", "other-tab")).toBe(false);
  });

  it("an older transition cannot reopen polling during a newer transition", () => {
    const fence = new StudioViewFence();
    const older = fence.begin();
    const newer = fence.begin();
    fence.finish(older);
    expect(fence.ticket("newer")).toBeNull();
    fence.finish(newer);
    expect(fence.ticket("newer")).not.toBeNull();
  });
});
