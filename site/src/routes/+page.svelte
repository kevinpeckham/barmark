<script lang="ts">
import Button from "#lib/components/Button.svelte";
import ChartRender from "#lib/components/ChartRender.svelte";
import KeyMenu from "#lib/components/KeyMenu.svelte";
import SourceEditor from "#lib/components/SourceEditor.svelte";
import Window from "#lib/components/Window.svelte";
import demo from "#lib/demo.chart.md?raw";
import { chartKey } from "#lib/key.js";
import { HEADLINE, LINKS, TAGLINE_AFTER, TAGLINE_BEFORE, TAGLINE_LINK, VALUE } from "#lib/site.js";

let text = $state(demo);

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
/** The score has no chord spelling: the numerals are the grid's. */
let view: "grid" | "score" = $state("grid");
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

<main class="home-page-x-padding py-10 lg:py-14 flex flex-col gap-8 min-w-0">
	<div>
		<h1 class="marketing-headline text-ink">{HEADLINE}</h1>
		<p class="max-w-prose opacity-80">
			{TAGLINE_BEFORE}<a
				href={LINKS.stemShovel}
				class="underline decoration-accent/60 underline-offset-3 hover-text-accent">{TAGLINE_LINK}</a
			>{TAGLINE_AFTER}
			{VALUE}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Button href="/syntax" variant="accent">Read the syntax</Button>
		<Button href={LINKS.github}>
			<span class="i-ph-github-logo" aria-hidden="true"></span>GitHub
		</Button>
		<Button href={LINKS.npm}><code class="font-sans">npm i barmark</code></Button>
		<Button href={LINKS.article}>Why we built it</Button>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4">
		<Window title="Source · edit me">
			<div class="flex flex-col h-full">
				<SourceEditor bind:value={text} label="Barmark source of the chart" />
				<div class="flex justify-end border-t border-line px-3 py-2">
					<button
						type="button"
						class="button text-xs"
						disabled={text === demo}
						onclick={() => (text = demo)}
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
							<label
								title={s.title}
								class="relative px-2.5 py-1 cursor-pointer opacity-80 hover-opacity-100 has-[:checked]:(bg-accent text-on-accent opacity-100) has-[:focus-visible]:(outline-2 outline-accent -outline-offset-2)"
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
				</div>
			{/snippet}
			<!-- Four ordinary bars' width (the renderer's 24em step) and the padding: narrower, the window scrolls. -->
			<div class="p-4 min-w-[26rem]">
				<ChartRender
					{text}
					score
					{semitones}
					numerals={spelling === "names" ? null : spelling}
					label="The chart, rendered"
					onviewchange={(v) => (view = v)}
				/>
			</div>
		</Window>
	</div>
	<p data-credit class="text-xs opacity-60">
		The demo is “Peaceful Dreams” by Kevin Peckham, recorded by Badverbs. © Kevin Peckham, all rights
		reserved.
	</p>
</main>
