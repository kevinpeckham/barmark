<script lang="ts">
import { onMount, untrack } from "svelte";
import { chartHtml } from "#lib/chart.js";

let { text, label }: { text: string; label?: string } = $props();

/** Charts longer than this re-render once typing pauses, not on every key. */
const LONG = 10_000;
const PAUSE_MS = 250;

// The prerendered chart: computed once, so Svelte never rewrites it.
// A declarative shadow root attaches only when HTML is parsed, which is
// why later renders go through setHTMLUnsafe, not {@html} or innerHTML.
let rendered = untrack(() => text);
const initial = chartHtml(rendered);
let host: HTMLDivElement;

// After navigating inside the site, Svelte inserts {@html} without the
// parser, so the shadow root never attached: render it properly.
onMount(() => {
	if (!host.querySelector("barmark-chart")?.shadowRoot) host.setHTMLUnsafe(initial);
});

$effect(() => {
	if (text === rendered) return;
	const next = text;
	const render = () => {
		rendered = next;
		host.setHTMLUnsafe(chartHtml(next));
	};
	if (next.length < LONG) return render();
	const timer = setTimeout(render, PAUSE_MS);
	return () => clearTimeout(timer);
});
</script>

<div
	bind:this={host}
	class="[--barmark-size:1rem] [--barmark-paper:transparent] min-w-0"
	role={label ? "region" : undefined}
	aria-label={label}
>
	{@html initial}
</div>
