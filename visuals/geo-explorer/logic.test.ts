import { decodeTopology, matchCountries, normName, mercY } from "../src/geodata";
import { viewFor } from "../src/renderer";
import { loadWorld } from "../src/geodata";
import { WORLD_JSON } from "../src/world";

// a tiny hand-built TopoJSON (quantised + delta-encoded like world-atlas) to test the decoder without the big file
const topo = {
    type: "Topology", transform: { scale: [1, 1], translate: [30, -2] },
    arcs: [[[0, 0], [4, 0], [0, 4], [-4, 0], [0, -4]], [[4, 0], [3, 0], [0, 4], [-3, 0]], [[0, 0], [2, 0], [0, 2], [-2, 0], [0, -2]]],
    objects: { countries: { type: "GeometryCollection", geometries: [
        { type: "Polygon", arcs: [[0]], properties: { name: "Uganda" } },
        { type: "Polygon", arcs: [[1, -1]], properties: { name: "Dem. Rep. Congo" } },
        { type: "MultiPolygon", arcs: [[[2]], [[0]]], properties: { name: "Kenya" } },
        { type: "Polygon", arcs: [[0]], properties: { name: "Antarctica" } }] } }
};
describe("geo data", () => {
    it("decodes quantised arcs to real coordinates and drops Antarctica", () => {
        const w = decodeTopology(topo);
        expect(w.map(c => c.name)).toEqual(["Uganda", "Dem. Rep. Congo", "Kenya"]);
        expect(w[0].polys[0][0][0]).toEqual([30, -2]); expect(w[0].polys[0][0][2]).toEqual([34, 2]);
        expect(w[0].bbox).toEqual([30, -2, 34, 2]);
    });
    it("normalises and matches common country names and aliases", () => {
        const w = decodeTopology(topo);
        const m = matchCountries(["Uganda", "uganda ", "Democratic Republic of the Congo", "DRC", "Atlantis"], w);
        expect(m.found["Uganda"].name).toBe("Uganda"); expect(m.found["DRC"].name).toBe("Dem. Rep. Congo"); expect(m.found["Democratic Republic of the Congo"].name).toBe("Dem. Rep. Congo");
        expect(m.missing).toEqual(["Atlantis"]);
        expect(normName("Côte d'Ivoire")).toBe("cote d ivoire"); expect(normName("S. Sudan")).toBe("south sudan");
    });
    it("fits a single point with context and stays inside Mercator limits", () => {
        const v = viewFor([{ lat: 0.3, lon: 32.5 }]); expect(v.lon1 - v.lon0).toBeGreaterThanOrEqual(6);
        expect(isFinite(mercY(90))).toBe(true);
    });
    it("the bundled world data decodes to real countries (including Uganda)", () => {
        const w = loadWorld(WORLD_JSON);
        expect(w.length).toBeGreaterThan(100);
        const ug = w.filter(c => c.name === "Uganda")[0];
        expect(ug).toBeDefined(); expect(ug.bbox[0]).toBeGreaterThan(28); expect(ug.bbox[2]).toBeLessThan(36); expect(ug.bbox[1]).toBeGreaterThan(-2); expect(ug.bbox[3]).toBeLessThan(5);
    });
});
