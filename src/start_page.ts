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

type PreviewArtifact = {
  key: string;
  title: string;
  project: string;
  route: string;
  status: "ok" | "stale" | "blocked";
  kind: string;
  render: "dashboard" | "graph" | "scatter" | "list" | "map" | "doc";
  metric: string;
  delta: string;
  tags: string[];
  path: string;
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
  const previews = previewArtifacts(input.projects);

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
    <script type="application/json" id="html-home-preview-data">${jsonForScript(previews)}</script>

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

  return `<article class="artifact ${slate} ${isOk ? "" : "broken-card"}" data-status="${escapeAttribute(status)}" data-project="${escapeAttribute(artifact.projectSlug)}" data-preview-key="${escapeAttribute(routeKey)}" data-search="${escapeAttribute(searchTextForArtifact(artifact))}">
    <div class="thumb" aria-hidden="true">
      <span class="kind">${escapeHtml(previewKind(artifact))}</span>
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

function previewArtifacts(projects: IndexedProject[]): PreviewArtifact[] {
  return projects.flatMap((project) =>
    project.artifacts.map((artifact) => {
      const route = `${artifact.projectSlug}/${artifact.artifactSlug}`;
      const tags = artifact.tags.slice(0, 5);
      const render = previewRender(artifact);
      return {
        key: route,
        title: artifact.title,
        project: artifact.projectSlug,
        route,
        status: artifactStatus(artifact),
        kind: previewKind(artifact),
        render,
        metric: previewMetric(artifact),
        delta: previewDelta(artifact),
        tags,
        path: artifact.artifactPath
      };
    })
  );
}

function previewKind(artifact: IndexedArtifact): string {
  if (artifact.stale) return "stale";
  if (artifact.status !== "ok") return artifact.status;
  return artifact.tags[0] ?? (artifact.actions.length ? "actionable" : "artifact");
}

function previewRender(artifact: IndexedArtifact): PreviewArtifact["render"] {
  const text = [artifact.title, artifact.artifactSlug, artifact.artifactPath, ...artifact.tags].join(" ").toLowerCase();
  if (/\b(graph|network|map|cluster|node|research)\b/.test(text)) return "graph";
  if (/\b(scatter|field|embed|density|umap|plot)\b/.test(text)) return "scatter";
  if (/\b(list|library|snippet|component|table|editor)\b/.test(text)) return "list";
  if (/\b(flow|journey|step|wizard|onboard)\b/.test(text)) return "map";
  if (/\b(report|brief|doc|postmortem|incident|memo|note)\b/.test(text)) return "doc";
  return "dashboard";
}

function previewMetric(artifact: IndexedArtifact): string {
  if (artifact.actions.length > 0) return `${artifact.actions.length}`;
  if (artifact.tags.length > 0) return `${artifact.tags.length}`;
  if (artifact.diagnostics.length > 0) return `${artifact.diagnostics.length}`;
  return artifact.status === "ok" ? "200" : "0";
}

function previewDelta(artifact: IndexedArtifact): string {
  if (artifact.actions.length > 0) return artifact.actions.length === 1 ? "action" : "actions";
  if (artifact.tags.length > 0) return artifact.tags.length === 1 ? "tag" : "tags";
  if (artifact.stale) return "stale";
  if (artifact.status !== "ok") return "blocked";
  return "ready";
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
  <link rel="stylesheet" href="/_html-home/assets/start-page.css">
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
  <script src="/_html-home/assets/start-page.js"></script>
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

function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
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
