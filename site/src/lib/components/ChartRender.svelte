<script lang="ts">
import { untrack } from "svelte";
import { chartHtml } from "#lib/chart.js";

let { text, label }: { text: string; label?: string } = $props();

// The prerendered chart: computed once, so Svelte never rewrites it.
// A declarative shadow root attaches only when HTML is parsed, which is
// why later renders go through setHTMLUnsafe, not {@html} or innerHTML.
let rendered = untrack(() => text);
const initial = chartHtml(rendered);
let host: HTMLDivElement;

$effect(() => {
	if (text === rendered) return;
	rendered = text;
	host.setHTMLUnsafe(chartHtml(text));
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
