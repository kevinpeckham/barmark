import { renderChart } from "@barmark/render";
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

/**
 * The chart as `<barmark-score>` markup: the same grid, with the Grid / Score
 * switch, and the chart's text carried for the score. Verovio is never
 * imported here; the element engraves once a reader picks Score.
 */
export function scoreHtml(
	text: string,
	{ barNumbers = true }: { barNumbers?: boolean } = {},
): string {
	const chosen = { ...options, barNumbers };
	try {
		return renderScoreHtml(text, chosen);
	} catch {
		return renderScoreHtml("", chosen);
	}
}
