<script lang="ts">
import ChartRender from "#lib/components/ChartRender.svelte";
import { type GuideQuery, matches, sorted } from "#lib/guide/query.js";
import { ROWS } from "#lib/guide/rows.js";

let { query }: { query: GuideQuery } = $props();

// Rows are never removed, only hidden and moved, so each rendered
// example keeps its shadow root (it attaches only when HTML is parsed).
const ordered = $derived(sorted(ROWS, query.sort));
const shown = $derived(ROWS.filter((row) => matches(row, query)).length);
const cell = "px-3 py-3 align-top lt-sm:(block px-0 py-1)";
</script>

<p class="text-sm opacity-70" aria-live="polite">
	{#if shown === 0}
		Nothing matches “{query.q}”.
	{:else}
		Showing {shown} of {ROWS.length}
	{/if}
</p>

<table class="w-full border-collapse text-left lt-sm:block">
	<thead class="text-xs uppercase tracking-wider opacity-60 border-b border-line lt-sm:sr-only">
		<tr>
			<th scope="col" class="px-3 py-2 font-400">You type</th>
			<th scope="col" class="px-3 py-2 font-400">It means</th>
			<th scope="col" class="px-3 py-2 font-400">Example</th>
			<th scope="col" class="px-3 py-2 font-400">Rendered</th>
		</tr>
	</thead>
	<tbody class="lt-sm:(flex flex-col gap-3)">
		{#each ordered as row (row.id)}
			<tr
				data-row={row.id}
				hidden={!matches(row, query)}
				class="border-b border-line lt-sm:(block rounded-lg border border-line bg-row p-4)"
			>
				<th scope="row" class="{cell} font-400 whitespace-nowrap">
					<code class="font-mono text-accent">{row.syntax}</code>
					<span class="block text-xs opacity-50 capitalize">{row.category} · {row.ref}</span>
				</th>
				<td class="{cell} max-w-sm">{row.meaning}</td>
				<td class="{cell}">
					<pre class="font-mono text-xs leading-relaxed whitespace-pre overflow-x-auto max-w-full">{row.example}</pre>
				</td>
				<td class="{cell} min-w-0 sm:min-w-80">
					<ChartRender text={row.example} />
				</td>
			</tr>
		{/each}
	</tbody>
</table>
