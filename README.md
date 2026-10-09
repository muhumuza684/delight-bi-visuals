# Delight Insights Visual Family

**DELIGHT INSIGHTS - DATA DRIVEN DECISIONS.** *A Bryt Ma Tech business intelligence unit.*

Ten Power BI custom visuals built from one shared core.

## Layout

| Folder | What it is | Edit it? |
|---|---|---|
| `shared/core` | Shared engine: data reader, landing page, info drawer, selection, tooltips, formatting model, brand | Yes |
| `shared/design-system` | One stylesheet for all visuals, no `!important` | Yes |
| `shared/tests` | Mock Power BI host + behaviour tests every visual must pass | Yes |
| `visuals/<slug>` | The only per-visual source: `spec.json`, `renderer.ts`, `fixture.json`, `logic.test.ts` | Yes |
| `tools` | `build-family.mjs` (generator) and `build-all.mjs` (build runner) | Rarely |
| `projects/<slug>` | **Generated** standalone projects, same layout as Data Lake Tables | No - regenerate |
| `dist-pbiviz` | Finished `.pbiviz` files | No |

## Everyday commands (run in this folder)

```
npm install              first time only
npm run build            generate + typecheck + test + package all ten
npm run build:one -- work-planner     one visual
npm test                 everything except packaging
```

## How to change things

- Change a field, setting or landing text: edit `visuals/<slug>/spec.json`.
- Change how a visual draws: edit `visuals/<slug>/renderer.ts`.
- Change look, branding or behaviour shared by all: edit `shared/`.
- Then `npm run build`. Never hand-edit `projects/`; it is overwritten.

Each folder in `projects/` also builds on its own (`npm install && npm run ci`), exactly like a standalone visual.

## Notes

- If the repo lives inside OneDrive, `node_modules` makes syncing slow. Pause OneDrive during `npm install`, or keep the repo outside OneDrive.
- After the first `npm install`, commit the generated `package-lock.json`.

## Versions

Every `npm run build` that packages bumps `.buildnumber`, so the visuals are `0.2.0.<build>`. Power BI treats each build as a new version and does not reuse a cached copy. The version is shown in the visual (landing footer, the "i" drawer, and the "i" button tooltip). Commit `.buildnumber`.
