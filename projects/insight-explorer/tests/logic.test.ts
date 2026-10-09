import { buildInsights } from "../src/renderer";
const m = (label: string, value: number, compare: number | null = null) => ({ label, value, compare, rows: [0] });
describe("insights", () => {
    it("writes leader, concentration and tail insights", () => {
        const out = buildInsights([m("A", 50), m("B", 20), m("C", 10), m("D", 10), m("E", 10)], "Sales", null).map(i => i.strong + i.rest).join(" ");
        expect(out).toContain("A leads with 50%"); expect(out).toContain("Top 3"); expect(out).toContain("80%");
    });
    it("compares against a benchmark", () => {
        const out = buildInsights([m("A", 120, 100), m("B", 70, 100)], "Sales", "Budget").map(i => i.strong + i.rest).join(" ");
        expect(out).toContain("furthest ahead"); expect(out).toContain("furthest behind");
    });
    it("never returns an empty list", () => { expect(buildInsights([], "x", null).length).toBe(1); });
});
