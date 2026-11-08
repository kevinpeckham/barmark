export type ScoreView = "grid" | "score";

/** The Grid / Score switch: a radio group of two buttons, the current view checked. */
export function switchHtml(view: ScoreView): string {
	const radio = (value: ScoreView, label: string) =>
		`<button type="button" role="radio" data-view="${value}" aria-checked="${view === value}"${view === value ? "" : ' tabindex="-1"'}>${label}</button>`;
	return `<div class="bms-switch" role="radiogroup" aria-label="View">${radio("grid", "Grid")}${radio("score", "Score")}</div>`;
}

/** The switch's own look, in render's palette variables. */
export const switchStyles = `.bms-switch{display:inline-flex;margin:0 0 .5rem;border:1px solid var(--bm-rule,currentColor);border-radius:.4rem;overflow:hidden}
.bms-switch button{font:inherit;color:var(--bm-ink,inherit);background:transparent;border:0;padding:.25rem .75rem;cursor:pointer}
.bms-switch button[aria-checked="true"]{font-weight:bold;text-decoration:underline}
.bms-switch button:focus-visible{outline:2px solid currentColor;outline-offset:-2px}`;
