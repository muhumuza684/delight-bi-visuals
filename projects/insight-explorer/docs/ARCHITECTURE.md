# Architecture

- `src/spec.json` - single source of truth: roles, format objects, landing copy. `capabilities.json` is generated from it and a test enforces they match.
- `src/core/` - shared Delight Insights engine (copied from `shared/core`; do not edit here): base visual, data reader, landing page, drawer, selection, tooltips, formatting model, brand.
- `src/renderer.ts` - the only visual-specific code.
- `style/design-system/dbi.less` - shared styling (copied from `shared/design-system`). No `!important`.
- `tests/` - mock Power BI host, sample data, shared behaviour tests and visual-specific logic tests.
