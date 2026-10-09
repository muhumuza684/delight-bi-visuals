#!/usr/bin/env node
/* Delight Insights visual family generator.
 * Reads shared/ + visuals/<slug>/ and writes ten standalone Power BI projects into ./out/<slug>/.
 * Usage:  node tools/build-family.mjs [iconsDir]
 * Re-run any time shared/ or a spec changes; generated projects are disposable, shared/ and visuals/ are the source of truth. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildFile = path.join(root, ".buildnumber");
const build = String(process.env.DI_BUILD || (fs.existsSync(buildFile) ? fs.readFileSync(buildFile, "utf8").trim() : "0")).replace(/\D/g, "") || "0";
const iconsDir = process.argv[2] || path.join(root, "assets", "icons");
const outRoot = path.join(root, "projects");
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const W = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof c === "string" ? c : JSON.stringify(c, null, 2) + "\n"); };
const copyDir = (a, b, filter = () => true) => { fs.mkdirSync(b, { recursive: true }); for (const f of fs.readdirSync(a)) { const s = path.join(a, f), d = path.join(b, f); if (fs.statSync(s).isDirectory()) { copyDir(s, d, filter); } else if (filter(f)) { fs.copyFileSync(s, d); } } };

const RENDERER = { "universal-table": "UniversalTableRenderer", "executive-kpi": "ExecutiveKpiRenderer", "analytical-chart": "AnalyticalChartRenderer", "variance-bridge": "VarianceBridgeRenderer", "universal-filter": "UniversalFilterRenderer", "insight-explorer": "InsightExplorerRenderer", "flow-explorer": "FlowExplorerRenderer", "geo-explorer": "GeoExplorerRenderer", "work-planner": "WorkPlannerRenderer", "scenario-planner": "ScenarioPlannerRenderer" };

const COMMON = J(path.join(root, "shared", "core", "common.json"));
const TYPE = { bool: () => ({ bool: true }), numeric: () => ({ numeric: true }), text: () => ({ text: true }), color: () => ({ fill: { solid: { color: true } } }),
  enum: (p) => ({ enumeration: p.options.map((o) => (Array.isArray(o) ? { value: o[0], displayName: o[1] } : { value: o.value, displayName: o.displayName })) }) };
// keep in sync with shared/core/spec.ts buildCapabilities (a unit test in every project enforces it)
function capabilities(spec) {
  const objects = {};
  for (const o of COMMON.concat(spec.objects)) { const props = {}; for (const p of o.properties) { props[p.name] = { displayName: p.displayName, type: TYPE[p.type](p) }; } objects[o.name] = { displayName: o.displayName, properties: props }; }
  if (spec.slug === "universal-filter") { objects.general.properties.filter = { type: { filter: true } }; }
  const roles = spec.roles.map((r) => ({ name: r.name, displayName: r.displayName, kind: r.kind, description: r.help }));
  roles.push({ name: "tooltips", displayName: "Tooltips", kind: "GroupingOrMeasure", description: "Extra fields shown in the Power BI tooltip." });
  return { dataRoles: roles, dataViewMappings: [{ table: { rows: { select: roles.map((r) => ({ for: { in: r.name } })), dataReductionAlgorithm: { window: { count: 30000 } } } } }], objects,
    tooltips: { supportedTypes: { default: true, canvas: true }, roles: ["tooltips"] }, supportsLandingPage: true, supportsEmptyDataView: true, supportsMultiVisualSelection: true, suppressDefaultTitle: true, privileges: [{ name: "ExportContent", essential: false }] };
}

// regenerate in place but keep installed dependencies and build output
if (fs.existsSync(outRoot)) { for (const d of fs.readdirSync(outRoot)) { const dir = path.join(outRoot, d); for (const f of fs.readdirSync(dir)) { if (f !== "node_modules" && f !== "dist") { fs.rmSync(path.join(dir, f), { recursive: true, force: true }); } } } }
const slugs = fs.readdirSync(path.join(root, "visuals")).filter((f) => fs.existsSync(path.join(root, "visuals", f, "spec.json"))).sort();
for (const slug of slugs) {
  const vdir = path.join(root, "visuals", slug), out = path.join(outRoot, slug); const spec = J(path.join(vdir, "spec.json")); spec.version = spec.version.replace(/\.\d+$/, "." + build);
  copyDir(path.join(root, "shared", "core"), path.join(out, "src", "core"));
  copyDir(path.join(root, "shared", "design-system"), path.join(out, "style", "design-system"));
  W(path.join(out, "style", "visual.less"), `/* Generated. Edit shared/design-system, not this file. */\n@import "design-system/dbi.less";\n`);
  W(path.join(out, "src", "spec.json"), spec);
  for (const f of fs.readdirSync(vdir)) { if (f.endsWith(".ts") && !f.endsWith(".test.ts")) { fs.copyFileSync(path.join(vdir, f), path.join(out, "src", f)); } }
  if (slug === "geo-explorer") {
    // real country borders (world-atlas, Natural Earth) bundled as a string so the visual works offline
    const wa = ["countries-50m.json", "countries-110m.json"].map((n) => path.join(root, "node_modules", "world-atlas", n)).find((x) => fs.existsSync(x));
    if (!wa) { console.error("world-atlas is not installed. Run:  npm install   (in " + root + ")"); process.exit(2); }
    const min = JSON.stringify(JSON.parse(fs.readFileSync(wa, "utf8")));
    W(path.join(out, "src", "world.ts"), "/* Generated from world-atlas (" + path.basename(wa) + "). Do not edit. */\nexport const WORLD_JSON: string = " + JSON.stringify(min) + ";\n");
  }
  W(path.join(out, "src", "visual.ts"), `import powerbi from "powerbi-visuals-api";
import { BaseVisual } from "./core/baseVisual";
import { VisualSpec } from "./core/spec";
import { Sample } from "./core/sample";
import spec from "./spec.json";
import sample from "./sample.json";
import { ${RENDERER[slug]} } from "./renderer";
import "../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;

export class ${spec.name} extends BaseVisual {
    constructor(options: VisualConstructorOptions) {
        super(options, spec as unknown as VisualSpec, () => new ${RENDERER[slug]}(), sample as unknown as Sample);
    }
}
`);
  fs.copyFileSync(path.join(vdir, "fixture.json"), path.join(out, "src", "sample.json"));
  W(path.join(out, "capabilities.json"), capabilities(spec));
  W(path.join(out, "pbiviz.json"), { visual: { name: spec.name, displayName: spec.displayName, guid: spec.guid, visualClassName: spec.name, version: spec.version, description: spec.description, supportUrl: "https://github.com/", gitHubUrl: "https://github.com/" },
    apiVersion: "5.3.0", author: { name: "Delight Insights - Bryt Ma Tech UG", email: "muhumuzabright26@gmail.com" }, assets: { icon: "assets/icon.png" }, externalJS: [], style: "style/visual.less", capabilities: "capabilities.json", stringResources: ["stringResources/en-US/resources.resjson"] });
  W(path.join(out, "package.json"), { name: slug, version: spec.version.split(".").slice(0, 3).join("."), description: spec.description, private: true,
    scripts: { start: "pbiviz start", package: "pbiviz package", test: "jest", typecheck: "tsc --noEmit -p .", "test:ci": "jest --runInBand --ci", ci: "npm run typecheck && npm run test:ci && npm run package" },
    author: "Delight Insights - Bryt Ma Tech", license: "UNLICENSED",
    dependencies: { "powerbi-visuals-api": "5.3.0", "powerbi-visuals-utils-formattingmodel": "6.2.2" },
    devDependencies: { "@types/jest": "29.5.12", jest: "29.7.0", "jest-environment-jsdom": "29.7.0", less: "4.9.0", "powerbi-visuals-tools": "7.2.1", "ts-jest": "29.1.2", typescript: "5.9.3" } });
  W(path.join(out, "tsconfig.json"), { compilerOptions: { target: "es2017", module: "esnext", moduleResolution: "node", lib: ["es2017", "dom"], strict: true, strictNullChecks: false, noImplicitAny: true, sourceMap: true, outDir: "./.tmp/build/", declaration: false, experimentalDecorators: true, allowJs: false, esModuleInterop: true, skipLibCheck: true, resolveJsonModule: true }, include: ["src/**/*.ts"], files: ["src/visual.ts"], exclude: ["node_modules", ".tmp"] });
  W(path.join(out, "tsconfig.test.json"), { extends: "./tsconfig.json", compilerOptions: { module: "commonjs", esModuleInterop: true, allowJs: true, types: ["jest", "node"] }, include: ["src/**/*.ts", "tests/**/*.ts"], files: [] });
  W(path.join(out, "jest.config.js"), `module.exports = {
    preset: "ts-jest", testEnvironment: "jsdom", roots: ["<rootDir>/src", "<rootDir>/tests"], testMatch: ["**/tests/**/*.test.ts"],
    setupFilesAfterEnv: ["<rootDir>/tests/jest.setup.ts"], moduleFileExtensions: ["ts", "js", "json"],
    // powerbi-visuals-utils-formattingmodel ships ES modules; compile it for Jest.
    transform: {
        "^.+\\\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
        "^.+\\\\.js$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }]
    },
    transformIgnorePatterns: ["node_modules/(?!powerbi-visuals-utils-formattingmodel)"],
    moduleNameMapper: { "\\\\.(less|css)$": "<rootDir>/tests/mocks/styleMock.js" }, clearMocks: true
};
`);
  copyDir(path.join(root, "shared", "tests", "mocks"), path.join(out, "tests", "mocks"));
  fs.copyFileSync(path.join(root, "shared", "tests", "jest.setup.ts"), path.join(out, "tests", "jest.setup.ts"));
  fs.copyFileSync(path.join(vdir, "fixture.json"), path.join(out, "tests", "fixture.json"));
  fs.copyFileSync(path.join(root, "shared", "tests", "visual.test.template.ts"), path.join(out, "tests", "visual.test.ts"));
  for (const f of fs.readdirSync(vdir)) { if (f.endsWith(".test.ts")) { W(path.join(out, "tests", f), fs.readFileSync(path.join(vdir, f), "utf8").replace("../../shared/tests/mocks/powerbiMocks", "./mocks/powerbiMocks")); } }
  W(path.join(out, "stringResources", "en-US", "resources.resjson"), { Visual_DisplayName: spec.displayName, Brand_Name: "DELIGHT INSIGHTS", Brand_Motto: "DATA DRIVEN DECISIONS", Brand_Unit: "A Bryt Ma Tech business intelligence unit" });
  const icon = path.join(iconsDir, slug + ".png"); fs.mkdirSync(path.join(out, "assets"), { recursive: true });
  if (fs.existsSync(icon)) { fs.copyFileSync(icon, path.join(out, "assets", "icon.png")); }
  W(path.join(out, ".gitignore"), "node_modules/\ndist/\n.tmp/\nwebpack.statistics.*.html\n");
  W(path.join(out, ".github", "workflows", "ci.yml"), `name: ${spec.displayName} CI\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\npermissions:\n  contents: read\njobs:\n  build-test-package:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: "20.x"\n          cache: npm\n      - run: npm ci\n      - run: npm run ci\n      - run: ls -lah dist\n`);
  const roleTable = spec.roles.map((r) => `| ${r.displayName} | \`${r.name}\` | ${r.kind} | ${r.required ? "Required" : "Optional"} | ${r.help} |`).join("\n");
  W(path.join(out, "README.md"), `# ${spec.displayName}\n\n**DELIGHT INSIGHTS** - DATA DRIVEN DECISIONS. *A Bryt Ma Tech business intelligence unit.*\n\n${spec.description}\n\n## Build\n\n\`\`\`\nnpm install\nnpm run ci      # typecheck + tests + package\n\`\`\`\n\nThe \`.pbiviz\` appears in \`dist/\`.\n\n## Docs\n- docs/DATA_CONTRACT.md - the fields this visual needs\n- docs/ARCHITECTURE.md - how the project is organised\n`);
  W(path.join(out, "docs", "DATA_CONTRACT.md"), `# ${spec.displayName} - data contract\n\n| Field well | Role | Kind | | Purpose |\n|---|---|---|---|---|\n${roleTable}\n| Tooltips | \`tooltips\` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |\n\nData arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.\n`);
  W(path.join(out, "docs", "ARCHITECTURE.md"), `# Architecture\n\n- \`src/spec.json\` - single source of truth: roles, format objects, landing copy. \`capabilities.json\` is generated from it and a test enforces they match.\n- \`src/core/\` - shared Delight Insights engine (copied from \`shared/core\`; do not edit here): base visual, data reader, landing page, drawer, selection, tooltips, formatting model, brand.\n- \`src/renderer.ts\` - the only visual-specific code.\n- \`style/design-system/dbi.less\` - shared styling (copied from \`shared/design-system\`). No \`!important\`.\n- \`tests/\` - mock Power BI host, sample data, shared behaviour tests and visual-specific logic tests.\n`);
}
console.log("Generated " + slugs.length + " projects (build " + build + ") in " + outRoot);
