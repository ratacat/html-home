import type { Diagnostic, IndexedArtifact, IndexedProject, StateDoc } from "./types";

export type StartPageOptions = {
  baseUrl?: string;
  catalogLabel?: string;
};

type CatalogCounts = {
  total: number;
  projects: number;
  routable: number;
  stale: number;
  blocked: number;
};

type CatalogInput = {
  title: string;
  heading: string;
  subheading: string;
  projects: IndexedProject[];
  diagnostics: Diagnostic[];
  generatedAt: string | null;
  options: StartPageOptions;
  backHref?: string;
};

export function renderHomePage(state: StateDoc, options: StartPageOptions = {}): string {
  const label = options.catalogLabel ? `${options.catalogLabel}. ` : "";
  return renderCatalog({
    title: "HTML Home",
    heading: "html-home",
    subheading: `${label}Local artifact catalog. Repo owns files; index owns discovery.`,
    projects: state.index.projects,
    diagnostics: state.diagnostics,
    generatedAt: state.index.generatedAt,
    options
  });
}

export function renderProjectPage(project: IndexedProject | undefined, state: StateDoc, options: StartPageOptions = {}): string {
  if (!project) {
    return layout(
      "Project Not Found",
      `<header class="top">
        <div class="brand">
          <span class="logo"><b>html</b>-home</span>
          <span class="tag">project not found</span>
        </div>
        <a class="nav-link" href="/">All projects</a>
      </header>
      <main class="single-message">
        <h1>Project not found</h1>
        <p>No project with that slug exists in local state.</p>
      </main>`,
      options
    );
  }

  return renderCatalog({
    title: project.title,
    heading: project.title,
    subheading: `${project.projectSlug} / ${project.manifestRoot}`,
    projects: [project],
    diagnostics: [...project.diagnostics, ...project.artifacts.flatMap((artifact) => artifact.diagnostics)],
    generatedAt: state.index.generatedAt,
    options,
    backHref: "/"
  });
}

function renderCatalog(input: CatalogInput): string {
  const counts = catalogCounts(input.projects);
  const baseUrl = input.options.baseUrl ?? "";
  const statusSummary = `${counts.projects} projects / ${counts.routable} routable / ${counts.blocked + counts.stale} blocked`;
  const indexed = input.generatedAt ? ` / indexed ${input.generatedAt}` : "";

  return layout(
    input.title,
    `<header class="top">
      <div class="brand">
        <span class="logo"><b>html</b>-home</span>
        <span class="tag">${escapeHtml(input.subheading)}</span>
      </div>
      <span class="serve" title="Public base URL"><span class="dot"></span>${escapeHtml(baseUrl || "current origin")}</span>
      ${input.backHref ? `<a class="nav-link" href="${escapeAttribute(input.backHref)}">All projects</a>` : ""}
      ${renderSkinSwitcher()}
    </header>

    <section class="headline">
      <div>
        <h1>${escapeHtml(input.heading)}</h1>
        <p>${escapeHtml(statusSummary + indexed)}</p>
      </div>
      <div class="headline-actions">
        <button type="button" data-copy="${escapeAttribute(baseUrl || "/")}">Copy base URL</button>
      </div>
    </section>

    <section class="toolbar" aria-label="Artifact controls">
      <label class="search">
        ${searchIcon()}
        <input id="search" type="search" placeholder="Search artifacts, projects, tags, paths" autocomplete="off" autofocus>
      </label>
      <div class="chips" role="group" aria-label="Status filter">
        <button type="button" data-status-filter="all" aria-pressed="true">All <span>${counts.total}</span></button>
        <button type="button" data-status-filter="ok" aria-pressed="false">Routable <span>${counts.routable}</span></button>
        <button type="button" data-status-filter="stale" aria-pressed="false">Stale <span>${counts.stale}</span></button>
        <button type="button" data-status-filter="blocked" aria-pressed="false">Blocked <span>${counts.blocked}</span></button>
      </div>
      <div class="seg view" role="group" aria-label="View">
        <button type="button" data-view="grid" aria-pressed="true" title="Grid view">${gridIcon()} Grid</button>
        <button type="button" data-view="list" aria-pressed="false" title="List view">${listIcon()} List</button>
      </div>
    </section>

    ${renderProjectFilters(input.projects)}

    <section class="diag-strip" aria-label="Index summary">
      <span><i class="swatch ok"></i><b>${counts.total}</b> artifacts</span>
      <span><i class="swatch ok"></i><b>${counts.projects}</b> projects</span>
      <span><i class="swatch warn"></i><b>${counts.stale}</b> stale</span>
      <span><i class="swatch bad"></i><b>${counts.blocked}</b> blocked</span>
    </section>

    <section id="recent-section" class="recent" hidden>
      <h2>Recently opened in this browser</h2>
      <div id="recent-artifacts" class="recent-list"></div>
    </section>

    ${renderDiagnosticsPanel(input.diagnostics)}

    <main class="panel" id="panel">
      ${input.projects.map((project, index) => renderProjectGroup(project, input.options, index)).join("") || `<p class="empty">No registered artifacts yet.</p>`}
    </main>
    <p id="empty-filter-state" class="empty" hidden>No artifacts match. Broaden the search or clear filters.</p>

    <footer class="pagefoot">
      <span><b>.html-home.json</b> per repo</span>
      <span>index owns discovery</span>
      <span>repo owns files</span>
    </footer>`,
    input.options
  );
}

function renderSkinSwitcher(): string {
  return `<div class="seg skins" role="group" aria-label="Skin">
    <button type="button" data-skin="workbench" aria-pressed="true">Workbench</button>
    <button type="button" data-skin="ozalid" aria-pressed="false">Ozalid</button>
    <button type="button" data-skin="gallery" aria-pressed="false">Gallery</button>
  </div>`;
}

function renderProjectFilters(projects: IndexedProject[]): string {
  if (projects.length <= 1) return "";
  return `<div class="chips project-filters" role="group" aria-label="Project filter">
    <button type="button" data-project-filter="all" aria-pressed="true">All projects <span>${projects.length}</span></button>
    ${projects
      .map(
        (project) =>
          `<button type="button" data-project-filter="${escapeAttribute(project.projectSlug)}" aria-pressed="false">${escapeHtml(project.projectSlug)} <span>${project.artifacts.length}</span></button>`
      )
      .join("")}
  </div>`;
}

function renderProjectGroup(project: IndexedProject, options: StartPageOptions, index: number): string {
  const counts = catalogCounts([project]);
  return `<section class="project" data-project="${escapeAttribute(project.projectSlug)}" data-search="${escapeAttribute(searchTextForProject(project))}">
    <header class="project-head">
      <div>
        <a href="/p/${encodeURIComponent(project.projectSlug)}/" class="project-title">${escapeHtml(project.title)}</a>
        <p>${escapeHtml(project.projectSlug)} / ${project.artifacts.length} artifacts / ${counts.routable} routable / ${counts.blocked + counts.stale} blocked</p>
      </div>
      <code title="${escapeAttribute(project.manifestRoot)}">${escapeHtml(project.manifestRoot)}</code>
    </header>
    ${renderDiagnostics(project.diagnostics)}
    <div class="project-artifacts">
      ${project.artifacts.map((artifact, artifactIndex) => renderArtifactCard(artifact, options, index + artifactIndex)).join("")}
    </div>
  </section>`;
}

function renderArtifactCard(artifact: IndexedArtifact, options: StartPageOptions, index: number): string {
  const href = `/home/${encodeURIComponent(artifact.projectSlug)}/${encodeURIComponent(artifact.artifactSlug)}/`;
  const sourcePath = artifact.artifactBaseDirectory;
  const isOk = artifact.status === "ok";
  const status = artifactStatus(artifact);
  const statusText = artifactStatusText(artifact);
  const routeKey = `${artifact.projectSlug}/${artifact.artifactSlug}`;
  const copyUrl = absoluteUrl(options.baseUrl, href);
  const slate = index % 5 === 0 ? "slate" : "";
  const actionTag = artifact.actions.length ? [`${artifact.actions.length} actions`] : [];
  const tags = [...artifact.tags, ...actionTag];

  return `<article class="artifact ${slate} ${isOk ? "" : "broken-card"}" data-status="${escapeAttribute(status)}" data-project="${escapeAttribute(artifact.projectSlug)}" data-search="${escapeAttribute(searchTextForArtifact(artifact))}">
    <div class="thumb" aria-hidden="true">
      <span class="kind">${escapeHtml(statusText)}</span>
      <div class="mini">
        <div class="mini-bar"><i></i><i></i><i></i><span>${escapeHtml(routeKey)}</span></div>
        <div class="mini-body">
          <span class="mini-line wide"></span>
          <span class="mini-line"></span>
          <span class="mini-line short"></span>
          <div class="mini-chart">
            <i></i><i></i><i></i><i></i><i></i>
          </div>
        </div>
      </div>
    </div>
    <div class="body">
      <h3>${escapeHtml(artifact.title)}</h3>
      <div class="repo"><span class="glyph"></span><span>${escapeHtml(routeKey)}</span></div>
      <div class="path">
        <code title="${escapeAttribute(sourcePath)}">${escapeHtml(sourcePath)}</code>
        <button type="button" data-copy="${escapeAttribute(sourcePath)}">Copy path</button>
      </div>
      ${tags.length ? `<div class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${artifact.diagnostics.length ? `<p class="diag-note">${escapeHtml(artifact.diagnostics[0].code)}: ${escapeHtml(artifact.diagnostics[0].message)}</p>` : ""}
    </div>
    <footer class="foot">
      <span class="status ${escapeAttribute(status)}"><span class="led"></span>${escapeHtml(statusText)}</span>
      <span>indexed ${escapeHtml(artifact.lastIndexedAt)}</span>
      <span class="spacer"></span>
      <button type="button" data-copy="${escapeAttribute(copyUrl)}">Copy URL</button>
      ${isOk ? `<a class="open" href="${href}" data-open-artifact data-open-title="${escapeAttribute(artifact.title)}" data-open-key="${escapeAttribute(routeKey)}">Open</a>` : `<span class="open disabled">Blocked</span>`}
    </footer>
  </article>`;
}

function renderDiagnosticsPanel(diagnostics: Diagnostic[]): string {
  return `<section class="diagnostics-panel">
    <h2>Diagnostics</h2>
    ${renderDiagnostics(diagnostics)}
  </section>`;
}

function renderDiagnostics(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return `<p class="no-diagnostics">No diagnostics.</p>`;
  return `<ul class="diagnostics">${diagnostics
    .map((diag) => `<li><strong>${escapeHtml(diag.code)}</strong> ${escapeHtml(diag.message)}${diag.hint ? ` <span>${escapeHtml(diag.hint)}</span>` : ""}</li>`)
    .join("")}</ul>`;
}

function catalogCounts(projects: IndexedProject[]): CatalogCounts {
  const artifacts = projects.flatMap((project) => project.artifacts);
  const routable = artifacts.filter((artifact) => artifact.status === "ok").length;
  const stale = artifacts.filter((artifact) => artifact.stale).length;
  const blocked = artifacts.filter((artifact) => artifact.status !== "ok" && !artifact.stale).length;
  return {
    total: artifacts.length,
    projects: projects.length,
    routable,
    stale,
    blocked
  };
}

function artifactStatus(artifact: IndexedArtifact): "ok" | "stale" | "blocked" {
  if (artifact.stale) return "stale";
  if (artifact.status === "ok") return "ok";
  return "blocked";
}

function artifactStatusText(artifact: IndexedArtifact): string {
  if (artifact.stale) return "stale";
  if (artifact.status === "ok") return "ok";
  return artifact.status;
}

function absoluteUrl(baseUrl: string | undefined, path: string): string {
  if (!baseUrl) return path;
  try {
    return new URL(path, baseUrl).href;
  } catch {
    return path;
  }
}

function layout(title: string, body: string, options: StartPageOptions = {}): string {
  const baseUrl = options.baseUrl ?? "";
  return `<!doctype html>
<html lang="en" data-skin="workbench">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    @property --edge-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
    :root {
      color-scheme: dark;
      --bg: #111418;
      --bg-2: #0b0d10;
      --surface: #d8c6a0;
      --surface-2: #cbb789;
      --thumb-bg: rgba(0,0,0,.07);
      --paper: radial-gradient(120% 90% at 20% 0%, rgba(255,250,235,.48), transparent 55%), repeating-linear-gradient(94deg, rgba(120,96,52,.05) 0 2px, transparent 2px 5px), radial-gradient(140% 120% at 80% 110%, rgba(70,52,24,.16), transparent 60%);
      --fg: #291f13;
      --fg-strong: #130d05;
      --muted: #675d49;
      --border: rgba(40,30,12,.24);
      --border-strong: rgba(40,30,12,.44);
      --accent: oklch(82% 0.14 202);
      --accent-2: oklch(74% 0.18 332);
      --accent-3: oklch(76% 0.15 268);
      --ok: oklch(70% 0.15 150);
      --warn: oklch(78% 0.14 80);
      --bad: oklch(66% 0.20 25);
      --radius: 8px;
      --radius-sm: 5px;
      --card-shadow: 0 22px 46px -24px rgba(0,0,0,.86), 0 3px 8px -3px rgba(0,0,0,.58);
      --font-display: 'Iowan Old Style', 'Charter', Georgia, serif;
      --font-body: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
      --font-mono: 'SF Mono', 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace;
      --edge-on: 1;
      --edge-blur: 16px;
      --grid-on: 0;
      --grid-heavy: 0.08;
      --grid-fine: 0.04;
      --reg-on: 0;
      --bench-on: .88;
      --thumb-stroke: oklch(48% 0.11 235);
      --kicker-spacing: .18em;
    }
    html[data-skin="ozalid"] {
      color-scheme: dark;
      --bg: oklch(30% 0.072 248);
      --bg-2: oklch(24% 0.066 250);
      --surface: oklch(33% 0.060 249 / .42);
      --surface-2: oklch(38% 0.058 248 / .5);
      --thumb-bg: oklch(26% 0.05 250 / .5);
      --paper: none;
      --fg: oklch(91% 0.045 224);
      --fg-strong: oklch(97% 0.04 220);
      --muted: oklch(74% 0.06 230);
      --border: oklch(80% 0.10 220 / .30);
      --border-strong: oklch(82% 0.12 218 / .55);
      --accent: oklch(83% 0.13 218);
      --accent-2: oklch(83% 0.13 218);
      --accent-3: oklch(83% 0.13 218);
      --ok: oklch(82% 0.13 200);
      --warn: oklch(84% 0.12 95);
      --bad: oklch(74% 0.16 30);
      --card-shadow: 0 1px 0 oklch(85% 0.12 220 / .12), 0 16px 40px -28px #000;
      --radius: 3px;
      --radius-sm: 2px;
      --font-display: var(--font-mono);
      --font-body: var(--font-mono);
      --edge-on: 0;
      --grid-on: 1;
      --grid-heavy: 0.06;
      --grid-fine: 0.032;
      --reg-on: .8;
      --bench-on: 0;
      --thumb-stroke: oklch(85% 0.13 218);
      --kicker-spacing: .24em;
    }
    html[data-skin="gallery"] {
      color-scheme: light;
      --bg: oklch(95% 0.004 250);
      --bg-2: oklch(92% 0.005 250);
      --surface: oklch(100% 0 0);
      --surface-2: oklch(98% 0.003 250);
      --thumb-bg: oklch(96% 0.004 250);
      --paper: none;
      --fg: oklch(26% 0.012 262);
      --fg-strong: oklch(16% 0.014 264);
      --muted: oklch(54% 0.012 262);
      --border: oklch(20% 0.02 264 / .12);
      --border-strong: oklch(20% 0.02 264 / .26);
      --accent: oklch(56% 0.16 27);
      --accent-2: oklch(56% 0.16 27);
      --accent-3: oklch(56% 0.16 27);
      --ok: oklch(58% 0.13 155);
      --warn: oklch(70% 0.13 70);
      --bad: oklch(58% 0.20 27);
      --card-shadow: 0 1px 2px rgba(20,22,30,.05), 0 14px 30px -20px rgba(20,22,30,.22);
      --radius: 4px;
      --radius-sm: 3px;
      --edge-on: 0;
      --grid-on: 0;
      --reg-on: 0;
      --bench-on: 0;
      --thumb-stroke: oklch(56% 0.16 27);
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      color: var(--fg);
      background: var(--bg-2);
      font: 14px/1.45 var(--font-body);
      -webkit-font-smoothing: antialiased;
      isolation: isolate;
    }
    [hidden] { display: none !important; }
    .surface-layers { position: fixed; inset: 0; z-index: -2; overflow: hidden; }
    .surface-photo {
      position: absolute;
      inset: -4%;
      background: url('/_html-home/assets/bench.jpg') center/cover no-repeat;
      filter: brightness(.38) saturate(.78) contrast(1.04) blur(1.5px);
      opacity: var(--bench-on);
      transform: scale(1.05);
    }
    .surface-wash {
      position: absolute;
      inset: 0;
      background: radial-gradient(120% 80% at 50% -10%, color-mix(in oklab, var(--bg) 55%, transparent), transparent 60%), radial-gradient(100% 100% at 50% 120%, rgba(0,0,0,.55), transparent 55%), linear-gradient(var(--bg-2), color-mix(in oklab, var(--bg-2) 80%, var(--bg)));
      opacity: .94;
    }
    .surface-grid {
      position: absolute;
      inset: 0;
      opacity: var(--grid-on);
      background-image: linear-gradient(color-mix(in oklab, var(--accent) calc(var(--grid-heavy) * 100%), transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--accent) calc(var(--grid-heavy) * 100%), transparent) 1px, transparent 1px), linear-gradient(color-mix(in oklab, var(--accent) calc(var(--grid-fine) * 100%), transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--accent) calc(var(--grid-fine) * 100%), transparent) 1px, transparent 1px);
      background-size: 96px 96px, 96px 96px, 16px 16px, 16px 16px;
      mask: radial-gradient(130% 100% at 50% 0%, #000 55%, transparent);
    }
    .surface-reg { position: absolute; inset: 0; opacity: var(--reg-on); pointer-events: none; }
    .surface-reg span { position: absolute; color: color-mix(in oklab, var(--accent) 55%, transparent); font: 10px/1 var(--font-mono); letter-spacing: .1em; }
    .surface-reg .tl { top: 14px; left: 16px; }
    .surface-reg .tr { top: 14px; right: 16px; }
    .surface-reg .bl { bottom: 14px; left: 16px; }
    .surface-reg .br { bottom: 14px; right: 16px; }
    .surface-reg .cx { top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 13px; opacity: .6; }
    .shell { max-width: 1320px; margin: 0 auto; padding: 26px clamp(16px, 3vw, 40px) 80px; }
    .top {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding-bottom: 18px;
      margin-bottom: 22px;
      border-bottom: 1px solid var(--border);
    }
    .brand { display: flex; align-items: baseline; gap: 12px; margin-right: auto; min-width: 220px; }
    .logo {
      color: var(--fg-strong);
      padding: 5px 11px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: color-mix(in oklab, var(--surface) 40%, transparent);
      font: 600 15px/1 var(--font-mono);
      white-space: nowrap;
    }
    .logo b { color: var(--accent); font-weight: 600; }
    .tag { color: var(--muted); font: 12.5px/1.3 var(--font-mono); overflow-wrap: anywhere; }
    .top .tag { color: color-mix(in oklab, var(--surface) 58%, transparent); }
    .serve {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      max-width: min(460px, 100%);
      color: color-mix(in oklab, var(--surface) 72%, transparent);
      padding: 5px 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      font: 11.5px/1.2 var(--font-mono);
      overflow-wrap: anywhere;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ok);
      box-shadow: 0 0 0 0 color-mix(in oklab, var(--ok) 70%, transparent);
      animation: pulse 2.4s infinite;
      flex: none;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--ok) 60%, transparent); }
      70% { box-shadow: 0 0 0 7px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
    }
    .seg, .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .seg {
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--border-strong);
      border-radius: 999px;
      background: color-mix(in oklab, var(--surface) 30%, transparent);
    }
    button, .nav-link, .open {
      color: var(--fg);
      background: color-mix(in oklab, var(--surface) 24%, transparent);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
      font: 12px/1.2 var(--font-mono);
      text-decoration: none;
      cursor: pointer;
    }
    button:hover, .nav-link:hover, .open:hover { color: var(--fg-strong); border-color: var(--border-strong); }
    .top button, .toolbar button, .project-filters button, .headline-actions button, .nav-link {
      color: color-mix(in oklab, var(--surface) 78%, white);
      background: color-mix(in oklab, var(--surface) 18%, transparent);
      border-color: color-mix(in oklab, var(--surface) 22%, transparent);
    }
    .top button:hover, .toolbar button:hover, .project-filters button:hover, .headline-actions button:hover, .nav-link:hover {
      color: color-mix(in oklab, var(--surface) 94%, white);
      border-color: color-mix(in oklab, var(--accent) 50%, transparent);
    }
    html[data-skin="gallery"] .top .tag,
    html[data-skin="gallery"] .serve,
    html[data-skin="gallery"] h2,
    html[data-skin="gallery"] .empty {
      color: var(--muted);
    }
    html[data-skin="gallery"] .top button,
    html[data-skin="gallery"] .toolbar button,
    html[data-skin="gallery"] .project-filters button,
    html[data-skin="gallery"] .headline-actions button,
    html[data-skin="gallery"] .nav-link {
      color: var(--fg);
      background: color-mix(in oklab, var(--surface) 80%, transparent);
      border-color: var(--border);
    }
    html[data-skin="gallery"] .top button:hover,
    html[data-skin="gallery"] .toolbar button:hover,
    html[data-skin="gallery"] .project-filters button:hover,
    html[data-skin="gallery"] .headline-actions button:hover,
    html[data-skin="gallery"] .nav-link:hover {
      color: var(--fg-strong);
      border-color: var(--border-strong);
    }
    .seg button {
      background: none;
      border: 0;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
    }
    .seg button[aria-pressed="true"], .chips button[aria-pressed="true"] {
      color: var(--fg-strong);
      background: color-mix(in oklab, var(--accent) 18%, var(--surface));
      box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 48%, transparent);
    }
    .seg svg, .search svg { width: 14px; height: 14px; flex: none; }
    .headline {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 18px;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0;
      color: color-mix(in oklab, var(--surface) 75%, white);
      font: 600 28px/1.1 var(--font-display);
      letter-spacing: 0;
    }
    html[data-skin="gallery"] h1 { color: var(--fg-strong); }
    .headline p {
      margin: 6px 0 0;
      color: color-mix(in oklab, var(--surface) 55%, var(--muted));
      font: 12.5px/1.35 var(--font-mono);
    }
    html[data-skin="gallery"] .headline p { color: var(--muted); }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .search {
      flex: 1 1 260px;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 9px 14px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      background: color-mix(in oklab, var(--surface) 22%, transparent);
    }
    .search svg { stroke: var(--muted); }
    .toolbar .search svg { stroke: color-mix(in oklab, var(--surface) 52%, transparent); }
    .search input {
      flex: 1;
      min-width: 0;
      color: color-mix(in oklab, var(--surface) 88%, white);
      background: none;
      border: 0;
      outline: none;
      font: 14px/1.3 var(--font-body);
    }
    html[data-skin="gallery"] .search input { color: var(--fg-strong); }
    .search input::placeholder { color: var(--muted); }
    .toolbar .search input::placeholder { color: color-mix(in oklab, var(--surface) 54%, transparent); }
    html[data-skin="gallery"] .toolbar .search input::placeholder { color: var(--muted); }
    .chips { margin: 8px 0 0; }
    .chips button { border-radius: 999px; white-space: nowrap; }
    .chips span { opacity: .7; margin-left: 4px; }
    .diag-strip {
      display: flex;
      gap: 18px;
      flex-wrap: wrap;
      align-items: center;
      margin: 16px 0 22px;
      padding: 11px 16px;
      color: var(--muted);
      border: 1px solid var(--border);
      border-left: 2px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: color-mix(in oklab, var(--surface) 14%, transparent);
      font: 12px/1.2 var(--font-mono);
    }
    .diag-strip b { color: color-mix(in oklab, var(--surface) 78%, white); font-weight: 600; }
    html[data-skin="gallery"] .diag-strip b { color: var(--fg-strong); }
    .swatch { width: 8px; height: 8px; border-radius: 2px; display: inline-block; margin-right: 6px; }
    .swatch.ok { background: var(--ok); }
    .swatch.warn { background: var(--warn); }
    .swatch.bad { background: var(--bad); }
    .recent, .diagnostics-panel { margin: 20px 0; }
    h2 {
      margin: 0 0 10px;
      color: color-mix(in oklab, var(--surface) 65%, var(--muted));
      font: 700 11px/1 var(--font-mono);
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    .recent-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .recent-link {
      min-width: 180px;
      max-width: 280px;
      color: var(--fg);
      background: var(--surface);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      padding: 9px 11px;
      text-decoration: none;
      box-shadow: var(--card-shadow);
    }
    .recent-link span { display: block; color: var(--muted); font: 11px/1.3 var(--font-mono); overflow-wrap: anywhere; }
    .diagnostics {
      margin: 0;
      padding: 12px 16px 12px 30px;
      color: var(--bad);
      border: 1px solid color-mix(in oklab, var(--bad) 38%, transparent);
      border-radius: var(--radius-sm);
      background: color-mix(in oklab, var(--bad) 8%, transparent);
    }
    .diagnostics span { color: var(--muted); }
    .no-diagnostics { margin: 0; color: var(--muted); font: 12px/1.3 var(--font-mono); }
    .panel { display: grid; gap: 28px; }
    .project { min-width: 0; }
    .project[hidden] { display: none; }
    .project-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 18px;
      margin: 0 0 12px;
      padding-bottom: 9px;
      border-bottom: 1px solid var(--border);
    }
    .project-title {
      color: color-mix(in oklab, var(--surface) 82%, white);
      font: 600 18px/1.15 var(--font-display);
      text-decoration: none;
    }
    html[data-skin="gallery"] .project-title { color: var(--fg-strong); }
    .project-head p {
      margin: 4px 0 0;
      color: var(--muted);
      font: 12px/1.3 var(--font-mono);
    }
    code {
      color: var(--fg);
      background: color-mix(in oklab, var(--fg) 6%, transparent);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 4px 6px;
      font: 11px/1.25 var(--font-mono);
      overflow-wrap: anywhere;
    }
    .project-head code {
      max-width: min(520px, 50vw);
      color: color-mix(in oklab, var(--surface) 70%, white);
      background: color-mix(in oklab, var(--surface) 12%, transparent);
    }
    html[data-skin="gallery"] .project-head code { color: var(--fg); }
    .project-artifacts {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(auto-fill, minmax(274px, 1fr));
    }
    .artifact {
      position: relative;
      min-width: 0;
      display: flex;
      flex-direction: column;
      color: var(--fg);
      background-color: var(--surface);
      background-image: var(--paper), linear-gradient(color-mix(in oklab, var(--surface) 100%, transparent), var(--surface-2));
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      box-shadow: var(--card-shadow);
      transition: transform .2s ease, box-shadow .2s ease;
    }
    .artifact:hover { transform: translateY(-3px); }
    .artifact[hidden] { display: none; }
    html[data-skin="workbench"] .artifact.slate {
      --fg: #efe6d0;
      --fg-strong: #fdf7e8;
      --muted: #c5b79a;
      --border: rgba(255,255,255,.10);
      --border-strong: rgba(255,255,255,.16);
      --thumb-bg: rgba(255,255,255,.05);
      --thumb-stroke: oklch(86% 0.12 205);
      background-image: none;
      background-color: #171a20;
    }
    .artifact::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      padding: 1px;
      background: conic-gradient(from var(--edge-angle), var(--accent), var(--accent-2), var(--accent-3), var(--accent));
      mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      mask-composite: exclude;
      opacity: calc(var(--edge-on) * .86);
      animation: spin 6s linear infinite;
      pointer-events: none;
      z-index: 2;
    }
    .artifact::after {
      content: "";
      position: absolute;
      inset: -1px;
      border-radius: inherit;
      background: conic-gradient(from var(--edge-angle), var(--accent), var(--accent-2), var(--accent-3), var(--accent));
      filter: blur(var(--edge-blur));
      opacity: calc(var(--edge-on) * .38);
      animation: spin 6s linear infinite;
      pointer-events: none;
      z-index: -1;
    }
    @keyframes spin { to { --edge-angle: 360deg; } }
    @media (prefers-reduced-motion: reduce) {
      .artifact::before, .artifact::after, .dot { animation: none; }
      .artifact:hover { transform: none; }
    }
    .thumb {
      position: relative;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: var(--thumb-bg);
      border-bottom: 1px solid var(--border);
      border-radius: var(--radius) var(--radius) 0 0;
    }
    .kind {
      position: absolute;
      top: 9px;
      left: 10px;
      z-index: 2;
      color: var(--muted);
      background: color-mix(in oklab, var(--thumb-bg) 60%, transparent);
      border-radius: 3px;
      padding: 2px 5px;
      font: 10px/1.2 var(--font-mono);
      letter-spacing: var(--kicker-spacing);
      text-transform: uppercase;
    }
    .mini {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      color: var(--fg);
      background: color-mix(in oklab, var(--thumb-bg) 82%, var(--surface));
    }
    .mini-bar {
      height: 28px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 11px;
      border-bottom: 1px solid var(--border);
      font: 10px/1 var(--font-mono);
      color: var(--muted);
    }
    .mini-bar i { width: 7px; height: 7px; border-radius: 50%; background: color-mix(in oklab, var(--thumb-stroke) 40%, transparent); }
    .mini-bar i:first-child { background: var(--thumb-stroke); }
    .mini-body { flex: 1; padding: 34px 14px 14px; display: grid; grid-template-columns: 1fr 1.1fr; gap: 12px; align-items: end; }
    .mini-line { display: block; height: 8px; border-radius: 999px; background: color-mix(in oklab, var(--fg) 16%, transparent); align-self: start; }
    .mini-line.wide { grid-column: 1 / 2; width: 94%; }
    .mini-line.short { width: 56%; }
    .mini-chart {
      grid-row: 1 / span 3;
      grid-column: 2;
      height: 74%;
      display: flex;
      align-items: end;
      gap: 6px;
      padding: 9px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: color-mix(in oklab, var(--fg) 5%, transparent);
    }
    .mini-chart i { flex: 1; min-width: 5px; border-radius: 999px 999px 2px 2px; background: color-mix(in oklab, var(--thumb-stroke) 68%, transparent); }
    .mini-chart i:nth-child(1) { height: 36%; }
    .mini-chart i:nth-child(2) { height: 68%; }
    .mini-chart i:nth-child(3) { height: 48%; }
    .mini-chart i:nth-child(4) { height: 84%; }
    .mini-chart i:nth-child(5) { height: 58%; }
    .body { flex: 1; display: flex; flex-direction: column; gap: 9px; padding: 14px 15px 13px; }
    .artifact h3 {
      margin: 0;
      color: var(--fg-strong);
      font: 600 18px/1.18 var(--font-display);
      letter-spacing: 0;
      text-wrap: balance;
    }
    .repo {
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--muted);
      font: 11px/1.3 var(--font-mono);
      overflow-wrap: anywhere;
    }
    .glyph { width: 7px; height: 7px; border-radius: 2px; background: var(--accent); flex: none; transform: rotate(45deg); }
    .path {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: color-mix(in oklab, var(--fg) 6%, transparent);
    }
    .path code {
      flex: 1;
      min-width: 0;
      padding: 0;
      border: 0;
      background: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .path button {
      flex: none;
      padding: 2px 4px;
      border: 0;
      background: none;
      color: var(--muted);
      font-size: 10.5px;
    }
    .path button:hover { color: var(--accent); background: color-mix(in oklab, var(--accent) 14%, transparent); }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .tag {
      color: var(--muted);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 8px;
      font: 10px/1.2 var(--font-mono);
    }
    .diag-note { margin: 0; color: var(--bad); font: 12px/1.35 var(--font-mono); }
    .foot {
      margin-top: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      padding: 11px 15px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font: 10.5px/1.2 var(--font-mono);
    }
    .status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
    .status .led { width: 7px; height: 7px; border-radius: 50%; }
    .status.ok { color: var(--ok); }
    .status.ok .led { background: var(--ok); box-shadow: 0 0 8px color-mix(in oklab, var(--ok) 70%, transparent); }
    .status.stale { color: var(--warn); }
    .status.stale .led { background: var(--warn); }
    .status.blocked { color: var(--bad); }
    .status.blocked .led { background: var(--bad); box-shadow: 0 0 8px color-mix(in oklab, var(--bad) 70%, transparent); }
    .spacer { margin-left: auto; }
    .open {
      color: var(--accent);
      border-color: color-mix(in oklab, var(--accent) 42%, transparent);
      background: transparent;
    }
    .open.disabled {
      color: var(--muted);
      border-color: var(--border);
      pointer-events: none;
      opacity: .62;
    }
    .panel.is-list .project-artifacts { grid-template-columns: 1fr; gap: 10px; }
    .panel.is-list .artifact { display: grid; grid-template-columns: minmax(160px, 220px) minmax(0, 1fr) auto; align-items: stretch; }
    .panel.is-list .thumb { aspect-ratio: auto; min-height: 132px; border-bottom: 0; border-right: 1px solid var(--border); border-radius: var(--radius) 0 0 var(--radius); }
    .panel.is-list .body { min-width: 0; }
    .panel.is-list .foot { margin-top: 0; min-width: 172px; flex-direction: column; align-items: flex-end; justify-content: center; border-top: 0; border-left: 1px solid var(--border); }
    .panel.is-list .spacer { display: none; }
    .empty, .single-message {
      color: color-mix(in oklab, var(--surface) 70%, var(--muted));
      text-align: center;
      padding: 56px 0;
      font: 13px/1.4 var(--font-mono);
    }
    .single-message h1 { color: color-mix(in oklab, var(--surface) 80%, white); }
    .pagefoot {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      margin-top: 40px;
      padding-top: 18px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font: 11.5px/1.3 var(--font-mono);
    }
    .pagefoot b { color: color-mix(in oklab, var(--surface) 78%, white); }
    html[data-skin="gallery"] .pagefoot b { color: var(--fg-strong); }
    .copied { color: var(--ok) !important; border-color: color-mix(in oklab, var(--ok) 50%, transparent) !important; }
    @media (max-width: 760px) {
      .headline { align-items: flex-start; flex-direction: column; }
      .brand { width: 100%; }
      .seg.skins { width: 100%; }
      .seg.skins button { flex: 1; justify-content: center; }
      .project-head { align-items: flex-start; flex-direction: column; }
      .project-head code { max-width: 100%; }
      .panel.is-list .artifact { display: flex; }
      .panel.is-list .thumb { display: none; }
      .panel.is-list .foot { align-items: flex-start; border-left: 0; border-top: 1px solid var(--border); }
    }
  </style>
</head>
<body>
  <div class="surface-layers" aria-hidden="true">
    <div class="surface-photo"></div>
    <div class="surface-wash"></div>
    <div class="surface-grid"></div>
    <div class="surface-reg">
      <span class="tl">+ A1</span><span class="tr">B7 +</span>
      <span class="bl">+ target</span><span class="br">target +</span>
      <span class="cx">+</span>
    </div>
  </div>
  <div class="shell" data-base-url="${escapeAttribute(baseUrl)}">
    ${body}
  </div>
<script>
const recentKey = "html-home.recentArtifacts.v1";
const skinKey = "htmlhome.skin";
let activeStatus = "all";
let activeProject = "all";

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const opener = target.closest("[data-open-artifact]");
  if (opener instanceof HTMLAnchorElement) {
    recordRecent({
      href: opener.getAttribute("href") || "",
      title: opener.dataset.openTitle || opener.dataset.openKey || "Artifact",
      key: opener.dataset.openKey || opener.getAttribute("href") || ""
    });
  }

  const copyButton = target.closest("[data-copy]");
  if (copyButton instanceof HTMLElement) {
    copyText(copyButton.dataset.copy || "");
    const previous = copyButton.textContent || "Copy";
    copyButton.textContent = "Copied";
    copyButton.classList.add("copied");
    window.setTimeout(() => {
      copyButton.textContent = previous;
      copyButton.classList.remove("copied");
    }, 1100);
  }
});

document.querySelectorAll("[data-status-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeStatus = button instanceof HTMLElement ? button.dataset.statusFilter || "all" : "all";
    setPressed("[data-status-filter]", button);
    applyFilters();
  });
});

document.querySelectorAll("[data-project-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeProject = button instanceof HTMLElement ? button.dataset.projectFilter || "all" : "all";
    setPressed("[data-project-filter]", button);
    applyFilters();
  });
});

const search = document.getElementById("search");
if (search) search.addEventListener("input", applyFilters);

const panel = document.getElementById("panel");
const viewButtons = document.querySelectorAll("[data-view]");
const viewKey = (skin) => "htmlhome.view." + skin;
function viewForSkin(skin) {
  try { return localStorage.getItem(viewKey(skin)) || "grid"; } catch { return "grid"; }
}
function setView(view, persist = true) {
  if (panel) panel.classList.toggle("is-list", view === "list");
  viewButtons.forEach((button) => button.setAttribute("aria-pressed", button instanceof HTMLElement && button.dataset.view === view ? "true" : "false"));
  if (persist) {
    try { localStorage.setItem(viewKey(currentSkin()), view); } catch {}
  }
}
viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button instanceof HTMLElement) setView(button.dataset.view || "grid");
  });
});

const skinButtons = document.querySelectorAll("[data-skin]");
function currentSkin() {
  return document.documentElement.getAttribute("data-skin") || "workbench";
}
function setSkin(skin) {
  document.documentElement.setAttribute("data-skin", skin);
  skinButtons.forEach((button) => button.setAttribute("aria-pressed", button instanceof HTMLElement && button.dataset.skin === skin ? "true" : "false"));
  try { localStorage.setItem(skinKey, skin); } catch {}
  setView(viewForSkin(skin), false);
}
skinButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button instanceof HTMLElement) setSkin(button.dataset.skin || "workbench");
  });
});

function setPressed(selector, active) {
  document.querySelectorAll(selector).forEach((item) => item.setAttribute("aria-pressed", item === active ? "true" : "false"));
}

function applyFilters() {
  const query = search instanceof HTMLInputElement ? search.value.trim().toLowerCase() : "";
  let visibleArtifacts = 0;

  document.querySelectorAll(".project").forEach((project) => {
    if (!(project instanceof HTMLElement)) return;
    const projectText = (project.dataset.search || "").toLowerCase();
    const projectQueryMatch = query.length === 0 || projectText.includes(query);
    let projectVisibleArtifacts = 0;

    project.querySelectorAll(".artifact").forEach((artifact) => {
      if (!(artifact instanceof HTMLElement)) return;
      const textMatches = projectQueryMatch || (artifact.dataset.search || "").toLowerCase().includes(query);
      const statusMatches = activeStatus === "all" || artifact.dataset.status === activeStatus;
      const projectMatches = activeProject === "all" || artifact.dataset.project === activeProject;
      const visible = textMatches && statusMatches && projectMatches;
      artifact.hidden = !visible;
      if (visible) {
        projectVisibleArtifacts += 1;
        visibleArtifacts += 1;
      }
    });
    project.hidden = projectVisibleArtifacts === 0;
  });

  const empty = document.getElementById("empty-filter-state");
  if (empty) empty.hidden = visibleArtifacts !== 0;
}

function readRecent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentKey) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.href === "string" && item.href.startsWith("/home/") && typeof item.key === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecent(items) {
  try { localStorage.setItem(recentKey, JSON.stringify(items.slice(0, 8))); } catch {}
}

function recordRecent(item) {
  if (!item.href || !item.href.startsWith("/home/") || !item.key) return;
  writeRecent([item, ...readRecent().filter((existing) => existing.key !== item.key)]);
}

function renderRecent() {
  const section = document.getElementById("recent-section");
  const container = document.getElementById("recent-artifacts");
  if (!section || !container) return;
  const items = readRecent();
  section.hidden = items.length === 0;
  container.replaceChildren(...items.map((item) => {
    const link = document.createElement("a");
    link.className = "recent-link";
    link.href = item.href;
    link.textContent = item.title || item.key;
    const key = document.createElement("span");
    key.textContent = item.key;
    link.appendChild(key);
    return link;
  }));
}

async function copyText(value) {
  if (!value) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {}
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  try { document.execCommand("copy"); } catch {}
  input.remove();
}

renderRecent();
applyFilters();
let bootSkin = "workbench";
try { bootSkin = localStorage.getItem(skinKey) || "workbench"; } catch {}
setSkin(bootSkin);
</script>
</body>
</html>`;
}

function searchTextForProject(project: IndexedProject): string {
  return [project.projectSlug, project.title, project.manifestRoot].join(" ");
}

function searchTextForArtifact(artifact: IndexedArtifact): string {
  return [
    artifact.projectSlug,
    artifact.artifactSlug,
    artifact.title,
    artifact.artifactPath,
    artifact.artifactBaseDirectory,
    artifact.status,
    ...artifact.tags,
    ...artifact.diagnostics.map((diag) => `${diag.code} ${diag.message}`)
  ].join(" ");
}

function searchIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>`;
}

function gridIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>`;
}

function listIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"></path><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"></circle></svg>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
