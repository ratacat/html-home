# html-home

A lightweight local catalog for HTML artifacts scattered across your projects.

<p align="center">
  <img src="assets/bench.jpg" alt="HTML artifacts arranged on a workbench" width="760">
</p>

`html-home` turns scattered coverage reports, dashboards, prototypes, debug pages, and generated views into one local start page with stable URL shapes, without copying them out of their projects.

Generated HTML belongs near the code, data, branch, and scripts that produced it. Humans still need one place to find it. `html-home` keeps those concerns separate: repos declare artifacts, local state remembers registered repos, and one read-only server serves what exists.

## Why

Small tools, tests, agents, and build scripts tend to leave behind useful HTML: coverage reports, dashboards, prototypes, research views, debug pages, and one-off UI artifacts.

Each one often gets its own server, port, and startup command. Copying everything into a central folder looks tidy, but creates a second source of truth.

`html-home` gives those artifacts a shared front door without taking ownership of them.

## Quick Install

Requires Bun.

```sh
curl -fsSL https://raw.githubusercontent.com/ratacat/html-home/main/install.sh | bash
```

For agent instructions, add a small rule to your repo's `AGENTS.md`:

```md
Goal: expose local HTML artifacts through one shared server.

Success means:
- The artifact has a `.html-home.json` manifest and appears in `html-home list`.
- The shared `html-home` server serves the artifact URL.
- Repo-specific static, preview, or dev servers used only for artifact viewing are stopped before handoff.

Use `html-home` for local static HTML artifacts. Generate the artifact files, expose them with `.html-home.json`, then run `html-home register /path/to/repo` once and `html-home rescan` after changes. Open artifacts at `/home/<project>/<artifact>/` on the `html-home` base URL. Start repo-specific dev/API servers only for live backend behavior, and stop them when the task returns to static artifact viewing.
```

## The Model

**Manifests declare artifacts.**  
A repo-local `.html-home.json` names a project and the static artifact directories it wants to expose. The manifest can be committed with the repo.

**Local state remembers roots.**  
Registration is local to the machine. It points `html-home` at repos with manifests. This state is an index, not authority; if state and disk disagree, disk wins.

**One server serves what exists.**  
The foreground server renders a start page and serves artifact files from their home repos. HTTP is read-only in v1; CLI commands perform registration changes.

Use `html-home` as the only server for static artifact viewing. Project dev servers remain useful for live backend behavior, but they should not duplicate `html-home` for generated HTML, coverage reports, dashboards, prototypes, or snapshot views.

This is the smallest useful structure: the repo owns the artifact, the local index owns discovery, and the server owns presentation. Because those jobs stay separate, `html-home` can cover many unrelated projects without becoming a build system, sync folder, dev-server proxy, or daemon.

## Status

`html-home` is an early local-first v1. It is designed for one machine, one user, and repo-local static HTML artifacts.

It is intended for localhost use by default. Do not expose it directly to an untrusted network.

## Install

Requires Bun.

Install or update with:

```sh
curl -fsSL https://raw.githubusercontent.com/ratacat/html-home/main/install.sh | bash
```

Then:

```sh
html-home --help
```

The installer keeps a managed checkout at `~/.local/share/html-home` and writes `html-home` to `~/.local/bin`. Re-run the same command to update.

## Failure Is Visible

Broken entries are not swept away.

Missing paths, missing entry files, invalid manifests, duplicate slugs, and stale registrations remain visible until you fix the registration or manifest.

`html-home rescan` refreshes registered roots. It does not crawl your filesystem or discover projects on its own.

## Boundaries

`html-home` is intentionally narrow.

It does not build artifacts, watch repos, run project processes, proxy dev servers, rewrite applications, copy outputs into a central store, or manage lifecycle state for other tools.

The rules are simple:

- artifacts stay with their source repos
- manifests are the contract
- local state is an index, not authority
- one foreground server replaces many temporary servers
- HTTP is read-only in v1
- CLI commands perform local mutations
- broken and stale artifacts stay visible

That restraint is the design.

## No Daemon In V1

V1 is a foreground process on purpose.

A daemon would pull registration, file watching, lifecycle management, and process ownership into the product before they have earned their place.

The hard problem is smaller: give many repo-local HTML artifacts one stable local home without moving them or running their projects.

So v1 keeps mutation explicit:

- register or unregister roots with the CLI
- rescan when manifests or artifact locations change
- serve through one read-only localhost process

Background behavior can be added later only if it earns its keep.

## Manifest Schema

```text
my-project/
  .html-home.json
  artifacts/
    dashboard/
      index.html
      app.css
```

```json
{
  "version": 1,
  "project": {
    "slug": "my-project",
    "title": "My Project"
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

```sh
html-home register /path/to/my-project
html-home serve
```

Open:

```text
http://localhost:8765/
```

The artifact gets a stable local URL shape:

```text
http://localhost:8765/home/my-project/dashboard/
```

The `dashboard` artifact is served from `artifacts/dashboard/index.html`. Its files stay in the repo, so relative asset URLs inside the artifact directory keep working.

## Better Local URLs

`html-home serve` separates the bind address from the URL shown and copied in the UI.

Defaults:

```sh
html-home serve
# http://localhost:8765/
```

Custom local alias:

```sh
html-home serve --base-url http://home.html:8765/
```

For that to open in a browser, `home.html` must resolve to the machine running `html-home` through `/etc/hosts`, DNS, a reverse proxy, or another local naming setup. The alias changes displayed and copied URLs; it does not change the bind host.

For managed services, set the same value with `HTML_HOME_BASE_URL`.

Remote or Tailscale host:

```sh
html-home serve --host 0.0.0.0 --base-url http://mac-studio-ultra:8765/
```

Use the machine's Tailscale MagicDNS name, Tailscale IP, or LAN DNS name as the base URL. When bound to all interfaces, the CLI avoids printing `0.0.0.0` as an openable URL and asks for an explicit `--base-url`.

## Real Catalog And Developer Demo

Use `serve` for your real local artifacts:

```sh
html-home serve --host 0.0.0.0 --port 3027 --base-url http://mac-studio-ultra:3027/
```

This reads the normal local state file and shows only registered real manifest roots.

The demo catalog is for developers working from this source checkout. It is not part of the installed `html-home` CLI flow.

```sh
bun run demo -- --host 0.0.0.0 --port 3028 --base-url http://mac-studio-ultra:3028/
```

The developer demo refreshes a separate demo state file from `demo/.html-home.json` and never registers sample artifacts into the real catalog. If you need a persistent demo URL, set `HTML_HOME_DEMO_BASE_URL`.

## More Detail

For manifest rules, URL behavior, stale index semantics, path safety, and module boundaries, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

For the proposed local action gateway that lets artifacts submit manifest-declared actions through the shared server, see [docs/ACTION-GATEWAY-PROPOSAL.md](docs/ACTION-GATEWAY-PROPOSAL.md).
