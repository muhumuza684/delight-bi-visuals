import { pivotRows } from "../src/pivot";
import { parseState, defaultState } from "../src/tableState";
import { computeVirtual, baseDefs, applyFilters, buildDefs, cellText } from "../src/tableModel";
import { TableData } from "../src/core/dataReader";
import * as mod from "../src/visual";
import spec from "../src/spec.json";
import { makeDataView, makeHost, makeOptions } from "./mocks/powerbiMocks";
import fixture from "./fixture.json";

const rows = [
    { Region: "N", Product: "A", Sales: 10 }, { Region: "N", Product: "B", Sales: 5 },
    { Region: "S", Product: "A", Sales: 7 }, { Region: "S", Product: "A", Sales: 3 }];
describe("pivot (same behaviour as MUST Tables)", () => {
    it("builds a row-grouped matrix with totals", () => {
        const p = pivotRows(rows, "Region", "Product", "Sales", "sum");
        expect(p.columns).toEqual(["Region", "Sales \u2014 A", "Sales \u2014 B"]);
        expect(p.rows.find(r => r.Region === "S")["Sales \u2014 A"]).toBe(10);
        expect(p.rowTotals["N"]).toBe(15); expect(p.columnTotals["Sales \u2014 A"]).toBe(20); expect(p.grandTotal).toBe(25);
        expect(p.emptyCells["S\u241FSales \u2014 B"]).toBe(true);
    });
    it("supports average, min, max and count aggregations", () => {
        expect(pivotRows(rows, "Region", "Product", "Sales", "avg").rows.find(r => r.Region === "S")["Sales \u2014 A (AVG)"]).toBe(5);
        expect(pivotRows(rows, "Region", "Product", "Sales", "max").grandTotal).toBe(10);
        expect(pivotRows(rows, "Region", "Product", "Sales", "count").grandTotal).toBe(4);
    });
});
describe("table state and virtual columns", () => {
    const td = new TableData(makeDataView(fixture as any).table);
    it("falls back to defaults for malformed saved state", () => { expect(parseState("not json")).toEqual(defaultState()); expect(parseState("{\"calcs\":[{\"name\":\"x\"}]}").calcs.length).toBe(0); });
    it("computes calculated and combined columns with the MUST Tables engine", () => {
        const st = { ...defaultState(), calcs: [{ name: "Per unit", formula: "[Sales] / [Units]" }], combos: [{ name: "Tag", template: "{Region}-{Product}" }] };
        const virt = computeVirtual(td, baseDefs(td), st);
        expect(virt["Per unit"][0]).toBeCloseTo(td.rows[0][3] / td.rows[0][4]); expect(virt["Tag"][0]).toBe(td.rows[0][0] + "-" + td.rows[0][1]);
        expect(buildDefs(td, st, virt).map(d => d.label)).toEqual(expect.arrayContaining(["Per unit", "Tag"]));
    });
    it("filters by column text and numeric range", () => {
        const st = defaultState(); const virt = computeVirtual(td, baseDefs(td), st); const defs = buildDefs(td, st, virt); const all = td.rows.map((_, i) => i);
        expect(applyFilters(td, defs, virt, all, { Region: { contains: "kamp" } }).every(r => cellText(td, defs.filter(d => d.label === "Region")[0], virt, r).toLowerCase().indexOf("kamp") >= 0)).toBe(true);
        expect(applyFilters(td, defs, virt, all, { Sales: { min: 5000 } }).length).toBeLessThan(all.length);
    });
});
function mount(dv: any) { const el = document.createElement("div"); document.body.appendChild(el); const host = makeHost(); const v = new (mod as any)[(spec as any).name]({ element: el, host }); v.update(makeOptions(dv, 1100, 600)); return { el, host }; }
const lastState = (host: any) => { const calls = (host.persistProperties as jest.Mock).mock.calls.map(c => c[0].merge[0]).filter((m: any) => m.objectName === "tablestate"); return JSON.parse(calls[calls.length - 1].properties.state); };
describe("table in the visual", () => {
    it("has a Pivot button that switches to the pivot view and saves the choice", () => {
        const { el, host } = mount(makeDataView(fixture as any));
        const btn = el.querySelector(".dbi-pivot-toggle") as HTMLElement; expect(btn).not.toBeNull(); btn.click();
        expect(lastState(host).pivot.mode).toBe("pivot");
        expect(el.querySelector(".dbi-pivot-config")).not.toBeNull(); expect(el.querySelector(".dbi-pivot-table")).not.toBeNull();
    });
    it("has the MUST Tables settings tabs including Filters, and per-column controls", () => {
        const { el } = mount(makeDataView(fixture as any));
        (el.querySelector('[aria-label="Settings"]') as HTMLElement).click();
        const tabs = (Array.from(el.querySelectorAll(".dbi-settab")) as HTMLElement[]).map(b => b.textContent);
        expect(tabs).toEqual(["Layout", "Data display", "Filters", "Styling", "Analysis"]);
        (Array.from(el.querySelectorAll(".dbi-settab")) as HTMLElement[]).filter(b => b.textContent === "Data display")[0].click();
        const d = el.querySelector(".dbi-drawer--settings").textContent; expect(d).toContain("SHOW COLUMNS"); expect(d).toContain("COLUMN CONTROLS");
        (Array.from(el.querySelectorAll(".dbi-settab")) as HTMLElement[]).filter(b => b.textContent === "Filters")[0].click();
        expect(el.querySelector(".dbi-drawer--settings").textContent).toContain("COLUMN FILTERS");
    });
    it("adds a calculated column from the Analysis tab and shows it in the table", () => {
        const { el, host } = mount(makeDataView(fixture as any));
        (el.querySelector('[aria-label="Settings"]') as HTMLElement).click();
        (Array.from(el.querySelectorAll(".dbi-settab")) as HTMLElement[]).filter(b => b.textContent === "Analysis")[0].click();
        (el.querySelector('[aria-label="Calculated column name"]') as HTMLInputElement).value = "Per unit";
        (el.querySelector('[aria-label="Calculated column name"]') as HTMLInputElement).dispatchEvent(new Event("change"));
        (el.querySelector('[aria-label="Calculated column formula"]') as HTMLInputElement).value = "[Sales] / [Units]";
        (el.querySelector('[aria-label="Calculated column formula"]') as HTMLInputElement).dispatchEvent(new Event("change"));
        (Array.from(el.querySelectorAll(".dbi-secondary")) as HTMLElement[]).filter(b => b.textContent === "+ Add a calculated column")[0].click();
        expect(lastState(host).calcs).toEqual([{ name: "Per unit", formula: "[Sales] / [Units]" }]);
    });
    it("rejects a formula that references an unknown column", () => {
        const { el, host } = mount(makeDataView(fixture as any));
        (el.querySelector('[aria-label="Settings"]') as HTMLElement).click();
        (Array.from(el.querySelectorAll(".dbi-settab")) as HTMLElement[]).filter(b => b.textContent === "Analysis")[0].click();
        const set = (label: string, v: string) => { const i = el.querySelector('[aria-label="' + label + '"]') as HTMLInputElement; i.value = v; i.dispatchEvent(new Event("change")); };
        set("Calculated column name", "Bad"); set("Calculated column formula", "[Nope] * 2");
        (Array.from(el.querySelectorAll(".dbi-secondary")) as HTMLElement[]).filter(b => b.textContent === "+ Add a calculated column")[0].click();
        expect(el.querySelector(".dbi-error-text").textContent).toContain("Nope");
        expect((host.persistProperties as jest.Mock).mock.calls.filter(c => c[0].merge[0].objectName === "tablestate").length).toBe(0);
    });
    it("applies a colour rule to matching cells", () => {
        const dv = makeDataView(fixture as any);
        dv.metadata.objects = { tablestate: { state: JSON.stringify({ rules: [{ column: "Sales", operator: "gt", value: "5000", color: "#FAF623", scope: "cell", format: "background" }] }) } };
        const { el } = mount(dv);
        const colored = (Array.from(el.querySelectorAll("td")) as HTMLElement[]).filter(t => t.style.backgroundColor !== "");
        expect(colored.length).toBeGreaterThan(0);
    });
});
