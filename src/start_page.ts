import type { Diagnostic, IndexedArtifact, IndexedProject, StateDoc } from "./types";

export function renderHomePage(state: StateDoc): string {
  const projects = state.index.projects;
  const artifacts = projects.flatMap((project) => project.artifacts);
  const blocked = artifacts.filter((artifact) => artifact.status !== "ok").length;
  const routable = artifacts.length - blocked;
  const indexTimestamp = state.index.generatedAt ? ` · indexed ${state.index.generatedAt}` : "";

  return layout(
    "HTML Home",
    `<header class="top">
      <div>
        <h1>html-home</h1>
        <p class="subtle">Last-known index. Run <code>html-home rescan</code> after changing manifests or artifacts.</p>
      </div>
      <div class="summary">${projects.length} projects · ${routable} routable · ${blocked} blocked${escapeHtml(indexTimestamp)}</div>
    </header>
    <input id="search" type="search" placeholder="Search project, artifact, title, tag, or path" autofocus>
    <div class="filters" role="group" aria-label="Status filter">
      <button type="button" data-status-filter="all" aria-pressed="true">All</button>
      <button type="button" data-status-filter="ok" aria-pressed="false">Routable</button>
      <button type="button" data-status-filter="blocked" aria-pressed="false">Blocked</button>
    </div>
    <section id="recent-section" hidden>
      <h2>Recently opened in this browser</h2>
      <div id="recent-artifacts" class="recent-list"></div>
    </section>
    <section>
      <h2>Diagnostics</h2>
      ${renderDiagnostics(state.diagnostics)}
    </section>
    <section>
      <h2>Projects</h2>
      ${projects.map(renderProjectGroup).join("") || `<p class="empty">No registered artifacts yet.</p>`}
    </section>`
  );
}

export function renderProjectPage(project: IndexedProject | undefined, state: StateDoc): string {
  if (!project) {
    return layout("Project Not Found", `<h1>Project not found</h1><p class="empty">No project with that slug exists in local state.</p>`);
  }
  return layout(
    project.title,
    `<header class="top">
      <div>
        <h1>${escapeHtml(project.title)}</h1>
        <p class="subtle"><code>${escapeHtml(project.projectSlug)}</code> · ${escapeHtml(project.manifestRoot)} · indexed ${escapeHtml(project.lastIndexedAt)}</p>
      </div>
      <a class="button" href="/">All projects</a>
    </header>
    ${renderDiagnostics([...project.diagnostics, ...project.artifacts.flatMap((artifact) => artifact.diagnostics)])}
    ${renderProjectGroup(project)}`
  );
}

function renderProjectGroup(project: IndexedProject): string {
  const blocked = project.artifacts.filter((artifact) => artifact.status !== "ok").length;
  return `<article class="project" data-search="${escapeAttribute(searchTextForProject(project))}">
    <header>
      <h3>${escapeHtml(project.title)}</h3>
      <div class="path">${escapeHtml(project.manifestRoot)}</div>
      <div class="subtle">${project.artifacts.length} artifacts · ${project.artifacts.length - blocked} routable · ${blocked} blocked · indexed ${escapeHtml(project.lastIndexedAt)}</div>
    </header>
    <div class="artifacts">
      ${project.artifacts.map(renderArtifactRow).join("")}
    </div>
  </article>`;
}

function renderArtifactRow(artifact: IndexedArtifact): string {
  const href = `/a/${encodeURIComponent(artifact.projectSlug)}/${encodeURIComponent(artifact.artifactSlug)}/`;
  const sourcePath = `${artifact.artifactBaseDirectory}`;
  const isOk = artifact.status === "ok";
  const routeKey = `${artifact.projectSlug}/${artifact.artifactSlug}`;
  return `<div class="artifact ${isOk ? "ok" : "blocked"}" data-status="${isOk ? "ok" : "blocked"}" data-search="${escapeAttribute(searchTextForArtifact(artifact))}">
    <span class="status">${escapeHtml(isOk ? "ok" : "blocked")}</span>
    <div class="artifact-main">
      <strong>${escapeHtml(artifact.title)}</strong>
      <code>${escapeHtml(routeKey)}</code>
      <div class="path">${escapeHtml(sourcePath)}</div>
      <div class="subtle">indexed ${escapeHtml(artifact.lastIndexedAt)}</div>
      ${artifact.tags.length ? `<div class="tags">${artifact.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${artifact.diagnostics.length ? `<div class="diag">${escapeHtml(artifact.diagnostics[0].code)}: ${escapeHtml(artifact.diagnostics[0].message)}</div>` : ""}
    </div>
    <div class="actions">
      ${isOk ? `<a class="button" href="${href}" data-open-artifact data-open-title="${escapeAttribute(artifact.title)}" data-open-key="${escapeAttribute(routeKey)}">Open</a>` : `<span class="button disabled">Blocked</span>`}
      <button type="button" data-copy="${escapeAttribute(href)}">Copy URL</button>
      <button type="button" data-copy="${escapeAttribute(sourcePath)}">Copy path</button>
    </div>
  </div>`;
}

function renderDiagnostics(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return `<p class="empty">No diagnostics.</p>`;
  return `<ul class="diagnostics">${diagnostics
    .map((diag) => `<li><strong>${escapeHtml(diag.code)}</strong> ${escapeHtml(diag.message)}${diag.hint ? ` <span>${escapeHtml(diag.hint)}</span>` : ""}</li>`)
    .join("")}</ul>`;
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink:#171717; --muted:#626262; --line:#d8d8d8; --soft:#f5f5f3; --bad:#8f1d1d; --ok:#17633a; }
    * { box-sizing: border-box; }
    body { margin:0; color:var(--ink); background:#fbfbfa; font:14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width:1180px; margin:0 auto; padding:24px; }
    h1 { margin:0; font-size:24px; letter-spacing:0; }
    h2 { margin:24px 0 8px; font-size:13px; text-transform:uppercase; color:var(--muted); letter-spacing:0; }
    h3 { margin:0; font-size:18px; }
    code { font:12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background:var(--soft); border:1px solid var(--line); padding:1px 4px; border-radius:4px; }
    .top { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; border-bottom:1px solid var(--line); padding-bottom:18px; }
    .summary { color:var(--muted); font-weight:600; }
    .subtle, .path, .empty { color:var(--muted); }
    input[type=search] { width:100%; margin:18px 0 4px; padding:10px 12px; border:1px solid var(--line); border-radius:6px; font:inherit; background:white; }
    [hidden] { display:none !important; }
    .filters { display:flex; gap:6px; margin:8px 0 2px; flex-wrap:wrap; }
    .filters [aria-pressed=true] { color:white; background:var(--ink); border-color:var(--ink); }
    .recent-list { display:flex; flex-wrap:wrap; gap:8px; }
    .recent-link { display:flex; flex-direction:column; min-width:180px; max-width:260px; gap:2px; color:var(--ink); background:white; border:1px solid var(--line); border-radius:8px; padding:8px 10px; text-decoration:none; }
    .recent-link span { color:var(--muted); font:12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap:anywhere; }
    .project { border:1px solid var(--line); border-radius:8px; background:white; margin:12px 0; padding:14px; }
    .project > header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-bottom:10px; border-bottom:1px solid var(--line); }
    .artifact { display:grid; grid-template-columns:70px 1fr auto; gap:12px; align-items:start; padding:12px 0; border-bottom:1px solid #ecece9; }
    .artifact:last-child { border-bottom:0; }
    .status { color:white; background:var(--ok); border-radius:999px; padding:2px 8px; text-align:center; font-size:12px; font-weight:700; }
    .blocked .status { background:var(--bad); }
    .artifact-main strong { display:inline-block; margin-right:8px; }
    .tags { display:flex; gap:4px; margin-top:4px; }
    .tags span { background:var(--soft); border:1px solid var(--line); border-radius:999px; padding:1px 6px; font-size:12px; color:var(--muted); }
    .diag { margin-top:4px; color:var(--bad); }
    .actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
    .button, button { color:var(--ink); background:var(--soft); border:1px solid var(--line); border-radius:6px; padding:5px 8px; font:inherit; text-decoration:none; cursor:pointer; }
    .disabled { color:var(--muted); cursor:default; }
    .diagnostics { margin:0; padding-left:18px; color:var(--bad); }
  </style>
</head>
<body>
<main>
${body}
</main>
<script>
const recentKey = "html-home.recentArtifacts.v1";

document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement) {
    const opener = target.closest("[data-open-artifact]");
    if (opener instanceof HTMLAnchorElement) {
      recordRecent({
        href: opener.getAttribute("href") || "",
        title: opener.dataset.openTitle || opener.dataset.openKey || "Artifact",
        key: opener.dataset.openKey || opener.getAttribute("href") || ""
      });
    }
  }
  if (target instanceof HTMLElement && target.dataset.copy) {
    navigator.clipboard && navigator.clipboard.writeText(target.dataset.copy);
  }
});

document.querySelectorAll("[data-status-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-status-filter]").forEach((item) => item.setAttribute("aria-pressed", "false"));
    button.setAttribute("aria-pressed", "true");
    applyFilters();
  });
});

const search = document.getElementById("search");
if (search) search.addEventListener("input", applyFilters);
renderRecent();
applyFilters();

function applyFilters() {
  const q = search instanceof HTMLInputElement ? search.value.toLowerCase() : "";
  const selected = document.querySelector("[data-status-filter][aria-pressed=true]");
  const status = selected instanceof HTMLElement ? selected.dataset.statusFilter || "all" : "all";
  document.querySelectorAll(".project").forEach((project) => {
    const projectMatches = project instanceof HTMLElement && (project.dataset.search || "").toLowerCase().includes(q);
    let visibleArtifacts = 0;
    project.querySelectorAll(".artifact").forEach((artifact) => {
      if (!(artifact instanceof HTMLElement)) return;
      const textMatches = projectMatches || (artifact.dataset.search || "").toLowerCase().includes(q);
      const statusMatches = status === "all" || artifact.dataset.status === status;
      const visible = textMatches && statusMatches;
      artifact.hidden = !visible;
      if (visible) visibleArtifacts += 1;
    });
    if (project instanceof HTMLElement) project.hidden = visibleArtifacts === 0;
  });
}

function readRecent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentKey) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.href === "string" && item.href.startsWith("/a/") && typeof item.key === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecent(items) {
  try {
    localStorage.setItem(recentKey, JSON.stringify(items.slice(0, 8)));
  } catch {}
}

function recordRecent(item) {
  if (!item.href || !item.href.startsWith("/a/") || !item.key) return;
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
</script>
</body>
</html>`;
}

function searchTextForProject(project: IndexedProject): string {
  return [project.projectSlug, project.title, project.manifestRoot, ...project.artifacts.map(searchTextForArtifact)].join(" ");
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
