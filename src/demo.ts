import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanRegisteredRoots } from "./indexer";
import { addOrUpdateRegistration, defaultStatePath, emptyState, replaceIndex } from "./state";
import type { StateDoc } from "./types";

export function demoManifestRoot(): string {
  return fileURLToPath(new URL("../demo", import.meta.url));
}

export function defaultDemoStatePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.HTML_HOME_DEMO_STATE && env.HTML_HOME_DEMO_STATE.length > 0) return env.HTML_HOME_DEMO_STATE;
  return join(dirname(defaultStatePath(env)), "demo-state.json");
}

export async function buildDemoState(now = new Date()): Promise<StateDoc> {
  const root = demoManifestRoot();
  let state = addOrUpdateRegistration(emptyState(), root, now);
  const scanned = await scanRegisteredRoots(state.registrations, now, state.index);
  state = replaceIndex(state, scanned.index, scanned.diagnostics, scanned.index.generatedAt ?? now.toISOString());
  return state;
}
