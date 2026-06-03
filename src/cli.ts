#!/usr/bin/env bun
import { access, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { scanRegisteredRoots } from "./indexer";
import { serve } from "./server";
import {
  addOrUpdateRegistration,
  defaultStatePath,
  loadState,
  removeRegistration,
  replaceIndex,
  saveStateAtomic
} from "./state";
import type { Diagnostic, StateDoc } from "./types";
import { resolveServeUrl } from "./url";

type CliIO = {
  env?: NodeJS.ProcessEnv;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
};

export async function runCli(args: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((line) => console.log(line));
  const stderr = io.stderr ?? ((line) => console.error(line));
  const env = io.env ?? process.env;
  const statePath = defaultStatePath(env);
  const [command, ...rest] = args;

  try {
    switch (command) {
      case "register":
        return await cmdRegister(rest, statePath, stdout, stderr);
      case "rescan":
        return await cmdRescan(statePath, stdout);
      case "unregister":
        return await cmdUnregister(rest, statePath, stdout, stderr);
      case "list":
        return await cmdList(statePath, stdout);
      case "doctor":
        return await cmdDoctor(statePath, stdout);
      case "serve":
        return await cmdServe(rest, statePath, stdout, env, {
          defaultPort: "8765",
          label: "html-home serving"
        });
      case "--help":
      case "-h":
      case undefined:
        stdout(helpText());
        return command ? 0 : 1;
      default:
        stderr(`unknown command: ${command}`);
        stderr(helpText());
        return 2;
    }
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

async function cmdRegister(args: string[], statePath: string, stdout: (line: string) => void, stderr: (line: string) => void) {
  const target = args[0];
  if (!target) {
    stderr("usage: html-home register <path>");
    return 1;
  }
  const root = await canonicalDirectory(target);
  if (!root.ok) {
    stderr(root.message);
    return 1;
  }
  try {
    await access(join(root.path, ".html-home.json"));
  } catch {
    stderr(`missing .html-home.json in ${root.path}`);
    return 1;
  }

  let state = (await loadState(statePath)).state;
  const already = state.registrations.some((registration) => registration.manifestRoot === root.path);
  state = addOrUpdateRegistration(state, root.path);
  const scanned = await scanRegisteredRoots(state.registrations, new Date(), state.index);
  state = replaceIndex(state, scanned.index, scanned.diagnostics, scanned.index.generatedAt ?? new Date().toISOString());
  await saveStateAtomic(statePath, state);

  stdout(`${already ? "already registered" : "registered"} ${root.path}`);
  stdout(summaryLine(state));
  printDiagnostics(scanned.diagnostics, stdout);
  return 0;
}

async function cmdRescan(statePath: string, stdout: (line: string) => void) {
  const loaded = await loadState(statePath);
  let state = loaded.state;
  const scanned = await scanRegisteredRoots(state.registrations, new Date(), state.index);
  state = replaceIndex(state, scanned.index, scanned.diagnostics, scanned.index.generatedAt ?? new Date().toISOString());
  await saveStateAtomic(statePath, state);
  stdout(`scanned ${state.registrations.length} roots`);
  stdout(summaryLine(state));
  printDiagnostics(scanned.diagnostics, stdout);
  return 0;
}

async function cmdUnregister(args: string[], statePath: string, stdout: (line: string) => void, stderr: (line: string) => void) {
  const target = args[0];
  if (!target) {
    stderr("usage: html-home unregister <path>");
    return 1;
  }
  const root = await canonicalPath(target);
  const loaded = await loadState(statePath);
  const existing = loaded.state.registrations.find((registration) => registration.manifestRoot === root);
  if (!existing) {
    stderr(`not registered: ${root}`);
    return 1;
  }
  const state = removeRegistration(loaded.state, root);
  await saveStateAtomic(statePath, state);
  stdout(`unregistered ${root}`);
  stdout(summaryLine(state));
  return 0;
}

async function cmdList(statePath: string, stdout: (line: string) => void) {
  const { state } = await loadState(statePath);
  if (state.registrations.length === 0) {
    stdout("No registered manifest roots.");
    return 1;
  }
  stdout(`html-home`);
  stdout(`state: ${statePath}`);
  stdout(summaryLine(state));
  for (const project of state.index.projects) {
    stdout("");
    stdout(`${project.projectSlug}  ${project.manifestRoot}`);
    for (const artifact of project.artifacts) {
      stdout(`  ${artifact.status.padEnd(26)} ${artifact.projectSlug}/${artifact.artifactSlug}  ${artifact.artifactPath}`);
      if (artifact.diagnostics[0]) {
        stdout(`    ${artifact.diagnostics[0].code}: ${artifact.diagnostics[0].message}`);
      }
    }
  }
  return 0;
}

async function cmdDoctor(statePath: string, stdout: (line: string) => void) {
  const { state } = await loadState(statePath);
  const scanned = await scanRegisteredRoots(state.registrations, new Date(), state.index);
  const blocking = scanned.diagnostics.filter((diag) => diag.severity === "blocked");
  stdout(`doctor: ${blocking.length} blocking issues, ${scanned.diagnostics.length - blocking.length} warnings/info`);
  printDiagnostics(scanned.diagnostics, stdout);
  return blocking.length > 0 ? 1 : 0;
}

type ServeOptions = {
  defaultPort: string;
  label: string;
  baseUrl?: string;
  catalogLabel?: string;
};

async function cmdServe(args: string[], statePath: string, stdout: (line: string) => void, env: NodeJS.ProcessEnv, options: ServeOptions) {
  const actionsEnabled = args.includes("--actions");
  const host = flagValue(args, "--host") ?? "127.0.0.1";
  const portText = flagValue(args, "--port") ?? options.defaultPort;
  const baseUrl = options.baseUrl ?? flagValue(args, "--base-url") ?? env.HTML_HOME_BASE_URL;
  const port = Number.parseInt(portText, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid port: ${portText}`);
  }
  if (actionsEnabled && (host === "0.0.0.0" || host === "::")) {
    throw new Error("action mode requires a loopback host; pass a loopback --host");
  }
  const urlPlan = resolveServeUrl({ host, port, baseUrl });
  const server = serve({ statePath, actionsEnabled, publicBaseUrl: urlPlan.baseUrl, catalogLabel: options.catalogLabel }, { host, port });
  stdout(options.label);
  stdout(`start page: ${urlPlan.baseUrl}`);
  if (server.hostname !== host || server.port !== port) stdout(`bound: http://${server.hostname}:${server.port}/`);
  for (const note of urlPlan.notes) stdout(`note: ${note}`);
  if (actionsEnabled) stdout("actions: enabled");
  stdout(`state: ${statePath}`);
  stdout("Press Ctrl-C to stop.");
  await new Promise(() => undefined);
  return 0;
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function summaryLine(state: StateDoc): string {
  const artifacts = state.index.projects.flatMap((project) => project.artifacts);
  const blocked = artifacts.filter((artifact) => artifact.status !== "ok").length;
  return `${state.registrations.length} roots, ${artifacts.length} artifacts, ${artifacts.length - blocked} routable, ${blocked} blocked`;
}

function printDiagnostics(diagnostics: Diagnostic[], stdout: (line: string) => void) {
  if (diagnostics.length === 0) return;
  stdout("");
  stdout("diagnostics:");
  for (const diag of diagnostics.slice(0, 20)) {
    const owner = diag.routeKey ?? diag.projectSlug ?? diag.path ?? diag.scope;
    stdout(`  ${owner}  ${diag.code}  ${diag.message}`);
  }
  if (diagnostics.length > 20) {
    stdout(`  ...and ${diagnostics.length - 20} more`);
  }
}

async function canonicalDirectory(path: string): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  try {
    const resolved = await realpath(path);
    const stats = await stat(resolved);
    if (!stats.isDirectory()) return { ok: false, message: `not a directory: ${path}` };
    return { ok: true, path: resolved };
  } catch {
    return { ok: false, message: `path does not exist: ${path}` };
  }
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

function helpText() {
  return `usage: html-home <command>

commands:
  register <path>      register a manifest root
  rescan               rebuild local state from registered roots
  unregister <path>    remove a manifest root registration
  list                 print indexed projects and artifacts
  doctor               live validation without writing state
  serve [--host H] [--port P] [--base-url URL] [--actions]
`;
}

if (import.meta.main) {
  const code = await runCli(Bun.argv.slice(2));
  process.exit(code);
}
