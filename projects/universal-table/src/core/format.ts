export const PALETTE = ["#104F9F", "#308ABE", "#96D8E8", "#EC0A8C", "#178A63", "#B57900", "#7A5AF8", "#C33B5E", "#2876A8", "#5B6E85"];

export function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

export function fmtNum(n: number | null | undefined, fmt?: string): string {
    if (n === null || n === undefined || isNaN(n)) { return "–"; }
    if (fmt && fmt.indexOf("%") >= 0) { return (n * 100).toFixed(Math.abs(n) < 0.1 ? 1 : 0) + "%"; }
    const a = Math.abs(n);
    if (a >= 1e9) { return (n / 1e9).toFixed(2) + "B"; }
    if (a >= 1e6) { return (n / 1e6).toFixed(2) + "M"; }
    if (a >= 1e4) { return (n / 1e3).toFixed(1) + "K"; }
    if (Number.isInteger(n)) { return n.toLocaleString("en-US"); }
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
export function fmtPct(n: number | null | undefined, digits = 1): string {
    if (n === null || n === undefined || isNaN(n) || !isFinite(n)) { return "–"; }
    return (n * 100).toFixed(digits) + "%";
}
export function toDate(v: any): Date | null {
    if (v === null || v === undefined || v === "") { return null; }
    if (v instanceof Date) { return isNaN(v.getTime()) ? null : v; }
    if (typeof v === "number" && v > 20000000000) { return new Date(v); }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}
export function fmtDate(d: Date | null): string {
    return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "–";
}
export function truncate(t: string, max: number): string {
    return t.length > max ? t.slice(0, Math.max(1, max - 1)) + "…" : t;
}
export function niceTicks(min: number, max: number, count = 5): { ticks: number[]; min: number; max: number } {
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min === max) { if (min === 0) { max = 1; } else { const p = Math.abs(min) * 0.1; min -= p; max += p; } }
    const raw = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const nmin = Math.floor(min / step) * step;
    const nmax = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let t = nmin; t <= nmax + step / 2; t += step) { ticks.push(Math.abs(t) < step / 1e6 ? 0 : t); }
    return { ticks, min: nmin, max: nmax };
}
export function sum(a: number[]): number { let t = 0; for (const x of a) { t += x; } return t; }
