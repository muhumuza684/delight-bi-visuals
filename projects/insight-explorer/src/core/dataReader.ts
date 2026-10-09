import powerbi from "powerbi-visuals-api";
import { toDate, fmtNum, fmtDate } from "./format";

export interface Col {
    index: number; displayName: string; queryName: string;
    isMeasure: boolean; isDate: boolean; isNumeric: boolean; format?: string; roles: string[];
}

/** Role-aware view over a Power BI table dataView. Visuals read by ROLE, never by position. */
export class TableData {
    cols: Col[] = [];
    rows: any[][];
    byRole: Record<string, Col[]> = {};
    constructor(public table: powerbi.DataViewTable) {
        this.rows = table.rows || [];
        (table.columns || []).forEach((c: any, i: number) => {
            const roles = Object.keys(c.roles || {}).filter(k => c.roles[k]);
            const col: Col = {
                index: c.index !== undefined ? c.index : i,
                displayName: c.displayName || c.queryName || "Field " + (i + 1),
                queryName: c.queryName || c.displayName || "",
                isMeasure: !!c.isMeasure,
                isDate: !!(c.type && c.type.dateTime),
                isNumeric: !!(c.type && (c.type.numeric || c.type.integer)),
                format: c.format, roles
            };
            this.cols.push(col);
            roles.forEach(r => { (this.byRole[r] = this.byRole[r] || []).push(col); });
        });
    }
    get n(): number { return this.rows.length; }
    has(role: string): boolean { return !!(this.byRole[role] && this.byRole[role].length); }
    list(role: string): Col[] { return this.byRole[role] || []; }
    col(role: string, i = 0): Col | undefined { return this.list(role)[i]; }
    label(role: string, i = 0): string { const c = this.col(role, i); return c ? c.displayName : role; }
    val(r: number, role: string, i = 0): any {
        const c = this.col(role, i); return c ? this.rows[r][c.index] : undefined;
    }
    num(r: number, role: string, i = 0): number | null {
        const v = this.val(r, role, i);
        if (v === null || v === undefined || v === "") { return null; }
        const n = typeof v === "number" ? v : Number(v);
        return isNaN(n) ? null : n;
    }
    date(r: number, role: string, i = 0): Date | null { return toDate(this.val(r, role, i)); }
    str(r: number, role: string, i = 0): string {
        const c = this.col(role, i); if (!c) { return ""; }
        return this.cell(r, c);
    }
    cell(r: number, c: Col): string {
        const v = this.rows[r][c.index];
        if (v === null || v === undefined) { return ""; }
        if (v instanceof Date) { return fmtDate(v); }
        if (typeof v === "number") { return c.isMeasure || c.isNumeric ? fmtNum(v, c.format) : String(v); }
        return String(v);
    }
    fmt(role: string, v: number | null, i = 0): string { const c = this.col(role, i); return fmtNum(v, c ? c.format : undefined); }
}

export function readTable(dv: powerbi.DataView | undefined): TableData | null {
    if (!dv || !dv.table || !dv.table.columns || dv.table.columns.length === 0) { return null; }
    return new TableData(dv.table);
}
