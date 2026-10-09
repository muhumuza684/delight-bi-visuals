import { layoutSankey } from "../src/renderer";
describe("sankey layout", () => {
    const pal = ["#1", "#2", "#3", "#4", "#5", "#6"];
    it("layers nodes left to right and keeps numbers finite", () => {
        const L = layoutSankey([{ source: "A", target: "B", value: 10, rows: [0] }, { source: "B", target: "C", value: 6, rows: [1] }, { source: "A", target: "C", value: 4, rows: [2] }], 10, 400, 200, 12, pal);
        expect(L.cols).toBe(3);
        L.nodes.forEach(n => { expect(isFinite(n.x)).toBe(true); expect(isFinite(n.y)).toBe(true); expect(n.h).toBeGreaterThan(0); });
        L.links.forEach(l => { expect(isFinite(l.sy)).toBe(true); expect(isFinite(l.ty)).toBe(true); });
    });
    it("drops loops and self links instead of failing", () => {
        const L = layoutSankey([{ source: "A", target: "B", value: 5, rows: [0] }, { source: "B", target: "A", value: 2, rows: [1] }, { source: "A", target: "A", value: 1, rows: [2] }], 10, 300, 150, 12, pal);
        expect(L.dropped).toBe(2); expect(L.links.length).toBe(1);
    });
});
