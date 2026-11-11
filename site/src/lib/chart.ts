import { renderChart } from "@barmark/render";
import { ENGRAVER_CDN_INTEGRITY, ENGRAVER_CDN_URL, ENGRAVER_WASM_INTEGRITY } from "@barmark/score";
import { renderScoreHtml } from "@barmark/score/server";

// The site's charts never wrap: a section wider than its box keeps its rows, and the box scrolls.
const options = { theme: "dark", rehearsalLetters: true, wrap: false } as const;

/**
 * The chart as `<barmark-chart>` markup with a declarative shadow root, for
 * the prerendered page; the element takes it from there. The parser reports
 * problems as diagnostics rather than throwing; the catch is a last guard.
 */
export function chartHtml(
	text: string,
	{ barNumbers = true }: { barNumbers?: boolean } = {},
): string {
	const chosen = { ...options, barNumbers };
	try {
		return renderChart(text, chosen);
	} catch {
		return renderChart("", chosen);
	}
}

/** When `<barmark-score>` starts loading Verovio: on its first switch, on intent, or once the page is idle. */
export type Preload = "none" | "intent" | "idle";

/**
 * The attributes every score on the site carries: the lighter Verovio
 * (`@barmark/engraver`) from jsDelivr, its module and its `.wasm` each checked
 * against a digest (on a mismatch or a failed download the element loads its
 * own copy of stock Verovio), and when to start loading it.
 */
function engineAttributes(preload: Preload): string {
	const when = preload === "none" ? "" : ` preload="${preload}"`;
	return ` verovio-url="${ENGRAVER_CDN_URL}" verovio-integrity="${ENGRAVER_CDN_INTEGRITY}" verovio-wasm-integrity="${ENGRAVER_WASM_INTEGRITY}"${when}`;
}

/**
 * The chart as `<barmark-score>` markup: the same grid, with the Grid / Score
 * switch, and the chart's text carried for the score. Verovio is never
 * imported here; the element engraves once a reader picks Score.
 */
export function scoreHtml(
	text: string,
	{ barNumbers = true, preload = "none" }: { barNumbers?: boolean; preload?: Preload } = {},
): string {
	const chosen = { ...options, barNumbers };
	let html: string;
	try {
		html = renderScoreHtml(text, chosen);
	} catch {
		html = renderScoreHtml("", chosen);
	}
	return html.replace("<barmark-score", `<barmark-score${engineAttributes(preload)}`);
}
