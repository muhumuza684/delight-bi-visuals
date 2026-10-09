import { Ctx, Renderer } from "./core/baseVisual";
import { h } from "./core/dom";
import { clamp, fmtNum, fmtPct } from "./core/format";

export interface Driver { name: string; base: number; rows: number[] }
export function scenarioTotals(drivers: Driver[], adj: Record<string, number>): { base: number; scenario: number; delta: number; pct: number | null } {
    const base = drivers.reduce((t, d) => t + d.base, 0); const scenario = drivers.reduce((t, d) => t + d.base * (1 + (adj[d.name] || 0) / 100), 0);
    return { base, scenario, delta: scenario - base, pct: base ? (scenario - base) / Math.abs(base) : null };
}

export class ScenarioPlannerRenderer implements Renderer {
    private adj: Record<string, number> = {}; private lastSaved = "{}"; private timer: any = null;
    render(ctx: Ctx): void {
        const td = ctx.td; const map = new Map<string, Driver>(); let target: number | null = null;
        for (let r = 0; r < td.n; r++) {
            const k = td.str(r, "driver") || "(blank)"; const d = map.get(k) || { name: k, base: 0, rows: [] }; d.base += td.num(r, "base") || 0; d.rows.push(r); map.set(k, d);
            const t = td.has("target") ? td.num(r, "target") : null; if (t !== null) { target = (target || 0) + t; }
        }
        const drivers = Array.from(map.values());
        const range = clamp(Number(ctx.get("scenario", "range")) || 50, 5, 200);
        const stored = String(ctx.stored("scenario", "state", "{}"));
        if (stored !== this.lastSaved) { try { this.adj = JSON.parse(stored) || {}; } catch (e) { this.adj = {}; } this.lastSaved = stored; }
        const save = () => { clearTimeout(this.timer); this.timer = setTimeout(() => { const j = JSON.stringify(this.adj); this.lastSaved = j; ctx.persist("scenario", "state", j); }, 400); };

        const baseV = h("b", null), scenV = h("b", null), deltaV = h("b", null), tgtV = h("b", null);
        const stat = (l: string, v: HTMLElement) => h("div", { class: "dbi-stat" }, h("small", null, l), v);
        ctx.body.appendChild(h("div", { class: "dbi-stats" }, stat("Base total", baseV), stat("Scenario total", scenV), stat("Delta", deltaV), target !== null ? stat("Scenario vs target", tgtV) : null));
        const rowsEl: { d: Driver; val: HTMLElement; pct: HTMLElement; slider: HTMLInputElement }[] = [];
        const refresh = () => {
            const t = scenarioTotals(drivers, this.adj);
            baseV.textContent = fmtNum(t.base); scenV.textContent = fmtNum(t.scenario);
            deltaV.textContent = (t.delta >= 0 ? "+" : "") + fmtNum(t.delta) + (t.pct !== null ? " (" + fmtPct(t.pct, 1) + ")" : ""); deltaV.className = t.delta >= 0 ? "dbi-pos" : "dbi-neg";
            if (target !== null) { const g = t.scenario - target; tgtV.textContent = (g >= 0 ? "+" : "") + fmtNum(g); tgtV.className = g >= 0 ? "dbi-pos" : "dbi-neg"; }
            rowsEl.forEach(r => { const a = this.adj[r.d.name] || 0; r.val.textContent = fmtNum(r.d.base * (1 + a / 100)); r.pct.textContent = (a > 0 ? "+" : "") + a + "%"; r.slider.value = String(a); });
        };
        const setAll = (v: number | null) => { drivers.forEach(d => { if (v === null) { delete this.adj[d.name]; } else { this.adj[d.name] = clamp(v, -range, range); } }); refresh(); save(); };
        ctx.tools.appendChild(h("button", { class: "dbi-btn dbi-btn--ghost", type: "button", onclick: (e: Event) => { e.stopPropagation(); setAll(null); } }, "Reset"));
        ctx.tools.appendChild(h("button", { class: "dbi-btn dbi-btn--ghost", type: "button", onclick: (e: Event) => { e.stopPropagation(); setAll(10); } }, "+10% all"));
        ctx.tools.appendChild(h("button", { class: "dbi-btn dbi-btn--ghost", type: "button", onclick: (e: Event) => { e.stopPropagation(); setAll(-10); } }, "−10% all"));
        const list = h("div", null);
        drivers.forEach(d => {
            const slider = h("input", { type: "range", min: -range, max: range, step: Math.max(1, Number(ctx.get("scenario", "step")) || 1), value: this.adj[d.name] || 0, "aria-label": d.name + " change in percent" }) as HTMLInputElement;
            const pct = h("span", { class: "v" }); const val = h("span", { class: "v" });
            slider.addEventListener("input", () => { this.adj[d.name] = Number(slider.value); refresh(); save(); });
            slider.addEventListener("click", (e: Event) => e.stopPropagation());
            rowsEl.push({ d, val, pct, slider });
            list.appendChild(h("div", { class: "dbi-drv", style: ctx.get("scenario", "showBase") ? {} : { gridTemplateColumns: "8em 1fr 9em" }, onmousemove: (e: MouseEvent) => ctx.showTip(e, [{ displayName: d.name, value: "Base " + fmtNum(d.base) }].concat(ctx.tipItems(d.rows[0])), d.rows), onmouseleave: () => ctx.hideTip() },
                h("span", { title: d.name, style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" } }, d.name), slider, ctx.get("scenario", "showBase") ? h("span", { class: "v base" }, fmtNum(d.base)) : null, h("span", null, pct, " → ", val)));
        });
        ctx.body.appendChild(list); refresh();
        ctx.body.appendChild(h("p", { class: "dbi-note" }, "Scenarios are calculated in this visual only. Your data model is never changed."));
    }
}
