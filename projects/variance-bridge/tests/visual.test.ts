import * as mod from "../src/visual";
import spec from "../src/spec.json";
import fixture from "./fixture.json";
import caps from "../capabilities.json";
import { makeDataView, makeHost, makeOptions } from "./mocks/powerbiMocks";
import { buildCapabilities } from "../src/core/spec";
import { BRAND } from "../src/core/brand";

const Cls: any = (mod as any)[(spec as any).name];
function mount(dv: any, w = 800, h = 500) {
    const el = document.createElement("div"); document.body.appendChild(el);
    const host = makeHost(); const v = new Cls({ element: el, host }); v.update(makeOptions(dv, w, h)); return { el, host, v };
}
const requiredRoles = (spec as any).roles.filter((r: any) => r.required).map((r: any) => r.name);

describe((spec as any).displayName, () => {
    it("shows the Delight Insights landing page when there is no data", () => {
        const { el, host } = mount(null);
        expect(el.querySelector(".dbi-landing")).not.toBeNull();
        expect(el.textContent).toContain(BRAND.name);
        expect(el.textContent.toLowerCase()).toContain(BRAND.motto.toLowerCase());
        expect(el.textContent).toContain((spec as any).titleAccent);
        expect(el.textContent).toContain("v" + (spec as any).version);
        expect(host.eventService.renderingFinished).toHaveBeenCalled();
    });
    it("previews the real visual on sample data, labelled as sample", () => {
        const { el } = mount(null);
        const card = el.querySelector(".dbi-previewcard");
        expect(card).not.toBeNull();
        expect(card.textContent).toContain("Sample data");
        expect(card.querySelector((fixture as any).expect)).not.toBeNull();
    });
    it("shows this visual's own highlights", () => {
        const { el } = mount(null);
        (spec as any).highlights.forEach((t: string) => expect(el.textContent).toContain(t));
    });
    it("opens the field guide listing every field, and closes it", () => {
        const { el } = mount(null);
        (el.querySelector(".dbi-btn--primary") as HTMLElement).click();
        const d = el.querySelector(".dbi-drawer");
        expect(d).not.toBeNull();
        (spec as any).roles.forEach((r: any) => expect(d.textContent).toContain(r.displayName));
        (el.querySelector(".dbi-drawer .dbi-icon-btn") as HTMLElement).click();
        expect(el.querySelector(".dbi-drawer")).toBeNull();
    });
    it("has Support, FAQ and About panels with the Delight Insights contact details", () => {
        const { el } = mount(null);
        const tab = (name: string) => (Array.from(el.querySelectorAll(".dbi-footer button")) as HTMLElement[]).filter(b => b.textContent === name)[0];
        tab("Support").click();
        expect(el.querySelector(".dbi-drawer").textContent).toContain(BRAND.contact.email);
        expect(el.querySelector(".dbi-drawer").textContent).toContain(BRAND.contact.phone);
        (el.querySelector(".dbi-drawer .dbi-icon-btn") as HTMLElement).click();
        tab("FAQ").click();
        (spec as any).faq.forEach((f: any) => expect(el.querySelector(".dbi-drawer").textContent).toContain(f.q));
        (el.querySelector(".dbi-drawer .dbi-icon-btn") as HTMLElement).click();
        tab("About").click();
        expect(el.querySelector(".dbi-drawer").textContent.toLowerCase()).toContain(BRAND.motto.toLowerCase());
        (spec as any).highlights.forEach((t: string) => expect(el.querySelector(".dbi-drawer").textContent).toContain(t));
    });
    it("guides the user when something needed is missing", () => {
        const anyOf: string[][] | undefined = (spec as any).anyOf;
        const drop = requiredRoles.length ? [requiredRoles[0]] : (anyOf ? ([] as string[]).concat(...anyOf) : []);
        const label = requiredRoles.length ? (spec as any).roles.filter((r: any) => r.name === requiredRoles[0])[0].displayName : (spec as any).roles.filter((r: any) => r.name === anyOf[0][0])[0].displayName;
        const { el } = mount(makeDataView(fixture as any, drop));
        expect(el.querySelector(".dbi-guidance")).not.toBeNull();
        expect(el.textContent).toContain(label);
    });
    it("renders real content from sample data without errors", () => {
        const { el, host } = mount(makeDataView(fixture as any));
        expect(el.querySelector(".dbi-error")).toBeNull();
        expect(el.querySelector((fixture as any).expect)).not.toBeNull();
        expect(host.eventService.renderingFailed).not.toHaveBeenCalled();
    });
    it("opens a MUST Tables-style settings drawer with Layout, Data display, Styling and Analysis tabs", () => {
        const { el } = mount(makeDataView(fixture as any));
        (el.querySelector('[aria-label="Settings"]') as HTMLElement).click();
        const d = el.querySelector(".dbi-drawer--settings");
        expect(d).not.toBeNull();
        expect(d.textContent).toContain((spec as any).displayName + " settings");
        ["Layout", "Data display", "Styling", "Analysis"].forEach(n => expect(d.textContent).toContain(n));
        expect(d.textContent).toContain("Named layouts");
        expect(d.querySelector('input[type="range"]')).not.toBeNull();
    });
    it("applies a visual theme and saves it to the report", () => {
        const { el, host } = mount(makeDataView(fixture as any));
        (el.querySelector('[aria-label="Settings"]') as HTMLElement).click();
        const tab = (n: string) => (Array.from(el.querySelectorAll(".dbi-settab")) as HTMLElement[]).filter(b => b.textContent === n)[0];
        tab("Styling").click();
        const slate = (Array.from(el.querySelectorAll(".dbi-gal")) as HTMLElement[]).filter(b => b.textContent === "Slate")[0];
        slate.click();
        expect(host.persistProperties).toHaveBeenCalledWith({ merge: [{ objectName: "theme", selector: undefined, properties: { preset: "slate" } }] });
    });
    it("shows this visual's own options and the fields that feed it", () => {
        const { el } = mount(makeDataView(fixture as any));
        (el.querySelector('[aria-label="Settings"]') as HTMLElement).click();
        (Array.from(el.querySelectorAll(".dbi-settab")) as HTMLElement[]).filter(b => b.textContent === "Data display")[0].click();
        const d = el.querySelector(".dbi-drawer--settings");
        const own = (spec as any).objects[0].properties.filter((p: any) => !p.hidden)[0];
        expect(d.textContent).toContain(own.displayName);
        (spec as any).roles.forEach((r: any) => expect(d.textContent).toContain(r.displayName));
    });
    it("saves, lists and applies a named layout", () => {
        const { el, host } = mount(makeDataView(fixture as any));
        (el.querySelector('[aria-label="Settings"]') as HTMLElement).click();
        const input = el.querySelector(".dbi-textbox") as HTMLInputElement; input.value = "Regional review";
        (Array.from(el.querySelectorAll(".dbi-secondary")) as HTMLElement[]).filter(b => b.textContent === "Save layout")[0].click();
        const call = (host.persistProperties as jest.Mock).mock.calls[0][0].merge[0];
        expect(call.objectName).toBe("views"); expect(call.properties.layouts).toContain("Regional review");
        expect(JSON.parse(call.properties.layouts)[0].values["theme.preset"]).toBeDefined();
    });
    it("downloads the data as CSV through the governed download API", async () => {
        const { el, host } = mount(makeDataView(fixture as any));
        (el.querySelector('[aria-label="Settings"]') as HTMLElement).click();
        (Array.from(el.querySelectorAll(".dbi-settab")) as HTMLElement[]).filter(b => b.textContent === "Analysis")[0].click();
        (Array.from(el.querySelectorAll(".dbi-secondary")) as HTMLElement[]).filter(b => b.textContent === "Download CSV")[0].click();
        await new Promise(r => setTimeout(r, 0));
        expect(host.downloadService.exportVisualsContentExtended).toHaveBeenCalled();
        const [csv, name] = (host.downloadService.exportVisualsContentExtended as jest.Mock).mock.calls[0];
        expect(name).toBe((spec as any).slug + "-export.csv"); expect(csv.split("\n").length).toBe((fixture as any).rows.length + 1);
    });
    it("leads with the visual's own name on the landing page", () => {
        const { el } = mount(null);
        expect(el.querySelector(".dbi-brand__text b").textContent.toLowerCase()).toContain((spec as any).displayName.split(" ")[0].toLowerCase());
        expect(el.querySelector(".dbi-brand__text small").textContent).toContain(BRAND.name);
    });
    it("shows a dismissible welcome card and remembers the dismissal", () => {
        const { el, host } = mount(makeDataView(fixture as any));
        const card = el.querySelector(".dbi-welcome");
        expect(card).not.toBeNull();
        expect(card.textContent).toContain((spec as any).displayName);
        (card.querySelector(".dbi-icon-btn") as HTMLElement).click();
        expect(host.persistProperties).toHaveBeenCalledWith({ merge: [{ objectName: "general", selector: undefined, properties: { showWelcome: false } }] });
    });
    it("still renders at small sizes", () => {
        const { el } = mount(makeDataView(fixture as any), 300, 200);
        expect(el.querySelector(".dbi-error")).toBeNull();
        expect(el.querySelector(".dbi-root")).not.toBeNull();
    });
    it("capabilities.json matches the spec exactly", () => {
        expect(JSON.parse(JSON.stringify(caps))).toEqual(JSON.parse(JSON.stringify(buildCapabilities(spec as any))));
    });
    it("exposes theme and general cards in the Format pane", () => {
        const { v } = mount(makeDataView(fixture as any));
        const model: any = v.getFormattingModel();
        const names = JSON.stringify(model);
        expect(names).toContain("Theme"); expect(names).toContain("General");
    });
});
