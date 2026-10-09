import { makeTicks, isLate, isDone, statusColor } from "../src/renderer";
const day = 86400000;
describe("work planner logic", () => {
    it("builds ticks for short, medium and long spans", () => {
        const t = new Date(2026, 0, 1).getTime();
        expect(makeTicks(t, t + 10 * day).length).toBeGreaterThan(5);
        expect(makeTicks(t, t + 90 * day).length).toBeGreaterThan(8);
        expect(makeTicks(t, t + 900 * day).length).toBeGreaterThan(2);
    });
    it("flags only incomplete past-due work as late", () => {
        const base: any = { row: 0, task: "x", start: null, owner: "", status: "", group: "" };
        const now = new Date(2026, 5, 10).getTime();
        expect(isLate({ ...base, due: new Date(2026, 5, 1), progress: 0.5 }, now)).toBe(true);
        expect(isLate({ ...base, due: new Date(2026, 5, 1), progress: 1 }, now)).toBe(false);
        expect(isLate({ ...base, due: new Date(2026, 5, 20), progress: 0 }, now)).toBe(false);
        expect(isDone({ ...base, due: null, progress: null, status: "Done" })).toBe(true);
    });
    it("colours known statuses", () => { expect(statusColor("Done", "")).toBe("#178A63"); expect(statusColor("Blocked", "")).toBe("#C33B5E"); });
});
