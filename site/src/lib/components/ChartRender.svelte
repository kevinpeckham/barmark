<script lang="ts">
import { onMount, untrack } from "svelte";
import { chartHtml } from "#lib/chart.js";

type Numerals = "nashville" | "roman";

let {
	text,
	label,
	barNumbers = true,
	wrap = true,
	numerals = null,
}: {
	text: string;
	label?: string;
	barNumbers?: boolean;
	/** false: a section wider than the box keeps its rows, and the box scrolls. */
	wrap?: boolean;
	/** Each chord as its degree in its bar's key; null: chord names. */
	numerals?: Numerals | null;
} = $props();

/** Charts longer than this re-render once typing pauses, not on every key. */
const LONG = 10_000;
const PAUSE_MS = 250;
/** Past this a paste would freeze the tab for seconds: the text stays, the preview stops. */
const MAX = 50_000;
const tooLong = $derived(text.length > MAX);

// The prerendered chart: computed once, so Svelte never rewrites it. From
// then on the <barmark-chart> element draws, from its text property.
let rendered = untrack(() => text);
const initial = chartHtml(
	rendered,
	untrack(() => ({ barNumbers, wrap })),
);
let host: HTMLDivElement;

const chart = () =>
	host.querySelector("barmark-chart") as HTMLElement & {
		text: string | null;
		numerals: Numerals | null;
	};

onMount(() => {
	void import("@barmark/render/element");
	// After navigating inside the site, Svelte inserts {@html} without the
	// parser, so the declarative shadow root never attached: give the element its text.
	if (!chart().shadowRoot) chart().text = rendered;
});

let spelled = untrack(() => numerals);
$effect(() => {
	const next = numerals;
	if (next === spelled) return;
	spelled = next;
	void import("@barmark/render/element").then(() => {
		chart().numerals = next;
		// The prerendered chart has no text of its own, and the attribute alone only restyles it.
		chart().text = rendered;
	});
});

$effect(() => {
	if (tooLong || text === rendered) return;
	const next = text;
	const render = () => {
		rendered = next;
		chart().text = next;
	};
	if (next.length < LONG) return render();
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
	class="barmark-look min-w-0"
	role={label ? "region" : undefined}
	aria-label={label}
>
	{@html initial}
</div>
