<script lang="ts">
import ChartRender from "#lib/components/ChartRender.svelte";
import { type ChordReading, type Reading, summarize } from "#lib/try/read.js";

let {
	reading,
	text,
	ontry,
}: { reading: Reading; text: string; ontry: (suggestion: string) => void } = $props();

const term = "text-xs uppercase tracking-wider opacity-60";
const code = "font-mono text-accent";
</script>

{#snippet chord(c: ChordReading)}
	<ChartRender text="| {c.canonical} |" barNumbers={false} label="The chord, drawn" />
	<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 items-baseline">
		<dt class={term}>Canonical</dt>
		<dd>
			<code class={code}>{c.canonical}</code>
			{#if c.typed !== c.canonical}<span class="opacity-70">(you wrote <code class="font-mono">{c.typed}</code>)</span
				>{/if}
		</dd>
		<dt class={term}>Spoken</dt>
		<dd>{c.spoken}</dd>
		<dt class={term}>Harte label</dt>
		<dd><code class={code}>{c.harte}</code></dd>
		<dt class={term}>Notes</dt>
		<dd class="flex flex-wrap gap-x-4 gap-y-1">
			{#each c.notes as note, i (i)}
				<span class="inline-flex flex-col items-center">
					<span class="font-mono">{note}</span>
					<span class="text-xs opacity-60">{c.degrees[i]}</span>
				</span>
			{/each}
		</dd>
		{#if c.bass}
			<dt class={term}>Bass</dt>
			<dd class="font-mono">{c.bass}</dd>
		{/if}
	</dl>
	{#each c.warnings as warning, i (i)}
		<p class="text-sm opacity-80">{warning}</p>
	{/each}
{/snippet}

<p data-summary aria-live="polite" class="sr-only">{summarize(reading)}</p>
<div data-reading class="flex flex-col gap-4 p-4 min-w-0">
	{#if reading.kind === "chord" || reading.kind === "notes"}
		{@render chord(reading.chord)}
	{:else if reading.kind === "harte"}
		<p>
			Harte label <code class={code}>{reading.label}</code> → barmark
			<code class={code}>{reading.chord.typed}</code>
		</p>
		{@render chord(reading.chord)}
	{:else if reading.kind === "chart"}
		<ChartRender {text} label="The chart, rendered" />
		{#if reading.diagnostics.length}
			<ul class="flex flex-col gap-1 text-sm">
				{#each reading.diagnostics as d, i (i)}
					<li class={d.severity === "error" ? "text-accent" : "opacity-80"}>line {d.line}: {d.message}</li>
				{/each}
			</ul>
		{/if}
		<div class="flex flex-col gap-1.5 min-w-0">
			<h3 class={term}>Canonical</h3>
			<pre class="font-mono text-sm overflow-x-auto">{reading.canonical}</pre>
		</div>
	{:else if reading.kind === "error"}
		<p class="text-accent">{reading.message}</p>
		{#if reading.suggestion}
			{@const suggestion = reading.suggestion}
			<div>
				<button type="button" class="button text-sm" onclick={() => ontry(suggestion)}>Try {suggestion}</button>
			</div>
		{/if}
	{:else if reading.kind === "long"}
		<p class="opacity-80">
			Too long to preview here: {reading.length.toLocaleString("en-US")} characters (the limit is
			{reading.limit.toLocaleString("en-US")}).
		</p>
	{:else if reading.kind === "text"}
		<p class="opacity-80">That isn't a chord or a chart; the guide rows below match it.</p>
	{:else}
		<p class="opacity-80">Type a chord, a Harte label or a bit of chart.</p>
	{/if}
</div>
