# Local Action Gateway Proposal

## Summary

Add an optional local action gateway to `html-home`.

The gateway lets a static artifact submit a small, declared action through the same `html-home` server that serves the artifact. `html-home` validates the request, runs a manifest-declared local command, returns JSON, and records an audit entry. Source projects keep their business logic; `html-home` owns the single local HTTP port and the safety boundary.

This solves the "one artifact, one extra API server" problem without turning `html-home` into a project backend.

## Problem

Some generated HTML artifacts are useful only when they can trigger a local operation.

Example: `pmknb` generates a cockpit artifact with buttons for operator actions. The artifact can render through `html-home`, but the buttons currently need a separate `pmknb` API server to accept POST requests and call project code. That creates two local servers:

- `html-home` serves the static cockpit.
- `pmknb` serves `/api/operator/...` for button actions.

The split works, but it weakens the main `html-home` value: one local front door for many generated tools.

## Goals

- Serve static artifacts and artifact actions through one local HTTP process.
- Keep project logic in the source project.
- Declare every callable action in `.html-home.json`.
- Run actions with structured JSON input and structured JSON output.
- Make browser actions same-origin with the artifact URL.
- Keep action execution explicit, local, auditable, and bounded.

## Non-Goals

- Do not proxy arbitrary project dev servers.
- Do not add a general plugin system.
- Do not run project build, watch, or lifecycle processes.
- Do not expose actions on public or untrusted networks.
- Do not accept shell strings from manifests or requests.
- Do not let artifacts call undeclared commands.

## Product Model

`html-home` remains an artifact host. The new concept is an **action**.

An action is a manifest-declared local command attached to one artifact. The browser can invoke that action through a stable route:

```text
POST /api/actions/:project/:artifact/:action
```

The route maps to a manifest entry. The manifest entry maps to an argv array and a working directory. The request body is passed to the command as JSON on stdin. The command returns JSON on stdout.

This is a command gateway, not a backend framework. It centralizes HTTP serving and local authorization while leaving domain behavior in the project.

## Manifest Contract

Add an optional `actions` field to artifact entries. This requires manifest version `2`.

```json
{
  "version": 2,
  "project": {
    "slug": "pmknb",
    "title": "PMKNB"
  },
  "artifacts": [
    {
      "slug": "cockpit",
      "title": "PMKNB Cockpit",
      "path": "cockpit",
      "entry": "index.html",
      "tags": ["prediction-markets", "dashboard", "local"],
      "actions": [
        {
          "slug": "operator-action",
          "title": "Operator Action",
          "command": ["bun", "src/workflow/operator-action-http.ts"],
          "cwd": "/Users/jaredsmith/Projects/pmknb",
          "input": "json-stdin",
          "timeout_ms": 30000
        }
      ]
    }
  ]
}
```

Rules:

- `actions` is optional.
- `action.slug` uses the same slug grammar as projects and artifacts.
- `command` is a non-empty argv array.
- `command[0]` resolves through the normal process environment.
- `cwd` is required and must resolve to an existing directory.
- `input` starts with one value: `json-stdin`.
- `timeout_ms` defaults to `10000` and has a maximum such as `60000`.
- Unknown action fields fail manifest validation.

The manifest never contains shell strings, environment secrets, request-derived argv fragments, or long-running service definitions.

## HTTP API

### Invoke Action

```http
POST /api/actions/pmknb/cockpit/operator-action
Content-Type: application/json
X-Html-Home-Action: 1
```

Request body:

```json
{
  "kind": "candidate",
  "id": "cand:fed-rates",
  "action": "dismiss",
  "projectionGeneratedAt": "2026-05-22T16:00:00.000Z"
}
```

Success response:

```json
{
  "ok": true,
  "run_id": "act_20260522_160001_abcd1234",
  "result": {
    "ok": true,
    "subject": "candidate",
    "id": "cand:fed-rates",
    "action": "dismiss"
  }
}
```

Failure response:

```json
{
  "ok": false,
  "error": "action_failed",
  "run_id": "act_20260522_160001_abcd1234",
  "message": "candidate already has operator action accept: cand:fed-rates"
}
```

Status codes:

- `200` for successful command completion.
- `400` for invalid JSON or invalid action input.
- `403` for failed local authorization.
- `404` for unknown project, artifact, or action.
- `405` for unsupported methods.
- `409` for project-reported conflict.
- `504` for timeout.

## Execution Contract

`html-home` launches the declared command with:

- `cwd` from the action manifest.
- JSON request body on stdin.
- A generated `HTML_HOME_ACTION_RUN_ID`.
- `HTML_HOME_PROJECT`, `HTML_HOME_ARTIFACT`, and `HTML_HOME_ACTION`.

The command writes one JSON object to stdout. `html-home` parses stdout and returns it under `result`. Stderr is captured for diagnostics and audit logs, but the HTTP response includes only a bounded error summary.

Commands should be short. For long work, the command should enqueue a project-owned job and return a run id or path. `html-home` should not become a job runner in the first action release.

## Security Model

Actions turn local HTML into local code execution, so the default posture must be explicit.

Recommended controls:

- Enable actions only with `html-home serve --actions`.
- Bind to `127.0.0.1` by default when actions are enabled.
- Reject action requests when `Host` is not local unless a future trusted-LAN mode exists.
- Require same-origin requests from artifacts served by this `html-home` instance.
- Require `X-Html-Home-Action: 1`.
- Accept only `application/json`.
- Limit request body size, for example 256 KB.
- Enforce `timeout_ms`.
- Reject shell strings and execute argv arrays only.
- Redact stderr and command environment from browser responses.
- Record every action attempt in an append-only local audit log.

This keeps action execution local, deliberate, and observable.

## Audit Log

Store an append-only JSONL log under the existing local state directory:

```text
~/Library/Application Support/html-home/actions.jsonl
```

Each entry:

```json
{
  "run_id": "act_20260522_160001_abcd1234",
  "started_at": "2026-05-22T16:00:01.000Z",
  "completed_at": "2026-05-22T16:00:01.420Z",
  "project": "pmknb",
  "artifact": "cockpit",
  "action": "operator-action",
  "cwd": "/Users/jaredsmith/Projects/pmknb",
  "command": ["bun", "src/workflow/operator-action-http.ts"],
  "status": "ok",
  "exit_code": 0
}
```

The log should omit request bodies by default. A later debug flag can opt into request capture with explicit user consent.

## pmknb Example

`pmknb` can replace its private API server with a tiny action adapter:

```text
src/workflow/operator-action-http.ts
```

The adapter reads JSON from stdin, validates the shape, calls `performOperatorAction`, regenerates the `html-home` cockpit artifact, and returns JSON.

The cockpit button changes from:

```text
POST http://127.0.0.1:4000/api/operator/candidate/:id/:action
```

to:

```text
POST /api/actions/pmknb/cockpit/operator-action
```

Result:

- one `html-home` PM2 process
- no `pmknb-inspector` server for button actions
- no CORS branch
- no extra local port
- project-owned mutation code remains in `pmknb`

## Implementation Plan

1. Extend manifest types with optional artifact actions behind `version: 2`.
2. Add manifest validation for action slug, command argv, cwd, input mode, and timeout.
3. Store indexed actions in local state beside indexed artifacts.
4. Add `actions` module for lookup, execution, timeout, JSON parsing, and audit logging.
5. Add `POST /api/actions/:project/:artifact/:action`.
6. Gate the route behind `serve --actions`.
7. Add tests for manifest validation, disabled action routes, successful JSON command execution, timeout, non-JSON stdout, and audit logging.
8. Update README with the action gateway contract after the implementation lands.
9. Port `pmknb` operator actions to an action adapter and remove its private action API server.

## Open Questions

- Should `cwd` be absolute only, or allow manifest-root-relative values?
- Should actions inherit the full environment, a filtered environment, or manifest-declared variables?
- Should `html-home` provide a request schema field, or should project adapters own validation?
- Should long-running actions get a first-class async status route in v1 of actions?
- Should actions appear on the start page, or stay invisible unless an artifact calls them?

## Recommendation

Implement local actions as an opt-in v2 feature.

Keep `html-home` narrow: one server, static artifact hosting, read API, and declared local actions. Keep domain logic in source projects. This removes duplicate local servers while preserving the project boundary that makes `html-home` useful.
