import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimitedFetch } from "../src/chain";

const res = (status: number) => new Response("{}", { status });

describe("rateLimitedFetch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a 429 and returns the later success", async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValueOnce(res(429)).mockResolvedValueOnce(res(429)).mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", f);
    const p = rateLimitedFetch("http://rpc");
    await vi.runAllTimersAsync();
    expect((await p).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("gives back the last 429 after the retries run out", async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockImplementation(async () => res(429));
    vi.stubGlobal("fetch", f);
    const p = rateLimitedFetch("http://rpc");
    await vi.runAllTimersAsync();
    expect((await p).status).toBe(429);
    expect(f).toHaveBeenCalledTimes(5);
  });

  it("retries a 200 batch response that carries a rate-limit error", async () => {
    vi.useFakeTimers();
    const limited = () => new Response(JSON.stringify([{ jsonrpc: "2.0", id: 1, error: { code: -32011, message: "requests limited to 15/sec" } }]), { status: 200 });
    const f = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(new Response(JSON.stringify([{ jsonrpc: "2.0", id: 1, result: "0x" }]), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const p = rateLimitedFetch("http://rpc");
    await vi.runAllTimersAsync();
    expect(await (await p).json()).toEqual([{ jsonrpc: "2.0", id: 1, result: "0x" }]);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not retry other statuses", async () => {
    const f = vi.fn().mockResolvedValue(res(500));
    vi.stubGlobal("fetch", f);
    expect((await rateLimitedFetch("http://rpc")).status).toBe(500);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
