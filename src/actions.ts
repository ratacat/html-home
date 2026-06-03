import { appendFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { IndexedAction, IndexSnapshot } from "./types";

export type ActionServerConfig = {
  statePath: string;
  actionsEnabled?: boolean;
  requestBodyLimitBytes?: number;
  stdoutLimitBytes?: number;
  stderrLimitBytes?: number;
  auditPath?: string;
};

type ActionRoute = {
  projectSlug: string;
  artifactSlug: string;
  actionSlug: string;
};

type RunResult = {
  status: number;
  body: unknown;
  exitCode?: number;
  timedOut?: boolean;
};

const ACTION_HEADER = "x-html-home-action";
const ACTION_HEADER_VALUE = "1";
const DEFAULT_BODY_LIMIT_BYTES = 256 * 1024;
const DEFAULT_STDOUT_LIMIT_BYTES = 256 * 1024;
const DEFAULT_STDERR_LIMIT_BYTES = 64 * 1024;
const ACTIVE_ACTIONS = new Set<string>();

export async function handleActionRequest(
  request: Request,
  index: IndexSnapshot,
  route: ActionRoute,
  config: ActionServerConfig
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, { Allow: "POST" });
  }
  if (!config.actionsEnabled) {
    return jsonResponse({ ok: false, error: "actions_disabled" }, 403);
  }
  if (!localHostAllowed(request)) {
    return jsonResponse({ ok: false, error: "non_local_host" }, 403);
  }
  if (!sameOriginAllowed(request)) {
    return jsonResponse({ ok: false, error: "origin_not_allowed" }, 403);
  }
  if (request.headers.get(ACTION_HEADER) !== ACTION_HEADER_VALUE) {
    return jsonResponse({ ok: false, error: "missing_action_header" }, 403);
  }
  if (!jsonContentType(request.headers.get("content-type"))) {
    return jsonResponse({ ok: false, error: "unsupported_media_type" }, 415);
  }

  const resolved = resolveAction(index, route);
  if (!resolved.ok) {
    return jsonResponse({ ok: false, error: resolved.error }, resolved.status);
  }

  const bodyText = await readRequestText(request, config.requestBodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES);
  if (!bodyText.ok) {
    return jsonResponse({ ok: false, error: "request_too_large" }, 413);
  }

  let input: unknown;
  try {
    input = bodyText.text.length === 0 ? {} : JSON.parse(bodyText.text);
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!isRecord(input)) {
    return jsonResponse({ ok: false, error: "invalid_action_input", message: "Action input must be a JSON object." }, 400);
  }

  const activeKey = actionKey(route);
  if (ACTIVE_ACTIONS.has(activeKey)) {
    return jsonResponse({ ok: false, error: "action_in_progress" }, 409);
  }

  const runId = actionRunId();
  const startedAt = new Date();
  ACTIVE_ACTIONS.add(activeKey);
  try {
    let result: RunResult;
    try {
      result = await runAction(resolved.action, input, {
        runId,
        stdoutLimitBytes: config.stdoutLimitBytes ?? DEFAULT_STDOUT_LIMIT_BYTES,
        stderrLimitBytes: config.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT_BYTES
      });
    } catch (err) {
      result = {
        status: 502,
        body: {
          ok: false,
          error: "action_launch_failed",
          message: boundedMessage(err instanceof Error ? err.message : String(err))
        }
      };
    }
    await appendAudit(config, {
      run_id: runId,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      project: route.projectSlug,
      artifact: route.artifactSlug,
      action: route.actionSlug,
      cwd: resolved.action.cwd,
      command: resolved.action.command,
      status: result.status,
      exit_code: result.exitCode ?? null,
      timed_out: result.timedOut ?? false,
      request_sha256: sha256(bodyText.text),
      body_bytes: new TextEncoder().encode(bodyText.text).byteLength
    });
    return jsonResponse(result.body, result.status);
  } finally {
    ACTIVE_ACTIONS.delete(activeKey);
  }
}

export function auditPathForState(statePath: string): string {
  return join(dirname(statePath), "actions.jsonl");
}

async function runAction(
  action: IndexedAction,
  input: Record<string, unknown>,
  options: { runId: string; stdoutLimitBytes: number; stderrLimitBytes: number }
): Promise<RunResult> {
  const proc = Bun.spawn(action.command, {
    cwd: action.cwd,
    env: {
      ...process.env,
      HTML_HOME_ACTION_RUN_ID: options.runId,
      HTML_HOME_PROJECT: action.projectSlug,
      HTML_HOME_ARTIFACT: action.artifactSlug,
      HTML_HOME_ACTION: action.actionSlug
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });

  if (proc.stdin) {
    proc.stdin.write(`${JSON.stringify(input)}\n`);
    proc.stdin.end();
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGTERM");
  }, action.timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readStreamText(proc.stdout, options.stdoutLimitBytes),
      readStreamText(proc.stderr, options.stderrLimitBytes),
      proc.exited
    ]);
    if (timedOut) {
      return { status: 504, body: { ok: false, error: "action_timeout" }, exitCode, timedOut };
    }
    if (!stdout.ok) {
      proc.kill("SIGTERM");
      return { status: 502, body: { ok: false, error: "action_stdout_too_large" }, exitCode };
    }
    if (!stderr.ok) {
      proc.kill("SIGTERM");
      return { status: 502, body: { ok: false, error: "action_stderr_too_large" }, exitCode };
    }
    if (exitCode !== 0) {
      return {
        status: 502,
        body: {
          ok: false,
          error: "action_failed",
          message: boundedMessage(stderr.text || stdout.text || `command exited ${exitCode}`)
        },
        exitCode
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout.text);
    } catch {
      return { status: 502, body: { ok: false, error: "invalid_action_stdout" }, exitCode };
    }
    if (!isRecord(parsed)) {
      return { status: 502, body: { ok: false, error: "invalid_action_stdout" }, exitCode };
    }
    if (typeof parsed.status === "number" && Number.isInteger(parsed.status) && parsed.status >= 100 && parsed.status <= 599 && "body" in parsed) {
      return { status: parsed.status, body: parsed.body, exitCode };
    }
    return { status: 200, body: parsed, exitCode };
  } finally {
    clearTimeout(timer);
  }
}

function resolveAction(
  index: IndexSnapshot,
  route: ActionRoute
): { ok: true; action: IndexedAction } | { ok: false; status: number; error: string } {
  const projectMatches = index.projects.filter((project) => project.projectSlug === route.projectSlug);
  if (projectMatches.length === 0) return { ok: false, status: 404, error: "project_not_found" };

  const artifactMatches = projectMatches.flatMap((project) =>
    project.artifacts.filter((artifact) => artifact.artifactSlug === route.artifactSlug)
  );
  if (artifactMatches.length === 0) return { ok: false, status: 404, error: "artifact_not_found" };
  if (artifactMatches.length > 1 || artifactMatches.some((artifact) => artifact.status !== "ok")) {
    return { ok: false, status: 409, error: "artifact_not_routable" };
  }

  const actionMatches = (artifactMatches[0].actions ?? []).filter((action) => action.actionSlug === route.actionSlug);
  if (actionMatches.length === 0) return { ok: false, status: 404, error: "action_not_found" };
  if (actionMatches.length > 1 || actionMatches[0].status !== "ok") {
    return { ok: false, status: 409, error: "action_not_routable" };
  }
  return { ok: true, action: actionMatches[0] };
}

async function readRequestText(request: Request, limitBytes: number): Promise<{ ok: true; text: string } | { ok: false }> {
  if (!request.body) return { ok: true, text: "" };
  return readStreamText(request.body, limitBytes);
}

async function readStreamText(stream: ReadableStream<Uint8Array>, limitBytes: number): Promise<{ ok: true; text: string } | { ok: false; text: string }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > limitBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, text: decodeChunks(chunks) };
    }
    chunks.push(next.value);
  }
  return { ok: true, text: decodeChunks(chunks) };
}

function decodeChunks(chunks: Uint8Array[]): string {
  return new TextDecoder().decode(concat(chunks));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return all;
}

async function appendAudit(config: ActionServerConfig, entry: Record<string, unknown>): Promise<void> {
  const path = config.auditPath ?? auditPathForState(config.statePath);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
}

function jsonResponse(body: unknown, status: number, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(extraHeaders ?? {})
    }
  });
}

function localHostAllowed(request: Request): boolean {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function sameOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    return originUrl.protocol === requestUrl.protocol && originUrl.host === requestUrl.host;
  } catch {
    return false;
  }
}

function jsonContentType(value: string | null): boolean {
  return value?.toLowerCase().split(";")[0].trim() === "application/json";
}

function actionKey(route: ActionRoute): string {
  return `${route.projectSlug}/${route.artifactSlug}/${route.actionSlug}`;
}

function actionRunId(): string {
  return `act_${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedMessage(value: string): string {
  return value.trim().slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
