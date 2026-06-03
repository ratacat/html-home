import { describe, expect, test } from "bun:test";
import { normalizeBaseUrl, resolveServeUrl } from "../src/url";

describe("url", () => {
  test("uses localhost for loopback binds", () => {
    const plan = resolveServeUrl({ host: "127.0.0.1", port: 8765 });

    expect(plan.baseUrl).toBe("http://localhost:8765/");
    expect(plan.notes).toEqual([]);
  });

  test("accepts explicit custom origins", () => {
    const plan = resolveServeUrl({ host: "127.0.0.1", port: 8765, baseUrl: "home.html:8765" });

    expect(plan.baseUrl).toBe("http://home.html:8765/");
    expect(plan.notes).toContain("custom base URL configured");
  });

  test("does not present wildcard binds as openable URLs", () => {
    const plan = resolveServeUrl({ host: "0.0.0.0", port: 8765 });

    expect(plan.baseUrl).not.toContain("0.0.0.0");
    expect(plan.notes).toContain("bound to all interfaces; use --base-url for a LAN or Tailscale name");
  });

  test("rejects pathful base URLs", () => {
    expect(() => normalizeBaseUrl("http://home.html:8765/path")).toThrow("base URL must be an origin");
  });
});
