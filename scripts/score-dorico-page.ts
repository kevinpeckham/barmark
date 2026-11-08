import { cleanSvg } from "../packages/score/src/markup.js";

/** One chart: Verovio's engraving (SVG markup) and Dorico's PDF (a path relative to the page). */
export type Entry = { name: string; svg: string; pdf: string };

const esc = (s: string): string =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const row = ({ name, svg, pdf }: Entry): string => `<section>
<h2>${esc(name)}</h2>
<div class="pair">
<figure><figcaption>Verovio</figcaption><div class="verovio">${cleanSvg(svg)}</div></figure>
<figure><figcaption>Dorico</figcaption><embed src="${esc(pdf)}" type="application/pdf"></figure>
</div>
</section>`;

const STYLE = `body{margin:0;padding:16px;background:#f4f4f1;color:#222;font:14px system-ui,sans-serif}
h2{margin:24px 0 8px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
figure{margin:0;background:#fff;border:1px solid #ccc;padding:8px}
figcaption{font-weight:600;margin-bottom:8px}
.verovio svg{max-width:100%;height:auto}
embed{width:100%;height:1100px}`;

/** A self-contained page: a row per chart, Verovio's score beside Dorico's PDF. */
export function sideBySide(entries: Entry[]): string {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verovio beside Dorico</title>
<style>${STYLE}</style></head><body>
<h1>Verovio beside Dorico</h1>
${entries.map(row).join("\n")}
</body></html>
`;
}
