import { Ctx, Renderer } from "./core/baseVisual";
import { h } from "./core/dom";
import { fmtNum } from "./core/format";

export interface FieldTarget { table: string; column: string }
export function parseTarget(queryName: string): FieldTarget | null {
    if (!queryName || queryName.indexOf("(") >= 0) { return null; }
    const i = queryName.indexOf("."); if (i < 1) { return null; }
    return { table: queryName.slice(0, i), column: queryName.slice(i + 1) };
}
export function basicFilter(target: FieldTarget, values: any[]): any {
    return { $schema: "https://powerbi.com/product/schema#basic", target, filterType: 1, operator: "In", values };
}

export class UniversalFilterRenderer implements Renderer {
    private sel = new Set<string>(); private sig = ""; private search = "";
    render(ctx: Ctx): void {
        const td = ctx.td; const col = td.col("field"); const target = parseTarget(col.queryName);
        const items = new Map<string, { raw: any; count: number; rows: number[] }>();
        for (let r = 0; r < td.n; r++) {
            const raw = td.val(r, "field"); const k = String(raw === null || raw === undefined ? "(blank)" : raw);
            const it = items.get(k) || { raw, count: 0, rows: [] };
            it.count += td.has("count") ? (td.num(r, "count") || 0) : 1; it.rows.push(r); items.set(k, it);
        }
        const sig = JSON.stringify(ctx.jsonFilters || []);
        if (sig !== this.sig) {
            this.sig = sig; this.sel = new Set<string>();
            (ctx.jsonFilters || []).forEach((f: any) => { if (f && f.operator === "In" && f.target && target && f.target.column === target.column) { (f.values || []).forEach((v: any) => this.sel.add(String(v))); } });
        }
        const single = !!ctx.get("filter", "singleSelect");
        const apply = () => {
            if (!target) { return; }
            if (!this.sel.size) { ctx.applyFilter(null); }
            else { const vals: any[] = []; items.forEach((it, k) => { if (this.sel.has(k)) { vals.push(it.raw); } }); ctx.applyFilter(basicFilter(target, vals)); }
            ctx.redraw();
        };
        const q = this.search.trim().toLowerCase();
        const shown: string[] = []; items.forEach((_, k) => { if (!q || k.toLowerCase().indexOf(q) >= 0) { shown.push(k); } });
        const sortBy = String(ctx.get("filter", "sortBy")); const maxItems = Math.max(50, Number(ctx.get("filter", "maxItems")) || 300);
        if (sortBy === "alpha") { shown.sort((a, b) => a.localeCompare(b)); } else if (sortBy === "count") { shown.sort((a, b) => items.get(b).count - items.get(a).count); }

        if (ctx.get("filter", "showSearch")) {
            const input = h("input", { class: "dbi-input", type: "search", placeholder: "Search " + col.displayName, "aria-label": "Search values", value: this.search,
                oninput: (e: Event) => { this.search = (e.target as HTMLInputElement).value; ctx.redraw(); } }) as HTMLInputElement;
            ctx.tools.appendChild(input);
            if (this.search) { setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 0); }
        }
        ctx.tools.appendChild(h("button", { class: "dbi-btn dbi-btn--ghost", type: "button", onclick: (e: Event) => { e.stopPropagation(); this.sel = new Set<string>(); apply(); } }, "Clear"));
        if (!single) { ctx.tools.appendChild(h("button", { class: "dbi-btn dbi-btn--ghost", type: "button", onclick: (e: Event) => { e.stopPropagation(); shown.forEach(k => this.sel.add(k)); apply(); } }, "Select shown")); }
        if (!target) { ctx.body.appendChild(h("p", { class: "dbi-note" }, "Filtering needs a plain field (not an aggregated measure) in the Field well.")); }

        const max = Math.max(1, ...Array.from(items.values()).map(i => i.count));
        const list = h("div", { class: "dbi-flist", role: "listbox", "aria-multiselectable": String(!single) });
        shown.slice(0, maxItems).forEach(k => {
            const it = items.get(k); const on = this.sel.has(k);
            const toggle = (e: Event) => { e.stopPropagation(); if (single) { const was = on; this.sel = new Set<string>(); if (!was) { this.sel.add(k); } } else if (on) { this.sel.delete(k); } else { this.sel.add(k); } apply(); };
            const cb = h("input", { type: single ? "radio" : "checkbox", checked: on, "aria-label": k, onclick: (e: Event) => e.stopPropagation(), onchange: toggle });
            if (on) { (cb as HTMLInputElement).checked = true; }
            list.appendChild(h("label", { class: "dbi-fitem", role: "option", "aria-selected": String(on), onclick: (e: Event) => e.stopPropagation() }, cb, h("span", null, k),
                ctx.get("filter", "showCounts") ? h("span", { class: "c" }, fmtNum(it.count)) : null,
                ctx.get("filter", "showCounts") ? h("i", { class: "bar", style: { width: (it.count / max * 100) + "%" } }) : null));
        });
        ctx.body.appendChild(list);
        if (!shown.length) { ctx.body.appendChild(h("div", { class: "dbi-empty" }, "No values match.")); }
        if (shown.length > maxItems) { ctx.body.appendChild(h("p", { class: "dbi-note" }, "Showing " + maxItems + " of " + shown.length + " values. Use search or raise Maximum values in Settings.")); }
    }
}
