// What `<barmark-score>` shows while its score is on its way: the phase in a status region,
// a progress bar and, while the download can be measured, how far it has come.
// Verovio-free, like ./shell.js.
import { progressText } from "./download.js";
import type { EngineStatus } from "./engine.js";

/** Each phase's words: shown (and spoken, once per phase) and the bar's name. */
const PHASES: Record<EngineStatus["phase"], { text: string; label: string }> = {
	download: { text: "Loading the score engine…", label: "Loading the score engine" },
	prepare: { text: "Preparing…", label: "Preparing" },
	engrave: { text: "Engraving…", label: "Engraving" },
};

/** Before anything is heard: the engine downloading, unmeasured. */
export const UNMEASURED: EngineStatus = { phase: "download", fraction: null, bytes: null };

function build(doc: Document): Element {
	const make = (tag: string, cls: string, attrs: Record<string, string> = {}) => {
		const e = doc.createElement(tag);
		e.className = cls;
		for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
		return e;
	};
	const box = make("div", "bms-loading");
	const bar = make("div", "bms-bar", {
		role: "progressbar",
		"aria-valuemin": "0",
		"aria-valuemax": "100",
	});
	bar.append(doc.createElement("span"));
	box.append(
		make("p", "bms-status", { role: "status" }),
		bar,
		make("span", "bms-amount", { "aria-hidden": "true" }),
	);
	return box;
}

/**
 * Shows `status` in `pane`, building the region the first time and then
 * updating it in place: the live region's text changes only with the
 * phase, so a screen reader hears each phase once, and the percentage is
 * the bar's value (and the amount beside it, hidden from assistive
 * technology, which reads the bar).
 */
export function showStatus(pane: Element, status: EngineStatus): void {
	let box = pane.querySelector(":scope > .bms-loading");
	if (!box) {
		box = build(pane.ownerDocument);
		pane.replaceChildren(box);
	}
	const { text, label } = PHASES[status.phase];
	const live = box.querySelector(".bms-status");
	if (live && live.textContent !== text) live.textContent = text;
	const bar = box.querySelector(".bms-bar") as HTMLElement | null;
	bar?.setAttribute("aria-label", label);
	const fraction = status.phase === "download" ? status.fraction : null;
	const amount = status.phase === "download" ? progressText(status) : "";
	if (fraction === null) {
		for (const a of ["aria-valuenow", "aria-valuetext"]) bar?.removeAttribute(a);
	} else {
		const percent = Math.floor(fraction * 100);
		bar?.setAttribute("aria-valuenow", String(percent));
		bar?.setAttribute("aria-valuetext", `${percent}%`);
		bar?.style?.setProperty("--bms-done", `${percent}%`);
	}
	const shown = box.querySelector(".bms-amount");
	if (shown) shown.textContent = amount;
}

/**
 * The region's look, in the switch's ink and rule. An indeterminate bar
 * (no `aria-valuenow`) slides; with reduced motion it stands still, a
 * faint full bar, and a measured one jumps rather than glides.
 */
export const loadingStyles = `.bms-loading{display:flex;flex-wrap:wrap;align-items:center;gap:.375rem .75rem;padding:.75rem 0;color:var(--bms-ink);font-family:var(--barmark-label-font,system-ui,-apple-system,"Segoe UI",sans-serif);font-size:.875em}
.bms-status{margin:0;flex:1 0 100%}
.bms-bar{position:relative;flex:0 1 16rem;height:.375rem;border:1px solid var(--bms-rule);border-radius:.375rem;overflow:hidden}
.bms-bar>span{position:absolute;top:0;bottom:0;left:0;width:var(--bms-done,0%);background:var(--bms-ink);transition:width .2s linear}
.bms-bar:not([aria-valuenow])>span{width:30%;animation:bms-slide 1.2s ease-in-out infinite alternate}
@keyframes bms-slide{from{left:0}to{left:70%}}
.bms-amount{font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion:reduce){.bms-bar>span{transition:none}.bms-bar:not([aria-valuenow])>span{animation:none;width:100%;opacity:.35}}`;
