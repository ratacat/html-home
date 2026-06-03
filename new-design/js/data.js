/* ============================================================================
   html-home · data.js
   ----------------------------------------------------------------------------
   A SAMPLE catalog — illustrative, NOT a live filesystem scan. Mirrors the real
   html-home shape: each artifact is owned by a repo, declared in that repo's
   .html-home.json, surfaced here with status / tags / source-path / url.

   `render`  picks the mini-dashboard preview layout (app.js → miniRender()).
   `metric`/`delta` are sample readouts shown inside that preview.
   ============================================================================ */
window.ARTIFACTS = [
  { title:"Newswire Observatory", repo:"newswire-observatory", kind:"prototype", render:"graph",
    status:"current", branch:"main", updated:"2h ago", path:"index.html",
    metric:"4.2k", delta:"+318", tags:["canvas","sense-making","wip"] },
  { title:"Deep Dive: incident 2415", repo:"newswire-observatory", kind:"explainer", render:"doc",
    status:"current", branch:"main", updated:"2h ago", path:"artifacts/deep-dive-2415.html",
    metric:"12", delta:"sections", tags:["report","postmortem"] },
  { title:"Web of Ideas", repo:"latent-field", kind:"diagram", render:"graph",
    status:"stale", branch:"embed-v2", updated:"6d ago", path:"artifacts/web-of-ideas.html",
    metric:"261", delta:"nodes", tags:["graph","concept-map"] },
  { title:"Latent — field of discourse", repo:"latent-field", kind:"prototype", render:"scatter",
    status:"current", branch:"embed-v2", updated:"1d ago", path:"index.html",
    metric:"18.4k", delta:"+1.2k", tags:["embeddings","umap","webgpu"] },
  { title:"Alpha Signals", repo:"pmw-temperature-markets", kind:"dashboard", render:"dashboard",
    status:"current", branch:"main", updated:"40m ago", path:"artifacts/alpha-signals.html",
    metric:"+6.8%", delta:"24h", tags:["markets","live"] },
  { title:"Temperature Markets — cockpit", repo:"pmw-temperature-markets", kind:"prototype", render:"dashboard",
    status:"current", branch:"main", updated:"40m ago", path:"index.html",
    metric:"73°F", delta:"NYC", tags:["pmw","trade","weather"] },
  { title:"Dark Pool", repo:"pmw-temperature-markets", kind:"dashboard", render:"scatter",
    status:"broken", branch:"liquidity", updated:"3w ago", path:"artifacts/dark-pool.html",
    metric:"—", delta:"offline", tags:["heatmap","liquidity"] },
  { title:"Ridgeline", repo:"newswire-observatory", kind:"report", render:"dashboard",
    status:"current", branch:"main", updated:"5h ago", path:"artifacts/ridgeline.html",
    metric:"38", delta:"series", tags:["density","distribution"] },
  { title:"The Journey", repo:"html-home", kind:"prototype", render:"map",
    status:"current", branch:"skins", updated:"just now", path:"examples/journey.html",
    metric:"5", delta:"steps", tags:["onboarding","flow"] },
  { title:"HTML Snippets", repo:"html-home", kind:"editor", render:"list",
    status:"current", branch:"skins", updated:"just now", path:"examples/snippets.html",
    metric:"47", delta:"blocks", tags:["components","gallery"] },
  { title:"Coverage Report", repo:"latent-field", kind:"report", render:"doc",
    status:"stale", branch:"main", updated:"9d ago", path:"dist/coverage/index.html",
    metric:"86%", delta:"lines", tags:["tests","ci"] },
  { title:"Config Editor", repo:"html-home", kind:"editor", render:"list",
    status:"current", branch:"skins", updated:"1h ago", path:"tools/config-editor.html",
    metric:"9", delta:"fields", tags:["tooling","one-off"] },
];
