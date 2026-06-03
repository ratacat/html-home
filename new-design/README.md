# html-home — skinnable workbench

A start page for HTML artifacts (projects · paths · status · tags · diagnostics · copy-URL),
built as **one structural layout driven entirely by design tokens**. Swapping a skin swaps the
token contract — no markup, no structure changes.

## File map

```
index.html        entry — markup + <link>/<script> wiring only
css/tokens.css    the CONTRACT: every token a skin must fill (the :root defaults)
css/skins.css     the skins — each ONLY overrides tokens + flips flourish flags
css/app.css       skin-agnostic structure: layout, cards, grid/list views, flourishes
js/data.js        sample catalog (window.ARTIFACTS) — illustrative data, not real captures
js/app.js         render, filters, live mini-previews, per-skin view + skin toggles
mpxtqnfy-bench.png workbench table-surface image (referenced relatively from app.css)
```

Paths are **relative**, so the build runs under any subpath (`/new-design/`, `/public/`, etc.).
Keep `mpxtqnfy-bench.png` as a sibling of wherever the CSS resolves, or update the URL in
`css/app.css`.

## The token contract

`app.css` never hard-codes a colour — it only reads these custom properties. `tokens.css`
declares them with defaults; each skin in `skins.css` overrides what it needs.

| Group | Tokens |
|---|---|
| **Surfaces** | `--bg` `--bg-2` `--surface` `--surface-2` `--thumb-bg` `--paper` |
| **Ink** | `--fg` `--fg-strong` `--muted` `--border` `--border-strong` |
| **Accents** | `--accent` `--accent-2` `--accent-3` (the edge-light cycles these) |
| **Status** | `--ok` `--warn` `--bad` |
| **Shape** | `--radius` `--radius-sm` `--card-shadow` |
| **Type** | `--font-display` `--font-body` `--font-mono` |
| **Flourishes** | `--edge-on` `--edge-blur` · `--grid-on` `--grid-heavy` `--grid-fine` · `--reg-on` · `--bench-on` · `--thumb-stroke` · `--kicker-spacing` |

### Flourish flags (the per-skin on/off switches)

- `--edge-on` — `1` = animated neon edge-light ring (workbench), `0` = off
- `--edge-blur` — bloom radius of that ring
- `--grid-on` — blueprint grid overlay on/off (ozalid)
- `--grid-heavy` / `--grid-fine` — opacity of the 96px and 16px gridlines
- `--reg-on` — drafting registration marks / "stray" corner ticks (ozalid)
- `--bench-on` — reference-photo table surface on/off (workbench)
- `--thumb-stroke` — accent used inside the mini-preview renders
- `--kicker-spacing` — letter-spacing on eyebrow/kicker labels

## Adding a 4th skin

It's a copy-one-block job — no markup or JS touched.

1. In **`css/skins.css`**, copy any existing `html[data-skin="…"]` block and rename the
   selector, e.g. `html[data-skin="terminal"]`.
2. Override the tokens you want. You only need to set what differs from `tokens.css`;
   anything you omit falls back to the base contract.
3. Flip the flourish flags for the mood (e.g. a CRT terminal: `--edge-on: 0; --grid-on: 0;
   --bench-on: 0;` plus a phosphor-green accent).
4. Register the name in the skin switcher list in **`js/app.js`** (the `SKINS` array) so it
   appears in the top-right toggle.

That's it. The same HTML re-skins live.

## The three example skins

- **workbench** — dark wood table, aged parchment + slate cards, animated neon edge-light. Uses the bench photo and a fibrous paper grain so cards read as aged, not flat white.
- **ozalid** — blueprint/drafting: prussian ground, faint cyan hairline grid, registration marks, all-mono.
- **gallery** — cool museum white, hairline ink, single warm accent, letterpress calm (proves the tokens fully flip to light mode).

## Notes for integration

- **Previews are real rendered mini-apps** (live HTML in scaled iframes that read each card's
  resolved skin tokens), but the data is a **sample catalog** — not screenshots of real
  artifact files. To make them true captures, point the render engine at each artifact's own
  `index.html`; the engine in `js/app.js` is structured to swap to that.
- **View (grid/list) is remembered per skin** — keyed `htmlhome.view.<skin>` in localStorage;
  skin choice persists too.
