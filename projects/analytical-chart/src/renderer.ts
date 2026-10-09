import { Ctx, Renderer } from "./core/baseVisual";
import { h, s } from "./core/dom";
import { fmtNum, niceTicks, truncate } from "./core/format";

export interface Cell { v: number; rows: number[] }
export interface ChartModel { cats: string[]; series: string[]; cell: Record<string, Record<string, Cell>>; catRows: Record<string, number[]>; hidden: number; total: number }

export function buildChart(ctx: Ctx, sort: string, maxCats = 0, type = "bar"): ChartModel {
    const td = ctx.td; const cats: string[] = []; const series: string[] = []; const cell: Record<string, Record<string, Cell>> = {}; const catRows: Record<string, number[]> = {};
    const nVals = td.list("values").length;
    const add = (c: string, sName: string, v: number | null, r: number) => {
        if (v === null) { return; }
        if (cats.indexOf(c) < 0) { cats.push(c); cell[c] = {}; catRows[c] = []; }
        if (series.indexOf(sName) < 0) { series.push(sName); }
        const k = cell[c][sName] || (cell[c][sName] = { v: 0, rows: [] }); k.v += v; k.rows.push(r); catRows[c].push(r);
    };
    for (let r = 0; r < td.n; r++) {
        const c = td.str(r, "category") || "(blank)";
        if (td.has("series")) { add(c, td.str(r, "series") || "(blank)", td.num(r, "values", 0), r); }
        else { for (let m = 0; m < nVals; m++) { add(c, td.label("values", m), td.num(r, "values", m), r); } }
    }
    const total = (c: string) => series.reduce((t, k) => t + (cell[c][k] ? cell[c][k].v : 0), 0);
    let hidden = 0; const all = cats.length;
    const barLike = type === "bar" || type === "stacked";
    if (maxCats > 0 && barLike && cats.length > maxCats) {
        // Too many categories to read: keep the biggest and group the rest as "Other".
        cats.sort((a, b) => total(b) - total(a));
        const rest = cats.splice(maxCats); hidden = rest.length;
        const other = "Other (" + rest.length + ")"; cell[other] = {}; catRows[other] = [];
        rest.forEach(c => { series.forEach(k => { if (cell[c][k]) { const o = cell[other][k] || (cell[other][k] = { v: 0, rows: [] }); o.v += cell[c][k].v; o.rows = o.rows.concat(cell[c][k].rows); } }); catRows[other] = catRows[other].concat(catRows[c]); });
        if (sort === "asc") { cats.reverse(); }
        cats.push(other);
    } else if (sort === "desc") { cats.sort((a, b) => total(b) - total(a)); } else if (sort === "asc") { cats.sort((a, b) => total(a) - total(b)); }
    return { cats, series, cell, catRows, hidden, total: all };
}

export class AnalyticalChartRenderer implements Renderer {
    private type: string | null = null;
    render(ctx: Ctx): void {
        if (!this.type) { this.type = String(ctx.get("chart", "type")); }
        const type = this.type;
        ctx.tools.appendChild(h("div", { class: "dbi-seg", role: "group", "aria-label": "Chart type" },
            ...[["bar", "Bars"], ["stacked", "Stacked"], ["line", "Line"], ["area", "Area"]].map(t => h("button", { type: "button", "aria-pressed": String(type === t[0]), onclick: (e: Event) => { e.stopPropagation(); this.type = t[0]; ctx.redraw(); } }, t[1]))));
        const m = buildChart(ctx, String(ctx.get("chart", "sort")), Number(ctx.get("chart", "maxCategories")) || 0, type);
        if (!m.cats.length) { ctx.body.appendChild(h("div", { class: "dbi-empty" }, "No values to plot.")); return; }
        const fontPx = parseFloat(getComputedStyle(ctx.body).fontSize) || 12;
        const legendH = m.series.length > 1 ? fontPx * 2 : 0;
        const W = Math.max(160, ctx.w - 4), H = Math.max(150, ctx.h - legendH - 6);
        const stacked = type === "stacked" || type === "area";
        const pos = (c: string) => m.series.reduce((t, k) => t + Math.max(0, m.cell[c][k] ? m.cell[c][k].v : 0), 0);
        const neg = (c: string) => m.series.reduce((t, k) => t + Math.min(0, m.cell[c][k] ? m.cell[c][k].v : 0), 0);
        let lo = 0, hi = 0;
        m.cats.forEach(c => {
            if (stacked) { hi = Math.max(hi, pos(c)); lo = Math.min(lo, neg(c)); }
            else { m.series.forEach(k => { const v = m.cell[c][k] ? m.cell[c][k].v : 0; hi = Math.max(hi, v); lo = Math.min(lo, v); }); }
        });
        const sc = niceTicks(lo, hi, Math.max(3, Math.floor(H / (fontPx * 4))));
        const ml = fontPx * 4.2 + 8, mr = 10, mt = fontPx * 1.4, mb = fontPx * 3.2;
        const iw = W - ml - mr, ih = H - mt - mb;
        const y = (v: number) => mt + ih - (v - sc.min) / (sc.max - sc.min) * ih;
        const bw = iw / m.cats.length;
        const svg = s("svg", { class: "dbi-svg", viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": "Chart" });
        sc.ticks.forEach(t => { if (ctx.get("chart", "showGrid")) { svg.appendChild(s("line", { class: "dbi-grid", x1: ml, x2: W - mr, y1: y(t), y2: y(t) })); } svg.appendChild(s("text", { x: ml - 6, y: y(t) + 4, "text-anchor": "end" }, fmtNum(t))); });
        const color = (i: number) => ctx.palette[i % ctx.palette.length];
        const centerX = (ci: number) => ml + bw * ci + bw / 2;
        const catSel = (c: string) => m.catRows[c].some(r => ctx.isSelected(r));
        const dimmed = (c: string) => ctx.anySelected() && !catSel(c);
        const showLabels = !!ctx.get("chart", "showLabels");
        if (type === "bar" || type === "stacked") {
            m.cats.forEach((c, ci) => {
                const op = dimmed(c) ? 0.3 : 1; let pp = 0, nn = 0;
                m.series.forEach((k, si) => {
                    const v = m.cell[c][k] ? m.cell[c][k].v : 0; let x: number, w: number, y0: number, y1: number;
                    if (type === "bar") { w = Math.max(2, bw * 0.78 / m.series.length); x = ml + bw * ci + bw * 0.11 + si * w; y0 = y(0); y1 = y(v); }
                    else { w = bw * 0.62; x = ml + bw * ci + bw * 0.19; if (v >= 0) { y0 = y(pp); pp += v; y1 = y(pp); } else { y0 = y(nn); nn += v; y1 = y(nn); } }
                    svg.appendChild(s("rect", { x, y: Math.min(y0, y1), width: w, height: Math.max(0.5, Math.abs(y1 - y0)), rx: 2, fill: color(si), opacity: op }));
                    if (showLabels && type === "bar" && m.cats.length * m.series.length <= 24) { svg.appendChild(s("text", { x: x + w / 2, y: (v >= 0 ? y1 - 4 : y1 + fontPx), "text-anchor": "middle", opacity: op }, fmtNum(v))); }
                });
                if (showLabels && type === "stacked" && m.cats.length <= 24) { svg.appendChild(s("text", { x: centerX(ci), y: y(pp) - 4, "text-anchor": "middle", opacity: op }, fmtNum(pp + nn))); }
            });
        } else {
            let base: number[] = m.cats.map(() => 0);
            m.series.forEach((k, si) => {
                const vals = m.cats.map(c => m.cell[c][k] ? m.cell[c][k].v : 0);
                const top = vals.map((v, i) => (type === "area" ? base[i] : 0) + v);
                const pts = top.map((v, i) => [centerX(i), y(v)]);
                if (type === "area") {
                    const bot = base.map((v, i) => [centerX(i), y(v)]).reverse();
                    svg.appendChild(s("polygon", { points: pts.concat(bot).map(p => p.join(",")).join(" "), fill: color(si), opacity: 0.28 }));
                }
                svg.appendChild(s("polyline", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: color(si), "stroke-width": 2.2, "stroke-linejoin": "round" }));
                pts.forEach((p, i) => {
                    svg.appendChild(s("circle", { cx: p[0], cy: p[1], r: 3.2, fill: color(si), opacity: dimmed(m.cats[i]) ? 0.3 : 1 }));
                    if (showLabels && m.cats.length <= 20 && type === "line") { svg.appendChild(s("text", { x: p[0], y: p[1] - 7, "text-anchor": "middle" }, fmtNum(vals[i]))); }
                });
                if (type === "area") { base = top; }
            });
        }
        if (ctx.get("chart", "showAverage")) {
            const avg = m.cats.reduce((t, c) => t + m.series.reduce((u, k) => u + (m.cell[c][k] ? m.cell[c][k].v : 0), 0), 0) / m.cats.length / (stacked ? 1 : m.series.length);
            svg.appendChild(s("line", { x1: ml, x2: W - mr, y1: y(avg), y2: y(avg), stroke: "#EC0A8C", "stroke-dasharray": "5 4", "stroke-width": 1.5 }));
            svg.appendChild(s("text", { x: W - mr, y: y(avg) - 4, "text-anchor": "end", style: { fill: "#EC0A8C" } }, "Avg " + fmtNum(avg)));
        }
        const charW = fontPx * 0.78 * 0.56; const maxChars = Math.floor(bw / charW); const rotate = maxChars < 7;
        m.cats.forEach((c, ci) => {
            const lbl = truncate(c, rotate ? 16 : Math.max(3, maxChars));
            if (bw < charW * 3 && ci % Math.ceil(charW * 3 / bw) !== 0) { return; }
            svg.appendChild(s("text", rotate ? { x: centerX(ci), y: H - mb + fontPx, "text-anchor": "end", transform: "rotate(-35 " + centerX(ci) + " " + (H - mb + fontPx) + ")" } : { x: centerX(ci), y: H - mb + fontPx * 1.2, "text-anchor": "middle" }, lbl));
            const hit = s("rect", { x: ml + bw * ci, y: mt, width: bw, height: ih, fill: "transparent", class: "dbi-rows", onclick: (e: MouseEvent) => { e.stopPropagation(); ctx.select(m.catRows[c], e.ctrlKey || e.metaKey); },
                onmousemove: (e: MouseEvent) => ctx.showTip(e, [{ displayName: ctx.td.label("category"), value: c }].concat(m.series.filter(k => m.cell[c][k]).map(k => ({ displayName: k, value: fmtNum(m.cell[c][k].v) })), ctx.tipItems(m.catRows[c][0])), m.catRows[c]), onmouseleave: () => ctx.hideTip() });
            ctx.mark(hit, m.catRows[c]); svg.appendChild(hit);
        });
        if (m.series.length > 1 && ctx.get("chart", "showLegend")) { ctx.body.appendChild(h("div", { class: "dbi-legend" }, ...m.series.map((k, i) => h("span", null, h("i", { style: { background: color(i) } }), k)))); }
        ctx.body.appendChild(svg);
        if (m.hidden) { ctx.body.appendChild(h("p", { class: "dbi-note" }, "Showing the top " + (m.cats.length - 1) + " of " + m.total + " categories; the rest are grouped as Other. Change Top categories in Settings.")); }
    }
}
