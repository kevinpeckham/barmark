import { renderChart, renderChartUnwrapped, stylesheet } from "@barmark/render";

const options = { theme: "dark", rehearsalLetters: true } as const;

/** The chart's markup, or an empty chart's: a keystroke can never break the page. */
function safely(render: (text: string) => string, text: string): string {
	try {
		return render(text);
	} catch {
		return render("");
	}
}

/**
 * The chart as `<barmark-chart>` markup with a declarative shadow root, for
 * the prerendered page. The parser reports problems as diagnostics rather
 * than throwing; the catch is a last guard.
 */
export function chartHtml(text: string): string {
	return safely((t) => renderChart(t, options), text);
}

/**
 * Draws the chart into `host` from script. A declarative shadow root attaches
 * only when HTML is parsed, so this uses setHTMLUnsafe; browsers without it
 * (Chrome before 124, Safari before 17.4, Firefox before 133) get the same
 * shadow root built by hand from the same parts.
 */
export function showChart(host: HTMLElement, text: string): void {
	if ("setHTMLUnsafe" in host) {
		host.setHTMLUnsafe(chartHtml(text));
		return;
	}
	const chart = document.createElement("barmark-chart");
	chart.attachShadow({
		mode: "open",
	}).innerHTML = `<style>${stylesheet}</style>${safely((t) => renderChartUnwrapped(t, options), text)}`;
	(host as HTMLElement).replaceChildren(chart);
}
