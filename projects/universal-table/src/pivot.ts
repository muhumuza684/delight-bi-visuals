import { PivotAggregation } from "./tableState";

export interface PivotResult {
    columns: string[]; rows: Record<string, any>[];
    rowTotals: Record<string, number>; columnTotals: Record<string, number>; grandTotal: number; emptyCells: Record<string, boolean>;
}

function numericValue(v: any): number | null {
    if (v === null || v === undefined || v === "") { return null; }
    const n = typeof v === "number" ? v : Number(v); return isFinite(n) ? n : null;
}

/** Same behaviour as the MUST Tables pivot: row-grouped matrix, one generated column per column label, optional aggregation. */
export function pivotRows(rows: Record<string, any>[], rowField: string, columnField: string, valueField: string, aggregation: PivotAggregation = "sum"): PivotResult {
    const generated = new Set<string>();
    const buckets = new Map<string, Map<string, number[]>>();
    for (const row of rows) {
        const rowKey = String(row[rowField] === null || row[rowField] === undefined ? "(Blank)" : row[rowField]);
        const columnKey = String(row[columnField] === null || row[columnField] === undefined ? "(Blank)" : row[columnField]);
        const rowBucket = buckets.get(rowKey) || new Map<string, number[]>();
        const values = rowBucket.get(columnKey) || [];
        const numeric = numericValue(row[valueField]);
        if (aggregation === "count") { values.push(1); } else if (numeric !== null) { values.push(numeric); }
        rowBucket.set(columnKey, values); buckets.set(rowKey, rowBucket); generated.add(columnKey);
    }
    const aggregate = (values: number[]): number => {
        if (values.length === 0) { return 0; }
        switch (aggregation) {
            case "count": return values.length;
            case "avg": return values.reduce((a, b) => a + b, 0) / values.length;
            case "min": return Math.min(...values);
            case "max": return Math.max(...values);
            default: return values.reduce((a, b) => a + b, 0);
        }
    };
    const generatedColumns = Array.from(generated).sort((a, b) => a.localeCompare(b));
    const suffix = aggregation === "sum" ? "" : " (" + (aggregation === "count" ? "Count" : aggregation.toUpperCase()) + ")";
    const name = (c: string) => valueField + " \u2014 " + c + suffix;
    const columns = [rowField].concat(generatedColumns.map(name));
    const rowTotals: Record<string, number> = {}; const columnTotals: Record<string, number> = {}; const emptyCells: Record<string, boolean> = {}; const all: number[] = [];
    const out = Array.from(buckets.entries()).map(([rowKey, values]) => {
        const o: Record<string, any> = { [rowField]: rowKey }; const rv: number[] = [];
        generatedColumns.forEach(c => {
            const bv = values.get(c) || []; const g = name(c);
            o[g] = aggregate(bv); if (bv.length === 0) { emptyCells[rowKey + "\u241F" + g] = true; }
            rv.push(...bv); all.push(...bv);
        });
        rowTotals[rowKey] = aggregate(rv); return o;
    });
    generatedColumns.forEach(c => { const raw: number[] = []; buckets.forEach(rb => raw.push(...(rb.get(c) || []))); columnTotals[name(c)] = aggregate(raw); });
    return { columns, rows: out, rowTotals, columnTotals, grandTotal: aggregate(all), emptyCells };
}
