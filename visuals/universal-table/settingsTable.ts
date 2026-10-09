import { h } from "./core/dom";
import { card } from "./core/settingsUi";
import { TableData } from "./core/dataReader";
import { ColDef, Virtual, cellText, rawValue, filterSummary } from "./tableModel";
import { TableState, ColumnPrefs, WidthMode } from "./tableState";
import { IAnalyticsConditionalRule, AnalyticsRuleOperator, AnalyticsFormatKind, compatibleAnalyticsOperators, inferAnalyticsValueKind } from "./analyticsFormatting";
import { parseCalcFormula } from "./calcEngine";

/** What the Settings sections need from the table renderer. */
export interface TableHost {
    state(): TableState; defs(): ColDef[]; td(): TableData; virt(): Virtual;
    commit(patch: Partial<TableState>): void; clearSelection(): void;
    openFilter(): string | null; setOpenFilter(k: string | null): void;
}

const OP_LABEL: Record<string, string> = { gt: "Greater than", lt: "Less than", equals: "Equals", between: "Between", contains: "Contains", startsWith: "Starts with", endsWith: "Ends with", blank: "Is blank", notBlank: "Is not blank" };
const FORMAT_LABEL: Record<string, string> = { background: "Background", font: "Font colour", dataBar: "Data bar", icon: "Icon" };

function select(options: [string, string][], value: string, label: string, onChange: (v: string) => void): HTMLElement {
    const s = h("select", { class: "dbi-select", "aria-label": label, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) }, ...options.map(o => h("option", { value: o[0], selected: o[0] === value }, o[1]))) as HTMLSelectElement;
    s.value = value; return s;
}
function check(label: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
    const cb = h("input", { type: "checkbox", "aria-label": label, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }) as HTMLInputElement;
    cb.checked = on; if (on) { cb.setAttribute("checked", ""); }
    return h("label", { class: "dbi-check dbi-check--inline" }, cb, h("span", null, label));
}
function btn(text: string, onClick: () => void, cls = ""): HTMLElement { return h("button", { type: "button", class: "dbi-secondary " + cls, onclick: onClick }, text); }
function numInput(label: string, value: number | undefined, onChange: (v: number | undefined) => void): HTMLElement {
    return h("input", { type: "number", class: "dbi-numbox", "aria-label": label, value: value === undefined ? "" : String(value), onchange: (e: Event) => { const v = (e.target as HTMLInputElement).value; onChange(v === "" ? undefined : Number(v)); } });
}

export function layoutSection(H: TableHost): HTMLElement[] {
    return [card("COLUMN LAYOUT", "Reset how wide and in what order the columns appear.",
        btn("Reset column widths", () => { const cols: Record<string, ColumnPrefs> = {}; Object.keys(H.state().cols).forEach(k => { const p = { ...H.state().cols[k] }; delete p.widthMode; delete p.min; delete p.max; cols[k] = p; }); H.commit({ cols }); }),
        btn("Reset column order", () => H.commit({ order: [] })))];
}

export function displaySections(H: TableHost): HTMLElement[] {
    const defs = H.defs(); const st = H.state();
    const setPref = (k: string, patch: ColumnPrefs) => H.commit({ cols: { ...st.cols, [k]: { ...(st.cols[k] || {}), ...patch } } });
    const move = (i: number, d: number) => { const keys = defs.map(x => x.key); const j = i + d; if (j < 0 || j >= keys.length) { return; } const t = keys[i]; keys[i] = keys[j]; keys[j] = t; H.commit({ order: keys }); };
    const show = card("SHOW COLUMNS", "Tick the columns to show; use the arrows to change their order.",
        ...defs.map((d, i) => h("div", { class: "dbi-colrow" },
            check(d.label + (d.kind === "calc" ? " (calculated)" : d.kind === "combo" ? " (combined)" : ""), !(st.cols[d.key] && st.cols[d.key].hidden), v => setPref(d.key, { hidden: !v })),
            h("span", { class: "dbi-colrow__move" }, btn("\u2191", () => move(i, -1), "dbi-secondary--quiet"), btn("\u2193", () => move(i, 1), "dbi-secondary--quiet")))));
    const controls = card("COLUMN CONTROLS", "Widths use bounded calculations: fit-content samples at most 200 loaded values and never measures thousands of cells in the DOM.",
        ...defs.map(d => {
            const p = st.cols[d.key] || {};
            return h("div", { class: "dbi-colctl" }, h("b", null, d.label),
                h("div", { class: "dbi-colctl__row" },
                    select([["auto", "Auto"], ["fit", "Fit content"], ["fill", "Fill available"], ["fixed", "Fixed"], ["custom", "Custom"]], p.widthMode || "auto", "Width mode for " + d.label, v => setPref(d.key, { widthMode: v as WidthMode })),
                    select([["auto", "Auto"], ["left", "Left"], ["center", "Centre"], ["right", "Right"]], p.align || "auto", "Alignment for " + d.label, v => setPref(d.key, { align: v as any })),
                    numInput("Min width for " + d.label, p.min === undefined ? 80 : p.min, v => setPref(d.key, { min: v })),
                    numInput("Max width for " + d.label, p.max === undefined ? 520 : p.max, v => setPref(d.key, { max: v })),
                    check("Sortable", p.sortable !== false, v => setPref(d.key, { sortable: v })),
                    check("Filterable", p.filterable !== false, v => setPref(d.key, { filterable: v }))));
        }));
    return [show, controls];
}

function filterEditor(H: TableHost, d: ColDef): HTMLElement {
    const td = H.td(), virt = H.virt(); const cur = H.state().filters[d.key] || {};
    const set = new Set<string>(cur.values || []);
    const apply = (f: any) => { const filters = { ...H.state().filters }; if (f) { filters[d.key] = f; } else { delete filters[d.key]; } H.setOpenFilter(null); H.commit({ filters }); };
    if (d.numeric) {
        let mn: number | undefined = cur.min, mx: number | undefined = cur.max;
        return h("div", { class: "dbi-filtered" }, h("div", { class: "dbi-colctl__row" }, h("span", null, "Min"), numInput("Minimum", mn, v => { mn = v; }), h("span", null, "Max"), numInput("Maximum", mx, v => { mx = v; })),
            btn("Apply", () => apply(mn === undefined && mx === undefined ? null : { min: mn, max: mx })), btn("Clear", () => apply(null), "dbi-secondary--quiet"));
    }
    const distinct: string[] = []; const seen = new Set<string>();
    for (let r = 0; r < td.n && distinct.length < 120; r++) { const t = cellText(td, d, virt, r); if (!seen.has(t)) { seen.add(t); distinct.push(t); } }
    distinct.sort((a, b) => a.localeCompare(b)); let contains = cur.contains || "";
    return h("div", { class: "dbi-filtered" },
        h("input", { class: "dbi-textbox", type: "text", placeholder: "Contains...", "aria-label": "Contains", value: contains, onchange: (e: Event) => { contains = (e.target as HTMLInputElement).value; } }),
        h("div", { class: "dbi-valuelist" }, ...distinct.map(v => check(v === "" ? "(blank)" : v, set.has(v), on => { if (on) { set.add(v); } else { set.delete(v); } }))),
        btn("Apply", () => apply(!contains && !set.size ? null : { contains: contains || undefined, values: set.size ? Array.from(set) : undefined })), btn("Clear", () => apply(null), "dbi-secondary--quiet"));
}

export function filtersSections(H: TableHost): HTMLElement[] {
    const defs = H.defs().filter(d => (H.state().cols[d.key] || {}).filterable !== false);
    const open = H.openFilter();
    const list = card("COLUMN FILTERS", "Filter table values live, per column. Click a column to set or change its filter.",
        ...defs.map(d => h("div", { class: "dbi-filterrow" },
            h("div", { class: "dbi-filterrow__top" }, h("div", null, h("b", null, d.label), h("small", null, filterSummary(H.state().filters[d.key]))),
                btn(open === d.key ? "Close" : "Set filter", () => { H.setOpenFilter(open === d.key ? null : d.key); H.commit({}); })),
            open === d.key ? filterEditor(H, d) : null)));
    const reset = card("RESET", "Return the table to an unfiltered, unsorted state.",
        btn("Reset sorts", () => H.commit({ sort: null })), btn("Reset filters", () => H.commit({ filters: {} })), btn("Clear selection", () => H.clearSelection()));
    return [list, reset];
}

export function stylingSections(H: TableHost): HTMLElement[] {
    const defs = H.defs(); const st = H.state(); const td = H.td(), virt = H.virt();
    let col = defs[0] ? defs[0].key : ""; let op: AnalyticsRuleOperator = "gt"; let val = ""; let val2 = ""; let fmt: AnalyticsFormatKind = "background"; let scope: "cell" | "row" = "cell"; let color = "#FAF623";
    const kindOf = (k: string) => { const d = defs.filter(x => x.key === k)[0]; if (!d) { return "text" as const; } for (let r = 0; r < Math.min(td.n, 200); r++) { const raw = rawValue(td, d, virt, r); if (raw !== null && raw !== undefined && raw !== "") { return inferAnalyticsValueKind(raw); } } return "blank" as const; };
    const opSel = h("span", null); const rebuildOps = () => { const ops = compatibleAnalyticsOperators(kindOf(col)); if (ops.indexOf(op) < 0) { op = ops[0]; } while (opSel.firstChild) { opSel.removeChild(opSel.firstChild); } opSel.appendChild(select(ops.map(o => [o, OP_LABEL[o]] as [string, string]), op, "Operator", v => { op = v as AnalyticsRuleOperator; })); };
    rebuildOps();
    const builder = card("IN-VISUAL FORMATTING", "Create rules that apply immediately to table cells.",
        h("div", { class: "dbi-subtitle" }, "New rule"),
        h("div", { class: "dbi-colctl__row" },
            select(defs.map(d => [d.key, d.label] as [string, string]), col, "Column", v => { col = v; rebuildOps(); }), opSel,
            h("input", { class: "dbi-textbox", type: "text", placeholder: "Value or threshold", "aria-label": "Value or threshold", onchange: (e: Event) => { val = (e.target as HTMLInputElement).value; } }),
            h("input", { class: "dbi-textbox", type: "text", placeholder: "and (between)", "aria-label": "Second value", onchange: (e: Event) => { val2 = (e.target as HTMLInputElement).value; } }),
            select(Object.keys(FORMAT_LABEL).map(k => [k, FORMAT_LABEL[k]] as [string, string]), fmt, "Format", v => { fmt = v as AnalyticsFormatKind; }),
            select([["cell", "Cell"], ["row", "Row"]], scope, "Scope", v => { scope = v as "cell" | "row"; }),
            h("input", { type: "color", class: "dbi-colorinput", value: color, "aria-label": "Rule colour", onchange: (e: Event) => { color = (e.target as HTMLInputElement).value; } })),
        btn("Add rule", () => {
            if (!col) { return; } const needsValue = op !== "blank" && op !== "notBlank"; if (needsValue && !val) { return; }
            const rule: IAnalyticsConditionalRule = { column: col, operator: op, value: needsValue ? val : undefined, secondValue: op === "between" ? val2 : undefined, color, scope: fmt === "background" ? scope : "cell", format: fmt, icon: "up" };
            H.commit({ rules: st.rules.concat([rule]) });
        }));
    const active = card("ACTIVE RULES (" + st.rules.length + ")", st.rules.length ? null : "No active rules yet.",
        ...st.rules.map((r, i) => h("div", { class: "dbi-rule" }, h("i", { style: { background: r.color } }),
            h("span", null, r.column + " " + (OP_LABEL[r.operator] || r.operator).toLowerCase() + (r.value ? " " + r.value : "") + (r.secondValue ? " and " + r.secondValue : "") + " \u2192 " + (FORMAT_LABEL[r.format || "background"] || "").toLowerCase() + (r.scope === "row" ? " (row)" : "")),
            btn("Remove", () => H.commit({ rules: st.rules.filter((_, j) => j !== i) }), "dbi-secondary--quiet"))));
    const colors = card("COLUMN COLORS", "Give a column's header its own colour.",
        ...defs.map(d => h("div", { class: "dbi-colrow" }, h("span", null, d.label),
            h("span", { class: "dbi-colrow__move" }, h("input", { type: "color", class: "dbi-colorinput", value: (st.cols[d.key] && st.cols[d.key].color) || "#104F9F", "aria-label": "Colour for " + d.label, onchange: (e: Event) => H.commit({ cols: { ...st.cols, [d.key]: { ...(st.cols[d.key] || {}), color: (e.target as HTMLInputElement).value } } }) }),
                btn("Reset", () => { const p = { ...(st.cols[d.key] || {}) }; delete p.color; H.commit({ cols: { ...st.cols, [d.key]: p } }); }, "dbi-secondary--quiet")))));
    return [builder, active, colors];
}

export function analysisSections(H: TableHost): HTMLElement[] {
    const st = H.state(); const defs = H.defs();
    let name = "", formula = ""; const err = h("p", { class: "dbi-card__help dbi-error-text", role: "alert" });
    const calc = card("CALCULATIONS", "Add a column computed from other columns, e.g. [AmountPaid] / [AmountDue] * 100. Functions: SUM, AVG, MIN, MAX, IF, ROUND, ABS.",
        ...st.calcs.map((c, i) => h("div", { class: "dbi-rule" }, h("span", null, h("b", null, c.name), " = " + c.formula), btn("Remove", () => H.commit({ calcs: st.calcs.filter((_, j) => j !== i) }), "dbi-secondary--quiet"))),
        h("div", { class: "dbi-colctl__row" },
            h("input", { class: "dbi-textbox", type: "text", placeholder: "Column name", "aria-label": "Calculated column name", onchange: (e: Event) => { name = (e.target as HTMLInputElement).value.trim(); } }),
            h("input", { class: "dbi-textbox", type: "text", placeholder: "Formula", "aria-label": "Calculated column formula", onchange: (e: Event) => { formula = (e.target as HTMLInputElement).value.trim(); } })),
        err, btn("+ Add a calculated column", () => {
            if (!name || !formula) { err.textContent = "Enter a name and a formula."; return; }
            if (defs.some(d => d.label.toLowerCase() === name.toLowerCase())) { err.textContent = "A column with that name already exists."; return; }
            const parsed = parseCalcFormula(formula); if (!parsed.ok) { err.textContent = parsed.error || "That formula is not valid."; return; }
            const unknown = (parsed.referencedColumns || []).filter(rc => !defs.some(d => d.label === rc)); if (unknown.length) { err.textContent = "Unknown column: " + unknown[0]; return; }
            H.commit({ calcs: st.calcs.concat([{ name, formula }]) });
        }));
    let cname = "", template = ""; const cerr = h("p", { class: "dbi-card__help dbi-error-text", role: "alert" });
    const combo = card("COMBINED COLUMNS", "Join columns into one with a template, e.g. {TaxpayerName} - {RegionID}.",
        ...st.combos.map((c, i) => h("div", { class: "dbi-rule" }, h("span", null, h("b", null, c.name), " = " + c.template), btn("Remove", () => H.commit({ combos: st.combos.filter((_, j) => j !== i) }), "dbi-secondary--quiet"))),
        h("div", { class: "dbi-colctl__row" },
            h("input", { class: "dbi-textbox", type: "text", placeholder: "Column name", "aria-label": "Combined column name", onchange: (e: Event) => { cname = (e.target as HTMLInputElement).value.trim(); } }),
            h("input", { class: "dbi-textbox", type: "text", placeholder: "Template with {Column} names", "aria-label": "Combined column template", onchange: (e: Event) => { template = (e.target as HTMLInputElement).value.trim(); } })),
        cerr, btn("+ Combine columns", () => {
            if (!cname || !template) { cerr.textContent = "Enter a name and a template."; return; }
            if (defs.some(d => d.label.toLowerCase() === cname.toLowerCase())) { cerr.textContent = "A column with that name already exists."; return; }
            if (!/\{[^}]+\}/.test(template)) { cerr.textContent = "Include at least one {Column}."; return; }
            H.commit({ combos: st.combos.concat([{ name: cname, template }]) });
        }));
    return [calc, combo];
}
