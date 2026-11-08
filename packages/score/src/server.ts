// The server entry. It imports only @barmark/render, ./shell.js, ./switch.js and ./markup.js:
// never ./index.js, whose engine reaches the Verovio worker.
import {
	fontFaceCss,
	type RenderOptions,
	renderChart,
	renderChartUnwrapped,
} from "@barmark/render";
import { carry, scoreShell } from "./shell.js";
import { type ScoreView, switchHtml, viewOf } from "./switch.js";

export type ScoreOptions = RenderOptions & { view?: ScoreView };

export { decodeCarried } from "./shell.js";
export { switchHtml };

/** The attributes `renderChart` writes for these options, so the two elements agree. */
function gridAttributes(options: Omit<RenderOptions, "fontUrl">): string {
	const html = renderChart("", options);
	return /^<barmark-chart([^>]*)>/.exec(html)?.[1] ?? "";
}

/**
 * `<barmark-score>` drawn on the server: the grid, the Grid / Score switch and
 * the chart text, so the grid shows before any script runs. The score is
 * engraved by the element once it loads.
 */
export function renderScoreHtml(text: string, options: ScoreOptions = {}): string {
	const { view: asked, fontUrl, ...gridOptions } = options;
	const view = viewOf(asked);
	const font = fontUrl ? `<style>${fontFaceCss(fontUrl)}</style>` : "";
	const grid = renderChartUnwrapped(text, gridOptions);
	const attrs = `${gridAttributes(gridOptions)}${view === "score" ? ' view="score"' : ""}`;
	return `${font}<barmark-score${attrs}><template shadowrootmode="open">${scoreShell(grid, view)}</template><script type="text/barmark">${carry(text)}</script></barmark-score>`;
}
