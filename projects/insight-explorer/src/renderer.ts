import { Ctx, Renderer } from "./core/baseVisual";
import { h } from "./core/dom";
import { fmtNum, fmtPct } from "./core/format";

export interface Member { label: string; value: number; compare: number | null; rows: number[] }

export function buildInsights(members: Member[], measure: string, compareName: string | null): { strong: string; rest: string }[] {
    const out: { strong: string; rest: string }[] = [];
    const sorted = members.filter(m => m.value > 0).sort((a, b) => b.value - a.value);
    const total = sorted.reduce((t, m) => t + m.value, 0);
    if (sorted.length >= 2 && total > 0) {
        out.push({ strong: sorted[0].label, rest: " leads with " + fmtPct(sorted[0].value / total, 0) + " of total " + measure + " (" + fmtNum(sorted[0].value) + " of " + fmtNum(total) + ")." });
    }
    if (sorted.length >= 5 && total > 0) {
        const top3 = sorted.slice(0, 3).reduce((t, m) => t + m.value, 0);
        out.push({ strong: "Top 3", rest: " account for " + fmtPct(top3 / total, 0) + " of " + measure + "." });
        let run = 0, n = 0; for (const m of sorted) { run += m.value; n++; if (run / total >= 0.8) { break; } }
        out.push({ strong: n + " of " + sorted.length, rest: " members make up 80% of the total – the rest is a long tail." });
        const med = sorted[Math.floor(sorted.length / 2)].value;
        if (med > 0 && sorted[0].value / med >= 2) { out.push({ strong: "Concentration:", rest: " the leader is " + (sorted[0].value / med).toFixed(1) + "× the median member." }); }
    }
    if (compareName) {
        const withC = members.filter(m => m.compare !== null);
        const tv = withC.reduce((t, m) => t + m.value, 0), tc = withC.reduce((t, m) => t + m.compare, 0);
        if (tc) { out.push({ strong: "Overall", rest: " is " + fmtPct(Math.abs(tv / tc - 1), 1) + (tv >= tc ? " above " : " below ") + compareName + " (" + fmtNum(tv - tc) + ")." }); }
        const gaps = withC.map(m => ({ m, g: m.value - m.compare })).sort((a, b) => b.g - a.g);
        if (gaps.length >= 2) {
            if (gaps[0].g > 0) { out.push({ strong: gaps[0].m.label, rest: " is furthest ahead of " + compareName + " (+" + fmtNum(gaps[0].g) + ")." }); }
            const last = gaps[gaps.length - 1]; if (last.g < 0) { out.push({ strong: last.m.label, rest: " is furthest behind " + compareName + " (" + fmtNum(last.g) + ")." }); }
        }
    }
    if (!out.length) { out.push({ strong: "Not enough data", rest: " to write insights yet. Add more members or a Compare to measure." }); }
    return out;
}

export class InsightExplorerRenderer implements Renderer {
    private path: string[] = [];
    render(ctx: Ctx): void {
        const td = ctx.td; const dims = td.list("dimension"); const measure = td.label("measure"); const hasC = td.has("compare");
        if (this.path.length >= dims.length) { this.path = []; }
        const level = this.path.length; const map = new Map<string, Member>();
        for (let r = 0; r < td.n; r++) {
            let ok = true; for (let l = 0; l < level; l++) { if (td.str(r, "dimension", l) !== this.path[l]) { ok = false; break; } }
            if (!ok) { continue; }
            const k = td.str(r, "dimension", level) || "(blank)"; const m = map.get(k) || { label: k, value: 0, compare: null, rows: [] };
            m.value += td.num(r, "measure") || 0; if (hasC) { const c = td.num(r, "compare"); if (c !== null) { m.compare = (m.compare || 0) + c; } } m.rows.push(r); map.set(k, m);
        }
        const members = Array.from(map.values()).sort((a, b) => b.value - a.value);
        const total = members.reduce((t, m) => t + Math.max(0, m.value), 0); const topN = Math.max(3, Number(ctx.get("insight", "topN")) || 10);
        const max = Math.max(1e-9, ...members.map(m => Math.abs(m.value)));
        if (dims.length > 1 || this.path.length) {
            ctx.body.appendChild(h("div", { class: "dbi-crumbs" }, h("button", { type: "button", onclick: (e: Event) => { e.stopPropagation(); this.path = []; ctx.redraw(); } }, "All " + dims[0].displayName),
                ...this.path.map((p, i) => h("button", { type: "button", onclick: (e: Event) => { e.stopPropagation(); this.path = this.path.slice(0, i + 1); ctx.redraw(); } }, "› " + p)),
                h("span", { class: "dbi-note" }, "by " + dims[level].displayName)));
        }
        const rank = h("div", { class: "dbi-rank" });
        members.slice(0, topN).forEach(m => {
            const sel = m.rows.some(r => ctx.isSelected(r));
            const row = h("div", { class: "dbi-rank__row dbi-rows" + (ctx.anySelected() && !sel ? " dbi-dim" : ""),
                onclick: (e: MouseEvent) => { e.stopPropagation(); if (level < dims.length - 1 && !(e.ctrlKey || e.metaKey)) { this.path = this.path.concat(m.label); ctx.redraw(); } else { ctx.select(m.rows, e.ctrlKey || e.metaKey); } },
                onmousemove: (e: MouseEvent) => ctx.showTip(e, [{ displayName: dims[level].displayName, value: m.label }, { displayName: measure, value: fmtNum(m.value) }, { displayName: "Share", value: fmtPct(total ? m.value / total : null, 1) }].concat(m.compare !== null ? [{ displayName: td.label("compare"), value: fmtNum(m.compare) }] : []), m.rows),
                onmouseleave: () => ctx.hideTip() },
                h("span", { class: "n", title: m.label }, m.label), h("div", { class: "dbi-bar" }, h("i", { style: { width: (Math.abs(m.value) / max * 100) + "%" } })),
                h("span", { class: "v" }, fmtNum(m.value) + (ctx.get("insight", "showShare") ? " · " + fmtPct(total ? m.value / total : null, 0) : "")));
            ctx.mark(row, m.rows); rank.appendChild(row);
        });
        const left = h("div", null, rank, members.length > topN ? h("p", { class: "dbi-note" }, "Showing top " + topN + " of " + members.length + ".") : null);
        if (!ctx.get("insight", "showInsights")) { ctx.body.appendChild(left); return; }
        const ins = h("div", { class: "dbi-insights", role: "list", "aria-label": "Insights" }, ...buildInsights(members, measure, hasC ? td.label("compare") : null).map(i => h("div", { class: "dbi-insight", role: "listitem" }, h("b", null, i.strong), i.rest)));
        ctx.body.appendChild(h("div", { class: "dbi-split" }, left, ins));
    }
}
