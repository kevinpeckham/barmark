<script lang="ts">
import ChartRender from "#lib/components/ChartRender.svelte";
import Window from "#lib/components/Window.svelte";
import { SCORE_EXAMPLE, SCORE_NOTES } from "#lib/guide/score.js";

const code = "font-mono text-accent";
const link = "underline decoration-accent/60 underline-offset-3 hover-text-accent";
const cell = "px-3 py-3 align-top lt-sm:(block px-0 py-1)";
</script>

<section aria-labelledby="in-the-score" class="flex flex-col gap-4 min-w-0">
	<h2 id="in-the-score" class="font-serif text-xl text-ink scroll-mt-6">In the score</h2>
	<p class="max-w-prose opacity-80">
		A chart can also be shown as a full score: press Score above a chart drawn by
		<code class={code}>&lt;barmark-score&gt;</code> (<a href="/get-started#score" class={link}>Get Started</a>
		shows how). The score is engraved from the chart's MusicXML export, so it draws what the chart says and
		nothing more: no voicing is guessed for a chord name. It always writes chord names and every part;
		Nashville or Roman numerals, guitar chord diagrams and <code class={code}>show-part</code> change
		only the grid.
	</p>
	<Window title="A lead sheet · press Score">
		<div class="p-4 min-w-[26rem]">
			<ChartRender text={SCORE_EXAMPLE} score label="A lead sheet, as a grid or a score" />
		</div>
	</Window>
	<table class="w-full border-collapse text-left lt-sm:block">
		<thead class="text-xs uppercase tracking-wider opacity-60 border-b border-line lt-sm:sr-only">
			<tr>
				<th scope="col" class="px-3 py-2 font-400">You write</th>
				<th scope="col" class="px-3 py-2 font-400">The score draws</th>
				<th scope="col" class="px-3 py-2 font-400">Example</th>
			</tr>
		</thead>
		<tbody class="lt-sm:(flex flex-col gap-3)">
			{#each SCORE_NOTES as note (note.id)}
				<tr
					data-score-note={note.id}
					class="border-b border-line lt-sm:(block rounded-lg border border-line bg-row p-4)"
				>
					<th scope="row" class="{cell} font-400 lg:whitespace-nowrap">
						<code class="font-mono text-accent">{note.syntax}</code>
					</th>
					<td class="{cell} max-w-md">{note.drawn}</td>
					<td class={cell}>
						<pre class="font-mono text-xs leading-relaxed whitespace-pre overflow-x-auto max-w-[calc(100vw-4rem)]">{note.example}</pre>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>
