import { scenarioTotals } from "../src/renderer";
describe("scenario maths", () => {
    it("applies percentage changes per driver", () => {
        const t = scenarioTotals([{ name: "A", base: 100, rows: [] }, { name: "B", base: 200, rows: [] }], { A: 10, B: -50 });
        expect(t.base).toBe(300); expect(t.scenario).toBeCloseTo(110 + 100); expect(t.delta).toBeCloseTo(-90);
    });
});
