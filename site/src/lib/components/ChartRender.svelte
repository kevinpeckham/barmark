<script lang="ts">
import { onMount, untrack } from "svelte";
import { chartHtml, scoreHtml } from "#lib/chart.js";
import { transposed } from "#lib/key.js";
import { keepScoreFont } from "#lib/score-font.js";

type Numerals = "nashville" | "roman";
type View = "grid" | "score";
type ChartElement = HTMLElement & { text: string | null; numerals?: Numerals | null };

let {
	text,
	label,
	barNumbers = true,
	numerals = null,
	score = false,
	semitones = 0,
	onviewchange,
}: {
	text: string;
	label?: string;
	barNumbers?: boolean;
	/** Each chord as its degree in its bar's key; null: chord names. */
	numerals?: Numerals | null;
	/** A <barmark-score>, with its Grid / Score switch, rather than a <barmark-chart>. Read once. */
	score?: boolean;
	/** Draw the chart this many semitones from its own key; the text itself never changes. */
	semitones?: number;
	/** The reader switched a score between Grid and Score. */
	onviewchange?: (view: View) => void;
} = $props();

/** Charts longer than this re-render once typing pauses, not on every key. */
const LONG = 10_000;
const PAUSE_MS = 250;
/** Past this a paste would freeze the tab for seconds: the text stays, the preview stops. */
const MAX = 50_000;
const tooLong = $derived(text.length > MAX);

// The element, chosen once: Verovio stays behind <barmark-score>'s Score switch,
// so importing its element here loads only the grid and the switch.
const asScore = untrack(() => score);
const tag = asScore ? "barmark-score" : "barmark-chart";
const load = () => (asScore ? import("@barmark/score/element") : import("@barmark/render/element"));

// The prerendered chart: computed once, so Svelte never rewrites it. From
// then on the element draws, from its text property.
let rendered = untrack(() => text);
let moved = untrack(() => semitones);
const initial = (asScore ? scoreHtml : chartHtml)(
	transposed(rendered, moved),
	untrack(() => ({ barNumbers })),
);
let host: HTMLDivElement;

const chart = () => host.querySelector(tag) as ChartElement;
const draw = () => {
	chart().text = transposed(rendered, moved);
};

onMount(() => {
	void load();
	// After navigating inside the site, Svelte inserts {@html} without the
	// parser, so the declarative shadow root never attached: give the element its text.
	if (!chart().shadowRoot) draw();
	let stopFont = () => {};
	const changed = (e: Event) => {
		const view = (e as CustomEvent<{ view: View }>).detail.view;
		if (view === "score") {
			stopFont();
			stopFont = keepScoreFont(chart());
		}
		onviewchange?.(view);
	};
	host.addEventListener("viewchange", changed);
	return () => {
		host.removeEventListener("viewchange", changed);
		stopFont();
	};
});

let spelled = untrack(() => numerals);
$effect(() => {
	const next = numerals;
	if (next === spelled) return;
	spelled = next;
	void load().then(() => {
		const el = chart();
		// <barmark-score> reads the grid's options from its attributes only.
		if (!asScore) el.numerals = next;
		else if (next) el.setAttribute("numerals", next);
		else el.removeAttribute("numerals");
		// The prerendered chart has no text of its own, and the attribute alone only restyles it.
		draw();
	});
});

$effect(() => {
	const next = text;
	const n = semitones;
	if (tooLong || (next === rendered && n === moved)) return;
	const render = () => {
		rendered = next;
		moved = n;
		draw();
	};
	// A new key is a click, not typing: it draws at once.
	if (next.length < LONG || next === rendered) return render();
	const timer = setTimeout(render, PAUSE_MS);
	return () => clearTimeout(timer);
});
</script>

{#if tooLong}
	<p class="text-sm opacity-80" role="status">
		Too long to preview here: {text.length.toLocaleString("en-US")} characters (the limit is
		{MAX.toLocaleString("en-US")}).
	</p>
{/if}
<div
	bind:this={host}
	hidden={tooLong}
	class="barmark-look min-w-0 {asScore ? 'score-host' : ''}"
	role={label ? "region" : undefined}
	aria-label={label}
>
	{@html initial}
</div>
