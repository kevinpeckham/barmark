import { renderChart } from "@barmark/render";
import { renderScoreHtml } from "@barmark/score/server";

// The site's charts never wrap: a section wider than its box keeps its rows, and the box scrolls.
const options = { rehearsalLetters: true, wrap: false } as const;

/** A chart's ground: the site's dark page, or a light panel (the home page's). */
export type Theme = "dark" | "light";

/**
 * What a chart on the site may change: its bar numbers, a strip of guitar chord
 * diagrams, whether a lead sheet's melody line is drawn in the grid (the
 * score always engraves it), and the ground it is drawn for.
 */
type Look = { barNumbers?: boolean; chordDiagrams?: boolean; melody?: boolean; theme?: Theme };

/**
 * The renderer's options for a look; with diagrams off or the melody shown the
 * option is left out, so the markup is as before.
 */
const chosen = ({
	barNumbers = true,
	chordDiagrams = false,
	melody = true,
	theme = "dark",
}: Look) => ({
	...options,
	theme,
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
 * The attribute every score on the site may carry: when to start loading
 * Verovio. No `verovio-url`: the worker loads the package's own lighter build
 * (`@barmark/engraver`), its `.wasm` served from the site's own origin beside
 * the worker, and stock Verovio only if that fails, with one console warning.
 */
function engineAttributes(preload: Preload): string {
	return preload === "none" ? "" : ` preload="${preload}"`;
}

/**
 * The chart as `<barmark-score>` markup: the same grid, with the Grid / Score
 * switch, and the chart's text carried for the score. Verovio is never
 * imported here; the element engraves once a reader picks Score, or once it
 * loads when `view` is `"score"` (the grid is what the markup shows). With
 * `ownSwitch: false` the element leaves its switch out (`switch="off"`): the
 * page draws its own and sets the element's `view`.
 */
export function scoreHtml(
	text: string,
	{
		preload = "none",
		view = "grid",
		ownSwitch = true,
		...look
	}: Look & { preload?: Preload; view?: View; ownSwitch?: boolean } = {},
): string {
	const opts = {
		...chosen(look),
		...(view === "score" ? { view } : {}),
		...(ownSwitch ? {} : { switch: false }),
	};
	let html: string;
	try {
		html = renderScoreHtml(text, opts);
	} catch {
		html = renderScoreHtml("", opts);
	}
	return html.replace("<barmark-score", `<barmark-score${engineAttributes(preload)}`);
}
