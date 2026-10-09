import { buildSteps } from "../src/renderer";
import { makeDataView } from "./mocks/powerbiMocks";
import { TableData } from "../src/core/dataReader";
import fixture from "./fixture.json";
describe("bridge steps", () => {
    it("variances add up from plan to actual and group the tail", () => {
        const td = new TableData(makeDataView(fixture as any).table);
        const { steps, plan, actual } = buildSteps({ td } as any, 4);
        expect(steps.length).toBe(4); expect(steps[3].label).toContain("Other");
        expect(Math.round(steps.reduce((t, x) => t + x.variance, 0))).toBe(Math.round(actual - plan));
    });
});
