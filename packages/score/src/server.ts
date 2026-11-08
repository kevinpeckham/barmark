// The server entry. It imports only @barmark/render, ./switch.js and ./markup.js:
// never ./index.js, whose engine reaches the Verovio worker.
import {
	fontFaceCss,
	type RenderOptions,
	renderChart,
	renderChartUnwrapped,
	stylesheet,
} from "@barmark/render";
import { scoreStyles } from "./markup.js";
import { type ScoreView, switchHtml, switchStyles } from "./switch.js";

export type ScoreOptions = RenderOptions & { view?: ScoreView };

export { switchHtml };

/** Chart text for a `<script>`: the two sequences that would end or hide it are written with a backslash. */
const carry = (text: string) =>
	text.replace(/<\/(script)/gi, "<\\/$1").replaceAll("<!--", "<\\!--");

/** The text `renderScoreHtml` carried, as it was given. */
export const decodeCarried = (text: string) =>
	text.replace(/<\\\/(script)/gi, "</$1").replaceAll("<\\!--", "<!--");

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
	const { view = "grid", fontUrl, ...gridOptions } = options;
	const font = fontUrl ? `<style>${fontFaceCss(fontUrl)}</style>` : "";
	const grid = renderChartUnwrapped(text, gridOptions);
	const attrs = `${gridAttributes(gridOptions)}${view === "score" ? ' view="score"' : ""}`;
	const styles = `<style>${stylesheet}${switchStyles}${scoreStyles}</style>`;
	return `${font}<barmark-score${attrs}><template shadowrootmode="open">${styles}${switchHtml(view)}<div class="bms-grid">${grid}</div><div class="bms-score" hidden></div></template><script type="text/barmark">${carry(text)}</script></barmark-score>`;
}
