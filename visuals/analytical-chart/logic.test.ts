import { buildChart } from "../src/renderer";
import { makeDataView } from "./mocks/powerbiMocks";
import { TableData } from "../src/core/dataReader";
const cols = [{ name: "Name", roles: ["category"], type: "text" as const, measure: false }, { name: "Sales", roles: ["values"], type: "number" as const, measure: true }];
const rows = Array.from({ length: 30 }, (_, i) => ["C" + i, i + 1]);
describe("chart top-N", () => {
    const td = new TableData(makeDataView({ columns: cols, rows }).table);
    it("keeps the biggest categories and groups the rest as Other", () => {
        const m = buildChart({ td } as any, "none", 5, "bar");
        expect(m.cats.length).toBe(6); expect(m.cats[0]).toBe("C29"); expect(m.cats[5]).toContain("Other (25)"); expect(m.hidden).toBe(25);
        const rest = Object.keys(m.cell["Other (25)"]).reduce((t, k) => t + m.cell["Other (25)"][k].v, 0);
        expect(rest).toBe(Array.from({ length: 25 }, (_, i) => i + 1).reduce((a, b) => a + b, 0));
    });
    it("shows everything when the limit is 0 or the chart is a line", () => {
        expect(buildChart({ td } as any, "none", 0, "bar").cats.length).toBe(30);
        expect(buildChart({ td } as any, "none", 5, "line").cats.length).toBe(30);
    });
});
