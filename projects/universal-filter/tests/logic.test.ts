import { parseTarget, basicFilter } from "../src/renderer";
describe("filter targets", () => {
    it("parses table.column and rejects aggregates", () => {
        expect(parseTarget("Sales.Region")).toEqual({ table: "Sales", column: "Region" });
        expect(parseTarget("Sum(Sales.Amount)")).toBeNull();
    });
    it("builds a real Power BI basic filter", () => {
        const f = basicFilter({ table: "Sales", column: "Region" }, ["N", "S"]);
        expect(f.operator).toBe("In"); expect(f.filterType).toBe(1); expect(f.values).toEqual(["N", "S"]);
    });
});
