import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir, platform, tmpdir } from "node:os";
import { diagnostic, type Diagnostic, type Registration, type StateDoc } from "./types";

export type LoadedState = {
  state: StateDoc;
  diagnostics: Diagnostic[];
};

export function emptyState(): StateDoc {
  return {
    schemaVersion: 1,
    registrations: [],
    index: {
      generatedAt: null,
      projects: []
    },
    diagnostics: []
  };
}

export function defaultStatePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.HTML_HOME_STATE && env.HTML_HOME_STATE.length > 0) return env.HTML_HOME_STATE;
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "html-home", "state.json");
  if (platform() === "win32") {
    const base = env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(base, "html-home", "state.json");
  }
  const base = env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(base, "html-home", "state.json");
}

export async function loadState(statePath = defaultStatePath()): Promise<LoadedState> {
  try {
    const text = await readFile(statePath, "utf8");
    const parsed = JSON.parse(text);
    const validation = validateState(parsed, statePath);
    if (!validation.ok) {
      const state = emptyState();
      state.diagnostics = validation.diagnostics;
      return { state, diagnostics: validation.diagnostics };
    }
    return { state: validation.state, diagnostics: [] };
  } catch (error) {
    const code = (error as { code?: string }).code;
    const diag = diagnostic({
      severity: code === "ENOENT" ? "info" : "blocked",
      code: code === "ENOENT" ? "missing_state" : "state_read_error",
      message: code === "ENOENT" ? "Local state does not exist yet." : "Local state could not be read.",
      hint: code === "ENOENT" ? "Run html-home register <path> to create state." : "Check state file permissions.",
      scope: "state",
      path: statePath
    });
    const state = emptyState();
    state.diagnostics = [diag];
    return { state, diagnostics: [diag] };
  }
}

export async function saveStateAtomic(statePath: string, state: StateDoc): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  const tempPath = join(dirname(statePath), `.state-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  const text = `${JSON.stringify(state, null, 2)}\n`;
  try {
    await writeFile(tempPath, text, "utf8");
    await rename(tempPath, statePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function addOrUpdateRegistration(state: StateDoc, manifestRoot: string, now = new Date()): StateDoc {
  const manifestPath = join(manifestRoot, ".html-home.json");
  const existing = state.registrations.find((registration) => registration.manifestRoot === manifestRoot);
  if (existing) {
    return {
      ...state,
      registrations: state.registrations.map((registration) =>
        registration.manifestRoot === manifestRoot
          ? {
              ...registration,
              manifestPath,
              status: "ok"
            }
          : registration
      )
    };
  }
  const registration: Registration = {
    registrationId: registrationIdFor(manifestRoot),
    manifestRoot,
    manifestPath,
    addedAt: now.toISOString(),
    lastScanAt: null,
    status: "ok",
    diagnostics: []
  };
  return {
    ...state,
    registrations: [...state.registrations, registration].sort((a, b) => a.manifestRoot.localeCompare(b.manifestRoot))
  };
}

export function removeRegistration(state: StateDoc, manifestRoot: string): StateDoc {
  const registration = state.registrations.find((item) => item.manifestRoot === manifestRoot);
  if (!registration) return state;
  return {
    ...state,
    registrations: state.registrations.filter((item) => item.registrationId !== registration.registrationId),
    index: {
      ...state.index,
      projects: state.index.projects
        .filter((project) => project.registrationId !== registration.registrationId)
        .map((project) => ({
          ...project,
          artifacts: project.artifacts.filter((artifact) => artifact.registrationId !== registration.registrationId)
        }))
    },
    diagnostics: state.diagnostics.filter((diag) => diag.registrationId !== registration.registrationId)
  };
}

export function replaceIndex(state: StateDoc, index: StateDoc["index"], diagnostics: Diagnostic[], scanTime: string): StateDoc {
  return {
    ...state,
    registrations: state.registrations.map((registration) => ({
      ...registration,
      lastScanAt: scanTime
    })),
    index,
    diagnostics
  };
}

function validateState(value: unknown, statePath: string): { ok: true; state: StateDoc } | { ok: false; diagnostics: Diagnostic[] } {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.registrations) || !isRecord(value.index)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic({
          severity: "blocked",
          code: "invalid_state",
          message: "Local state is malformed.",
          hint: "Move or repair state.json, then run html-home rescan.",
          scope: "state",
          path: statePath
        })
      ]
    };
  }

  return { ok: true, state: value as StateDoc };
}

function registrationIdFor(manifestRoot: string): string {
  let hash = 5381;
  for (let index = 0; index < manifestRoot.length; index += 1) {
    hash = ((hash << 5) + hash + manifestRoot.charCodeAt(index)) >>> 0;
  }
  return `reg-${hash.toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
