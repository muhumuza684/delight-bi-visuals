import { h, s } from "./dom";
import { BRAND } from "./brand";
import { VisualSpec, ObjectSpec, PropSpec } from "./spec";
import { TableData } from "./dataReader";
import { PALETTE } from "./format";

export type PanelTab = "guide" | "faq" | "support" | "about";

export interface PanelApi {
    close(): void; setTab(t: PanelTab): void; launch(url: string): void;
}

/** Two-letter mark from the visual name (Work Planner -> WP), matching the icons in the Visualizations pane. */
export function initials(name: string): string {
    const w = name.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean);
    return ((w[0] || "D").charAt(0) + (w.length > 1 ? w[1].charAt(0) : (w[0] || "I").charAt(1) || "")).toUpperCase();
}

export function brandMark(label: string = BRAND.mark): HTMLElement { return h("span", { class: "dbi-mark", "aria-hidden": "true" }, label); }

/** The VISUAL's name leads (it tells people what the visual does); the company line sits underneath, like MUST Tables. */
export function brandLockup(spec: VisualSpec): HTMLElement {
    const words = spec.displayName.split(" ");
    return h("div", { class: "dbi-brand" }, brandMark(initials(spec.displayName)),
        h("div", { class: "dbi-brand__text" }, h("b", null, words[0] + (words.length > 1 ? " " : ""), words.length > 1 ? h("i", null, words.slice(1).join(" ")) : null),
            h("small", null, BRAND.name + " · " + BRAND.mottoTitle)));
}

function stripes(): Element {
    return s("svg", { class: "dbi-wave", viewBox: "0 0 600 120", preserveAspectRatio: "none", "aria-hidden": "true" },
        s("path", { class: "dbi-wave__a", d: "M0,52 C100,18 200,86 320,50 C440,16 520,50 600,20 L600,120 L0,120 Z" }),
        s("path", { class: "dbi-wave__b", d: "M0,76 C110,46 210,104 330,74 C450,44 530,76 600,50 L600,120 L0,120 Z" }),
        s("path", { class: "dbi-wave__c", d: "M0,92 C120,64 220,114 340,90 C455,66 535,92 600,70 L600,120 L0,120 Z" }));
}

function chip(text: string, cls = ""): HTMLElement { return h("span", { class: "dbi-chip " + cls }, text); }
function roleChip(required: boolean): HTMLElement { return chip(required ? "Required" : "Optional", required ? "dbi-chip--req" : "dbi-chip--opt"); }

/** Landing page laid out exactly like MUST Tables: brand row, hero + sample preview, footer with Support / FAQ / About. */
export function buildLanding(spec: VisualSpec, open: (t: PanelTab) => void): { el: HTMLElement; preview: HTMLElement; tools: HTMLElement } {
    const go = (t: PanelTab) => (e: Event) => { e.stopPropagation(); open(t); };
    const preview = h("div", { class: "dbi-previewcard__body", "aria-hidden": "true" });
    const tools = h("div", { class: "dbi-previewcard__tools", "aria-hidden": "true" });
    const el = h("section", { class: "dbi-landing", "aria-label": spec.displayName + " - getting started" },
        h("div", { class: "dbi-page" },
            h("div", { class: "dbi-top" }, brandLockup(spec)),
            h("div", { class: "dbi-main" },
                h("div", { class: "dbi-hero" },
                    stripes(),
                    h("div", { class: "dbi-hero__body" },
                        h("p", { class: "dbi-kicker" }, spec.kicker),
                        h("h1", { class: "dbi-landing__title" }, spec.titleLead + " ", h("em", null, spec.titleAccent)),
                        h("p", { class: "dbi-lede" }, spec.lede),
                        h("div", { class: "dbi-cta" },
                            h("button", { class: "dbi-btn dbi-btn--primary", type: "button", onclick: go("guide") }, "Add your fields"),
                            h("button", { class: "dbi-btn dbi-btn--outline", type: "button", onclick: go("about") }, "Learn more")),
                        h("ul", { class: "dbi-feats" }, ...spec.highlights.map(t => h("li", null, t))))),
                h("aside", { class: "dbi-previewcard", "aria-label": "Sample preview" },
                    h("div", { class: "dbi-previewcard__head" }, h("strong", null, "Sample preview"), h("span", { class: "dbi-live" }, "Sample data")),
                    tools, preview,
                    h("p", { class: "dbi-previewcard__foot" }, "Sample data. Your fields replace this as soon as you add them."))),
            h("div", { class: "dbi-footer" },
                h("span", { class: "dbi-legal" }, h("i", { class: "dbi-dot" }), BRAND.legal, h("small", null, " v" + spec.version)),
                h("div", { class: "dbi-linkrow" },
                    h("button", { class: "dbi-link-btn", type: "button", onclick: go("support") }, "Support"),
                    h("button", { class: "dbi-link-btn", type: "button", onclick: go("faq") }, "FAQ"),
                    h("button", { class: "dbi-link-btn", type: "button", onclick: go("about") }, "About")))));
    return { el, preview, tools };
}

/** Shown when the visual has some fields but not what it needs to draw yet. */
export function buildGuidance(spec: VisualSpec, td: TableData, open: (t: PanelTab) => void): HTMLElement {
    const missing = spec.roles.filter(r => r.required && !td.has(r.name));
    const label = (n: string) => { const r = spec.roles.filter(x => x.name === n)[0]; return r ? r.displayName : n; };
    const anyMissing = !!spec.anyOf && !spec.anyOf.some(set => set.every(r => td.has(r)));
    const lines: HTMLElement[] = missing.map(r => h("li", null, h("b", null, r.displayName), " - ", r.help));
    if (anyMissing) { lines.push(h("li", null, "Add ", h("b", null, spec.anyOf.map(set => set.map(label).join(" + ")).join("  or  ")), " to draw."));
    }
    const count = missing.length + (anyMissing ? 1 : 0);
    return h("section", { class: "dbi-guidance", role: "status" },
        h("div", { class: "dbi-guidance__card" }, brandMark(initials(spec.displayName)),
            h("h2", null, "Almost there"),
            h("p", null, spec.displayName + " needs " + (count === 1 ? "one more thing" : count + " more things") + " to draw:"),
            h("ul", null, ...lines),
            h("button", { class: "dbi-btn dbi-btn--primary", type: "button", onclick: (e: Event) => { e.stopPropagation(); open("guide"); } }, "Show field guide")));
}

/** Small first-use card in the data view (dismissal is saved in the visual's settings). */
export function buildWelcome(spec: VisualSpec, details: () => void, dismiss: () => void): HTMLElement {
    const words = spec.displayName.split(" ");
    return h("aside", { class: "dbi-welcome", role: "complementary", "aria-label": "About this visual" },
        h("div", { class: "dbi-welcome__top" }, brandMark(initials(spec.displayName)),
            h("div", { class: "dbi-welcome__brand" }, h("b", null, words[0] + (words.length > 1 ? " " : ""), words.length > 1 ? h("i", null, words.slice(1).join(" ")) : null), h("small", null, BRAND.name + " · " + BRAND.mottoTitle)),
            h("button", { class: "dbi-icon-btn dbi-icon-btn--sm", type: "button", "aria-label": "Dismiss", onclick: (e: Event) => { e.stopPropagation(); dismiss(); } }, "×")),
        h("p", null, spec.description),
        h("div", { class: "dbi-welcome__chips" }, ...spec.highlights.map(t => chip(t))),
        h("button", { class: "dbi-link", type: "button", onclick: (e: Event) => { e.stopPropagation(); details(); } }, "View product details"));
}

// ------------------------------------------------------------------ panels

const TAB_EYEBROW: Record<PanelTab, string> = { guide: "GETTING STARTED", faq: "FREQUENTLY ASKED", support: "PRODUCT SUPPORT", about: "ABOUT THE PRODUCT" };
const TAB_LABEL: Record<PanelTab, string> = { guide: "Guide", faq: "FAQ", support: "Support", about: "About" };

const GENERIC_FAQ = [
    { q: "Where is my data processed?", a: "Inside the visual, in your report. Nothing is sent to any server." },
    { q: "How do I change the look?", a: "Use the Settings button in the visual (or the Format pane) to pick a visual theme, accent colour, density and saved layouts." }
];

function guidePanel(spec: VisualSpec): HTMLElement[] {
    return [
        h("p", { class: "dbi-lede" }, spec.description),
        h("h3", null, "Get started"),
        h("ol", { class: "dbi-steps" }, ...spec.steps.map(t => h("li", null, t))),
        h("h3", null, "Fields"),
        h("div", { class: "dbi-fieldtable" }, ...spec.roles.map(r => h("div", { class: "dbi-fieldtable__row" },
            h("div", null, h("b", null, r.displayName), " ", roleChip(!!r.required)), h("p", null, r.help))))
    ];
}
function faqPanel(spec: VisualSpec): HTMLElement[] {
    return [h("h3", null, "Frequently asked questions")].concat(
        spec.faq.concat(GENERIC_FAQ).map(f => h("details", { class: "dbi-faq" }, h("summary", null, f.q), h("p", null, f.a))));
}
function supportPanel(spec: VisualSpec, api: PanelApi): HTMLElement[] {
    const c = BRAND.contact;
    const row = (label: string, value: string, action?: HTMLElement) => h("div", { class: "dbi-contact" }, h("div", null, h("small", null, label), h("b", null, value)), action || null);
    return [
        h("h3", null, "Support"),
        h("p", { class: "dbi-lede" }, "For product assistance, reach the Delight Insights team. Please mention " + spec.displayName + " v" + spec.version + "."),
        row("WhatsApp", c.whatsapp, h("button", { class: "dbi-btn dbi-btn--primary dbi-btn--sm", type: "button", onclick: () => api.launch("https://wa.me/" + c.whatsappDigits) }, "WhatsApp")),
        row("Email", c.email, h("button", { class: "dbi-btn dbi-btn--primary dbi-btn--sm", type: "button", onclick: () => api.launch("mailto:" + c.email + "?subject=" + encodeURIComponent(spec.displayName + " v" + spec.version)) }, "Email")),
        row("Phone", c.phone)
    ];
}
function aboutPanel(spec: VisualSpec): HTMLElement[] {
    return [
        h("h3", null, "About this visual"),
        h("p", { class: "dbi-lede" }, spec.description),
        h("div", { class: "dbi-aboutcard" }, h("b", null, BRAND.name), h("span", null, BRAND.motto), h("small", null, BRAND.unit + " · " + BRAND.legal)),
        h("h3", null, "Product focus"),
        h("div", { class: "dbi-focus" }, ...spec.highlights.map(t => h("div", null, t))),
        h("h3", null, "Technology stack"),
        h("div", { class: "dbi-stack" }, ...BRAND.stack.map(t => chip(t))),
        h("p", { class: "dbi-about" }, "Version " + spec.version)
    ];
}

export function buildPanel(spec: VisualSpec, tab: PanelTab, api: PanelApi): HTMLElement {
    const tabs: PanelTab[] = ["guide", "faq", "support", "about"];
    const body = tab === "faq" ? faqPanel(spec) : tab === "support" ? supportPanel(spec, api) : tab === "about" ? aboutPanel(spec) : guidePanel(spec);
    const el = h("div", { class: "dbi-drawer", role: "dialog", "aria-modal": "true", "aria-label": spec.displayName + " panel", tabindex: "-1" },
        h("div", { class: "dbi-drawer__panel" },
            h("header", { class: "dbi-drawer__head" }, brandLockup(spec),
                h("button", { class: "dbi-icon-btn", type: "button", "aria-label": "Close panel", onclick: () => api.close() }, "×")),
            h("p", { class: "dbi-eyebrow" }, h("i", { class: "dbi-dot" }), TAB_EYEBROW[tab]),
            h("h2", { class: "dbi-drawer__title" }, spec.displayName),
            h("div", { class: "dbi-tabs", role: "tablist" }, ...tabs.map(t => h("button", { type: "button", role: "tab", class: "dbi-tab", "aria-selected": String(t === tab), onclick: () => api.setTab(t) }, TAB_LABEL[t]))),
            h("div", { class: "dbi-drawer__body" }, ...body)));
    el.addEventListener("click", (e: Event) => { if (e.target === el) { api.close(); } });
    el.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Escape") { api.close(); } });
    return el;
}
