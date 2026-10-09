import { Ctx, Renderer, RendererSettingsApi } from "./core/baseVisual";
import { h } from "./core/dom";
import { fmtNum, clamp } from "./core/format";
import { ColDef, Virtual, baseDefs, buildDefs, computeVirtual, cellText, rawValue, applyFilters, sortRows } from "./tableModel";
import { TableState, parseState, defaultState, PivotAggregation } from "./tableState";
import { pivotRows } from "./pivot";
import { matchesAnalyticsRule, dataBarLayout } from "./analyticsFormatting";
import * as S from "./settingsTable";

const ICON: Record<string, string> = { up: "\u25B2", down: "\u25BC", dot: "\u25CF" };

export class UniversalTableRenderer implements Renderer {
    private state: TableState = defaultState(); private saved = ""; private lastStored = "\u0000";
    private ctx: Ctx | null = null; private defs: ColDef[] = []; private virt: Virtual = {};
    private search = ""; private limit = 0; private collapsed = new Set<string>(); private openFilterKey: string | null = null;

    /** Reads the table state the report saved. Stale redraws (before Power BI echoes our own save) never overwrite local changes. */
    private sync(ctx: Ctx): void {
        const stored = String(ctx.stored("tablestate", "state", "{}"));
        if (stored !== this.lastStored) { this.lastStored = stored; if (stored !== this.saved) { this.state = parseState(stored); this.saved = stored; } }
    }
    private commit(patch: Partial<TableState>): void {
        if (Object.keys(patch).length) {
            this.state = { ...this.state, ...patch }; const j = JSON.stringify(this.state); this.saved = j;
            if (this.ctx) { this.ctx.persist("tablestate", "state", j); }
        }
        if (this.ctx) { this.ctx.redraw(); }
    }

    private colStyle(d: ColDef, ctx: Ctx, rows: number[]): Record<string, string> {
        const p = this.state.cols[d.key] || {}; const st: Record<string, string> = {}; const min = p.min === undefined ? 80 : p.min, max = p.max === undefined ? 520 : p.max;
        if (p.widthMode === "fixed") { st.width = min + "px"; st.minWidth = min + "px"; st.maxWidth = min + "px"; }
        else if (p.widthMode === "custom") { st.minWidth = min + "px"; st.maxWidth = max + "px"; }
        else if (p.widthMode === "fill") { st.width = "100%"; }
        else if (p.widthMode === "fit") {
            const fontPx = parseFloat(getComputedStyle(ctx.body).fontSize) || 12; let longest = d.label.length;
            for (let i = 0; i < Math.min(rows.length, 200); i++) { longest = Math.max(longest, cellText(ctx.td, d, this.virt, rows[i]).length); }
            st.width = clamp(longest * fontPx * 0.62 + 28, 48, max) + "px";
        }
        if (p.align && p.align !== "auto") { st.textAlign = p.align; }
        return st;
    }

    render(ctx: Ctx): void {
        this.ctx = ctx; this.sync(ctx); const td = ctx.td; const st = this.state;
        this.virt = computeVirtual(td, baseDefs(td), st); this.defs = buildDefs(td, st, this.virt);
        const visible = this.defs.filter(d => !(st.cols[d.key] && st.cols[d.key].hidden));
        const pageSize = Math.max(25, Number(ctx.get("table", "pageSize")) || 200); if (!this.limit) { this.limit = pageSize; }
        const groupCol = td.col("groupBy");

        if (ctx.get("table", "showSearch")) {
            const input = h("input", { class: "dbi-input", type: "search", placeholder: "Search this table", "aria-label": "Search rows", value: this.search,
                oninput: (e: Event) => { this.search = (e.target as HTMLInputElement).value; this.limit = pageSize; ctx.redraw(); } }) as HTMLInputElement;
            ctx.tools.appendChild(input);
            if (this.search) { setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 0); }
        }
        const pivotOn = st.pivot.mode === "pivot" && !!ctx.get("table", "pivotEnabled");
        if (ctx.get("table", "pivotEnabled")) {
            ctx.tools.appendChild(h("button", { class: "dbi-pivot-toggle" + (pivotOn ? " is-on" : ""), type: "button", "aria-pressed": String(pivotOn), onclick: (e: Event) => { e.stopPropagation(); this.commit({ pivot: { ...st.pivot, mode: pivotOn ? "table" : "pivot" } }); } }, "Pivot"));
        }

        let rows: number[] = []; const q = this.search.trim().toLowerCase();
        for (let r = 0; r < td.n; r++) {
            if (!q || visible.some(d => cellText(td, d, this.virt, r).toLowerCase().indexOf(q) >= 0) || (groupCol && td.cell(r, groupCol).toLowerCase().indexOf(q) >= 0)) { rows.push(r); }
        }
        rows = applyFilters(td, this.defs, this.virt, rows, st.filters);
        if (st.sort) { const d = this.defs.filter(x => x.key === st.sort.col)[0]; if (d) { rows = sortRows(td, d, this.virt, rows, st.sort.dir); } }
        if (pivotOn) { this.renderPivot(ctx, rows, visible); } else { this.renderTable(ctx, rows, visible, pageSize); }
    }

    // ------------------------------------------------------------------ plain table
    private renderTable(ctx: Ctx, rows: number[], visible: ColDef[], pageSize: number): void {
        const td = ctx.td, st = this.state, virt = this.virt; const groupCol = td.col("groupBy");
        const numeric = visible.filter(d => d.numeric); const firstBar = ctx.get("table", "dataBars") ? numeric[0] : undefined;
        const stats: Record<string, { min: number; max: number }> = {};
        numeric.forEach(d => {
            let mn = Infinity, mx = -Infinity;
            rows.forEach(r => { const v = Number(rawValue(td, d, virt, r)); if (isFinite(v)) { if (v < mn) { mn = v; } if (v > mx) { mx = v; } } });
            stats[d.key] = { min: Math.min(0, mn), max: mx };
        });
        const tbl = h("table", { class: "dbi-table" + (ctx.get("table", "striped") ? " dbi-table--striped" : "") + (ctx.get("table", "accentFirstColumn") ? " dbi-table--accent" : "") + (ctx.get("table", "emphasizeHeaders") ? "" : " dbi-table--lighthead") });
        tbl.appendChild(h("thead", null, h("tr", null, ...visible.map(d => {
            const p = st.cols[d.key] || {}; const sorted = st.sort && st.sort.col === d.key; const style = this.colStyle(d, ctx, rows);
            if (p.color) { style.background = p.color; style.color = "#FFFFFF"; }
            return h("th", { class: d.numeric ? "num" : "", style, "aria-sort": sorted ? (st.sort.dir === 1 ? "ascending" : "descending") : "none",
                onclick: (e: Event) => { e.stopPropagation(); if (p.sortable === false) { return; } this.commit({ sort: !sorted ? { col: d.key, dir: 1 } : st.sort.dir === 1 ? { col: d.key, dir: -1 } : null }); } },
                d.label + (sorted ? (st.sort.dir === 1 ? " \u25B2" : " \u25BC") : ""));
        }))));
        const tb = h("tbody"); tbl.appendChild(tb);
        const sums = (rs: number[]) => visible.map(d => d.numeric ? rs.reduce((t, r) => t + (Number(rawValue(td, d, virt, r)) || 0), 0) : null);
        const dataRow = (r: number): HTMLElement => {
            let rowBg: string | undefined;
            const cells = visible.map(d => {
                const raw = rawValue(td, d, virt, r); const text = cellText(td, d, virt, r); const style = this.colStyle(d, ctx, rows);
                let bar: HTMLElement | null = null; let icon: HTMLElement | null = null; let hasRuleBar = false;
                st.rules.filter(rl => rl.column === d.key).forEach(rl => {
                    if (!matchesAnalyticsRule(raw, rl)) { return; }
                    const f = rl.format || "background";
                    if (f === "background") { if (rl.scope === "row") { rowBg = rowBg || rl.color; } else { style.backgroundColor = rl.color; } }
                    else if (f === "font") { style.color = rl.color; }
                    else if (f === "dataBar" && stats[d.key]) { hasRuleBar = true; const L = dataBarLayout(Number(raw), stats[d.key].min, stats[d.key].max); if (L.visible) { bar = h("i", { class: "dbi-rbar", style: { left: L.leftPct + "%", width: L.widthPct + "%", background: rl.color } }); } }
                    else if (f === "icon") { icon = h("span", { class: "dbi-ricon", style: { color: rl.color } }, ICON[rl.icon || "up"] + " "); }
                });
                if (!bar && !hasRuleBar && firstBar === d && stats[d.key]) { const L = dataBarLayout(Number(raw), stats[d.key].min, stats[d.key].max); if (L.visible) { bar = h("i", { class: "dbi-rbar dbi-rbar--default", style: { left: L.leftPct + "%", width: L.widthPct + "%" } }); } }
                return h("td", { class: (d.numeric ? "num" : "") + (bar ? " dbi-databar" : ""), style, title: text }, bar, icon, text);
            });
            if (rowBg) { cells.forEach(c => { if (!c.style.backgroundColor) { c.style.backgroundColor = rowBg; } }); }
            const tr = h("tr", { class: "dbi-rows" + (ctx.isSelected(r) ? " dbi-picked" : "") + (ctx.anySelected() && !ctx.isSelected(r) ? " dbi-dim" : ""),
                onclick: (e: MouseEvent) => { e.stopPropagation(); ctx.select([r], e.ctrlKey || e.metaKey); },
                onmousemove: (e: MouseEvent) => { const t = ctx.tipItems(r); if (t.length) { ctx.showTip(e, t, [r]); } }, onmouseleave: () => ctx.hideTip() }, ...cells);
            ctx.mark(tr, [r]); return tr;
        };
        const totalRow = (label: string, rs: number[], cls: string) => h("tr", { class: cls }, ...visible.map((d, i) => { const v = sums(rs)[i]; return h("td", { class: v === null ? "" : "num" }, i === 0 ? label : v === null ? "" : fmtNum(v)); }));
        let shown = 0;
        if (groupCol) {
            const groups = new Map<string, number[]>();
            rows.forEach(r => { const k = td.cell(r, groupCol) || "(blank)"; (groups.get(k) || groups.set(k, []).get(k)).push(r); });
            groups.forEach((rs, k) => {
                const open = !this.collapsed.has(k);
                tb.appendChild(h("tr", { class: "dbi-group", onclick: (e: Event) => { e.stopPropagation(); if (open) { this.collapsed.add(k); } else { this.collapsed.delete(k); } ctx.redraw(); } },
                    ...visible.map((d, i) => { const v = sums(rs)[i]; return h("td", { class: v === null ? "" : "num" }, i === 0 ? (open ? "\u25BE " : "\u25B8 ") + k + " (" + rs.length + ")" : v === null ? "" : fmtNum(v)); })));
                if (open) { rs.forEach(r => { if (shown < this.limit) { tb.appendChild(dataRow(r)); shown++; } }); }
            });
        } else { rows.slice(0, this.limit).forEach(r => { tb.appendChild(dataRow(r)); shown++; }); }
        if (ctx.get("table", "showTotals") && numeric.length) { tb.appendChild(totalRow("Total", rows, "dbi-total")); }
        ctx.body.appendChild(h("div", { class: "dbi-rowcount" }, rows.length.toLocaleString("en-US") + " rows"));
        ctx.body.appendChild(tbl);
        if (!rows.length) { ctx.body.appendChild(h("div", { class: "dbi-empty" }, "No rows match your search or filters.")); }
        if (rows.length > this.limit && !groupCol) {
            ctx.body.appendChild(h("p", { class: "dbi-note" }, "Showing " + shown + " of " + rows.length.toLocaleString("en-US") + " rows. ",
                h("button", { class: "dbi-btn dbi-btn--ghost", type: "button", onclick: (e: Event) => { e.stopPropagation(); this.limit += pageSize; ctx.redraw(); } }, "Show more")));
        }
    }

    // ------------------------------------------------------------------ pivot (same behaviour as MUST Tables)
    private renderPivot(ctx: Ctx, rows: number[], visible: ColDef[]): void {
        const td = ctx.td; const dims = visible.filter(d => !d.numeric); const measures = visible.filter(d => d.numeric); const piv = this.state.pivot;
        const pick = (want: string | undefined, list: ColDef[], fallback: ColDef | undefined) => (list.filter(d => d.key === want)[0] || fallback);
        const rowDef = pick(piv.rowField, dims, dims[0]), colDef = pick(piv.columnField, dims, dims[1] || dims[0]), valDef = pick(piv.valueField, measures, measures[0]);
        const sel = (label: string, list: ColDef[], cur: ColDef | undefined, key: "rowField" | "columnField" | "valueField") => h("label", { class: "dbi-pivot-field" }, h("span", null, label),
            (() => { const s = h("select", { class: "dbi-select", "aria-label": label, onchange: (e: Event) => this.commit({ pivot: { ...piv, [key]: (e.target as HTMLSelectElement).value } }) },
                ...(list.length ? list.map(d => h("option", { value: d.key, selected: !!cur && d.key === cur.key }, d.label)) : [h("option", { value: "" }, "No compatible fields")])) as HTMLSelectElement; if (cur) { s.value = cur.key; } return s; })());
        const aggSel = h("label", { class: "dbi-pivot-field" }, h("span", null, "Aggregation"),
            (() => { const s = h("select", { class: "dbi-select", "aria-label": "Aggregation", onchange: (e: Event) => this.commit({ pivot: { ...piv, aggregation: (e.target as HTMLSelectElement).value as PivotAggregation } }) },
                ...([["sum", "Sum"], ["avg", "Average"], ["min", "Min"], ["max", "Max"], ["count", "Count"]] as [string, string][]).map(o => h("option", { value: o[0], selected: o[0] === piv.aggregation }, o[1]))) as HTMLSelectElement; s.value = piv.aggregation; return s; })());
        const ready = !!(rowDef && colDef && valDef);
        ctx.body.appendChild(h("section", { class: "dbi-pivot-config" }, h("strong", null, "Pivot configuration"), h("p", null, "Build a row grouped matrix with an optional aggregation on the value field."),
            h("div", { class: "dbi-pivot-grid" }, sel("ROW GROUPS", dims, rowDef, "rowField"), sel("COLUMN LABELS", dims, colDef, "columnField"), sel("VALUES", measures, valDef, "valueField"), aggSel),
            ready ? null : h("small", null, "Add at least one dimension and one measure to use Pivot mode.")));
        if (!ready) { ctx.body.appendChild(h("div", { class: "dbi-pivot-empty" }, "Add at least one dimension and one measure to use Pivot mode.")); return; }
        const input = rows.map(r => ({ [rowDef.key]: cellText(td, rowDef, this.virt, r), [colDef.key]: cellText(td, colDef, this.virt, r), [valDef.key]: rawValue(td, valDef, this.virt, r) }));
        const res = pivotRows(input, rowDef.key, colDef.key, valDef.key, piv.aggregation);
        const showRowT = !!ctx.get("table", "pivotRowTotals"), showColT = !!ctx.get("table", "pivotColumnTotals"), showGrand = !!ctx.get("table", "pivotGrandTotal");
        const empty = String(ctx.get("table", "pivotEmpty")) === "dash" ? "\u2013" : String(ctx.get("table", "pivotEmpty")) === "zero" ? "0" : "";
        const MAXC = 60; const cols = res.columns.slice(0, MAXC + 1);
        const tbl = h("table", { class: "dbi-table dbi-pivot-table" });
        tbl.appendChild(h("thead", null, h("tr", null, ...cols.map((c, i) => h("th", { class: i ? "num" : "" }, c)), showRowT ? h("th", { class: "num" }, "Total") : null)));
        const tb = h("tbody"); tbl.appendChild(tb);
        res.rows.forEach(row => {
            tb.appendChild(h("tr", null, ...cols.map((c, i) => i === 0 ? h("td", null, String(row[c])) : h("td", { class: "num" }, res.emptyCells[row[rowDef.key] + "\u241F" + c] ? empty : fmtNum(row[c]))),
                showRowT ? h("td", { class: "num dbi-pivot-total" }, fmtNum(res.rowTotals[row[rowDef.key]])) : null));
        });
        if (showColT) {
            tb.appendChild(h("tr", { class: "dbi-total" }, ...cols.map((c, i) => i === 0 ? h("td", null, "Total") : h("td", { class: "num" }, fmtNum(res.columnTotals[c]))),
                showRowT && showGrand ? h("td", { class: "num" }, fmtNum(res.grandTotal)) : (showRowT ? h("td", null) : null)));
        }
        ctx.body.appendChild(tbl);
        if (!res.rows.length) { ctx.body.appendChild(h("div", { class: "dbi-empty" }, "No data for this pivot.")); }
        if (res.columns.length > MAXC + 1) { ctx.body.appendChild(h("p", { class: "dbi-note" }, "Showing the first " + MAXC + " column labels of " + (res.columns.length - 1) + ".")); }
    }

    // ------------------------------------------------------------------ settings drawer extras (Filters tab, columns, rules, calculations)
    settingsTabs(): { id: string; label: string; title: string; help: string; after: string }[] {
        return [{ id: "filters", label: "Filters", title: "Filters", help: "Filter table values live, per column. Click a column to set or change its filter.", after: "display" }];
    }
    private host(api: RendererSettingsApi): S.TableHost {
        return { state: () => this.state, defs: () => this.defs, td: () => api.td, virt: () => this.virt, commit: p => this.commit(p), clearSelection: () => api.clearSelection(),
            openFilter: () => this.openFilterKey, setOpenFilter: k => { this.openFilterKey = k; } };
    }
    settingsSections(tab: string, api: RendererSettingsApi): HTMLElement[] {
        const H = this.host(api);
        if (tab === "layout") { return S.layoutSection(H); }
        if (tab === "display") { return S.displaySections(H); }
        if (tab === "filters") { return S.filtersSections(H); }
        if (tab === "styling") { return S.stylingSections(H); }
        if (tab === "analysis") { return S.analysisSections(H); }
        return [];
    }
    layoutState(): any { return this.state; }
    applyLayoutState(s: any, api: RendererSettingsApi): void { this.state = parseState(JSON.stringify(s || {})); const j = JSON.stringify(this.state); this.saved = j; api.persist("tablestate", "state", j); }
}
