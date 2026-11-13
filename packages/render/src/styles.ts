import { DIAGRAM_VIEW } from "./diagram.js";
import { FONT_FAMILY } from "./font.js";

/**
 * The chart's styles. Everything is sized in em from `--barmark-size`, so
 * text size and zoom scale the chart; colours come from the palettes below
 * unless the page sets the `--barmark-*` custom properties.
 */

/**
 * Text sizes as fractions of the chord size, `--barmark-size` (1rem unless
 * the page sets it). Chosen on barmark.dev, 2026-11-01: at the default size
 * nothing a reader needs is under 12px. The superscript is a fraction of its
 * chord and the octave of its note name; everything else of the chord size.
 */
const SIZES = {
	title: 1.16,
	meta: 1,
	directive: 0.97,
	heading: 0.77,
	text: 0.9,
	noChord: 1.03,
	noteNames: 0.9,
	syllables: 0.9,
	superscript: 0.84,
	octave: 0.79,
	tuplet: 0.84,
	repeat: 0.97,
	diagnostics: 0.97,
	barNumber: 0.84,
	meter: 0.77,
	cut: 0.77,
};

/** Lengths, in chord sizes: the bar-number gutter, the narrowest bar (a D7sus4 bar), the gap under a heading. */
const GUTTER = 2.06;
export const MIN_BAR = 4.68;
const HEADING_GAP = 0.645;
/** Space between consecutive bar rows, so one row's bar lines don't run into the next. */
const ROW_GAP = 0.35;
/**
 * The triplet bracket, in chord sizes: its line sits this far below the top
 * of the number, with hooks this long, drawn either side of the number so
 * nothing is painted over it and any paper shows through.
 */
const BRACKET = { top: 0.6, hook: 0.3, line: 0.06 };
/**
 * A singing line's lines, in chord sizes: the note's (the chart's line
 * height), then each verse's under it. The verse numbers left of the first
 * bar sit on the verses' lines, below the bar's top padding and the note's.
 * A singing bar spaces its slots by beat: equal grid columns, each as wide
 * as the widest note or syllable.
 */
const SUNG = { note: 1.3, verse: 1.25, barTop: 0.65 };
/** The single note's ring, in its own em: padding, and the border it spills past. */
const RING = { y: 0.21, x: 0.5, border: 0.07 };

const em = (n: number) => `${Number(n.toFixed(3))}em`;
/** A length in chord sizes, in the em of text at `size`. */
const at = (size: number, length: number) => em(length / size);

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

/**
 * A section's column tracks: the gutter (bar numbers, or part labels as wide
 * as the longest), a track per cell, and the repeat count's.
 */
const CELLS = "repeat(var(--bm-cols),auto) auto";
const TRACKS = {
	numbers: `${em(GUTTER)} ${CELLS}`,
	bare: CELLS,
	parts: `calc(${em(GUTTER + 0.9)} + var(--bm-label-chars) * .62em) ${CELLS}`,
};

const SANS = `system-ui,-apple-system,"Segoe UI",sans-serif`;
/** The meta line, directives, headings and diagnostics. */
const LABEL = `var(--barmark-label-font,${SANS})`;
/** Fonts holding the beat notes outside the Basic Multilingual Plane (𝅗𝅥 U+1D15E, 𝅘𝅥𝅯 U+1D161), tried before the label's. */
const SYMBOLS = `"Apple Symbols","Segoe UI Symbol","Noto Music",Symbola`;
/** Lyrics and note lines: a serif every system has, with a true italic (Edwin has none). */
const TEXT = "var(--barmark-text-font,Georgia,serif)";
const CHART_FONT = `var(--barmark-font,"${FONT_FAMILY}","Edwin",Georgia,serif)`;

const css = `
:host{all:initial;display:block}
.bm-chart{${colours(PALETTES.light)}
	container:bm/inline-size;
	font-family:${CHART_FONT};
	font-size:var(--barmark-size,1rem);
	line-height:1.3;color:var(--bm-ink);background:var(--bm-paper);
	padding:1em 1.2em;box-sizing:border-box;text-align:start}
.bm-chart *{box-sizing:border-box}
.bm-chart[data-theme="dark"]{${colours(PALETTES.dark)}color-scheme:dark}
@media (prefers-color-scheme:dark){.bm-chart[data-theme="auto"]{${colours(PALETTES.dark)}color-scheme:dark}}
@media print{.bm-chart[data-theme]{${colours(PALETTES.light)}color-scheme:light}}
.bm-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.bm-header{margin-bottom:.8em}
.bm-title{font-size:${em(SIZES.title)};font-weight:normal;margin:0 0 .15em}
.bm-credits{font-family:${LABEL};font-size:${em(SIZES.meta)};margin:0 0 .15em}
.bm-copyright{font-family:${LABEL};font-size:${em(SIZES.meta)};color:var(--bm-muted);margin-top:1.5em}
.bm-copyright p{margin:0}
.bm-beat{font-family:${SYMBOLS},${LABEL}}
.bm-meta{font-family:${LABEL};font-size:${em(SIZES.meta)};color:var(--bm-muted);margin:0}
.bm-directive{grid-column:1/-1;display:flex;align-items:baseline;gap:.4em;margin:.9em 0 .3em ${at(SIZES.directive, GUTTER)};font-family:${LABEL};font-size:${em(SIZES.directive)};color:var(--barmark-directive,var(--bm-muted))}
.bm-directive::after{content:"";flex:1;align-self:center;margin-left:.4em;border-top:.06em solid var(--bm-rule);opacity:.6}
.bm-section{margin-top:.9em}
.bm-heading{display:flex;align-items:center;gap:.5em;margin:0 0 ${at(SIZES.heading, HEADING_GAP)} ${at(SIZES.heading, GUTTER)};font:600 ${em(SIZES.heading)}/1 ${LABEL};letter-spacing:.08em;text-transform:uppercase;color:var(--bm-ink)}
.bm-rehearsal{border:.12em solid currentColor;padding:.15em .35em;border-radius:.15em;letter-spacing:0}
.bm-times{font:italic 1.2em/1 Georgia,serif;text-transform:none;letter-spacing:0;color:var(--bm-muted)}
.bm-grid{display:grid;grid-template-columns:${TRACKS.numbers};width:max-content;max-width:100%}
.bm-chart[data-bar-numbers="off"] .bm-grid{grid-template-columns:${TRACKS.bare}}
.bm-chart[data-wrap="off"] .bm-grid{max-width:none}
.bm-row,.bm-system{display:contents}
.bm-chart[data-parts] .bm-grid{grid-template-columns:${TRACKS.parts}}
.bm-chart[data-parts] .bm-bar-number{width:auto;justify-content:flex-end;gap:.35em;padding-right:.45em}
.bm-part-row>.bm-bar-number{border-right:.15em solid var(--bm-rule)}
.bm-part-label{margin-right:auto}
.bm-part-label{font-family:${LABEL};font-weight:600;color:var(--bm-ink)}
.bm-tacet-bar .bm-bar-body{font-family:${LABEL};font-style:italic;color:var(--bm-muted)}
:is(.bm-row,.bm-system,.bm-error)+.bm-system>.bm-row:first-child>*,.bm-system+.bm-row>*{margin-top:${em(ROW_GAP * 2)}}
.bm-row+.bm-row>*{margin-top:${em(ROW_GAP)}}
.bm-row+.bm-row>.bm-bar-number{margin-top:${at(SIZES.barNumber, ROW_GAP)}}
.bm-bar-number{display:flex;flex:none;align-items:baseline;width:${at(SIZES.barNumber, GUTTER)};padding-top:${at(SIZES.barNumber, 0.65)};font:${em(SIZES.barNumber)}/1 ${SANS};color:var(--bm-muted)}
.bm-bar-number::before{content:"\\200b";font:${em(1 / SIZES.barNumber)}/1.3 ${CHART_FONT}}
.bm-chart[data-bar-numbers="off"] :is(.bm-heading,.bm-text,.bm-directive){margin-left:0}
.bm-bar{position:relative;display:flex;align-items:baseline;min-width:${em(MIN_BAR)};min-height:2.2em;padding:.65em .7em .25em;border-right:.075em solid var(--bm-rule)}
.bm-row>div.bm-bar:first-of-type{border-left:.075em solid var(--bm-rule)}
.bm-row>div.bm-bar[data-repeat-start]{border-left:.25em double var(--bm-rule)}
.bm-row>div.bm-bar[data-repeat-end]{border-right:.25em double var(--bm-rule)}
.bm-bar-body{display:flex;flex:1;align-items:baseline;gap:.6em}
.bm-bar-body>:not(.bm-meter,.bm-cut){flex:1 1 0;min-width:max-content}
.bm-repeat{display:flex;align-items:center;padding-left:.4em;white-space:nowrap}
.bm-repeat .bm-times{font-size:${em(SIZES.repeat)}}
.bm-chord{white-space:nowrap}
.bm-chord sup{font-size:${em(SIZES.superscript)};vertical-align:.55em;line-height:0}
.bm-chord sub{font-size:${em(SIZES.octave)};line-height:0}
.bm-hold,.bm-unknown,.bm-brace,.bm-simile{color:var(--bm-muted)}
.bm-unread{color:var(--bm-accent);text-decoration:underline wavy var(--bm-accent);text-decoration-thickness:.08em;text-underline-offset:.25em}
.bm-nc{font-size:${em(SIZES.noChord)};letter-spacing:.06em}
.bm-silence{display:inline-block;width:.9em;height:.32em;background:var(--bm-ink);vertical-align:.25em}
.bm-ring,.bm-notes{font-size:${em(SIZES.noteNames)}}
.bm-ring{display:inline-block;min-width:1.4em;padding:${em(RING.y)} ${em(RING.x)};margin:${em(-(RING.y + RING.border))} 0;border:${em(RING.border)} solid currentColor;border-radius:1em;text-align:center}
.bm-notes{display:inline-flex;gap:.3em;align-items:baseline}
.bm-notes u{text-decoration-thickness:.08em;text-underline-offset:.15em}
.bm-group{position:relative;display:inline-flex;gap:.45em;align-items:baseline}
.bm-tuplet{position:absolute;left:0;right:0;top:-1.25em;display:flex;justify-content:center;font:italic 600 ${em(SIZES.tuplet)}/1 Georgia,serif;color:var(--bm-muted)}
.bm-tuplet::before,.bm-tuplet::after{content:"";flex:1;align-self:flex-start;margin-top:${at(SIZES.tuplet, BRACKET.top)};height:${at(SIZES.tuplet, BRACKET.hook)};border:${at(SIZES.tuplet, BRACKET.line)} solid var(--bm-muted);border-bottom:none}
.bm-tuplet::before{border-right:none;margin-right:.3em}
.bm-tuplet::after{border-left:none;margin-left:.3em}
.bm-meter{display:inline-flex;flex-direction:column;align-items:center;align-self:center;font:700 ${em(SIZES.meter)}/.95 ${SANS};color:var(--bm-muted)}
.bm-fermata-glyph{display:block;color:var(--bm-ink)}
.bm-row>div.bm-direction{min-width:0;padding-inline:.35em;border-right:none;align-items:flex-start;color:var(--bm-ink)}
.bm-sign{display:inline-block;vertical-align:middle}
.bm-direction-words{font:italic ${em(SIZES.repeat)}/1.2 Georgia,serif;white-space:nowrap}
.bm-row>div.bm-mark{min-width:0;padding-inline:.3em;border-right:none;align-items:flex-start}
.bm-box{display:inline-block;padding:.05em .3em;border:.08em solid var(--bm-ink);border-radius:.15em;font:700 .85em/1.1 system-ui,sans-serif;color:var(--bm-ink)}
.bm-worded{position:relative}
.bm-marked{position:relative;display:inline-flex;align-items:baseline}
.bm-push{font:700 .8em/1 system-ui,sans-serif;color:var(--bm-muted);margin-right:.08em}
.bm-artic{position:absolute;left:50%;top:-.95em;transform:translateX(-50%);font:700 .7em/1 system-ui,sans-serif;color:var(--bm-ink)}
.bm-marked[data-push]>.bm-artic{left:calc(50% + .25em)}
.bm-pedal{position:absolute;left:0;bottom:-1.05em;font:italic 600 .62em/1 Georgia,serif;color:var(--bm-muted);white-space:nowrap}
.bm-dotted{display:inline-flex;align-items:baseline}
.bm-dot{font-weight:700;margin-left:.05em}
.bm-bar:has(.bm-pedal){padding-bottom:1.05em}
.bm-words{position:absolute;left:0;top:-1.05em;font:italic .62em/1 Georgia,serif;color:var(--bm-muted);white-space:nowrap}
.bm-bar>.bm-words-end{left:auto;right:.5em;top:.15em}
.bm-bar[data-ending]::after{content:attr(data-ending);position:absolute;left:.45em;top:.2em;font:italic .75em/1 Georgia,serif;color:var(--bm-muted)}
.bm-ending>.bm-bar{border-top:.06em solid var(--bm-muted)}
.bm-ending>.bm-bar[data-ending]{box-shadow:inset .06em 0 var(--bm-muted)}
.bm-bar[data-tempo-change]::before{content:"";position:absolute;inset:.15em 0 auto;border-top:.08em dashed var(--barmark-directive,var(--bm-muted))}
.bm-bar[data-cut]{outline:.08em dashed var(--bm-muted);outline-offset:-.25em}
.bm-cut{position:absolute;top:.3em;right:.45em;font:${em(SIZES.cut)}/1 ${SANS};color:var(--bm-muted)}
.bm-pitch{font-size:${em(SIZES.noteNames)}}
.bm-sung{display:inline-flex;flex-direction:column}
.bm-sung-note{height:${em(SUNG.note)}}
.bm-sings .bm-bar-body{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;column-gap:.6em;align-items:baseline}
.bm-sings .bm-bar-body:has(>.bm-meter){grid-template-columns:auto}
.bm-sings .bm-meter{align-self:start}
.bm-under{height:${at(SIZES.syllables, SUNG.verse)}}
.bm-verse-numbers{position:absolute;right:100%;top:${em(SUNG.barTop + SUNG.note)};display:flex;flex-direction:column;align-items:flex-end;margin-right:.45em}
.bm-verse-numbers>.bm-verse{height:${at(SIZES.barNumber, SUNG.verse)};line-height:${at(SIZES.barNumber, SUNG.verse)}}
.bm-verse{font:italic ${em(SIZES.barNumber)} ${SANS};color:var(--bm-muted)}
.bm-bar-stack{display:flex;flex:1;flex-direction:column}
.bm-bar-stack>.bm-bar-body{flex:none}
.bm-beats{position:relative;display:flex;align-items:baseline;gap:.3em;margin-top:.15em}
.bm-beats>.bm-syllable-slot{flex:1 1 0;min-width:max-content}
.bm-beats>.bm-verse{position:absolute;right:calc(100% + ${at(SIZES.barNumber, 0.7 + 0.45)})}
:is(.bm-syllable-slot,.bm-under){display:flex;align-items:baseline;gap:.3em;font:italic ${em(SIZES.syllables)}/${SUNG.verse / SIZES.syllables} ${TEXT};color:var(--barmark-lyrics,var(--bm-ink));white-space:nowrap}
.bm-syllable{display:flex;flex:1;align-items:baseline}
.bm-hyphen{flex:1;text-align:center;padding-inline:.15em}
.bm-extender{flex:1;min-width:.8em;align-self:flex-end;margin-bottom:.3em;border-bottom:.07em solid currentColor}
.bm-text{grid-column:1/-1;margin:.2em 0 .5em ${at(SIZES.text, GUTTER)};font-family:${TEXT};font-size:${em(SIZES.text)}}
.bm-note{font-style:italic;color:var(--barmark-note,var(--bm-ink))}
.bm-error{grid-column:1/-1;margin:.3em 0}
.bm-error code{font:.7em/1.4 ui-monospace,Menlo,Consolas,monospace;text-decoration:underline wavy var(--bm-accent);text-decoration-thickness:.08em;text-underline-offset:.25em;white-space:pre-wrap}
.bm-diagnostics{margin:1em 0 0;padding-left:1.2em;font:${em(SIZES.diagnostics)}/1.5 ${LABEL};color:var(--bm-muted)}
.bm-diagnostics .bm-error{color:var(--bm-accent)}
@media (forced-colors:active){
	.bm-bar,.bm-row>div.bm-bar:first-of-type,.bm-row>div.bm-bar[data-repeat-start],.bm-row>div.bm-bar[data-repeat-end]{border-color:CanvasText}
	.bm-ring,.bm-tuplet::before,.bm-tuplet::after,.bm-extender{border-color:CanvasText}
	.bm-silence{background:CanvasText;forced-color-adjust:none}
	.bm-bar[data-cut]{outline-color:CanvasText}
}
${FIT_STEPS.map((w) => {
	const g = `.bm-chart:not([data-wrap="off"]) .bm-grid[data-fit="${w}"]`;
	return `@container bm (max-width:${w}em){${g}{display:block}${g}>.bm-row{display:flex;flex-wrap:wrap;row-gap:${em(ROW_GAP)}}${g} .bm-empty{display:none}${g} .bm-bar{flex:0 1 auto;max-width:100%;border-left:.075em solid var(--bm-rule);margin-left:-.075em}${g} :is(.bm-bar-body,.bm-group,.bm-notes){flex-wrap:wrap}${g} .bm-bar-body>*{flex:1 1 auto;min-width:auto}}`;
}).join("\n")}
`;

/**
 * `columns: "row"`: each row, and each system with its parts' rows, is its
 * own grid on the section's tracks, so its cells size to their own content.
 * The section's grid only stacks them. Where a section wraps, a system
 * stands aside again, as in the shared layout. Appended after the shared
 * rules, which it leaves byte for byte as they were.
 */
const ROW = '.bm-chart[data-columns="row"]';
const OWN = ":is(.bm-grid>.bm-row,.bm-system)";
const rowCss = `
${ROW} ${OWN}{display:grid;grid-column:1/-1;justify-self:start;grid-template-columns:${TRACKS.numbers}}
${ROW}[data-bar-numbers="off"] ${OWN}{grid-template-columns:${TRACKS.bare}}
${ROW}[data-parts] ${OWN}{grid-template-columns:${TRACKS.parts}}
${FIT_STEPS.map((w) => `@container bm (max-width:${w}em){${ROW}:not([data-wrap="off"]) .bm-grid[data-fit="${w}"]>.bm-system{display:contents}}`).join("\n")}
`;

/** Collapse the readable source above: whitespace around punctuation and between rules. */
const minify = (text: string) =>
	text
		.replace(/\n\s*/g, "")
		.replace(/\s*([{};,>])\s*/g, "$1")
		.replace(/:\s+/g, ":");

/** The rules only `columns: "row"` uses, at the stylesheet's end. */
export const ROW_COLUMNS_CSS = minify(rowCss);

/**
 * A chord diagram, in chord sizes. A viewBox unit is 3.5/78 of a chord size,
 * so strings stand .45em apart in either image. A wide drawing (one with a
 * fret number) moves left by the room its number takes, and its item
 * (`bm-diagram-fr`) pads that much on the left, so its strings sit over the
 * name as a narrow drawing's do, and nothing reaches into the next item. The
 * frame of a diagram with no shape is as tall as a drawing, a little wider
 * so its words break in three lines; it and the note are in small print.
 */
const UNIT = 3.5 / 78;
const DIAGRAM = {
	narrow: DIAGRAM_VIEW.narrow * UNIT,
	wide: DIAGRAM_VIEW.wide * UNIT,
	label: DIAGRAM_VIEW.label * UNIT,
	height: DIAGRAM_VIEW.height * UNIT,
	frame: 4.9,
	small: 0.6,
	/** A note set's name: three notes to a line. */
	set: 5.6,
};

/** The strip of chord diagrams (design 5): only charts drawn with `chordDiagrams` use it. */
const diagramsCss = `
.bm-diagrams ul{display:flex;flex-wrap:wrap;gap:.5em .6em;margin:0 0 .3em;padding:0;list-style:none}
.bm-diagram{display:flex;flex-direction:column;align-items:center;text-align:center;break-inside:avoid}
.bm-diagram-fr{padding-left:${em(DIAGRAM.label)}}
.bm-diagram-svg{fill:var(--bm-ink);display:block;width:${em(DIAGRAM.narrow)};height:${em(DIAGRAM.height)}}
.bm-dg-fr{width:${em(DIAGRAM.wide)};margin-left:${em(-DIAGRAM.label)}}
.bm-diagram-none{display:flex;align-items:center;justify-content:center;width:${at(DIAGRAM.small, DIAGRAM.frame)};height:${at(DIAGRAM.small, DIAGRAM.height)};padding:.3em;border:.1em dashed var(--bm-rule);border-radius:.4em;text-wrap:balance}
:is(.bm-diagram-none,.bm-diagram-note){font:${em(DIAGRAM.small)}/1.2 ${LABEL};color:var(--bm-muted)}
.bm-diagram-note{max-width:${at(DIAGRAM.small, DIAGRAM.frame)}}
.bm-diagram-name{padding-top:.35em;line-height:1.2}
.bm-diagram-set{max-width:${em(DIAGRAM.set)};white-space:normal}
:is(.bm-diagram-voicing,.bm-diagram-numeral){display:block;font-size:.75em;color:var(--bm-muted)}
.bm-diagram-voicing{max-width:${at(0.75, DIAGRAM.frame)}}
.bm-dg-grid{fill:none;stroke:var(--bm-rule);stroke-width:1.2}
.bm-dg-mark{fill:none;stroke:var(--bm-muted);stroke-width:1.3}
.bm-dg-fret{fill:var(--bm-muted);font-family:${TEXT};text-anchor:end}
@media (forced-colors:active){.bm-diagrams{--bm-rule:CanvasText;--bm-muted:CanvasText;--bm-ink:CanvasText}}
`;

/** The strip's rules, between the shared rules and the row rules, so a chart drawn without it is styled byte for byte as before. */
export const DIAGRAMS_CSS = minify(diagramsCss);

export const stylesheet = minify(css) + DIAGRAMS_CSS + ROW_COLUMNS_CSS;
