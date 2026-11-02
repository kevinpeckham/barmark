import { renderChart } from "@barmark/render";

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
