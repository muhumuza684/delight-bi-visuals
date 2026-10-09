import { Ctx, Renderer } from "./core/baseVisual";
import { h, s } from "./core/dom";
import { fmtNum, fmtPct, toDate } from "./core/format";

export interface KpiModel { label: string; rows: number[]; actual: number | null; target: number | null; previous: number | null; series: number[] }

export function buildKpis(ctx: Ctx): KpiModel[] {
    const td = ctx.td; const groups = new Map<string, number[]>();
    for (let r = 0; r < td.n; r++) { const k = td.has("kpi") ? td.str(r, "kpi") || "(blank)" : "Total"; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
    const out: KpiModel[] = [];
    groups.forEach((rs, label) => {
        if (td.has("period")) {
            rs = rs.slice().sort((a, b) => {
                const da = toDate(td.val(a, "period")), db = toDate(td.val(b, "period"));
                return da && db ? da.getTime() - db.getTime() : String(td.val(a, "period")).localeCompare(String(td.val(b, "period")));
            });
        }
        const lastNum = (role: string): number | null => {
            if (!td.has(role)) { return null; }
            if (td.has("period")) { for (let i = rs.length - 1; i >= 0; i--) { const v = td.num(rs[i], role); if (v !== null) { return v; } } return null; }
            let t = 0, any = false; rs.forEach(r => { const v = td.num(r, role); if (v !== null) { t += v; any = true; } }); return any ? t : null;
        };
        out.push({ label, rows: rs, actual: lastNum("actual"), target: lastNum("target"), previous: lastNum("previous"),
            series: td.has("period") ? rs.map(r => td.num(r, "actual")).filter(v => v !== null) as number[] : [] });
    });
    return out;
}

export function ragColor(att: number | null, lowerBetter: boolean, green: number, amber: number): string {
    if (att === null || !isFinite(att)) { return "#7890A8"; }
    const a = lowerBetter ? 2 - att : att;
    return a * 100 >= green ? "#178A63" : a * 100 >= amber ? "#B57900" : "#C33B5E";
}

function spark(values: number[], color: string, w: number, hh: number): Element {
    const min = Math.min(...values), max = Math.max(...values); const sp = max - min || 1;
    const pts = values.map((v, i) => [values.length === 1 ? w / 2 : i / (values.length - 1) * w, hh - 2 - (v - min) / sp * (hh - 4)]);
    return s("svg", { class: "dbi-svg", viewBox: "0 0 " + w + " " + hh, style: { height: "2.2em" }, "aria-hidden": "true" },
        s("polyline", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }),
        s("circle", { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 3, fill: color }));
}

export class ExecutiveKpiRenderer implements Renderer {
    render(ctx: Ctx): void {
        const lower = !!ctx.get("kpi", "lowerIsBetter"); const green = Number(ctx.get("kpi", "greenAt")); const amber = Number(ctx.get("kpi", "amberAt"));
        const grid = h("div", { class: "dbi-kpis", style: { gridTemplateColumns: "repeat(auto-fill, minmax(" + (Number(ctx.get("kpi", "cardMinWidth")) || 240) + "px, 1fr))" } });
        buildKpis(ctx).forEach(k => {
            const att = k.target ? (k.actual !== null ? k.actual / k.target : null) : null;
            const color = ragColor(att, lower, green, amber);
            const delta = k.previous ? (k.actual - k.previous) / Math.abs(k.previous) : null;
            const good = delta === null ? null : lower ? delta <= 0 : delta >= 0;
            const sel = k.rows.some(r => ctx.isSelected(r));
            const card = h("div", { class: "dbi-kpi dbi-rows" + (sel ? " dbi-sel" : "") + (ctx.anySelected() && !sel ? " dbi-dim" : ""),
                onclick: (e: MouseEvent) => { e.stopPropagation(); ctx.select(k.rows, e.ctrlKey || e.metaKey); },
                onmousemove: (e: MouseEvent) => ctx.showTip(e, [{ displayName: "Actual", value: fmtNum(k.actual) }].concat(k.target !== null ? [{ displayName: "Target", value: fmtNum(k.target) }] : [], k.previous !== null ? [{ displayName: "Previous", value: fmtNum(k.previous) }] : [], ctx.tipItems(k.rows[0])), k.rows),
                onmouseleave: () => ctx.hideTip() },
                h("div", { class: "dbi-kpi__label" }, k.label),
                h("div", { class: "dbi-kpi__value" }, fmtNum(k.actual, ctx.td.col("actual").format)),
                k.target !== null && ctx.get("kpi", "showTargetBar") ? h("div", { class: "dbi-bar", title: "Attainment" }, h("i", { style: { width: Math.min(100, Math.max(0, (att || 0) * 100)) + "%", background: color } })) : null,
                h("div", { class: "dbi-kpi__row" },
                    k.target !== null ? h("span", null, h("span", { class: "dbi-rag", style: { background: color } }), " " + fmtPct(att, 0) + " of " + fmtNum(k.target)) : h("span", null),
                    delta !== null && ctx.get("kpi", "showDelta") ? h("span", { class: good ? "dbi-pos" : "dbi-neg" }, (delta >= 0 ? "▲ " : "▼ ") + fmtPct(Math.abs(delta), 1)) : null),
                ctx.get("kpi", "showSparkline") && k.series.length > 1 ? spark(k.series, color, 160, 36) : null);
            ctx.mark(card, k.rows); grid.appendChild(card);
        });
        ctx.body.appendChild(grid);
    }
}
