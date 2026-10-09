import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { h, s, clear } from "./dom";
import { BRAND } from "./brand";
import { VisualSpec, settingsModelFor, readSetting, readObject, allObjects, propDefault } from "./spec";
import { TableData, readTable } from "./dataReader";
import { buildLanding, buildGuidance, buildPanel, buildWelcome, brandMark, initials, PanelTab } from "./landing";
import { buildSettingsPanel, SettingsTab, NamedLayout } from "./settingsUi";
import { THEME_TOKENS, DEFAULT_ACCENT } from "./theme";
import { Sample, sampleTable } from "./sample";
import { clamp, PALETTE } from "./format";

import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionId = powerbi.visuals.ISelectionId;

export interface TipItem { displayName: string; value: string }

/** Everything a renderer needs. Renderers never touch the host directly. */
export interface Ctx {
    spec: VisualSpec; td: TableData; body: HTMLElement; tools: HTMLElement;
    w: number; h: number; accent: string; palette: string[];
    get(obj: string, prop: string): any;
    mark(el: Element, rows: number[]): void;
    select(rows: number[], multi: boolean): void;
    isSelected(row: number): boolean;
    anySelected(): boolean;
    tipItems(row: number): TipItem[];
    showTip(e: MouseEvent, items: TipItem[], rows?: number[]): void;
    hideTip(): void;
    persist(obj: string, prop: string, value: any): void;
    applyFilter(filter: any | null): void;
    jsonFilters: any[];
    stored(obj: string, prop: string, fallback: any): any;
    redraw(): void;
}
/** What a visual can do with the shared Settings drawer. */
export interface RendererSettingsApi { td: TableData; accent: string; persist(obj: string, prop: string, value: any): void; redraw(): void; clearSelection(): void }
export interface Renderer {
    render(ctx: Ctx): void;
    /** Extra tabs, inserted after the tab named in `after`. */
    settingsTabs?(): { id: string; label: string; title: string; help: string; after: string }[];
    /** Extra cards for a tab (also used for the extra tabs above). */
    settingsSections?(tab: string, api: RendererSettingsApi): HTMLElement[];
    /** Visual-specific state captured in (and restored from) a named layout. */
    layoutState?(): any;
    applyLayoutState?(state: any, api: RendererSettingsApi): void;
}

function tuneIcon(): Element {
    return s("svg", { viewBox: "0 0 16 16", width: "14", height: "14", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round" },
        s("line", { x1: 2, y1: 4, x2: 14, y2: 4 }), s("line", { x1: 2, y1: 8, x2: 14, y2: 8 }), s("line", { x1: 2, y1: 12, x2: 14, y2: 12 }),
        s("circle", { cx: 5, cy: 4, r: 1.6, fill: "currentColor" }), s("circle", { cx: 11, cy: 8, r: 1.6, fill: "currentColor" }), s("circle", { cx: 6.5, cy: 12, r: 1.6, fill: "currentColor" }));
}

export class BaseVisual implements IVisual {
    protected host: powerbi.extensibility.visual.IVisualHost;
    protected root: HTMLElement;
    private fss = new FormattingSettingsService();
    private SettingsClass: new () => any;
    private settingsModel: any;
    private selectionManager: powerbi.extensibility.ISelectionManager;
    private lastOptions: VisualUpdateOptions | undefined;
    private td: TableData | null = null;
    private idCache: ISelectionId[] = [];
    private selKeys = new Set<string>();
    private panel: PanelTab | null = null;
    private settingsTab: SettingsTab | null = null;
    private dv: powerbi.DataView | undefined;

    constructor(options: VisualConstructorOptions, protected spec: VisualSpec, protected makeRenderer: () => Renderer, protected sample?: Sample) {
        this.host = options.host;
        this.SettingsClass = settingsModelFor(spec);
        this.settingsModel = new this.SettingsClass();
        this.root = h("div", { class: "dbi-root", tabindex: "-1" });
        options.element.appendChild(this.root);
        this.renderer = makeRenderer();
        this.selectionManager = this.host.createSelectionManager();
        this.selectionManager.registerOnSelectCallback(() => this.redraw());
        this.root.addEventListener("click", (e: Event) => {
            const t = e.target as HTMLElement;
            if (t.closest && !t.closest("[data-rows],button,input,select,label,a,summary,details,.dbi-drawer,.dbi-welcome")) { this.clearSelection(); }
        });
        this.root.addEventListener("contextmenu", (e: MouseEvent) => {
            const t = (e.target as HTMLElement).closest ? (e.target as HTMLElement).closest("[data-rows]") : null;
            const rows = t ? String(t.getAttribute("data-rows")).split(",").filter(x => x !== "").map(Number) : [];
            this.selectionManager.showContextMenu(rows.length ? this.idFor(rows[0]) : ({} as any), { x: e.clientX, y: e.clientY });
            e.preventDefault();
        });
    }
    protected renderer: Renderer;

    public update(options: VisualUpdateOptions): void { this.lastOptions = options; this.draw(options); }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.fss.buildFormattingModel(this.settingsModel);
    }

    private redraw(): void { if (this.lastOptions) { this.draw(this.lastOptions); } }

    private clearSelection(): void {
        if (this.selectionManager.getSelectionIds().length) { this.selectionManager.clear().then(() => this.redraw()); }
    }

    private idFor(row: number): ISelectionId {
        if (!this.idCache[row]) {
            this.idCache[row] = this.host.createSelectionIdBuilder().withTable(this.td.table, row).createSelectionId();
        }
        return this.idCache[row];
    }

    private openPanel = (t: PanelTab = "guide"): void => { this.panel = t; this.settingsTab = null; this.redraw(); };
    private closePanel = (): void => { this.panel = null; this.redraw(); };
    private openSettings = (t: SettingsTab = "layout"): void => { this.settingsTab = t; this.panel = null; this.redraw(); };
    private closeSettings = (): void => { this.settingsTab = null; this.redraw(); };

    private shapeValue(obj: string, prop: string, value: any): any {
        const o = allObjects(this.spec).filter(x => x.name === obj)[0];
        const p = o && o.properties.filter(x => x.name === prop)[0];
        if (p && p.type === "color") { return { solid: { color: String(value) } }; }
        if (p && p.type === "numeric") { return Number(value); }
        return value;
    }
    /** Saves settings into the report (they also appear in the Format pane). One call can change several objects at once. */
    private setMany(entries: { obj: string; prop: string; value: any }[]): void {
        const by: Record<string, Record<string, any>> = {};
        entries.forEach(e => { (by[e.obj] = by[e.obj] || {})[e.prop] = this.shapeValue(e.obj, e.prop, e.value); });
        this.host.persistProperties({ merge: Object.keys(by).map(o => ({ objectName: o, selector: undefined as any, properties: by[o] })) } as any);
    }
    private persistSetting(obj: string, prop: string, value: any): void { this.setMany([{ obj, prop, value }]); }

    private readLayouts(): NamedLayout[] {
        try { const v = JSON.parse(String(readObject(this.dv, "views", "layouts", "[]"))); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    private visibleProps(): { obj: string; p: any }[] {
        const out: { obj: string; p: any }[] = [];
        allObjects(this.spec).forEach(o => o.properties.filter(p => !p.hidden).forEach(p => out.push({ obj: o.name, p })));
        return out;
    }
    private resetProps(tab: "layout" | "display" | "styling" | "all"): void {
        this.setMany(this.visibleProps().filter(x => tab === "all" || (x.p.tab || "display") === tab).map(x => ({ obj: x.obj, prop: x.p.name, value: x.p.default })));
    }

    private async exportJson(): Promise<string> {
        const td = this.td; if (!td) { return "Nothing to download yet."; }
        const rows = td.rows.map(r => { const o: Record<string, any> = {}; td.cols.forEach(c => { const v = r[c.index]; o[c.displayName] = v instanceof Date ? v.toISOString().slice(0, 10) : v; }); return o; });
        return this.download(JSON.stringify(rows, null, 2), this.spec.slug + "-export.json", "application/json", this.spec.displayName + " JSON export");
    }

    /** Sends content through Power BI's governed download API (with a plain-browser fallback outside Power BI). */
    private async download(content: string, name: string, type: string, description: string): Promise<string> {
        const svc: any = (this.host as any).downloadService;
        if (svc && typeof svc.exportVisualsContentExtended === "function") {
            try {
                const st = await svc.exportStatus();
                if (st !== 0) { return "Downloads are not allowed for this report (check the report or tenant export setting)."; }
                const r = await svc.exportVisualsContentExtended(content, name, type, description);
                return r && r.downloadCompleted ? "Download complete." : "Download was cancelled.";
            } catch (e) { return "Power BI could not complete the download."; }
        }
        try {
            const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 10000); return "Download started.";
        } catch (e) { return "Downloads are not available in this environment."; }
    }

    /** CSV of the data the visual is drawing, through Power BI's governed download API (with a plain-browser fallback). */
    private async exportCsv(): Promise<string> {
        const td = this.td; if (!td) { return "Nothing to download yet."; }
        const q = (v: any) => { const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v); return /[",\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s; };
        const csv = [td.cols.map(c => q(c.displayName)).join(",")].concat(td.rows.map(r => td.cols.map(c => q(r[c.index])).join(","))).join("\n");
        return this.download(csv, this.spec.slug + "-export.csv", "text/csv", this.spec.displayName + " CSV export");
    }

    private draw(options: VisualUpdateOptions): void {
        const events = this.host.eventService;
        events.renderingStarted(options);
        try {
            this.dv = options.dataViews && options.dataViews[0];
            try { this.settingsModel = this.fss.populateFormattingSettingsModel(this.SettingsClass, this.dv); }
            catch (e) { this.settingsModel = new this.SettingsClass(); }
            const get = (o: string, p: string) => readSetting(this.settingsModel, this.spec, o, p);

            const vp = options.viewport || { width: 600, height: 400 };
            const root = this.root;
            clear(root);
            const preset = String(get("theme", "preset")); const tk = THEME_TOKENS[preset] || THEME_TOKENS.luxe;
            const userAccent = String(get("theme", "accent"));
            const custom = userAccent.toLowerCase() !== DEFAULT_ACCENT.toLowerCase();
            const accent = custom ? userAccent : tk.accent;
            root.setAttribute("data-theme", preset);
            root.setAttribute("data-density", String(get("theme", "density")));
            root.setAttribute("data-size", vp.width < 460 || vp.height < 280 ? "sm" : vp.width < 800 ? "md" : "lg");
            root.style.width = vp.width + "px"; root.style.height = vp.height + "px";
            root.style.setProperty("--accent", accent); root.style.setProperty("--dbi-accent", accent);
            root.style.setProperty("--th-from", custom ? accent : tk.from); root.style.setProperty("--th-to", custom ? accent : tk.to);
            root.style.setProperty("--th-ink", custom ? "#FFFFFF" : tk.ink); root.style.setProperty("--alt", tk.alt);
            root.style.setProperty("--bar-a", tk.barA); root.style.setProperty("--bar-b", custom ? accent : tk.barB);
            const rowPx = clamp(Number(get("general", "rowHeight")) || 34, 22, 64) * (String(get("theme", "density")) === "compact" ? 0.8 : 1);
            root.style.setProperty("--row", rowPx.toFixed(1) + "px");
            const scale = clamp(Math.min(vp.width / 560, vp.height / 360), 0.85, 1.35);
            root.style.fontSize = (clamp(Number(get("general", "fontSize")) || 12, 8, 28) * scale).toFixed(2) + "px";

            this.td = readTable(this.dv);
            this.idCache = []; this.selKeys = new Set<string>();

            if (!this.td) {
                const L = buildLanding(this.spec, this.openPanel);
                root.appendChild(L.el);
                this.renderPreview(L.preview, L.tools, vp);
            } else if (this.spec.roles.some(r => r.required && !this.td.has(r.name)) || (!!this.spec.anyOf && !this.spec.anyOf.some(set => set.every(r => this.td.has(r))))) {
                root.appendChild(buildGuidance(this.spec, this.td, this.openPanel));
            } else {
                this.selectionManager.getSelectionIds().forEach((i: any) => this.selKeys.add(i.getKey()));
                this.drawData(vp, get, accent);
            }
            if (this.panel) {
                const d = buildPanel(this.spec, this.panel, {
                    close: this.closePanel, setTab: (tb) => this.openPanel(tb),
                    launch: (u) => { try { this.host.launchUrl(u); } catch (e) { /* host may block */ } }
                });
                root.appendChild(d);
                if (d.focus) { d.focus(); }
            }
            if (this.settingsTab && this.td) {
                const td = this.td; const layouts = this.readLayouts();
                const rApi: RendererSettingsApi = { td, accent: String(get("theme", "accent")), persist: (o, pr, v) => this.persistSetting(o, pr, v), redraw: () => this.redraw(), clearSelection: () => this.clearSelection() };
                const d = buildSettingsPanel(this.spec, this.settingsTab, {
                    close: this.closeSettings, setTab: (tb) => this.openSettings(tb),
                    groups: allObjects(this.spec), get, set: (o, p, v) => this.persistSetting(o, p, v),
                    layouts,
                    saveLayout: (name) => {
                        const values: Record<string, any> = {}; this.visibleProps().forEach(x => { values[x.obj + "." + x.p.name] = get(x.obj, x.p.name); });
                        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "layout";
                        const extra = this.renderer.layoutState ? this.renderer.layoutState() : undefined;
                        const next = layouts.filter(l => l.id !== id).concat([{ id, name, values, extra }]);
                        this.persistSetting("views", "layouts", JSON.stringify(next));
                    },
                    applyLayout: (id) => {
                        const l = layouts.filter(x => x.id === id)[0]; if (!l) { return; }
                        this.setMany(Object.keys(l.values).map(k => ({ obj: k.split(".")[0], prop: k.split(".")[1], value: l.values[k] })));
                        if (l.extra !== undefined && this.renderer.applyLayoutState) { this.renderer.applyLayoutState(l.extra, rApi); }
                    },
                    removeLayout: (id) => this.persistSetting("views", "layouts", JSON.stringify(layouts.filter(l => l.id !== id))),
                    resetTab: (tb) => this.resetProps(tb), resetAll: () => this.resetProps("all"),
                    exportCsv: () => this.exportCsv(), exportJson: () => this.exportJson(),
                    extraTabs: this.renderer.settingsTabs ? this.renderer.settingsTabs() : [],
                    extra: (tb) => this.renderer.settingsSections ? this.renderer.settingsSections(tb, rApi) : [],
                    fields: this.spec.roles.map(r => ({ role: r.name, displayName: r.displayName, required: !!r.required, columns: td.list(r.name).map(c => c.displayName) })),
                    rows: td.n
                });
                root.appendChild(d);
                if (d.focus) { d.focus(); }
            }
            events.renderingFinished(options);
        } catch (err) {
            const msg = err && (err as Error).message ? (err as Error).message : String(err);
            clear(this.root);
            this.root.appendChild(h("div", { class: "dbi-error", role: "alert" },
                h("b", null, "This visual hit a problem while drawing."), h("p", null, msg)));
            events.renderingFailed(options, msg);
        }
    }

    /** Draws the landing-page preview with the REAL renderer and bundled sample data, so each visual previews what it actually does. */
    private renderPreview(wrap: HTMLElement, tools: HTMLElement, vp: { width: number; height: number }): void {
        if (!this.sample) { wrap.appendChild(h("div", { class: "dbi-empty" }, "Add fields to begin.")); return; }
        try {
            const td = new TableData(sampleTable(this.sample));
            const r = wrap.getBoundingClientRect();
            const noop = (): void => undefined;
            const ctx: Ctx = {
                spec: this.spec, td, body: wrap, tools, w: Math.max(200, r.width || vp.width * 0.5), h: Math.max(120, r.height || vp.height * 0.45),
                accent: String(readSetting(this.settingsModel, this.spec, "theme", "accent")), palette: PALETTE, jsonFilters: [],
                get: (o, p) => propDefault(this.spec, o, p),
                mark: noop, select: noop, isSelected: () => false, anySelected: () => false, tipItems: () => [], showTip: noop, hideTip: noop,
                persist: noop, applyFilter: noop, stored: (o, p, f) => { const v = this.sample && this.sample.stored ? this.sample.stored[o + "." + p] : undefined; return v === undefined ? f : v; }, redraw: noop
            };
            this.makeRenderer().render(ctx);
        } catch (e) { clear(wrap); wrap.appendChild(h("div", { class: "dbi-empty" }, "Preview unavailable.")); }
    }

    private drawData(vp: { width: number; height: number }, get: Ctx["get"], accent: string): void {
        const td = this.td;
        const tools = h("div", { class: "dbi-tools" });
        const body = h("div", { class: "dbi-body" });
        const showHeader = !!get("general", "showHeader") && vp.height >= 150;
        const head = h("header", { class: "dbi-head" + (showHeader ? "" : " dbi-head--min") },
            showHeader ? brandMark(initials(this.spec.displayName)) : null,
            showHeader ? h("span", { class: "dbi-title" }, this.spec.displayName) : null,
            showHeader ? h("span", { class: "dbi-meta" }, td.n.toLocaleString("en-US") + " rows") : null,
            tools,
            h("button", { class: "dbi-icon-btn", type: "button", "aria-label": "Settings", title: "Settings", onclick: (e: Event) => { e.stopPropagation(); this.openSettings("layout"); } }, tuneIcon()),
            showHeader ? h("button", { class: "dbi-icon-btn", type: "button", "aria-label": "About this visual", title: BRAND.name + " - " + BRAND.motto + " · v" + this.spec.version, onclick: (e: Event) => { e.stopPropagation(); this.openPanel("about"); } }, "i") : null);
        const shell = h("div", { class: "dbi-shell" }, head, body);
        this.root.appendChild(shell);
        if (get("general", "showWelcome") && vp.width >= 460 && vp.height >= 280 && !this.panel && !this.settingsTab) {
            this.root.appendChild(buildWelcome(this.spec, () => this.openPanel("about"), () => this.persistSetting("general", "showWelcome", false)));
        }

        const r = body.getBoundingClientRect();
        const w = Math.max(120, r.width || vp.width - 16);
        const hh = Math.max(80, r.height || vp.height - (showHeader ? 52 : 16));
        const self = this;
        const ctx: Ctx = {
            spec: this.spec, td, body, tools, w, h: hh, accent, palette: PALETTE, get,
            jsonFilters: ((this.lastOptions as any).jsonFilters as any[]) || [],
            mark(el, rows) { el.setAttribute("data-rows", rows.join(",")); },
            select(rows, multi) {
                if (!rows.length) { self.clearSelection(); return; }
                self.selectionManager.select(rows.map(i => self.idFor(i)), multi).then(() => self.redraw());
            },
            isSelected(row) { return self.selKeys.size > 0 && self.selKeys.has((self.idFor(row) as any).getKey()); },
            anySelected() { return self.selKeys.size > 0; },
            tipItems(row) { return td.list("tooltips").map(c => ({ displayName: c.displayName, value: td.cell(row, c) })); },
            showTip(e, items, rows) {
                self.host.tooltipService.show({
                    coordinates: [e.clientX, e.clientY], isTouchEvent: false, dataItems: items,
                    identities: (rows || []).slice(0, 50).map(i => self.idFor(i))
                } as any);
            },
            hideTip() { self.host.tooltipService.hide({ immediately: false, isTouchEvent: false } as any); },
            persist(obj, prop, value) { self.host.persistProperties({ merge: [{ objectName: obj, selector: undefined, properties: { [prop]: value } }] } as any); },
            applyFilter(filter) { self.host.applyJsonFilter(filter, "general", "filter", (filter ? 0 : 1) as any); },
            stored(obj, prop, fallback) { return readObject(self.dv, obj, prop, fallback); },
            redraw() { self.redraw(); }
        };
        this.renderer.render(ctx);
    }
}
