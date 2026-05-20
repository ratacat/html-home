# HTML Home Server Architecture

## Design Goal

HTML Home Server gives local static HTML artifacts one stable place to live in the browser. One localhost HTTP process serves a start page, a read API, and repo-local artifacts declared by repo-local manifests.

The tool is an index and static file host. It does not build artifacts, run project processes, proxy dev servers, watch repos, or own artifact files.

## Non-Goals

- No per-project or per-artifact HTTP servers.
- No dev-server proxying.
- No build, rebuild, watch, or lifecycle management.
- No central artifact ownership in v1.
- No HTTP mutation API in v1.
- No daemon in v1.
- No root-relative asset URL rewriting in v1.
- No SPA fallback in v1.
- No plugin system, project widgets, or custom dashboards.
- No full-text artifact indexing until metadata search is insufficient.
- No manifest editing UI.
- No start-page mutation controls in v1.

## Source Of Truth Model

Home repos are the source of truth for live artifact content and manifest metadata. A repo exposes artifacts through `.html-home.json` at the manifest root. The artifact files stay in that repo so humans and agents edit them beside the code and data that produced them.

The server owns local state in `state.json`. Local state is authoritative for the set of registered manifest roots. Its indexed project and artifact metadata is a last-known index, not the source of truth. It may be stale when directories move, branches switch, manifests change, or generated artifacts disappear. If `state.json` is deleted, registrations are lost but artifacts remain in their home repos.

Broken artifacts remain visible. A missing manifest root, invalid manifest, duplicate slug, missing entry file, or broken path should appear in CLI output, API responses, and the start page. The system must not silently remove broken entries or invent replacement slugs.

## Vocabulary

- **Project**: A stable URL namespace chosen by the user. A project is not necessarily a repo.
- **Artifact**: A routable static HTML directory under a project.
- **Manifest Root**: The directory that contains `.html-home.json`. It may be a git repo root, but git is not required.
- **Manifest**: The repo-local `.html-home.json` file.
- **Artifact Path**: The manifest-root-relative directory path declared by an artifact.
- **Artifact Base Directory**: The absolute directory resolved from `manifestRoot + artifact.path`.
- **Entry File**: The HTML file opened for an artifact, usually `index.html`.
- **Local State**: The persistent `state.json` file containing registrations, the last-known index, and diagnostics.
- **Resolver**: The module that maps a route to a safe filesystem path.

Avoid `page` for artifact entries. Avoid `package` unless discussing future immutable snapshots. Avoid `registry` unless discussing the older concept. Avoid `daemon` in v1 design.

## Manifest Contract

Each manifest root can declare artifacts with `.html-home.json`:

```json
{
  "version": 1,
  "project": {
    "slug": "pdb",
    "title": "PDB"
  },
  "artifacts": [
    {
      "slug": "dashboard",
      "title": "Dashboard",
      "path": "artifacts/dashboard",
      "entry": "index.html",
      "tags": ["debug", "local"]
    }
  ]
}
```

Rules:

- `version` is required and starts at `1`.
- `project.slug` is the stable URL namespace.
- Artifact `slug` values are stable URL IDs within a project.
- `path` is relative to the manifest root.
- `path` must resolve to a directory in v1.
- `entry` defaults to `index.html`.
- `tags` are search/filter metadata only.
- v1 artifacts are directories containing the entry file.
- A single-file artifact should use a directory path and set `entry` to the file name.
- Runtime assets should live under the artifact base directory.
- v1 supports relative asset URLs.
- v1 does not rewrite root-relative URLs such as `/assets/app.js`.
- If an artifact needs repo data at runtime, the artifact base directory should contain that data or a deliberate symlink that resolves inside the artifact base directory.
- Unknown top-level and artifact fields are rejected in v1.
- Project, artifact, and tag slugs use the same grammar: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, maximum 64 characters.

Allowed v1 manifest fields:

- Top level: `version`, `project`, `artifacts`.
- `project`: `slug`, `title`.
- `artifacts[]`: `slug`, `title`, `path`, `entry`, `tags`.

The manifest declares static artifacts, not behavior. It must not contain build commands, watch commands, preprocessors, proxy targets, or project-specific execution hooks.

## Data Flow

### Register Manifest Root

`register <path>` records a manifest root for future scans.

1. Resolve the path argument to an absolute canonical path.
2. Confirm the path exists and contains `.html-home.json`.
3. Add or update the registration by canonical path.
4. Scan that manifest root.
5. Write `state.json` atomically.

Registering a manifest root does not copy artifact files. It records where the source manifest lives. Registration may succeed even when the manifest has validation errors; those errors block routing and appear in diagnostics.

### Rescan

`rescan` rebuilds the last-known index from registrations.

1. Read the registration list.
2. For each manifest root, read `.html-home.json`.
3. Parse and validate the manifest.
4. Resolve each artifact path.
5. Validate the artifact base directory and entry file.
6. Detect duplicate project and artifact slugs.
7. Build a complete replacement index in memory.
8. Write `state.json` to a temp file, then atomically rename it.

A bad manifest or missing manifest root should produce diagnostics without clobbering registrations. If a manifest root had a previous valid scan, preserve the last-known project and artifact records and mark them stale.

### HTTP Request

Artifact routes read the current local state and resolve paths through the resolver.

1. Match `/a/:project/:artifact/<asset-path>`.
2. Look up the indexed artifact.
3. Resolve the requested asset under the artifact base directory.
4. Enforce path containment.
5. Serve the file or return a typed error.

The server loads `state.json` fresh per request in v1. The CLI mutates local state; the server reads it. The server does not rescan manifests, watch files, repair malformed state, or write state.

## Module Design

Use six small modules.

### `manifest`

Interface:

- Input: manifest root and manifest JSON.
- Output: normalized manifest data or validation errors.

Responsibilities:

- Parse `.html-home.json`.
- Validate schema and required fields.
- Apply defaults.
- Enforce slug and manifest-root-relative path rules.

Non-responsibilities:

- No local state writes.
- No HTTP behavior.
- No artifact serving.

Depth comes from keeping manifest normalization and validation behind one small interface used by CLI, rescans, and tests.

### `state`

Interface:

- Input: registrations and index snapshots.
- Output: persisted local state, queryable project/artifact metadata, and diagnostics.

Responsibilities:

- Read and write `state.json`.
- Store registered manifest root paths.
- Store last indexed project and artifact metadata.
- Store diagnostic/status records.
- Write atomically.
- Provide query functions for CLI, server, and read API.

The local state status model is the health system. Do not create a separate health subsystem in v1.

### `indexer`

Interface:

- Input: registrations from local state.
- Output: replacement index snapshot and diagnostics.

Responsibilities:

- Read manifests from registered manifest roots.
- Call `manifest` validation.
- Resolve artifact base directories.
- Validate entry files.
- Detect duplicate slugs.
- Preserve stale last-known records when a later scan fails.

The indexer does not serve HTTP and does not own persistence beyond returning data for `state` to write.

### `resolver`

Interface:

- Input: indexed artifact metadata and request path.
- Output: resolved filesystem file or typed failure.

Responsibilities:

- Canonicalize paths.
- Enforce containment under the artifact base directory.
- Select entry files.
- Block traversal.

The resolver is the critical safety module. Tests should exercise it through route-level and public resolver behavior, not private path helpers.

### `server`

Interface:

- Input: HTTP request and local state snapshot.
- Output: start page, API response, static file response, or typed error response.

Responsibilities:

- Route requests.
- Serve static files.
- Set MIME and conservative cache headers.
- Reload local state snapshots.
- Expose the read-only `/api/state` endpoint.

V1 has no HTTP mutation endpoints.

### `start_page`

Interface:

- Input: project, artifact, and diagnostic metadata.
- Output: dense local browser interface.

Responsibilities:

- Show projects and artifacts.
- Search/filter metadata.
- Show recent artifacts.
- Show broken states plainly.
- Provide open/copy controls for artifact URLs and source paths.
- HTML-escape every title, path, tag, and diagnostic message.

The start page displays diagnostics from local state. It does not run its own diagnostics or own project-specific widgets.

## Local State Record Model

State lives in one JSON file:

```json
{
  "schemaVersion": 1,
  "registrations": [],
  "index": {
    "generatedAt": null,
    "projects": []
  }
}
```

Use JSON for v1. SQLite is deferred until the tool needs concurrent writers, many thousands of records, persistent query complexity, history, or daemonized mutations.

By default, `state.json` lives in a platform-appropriate user data directory under `html-home/state.json`. Do not store v1 state in this repo by default. The state path should be configurable for tests with `HTML_HOME_STATE`.

State read/write behavior:

- Missing `state.json` loads as empty state plus an informational diagnostic.
- Malformed or unreadable `state.json` loads as empty state plus a blocking diagnostic.
- The server must start in degraded mode when state is missing, malformed, or unreadable.
- The server must not repair, overwrite, or delete malformed state.
- CLI writes use temp-file-plus-rename in the same directory.
- Concurrent CLI writes are not coordinated in v1; the last complete write wins.

### Registration

- `registrationId`: stable internal ID.
- `manifestRoot`: absolute canonical path.
- `manifestPath`: absolute path.
- `addedAt`: ISO timestamp.
- `lastScanAt`: ISO timestamp or null.
- `status`: current registration-level status.
- `diagnostics`: registration diagnostics.

### Indexed Project

- `projectSlug`: URL namespace from manifest.
- `title`: display title.
- `registrationId`: owning registration.
- `manifestRoot`: source manifest root.
- `manifestPath`: source manifest path.
- `lastIndexedAt`: ISO timestamp.
- `status`: project-level status.
- `stale`: boolean.
- `diagnostics`: project diagnostics.

### Indexed Artifact

- `projectSlug`: owning project namespace.
- `artifactSlug`: artifact URL ID.
- `title`: display title.
- `registrationId`: owning registration.
- `artifactPath`: manifest-root-relative path.
- `artifactBaseDirectory`: resolved absolute path.
- `entry`: entry file relative to artifact base directory.
- `tags`: filter metadata.
- `lastIndexedAt`: ISO timestamp.
- `status`: artifact-level status.
- `stale`: boolean.
- `diagnostics`: artifact diagnostics.

### Diagnostic

- `severity`: `blocked`, `warning`, or `info`.
- `code`: stable machine-readable code.
- `message`: short human-readable message.
- `hint`: optional repair hint.
- `scope`: `state`, `registration`, `manifest`, `project`, `artifact`, `route`, or `file`.
- `registrationId`: optional registration reference.
- `projectSlug`: optional project reference.
- `artifactSlug`: optional artifact reference.
- `routeKey`: optional `projectSlug/artifactSlug` route key.
- `path`: optional filesystem path.
- `field`: optional manifest field path.
- `relatedPaths`: optional list of related filesystem paths.
- `observedAt`: ISO timestamp.

## Status Codes

V1 should use a small, explicit status set:

- `ok`
- `missing_manifest_root`
- `missing_manifest`
- `invalid_manifest`
- `unsupported_manifest_version`
- `invalid_slug`
- `duplicate_project_slug`
- `duplicate_artifact_slug`
- `missing_artifact_path`
- `artifact_path_not_directory`
- `missing_entry`
- `entry_not_file`
- `unsafe_path`
- `unreadable`

Statuses must appear consistently in `doctor`, API responses, and the start page.

Duplicate slugs use route-key semantics. The route key is `projectSlug/artifactSlug`. Duplicate project slugs or duplicate route keys make the affected project and artifact routes non-routable until fixed.

## Path Safety Rules

- Resolve manifest roots to absolute canonical paths.
- Manifest artifact paths must be relative.
- Reject `..` traversal in manifest paths.
- Manifest artifact paths must resolve to directories in v1.
- Resolve artifact base directories before serving.
- Serve files only under the resolved artifact base directory.
- Block request path traversal.
- Treat symlinks conservatively: a served file must still resolve under the artifact base directory. No external symlink flag in v1.
- Do not expose directory listings for artifact base directories.

Request path rules:

- Decode URL path once.
- Reject encoded slashes and encoded backslashes.
- Reject NUL bytes.
- Reject dot segments.
- Reject absolute paths and Windows drive-looking paths.
- Normalize path segments before resolution.
- Resolve final targets and require containment under the artifact base directory.

## URL Model

- `/` renders the start page.
- `/p/:project/` renders the project artifact list.
- `/a/:project/:artifact/` serves the artifact entry file.
- `/a/:project/:artifact/<asset-path>` serves an asset under the artifact base directory.
- `/api/state` returns the read-only local state view needed by the start page.

Only documented slash-terminated artifact root routes are required in v1. The start page emits canonical slash URLs. Slashless artifact root variants may return `404 route_not_found`; redirect behavior is not required in v1.

V1 has no SPA fallback and no implicit nested index serving. Missing asset paths return typed `404` responses. Explicit file paths such as `/a/:project/:artifact/docs/index.html` can serve if they are safe regular files.

## HTTP Failure Semantics

- `GET` and `HEAD` are allowed.
- All other methods return `405` with `Allow: GET, HEAD`.
- Unknown route: `404 route_not_found`.
- Unknown project: `404 project_not_found`.
- Unknown artifact: `404 artifact_not_found`.
- Duplicate project or artifact route: `409 duplicate_route`.
- Unsafe path: `404 unsafe_path`. The resolver should still return a typed unsafe-path failure internally.
- Missing file: `404 asset_not_found`.
- Directory request: `404 directory_not_served`.
- Unreadable file: `403 unreadable`.
- Malformed local state: start with empty index and show diagnostics; route-level failures use `500 internal_error` only when the server cannot construct a response.

The start page should still show duplicate and broken artifacts with diagnostics.

Server-generated route failures return JSON:

```json
{
  "error": {
    "code": "asset_not_found",
    "message": "Asset not found.",
    "status": 404
  }
}
```

Do not include absolute filesystem paths in route error bodies.

## Cache Policy

Use `Cache-Control: no-store` for all v1 responses. Generated artifacts often change under stable URLs, so freshness matters more than asset-cache performance. Do not add ETags, range requests, or asset fingerprinting in v1.

## Start Page UX

The start page is a workbench, not a landing page.

Primary users are humans and agents trying to find, open, inspect, or debug local HTML artifacts across repos and local workspaces.

Required v1 affordances:

- Project grouping.
- Search by project slug, artifact slug, title, tag, and source path.
- Recent artifacts.
- Status filters.
- Clear manifest root and artifact path.
- Open artifact URL.
- Copy artifact URL.
- Copy source path.
- Doctor/status summary.
- A short note that the page shows a last-known index and `html-home rescan` updates it.

Recent artifacts are browser-local in v1. Store them in `localStorage` and label them "Recently opened in this browser." If that feels too product-heavy during implementation, remove Recent rather than adding server-side history.

Visual direction: dense, quiet, utilitarian, and stable. Avoid decorative hero sections, marketing copy, cards nested in cards, mutation controls, or dashboard widgets that imply process monitoring.

## CLI Contract

V1 should define these commands before implementation:

- `html-home register <path>` records a manifest root.
- `html-home rescan` rebuilds the last-known index.
- `html-home unregister <path>` removes a registration.
- `html-home list` prints indexed projects and artifacts.
- `html-home doctor` prints diagnostics.
- `html-home serve` runs the one foreground localhost HTTP process.

Suggested exit codes:

- `0`: command succeeded.
- `1`: command completed with a health or input problem, depending on command.
- `2`: local state read/write failure or unrecoverable command failure.

Command behavior:

- `register <path>` canonicalizes the path, requires `.html-home.json`, scans that root, writes `state.json`, and exits `0` if state was written even when artifacts are blocked.
- `rescan` scans every registration, writes `state.json`, and exits `0` if the scan completed and state was written even when artifacts are blocked.
- `unregister <path>` removes a registration and its indexed artifacts. A non-registered path exits `1`.
- `list` reads `state.json` only. It does not touch the filesystem or validate manifests.
- `doctor` performs live validation but does not write `state.json`. It exits `1` when blocking diagnostics exist.
- `serve` binds to `127.0.0.1` by default, reads `state.json`, and does not rescan.

## Implementation Sequence

Implement one behavior slice at a time. Do not build all modules first and test them afterward.

1. Parse one valid manifest and apply defaults.
2. Reject malformed manifests: unknown fields, bad slugs, absolute paths, `..`, missing fields, and empty artifact lists.
3. Load missing local state as a default empty `state.json` document.
4. Write and reload `state.json` through atomic save.
5. Register one manifest root through the CLI boundary.
6. Index one registered root and produce one routable artifact.
7. Serve `/api/state` from a real HTTP handler.
8. Resolve and serve one artifact entry file from `/a/:project/:artifact/`.
9. Resolve and serve nested relative assets.
10. Block traversal and symlink escapes.
11. Detect duplicate route keys and make every collision visible but non-routable.
12. Render the start page from local state.
13. Render the project page from local state.
14. Add `list` and `doctor` CLI output.
15. Add `unregister`, `rescan`, and server local-state reload behavior.
16. Add `serve` as the foreground process wrapper after handler behavior is already tested.

This order keeps every step observable through a public interface and prevents filesystem safety behavior from being hidden under UI work.

## Testing Strategy

Use behavior slices through public interfaces. Do not test private helpers directly unless they become public module interfaces.

Tracer-bullet order:

1. Register a valid manifest root and list its artifact.
2. Serve an artifact entry file from `/a/:project/:artifact/`.
3. Serve a nested relative asset.
4. Report an invalid manifest without deleting the registration.
5. Report a missing entry file in `doctor`, API, and UI metadata.
6. Detect duplicate project slugs.
7. Detect duplicate artifact slugs.
8. Block path traversal in manifest paths and request paths.
9. Return `404` for missing asset paths; do not fall back to the entry file.
10. Reload server local-state view after `rescan`.
11. Verify `doctor` reports live failures without writing `state.json`.
12. Verify `list` reports last-known state without touching the filesystem.
13. Verify non-GET requests to read-only routes return the documented non-success status.
14. Verify served HTML bytes match source bytes, proving no root-relative URL rewriting occurs.

Minimum fixtures:

- `valid-single`: manifest root with `dist/index.html`, `dist/app.css`, and a nested asset.
- `valid-custom-entry`: manifest root with `public/home.html` and `entry: "home.html"`.
- `duplicate-route`: two manifest roots declaring the same route key.
- `bad-manifest-matrix`: generated manifests for unknown fields, bad slugs, absolute paths, traversal paths, file artifact paths, missing directories, and missing entry files.
- `symlink-escape`: artifact directory containing a symlink to a file outside the artifact base directory.
- `server-state`: hand-written state with one routable artifact, one blocked artifact, and one diagnostic containing HTML-special characters.

Highest-risk bug tests:

- Encoded traversal such as `%2e%2e/secret.txt` never serves files.
- Symlinked assets and symlinked entry files cannot escape the artifact base directory.
- Duplicate route keys never pick a winner.
- Unknown manifest fields fail validation.
- Artifact paths that resolve outside the manifest root become diagnostics.
- File paths are not accepted as artifact directories.
- Missing assets do not fall back to the entry file.
- Server reads updated local state without restart.
- Start page escapes local paths and diagnostic messages.
- Atomic state writes do not expose partial JSON to readers under normal operation.
- `/a/:project/:artifact` returns `404 route_not_found` unless a later implementation explicitly adds redirects.

Tests should describe observable behavior:

- CLI command output and exit codes.
- API response status and JSON body.
- HTTP artifact route behavior.
- UI metadata rendering for status states.

## Design Decisions

### D1: Repos Own Live Artifacts

Live artifacts stay in source repos. This keeps generated HTML near the code, scripts, and data that created it and prevents agents from editing stale central copies.

Tradeoff: directory moves and branch switches can break artifacts. Local state must expose stale and broken states clearly.

### D2: Local State Owns Registrations And Stores A Last-Known Index

`state.json` is authoritative for registered manifest roots. Its indexed metadata, timestamps, and diagnostics are last-known scan output. It does not own artifact content or manifest metadata.

Tradeoff: every consumer must tolerate stale data. This is better than creating a hidden second source of truth.

### D3: CLI Mutates, Server Reads

V1 uses CLI commands for `register` and `rescan`. The server reads `state.json` and reloads it when it changes.

Tradeoff: no browser-based registration in v1. This avoids local HTTP mutation auth, daemon coupling, and extra process state.

### D4: Broken Artifacts Stay Visible

The start page and API show broken entries instead of hiding them.

Tradeoff: the start page may show errors. This is useful because invisible disappearance is harder to debug.

### D5: No Root-Relative URL Rewriting In V1

Artifacts must use relative asset URLs in v1.

Tradeoff: some generated bundles will need packaging changes. This keeps serving predictable and avoids fragile HTML rewriting.

### D6: Manifest Roots Do Not Require Git

`register <path>` requires a directory containing `.html-home.json`. Git detection is not part of v1.

Tradeoff: the project works for non-git directories. GitHub repos remain the common case, not a hard dependency.

### D7: Artifact Paths Are Directories

V1 artifact paths must resolve to directories. Single-file artifacts use the containing directory as `path` and set `entry` to the file name.

Tradeoff: this rejects some shorter manifest shapes. It simplifies asset serving and path safety.

### D8: Duplicate Slugs Are Visible But Non-Routable

Duplicate project slugs or duplicate route keys make every colliding route non-routable until fixed. A route key is `projectSlug/artifactSlug`.

Tradeoff: no "first registered wins" convenience. Deterministic failure is better than registration-order behavior.

### D9: Start Page Is Read-Only

The start page shows local state, opens artifacts, copies paths, and explains how to rescan. It does not register, unregister, rescan, or edit manifests in v1.

Tradeoff: users must run CLI commands for changes. This preserves the no-HTTP-mutation model.

### D10: `doctor` Does Not Write State

`doctor` performs a live validation pass and returns health through exit codes, but it does not update `state.json`.

Tradeoff: `doctor` and the start page can disagree until `rescan` runs. That distinction keeps health checks separate from state mutation.

### D11: Malformed State Does Not Stop The Server

The foreground server starts with an empty index and visible diagnostics when `state.json` is missing, malformed, or unreadable. It does not repair state.

Tradeoff: the start page can load even when local state is broken. CLI commands remain responsible for state repair.

### D12: No Implicit Nested Index Serving

Only `/a/:project/:artifact/` serves the declared entry file. Nested directory URLs do not imply `index.html`. Explicit file paths such as `/a/:project/:artifact/docs/index.html` can serve if safe.

Tradeoff: static sites that rely on nested directory indexes need explicit links. This keeps resolver behavior narrow and testable.

## Open Questions

- Should `html-home serve` expose `--state <path>` publicly, or keep state-path override test-only through `HTML_HOME_STATE`?
- Should slashless artifact root URLs stay 404 permanently, or should v2 add canonical redirects?
