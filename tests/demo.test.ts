import { describe, expect, test } from "bun:test";
import { buildDemoState, defaultDemoStatePath, demoManifestRoot } from "../src/demo";

describe("demo", () => {
  test("builds an isolated routable demo state", async () => {
    const state = await buildDemoState(new Date("2026-06-03T00:00:00Z"));
    const artifacts = state.index.projects.flatMap((project) => project.artifacts);

    expect(state.registrations).toHaveLength(1);
    expect(state.registrations[0].manifestRoot).toBe(demoManifestRoot());
    expect(artifacts.map((artifact) => artifact.artifactSlug)).toEqual([
      "graph-explorer",
      "incident-dashboard",
      "market-brief",
      "snippet-library"
    ]);
    expect(artifacts.every((artifact) => artifact.status === "ok")).toBe(true);
    expect(state.diagnostics).toEqual([]);
  });

  test("uses a separate demo state path", () => {
    const path = defaultDemoStatePath({
      HTML_HOME_STATE: "/tmp/html-home-state/state.json"
    });

    expect(path).toBe("/tmp/html-home-state/demo-state.json");
  });
});
