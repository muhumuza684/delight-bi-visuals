import { Ctx, Renderer } from "./core/baseVisual";
import { h, s } from "./core/dom";
import { fmtNum, fmtPct, niceTicks, truncate } from "./core/format";

export interface Step { label: string; plan: number; actual: number; variance: number; rows: number[] }
export function buildSteps(ctx: Ctx, maxSteps: number): { steps: Step[]; plan: number; actual: number } {
    const td = ctx.td; const map = new Map<string, Step>();
    for (let r = 0; r < td.n; r++) {
        const k = td.str(r, "category") || "(blank)"; const st = map.get(k) || { label: k, plan: 0, actual: 0, variance: 0, rows: [] };
        st.plan += td.num(r, "plan") || 0; st.actual += td.num(r, "actual") || 0; st.rows.push(r); map.set(k, st);
    }
    const all: Step[] = []; map.forEach(v => { v.variance = v.actual - v.plan; all.push(v); });
    all.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    const n = Math.max(2, maxSteps); let steps = all;
    if (all.length > n) {
        const rest = all.slice(n - 1); steps = all.slice(0, n - 1);
        steps.push({ label: "Other (" + rest.length + ")", plan: 0, actual: 0, variance: rest.reduce((t, x) => t + x.variance, 0), rows: rest.reduce((t: number[], x) => t.concat(x.rows), []) });
    }
    return { steps, plan: all.reduce((t, x) => t + x.plan, 0), actual: all.reduce((t, x) => t + x.actual, 0) };
}

export class VarianceBridgeRenderer implements Renderer {
    render(ctx: Ctx): void {
        const lower = !!ctx.get("bridge", "lowerIsBetter");
        const { steps, plan, actual } = buildSteps(ctx, Number(ctx.get("bridge", "maxSteps")) || 8);
        const variance = actual - plan; const good = (v: number) => (lower ? v <= 0 : v >= 0);
        const stat = (l: string, v: string, cls = "") => h("div", { class: "dbi-stat" }, h("small", null, l), h("b", { class: cls }, v));
        ctx.body.appendChild(h("div", { class: "dbi-stats" }, stat("Plan", fmtNum(plan)), stat("Actual", fmtNum(actual)),
            stat("Variance", (variance >= 0 ? "+" : "") + fmtNum(variance) + (plan ? " (" + fmtPct(variance / Math.abs(plan), 1) + ")" : ""), good(variance) ? "dbi-pos" : "dbi-neg")));
        const fontPx = parseFloat(getComputedStyle(ctx.body).fontSize) || 12;
        const W = Math.max(180, ctx.w - 4), H = Math.max(150, ctx.h - fontPx * 6);
        const bars: { label: string; from: number; to: number; kind: string; rows: number[]; v: number }[] = [{ label: "Plan", from: 0, to: plan, kind: "total", rows: [], v: plan }];
        let cum = plan; steps.forEach(st => { bars.push({ label: st.label, from: cum, to: cum + st.variance, kind: good(st.variance) ? "pos" : "neg", rows: st.rows, v: st.variance }); cum += st.variance; });
        bars.push({ label: "Actual", from: 0, to: actual, kind: "total", rows: [], v: actual });
        const levels = bars.filter(b => b.kind !== "total").map(b => b.to).concat(bars.filter(b => b.kind !== "total").map(b => b.from)).concat([plan, actual]);
        const zoom = !!ctx.get("bridge", "zoomAxis") && Math.min(...levels) > 0;
        let lo = Math.min(...levels), hi = Math.max(...levels);
        if (zoom) { const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.1 || 1; lo = Math.max(0, lo - pad); hi += pad; } else { lo = Math.min(0, lo); hi = Math.max(0, hi); }
        const sc = niceTicks(lo, hi, Math.max(3, Math.floor(H / (fontPx * 4))));
        const ml = fontPx * 4.2 + 8, mr = 10, mt = fontPx * 1.4, mb = fontPx * 3.2; const iw = W - ml - mr, ih = H - mt - mb;
        bars.forEach(b => { if (b.kind === "total") { b.from = Math.max(b.from, sc.min); } });
        const y = (v: number) => mt + ih - (v - sc.min) / (sc.max - sc.min) * ih; const bw = iw / bars.length;
        const svg = s("svg", { class: "dbi-svg", viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": "Variance bridge" });
        sc.ticks.forEach(t => { svg.appendChild(s("line", { class: "dbi-grid", x1: ml, x2: W - mr, y1: y(t), y2: y(t) })); svg.appendChild(s("text", { x: ml - 6, y: y(t) + 4, "text-anchor": "end" }, fmtNum(t))); });
        const rotate = bw < fontPx * 5;
        bars.forEach((b, i) => {
            const x = ml + bw * i + bw * 0.14, w = bw * 0.72; const top = Math.min(y(b.from), y(b.to)), bh = Math.max(1.5, Math.abs(y(b.from) - y(b.to)));
            const fill = b.kind === "total" ? ctx.accent : b.kind === "pos" ? "#178A63" : "#C33B5E";
            const sel = b.rows.length && b.rows.some(r => ctx.isSelected(r)); const op = ctx.anySelected() && b.rows.length && !sel ? 0.3 : 1;
            const bar = s("rect", { x, y: top, width: w, height: bh, rx: 3, fill, opacity: op, class: "dbi-rows",
                onclick: (e: MouseEvent) => { e.stopPropagation(); if (b.rows.length) { ctx.select(b.rows, e.ctrlKey || e.metaKey); } },
                onmousemove: (e: MouseEvent) => ctx.showTip(e, [{ displayName: b.label, value: (b.kind === "total" ? "" : b.v >= 0 ? "+" : "") + fmtNum(b.v) }].concat(b.rows.length ? ctx.tipItems(b.rows[0]) : []), b.rows), onmouseleave: () => ctx.hideTip() });
            if (b.rows.length) { ctx.mark(bar, b.rows); } svg.appendChild(bar);
            if (ctx.get("bridge", "showLabels")) { svg.appendChild(s("text", { x: x + w / 2, y: (b.kind === "neg" ? top + bh + fontPx : top - 5), "text-anchor": "middle", opacity: op }, (b.kind === "total" ? "" : b.v >= 0 ? "+" : "") + fmtNum(b.v))); }
            if (i < bars.length - 1 && ctx.get("bridge", "showConnectors")) { svg.appendChild(s("line", { x1: x + w, x2: x + bw * 0.28 + w, y1: y(b.to), y2: y(b.to), stroke: "#7890A8", "stroke-dasharray": "3 3" })); }
            const lbl = truncate(b.label, rotate ? 14 : Math.max(3, Math.floor(bw / (fontPx * 0.45))));
            const lx = ml + bw * i + bw / 2, ly = H - mb + fontPx * 1.2;
            svg.appendChild(s("text", rotate ? { x: lx, y: ly, "text-anchor": "end", transform: "rotate(-35 " + lx + " " + ly + ")" } : { x: lx, y: ly, "text-anchor": "middle" }, lbl));
        });
        ctx.body.appendChild(svg);
        if (zoom) { ctx.body.appendChild(h("p", { class: "dbi-note" }, "Axis is zoomed to the variance and does not start at zero.")); }
    }
}
