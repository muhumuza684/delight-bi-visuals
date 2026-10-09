import { h } from "./dom";
import { BRAND } from "./brand";
import { VisualSpec, ObjectSpec, PropSpec } from "./spec";
import { PALETTE } from "./format";

export type SettingsTab = string;

export interface NamedLayout { id: string; name: string; values: Record<string, any>; extra?: any }
export interface FieldInfo { role: string; displayName: string; required: boolean; columns: string[] }

export interface SettingsApi {
    close(): void; setTab(t: SettingsTab): void;
    groups: ObjectSpec[];
    get(obj: string, prop: string): any;
    set(obj: string, prop: string, value: any): void;
    layouts: NamedLayout[];
    saveLayout(name: string): void; applyLayout(id: string): void; removeLayout(id: string): void;
    resetTab(tab: "layout" | "display" | "styling"): void; resetAll(): void;
    exportCsv(): Promise<string>; exportJson(): Promise<string>;
    fields: FieldInfo[]; rows: number;
    /** Tabs and sections a visual adds itself (for example the Filters tab of Universal Table). */
    extraTabs: { id: string; label: string; title: string; help: string; after: string }[];
    extra(tab: string): HTMLElement[];
}

/** Visual themes: the same idea as MUST Tables (Default, Slate, Ocean, Forest, Sunrise) plus Midnight and Classic. */
export const THEMES: { value: string; name: string; head: string; bar: string }[] = [
    { value: "luxe", name: "Default", head: "#104F9F", bar: "#96D8E8" }, { value: "slate", name: "Slate", head: "#334155", bar: "#64748B" },
    { value: "ocean", name: "Ocean", head: "#0C4A6E", bar: "#0EA5E9" }, { value: "forest", name: "Forest", head: "#14532D", bar: "#22C55E" },
    { value: "sunrise", name: "Sunrise", head: "#C2410C", bar: "#FB923C" }, { value: "midnight", name: "Midnight", head: "#14304F", bar: "#5BA8FF" },
    { value: "classic", name: "Classic", head: "#5B6E85", bar: "#B9C7D8" }
];

const BASE_TABS: { id: SettingsTab; label: string; title: string; help: (s: VisualSpec) => string }[] = [
    { id: "layout", label: "Layout", title: "Layout", help: () => "Control density, sizing and how the visual fits the available space." },
    { id: "display", label: "Data display", title: "Data display", help: s => "Choose what " + s.displayName + " shows and which fields feed it." },
    { id: "styling", label: "Styling", title: "Styling", help: () => "Visual theme and accent colour." },
    { id: "analysis", label: "Analysis", title: "Analysis & export", help: () => "Saved layouts, governed downloads and resets." }
];

export function card(title: string, help: string | null, ...kids: (HTMLElement | null)[]): HTMLElement {
    return h("section", { class: "dbi-card" }, h("div", { class: "dbi-card__title" }, title), help ? h("p", { class: "dbi-card__help" }, help) : null, ...kids);
}

function rangeRow(p: PropSpec, value: any, onChange: (v: number) => void): HTMLElement {
    const min = p.min !== undefined ? p.min : 0, max = p.max !== undefined ? p.max : 100, step = p.step !== undefined ? p.step : 1;
    const slider = h("input", { type: "range", min, max, step, value: String(value), "aria-label": p.displayName }) as HTMLInputElement;
    const num = h("input", { type: "number", class: "dbi-numbox", min, max, step, value: String(value), "aria-label": p.displayName + " exact value" }) as HTMLInputElement;
    const commit = (raw: string) => { const n = Number(raw); if (!isFinite(n)) { return; } const c = Math.max(min, Math.min(max, n)); slider.value = String(c); num.value = String(c); onChange(c); };
    slider.addEventListener("change", () => commit(slider.value));
    slider.addEventListener("input", () => { num.value = slider.value; });
    num.addEventListener("change", () => commit(num.value));
    return h("div", { class: "dbi-range" }, h("span", null, p.displayName), slider, num);
}
function checkRow(p: PropSpec, value: any, onChange: (v: boolean) => void): HTMLElement {
    const cb = h("input", { type: "checkbox", "aria-label": p.displayName, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }) as HTMLInputElement;
    cb.checked = !!value; if (value) { cb.setAttribute("checked", ""); }
    return h("label", { class: "dbi-check" }, cb, h("span", null, p.displayName));
}
function segRow(p: PropSpec, value: any, onChange: (v: string) => void): HTMLElement {
    return h("div", { class: "dbi-optrow" }, h("span", null, p.displayName),
        h("div", { class: "dbi-seg", role: "group", "aria-label": p.displayName }, ...(p.options || []).map(o => h("button", { type: "button", "aria-pressed": String(o.value === value), onclick: () => onChange(o.value) }, o.displayName))));
}
function numRow(p: PropSpec, value: any, onChange: (v: number) => void): HTMLElement {
    return h("div", { class: "dbi-optrow" }, h("span", null, p.displayName),
        h("input", { class: "dbi-numbox", type: "number", value: String(value), "aria-label": p.displayName, onchange: (e: Event) => onChange(Number((e.target as HTMLInputElement).value)) }));
}
function propRow(p: PropSpec, value: any, onChange: (v: any) => void): HTMLElement | null {
    if (p.hidden) { return null; }
    if (p.type === "bool") { return checkRow(p, value, onChange); }
    if (p.type === "enum") { return segRow(p, value, onChange); }
    if (p.type === "text") { return h("div", { class: "dbi-optrow" }, h("span", null, p.displayName), h("input", { class: "dbi-textbox", type: "text", value: String(value), "aria-label": p.displayName, onchange: (e: Event) => onChange((e.target as HTMLInputElement).value) })); }
    if (p.type === "numeric") { return p.min !== undefined && p.max !== undefined ? rangeRow(p, value, onChange) : numRow(p, value, onChange); }
    return null;
}

function swatches(current: string, onPick: (c: string) => void): HTMLElement {
    return h("div", { class: "dbi-swatches" },
        ...PALETTE.slice(0, 8).map(c => h("button", { type: "button", class: "dbi-swatch" + (c.toLowerCase() === String(current).toLowerCase() ? " is-on" : ""), style: { background: c }, "aria-label": "Accent " + c, onclick: () => onPick(c) })),
        h("input", { type: "color", class: "dbi-colorinput", value: /^#[0-9a-f]{6}$/i.test(String(current)) ? current : "#104F9F", "aria-label": "Custom colour", onchange: (e: Event) => onPick((e.target as HTMLInputElement).value) }));
}

function layoutTab(spec: VisualSpec, api: SettingsApi): HTMLElement[] {
    const input = h("input", { type: "text", maxlength: "80", placeholder: "e.g. Regional review", "aria-label": "New layout name", class: "dbi-textbox" }) as HTMLInputElement;
    const save = () => { const n = input.value.trim(); if (n) { api.saveLayout(n); input.value = ""; } };
    input.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") { save(); } });
    const list = h("div", { class: "dbi-layouts" },
        api.layouts.length ? null : h("p", { class: "dbi-card__help" }, "Save a layout to reuse your theme, density and every option on this visual."),
        ...api.layouts.map(l => h("div", { class: "dbi-layout" },
            h("button", { type: "button", class: "dbi-secondary", title: "Apply " + l.name, onclick: () => api.applyLayout(l.id) }, l.name),
            h("button", { type: "button", class: "dbi-secondary dbi-secondary--quiet", "aria-label": "Remove layout " + l.name, onclick: () => api.removeLayout(l.id) }, "Remove"))));
    const rows = api.groups.reduce((acc: HTMLElement[], g) => acc.concat(g.properties.filter(p => p.tab === "layout").map(p => propRow(p, api.get(g.name, p.name), v => api.set(g.name, p.name, v))).filter(Boolean) as HTMLElement[]), []);
    return [card(spec.displayName.toUpperCase() + " LAYOUT", "Adjust density and sizing without reopening the Format pane.",
        h("div", { class: "dbi-subtitle" }, "Named layouts"),
        h("div", { class: "dbi-createrow" }, input, h("button", { type: "button", class: "dbi-secondary", onclick: save }, "Save layout")),
        list, ...rows,
        h("button", { type: "button", class: "dbi-secondary", onclick: () => api.resetTab("layout") }, "Reset layout")), ...api.extra("layout")];
}

function displayTab(spec: VisualSpec, api: SettingsApi): HTMLElement[] {
    const rows = api.groups.reduce((acc: HTMLElement[], g) => acc.concat(g.properties.filter(p => (p.tab === undefined || p.tab === "display")).map(p => propRow(p, api.get(g.name, p.name), v => api.set(g.name, p.name, v))).filter(Boolean) as HTMLElement[]), []);
    const fields = api.fields.map(f => h("div", { class: "dbi-fieldrow2" },
        h("span", { class: "dbi-fieldrow2__role" }, f.displayName, " ", h("em", { class: f.required ? "is-req" : "" }, f.required ? "Required" : "Optional")),
        h("span", { class: "dbi-fieldrow2__cols" }, f.columns.length ? f.columns.join(", ") : "Not used")));
    return [
        card(spec.displayName.toUpperCase() + " OPTIONS", "Switch parts of the visual on or off and tune how values are shown.", ...(rows.length ? rows : [h("p", { class: "dbi-card__help" }, "This visual has no extra display options.")])),
        ...api.extra("display"),
        card("DATA FIELDS", api.rows.toLocaleString("en-US") + " rows. These fields feed the visual; change them in the Build pane.", h("div", { class: "dbi-fieldlist" }, ...fields))
    ];
}

function stylingTab(spec: VisualSpec, api: SettingsApi): HTMLElement[] {
    const cur = api.get("theme", "preset");
    const gallery = h("div", { class: "dbi-gallery", role: "group", "aria-label": "Visual theme" }, ...THEMES.map(t => h("button", { type: "button", class: "dbi-gal" + (cur === t.value ? " is-on" : ""), "aria-pressed": String(cur === t.value), onclick: () => api.set("theme", "preset", t.value) },
        h("i", { style: "background: linear-gradient(135deg, " + t.head + " 0%, " + t.head + " 55%, " + t.bar + " 55%, " + t.bar + " 100%)" }), h("span", null, t.name))));
    return [
        card("VISUAL THEME (HEADER, CELLS & ACCENT) - PICK ONE", "Applies to headers, bars, chips and highlights across " + spec.displayName + ".", gallery),
        card("ACCENT COLOUR", "Overrides the theme accent. Choose the first swatch to return to the theme colour.", swatches(api.get("theme", "accent"), c => api.set("theme", "accent", c))),
        ...api.extra("styling")
    ];
}

function analysisTab(spec: VisualSpec, api: SettingsApi): HTMLElement[] {
    const status = h("p", { class: "dbi-card__help dbi-status", role: "status" });
    const csv = h("button", { type: "button", class: "dbi-secondary", onclick: () => { status.textContent = "Preparing download..."; api.exportCsv().then(m => { status.textContent = m; }); } }, "Download CSV");
    const json = h("button", { type: "button", class: "dbi-secondary", onclick: () => { status.textContent = "Preparing download..."; api.exportJson().then(m => { status.textContent = m; }); } }, "Download JSON");
    return [
        ...api.extra("analysis"),
        card("DOWNLOAD", "Downloads use Power BI's governed file-download API when available.", csv, json, status),
        card("RESET", "Return " + spec.displayName + " to its defaults. Saved layouts are kept.",
            h("button", { type: "button", class: "dbi-secondary", onclick: () => api.resetTab("display") }, "Reset display options"),
            h("button", { type: "button", class: "dbi-secondary", onclick: () => api.resetTab("styling") }, "Reset styling"),
            h("button", { type: "button", class: "dbi-secondary dbi-secondary--danger", onclick: () => api.resetAll() }, "Reset all settings"))
    ];
}

export function buildSettingsPanel(spec: VisualSpec, tab: SettingsTab, api: SettingsApi): HTMLElement {
    const all: { id: string; label: string; title: string; help: (s: VisualSpec) => string }[] = [];
    BASE_TABS.forEach(b => { all.push(b); api.extraTabs.filter(x => x.after === b.id).forEach(x => all.push({ id: x.id, label: x.label, title: x.title, help: () => x.help })); });
    const TABS = all;
    const t = TABS.filter(x => x.id === tab)[0] || TABS[0]; tab = t.id;
    const body = tab === "display" ? displayTab(spec, api) : tab === "styling" ? stylingTab(spec, api) : tab === "analysis" ? analysisTab(spec, api) : tab === "layout" ? layoutTab(spec, api) : api.extra(tab);
    const el = h("div", { class: "dbi-drawer dbi-drawer--settings", role: "dialog", "aria-modal": "true", "aria-label": spec.displayName + " settings", tabindex: "-1" },
        h("div", { class: "dbi-drawer__panel dbi-drawer__panel--settings" },
            h("header", { class: "dbi-sethead" },
                h("div", null, h("strong", null, spec.displayName + " settings"), h("span", null, "Configure layout, display, styling and report actions.")),
                h("button", { class: "dbi-icon-btn", type: "button", "aria-label": "Close settings", onclick: () => api.close() }, "×")),
            h("div", { class: "dbi-settabs", role: "tablist" }, ...TABS.map(x => h("button", { type: "button", role: "tab", class: "dbi-settab", "aria-selected": String(x.id === tab), onclick: () => api.setTab(x.id) }, x.label))),
            h("div", { class: "dbi-setbody" },
                h("div", { class: "dbi-setheading" }, h("strong", null, t.title), h("span", null, t.help(spec))),
                ...body),
            h("footer", { class: "dbi-setfoot" }, "Built by " + BRAND.name + " · " + BRAND.legal)));
    el.addEventListener("click", (e: Event) => { if (e.target === el) { api.close(); } });
    el.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Escape") { api.close(); } });
    return el;
}
