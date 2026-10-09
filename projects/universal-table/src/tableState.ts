import { IAnalyticsConditionalRule } from "./analyticsFormatting";

export type PivotAggregation = "sum" | "avg" | "min" | "max" | "count";
export type WidthMode = "auto" | "fit" | "fill" | "fixed" | "custom";

export interface ColumnPrefs { hidden?: boolean; widthMode?: WidthMode; align?: "auto" | "left" | "center" | "right"; min?: number; max?: number; sortable?: boolean; filterable?: boolean; color?: string }
export interface ColFilter { contains?: string; values?: string[]; min?: number; max?: number }
export interface TableState {
    order: string[];
    cols: Record<string, ColumnPrefs>;
    filters: Record<string, ColFilter>;
    rules: IAnalyticsConditionalRule[];
    calcs: { name: string; formula: string }[];
    combos: { name: string; template: string }[];
    pivot: { mode: "table" | "pivot"; rowField?: string; columnField?: string; valueField?: string; aggregation: PivotAggregation };
    sort: { col: string; dir: 1 | -1 } | null;
}

export function defaultState(): TableState {
    return { order: [], cols: {}, filters: {}, rules: [], calcs: [], combos: [], pivot: { mode: "table", aggregation: "sum" }, sort: null };
}

/** Reads the JSON the visual saved in the report; anything malformed falls back to defaults. */
export function parseState(raw: string): TableState {
    const d = defaultState();
    try {
        const v = JSON.parse(raw || "{}");
        return {
            order: Array.isArray(v.order) ? v.order.map(String) : d.order,
            cols: v.cols && typeof v.cols === "object" ? v.cols : d.cols,
            filters: v.filters && typeof v.filters === "object" ? v.filters : d.filters,
            rules: Array.isArray(v.rules) ? v.rules : d.rules,
            calcs: Array.isArray(v.calcs) ? v.calcs.filter((c: any) => c && c.name && c.formula) : d.calcs,
            combos: Array.isArray(v.combos) ? v.combos.filter((c: any) => c && c.name && c.template) : d.combos,
            pivot: v.pivot && typeof v.pivot === "object" ? { mode: v.pivot.mode === "pivot" ? "pivot" : "table", rowField: v.pivot.rowField, columnField: v.pivot.columnField, valueField: v.pivot.valueField, aggregation: ["sum", "avg", "min", "max", "count"].indexOf(v.pivot.aggregation) >= 0 ? v.pivot.aggregation : "sum" } : d.pivot,
            sort: v.sort && v.sort.col ? { col: String(v.sort.col), dir: v.sort.dir === -1 ? -1 : 1 } : null
        };
    } catch (e) { return d; }
}
