import { renderChart } from "@barmark/render";

const options = { theme: "dark" } as const;

/**
 * The chart as `<barmark-chart>` markup with a declarative shadow root.
 * The parser reports problems as diagnostics rather than throwing; the
 * catch is a last guard so a keystroke can never break the page.
 */
export function chartHtml(text: string): string {
	try {
		return renderChart(text, options);
	} catch {
		return renderChart("", options);
	}
}
