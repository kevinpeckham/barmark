// What the server and the element both write inside `<barmark-score>`'s shadow root,
// so client-drawn and server-drawn markup are the same. Verovio-free, like ./server.js.
import { stylesheet } from "@barmark/render";
import { scoreStyles } from "./markup.js";
import { type ScoreView, switchHtml, switchStyles } from "./switch.js";

/** Chart text for a `<script>`: the two sequences that would end or hide it are written with a backslash. */
export const carry = (text: string) =>
	text.replace(/<\/(script)/gi, "<\\/$1").replaceAll("<!--", "<\\!--");

/** The text `renderScoreHtml` carried, as it was given. */
export const decodeCarried = (text: string) =>
	text.replace(/<\\\/(script)/gi, "</$1").replaceAll("<\\!--", "<!--");

/** The shadow root's content around a drawn grid: styles, the switch, the grid, the (empty) score pane. */
export const scoreShell = (grid: string, view: ScoreView) =>
	`<style>${stylesheet}${switchStyles}${scoreStyles}</style>${switchHtml(view)}<div class="bms-grid">${grid}</div><div class="bms-pane" hidden></div>`;

const ENTITIES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

/** A chart that could not be loaded, drawn where the grid would be, as `<barmark-chart>` draws it. */
export function gridError(message: string, theme: string): string {
	const m = escapeHtml(message);
	return `<div class="bm-chart" data-theme="${escapeHtml(theme)}"><div class="bm-error" title="${m}"><code></code><span class="bm-sr">Error: ${m}</span></div></div>`;
}
