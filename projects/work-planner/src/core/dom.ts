export type Child = Node | string | number | null | undefined | false;

function apply(el: Element, attrs?: Record<string, any> | null): void {
    if (!attrs) { return; }
    for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) { continue; }
        if (k === "style" && typeof v === "object") { Object.assign((el as HTMLElement).style, v); }
        else if (k.length > 2 && k.indexOf("on") === 0 && typeof v === "function") { el.addEventListener(k.slice(2).toLowerCase(), v); }
        else if (k === "text") { el.textContent = String(v); }
        else { el.setAttribute(k, v === true ? "" : String(v)); }
    }
}
function append(el: Element, kids: Child[]): void {
    for (const c of kids) {
        if (c === null || c === undefined || c === false) { continue; }
        el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
    }
}
export function h(tag: string, attrs?: Record<string, any> | null, ...kids: Child[]): HTMLElement {
    const el = document.createElement(tag); apply(el, attrs); append(el, kids); return el;
}
export function s(tag: string, attrs?: Record<string, any> | null, ...kids: Child[]): SVGElement {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag); apply(el, attrs); append(el, kids); return el;
}
export function clear(el: Element): void { while (el.firstChild) { el.removeChild(el.firstChild); } }
