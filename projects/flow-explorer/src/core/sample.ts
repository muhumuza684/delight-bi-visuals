import powerbi from "powerbi-visuals-api";

export interface SampleCol { name: string; roles: string[]; type: "text" | "number" | "date"; measure: boolean }
export interface Sample { columns: SampleCol[]; rows: any[][]; stored?: Record<string, string> }

/** Turns the bundled sample data into a dataView table so the REAL renderer can draw the landing-page preview. */
export function sampleTable(s: Sample): powerbi.DataViewTable {
    const columns = s.columns.map((c, i) => {
        const roles: any = {}; c.roles.forEach(r => { roles[r] = true; });
        return { index: i, displayName: c.name, queryName: "Sample." + c.name, roles, isMeasure: c.measure,
            type: c.type === "number" ? { numeric: true } : c.type === "date" ? { dateTime: true } : { text: true } };
    });
    const rows = s.rows.map(r => r.map((v, i) => (s.columns[i].type === "date" ? new Date(v) : v)));
    return { columns, rows } as any;
}
