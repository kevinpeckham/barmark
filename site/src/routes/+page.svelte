<script lang="ts">
import Button from "#lib/components/Button.svelte";
import ChartRender from "#lib/components/ChartRender.svelte";
import DiagramSwitch from "#lib/components/DiagramSwitch.svelte";
import KeyMenu from "#lib/components/KeyMenu.svelte";
import SourceEditor from "#lib/components/SourceEditor.svelte";
import Window from "#lib/components/Window.svelte";
import { EXAMPLES, type Example, exampleFile, flipped, viewOf } from "#lib/examples.js";
import { chartKey } from "#lib/key.js";
import { HEADLINE, LINKS, TAGLINE_AFTER, TAGLINE_BEFORE, TAGLINE_LINK, VALUE } from "#lib/site.js";

/** Every example's chart, bundled: a flip draws at once, with no request. */
const charts = import.meta.glob<string>("../lib/examples/*.chart.md", {
	query: "?raw",
	import: "default",
	eager: true,
});
const chartOf = (example: Example) => charts[`../lib/examples/${exampleFile(example)}`] ?? "";

/** The example on show; the first, Greensleeves, is the one prerendered. */
let index = $state(0);
const example: Example = $derived(EXAMPLES[index] ?? EXAMPLES[0]);
const original = $derived(chartOf(example));
let text = $state(chartOf(EXAMPLES[0]));

/** Each example's edited text, kept across flips until its Reset; never stored beyond the page. Not reactive (no SvelteMap): only flip and reset read it. */
const edits = new Map<Example["id"], string>();

/**
 * Shows the next (1) or previous (-1) example, as the reader last left it,
 * in its own key; the chord spelling and the guitar diagrams stay, and so
 * does the view once the reader has picked one (until then each example
 * opens in its own: `viewOf`).
 */
function flip(step: number) {
	if (text === original) edits.delete(example.id);
	else edits.set(example.id, text);
	index = flipped(index, step);
	text = edits.get(example.id) ?? original;
	semitones = 0;
}

/** Back to the example as written, forgetting its edit. */
function reset() {
	edits.delete(example.id);
	text = original;
}

/** The render window's chord spelling, as Stem Shovel's Chords view offers it. */
const SPELLINGS = [
	{ id: "names", label: "Names", title: "Chord names" },
	{ id: "nashville", label: "Nashville", title: "Nashville numbers" },
	{ id: "roman", label: "Roman", title: "Roman numerals" },
] as const;
let spelling: (typeof SPELLINGS)[number]["id"] = $state("names");
/** The key the chart is drawn in, as Stem Shovel's Key menu offers it: a viewing choice, not kept (a demo). */
let semitones = $state(0);
const key = $derived(chartKey(text));
/** The grid's guitar chord diagrams: a viewing choice like the key, off on the prerendered page, not kept. */
let diagrams = $state(false);
/** The view the reader picked, Grid or Score; null until they pick one. */
let picked: "grid" | "score" | null = $state(null);
/** The view on show: the reader's pick, else the example's own. The score has no chord spelling or diagrams: they are the grid's. */
const view = $derived(picked ?? viewOf(example));
const description =
	"Barmark is a markdown-inspired plain-text notation for chord charts. Edit a chart and watch it render, as a bar grid or a full score.";
</script>

<svelte:head>
	<title>Barmark: plain-text chord charts</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="{LINKS.origin}/" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{LINKS.origin}/" />
	<meta property="og:title" content="Barmark: plain-text chord charts" />
	<meta property="og:description" content={description} />
</svelte:head>

<main class="page-x-padding grid grid-cols-1 gap-16 main-y-padding w-full overflow-x-clip">

	<!-- page top -->
	<section class="w-full">
		<h1 class="marketing-headline text-ink">{HEADLINE}</h1>

		<p class="max-w-prose opacity-80 mb-6">
			{TAGLINE_BEFORE}<a
				href={LINKS.stemShovel}
				class="underline decoration-accent/60 underline-offset-3 hover-text-accent">{TAGLINE_LINK}</a
			>{TAGLINE_AFTER}
			{VALUE}
		</p>

		<div class="flex flex-wrap items-center gap-3">
			<Button href="/syntax" variant="accent">Read the syntax</Button>
			<Button href={LINKS.github}>
				<span class="i-ph-github-logo" aria-hidden="true"></span>GitHub
			</Button>
			<Button href={LINKS.npm}><code class="font-sans">npm i barmark</code></Button>
			<Button href={LINKS.article}>Why we built it</Button>
		</div>

	</section>

	<!-- examples -->
	<section class="grid grid-cols-1 w-full">

		<!-- example section heading -->
		<h2 class="marketing-section-heading">Examples</h2>

		<!-- example navigation -->
		<div role="group" aria-label="Examples" class="grid grid-cols-1 lg-grid-cols-2">

			<!-- col 1 -->
			<div class="flex items-center justify-start gap-6 mb-5 w-full">

				<div role="status" class="flex gap-6 items-center">
					<h3 class="text-18px font-semibold">"{example.title}"</h3>
					<span class="opacity-70">{index + 1} of {EXAMPLES.length}</span>
				</div>

				<div class="flex gap-4 text-.85rem">
					<button type="button" class="button" aria-label="Previous example" onclick={() => flip(-1)}>
						<span class="i-ph-caret-left" aria-hidden="true"></span>
					</button>
					<button type="button" class="button" aria-label="Next example" onclick={() => flip(1)}>
						<span class="i-ph-caret-right" aria-hidden="true"></span>
					</button>
				</div>
			</div>
		</div>

		<!-- edit and render panels -->
		<div class="gap-8 grid grid-cols-1 min-h-600px xl-grid-cols-2 w-full">
			<Window title="Source · edit me">
				<div class="flex flex-col h-full bg-white/8">
					<SourceEditor bind:value={text} label="Barmark source of the chart" />
					<div class="flex justify-end border-t border-line px-3 py-2">
						<button
							type="button"
							class="button text-xs"
							disabled={text === original}
							onclick={reset}
						>
							<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>Reset
						</button>
					</div>
				</div>
			</Window>

			<Window title="Rendered · @barmark/score">
				{#snippet controls()}
					<div class="ml-auto flex flex-wrap items-center gap-2">
						<KeyMenu {key} bind:semitones />
						<div
							role="radiogroup"
							aria-label="Chord spelling"
							title={view === "score" ? "Chord spelling is the grid's: switch to Grid to use it" : undefined}
							class="inline-flex flex-wrap rounded-md border border-white/45 text-xs overflow-hidden {view === 'score' ? 'opacity-40' : ''}"
						>
							{#each SPELLINGS as s (s.id)}
								<!-- The group clips an outside ring, so the ring is inset: accent on the dark items, dark on the accent-filled one. -->
								<label
									title={s.title}
									class="relative px-2.5 py-1 cursor-pointer opacity-80 hover-opacity-100 has-[:checked]:(bg-accent text-on-accent opacity-100) has-[:focus-visible]:(outline-2 outline-accent -outline-offset-2) [&:has(:checked:focus-visible)]:outline-on-accent"
								>
									<input
										type="radio"
										name="spelling"
										value={s.id}
										bind:group={spelling}
										disabled={view === "score"}
										class="absolute inset-0 m-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
									/>{s.label}
								</label>
							{/each}
						</div>
						<DiagramSwitch bind:on={diagrams} disabled={view === "score"} />
					</div>
				{/snippet}
				<!-- Four ordinary bars' width (the renderer's 24em step) and the padding: narrower, the window scrolls. -->
				<div class="p-4 min-w-[26rem] bg-white/95">
					<ChartRender
						{text}
						score
						preload="intent"
						{semitones}
						numerals={spelling === "names" ? null : spelling}
						{diagrams}
						melody={false}
						label="The chart, rendered"
						{view}
						onviewchange={(v) => {
							// The element shows a view the page did not ask for: the reader switched it.
							if (v !== view) picked = v;
						}}
					/>
				</div>
			</Window>

			<p data-credit class="text-xs opacity-60">{example.credit}</p>
		</div>


	</section>
</main>
