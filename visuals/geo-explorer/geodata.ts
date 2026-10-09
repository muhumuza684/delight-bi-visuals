/** Real country borders, decoded from the bundled world-atlas TopoJSON. No network, no map service. */
export interface Country { name: string; norm: string; polys: number[][][][]; bbox: [number, number, number, number]; main: number[] }

const EXPAND: Record<string, string> = { rep: "republic", dem: "democratic", eq: "equatorial", herz: "herzegovina", is: "islands", fr: "french", st: "saint", n: "north", s: "south", w: "western", e: "eastern" };
const STOP: Record<string, boolean> = { the: true, of: true, and: true };

export function normName(raw: string): string {
    const base = String(raw || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
    return base.split(" ").filter(t => t && !STOP[t]).map(t => EXPAND[t] || t).join(" ");
}

/** Common alternative names -> the normalised name(s) used by the map data (first one present wins). */
const ALIASES: Record<string, string[]> = {
    "usa": ["united states america"], "us": ["united states america"], "u s a": ["united states america"], "u s": ["united states america"], "united states": ["united states america"], "america": ["united states america"],
    "uk": ["united kingdom"], "great britain": ["united kingdom"], "britain": ["united kingdom"], "england": ["united kingdom"], "uae": ["united arab emirates"], "emirates": ["united arab emirates"],
    "drc": ["democratic republic congo"], "dr congo": ["democratic republic congo"], "congo kinshasa": ["democratic republic congo"], "republic congo": ["congo"], "congo brazzaville": ["congo"], "congo republic": ["congo"],
    "united republic tanzania": ["tanzania"], "ivory coast": ["cote d ivoire"], "czech republic": ["czechia"], "russian federation": ["russia"],
    "republic korea": ["south korea"], "korea south": ["south korea"], "korea": ["south korea"], "dpr korea": ["north korea"], "korea north": ["north korea"],
    "viet nam": ["vietnam"], "lao pdr": ["laos"], "lao": ["laos"], "syrian arab republic": ["syria"], "islamic republic iran": ["iran"], "iran islamic republic": ["iran"], "burma": ["myanmar"],
    "swaziland": ["eswatini"], "cabo verde": ["cape verde"], "east timor": ["timor leste"], "timor leste": ["timor leste", "east timor"], "gambia": ["gambia"], "macedonia": ["macedonia", "north macedonia"], "north macedonia": ["north macedonia", "macedonia"],
    "bosnia": ["bosnia herzegovina"], "bosnia herzegovina": ["bosnia herzegovina"], "falkland islands": ["falkland islands"], "malvinas": ["falkland islands"], "palestine": ["palestine"], "west bank": ["palestine"],
    "plurinational state bolivia": ["bolivia"], "bolivarian republic venezuela": ["venezuela"], "republic moldova": ["moldova"], "brunei darussalam": ["brunei"], "turkiye": ["turkey"], "holland": ["netherlands"], "south sudan": ["south sudan"]
};

export function decodeTopology(topo: any, objectName = "countries"): Country[] {
    const tr = topo.transform || { scale: [1, 1], translate: [0, 0] };
    const arcs: number[][][] = (topo.arcs || []).map((arc: number[][]) => {
        let x = 0, y = 0;
        return arc.map(p => { x += p[0]; y += p[1]; return [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]]; });
    });
    const line = (idx: number[]): number[][] => {
        const out: number[][] = [];
        idx.forEach((i, k) => {
            const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
            for (let j = k === 0 ? 0 : 1; j < a.length; j++) { out.push(a[j]); }
        });
        return out;
    };
    const obj = topo.objects[objectName] || topo.objects[Object.keys(topo.objects)[0]];
    const out: Country[] = [];
    (obj.geometries || []).forEach((g: any) => {
        const polys: number[][][][] = g.type === "Polygon" ? [g.arcs.map(line)] : g.type === "MultiPolygon" ? g.arcs.map((p: number[][]) => p.map(line)) : [];
        if (!polys.length) { return; }
        const name = (g.properties && g.properties.name) || String(g.id || "");
        if (name === "Antarctica") { return; }
        let x0 = 180, y0 = 90, x1 = -180, y1 = -90; let best = -1, bestArea = -1;
        polys.forEach((p, i) => {
            let a0 = 180, b0 = 90, a1 = -180, b1 = -90;
            p[0].forEach(pt => { if (pt[0] < a0) { a0 = pt[0]; } if (pt[0] > a1) { a1 = pt[0]; } if (pt[1] < b0) { b0 = pt[1]; } if (pt[1] > b1) { b1 = pt[1]; } });
            const area = (a1 - a0) * (b1 - b0); if (area > bestArea) { bestArea = area; best = i; }
            if (a0 < x0) { x0 = a0; } if (a1 > x1) { x1 = a1; } if (b0 < y0) { y0 = b0; } if (b1 > y1) { y1 = b1; }
        });
        // bounds of the main land mass, so far-flung territories (e.g. French Guiana) do not distort the fit
        const mp = polys[best][0]; let m0 = 180, n0 = 90, m1 = -180, n1 = -90;
        mp.forEach(pt => { if (pt[0] < m0) { m0 = pt[0]; } if (pt[0] > m1) { m1 = pt[0]; } if (pt[1] < n0) { n0 = pt[1]; } if (pt[1] > n1) { n1 = pt[1]; } });
        out.push({ name, norm: normName(name), polys, bbox: [x0, y0, x1, y1], main: [m0, n0, m1, n1] });
    });
    return out;
}

let CACHE: Country[] | null = null;
export function loadWorld(json: string): Country[] {
    if (!CACHE) { try { CACHE = decodeTopology(JSON.parse(json)); } catch (e) { CACHE = []; } }
    return CACHE;
}

/** Maps raw location names from the report to countries. Unmatched names are returned separately. */
export function matchCountries(names: string[], world: Country[]): { found: Record<string, Country>; missing: string[] } {
    const byNorm: Record<string, Country> = {}; world.forEach(c => { byNorm[c.norm] = c; });
    const found: Record<string, Country> = {}; const missing: string[] = [];
    names.forEach(raw => {
        const n = normName(raw); let hit = byNorm[n];
        if (!hit && ALIASES[n]) { for (const cand of ALIASES[n]) { if (byNorm[cand]) { hit = byNorm[cand]; break; } } }
        if (hit) { found[raw] = hit; } else if (missing.indexOf(raw) < 0) { missing.push(raw); }
    });
    return { found, missing };
}

export function mercY(lat: number): number {
    const l = Math.max(-82, Math.min(82, lat)); return Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360));
}
export function mercX(lon: number): number { return (lon * Math.PI) / 180; }
