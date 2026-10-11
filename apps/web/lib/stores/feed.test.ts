import type { ContentHash } from "@hive/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LockedError } from "@/lib/hive/memoryView";

const preview = vi.fn();
vi.mock("@/lib/hive/client", () => ({ getHiveClient: async () => ({ memory: { preview, history: vi.fn() } }) }));

import { useFeed } from "./feed";

const hash = ("0x" + "ab".repeat(32)) as ContentHash;
const other = ("0x" + "cd".repeat(32)) as ContentHash;

beforeEach(() => {
  preview.mockReset();
  useFeed.getState().reset();
});

describe("previews", () => {
  it("keeps the decrypted memory, and doesn't fetch it twice", async () => {
    preview.mockResolvedValue({ content: "hello", gist: "greeting" });
    await useFeed.getState().loadPreview(hash);
    await useFeed.getState().loadPreview(hash);
    expect(useFeed.getState().previews[hash]).toEqual({ content: "hello", gist: "greeting" });
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it("marks a memory locked while the keys are locked, and doesn't retry on its own", async () => {
    preview.mockRejectedValue(new LockedError());
    await useFeed.getState().loadPreview(hash);
    await useFeed.getState().loadPreview(hash);
    expect(useFeed.getState().previews[hash]).toBe("locked");
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it("retryLocked reads the locked ones once the keys are there, and leaves the rest alone", async () => {
    preview.mockRejectedValueOnce(new LockedError()).mockRejectedValueOnce(new Error("boom"));
    await useFeed.getState().loadPreview(hash);
    await useFeed.getState().loadPreview(other);
    expect(useFeed.getState().previews).toMatchObject({ [hash]: "locked", [other]: "error" });

    preview.mockResolvedValue({ content: "now readable" });
    useFeed.getState().retryLocked();
    await vi.waitFor(() => expect(useFeed.getState().previews[hash]).toEqual({ content: "now readable" }));
    expect(useFeed.getState().previews[other]).toBe("error");
    expect(preview).toHaveBeenCalledTimes(3);
  });

  it("drops a decrypt that finishes after sign-out", async () => {
    let finish!: (v: { content: string }) => void;
    preview.mockReturnValue(new Promise((r) => (finish = r)));
    const pending = useFeed.getState().loadPreview(hash);
    await vi.waitFor(() => expect(preview).toHaveBeenCalled());
    useFeed.getState().reset();
    finish({ content: "plaintext that must not come back" });
    await pending;
    expect(useFeed.getState().previews).toEqual({});
  });
});
