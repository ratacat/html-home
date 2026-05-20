import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emptyState, loadState, saveStateAtomic } from "../src/state";

async function tempStatePath() {
  const dir = await mkdtemp(join(tmpdir(), "html-home-state-"));
  return join(dir, "state.json");
}

describe("state", () => {
  test("loads missing state as an empty state with diagnostic", async () => {
    const statePath = await tempStatePath();

    const result = await loadState(statePath);

    expect(result.state.registrations).toEqual([]);
    expect(result.state.index.projects).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toContain("missing_state");
  });

  test("writes state atomically and reloads complete JSON", async () => {
    const statePath = await tempStatePath();
    const state = emptyState();
    state.registrations.push({
      registrationId: "r1",
      manifestRoot: "/tmp/root",
      manifestPath: "/tmp/root/.html-home.json",
      addedAt: "2026-05-20T00:00:00.000Z",
      lastScanAt: null,
      status: "ok",
      diagnostics: []
    });

    await saveStateAtomic(statePath, state);

    const raw = await readFile(statePath, "utf8");
    expect(JSON.parse(raw).registrations[0].manifestRoot).toBe("/tmp/root");
    const loaded = await loadState(statePath);
    expect(loaded.state.registrations[0].registrationId).toBe("r1");
  });
});
