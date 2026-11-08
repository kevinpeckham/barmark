export type ScoreView = "grid" | "score";

/** Anything but `"score"` is the grid. */
export const viewOf = (value: unknown): ScoreView => (value === "score" ? "score" : "grid");

/** The Grid / Score switch: a radio group of two buttons, the current view checked. */
export function switchHtml(view: ScoreView): string {
	const radio = (value: ScoreView, label: string) =>
		`<button type="button" role="radio" data-view="${value}" aria-checked="${view === value}"${view === value ? "" : ' tabindex="-1"'}>${label}</button>`;
	return `<div class="bms-switch" role="radiogroup" aria-label="View">${radio("grid", "Grid")}${radio("score", "Score")}</div>`;
}

/**
 * The switch's ink and rule: @barmark/render's palettes (its `PALETTES`, which it does not
 * export; tests/switch.test.ts holds the two equal), with its `--barmark-ink` and
 * `--barmark-rule` overrides. The switch sits outside render's `.bm-chart`, whose
 * `data-theme` sets the palette, and render's `:host{all:initial}` resets its colour and
 * font, so it keys the same choice off the element's own `theme` attribute.
 */
export const SWITCH_PALETTES: Record<"light" | "dark", { ink: string; rule: string }> = {
	light: { ink: "#1d1d1f", rule: "#4a4a4a" },
	dark: { ink: "#ece8e0", rule: "#8f897f" },
};

const colours = ({ ink, rule }: { ink: string; rule: string }) =>
	`--bms-ink:var(--barmark-ink,${ink});--bms-rule:var(--barmark-rule,${rule});`;
const AUTO = ':host(:not([theme="light"]):not([theme="dark"]))';

/** The switch's own look, in its theme's colours and render's label font. */
export const switchStyles = `:host{${colours(SWITCH_PALETTES.light)}}
:host([theme="dark"]){${colours(SWITCH_PALETTES.dark)}}
@media (prefers-color-scheme:dark){${AUTO}{${colours(SWITCH_PALETTES.dark)}}}
@media print{:host,:host([theme="dark"]),${AUTO}{${colours(SWITCH_PALETTES.light)}}}
.bms-switch,.bms-note{font-family:var(--barmark-label-font,system-ui,-apple-system,"Segoe UI",sans-serif)}
.bms-switch{display:inline-flex;margin:0 0 .5rem;border:1px solid var(--bms-rule);border-radius:.4rem;overflow:hidden}
.bms-switch button{font:inherit;color:var(--bms-ink);background:transparent;border:0;padding:.25rem .75rem;cursor:pointer}
.bms-switch button[aria-checked="true"]{font-weight:bold;text-decoration:underline}
.bms-switch button:focus-visible{outline:2px solid currentColor;outline-offset:-2px}
.bms-switch button[aria-disabled="true"]{opacity:.5;cursor:not-allowed}
.bms-note{margin:0 0 .5rem;font-size:.875em;color:var(--bms-ink)}`;
