(function () {
  const DW = 640;
  const DH = 360;
  const recentKey = "html-home.recentArtifacts.v1";
  const skinKey = "htmlhome.skin";
  let activeStatus = "all";
  let activeProject = "all";

  const previewScript = document.getElementById("html-home-preview-data");
  const previews = readPreviewData(previewScript);
  const previewByKey = new Map(previews.map((item) => [item.key, item]));
  const resizeObserver = "ResizeObserver" in window ? new ResizeObserver((entries) => {
    for (const entry of entries) scaleThumb(entry.target);
  }) : null;

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
    requestAnimationFrame(mountPreviews);
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

  function readPreviewData(script) {
    if (!script) return [];
    try {
      const parsed = JSON.parse(script.textContent || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.key === "string") : [];
    } catch {
      return [];
    }
  }

  function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = s * 16807 % 2147483647) / 2147483647;
  }

  function seedOf(value) {
    let h = 0;
    for (const char of String(value)) h = (h * 31 + char.charCodeAt(0)) | 0;
    return Math.abs(h) || 7;
  }

  function esc(value) {
    return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
  }

  function series(random, count) {
    let value = 46;
    const values = [];
    for (let index = 0; index < count; index += 1) {
      value = Math.max(8, Math.min(92, value + (random() - 0.46) * 30));
      values.push(value);
    }
    return values;
  }

  function areaPath(values) {
    const count = values.length;
    const x = (index) => (index / (count - 1) * 100).toFixed(2);
    const y = (value) => (38 - (value / 100 * 34)).toFixed(2);
    let line = "M " + x(0) + " " + y(values[0]);
    for (let index = 1; index < count; index += 1) line += " L " + x(index) + " " + y(values[index]);
    return { line, area: line + " L 100 38 L 0 38 Z" };
  }

  function sparkSvg(random) {
    const path = areaPath(series(random, 12)).line;
    return '<svg class="spk" viewBox="0 0 100 38" preserveAspectRatio="none"><path d="' + path + '" fill="none" stroke="var(--a)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
  }

  function bar(title, tabs) {
    return '<div class="bar"><span class="dots"><i></i><i></i><i></i></span>' +
      '<span class="ti">' + esc(title) + '</span><span class="sp"></span>' +
      '<span class="tabs">' + tabs.map((tab, index) => '<span class="' + (index === 0 ? "on" : "") + '">' + esc(tab) + '</span>').join("") + '</span></div>';
  }

  function bodyFor(artifact) {
    const random = rng(seedOf(artifact.key + artifact.title));
    const upper = (value) => esc(String(value)).toUpperCase();

    if (artifact.render === "dashboard") {
      const paths = areaPath(series(random, 16));
      const labels = ["throughput", "coverage", "latency", "freshness"];
      const labelTwo = labels[Math.floor(random() * labels.length)];
      const labelThree = ["p95", "status", "signals", "uptime"][Math.floor(random() * 4)];
      const numberTwo = (20 + Math.floor(random() * 70)) + "%";
      const numberThree = (1 + Math.floor(random() * 9)) + "." + Math.floor(random() * 9);
      const kpi = (label, number, delta, className) => '<div class="kpi"><span class="lab">' + upper(label) + '</span><span class="num">' + esc(number) + '</span><span class="d ' + className + '">' + esc(delta) + sparkSvg(random) + '</span></div>';
      return bar(artifact.route, ["Overview", "Series", "Files"]) +
        '<div class="main">' +
        '<div class="kpis">' +
        kpi(artifact.tags[0] || "artifact", artifact.metric, artifact.delta, artifact.status === "ok" ? "pos" : "neg") +
        kpi(labelTwo, numberTwo, (random() > 0.5 ? "+" : "-") + (1 + Math.floor(random() * 8)) + "%", random() > 0.5 ? "pos" : "neg") +
        kpi(labelThree, numberThree, artifact.status, artifact.status === "blocked" ? "neg" : "pos") +
        '</div><div class="chart"><div class="chart-h"><b>' + upper("index trail") + '</b><span>local state</span></div>' +
        '<svg class="ar" viewBox="0 0 100 38" preserveAspectRatio="none">' +
        '<path d="' + paths.area + '" fill="var(--a)" opacity=".13"/>' +
        '<path d="' + paths.line + '" fill="none" stroke="var(--a)" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
        '</svg></div></div>';
    }

    if (artifact.render === "graph") {
      const points = [];
      for (let index = 0; index < 8; index += 1) points.push([14 + random() * 64, 16 + random() * 68]);
      const edges = [];
      for (let index = 0; index < points.length; index += 1) edges.push([index, (index + 1 + Math.floor(random() * 2)) % points.length]);
      const rows = ["manifest root", "artifact path", "entry file", "diagnostics", "route key"];
      return bar(artifact.route, ["Graph", "Inspect", "Open"]) +
        '<div class="main row"><div class="rail"><span class="rail-h">' + upper("signals") + '</span>' +
        rows.map((row, index) => '<span class="ri ' + (index === 0 ? "on" : "") + '"><i></i>' + esc(row) + '<b>' + (10 + Math.floor(random() * 90)) + '</b></span>').join("") +
        '</div><div class="canvas"><svg viewBox="0 0 100 90" preserveAspectRatio="xMidYMid meet">' +
        edges.map(([start, end]) => '<line x1="' + points[start][0].toFixed(1) + '" y1="' + points[start][1].toFixed(1) + '" x2="' + points[end][0].toFixed(1) + '" y2="' + points[end][1].toFixed(1) + '" stroke="var(--line-s)" stroke-width=".6"/>').join("") +
        points.map((point, index) => '<circle cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1) + '" r="' + (index % 3 === 0 ? 3.4 : 2.1) + '" fill="' + (index % 3 === 0 ? "var(--a)" : "var(--ink2)") + '" />').join("") +
        '</svg></div></div>';
    }

    if (artifact.render === "scatter") {
      const points = [];
      for (let index = 0; index < 54; index += 1) points.push([8 + random() * 88, 8 + random() * 78, random() * 2.6 + 1, random() < 0.2]);
      return bar(artifact.route, ["Field", "Density", "Path"]) +
        '<div class="main"><div class="kpis two">' +
        '<div class="kpi"><span class="lab">' + upper(artifact.tags[0] || "points") + '</span><span class="num">' + esc(artifact.metric) + '</span><span class="d pos">' + esc(artifact.delta) + '</span></div>' +
        '<div class="kpi"><span class="lab">' + upper("clusters") + '</span><span class="num">' + (4 + Math.floor(random() * 9)) + '</span><span class="d">' + esc(artifact.status) + '</span></div>' +
        '</div><div class="chart"><svg class="ar" viewBox="0 0 100 60" preserveAspectRatio="none">' +
        '<line x1="6" y1="2" x2="6" y2="54" stroke="var(--line-s)" stroke-width=".5"/>' +
        '<line x1="6" y1="54" x2="98" y2="54" stroke="var(--line-s)" stroke-width=".5"/>' +
        points.map((point) => '<circle cx="' + (8 + point[0] * 0.86).toFixed(1) + '" cy="' + (4 + point[1] * 0.62).toFixed(1) + '" r="' + point[2].toFixed(1) + '" fill="' + (point[3] ? "var(--a)" : "var(--ink2)") + '" opacity="' + (point[3] ? 0.95 : 0.5).toFixed(2) + '"/>').join("") +
        '</svg></div></div>';
    }

    if (artifact.render === "list") {
      const names = ["index.html", "app.css", "manifest", "entry file", "assets", "commands", "diagnostics", "tags"];
      const states = artifact.status === "ok" ? ["ok", "ok", "ok", "warn", "ok", "ok"] : ["warn", "ok", "draft", "warn", "ok", "draft"];
      return bar(artifact.route, ["Library", "Files", "Recent"]) +
        '<div class="main row"><div class="rail thin"><span class="rail-h">' + upper("groups") + '</span>' +
        ["all", "source", "assets", "status"].map((item, index) => '<span class="ri ' + (index === 0 ? "on" : "") + '">' + esc(item) + '<b>' + (3 + Math.floor(random() * 30)) + '</b></span>').join("") +
        '</div><div class="rows"><div class="rows-h"><span>' + upper(artifact.metric + " " + artifact.delta) + '</span><span>indexed</span></div>' +
        names.slice(0, 6).map((name, index) => '<div class="lr"><i class="av"></i><span class="nm">' + esc(name) + '</span><span class="pill ' + states[index] + '">' + states[index] + '</span><span class="when">' + (1 + Math.floor(random() * 9)) + 'd</span></div>').join("") +
        '</div></div>';
    }

    if (artifact.render === "map") {
      const steps = ["Register", "Scan", "Resolve", "Serve", "Open"];
      return bar(artifact.route, ["Flow", "Steps", "Preview"]) +
        '<div class="main mapwrap"><div class="flow"><div class="flow-line"></div>' +
        steps.map((step, index) => '<div class="node ' + (index === 0 ? "on" : index === 1 ? "next" : "") + '"><span class="dot">' + (index + 1) + '</span><span class="lbl">' + esc(step) + '</span></div>').join("") +
        '</div><div class="cap"><b>' + esc(artifact.metric) + ' ' + esc(artifact.delta) + '</b> / ' + esc(artifact.tags.join(" / ") || artifact.path) + '</div></div>';
    }

    return bar(artifact.route, ["Read", "Outline", "Raw"]) +
      '<div class="main doc"><div class="kick">' + upper(artifact.tags[0] || "artifact") + ' / ' + esc(artifact.metric) + ' ' + esc(artifact.delta) + '</div>' +
      '<div class="h1">' + esc(artifact.title) + '</div>' +
      '<div class="ln" style="width:96%"></div><div class="ln" style="width:88%"></div><div class="ln" style="width:92%"></div>' +
      '<div class="quote">' + esc(artifact.path || artifact.route) + '</div>' +
      '<div class="ln" style="width:90%"></div><div class="ln" style="width:70%"></div>' +
      '<div class="by">- ' + esc(artifact.project) + ' / ' + esc(artifact.status) + '</div></div>';
  }

  function miniDoc(artifact, palette) {
    const css = `
      *{margin:0;box-sizing:border-box}
      html,body{width:${DW}px;height:${DH}px;overflow:hidden}
      :root{--a:${palette.a};--ink:${palette.ink};--ink2:${palette.ink2};--bg:${palette.bg};--line:${palette.line};
            --pos:${palette.pos};--neg:${palette.neg};--bd:${palette.bd};--dp:${palette.dp};--mn:${palette.mn};
            --panel:var(--bg);--canvas:color-mix(in oklab,var(--bg) 90%,var(--ink));
            --line-s:color-mix(in oklab,var(--ink) 26%,transparent)}
      body{font-family:var(--bd);color:var(--ink);background:var(--canvas)}
      .win{height:100%;display:flex;flex-direction:column}
      .bar{height:36px;flex:none;display:flex;align-items:center;gap:11px;padding:0 16px;border-bottom:1px solid var(--line);background:var(--panel)}
      .dots{display:flex;gap:7px}.dots i{width:9px;height:9px;border-radius:50%;background:var(--line-s)}.dots i:first-child{background:var(--a)}
      .bar .ti{font:600 13px var(--mn);color:var(--ink2);letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
      .bar .sp{margin-left:auto}.tabs{display:flex;gap:16px}.tabs span{font:12px var(--mn);color:var(--ink2)}.tabs span.on{color:var(--ink)}
      .main{flex:1;min-height:0;padding:16px;display:flex;flex-direction:column;gap:14px}.main.row{flex-direction:row;gap:14px}
      .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;flex:none}.kpis.two{grid-template-columns:repeat(2,1fr)}
      .kpi{border:1px solid var(--line);border-radius:9px;padding:11px 13px;background:var(--panel);display:flex;flex-direction:column;gap:5px;min-width:0}
      .kpi .lab{font:11px/1 var(--mn);color:var(--ink2);letter-spacing:.14em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .kpi .num{font:700 27px/1 var(--dp);color:var(--ink);letter-spacing:0}.kpi .d{font:600 12px var(--mn);color:var(--ink2);display:flex;align-items:center;gap:7px}
      .kpi .d.pos{color:var(--pos)}.kpi .d.neg{color:var(--neg)}.spk{width:46px;height:16px;margin-left:auto;opacity:.85}
      .chart{flex:1;min-height:0;border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:13px 14px;display:flex;flex-direction:column;gap:10px}
      .chart-h{display:flex;justify-content:space-between;align-items:baseline}.chart-h b{font:600 11px var(--mn);letter-spacing:.14em;color:var(--ink)}.chart-h span{font:11px var(--mn);color:var(--ink2)}
      .ar{flex:1;width:100%;height:100%}.rail{width:172px;flex:none;border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:12px;display:flex;flex-direction:column;gap:3px}.rail.thin{width:150px}
      .rail-h{font:11px var(--mn);letter-spacing:.14em;color:var(--ink2);margin-bottom:6px}.ri{display:flex;align-items:center;gap:8px;font:12.5px var(--mn);color:var(--ink2);padding:7px 8px;border-radius:6px}
      .ri.on{color:var(--ink);background:color-mix(in oklab,var(--a) 16%,transparent)}.ri i{width:7px;height:7px;border-radius:2px;background:var(--a);flex:none}.ri b{margin-left:auto;font-weight:600;opacity:.7}
      .canvas{flex:1;min-width:0;border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:8px}.canvas svg{width:100%;height:100%}
      .rows{flex:1;min-width:0;border:1px solid var(--line);border-radius:9px;background:var(--panel);overflow:hidden;display:flex;flex-direction:column}.rows-h{display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--line);font:10.5px var(--mn);letter-spacing:.12em;color:var(--ink2)}
      .lr{display:flex;align-items:center;gap:11px;padding:10px 14px;border-bottom:1px solid color-mix(in oklab,var(--line) 60%,transparent)}.lr .av{width:14px;height:14px;border-radius:4px;background:color-mix(in oklab,var(--a) 55%,transparent);flex:none}.lr .nm{font:12.5px var(--mn);color:var(--ink)}
      .lr .pill{margin-left:auto;font:10px var(--mn);padding:2px 8px;border-radius:100px;border:1px solid var(--line);color:var(--ink2)}.lr .pill.ok{color:var(--pos);border-color:color-mix(in oklab,var(--pos) 45%,transparent)}.lr .pill.warn{color:var(--neg);border-color:color-mix(in oklab,var(--neg) 45%,transparent)}
      .lr .when{font:11px var(--mn);color:var(--ink2);width:26px;text-align:right}.mapwrap{justify-content:center;gap:22px}.flow{position:relative;display:flex;justify-content:space-between;align-items:flex-start;padding:0 8px}
      .flow-line{position:absolute;top:17px;left:34px;right:34px;height:2px;background:var(--line)}.node{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;z-index:1;width:34px}
      .node .dot{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:600 14px var(--mn);background:var(--canvas);border:2px solid var(--line);color:var(--ink2)}.node .lbl{font:11px var(--mn);color:var(--ink2);white-space:nowrap}
      .node.on .dot{background:var(--a);border-color:var(--a);color:var(--bg)}.node.on .lbl{color:var(--ink)}.node.next .dot{border-color:var(--a);color:var(--ink)}
      .cap{text-align:center;font:12px var(--mn);color:var(--ink2)}.cap b{color:var(--ink)}.doc{gap:9px;padding:18px 22px}.doc .kick{font:10.5px var(--mn);letter-spacing:.18em;color:var(--a)}
      .doc .h1{font:600 26px/1.12 var(--dp);color:var(--ink);letter-spacing:0;margin-bottom:4px;max-width:90%}.doc .ln{height:6px;border-radius:3px;background:color-mix(in oklab,var(--ink) 16%,transparent)}
      .doc .quote{margin:8px 0;padding:6px 0 6px 14px;border-left:3px solid var(--a);font:italic 600 15px/1.3 var(--dp);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.doc .by{margin-top:6px;font:11px var(--mn);color:var(--ink2)}
    `;
    return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body><div class="win">' + bodyFor(artifact) + '</div></body></html>';
  }

  function paletteOf(card) {
    const computed = getComputedStyle(card);
    const value = (name) => computed.getPropertyValue(name).trim();
    return {
      a: value("--thumb-stroke") || value("--accent"),
      ink: value("--fg-strong"),
      ink2: value("--muted"),
      bg: computed.backgroundColor || value("--surface"),
      line: value("--border-strong"),
      pos: value("--ok"),
      neg: value("--bad"),
      bd: value("--font-body"),
      dp: value("--font-display"),
      mn: value("--font-mono")
    };
  }

  function scaleThumb(thumb) {
    const frame = thumb.querySelector("iframe");
    if (!frame) return;
    const width = thumb.clientWidth;
    if (!width) return;
    frame.style.transform = "scale(" + (width / DW) + ")";
  }

  function mountPreviews() {
    document.querySelectorAll(".artifact[data-preview-key]").forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      const artifact = previewByKey.get(card.dataset.previewKey || "");
      const thumb = card.querySelector(".thumb");
      if (!artifact || !(thumb instanceof HTMLElement)) return;
      let frame = thumb.querySelector("iframe");
      if (!frame) {
        frame = document.createElement("iframe");
        frame.setAttribute("scrolling", "no");
        frame.setAttribute("aria-hidden", "true");
        frame.setAttribute("sandbox", "");
        frame.tabIndex = -1;
        frame.loading = "lazy";
        thumb.appendChild(frame);
        if (resizeObserver) resizeObserver.observe(thumb);
      }
      frame.srcdoc = miniDoc(artifact, paletteOf(card));
      scaleThumb(thumb);
    });
  }

  renderRecent();
  applyFilters();
  mountPreviews();
  let bootSkin = "workbench";
  try { bootSkin = localStorage.getItem(skinKey) || "workbench"; } catch {}
  setSkin(bootSkin);
})();
