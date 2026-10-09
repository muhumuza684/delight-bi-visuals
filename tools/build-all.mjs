#!/usr/bin/env node
/* One command to generate, type-check, test and package the whole family.
 *   npm run build                       everything
 *   npm run build:one -- work-planner   a single visual
 *   npm test                            generate + typecheck + tests only (no packaging)
 * Finished .pbiviz files are collected in ./dist-pbiviz */
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const noPackage = args.includes("--no-package"); const noTests = args.includes("--no-tests");
const oi = args.indexOf("--only"); const only = oi >= 0 ? args.slice(oi + 1).filter(a => !a.startsWith("--")) : [];
const bin = (...p) => path.join(root, "node_modules", ...p);
for (const need of [bin("typescript", "bin", "tsc"), bin("jest", "bin", "jest.js"), bin("powerbi-visuals-tools", "bin", "pbiviz.js")]) {
  if (!fs.existsSync(need)) { console.error("Dependencies are not installed. Run:  npm install   (in " + root + ")"); process.exit(2); }
}
if (!fs.existsSync(path.join(root, "node_modules", "world-atlas"))) { console.error("The map data package is missing. Run:  npm install   (in " + root + ")"); process.exit(2); }
const run = (label, cwd, script, a) => {
  const t = Date.now(); const r = spawnSync(process.execPath, [script, ...a], { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
  const secs = ((Date.now() - t) / 1000).toFixed(0);
  if (r.status !== 0) { console.log("   FAIL  " + label + " (" + secs + "s)"); console.log((r.stdout || "") + (r.stderr || "")); return false; }
  console.log("   ok    " + label + " (" + secs + "s)"); return true;
};
const buildFile = path.join(root, ".buildnumber");
if (!noPackage) {
  const prev = fs.existsSync(buildFile) ? parseInt(fs.readFileSync(buildFile, "utf8"), 10) || 0 : 0;
  fs.writeFileSync(buildFile, String(prev + 1)); console.log("\n== Build number " + (prev + 1) + "  (every package gets a new version so Power BI never reuses a cached copy)");
}
console.log("\n== Generating projects from shared/ + visuals/");
if (!run("generate", root, path.join(root, "tools", "build-family.mjs"), [])) { process.exit(1); }
const all = fs.readdirSync(path.join(root, "projects")).filter(d => fs.existsSync(path.join(root, "projects", d, "pbiviz.json"))).sort();
const slugs = only.length ? all.filter(s => only.includes(s)) : all;
if (!slugs.length) { console.error("No matching visuals. Available: " + all.join(", ")); process.exit(1); }
// pbiviz looks for node_modules inside each project. Link every project to the one shared install (junction on Windows, no admin needed).
const ensureLink = (cwd) => {
  const nm = path.join(cwd, "node_modules");
  try { fs.lstatSync(nm); return; } catch (e) { /* missing - create below */ }
  fs.symlinkSync(path.join(root, "node_modules"), nm, "junction");
};
const dist = path.join(root, "dist-pbiviz"); fs.mkdirSync(dist, { recursive: true });
const results = [];
for (const slug of slugs) {
  console.log("\n== " + slug); const cwd = path.join(root, "projects", slug); let ok = true; ensureLink(cwd);
  ok = ok && run("typecheck", cwd, bin("typescript", "bin", "tsc"), ["--noEmit", "-p", "."]);
  if (ok && !noTests) { ok = run("tests", cwd, bin("jest", "bin", "jest.js"), ["--silent", "--ci"]); }
  if (ok && !noPackage) {
    fs.rmSync(path.join(cwd, "dist"), { recursive: true, force: true });
    const guid = JSON.parse(fs.readFileSync(path.join(cwd, "pbiviz.json"), "utf8")).visual.guid;
    for (const f of fs.readdirSync(dist)) { if (f.indexOf(guid + ".") === 0) { fs.rmSync(path.join(dist, f), { force: true }); } }
    ok = run("package", cwd, bin("powerbi-visuals-tools", "bin", "pbiviz.js"), ["package"]);
    if (ok) { for (const f of fs.readdirSync(path.join(cwd, "dist"))) { if (f.endsWith(".pbiviz")) { fs.copyFileSync(path.join(cwd, "dist", f), path.join(dist, f)); } } }
  }
  results.push([slug, ok]);
}
console.log("\n== Summary"); results.forEach(([s, ok]) => console.log((ok ? "   PASS  " : "   FAIL  ") + s));
if (!noPackage && results.some(r => r[1])) { console.log("\n.pbiviz files: " + dist); }
process.exit(results.every(r => r[1]) ? 0 : 1);
