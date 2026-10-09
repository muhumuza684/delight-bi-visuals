/* Test doubles for the Power BI host and dataView. */
export interface FixtureCol { name: string; roles: string[]; type: "text" | "number" | "date"; measure: boolean }
export interface Fixture { columns: FixtureCol[]; rows: any[][]; expect: string }

export function makeDataView(fx: { columns: FixtureCol[]; rows: any[][] }, dropRoles: string[] = []): any {
    const cols = fx.columns.map((c, i) => ({ c, i })).filter(x => !x.c.roles.some(r => dropRoles.indexOf(r) >= 0));
    const columns = cols.map((x, i) => {
        const roles: any = {}; x.c.roles.forEach(r => { roles[r] = true; });
        return { index: i, displayName: x.c.name, queryName: "Data." + x.c.name, roles, isMeasure: x.c.measure,
            type: x.c.type === "number" ? { numeric: true } : x.c.type === "date" ? { dateTime: true } : { text: true } };
    });
    const rows = fx.rows.map(r => cols.map(x => (x.c.type === "date" ? new Date(r[x.i]) : r[x.i])));
    return { metadata: { columns, objects: {} }, table: { columns, rows } };
}

export function makeHost(): any {
    const selected: any[] = [];
    return {
        eventService: { renderingStarted: jest.fn(), renderingFinished: jest.fn(), renderingFailed: jest.fn() },
        createSelectionManager: () => ({
            select: jest.fn((ids: any) => { selected.splice(0, selected.length, ...[].concat(ids)); return Promise.resolve(selected); }),
            clear: jest.fn(() => { selected.length = 0; return Promise.resolve(); }),
            getSelectionIds: () => selected, registerOnSelectCallback: jest.fn(), showContextMenu: jest.fn()
        }),
        createSelectionIdBuilder: () => {
            let row = -1; const b: any = { withTable: (_t: any, r: number) => { row = r; return b; }, createSelectionId: () => ({ getKey: () => "r" + row, equals: (o: any) => o.getKey() === "r" + row }) };
            return b;
        },
        tooltipService: { show: jest.fn(), hide: jest.fn() },
        persistProperties: jest.fn(), applyJsonFilter: jest.fn(), launchUrl: jest.fn(),
        downloadService: { exportStatus: jest.fn(() => Promise.resolve(0)), exportVisualsContentExtended: jest.fn(() => Promise.resolve({ downloadCompleted: true })) }
    };
}

export function makeOptions(dataView: any | null, w = 800, h = 500): any {
    return { viewport: { width: w, height: h }, dataViews: dataView ? [dataView] : [], type: 2, viewMode: 1 };
}
