import { FONT_FAMILY } from "./font.js";

/**
 * The chart's styles. Everything is sized in em from `--barmark-size`, so
 * text size and zoom scale the chart; colours come from the palettes below
 * unless the page sets the `--barmark-*` custom properties.
 */

export type Palette = { ink: string; paper: string; muted: string; rule: string; accent: string };

/** Both pass WCAG AA on their paper (tests/contrast.test.ts). */
export const PALETTES: { light: Palette; dark: Palette } = {
	light: { ink: "#1d1d1f", paper: "#fffdf8", muted: "#6a6052", rule: "#4a4a4a", accent: "#9a4a12" },
	dark: { ink: "#ece8e0", paper: "#1b1a18", muted: "#a8a092", rule: "#8f897f", accent: "#e8a56a" },
};

/** Section widths, in em, at which a section stops aligning columns and wraps its rows. */
export const FIT_STEPS = Array.from({ length: 23 }, (_, i) => 8 + i * 4);

const colours = (p: Palette) =>
	(Object.keys(p) as (keyof Palette)[])
		.map((k) => `--bm-${k}:var(--barmark-${k},${p[k]});`)
		.join("");

const SANS = `system-ui,-apple-system,"Segoe UI",sans-serif`;

const css = `
:host{all:initial;display:block}
.bm-chart{${colours(PALETTES.light)}
	container:bm/inline-size;
	font-family:var(--barmark-font,"${FONT_FAMILY}","Edwin",Georgia,serif);
	font-size:var(--barmark-size,1.25rem);
	line-height:1.3;color:var(--bm-ink);background:var(--bm-paper);
	padding:1em 1.2em;box-sizing:border-box;text-align:start}
.bm-chart *{box-sizing:border-box}
.bm-chart[data-theme="dark"]{${colours(PALETTES.dark)}color-scheme:dark}
@media (prefers-color-scheme:dark){.bm-chart[data-theme="auto"]{${colours(PALETTES.dark)}color-scheme:dark}}
@media print{.bm-chart[data-theme]{${colours(PALETTES.light)}color-scheme:light}}
.bm-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.bm-header{margin-bottom:.8em}
.bm-title{font-size:1.5em;font-weight:normal;margin:0 0 .15em}
.bm-meta,.bm-directive{font-family:${SANS};font-size:.62em;color:var(--bm-muted);margin:0}
.bm-directive{grid-column:1/-1;margin:.9em 0 .3em}
.bm-section{margin-top:.9em}
.bm-heading{display:flex;align-items:center;gap:.5em;margin:0 0 .4em;font:600 .6em/1 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:var(--bm-ink)}
.bm-rehearsal{border:.12em solid currentColor;padding:.15em .35em;border-radius:.15em;letter-spacing:0}
.bm-times{font:italic 1.2em/1 Georgia,serif;text-transform:none;letter-spacing:0;color:var(--bm-muted)}
.bm-grid{display:grid;grid-template-columns:auto repeat(var(--bm-cols),auto) auto;width:max-content;max-width:100%}
.bm-chart[data-bar-numbers="off"] .bm-grid{grid-template-columns:repeat(var(--bm-cols),auto) auto}
.bm-row{display:contents}
.bm-bar-number{font:.5em/1 ${SANS};color:var(--bm-muted);padding:1.6em .8em 0 0;text-align:end}
.bm-bar{position:relative;display:flex;align-items:baseline;min-width:2.6em;min-height:2.2em;padding:.65em .7em .25em;border-right:.075em solid var(--bm-rule)}
.bm-row>div.bm-bar:first-of-type{border-left:.075em solid var(--bm-rule)}
.bm-row>div.bm-bar[data-repeat-start]{border-left:.25em double var(--bm-rule)}
.bm-row>div.bm-bar[data-repeat-end]{border-right:.25em double var(--bm-rule)}
.bm-bar-body{display:flex;flex:1;align-items:baseline;justify-content:space-around;gap:.6em}
.bm-repeat{display:flex;align-items:center;padding-left:.4em;white-space:nowrap}
.bm-repeat .bm-times{font-size:.75em}
.bm-chord{white-space:nowrap}
.bm-chord sup{font-size:.62em;vertical-align:.55em;line-height:0}
.bm-chord sub{font-size:.6em;line-height:0}
.bm-hold,.bm-unknown,.bm-brace{color:var(--bm-muted)}
.bm-nc{font-size:.72em;letter-spacing:.06em}
.bm-silence{display:inline-block;width:.9em;height:.32em;background:var(--bm-ink);vertical-align:.25em}
.bm-ring{display:inline-block;min-width:1.4em;padding:0 .3em;border:.07em solid currentColor;border-radius:1em;text-align:center}
.bm-notes{display:inline-flex;gap:.3em;align-items:baseline}
.bm-notes u{text-decoration-thickness:.08em;text-underline-offset:.15em}
.bm-group{position:relative;display:inline-flex;gap:.45em;align-items:baseline}
.bm-group::before{content:"";position:absolute;left:0;right:0;top:-.45em;height:.3em;border:.06em solid var(--bm-muted);border-bottom:none}
.bm-tuplet{position:absolute;left:50%;top:-1.25em;transform:translateX(-50%);font:italic 600 .55em/1 Georgia,serif;color:var(--bm-muted);background:var(--bm-paper);padding:0 .3em}
.bm-meter{display:inline-flex;flex-direction:column;align-items:center;align-self:center;font:700 .5em/.95 ${SANS};color:var(--bm-muted)}
.bm-fermata-glyph{display:block;color:var(--bm-ink)}
.bm-bar[data-cut]{outline:.08em dashed var(--bm-muted);outline-offset:-.25em}
.bm-cut{position:absolute;top:.3em;right:.45em;font:.42em/1 ${SANS};color:var(--bm-muted)}
.bm-text{grid-column:1/-1;margin:.2em 0 .5em;font-size:.8em}
.bm-note{font-size:.7em;font-weight:600}
.bm-error{grid-column:1/-1;margin:.3em 0}
.bm-error code{font:.7em/1.4 ui-monospace,Menlo,Consolas,monospace;text-decoration:underline wavy var(--bm-accent);text-decoration-thickness:.08em;text-underline-offset:.25em;white-space:pre-wrap}
.bm-diagnostics{margin:1em 0 0;padding-left:1.2em;font:.55em/1.5 ${SANS};color:var(--bm-muted)}
.bm-diagnostics .bm-error{color:var(--bm-accent)}
@media (forced-colors:active){
	.bm-bar,.bm-row>div.bm-bar:first-of-type,.bm-row>div.bm-bar[data-repeat-start],.bm-row>div.bm-bar[data-repeat-end]{border-color:CanvasText}
	.bm-ring,.bm-group::before{border-color:CanvasText}
	.bm-silence{background:CanvasText;forced-color-adjust:none}
	.bm-bar[data-cut]{outline-color:CanvasText}
}
${FIT_STEPS.map((w) => {
	const g = `.bm-grid[data-fit="${w}"]`;
	return `@container bm (max-width:${w}em){${g}{display:block}${g}>.bm-row{display:flex;flex-wrap:wrap}${g} .bm-empty{display:none}${g} .bm-bar{flex:0 0 auto;border-left:.075em solid var(--bm-rule);margin-left:-.075em}}`;
}).join("\n")}
`;

/** Collapse the readable source above: whitespace around punctuation and between rules. */
const minify = (text: string) =>
	text
		.replace(/\n\s*/g, "")
		.replace(/\s*([{};,>])\s*/g, "$1")
		.replace(/:\s+/g, ":");

export const stylesheet = minify(css);
