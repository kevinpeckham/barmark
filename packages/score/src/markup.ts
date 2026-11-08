export type ScoreTheme = "auto" | "light" | "dark";

const BLOCKS = /<(script|foreignObject)\b(?:[^>"']|"[^"]*"|'[^']*')*(?:\/>|>[\s\S]*?<\/\1\s*>)/gi;
const STRAY = /<\/?(?:script|foreignObject)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const TAG = /<[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*>/g;
const ATTRIBUTE = /\s+([^\s=/>"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;

function keepAttribute(name: string, value: string | undefined): boolean {
	const n = name.toLowerCase();
	if (n.startsWith("on")) return false;
	if (n === "href" || n === "xlink:href") {
		const v = (value ?? "").replace(/^["']|["']$/g, "").trim();
		return v.startsWith("#");
	}
	return true;
}

/** Verovio's SVG without anything that runs or leaves the page: no `script`, no `foreignObject`, no `on*` attribute, only `#` links. */
export function cleanSvg(svg: string): string {
	return svg
		.replace(BLOCKS, "")
		.replace(STRAY, "")
		.replace(TAG, (tag) =>
			tag.replace(ATTRIBUTE, (all, name: string, value: string | undefined) =>
				keepAttribute(name, value) ? all : "",
			),
		);
}

/**
 * The score's own layout. Colour comes from `@barmark/render`'s stylesheet
 * (the `.bm-chart` wrapper that `scorePane` writes), which must be in the same
 * shadow root; Verovio draws in `currentColor`.
 */
export const scoreStyles = `.bms-score{padding:1rem;color:inherit;background:transparent}
.bms-score-page{width:100%}
.bms-score-page svg{display:block;width:100%;height:auto}
.bms-score-page svg *{fill:currentColor;stroke:currentColor}
.bms-score-page svg :is(.pgHead,.pgFoot) text{fill:currentColor}`;

/** The cleaned pages in a themed pane: render's `.bm-chart` supplies the palette. */
export function scorePane(svg: string, theme: ScoreTheme): string {
	return `<div class="bm-chart" data-theme="${theme}"><div class="bms-score">${cleanSvg(svg)}</div></div>`;
}
