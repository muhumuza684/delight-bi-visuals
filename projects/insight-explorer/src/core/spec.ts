import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

/** One spec.json per visual is the single source of truth: capabilities, Format pane,
 *  landing page and field guidance are all derived from it. */
export interface RoleSpec {
    name: string; displayName: string;
    kind: "Grouping" | "Measure" | "GroupingOrMeasure";
    required?: boolean; multiple?: boolean; help: string;
}
export interface PropSpec {
    name: string; displayName: string;
    type: "bool" | "numeric" | "text" | "color" | "enum";
    default: any; options?: { value: string; displayName: string }[];
    hidden?: boolean;
    /** Where the in-visual Settings drawer shows it. Defaults to "display". */
    tab?: "layout" | "display" | "styling";
    min?: number; max?: number; step?: number; help?: string;
}
export interface ObjectSpec { name: string; displayName: string; properties: PropSpec[] }
export interface VisualSpec {
    name: string; slug: string; displayName: string; guid: string; version: string; description: string;
    kicker: string; titleLead: string; titleAccent: string; lede: string;
    roles: RoleSpec[]; objects: ObjectSpec[];
    steps: string[]; faq: { q: string; a: string }[]; highlights: string[];
    /** Optional: the visual draws when ANY of these role sets is fully present (e.g. lat+long, or location). */
    anyOf?: string[][];
}

import COMMON from "./common.json";

/** Objects every visual in the family has (theme, general, saved layouts). Shared with the generator via common.json. */
export const COMMON_OBJECTS: ObjectSpec[] = COMMON as unknown as ObjectSpec[];

export function allObjects(spec: VisualSpec): ObjectSpec[] { return COMMON_OBJECTS.concat(spec.objects || []); }

function makeSlice(p: PropSpec): any {
    const F = formattingSettings;
    switch (p.type) {
        case "bool": return new F.ToggleSwitch({ name: p.name, displayName: p.displayName, value: !!p.default });
        case "numeric": return new F.NumUpDown({ name: p.name, displayName: p.displayName, value: Number(p.default) });
        case "text": return new F.TextInput({ name: p.name, displayName: p.displayName, value: String(p.default), placeholder: "" });
        case "color": return new F.ColorPicker({ name: p.name, displayName: p.displayName, value: { value: String(p.default) } });
        default: {
            const items = (p.options || []).map(o => ({ value: o.value, displayName: o.displayName }));
            return new F.ItemDropdown({ name: p.name, displayName: p.displayName, items, value: items.filter(i => i.value === p.default)[0] || items[0] });
        }
    }
}

class DynCard extends formattingSettings.SimpleCard {
    name: string; displayName: string; slices: any[];
    constructor(name: string, displayName: string, slices: any[]) { super(); this.name = name; this.displayName = displayName; this.slices = slices; }
}

/** Builds the settings-model class the formatting service populates from the dataView. */
export function settingsModelFor(spec: VisualSpec): new () => formattingSettings.Model {
    const objects = allObjects(spec);
    return class extends formattingSettings.Model {
        cards: any[];
        constructor() {
            super();
            this.cards = objects.map(o => new DynCard(o.name, o.displayName, o.properties.filter(p => !p.hidden).map(makeSlice)));
        }
    };
}

export function propDefault(spec: VisualSpec, obj: string, prop: string): any {
    const o = allObjects(spec).filter(x => x.name === obj)[0];
    const p = o && o.properties.filter(x => x.name === prop)[0];
    return p ? p.default : undefined;
}

/** Reads a formatted value (dropdowns/colours unwrapped), falling back to the spec default. */
export function readSetting(model: any, spec: VisualSpec, obj: string, prop: string): any {
    const card = model && model.cards ? model.cards.filter((c: any) => c.name === obj)[0] : null;
    const slice = card ? card.slices.filter((x: any) => x.name === prop)[0] : null;
    let v = slice ? slice.value : undefined;
    if (v && typeof v === "object" && "value" in v) { v = v.value; }
    return v === undefined || v === null || v === "" ? propDefault(spec, obj, prop) : v;
}

export function readObject(dv: powerbi.DataView | undefined, obj: string, prop: string, fallback: any): any {
    const o: any = dv && dv.metadata && dv.metadata.objects ? (dv.metadata.objects as any)[obj] : null;
    return o && o[prop] !== undefined ? o[prop] : fallback;
}

const TYPE_MAP: Record<string, (p: PropSpec) => any> = {
    bool: () => ({ bool: true }), numeric: () => ({ numeric: true }), text: () => ({ text: true }),
    color: () => ({ fill: { solid: { color: true } } }),
    enum: p => ({ enumeration: (p.options || []).map(o => ({ value: o.value, displayName: o.displayName })) })
};

/** Capabilities generated from the spec (used by tools/build-family.mjs and by tests). */
export function buildCapabilities(spec: VisualSpec): any {
    const objects: any = {};
    allObjects(spec).forEach(o => {
        const props: any = {};
        o.properties.forEach(p => { props[p.name] = { displayName: p.displayName, type: TYPE_MAP[p.type](p) }; });
        objects[o.name] = { displayName: o.displayName, properties: props };
    });
    if (spec.slug === "universal-filter") { objects.general.properties.filter = { type: { filter: true } }; }
    const roles: any[] = spec.roles.map(r => ({ name: r.name, displayName: r.displayName, kind: r.kind, description: r.help }));
    roles.push({ name: "tooltips", displayName: "Tooltips", kind: "GroupingOrMeasure", description: "Extra fields shown in the Power BI tooltip." });
    return {
        dataRoles: roles,
        dataViewMappings: [{
            table: {
                rows: {
                    select: roles.map(r => ({ for: { in: r.name } })),
                    dataReductionAlgorithm: { window: { count: 30000 } }
                }
            }
        }],
        objects,
        tooltips: { supportedTypes: { default: true, canvas: true }, roles: ["tooltips"] },
        supportsLandingPage: true, supportsEmptyDataView: true, supportsMultiVisualSelection: true,
        suppressDefaultTitle: true,
        privileges: [{ name: "ExportContent", essential: false }]
    };
}
