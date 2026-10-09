import { TableData, Col } from "./core/dataReader";
import { fmtNum, fmtDate } from "./core/format";
import { parseCalcFormula, evaluateCalc } from "./calcEngine";
import { orderCalcColumns } from "./calcDependencyOrder";
import { TableState, ColFilter } from "./tableState";

export interface ColDef { key: string; label: string; kind: "base" | "calc" | "combo"; col?: Col; numeric: boolean }
export type Virtual = Record<string, any[]>;

/** The columns the table shows by default: the fields in Columns and Values (Group by is shown as group headers). */
export function baseDefs(td: TableData): ColDef[] {
    const groupCol = td.col("groupBy");
    let cols = td.cols.filter(c => (c.roles.indexOf("rows") >= 0 || c.roles.indexOf("values") >= 0) && c !== groupCol);
    if (!cols.length) { cols = td.cols.filter(c => c !== groupCol && c.roles.indexOf("tooltips") < 0); }
    return cols.map(c => ({ key: c.displayName, label: c.displayName, kind: "base" as const, col: c, numeric: c.isMeasure || c.isNumeric }));
}

/** Calculated columns use the MUST Tables expression engine (copied as-is); combined columns fill {Column} templates. */
export function computeVirtual(td: TableData, base: ColDef[], state: TableState): Virtual {
    const virt: Virtual = {}; const byLabel: Record<string, ColDef> = {}; base.forEach(d => { byLabel[d.label] = d; });
    const valueOf = (r: number, name: string): any => { if (virt[name]) { return virt[name][r]; } const d = byLabel[name]; return d ? td.rows[r][d.col.index] : undefined; };
    const cache: Record<string, number | null> = {};
    const agg = {
        getAggregate: (fn: "AVG" | "SUM" | "MIN" | "MAX", name: string): number | null => {
            const k = fn + "|" + name; if (k in cache) { return cache[k]; }
            const vals: number[] = []; for (let r = 0; r < td.n; r++) { const v = valueOf(r, name); const n = typeof v === "number" ? v : Number(v); if (v !== null && v !== undefined && v !== "" && isFinite(n)) { vals.push(n); } }
            cache[k] = !vals.length ? null : fn === "SUM" ? vals.reduce((a, b) => a + b, 0) : fn === "AVG" ? vals.reduce((a, b) => a + b, 0) / vals.length : fn === "MIN" ? Math.min(...vals) : Math.max(...vals); return cache[k];
        }
    };
    const parsed = state.calcs.map(c => ({ name: c.name, parsed: parseCalcFormula(c.formula) }));
    const ord = orderCalcColumns(new Map(parsed.map(p => [p.name, { referencedColumns: p.parsed.referencedColumns || [] }] as [string, { referencedColumns: string[] }])));
    ord.order.forEach(name => {
        const d = parsed.filter(p => p.name === name)[0]; if (!d || !d.parsed.ok || !d.parsed.ast) { return; }
        const arr: any[] = new Array(td.n);
        for (let r = 0; r < td.n; r++) { const v = evaluateCalc(d.parsed.ast, { getColumnValue: (nm: string) => valueOf(r, nm) }, agg); arr[r] = typeof v === "boolean" ? (v ? 1 : 0) : v; }
        virt[name] = arr;
    });
    state.combos.forEach(c => {
        const arr: any[] = new Array(td.n);
        for (let r = 0; r < td.n; r++) { arr[r] = c.template.replace(/\{([^}]+)\}/g, (_m: string, ref: string) => { const v = valueOf(r, ref.trim()); return v === null || v === undefined ? "" : v instanceof Date ? fmtDate(v) : String(v); }); }
        virt[c.name] = arr;
    });
    return virt;
}

/** All columns (base, calculated, combined) in the user's order. Hidden ones are included; callers filter them. */
export function buildDefs(td: TableData, state: TableState, virt: Virtual): ColDef[] {
    const defs: ColDef[] = baseDefs(td);
    state.calcs.forEach(c => defs.push({ key: c.name, label: c.name, kind: "calc", numeric: true }));
    state.combos.forEach(c => defs.push({ key: c.name, label: c.name, kind: "combo", numeric: false }));
    const idx = (k: string) => { const i = state.order.indexOf(k); return i < 0 ? 1e6 + defs.findIndex(d => d.key === k) : i; };
    return defs.slice().sort((a, b) => idx(a.key) - idx(b.key));
}

export function rawValue(td: TableData, d: ColDef, virt: Virtual, r: number): any { return d.kind === "base" ? td.rows[r][d.col.index] : (virt[d.key] ? virt[d.key][r] : null); }
export function cellText(td: TableData, d: ColDef, virt: Virtual, r: number): string {
    if (d.kind === "base") { return td.cell(r, d.col); }
    const v = virt[d.key] ? virt[d.key][r] : null; if (v === null || v === undefined) { return ""; }
    return typeof v === "number" ? fmtNum(v) : String(v);
}

export function filterSummary(f: ColFilter | undefined): string {
    if (!f) { return "No filter"; }
    const parts: string[] = [];
    if (f.contains) { parts.push("contains \"" + f.contains + "\""); }
    if (f.values && f.values.length) { parts.push(f.values.length + " value(s)"); }
    if (f.min !== undefined) { parts.push(">= " + f.min); }
    if (f.max !== undefined) { parts.push("<= " + f.max); }
    return parts.length ? parts.join(", ") : "No filter";
}

export function applyFilters(td: TableData, defs: ColDef[], virt: Virtual, rows: number[], filters: Record<string, ColFilter>): number[] {
    const active = defs.filter(d => { const f = filters[d.key]; return f && (f.contains || (f.values && f.values.length) || f.min !== undefined || f.max !== undefined); });
    if (!active.length) { return rows; }
    return rows.filter(r => active.every(d => {
        const f = filters[d.key]; const txt = cellText(td, d, virt, r); const raw = rawValue(td, d, virt, r);
        if (f.contains && txt.toLowerCase().indexOf(f.contains.toLowerCase()) < 0) { return false; }
        if (f.values && f.values.length && f.values.indexOf(txt) < 0) { return false; }
        if (f.min !== undefined || f.max !== undefined) { const n = typeof raw === "number" ? raw : Number(raw); if (!isFinite(n)) { return false; } if (f.min !== undefined && n < f.min) { return false; } if (f.max !== undefined && n > f.max) { return false; } }
        return true;
    }));
}

export function sortRows(td: TableData, d: ColDef, virt: Virtual, rows: number[], dir: 1 | -1): number[] {
    return rows.slice().sort((a, b) => {
        const x = rawValue(td, d, virt, a), y = rawValue(td, d, virt, b);
        if (x === y) { return 0; } if (x === null || x === undefined) { return 1; } if (y === null || y === undefined) { return -1; }
        return (typeof x === "number" && typeof y === "number" ? x - y : x instanceof Date && y instanceof Date ? x.getTime() - y.getTime() : String(x).localeCompare(String(y))) * dir;
    });
}
