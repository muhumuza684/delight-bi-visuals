import { Ctx, Renderer } from "./core/baseVisual";
import { h, s } from "./core/dom";
import { fmtNum, truncate } from "./core/format";

export interface FLink { source: string; target: string; value: number; rows: number[] }
export interface LNode { id: string; col: number; x: number; y: number; h: number; value: number; color: string; in: number; out: number; rows: number[] }
export interface LLink extends FLink { sy: number; ty: number; w: number; color: string }

/** Pure layout so it can be unit-tested without a DOM. Loops are dropped from layering. */
export function layoutSankey(links: FLink[], x0: number, x1: number, H: number, nodeW: number, palette: string[], gap = 8): { nodes: LNode[]; links: LLink[]; cols: number; dropped: number } {
    const adj = new Map<string, string[]>(); links.forEach(l => { (adj.get(l.source) || adj.set(l.source, []).get(l.source)).push(l.target); });
    const state = new Map<string, number>(); const back = new Set<string>();
    const dfs = (u: string) => { state.set(u, 1); (adj.get(u) || []).forEach(v => { const st = state.get(v) || 0; if (st === 1) { back.add(u + "\u0000" + v); } else if (st === 0) { dfs(v); } }); state.set(u, 2); };
    links.forEach(l => { if (!state.get(l.source)) { dfs(l.source); } });
    const keep = links.filter(l => l.source !== l.target && !back.has(l.source + "\u0000" + l.target));
    const ids: string[] = []; keep.forEach(l => { if (ids.indexOf(l.source) < 0) { ids.push(l.source); } if (ids.indexOf(l.target) < 0) { ids.push(l.target); } });
    const col = new Map<string, number>(); ids.forEach(i => col.set(i, 0));
    for (let it = 0; it < ids.length; it++) { let ch = false; keep.forEach(l => { if (col.get(l.target) < col.get(l.source) + 1) { col.set(l.target, col.get(l.source) + 1); ch = true; } }); if (!ch) { break; } }
    const cols = Math.max(1, ...Array.from(col.values())) + 1;
    const nodes: LNode[] = ids.map((id, i) => ({ id, col: col.get(id), x: 0, y: 0, h: 0, value: 0, color: palette[i % palette.length], in: 0, out: 0, rows: [] as number[] }));
    const byId = new Map<string, LNode>(); nodes.forEach(n => byId.set(n.id, n));
    keep.forEach(l => { const a = byId.get(l.source), b = byId.get(l.target); a.out += l.value; b.in += l.value; a.rows = a.rows.concat(l.rows); b.rows = b.rows.concat(l.rows); });
    nodes.forEach(n => { n.value = Math.max(n.in, n.out); });
    const colNodes: LNode[][] = []; for (let c = 0; c < cols; c++) { colNodes.push(nodes.filter(n => n.col === c).sort((a, b) => b.value - a.value)); }
    let scale = Infinity; colNodes.forEach(cn => { const tot = cn.reduce((t, n) => t + n.value, 0); if (tot > 0) { scale = Math.min(scale, (H - gap * Math.max(0, cn.length - 1)) / tot); } });
    if (!isFinite(scale)) { scale = 1; }
    colNodes.forEach((cn, c) => {
        const used = cn.reduce((t, n) => t + n.value * scale, 0) + gap * Math.max(0, cn.length - 1); let y = (H - used) / 2;
        cn.forEach(n => { n.h = Math.max(2, n.value * scale); n.x = cols === 1 ? x0 : x0 + c * (x1 - x0 - nodeW) / (cols - 1); n.y = y; y += n.h + gap; });
    });
    const outOff = new Map<string, number>(), inOff = new Map<string, number>(); nodes.forEach(n => { outOff.set(n.id, 0); inOff.set(n.id, 0); });
    const ordered = keep.slice().sort((a, b) => byId.get(a.target).y - byId.get(b.target).y || b.value - a.value);
    const lls: LLink[] = ordered.map(l => ({ ...l, sy: 0, ty: 0, w: Math.max(1, l.value * scale), color: byId.get(l.source).color }));
    lls.forEach(l => { const a = byId.get(l.source); l.sy = a.y + outOff.get(a.id) + l.w / 2; outOff.set(a.id, outOff.get(a.id) + l.w); });
    lls.slice().sort((a, b) => byId.get(a.source).y - byId.get(b.source).y).forEach(l => { const b = byId.get(l.target); l.ty = b.y + inOff.get(b.id) + l.w / 2; inOff.set(b.id, inOff.get(b.id) + l.w); });
    return { nodes, links: lls, cols, dropped: links.length - keep.length };
}

export class FlowExplorerRenderer implements Renderer {
    render(ctx: Ctx): void {
        const td = ctx.td; const agg = new Map<string, FLink>();
        for (let r = 0; r < td.n; r++) {
            const v = td.num(r, "value"); const a = td.str(r, "source") || "(blank)", b = td.str(r, "target") || "(blank)"; if (v === null || v <= 0) { continue; }
            const k = a + "\u0000" + b; const l = agg.get(k) || { source: a, target: b, value: 0, rows: [] }; l.value += v; l.rows.push(r); agg.set(k, l);
        }
        const maxLinks = Math.max(5, Number(ctx.get("flow", "maxLinks")) || 60);
        const links = Array.from(agg.values()).sort((a, b) => b.value - a.value).slice(0, maxLinks);
        if (!links.length) { ctx.body.appendChild(h("div", { class: "dbi-empty" }, "No positive flows to draw.")); return; }
        const fontPx = parseFloat(getComputedStyle(ctx.body).fontSize) || 12; const nodeW = Math.max(6, Number(ctx.get("flow", "nodeWidth")) || 14);
        const W = Math.max(240, ctx.w - 4), H = Math.max(160, ctx.h - 6); const labelW = Math.min(W * 0.2, fontPx * 9);
        const L = layoutSankey(links, labelW, W - labelW, H - 8, nodeW, ctx.palette);
        const svg = s("svg", { class: "dbi-svg dbi-flow", style: { "--lo": String((Number(ctx.get("flow", "linkOpacity")) || 38) / 100) }, viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": "Flow diagram" });
        const showVals = !!ctx.get("flow", "showValues");
        const nodeEls: Record<string, Element> = {}; const linkEls: { el: Element; l: LLink }[] = [];
        const focus = (id: string | null, link: LLink | null) => {
            linkEls.forEach(x => { const on = !id && !link ? true : link ? x.l === link : (x.l.source === id || x.l.target === id); x.el.setAttribute("class", "link" + (on ? " on" : " faded")); });
            Object.keys(nodeEls).forEach(k => { const on = !id && !link ? true : link ? (link.source === k || link.target === k) : (k === id || L.links.some(x => (x.source === id && x.target === k) || (x.target === id && x.source === k))); nodeEls[k].setAttribute("class", "node" + (on ? "" : " faded")); });
        };
        L.links.forEach(l => {
            const a = L.nodes.filter(n => n.id === l.source)[0], b = L.nodes.filter(n => n.id === l.target)[0]; const x0 = a.x + nodeW, x1 = b.x, xm = (x0 + x1) / 2;
            const sel = l.rows.some(r => ctx.isSelected(r));
            const p = s("path", { class: "link", d: "M" + x0 + "," + l.sy + " C" + xm + "," + l.sy + " " + xm + "," + l.ty + " " + x1 + "," + l.ty, stroke: l.color, "stroke-width": l.w, opacity: ctx.anySelected() && !sel ? 0.3 : 1,
                onclick: (e: MouseEvent) => { e.stopPropagation(); ctx.select(l.rows, e.ctrlKey || e.metaKey); },
                onmousemove: (e: MouseEvent) => { focus(null, l); ctx.showTip(e, [{ displayName: l.source + " → " + l.target, value: fmtNum(l.value) }].concat(ctx.tipItems(l.rows[0])), l.rows); },
                onmouseleave: () => { focus(null, null); ctx.hideTip(); } });
            ctx.mark(p, l.rows); svg.appendChild(p); linkEls.push({ el: p, l });
        });
        L.nodes.forEach(n => {
            const r = s("rect", { class: "node", x: n.x, y: n.y, width: nodeW, height: n.h, rx: 3, fill: n.color,
                onclick: (e: MouseEvent) => { e.stopPropagation(); ctx.select(n.rows, e.ctrlKey || e.metaKey); },
                onmousemove: (e: MouseEvent) => { focus(n.id, null); ctx.showTip(e, [{ displayName: n.id, value: fmtNum(n.value) }], n.rows); }, onmouseleave: () => { focus(null, null); ctx.hideTip(); } });
            ctx.mark(r, n.rows); nodeEls[n.id] = r; svg.appendChild(r);
            const right = n.col < L.cols - 1 || L.cols === 1; const tx = right ? n.x + nodeW + 5 : n.x - 5;
            svg.appendChild(s("text", { x: tx, y: n.y + n.h / 2 + 4, "text-anchor": right ? "start" : "end", style: { fill: "var(--ink)" } }, truncate(n.id, Math.floor(labelW / (fontPx * 0.45))) + (showVals && n.h > fontPx ? "  " + fmtNum(n.value) : "")));
        });
        ctx.body.appendChild(svg);
        if (L.dropped) { ctx.body.appendChild(h("p", { class: "dbi-note" }, L.dropped + " looping or self-referencing link(s) were left out of the layout.")); }
    }
}
