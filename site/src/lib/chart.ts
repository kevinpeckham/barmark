import { renderChart } from "@barmark/render";
import { ENGRAVER_CDN_INTEGRITY, ENGRAVER_CDN_URL, ENGRAVER_WASM_INTEGRITY } from "@barmark/score";
import { renderScoreHtml } from "@barmark/score/server";

// The site's charts never wrap: a section wider than its box keeps its rows, and the box scrolls.
const options = { theme: "dark", rehearsalLetters: true, wrap: false } as const;

/**
 * What a chart on the site may change: its bar numbers, a strip of guitar chord
 * diagrams, and whether a lead sheet's melody line is drawn in the grid (the
 * score always engraves it).
 */
type Look = { barNumbers?: boolean; chordDiagrams?: boolean; melody?: boolean };

/**
 * The renderer's options for a look; with diagrams off or the melody shown the
 * option is left out, so the markup is as before.
 */
const chosen = ({ barNumbers = true, chordDiagrams = false, melody = true }: Look) => ({
	...options,
	barNumbers,
	...(chordDiagrams ? { chordDiagrams: "guitar" as const } : {}),
	...(melody ? {} : { melody: false }),
});

/**
 * The chart as `<barmark-chart>` markup with a declarative shadow root, for
 * the prerendered page; the element takes it from there. The parser reports
 * problems as diagnostics rather than throwing; the catch is a last guard.
 */
export function chartHtml(text: string, look: Look = {}): string {
	const opts = chosen(look);
	try {
		return renderChart(text, opts);
	} catch {
		return renderChart("", opts);
	}
}

/** A `<barmark-score>`'s two views. */
export type View = "grid" | "score";

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
 * imported here; the element engraves once a reader picks Score, or once it
 * loads when `view` is `"score"` (the grid is what the markup shows).
 */
export function scoreHtml(
	text: string,
	{ preload = "none", view = "grid", ...look }: Look & { preload?: Preload; view?: View } = {},
): string {
	const opts = { ...chosen(look), ...(view === "score" ? { view } : {}) };
	let html: string;
	try {
		html = renderScoreHtml(text, opts);
	} catch {
		html = renderScoreHtml("", opts);
	}
	return html.replace("<barmark-score", `<barmark-score${engineAttributes(preload)}`);
}
