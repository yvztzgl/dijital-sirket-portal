# Design import

Screen and shared-component templates under `src/app/screens/**.html` and `src/app/shared/*.html`
were generated from the Claude Design project (`.dc.html` canvases), then wired by hand to the
application store (`src/app/core/`). **Re-running the import overwrites those bindings**, so
`install.py` refuses to write into `src/app` unless you pass `--force`; generate into a scratch
folder instead and diff the markup you want to bring over.

1. Save the design files as raw HTML into a folder: `raw0.html` … `raw3.html`
   (Ekranlar 0–3) and `c_topbar.html`, `c_stepper.html`, `c_sidepanel.html`, `c_aicard.html`.
2. `python3 -I convert.py <design_dir> <out_dir> > registry.json`
3. `python3 -I install.py <out_dir> <scratch_app_dir> registry.json` (add `--force` to overwrite `src/app`)

`convert.py` maps DC syntax to Angular: `<sc-for>` → `@for`, `<sc-if>` → `@if`,
`<dc-import>` → shared components, `style="…{{ x }}…"` → `[attr.style]` template literals,
`onClick` / `onChange` → event bindings, design-file links → `routerLink`.
Screen data and logic live by hand in `src/app/screens/data/*.data.ts` and `src/app/shared/*.ts`.
