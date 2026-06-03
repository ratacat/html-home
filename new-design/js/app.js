/* ============================================================================
   html-home · app.js
   ----------------------------------------------------------------------------
   Behaviour only. Renders cards from window.ARTIFACTS, mounts a LIVE mini-render
   of each artifact (a real, self-contained HTML dashboard scaled down inside an
   iframe — not an SVG doodle), runs search / status / repo filters, grid↔list
   view (remembered PER SKIN), and the skin switch.

   The previews are real rendered HTML, themed from the card's own skin tokens.
   They show SAMPLE dashboards — illustrative, not live captures of real files.
   ============================================================================ */
(function () {
  const ARTIFACTS = window.ARTIFACTS || [];
  const DW = 640, DH = 360;                 // logical design size of every preview

  /* deterministic tiny PRNG so every preview is stable per title ---------- */
  function rng(seed){ let s = seed % 2147483647; if (s<=0) s+=2147483646; return ()=> (s = s*16807 % 2147483647) / 2147483647; }
  function seedOf(str){ let h=0; for(const c of str) h=(h*31 + c.charCodeAt(0))|0; return Math.abs(h)||7; }
  const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  /* ----------------------------------------------------------------------- *
     LIVE PREVIEW — a real HTML mini-app per artifact kind
   * ----------------------------------------------------------------------- */
  function series(r,n){ let v=46; const a=[]; for(let i=0;i<n;i++){ v=Math.max(8,Math.min(92,v+(r()-.46)*30)); a.push(v);} return a; }
  function areaPath(a){
    const n=a.length, X=i=>(i/(n-1)*100).toFixed(2), Y=v=>(38-(v/100*34)).toFixed(2);
    let line='M '+X(0)+' '+Y(a[0]); for(let i=1;i<n;i++) line+=' L '+X(i)+' '+Y(a[i]);
    return { line, area: line+' L 100 38 L 0 38 Z' };
  }
  function sparkSVG(r){
    const a=series(r,12), {line}=areaPath(a);
    return `<svg class="spk" viewBox="0 0 100 38" preserveAspectRatio="none"><path d="${line}" fill="none" stroke="var(--a)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function bar(title, tabs){
    return `<div class="bar"><span class="dots"><i></i><i></i><i></i></span>`+
      `<span class="ti">${esc(title)}</span><span class="sp"></span>`+
      `<span class="tabs">${tabs.map((t,i)=>`<span class="${i===0?'on':''}">${esc(t)}</span>`).join('')}</span></div>`;
  }

  function bodyFor(a){
    const r = rng(seedOf(a.title));
    const up = s => esc(String(s)).toUpperCase();

    if (a.render==='dashboard'){
      const {line,area}=areaPath(series(r,16));
      const t2=['win rate','exposure','latency','coverage'][Math.floor(r()*4)];
      const t3=['p95','spread','signals','uptime'][Math.floor(r()*4)];
      const n2=(20+Math.floor(r()*70)), n3=(1+Math.floor(r()*9))+'.'+Math.floor(r()*9);
      const dPos = !String(a.delta).startsWith('−') && !String(a.delta).startsWith('-');
      const kpi=(lab,num,d,cls)=>`<div class="kpi"><span class="lab">${up(lab)}</span><span class="num">${esc(num)}</span><span class="d ${cls}">${esc(d)}${sparkSVG(r)}</span></div>`;
      return bar(a.repo,['Overview','Series','Alerts'])+
        `<div class="main">
           <div class="kpis">
             ${kpi(a.tags[0]||'metric', a.metric, a.delta, dPos?'pos':'neg')}
             ${kpi(t2, n2+'%', (r()>.5?'+':'−')+(1+Math.floor(r()*8))+'%', r()>.5?'pos':'neg')}
             ${kpi(t3, n3, (r()>.5?'+':'−')+(1+Math.floor(r()*5))+'%', r()>.5?'pos':'neg')}
           </div>
           <div class="chart">
             <div class="chart-h"><b>${up('throughput')}</b><span>last 24h</span></div>
             <svg class="ar" viewBox="0 0 100 38" preserveAspectRatio="none">
               <path d="${area}" fill="var(--a)" opacity=".13"/>
               <path d="${line}" fill="none" stroke="var(--a)" stroke-width="2" vector-effect="non-scaling-stroke"/>
             </svg>
           </div>
         </div>`;
    }

    if (a.render==='graph'){
      const n=8, P=[]; for(let i=0;i<n;i++) P.push([14+r()*64, 16+r()*68]);
      const edges=[]; for(let i=0;i<n;i++){ const j=(i+1+Math.floor(r()*2))%n; edges.push([i,j]); }
      const rows=['cluster · core','adjacency','orphans','merges','sources'];
      return bar(a.repo,['Graph','Clusters','Inspect'])+
        `<div class="main row">
           <div class="rail">
             <span class="rail-h">${up('clusters')}</span>
             ${rows.map((t,i)=>`<span class="ri ${i===0?'on':''}"><i></i>${esc(t)}<b>${10+Math.floor(r()*90)}</b></span>`).join('')}
           </div>
           <div class="canvas">
             <svg viewBox="0 0 100 90" preserveAspectRatio="xMidYMid meet">
               ${edges.map(([i,j])=>`<line x1="${P[i][0].toFixed(1)}" y1="${P[i][1].toFixed(1)}" x2="${P[j][0].toFixed(1)}" y2="${P[j][1].toFixed(1)}" stroke="var(--line-s)" stroke-width=".6"/>`).join('')}
               ${P.map((p,i)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i%3===0?3.4:2.1}" fill="${i%3===0?'var(--a)':'var(--ink2)'}" />`).join('')}
             </svg>
           </div>
         </div>`;
    }

    if (a.render==='scatter'){
      const pts=[]; for(let i=0;i<54;i++) pts.push([8+r()*88, 8+r()*78, r()*2.6+1, r()<.2]);
      return bar(a.repo,['Field','Density','Embed'])+
        `<div class="main">
           <div class="kpis two">
             <div class="kpi"><span class="lab">${up(a.tags[0]||'points')}</span><span class="num">${esc(a.metric)}</span><span class="d pos">${esc(a.delta)}</span></div>
             <div class="kpi"><span class="lab">${up('clusters')}</span><span class="num">${4+Math.floor(r()*9)}</span><span class="d">stable</span></div>
           </div>
           <div class="chart">
             <svg class="ar" viewBox="0 0 100 60" preserveAspectRatio="none">
               <line x1="6" y1="2" x2="6" y2="54" stroke="var(--line-s)" stroke-width=".5"/>
               <line x1="6" y1="54" x2="98" y2="54" stroke="var(--line-s)" stroke-width=".5"/>
               ${pts.map(p=>`<circle cx="${(8+p[0]*.86).toFixed(1)}" cy="${(4+p[1]*.62).toFixed(1)}" r="${p[2].toFixed(1)}" fill="${p[3]?'var(--a)':'var(--ink2)'}" opacity="${(p[3]?.95:.5).toFixed(2)}"/>`).join('')}
             </svg>
           </div>
         </div>`;
    }

    if (a.render==='list'){
      const names=['header.html','hero-block','pricing-grid','footer-cta','nav-rail','empty-state','toast','data-table'];
      const stat=['ok','ok','draft','ok','warn','ok'];
      return bar(a.repo,['Library','Recent','Used'])+
        `<div class="main row">
           <div class="rail thin">
             <span class="rail-h">${up('groups')}</span>
             ${['all','layout','inputs','feedback'].map((t,i)=>`<span class="ri ${i===0?'on':''}">${esc(t)}<b>${3+Math.floor(r()*30)}</b></span>`).join('')}
           </div>
           <div class="rows">
             <div class="rows-h"><span>${up(a.metric+' '+(a.delta||'items'))}</span><span>updated</span></div>
             ${names.slice(0,6).map((nm,i)=>`<div class="lr"><i class="av"></i><span class="nm">${esc(nm)}</span><span class="pill ${stat[i]}">${stat[i]}</span><span class="when">${1+Math.floor(r()*9)}d</span></div>`).join('')}
           </div>
         </div>`;
    }

    if (a.render==='map'){
      const steps=['Open','Connect','Configure','Preview','Ship'];
      return bar(a.repo,['Flow','Steps','Preview'])+
        `<div class="main mapwrap">
           <div class="flow">
             <div class="flow-line"></div>
             ${steps.map((s,i)=>`<div class="node ${i===0?'on':i===1?'next':''}"><span class="dot">${i+1}</span><span class="lbl">${esc(s)}</span></div>`).join('')}
           </div>
           <div class="cap"><b>${esc(a.metric)} ${esc(a.delta)}</b> · ${esc(a.tags.join(' · '))}</div>
         </div>`;
    }

    /* doc */
    return bar(a.repo,['Read','Outline','Raw'])+
      `<div class="main doc">
         <div class="kick">${up(a.tags[0]||'report')} · ${esc(a.metric)} ${esc(a.delta)}</div>
         <div class="h1">${esc(a.title)}</div>
         <div class="ln" style="width:96%"></div><div class="ln" style="width:88%"></div><div class="ln" style="width:92%"></div>
         <div class="quote">${esc(a.tags.length?('On '+a.tags[0]+', the signal held through close.'):'The signal held through close.')}</div>
         <div class="ln" style="width:90%"></div><div class="ln" style="width:70%"></div>
         <div class="by">— ${esc(a.repo)} · ${esc(a.branch)}</div>
       </div>`;
  }

  /* build the full srcdoc for one artifact, themed from a card's palette */
  function miniDoc(a, p){
    const css = `
      *{margin:0;box-sizing:border-box}
      html,body{width:${DW}px;height:${DH}px;overflow:hidden}
      :root{--a:${p.a};--ink:${p.ink};--ink2:${p.ink2};--bg:${p.bg};--line:${p.line};
            --pos:${p.pos};--neg:${p.neg};--bd:${p.bd};--dp:${p.dp};--mn:${p.mn};
            --panel:var(--bg);--canvas:color-mix(in oklab,var(--bg) 90%,var(--ink));
            --line-s:color-mix(in oklab,var(--ink) 26%,transparent)}
      body{font-family:var(--bd);color:var(--ink);background:var(--canvas)}
      .win{height:100%;display:flex;flex-direction:column}
      .bar{height:36px;flex:none;display:flex;align-items:center;gap:11px;padding:0 16px;border-bottom:1px solid var(--line);background:var(--panel)}
      .dots{display:flex;gap:7px}.dots i{width:9px;height:9px;border-radius:50%;background:var(--line-s)}.dots i:first-child{background:var(--a)}
      .bar .ti{font:600 13px var(--mn);color:var(--ink2);letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
      .bar .sp{margin-left:auto}
      .tabs{display:flex;gap:16px}.tabs span{font:12px var(--mn);color:var(--ink2)}.tabs span.on{color:var(--ink)}
      .main{flex:1;min-height:0;padding:16px;display:flex;flex-direction:column;gap:14px}
      .main.row{flex-direction:row;gap:14px}
      .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;flex:none}
      .kpis.two{grid-template-columns:repeat(2,1fr)}
      .kpi{border:1px solid var(--line);border-radius:9px;padding:11px 13px;background:var(--panel);display:flex;flex-direction:column;gap:5px;min-width:0}
      .kpi .lab{font:11px/1 var(--mn);color:var(--ink2);letter-spacing:.14em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .kpi .num{font:700 27px/1 var(--dp);color:var(--ink);letter-spacing:-.01em}
      .kpi .d{font:600 12px var(--mn);color:var(--ink2);display:flex;align-items:center;gap:7px}
      .kpi .d.pos{color:var(--pos)}.kpi .d.neg{color:var(--neg)}
      .spk{width:46px;height:16px;margin-left:auto;opacity:.85}
      .chart{flex:1;min-height:0;border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:13px 14px;display:flex;flex-direction:column;gap:10px}
      .chart-h{display:flex;justify-content:space-between;align-items:baseline}
      .chart-h b{font:600 11px var(--mn);letter-spacing:.14em;color:var(--ink)}
      .chart-h span{font:11px var(--mn);color:var(--ink2)}
      .ar{flex:1;width:100%;height:100%}
      .rail{width:172px;flex:none;border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:12px;display:flex;flex-direction:column;gap:3px}
      .rail.thin{width:150px}
      .rail-h{font:11px var(--mn);letter-spacing:.14em;color:var(--ink2);margin-bottom:6px}
      .ri{display:flex;align-items:center;gap:8px;font:12.5px var(--mn);color:var(--ink2);padding:7px 8px;border-radius:6px}
      .ri.on{color:var(--ink);background:color-mix(in oklab,var(--a) 16%,transparent)}
      .ri i{width:7px;height:7px;border-radius:2px;background:var(--a);flex:none}
      .ri b{margin-left:auto;font-weight:600;opacity:.7}
      .canvas{flex:1;min-width:0;border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:8px}
      .canvas svg{width:100%;height:100%}
      .rows{flex:1;min-width:0;border:1px solid var(--line);border-radius:9px;background:var(--panel);overflow:hidden;display:flex;flex-direction:column}
      .rows-h{display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--line);font:10.5px var(--mn);letter-spacing:.12em;color:var(--ink2)}
      .lr{display:flex;align-items:center;gap:11px;padding:10px 14px;border-bottom:1px solid color-mix(in oklab,var(--line) 60%,transparent)}
      .lr .av{width:14px;height:14px;border-radius:4px;background:color-mix(in oklab,var(--a) 55%,transparent);flex:none}
      .lr .nm{font:12.5px var(--mn);color:var(--ink)}
      .lr .pill{margin-left:auto;font:10px var(--mn);padding:2px 8px;border-radius:100px;border:1px solid var(--line);color:var(--ink2)}
      .lr .pill.ok{color:var(--pos);border-color:color-mix(in oklab,var(--pos) 45%,transparent)}
      .lr .pill.warn{color:var(--neg);border-color:color-mix(in oklab,var(--neg) 45%,transparent)}
      .lr .when{font:11px var(--mn);color:var(--ink2);width:26px;text-align:right}
      .mapwrap{justify-content:center;gap:22px}
      .flow{position:relative;display:flex;justify-content:space-between;align-items:flex-start;padding:0 8px}
      .flow-line{position:absolute;top:17px;left:34px;right:34px;height:2px;background:var(--line)}
      .node{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;z-index:1;width:34px}
      .node .dot{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:600 14px var(--mn);
                 background:var(--canvas);border:2px solid var(--line);color:var(--ink2)}
      .node .lbl{font:11px var(--mn);color:var(--ink2);white-space:nowrap}
      .node.on .dot{background:var(--a);border-color:var(--a);color:var(--bg)}
      .node.on .lbl{color:var(--ink)}
      .node.next .dot{border-color:var(--a);color:var(--ink)}
      .cap{text-align:center;font:12px var(--mn);color:var(--ink2)}.cap b{color:var(--ink)}
      .doc{gap:9px;padding:18px 22px}
      .doc .kick{font:10.5px var(--mn);letter-spacing:.18em;color:var(--a)}
      .doc .h1{font:600 26px/1.12 var(--dp);color:var(--ink);letter-spacing:-.01em;margin-bottom:4px;max-width:90%}
      .doc .ln{height:6px;border-radius:3px;background:color-mix(in oklab,var(--ink) 16%,transparent)}
      .doc .quote{margin:8px 0;padding:6px 0 6px 14px;border-left:3px solid var(--a);font:italic 600 15px/1.3 var(--dp);color:var(--ink)}
      .doc .by{margin-top:6px;font:11px var(--mn);color:var(--ink2)}
    `;
    return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="win">${bodyFor(a)}</div></body></html>`;
  }

  /* read a card's resolved skin palette so the preview matches the skin/card */
  function paletteOf(card){
    const cs=getComputedStyle(card), v=n=>cs.getPropertyValue(n).trim();
    return {
      a:   v('--thumb-stroke')||v('--accent'),
      ink: v('--fg-strong'), ink2: v('--muted'),
      bg:  cs.backgroundColor || v('--surface'),
      line:v('--border-strong'),
      pos: v('--ok'), neg: v('--bad'),
      bd:  v('--font-body'), dp: v('--font-display'), mn: v('--font-mono')
    };
  }

  /* cards that go dark "slate" in the workbench skin (reference look) ------ */
  const SLATE = new Set(["Deep Dive: incident 2415","Web of Ideas","Alpha Signals","Dark Pool","Ridgeline","Coverage Report"]);

  /* -------------------------------- render -------------------------------- */
  const panelEl = document.getElementById('panel');
  const REPOS = [...new Set(ARTIFACTS.map(a=>a.repo))];
  let activeStatus='all', activeRepo='all', query='', currentSkin='workbench';

  function cardHTML(a){
    const broken = a.status==='broken';
    const url = `http://localhost:4317/r/${a.repo}/${a.path.replace(/\.html?$/,'').split('/').pop()}`;
    const slate = SLATE.has(a.title) ? 'slate' : '';
    return `<article class="artifact ${broken?'broken-card':''} ${slate}"
        data-status="${a.status}" data-repo="${a.repo}"
        data-hay="${(a.title+' '+a.repo+' '+a.tags.join(' ')+' '+a.path+' '+a.kind).toLowerCase()}">
      <div class="thumb"><span class="kind">${a.kind}</span></div>
      <div class="body">
        <h3>${a.title}</h3>
        <div class="repo"><span class="glyph">◈</span> ${a.repo}</div>
        <div class="path">
          <code title="${a.path}">${a.path}</code>
          <button data-copy="${url}" title="Copy stable URL">copy url</button>
        </div>
        <div class="tags">${a.tags.map(t=>`<span class="tag">#${t}</span>`).join('')}</div>
      </div>
      <div class="foot">
        <span class="status ${a.status}"><span class="led"></span>${a.status}</span>
        <span class="branch">⌥ ${a.branch}</span>
        <span class="spacer"></span>
        <span>${a.updated}</span>
        <a class="open" href="${broken?'#':url}" ${broken?'aria-disabled="true"':'target="_blank" rel="noopener"'}>open →</a>
      </div>
    </article>`;
  }

  /* live-preview mounting + scaling ---------------------------------------- */
  const ro = new ResizeObserver(entries=>{ for(const e of entries) scaleThumb(e.target); });
  function scaleThumb(thumb){
    const f=thumb.querySelector('iframe'); if(!f) return;
    const w=thumb.clientWidth; if(!w) return;
    f.style.transform='scale('+(w/DW)+')';
  }
  function mountPreviews(){
    const cards=panelEl.querySelectorAll('.artifact');
    cards.forEach((card,i)=>{
      const a=ARTIFACTS[i]; if(!a) return;
      const thumb=card.querySelector('.thumb');
      let f=thumb.querySelector('iframe');
      if(!f){
        f=document.createElement('iframe');
        f.setAttribute('scrolling','no'); f.setAttribute('aria-hidden','true'); f.tabIndex=-1;
        f.loading='lazy';
        thumb.appendChild(f);
        ro.observe(thumb);
      }
      f.srcdoc = miniDoc(a, paletteOf(card));
      scaleThumb(thumb);
    });
  }

  function render(){ panelEl.innerHTML = ARTIFACTS.map(cardHTML).join(''); mountPreviews(); applyFilters(); }

  function applyFilters(){
    let shown=0;
    panelEl.querySelectorAll('.artifact').forEach(el=>{
      const okS = activeStatus==='all' || el.dataset.status===activeStatus;
      const okR = activeRepo==='all'   || el.dataset.repo===activeRepo;
      const okQ = !query || el.dataset.hay.includes(query);
      const vis = okS && okR && okQ;
      el.classList.toggle('is-hidden', !vis);
      if (vis) shown++;
    });
    let empty = panelEl.querySelector('.empty');
    if (!shown){
      if(!empty){ empty=document.createElement('div'); empty.className='empty'; panelEl.appendChild(empty); }
      empty.textContent = 'No artifacts match — broaden the search or clear filters.';
    } else if (empty){ empty.remove(); }
  }

  /* counts + diagnostics --------------------------------------------------- */
  function counts(){
    const c={current:0,stale:0,broken:0}; ARTIFACTS.forEach(a=>c[a.status]++);
    document.getElementById('nCurrent').textContent=' '+c.current;
    document.getElementById('nStale').textContent  =' '+c.stale;
    document.getElementById('nBroken').textContent =' '+c.broken;
    document.getElementById('dTotal').textContent  =ARTIFACTS.length;
    document.getElementById('dRepos').textContent  =REPOS.length;
    document.getElementById('dStale').textContent  =c.stale;
    document.getElementById('dBroken').textContent =c.broken;
  }

  /* repo chips ------------------------------------------------------------- */
  function buildRepoChips(){
    const wrap=document.getElementById('repoChips');
    wrap.innerHTML = `<button class="chip" data-repo="all" aria-pressed="true">All repos</button>` +
      REPOS.map(rp=>`<button class="chip" data-repo="${rp}" aria-pressed="false">${rp}<span class="n">${ARTIFACTS.filter(a=>a.repo===rp).length}</span></button>`).join('');
    wrap.addEventListener('click', e=>{
      const b=e.target.closest('.chip'); if(!b) return;
      activeRepo=b.dataset.repo;
      wrap.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed', c===b));
      applyFilters();
    });
  }

  /* status chips ----------------------------------------------------------- */
  document.getElementById('statusChips').addEventListener('click', e=>{
    const b=e.target.closest('.chip'); if(!b) return;
    activeStatus=b.dataset.status;
    document.querySelectorAll('#statusChips .chip').forEach(c=>c.setAttribute('aria-pressed', c===b));
    applyFilters();
  });

  /* search ----------------------------------------------------------------- */
  document.getElementById('q').addEventListener('input', e=>{ query=e.target.value.trim().toLowerCase(); applyFilters(); });

  /* copy url --------------------------------------------------------------- */
  panelEl.addEventListener('click', async e=>{
    const b=e.target.closest('[data-copy]'); if(!b) return;
    try{ await navigator.clipboard.writeText(b.dataset.copy); }catch(_){}
    const prev=b.textContent; b.textContent='copied ✓'; b.classList.add('copied');
    setTimeout(()=>{ b.textContent=prev; b.classList.remove('copied'); },1300);
  });

  /* grid ↔ list view — remembered PER SKIN -------------------------------- */
  const viewBtns=document.querySelectorAll('.view button');
  const viewKey = skin => 'htmlhome.view.'+skin;
  function viewForSkin(skin){ try{ return localStorage.getItem(viewKey(skin))||'grid'; }catch(_){ return 'grid'; } }
  function setView(view, persist=true){
    panelEl.classList.toggle('is-list', view==='list');
    viewBtns.forEach(b=>b.setAttribute('aria-pressed', b.dataset.view===view));
    if(persist){ try{ localStorage.setItem(viewKey(currentSkin), view); }catch(_){} }
  }
  viewBtns.forEach(b=> b.addEventListener('click', ()=> setView(b.dataset.view)));

  /* skin switching — persisted (also restores that skin's saved view) ----- */
  const skinBtns=document.querySelectorAll('.skins button');
  function setSkin(skin){
    currentSkin=skin;
    document.documentElement.setAttribute('data-skin', skin);
    skinBtns.forEach(b=>b.setAttribute('aria-pressed', b.dataset.skin===skin));
    try{ localStorage.setItem('htmlhome.skin', skin); }catch(_){}
    setView(viewForSkin(skin), false);                 // per-skin view memory
    requestAnimationFrame(mountPreviews);              // re-theme previews after token swap
  }
  skinBtns.forEach(b=> b.addEventListener('click', ()=> setSkin(b.dataset.skin)));

  /* boot ------------------------------------------------------------------- */
  buildRepoChips(); counts(); render();
  let boot='workbench';
  try{ boot=localStorage.getItem('htmlhome.skin')||'workbench'; }catch(_){}
  setSkin(boot);
})();
