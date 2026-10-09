import { Ctx, Renderer } from "./core/baseVisual";
import { h } from "./core/dom";
import { clamp, fmtDate, fmtPct, PALETTE } from "./core/format";

export interface Item { row: number; task: string; start: Date | null; due: Date | null; owner: string; status: string; progress: number | null; group: string }
const DAY = 86400000;

export function isDone(i: Item): boolean { return (i.progress !== null && i.progress >= 1) || /^(done|complete|completed|closed|finished)$/i.test(i.status); }
export function isLate(i: Item, now: number): boolean { return !!i.due && i.due.getTime() < now && !isDone(i); }

export function statusColor(status: string, fallback: string): string {
    if (/done|complete|closed|finished/i.test(status)) { return "#178A63"; }
    if (/block|late|risk|overdue|off/i.test(status)) { return "#C33B5E"; }
    if (/hold|wait|pause/i.test(status)) { return "#B57900"; }
    if (/progress|active|doing|started|ongoing/i.test(status)) { return "#308ABE"; }
    if (/not|todo|backlog|plan|new|open/i.test(status)) { return "#7890A8"; }
    return fallback;
}

export function makeTicks(minT: number, maxT: number): { t: number; label: string }[] {
    const days = (maxT - minT) / DAY; const out: { t: number; label: string }[] = [];
    const d0 = new Date(minT);
    if (days <= 21) {
        for (let t = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime(); t <= maxT; t += DAY) { if (t >= minT) { out.push({ t, label: new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) }); } }
    } else if (days <= 150) {
        let t = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()); t = new Date(t.getTime() + ((8 - (t.getDay() || 7)) % 7) * DAY);
        for (; t.getTime() <= maxT; t = new Date(t.getTime() + 7 * DAY)) { out.push({ t: t.getTime(), label: t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) }); }
    } else {
        const step = days > 1200 ? 6 : days > 600 ? 3 : 1;
        for (let m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); m.getTime() <= maxT; m = new Date(m.getFullYear(), m.getMonth() + step, 1)) {
            out.push({ t: m.getTime(), label: m.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) });
        }
    }
    return out;
}

export class WorkPlannerRenderer implements Renderer {
    private view: string | null = null;
    render(ctx: Ctx): void {
        const td = ctx.td; const now = Date.now(); const all: Item[] = []; let undated = 0;
        for (let r = 0; r < td.n; r++) {
            let due = td.date(r, "due"); let start = td.date(r, "start");
            if (!due && start) { due = start; }
            if (!due) { undated++; continue; }
            if (!start || start.getTime() > due.getTime()) { start = null; }
            let p = td.num(r, "progress"); if (p !== null) { p = clamp(p > 1 ? p / 100 : p, 0, 1); }
            all.push({ row: r, task: td.str(r, "task"), start, due, owner: td.str(r, "owner"), status: td.str(r, "status"), progress: p, group: td.str(r, "group") });
        }
        const hasGroup = td.has("group");
        const gFirst = new Map<string, number>();
        all.forEach(i => { const t = (i.start || i.due).getTime(); if (!gFirst.has(i.group) || t < gFirst.get(i.group)) { gFirst.set(i.group, t); } });
        all.sort((a, b) => (hasGroup ? (gFirst.get(a.group) - gFirst.get(b.group)) || a.group.localeCompare(b.group) : 0) || ((a.start || a.due).getTime() - (b.start || b.due).getTime()));
        const LIMIT = 500; const items = all.slice(0, LIMIT);
        if (!this.view) { this.view = String(ctx.get("planner", "view")); }
        const view = this.view;

        const seg = h("div", { class: "dbi-seg", role: "group", "aria-label": "View" },
            ...["timeline", "list"].map(v => h("button", { type: "button", "aria-pressed": String(view === v), onclick: (e: Event) => { e.stopPropagation(); this.view = v; ctx.redraw(); } }, v === "timeline" ? "Timeline" : "List")));
        ctx.tools.appendChild(seg);

        if (ctx.get("planner", "showSummary")) {
            const done = all.filter(isDone).length; const late = all.filter(i => isLate(i, now)).length;
            const soon = all.filter(i => !isDone(i) && i.due.getTime() >= now && i.due.getTime() <= now + 7 * DAY).length;
            const pr = all.filter(i => i.progress !== null); const avg = pr.length ? pr.reduce((t, i) => t + i.progress, 0) / pr.length : null;
            const stat = (l: string, v: string, cls = "") => h("div", { class: "dbi-stat" }, h("small", null, l), h("b", { class: cls }, v));
            ctx.body.appendChild(h("div", { class: "dbi-stats" }, stat("Tasks", String(all.length)), stat("Complete", String(done)),
                stat("Overdue", String(late), late ? "dbi-neg" : ""), stat("Due in 7 days", String(soon)), stat("Avg progress", avg === null ? "–" : fmtPct(avg, 0))));
        }
        if (!items.length) { ctx.body.appendChild(h("div", { class: "dbi-empty" }, "No tasks with a due date yet.")); return; }

        const colorBy = String(ctx.get("planner", "colorBy")); const keyed: Record<string, string> = {}; let n = 0;
        const colorOf = (i: Item): string => {
            const k = colorBy === "owner" ? i.owner : colorBy === "group" ? i.group : i.status;
            if (!keyed[k]) { keyed[k] = (colorBy === "status" ? statusColor(k, "") : "") || PALETTE[n++ % PALETTE.length]; }
            return keyed[k];
        };
        const pick = (e: MouseEvent, i: Item) => { e.stopPropagation(); ctx.select([i.row], e.ctrlKey || e.metaKey); };
        const tip = (e: MouseEvent, i: Item) => ctx.showTip(e, [
            { displayName: "Task", value: i.task }, { displayName: "Due", value: fmtDate(i.due) },
            ...(i.owner ? [{ displayName: "Owner", value: i.owner }] : []), ...(i.status ? [{ displayName: "Status", value: i.status }] : []),
            ...(i.progress !== null ? [{ displayName: "Progress", value: fmtPct(i.progress, 0) }] : [])].concat(ctx.tipItems(i.row)), [i.row]);
        const dim = (i: Item) => ctx.anySelected() && !ctx.isSelected(i.row);

        if (view === "list") {
            const tbl = h("table", { class: "dbi-table dbi-table--striped" }, h("thead", null, h("tr", null, ...["Task", "Owner", "Status", "Start", "Due", "Progress"].map(t => h("th", null, t)))));
            const tb = h("tbody"); tbl.appendChild(tb);
            items.forEach(i => {
                const tr = h("tr", { class: "dbi-rows" + (dim(i) ? " dbi-dim" : ""), onclick: (e: MouseEvent) => pick(e, i), onmousemove: (e: MouseEvent) => tip(e, i), onmouseleave: () => ctx.hideTip() },
                    h("td", null, i.task), h("td", null, i.owner), h("td", null, i.status ? h("span", { class: "dbi-chip", style: { background: colorOf(i), color: "#fff" } }, i.status) : ""),
                    h("td", null, fmtDate(i.start)), h("td", { class: isLate(i, now) ? "dbi-late" : "" }, fmtDate(i.due)),
                    h("td", null, i.progress === null ? "" : h("div", { class: "dbi-bar", style: { width: "6em" } }, h("i", { style: { width: (i.progress * 100) + "%" } }))));
                ctx.mark(tr, [i.row]); tb.appendChild(tr);
            });
            ctx.body.appendChild(tbl);
        } else {
            const minT = Math.min(...items.map(i => (i.start || i.due).getTime())); const maxT = Math.max(...items.map(i => i.due.getTime()));
            const pad = Math.max((maxT - minT) * 0.03, DAY); const t0 = minT - pad; const t1 = maxT + pad; const span = t1 - t0;
            const pct = (t: number) => ((t - t0) / span * 100);
            const left = ctx.w < 520 ? "9em" : "14em";
            const wrap = h("div", { class: "dbi-gantt", style: { "--left": left } as any });
            const allTicks = makeTicks(t0, t1);
            const fontPx2 = parseFloat(getComputedStyle(ctx.body).fontSize) || 12;
            const trackPx = Math.max(60, ctx.w - (ctx.w < 520 ? 9 : 14) * fontPx2);
            const stepN = Math.max(1, Math.ceil(allTicks.length / Math.max(2, Math.floor(trackPx / (fontPx2 * 6)))));
            const ticks = allTicks.filter((_, i) => i % stepN === 0);
            const head = h("div", { class: "dbi-grow dbi-grow--head" }, h("div", { class: "dbi-gleft" }, h("b", null, "Task")),
                h("div", { class: "dbi-gtrack" }, ...ticks.map(k => h("span", { class: "tick", style: { left: pct(k.t) + "%" } }, k.label))));
            wrap.appendChild(head);
            const grid = h("div", { class: "dbi-ggrid" }, ...ticks.map(k => h("i", { style: { left: pct(k.t) + "%" } })));
            if (ctx.get("planner", "showToday") && now >= t0 && now <= t1) { grid.appendChild(h("i", { class: "today", title: "Today", style: { left: pct(now) + "%" } })); }
            wrap.appendChild(grid);
            let lastGroup: string | null = null;
            items.forEach(i => {
                if (hasGroup && i.group !== lastGroup) { lastGroup = i.group; wrap.appendChild(h("div", { class: "dbi-grow dbi-grow--group" }, h("div", { class: "dbi-gleft" }, i.group || "(No group)"), h("div", { class: "dbi-gtrack" }))); }
                const c = colorOf(i); const late = ctx.get("planner", "showOverdueFlag") && isLate(i, now);
                const track = h("div", { class: "dbi-gtrack" });
                const sT = (i.start || i.due).getTime();
                if (i.start && i.start.getTime() < i.due.getTime()) {
                    const bar = h("div", { class: "dbi-gbar" + (ctx.get("planner", "showProgress") ? "" : " dbi-gbar--solid"), style: { left: pct(sT) + "%", width: Math.max(pct(i.due.getTime()) - pct(sT), 0.6) + "%", background: ctx.get("planner", "showProgress") && /^#[0-9a-f]{6}$/i.test(c) ? c + "40" : c } },
                        ctx.get("planner", "showProgress") && i.progress !== null ? h("i", { style: { width: (i.progress * 100) + "%", background: c } }) : null);
                    track.appendChild(bar);
                } else { track.appendChild(h("div", { class: "dbi-gms", style: { left: pct(i.due.getTime()) + "%", background: c } })); }
                const row = h("div", { class: "dbi-grow dbi-rows" + (dim(i) ? " dbi-dim" : ""), onclick: (e: MouseEvent) => pick(e, i), onmousemove: (e: MouseEvent) => tip(e, i), onmouseleave: () => ctx.hideTip() },
                    h("div", { class: "dbi-gleft", title: i.task }, h("span", { class: "dbi-rag", style: { background: c } }), h("span", { class: "t" + (late ? " dbi-late" : "") }, i.task + (late ? " ⚠" : "")), i.owner && ctx.w >= 520 && ctx.get("planner", "showOwner") ? h("span", { class: "dbi-chip" }, i.owner) : null), track);
                ctx.mark(row, [i.row]); wrap.appendChild(row);
            });
            ctx.body.appendChild(wrap);
        }
        const notes = [undated ? undated + " task(s) without a date are hidden." : "", all.length > LIMIT ? "Showing first " + LIMIT + " of " + all.length + " tasks." : ""].filter(Boolean);
        if (notes.length) { ctx.body.appendChild(h("p", { class: "dbi-note" }, notes.join(" "))); }
    }
}
