import { Ctx, Renderer } from "./core/baseVisual";
import { h, s } from "./core/dom";
import { clamp, fmtNum } from "./core/format";
import { Country, loadWorld, matchCountries, mercX, mercY } from "./geodata";
import { WORLD_JSON } from "./world";

export interface Pt { lat: number; lon: number; label: string; value: number | null; rows: number[] }
export interface Bounds { lon0: number; lon1: number; lat0: number; lat1: number }

/** Fit bounds for a set of points: padded so the surrounding borders stay visible. */
export function viewFor(pts: { lat: number; lon: number }[], minSpan = 6): Bounds {
    let lon0 = Math.min(...pts.map(p => p.lon)), lon1 = Math.max(...pts.map(p => p.lon)), lat0 = Math.min(...pts.map(p => p.lat)), lat1 = Math.max(...pts.map(p => p.lat));
    const padLon = Math.max((lon1 - lon0) * 0.18, minSpan / 2), padLat = Math.max((lat1 - lat0) * 0.18, minSpan / 2);
    lon0 -= padLon; lon1 += padLon; lat0 -= padLat; lat1 += padLat;
    return { lon0: Math.max(-180, lon0), lon1: Math.min(180, lon1), lat0: Math.max(-82, lat0), lat1: Math.min(82, lat1) };
}

function hexToRgb(hex: string): [number, number, number] {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); const v = m ? parseInt(m[1], 16) : 0x104F9F; return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export class GeoExplorerRenderer implements Renderer {
    private k = 1; private tx = 0; private ty = 0;
    render(ctx: Ctx): void {
        const td = ctx.td; const world = loadWorld(WORLD_JSON);
        const hasLL = td.has("latitude") && td.has("longitude"); const hasLoc = td.has("location");
        const pts: Pt[] = []; let bad = 0;
        const choro: { country: Country; value: number; rows: number[]; label: string }[] = []; let missing: string[] = [];
        if (hasLL) {
            for (let r = 0; r < td.n; r++) {
                const lat = td.num(r, "latitude"), lon = td.num(r, "longitude");
                if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) { bad++; continue; }
                pts.push({ lat, lon, label: hasLoc ? td.str(r, "location") : "", value: td.has("value") ? td.num(r, "value") : null, rows: [r] });
            }
        } else if (hasLoc) {
            const names: string[] = []; for (let r = 0; r < td.n; r++) { names.push(td.str(r, "location")); }
            const m = matchCountries(names.filter((x, i) => x && names.indexOf(x) === i), world); missing = m.missing;
            const agg: Record<string, { country: Country; value: number; rows: number[]; label: string }> = {};
            for (let r = 0; r < td.n; r++) {
                const c = m.found[names[r]]; if (!c) { continue; }
                const a = agg[c.name] || (agg[c.name] = { country: c, value: 0, rows: [], label: names[r] });
                a.value += td.has("value") ? (td.num(r, "value") || 0) : 1; a.rows.push(r);
            }
            Object.keys(agg).forEach(k => choro.push(agg[k]));
        }
        if (!pts.length && !choro.length) {
            ctx.body.appendChild(h("div", { class: "dbi-empty" }, hasLoc && !hasLL ? "None of the locations matched a country name." + (missing.length ? " Not recognised: " + missing.slice(0, 5).join(", ") : "") : "No valid latitude/longitude pairs."));
            return;
        }
        const fontPx = parseFloat(getComputedStyle(ctx.body).fontSize) || 12;
        const showList = !!ctx.get("geo", "showList") && ctx.w >= 760 && (pts.some(p => p.value !== null) || choro.length > 0);
        const W = Math.max(200, (showList ? ctx.w * 0.68 : ctx.w) - 4), H = Math.max(150, ctx.h - 6);

        // ---- fit the view to the data
        const v: Bounds = hasLL ? viewFor(pts) : (() => {
            const b = choro.map(c => c.country.main);
            return viewFor([{ lat: Math.min(...b.map(x => x[1])), lon: Math.min(...b.map(x => x[0])) }, { lat: Math.max(...b.map(x => x[3])), lon: Math.max(...b.map(x => x[2])) }], 4);
        })();
        const x0 = mercX(v.lon0), x1 = mercX(v.lon1), y0 = mercY(v.lat0), y1 = mercY(v.lat1);
        const k0 = Math.min(W / (x1 - x0), H / (y1 - y0));
        const ox = (W - (x1 - x0) * k0) / 2, oy = (H - (y1 - y0) * k0) / 2;
        const px = (lon: number) => ox + (mercX(lon) - x0) * k0, py = (lat: number) => oy + (y1 - mercY(lat)) * k0;
        const round = (n: number) => Math.round(n * 10) / 10;

        const svg = s("svg", { class: "dbi-svg dbi-geo", viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": "Map" });
        const g = s("g"); svg.appendChild(g);

        // ---- real country borders
        const showBorders = !!ctx.get("geo", "showOutline");
        const matched: Record<string, boolean> = {}; choro.forEach(c => { matched[c.country.name] = true; });
        if (showBorders && world.length) {
            const cull = (x1 - x0) < 4;
            const mx0 = x0 - (x1 - x0), mx1 = x1 + (x1 - x0), my0 = y0 - (y1 - y0), my1 = y1 + (y1 - y0);
            let landD = "";
            world.forEach(c => {
                if (cull && (mercX(c.bbox[2]) < mx0 || mercX(c.bbox[0]) > mx1 || mercY(c.bbox[3]) < my0 || mercY(c.bbox[1]) > my1)) { return; }
                let d = "";
                c.polys.forEach(poly => poly.forEach(ring => { d += "M" + ring.map(pt => round(px(pt[0])) + "," + round(py(pt[1]))).join("L") + "Z"; }));
                if (matched[c.name]) { return; }
                landD += d;
            });
            g.appendChild(s("path", { class: "land", d: landD, "fill-rule": "evenodd", "vector-effect": "non-scaling-stroke" }));
        }

        // ---- filled countries (location by name)
        if (choro.length) {
            const vals = choro.map(c => c.value); const lo = Math.min(...vals), hi = Math.max(...vals); const [r, gg, b] = hexToRgb(ctx.accent);
            const shade = (val: number) => { const t = hi === lo ? 1 : (val - lo) / (hi - lo); return "rgba(" + r + "," + gg + "," + b + "," + (0.22 + 0.78 * t).toFixed(2) + ")"; };
            choro.forEach(c => {
                let d = ""; c.country.polys.forEach(poly => poly.forEach(ring => { d += "M" + ring.map(pt => round(px(pt[0])) + "," + round(py(pt[1]))).join("L") + "Z"; }));
                const dim = ctx.anySelected() && !c.rows.some(rr => ctx.isSelected(rr));
                const el = s("path", { class: "country" + (dim ? " dim" : ""), d, "fill-rule": "evenodd", fill: shade(c.value), "vector-effect": "non-scaling-stroke",
                    onclick: (e: MouseEvent) => { e.stopPropagation(); ctx.select(c.rows, e.ctrlKey || e.metaKey); },
                    onmousemove: (e: MouseEvent) => ctx.showTip(e, [{ displayName: c.country.name, value: td.has("value") ? fmtNum(c.value) : c.rows.length + " row(s)" }].concat(ctx.tipItems(c.rows[0])), c.rows),
                    onmouseleave: () => ctx.hideTip() });
                ctx.mark(el, c.rows); g.appendChild(el);
                if (ctx.get("geo", "showLabels")) {
                    const m = c.country.main; g.appendChild(s("text", { class: "clabel", x: px((m[0] + m[2]) / 2), y: py((m[1] + m[3]) / 2), "text-anchor": "middle" }, c.country.name));
                }
            });
        }

        // ---- bubbles (latitude / longitude)
        const circles: { el: Element; r: number }[] = [];
        let vmax = 1;
        if (pts.length) {
            const vals = pts.map(p => p.value).filter(x => x !== null) as number[]; vmax = vals.length ? Math.max(...vals.map(Math.abs), 1e-9) : 1;
            const rmax = Math.max(6, Number(ctx.get("geo", "maxRadius")) || 28);
            const radius = (p: Pt) => p.value === null ? Math.min(7, rmax) : Math.max(3, Math.sqrt(Math.abs(p.value) / vmax) * rmax);
            pts.slice().sort((a, b) => radius(b) - radius(a)).forEach(p => {
                const dim = ctx.anySelected() && !ctx.isSelected(p.rows[0]);
                const c = s("circle", { class: "pt" + (dim ? " dim" : ""), "fill-opacity": dim ? 0.12 : (Number(ctx.get("geo", "bubbleOpacity")) || 55) / 100, cx: px(p.lon), cy: py(p.lat), r: radius(p), "vector-effect": "non-scaling-stroke",
                    onclick: (e: MouseEvent) => { e.stopPropagation(); ctx.select(p.rows, e.ctrlKey || e.metaKey); },
                    onmousemove: (e: MouseEvent) => ctx.showTip(e, [{ displayName: p.label || "Point", value: p.lat.toFixed(3) + ", " + p.lon.toFixed(3) }].concat(p.value !== null ? [{ displayName: td.label("value"), value: fmtNum(p.value) }] : [], ctx.tipItems(p.rows[0])), p.rows),
                    onmouseleave: () => ctx.hideTip() });
                ctx.mark(c, p.rows); g.appendChild(c); circles.push({ el: c, r: radius(p) });
                if (ctx.get("geo", "showLabels") && p.label) { g.appendChild(s("text", { class: "clabel", x: px(p.lon) + radius(p) + 3, y: py(p.lat) + 4 }, p.label)); }
            });
        }

        // ---- zoom and pan
        const apply = () => { g.setAttribute("transform", "translate(" + this.tx + " " + this.ty + ") scale(" + this.k + ")"); circles.forEach(c => c.el.setAttribute("r", String(c.r / Math.sqrt(this.k)))); };
        apply();
        svg.addEventListener("wheel", (e: WheelEvent) => {
            e.preventDefault(); const rect = (svg as any).getBoundingClientRect(); const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            const nk = clamp(this.k * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 1, 40); this.tx = mx - (mx - this.tx) * nk / this.k; this.ty = my - (my - this.ty) * nk / this.k; this.k = nk; apply();
        });
        let drag: { x: number; y: number } | null = null;
        svg.addEventListener("mousedown", (e: MouseEvent) => { drag = { x: e.clientX - this.tx, y: e.clientY - this.ty }; });
        svg.addEventListener("mousemove", (e: MouseEvent) => { if (drag && e.buttons) { this.tx = e.clientX - drag.x; this.ty = e.clientY - drag.y; apply(); } });
        svg.addEventListener("mouseup", () => { drag = null; });
        ctx.tools.appendChild(h("button", { class: "dbi-btn dbi-btn--ghost", type: "button", onclick: (e: Event) => { e.stopPropagation(); this.k = 1; this.tx = 0; this.ty = 0; apply(); } }, "Reset view"));

        // ---- layout: map + ranked list
        const wrap = h("div", { style: { display: "flex", gap: "1em", alignItems: "flex-start" } }, h("div", { style: { flex: "0 0 " + W + "px", width: W + "px" } }, svg));
        const rows = pts.length ? pts.filter(p => p.value !== null).map(p => ({ name: p.label || p.lat.toFixed(1) + "," + p.lon.toFixed(1), v: p.value as number, rows: p.rows }))
            : choro.map(c => ({ name: c.country.name, v: c.value, rows: c.rows }));
        if (showList) {
            const top = rows.sort((a, b) => b.v - a.v).slice(0, 12); const mx = Math.max(1e-9, ...top.map(x => Math.abs(x.v)));
            wrap.appendChild(h("div", { class: "dbi-rank", style: { flex: "1 1 0", minWidth: "0" } }, h("p", { class: "dbi-fields__title" }, pts.length ? "Top locations" : "Top countries"),
                ...top.map(p => h("div", { class: "dbi-rank__row dbi-rows", style: { gridTemplateColumns: "5.5em 1fr 3.5em" }, onclick: (e: MouseEvent) => { e.stopPropagation(); ctx.select(p.rows, e.ctrlKey || e.metaKey); } },
                    h("span", { class: "n" }, p.name), h("div", { class: "dbi-bar" }, h("i", { style: { width: (Math.abs(p.v) / mx * 100) + "%" } })), h("span", { class: "v" }, fmtNum(p.v))))));
        }
        ctx.body.appendChild(wrap);
        const notes: string[] = [];
        if (bad) { notes.push(bad + " row(s) with missing or out-of-range coordinates were skipped."); }
        if (missing.length) { notes.push(missing.length + " location(s) not recognised as countries: " + missing.slice(0, 4).join(", ") + (missing.length > 4 ? "..." : "") + ". Use English country names."); }
        if (!world.length && showBorders) { notes.push("Country borders are unavailable in this build."); }
        if (notes.length) { ctx.body.appendChild(h("p", { class: "dbi-note" }, notes.join(" "))); }
    }
}
