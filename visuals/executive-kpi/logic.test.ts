import { ragColor } from "../src/renderer";
describe("kpi status", () => {
    it("maps attainment to green/amber/red", () => {
        expect(ragColor(1.05, false, 100, 90)).toBe("#178A63"); expect(ragColor(0.93, false, 100, 90)).toBe("#B57900"); expect(ragColor(0.5, false, 100, 90)).toBe("#C33B5E");
    });
    it("inverts when lower is better", () => { expect(ragColor(0.8, true, 100, 90)).toBe("#178A63"); });
});
