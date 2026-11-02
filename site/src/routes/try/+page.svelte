<script lang="ts">
import { onMount, tick, untrack } from "svelte";
import GuideTable from "#lib/components/GuideTable.svelte";
import TryReading from "#lib/components/TryReading.svelte";
import Window from "#lib/components/Window.svelte";
import { LINKS } from "#lib/site.js";
import { EXAMPLES, guideQuery, linkQuery, read } from "#lib/try/read.js";
import { keepQuery } from "#lib/url.js";

const first = EXAMPLES[0] ?? "";

// The prerendered page reads the first example; a shared link's query is read once the page runs.
// Until then the page stays hidden (SHARED_LINK), so the link never shows the example first.
let text = $state(first);
let ready = $state(false);
let box: HTMLTextAreaElement | undefined = $state();

/** Past this the reading waits for typing to pause, as ChartRender's preview does. */
const LONG = 10_000;
const PAUSE_MS = 250;
let settled = $state(untrack(() => text));
$effect(() => {
	const next = text;
	if (next.length < LONG) {
		settled = next;
		return;
	}
	const timer = setTimeout(() => (settled = next), PAUSE_MS);
	return () => clearTimeout(timer);
});

const reading = $derived(read(settled));
const query = $derived(guideQuery(reading, settled));
/** null: too long to keep in the link. */
const link = $derived(linkQuery(settled));
const rows = $derived(Math.min(8, text.split("\n").length));

onMount(async () => {
	const q = new URLSearchParams(location.search).get("q");
	if (q !== null) text = q;
	ready = true;
	await tick();
	delete document.documentElement.dataset.tryLink;
});

$effect(() => {
	const search = link ?? "";
	if (!ready) return;
	return keepQuery(search);
});

/** The fix replaces the error, its button with it, so the keyboard goes back to the box. */
function tryFix(suggestion: string) {
	text = suggestion;
	box?.focus();
}

// Runs before the first paint; JavaScript that never arrives shows the page after 4 s.
// The closing tag is spelt in two pieces: written whole, it would end this script block (FINDINGS.md).
const SHARED_LINK = `<script>if (/[?&]q=/.test(location.search)) {
	document.documentElement.dataset.tryLink = "";
	setTimeout(() => delete document.documentElement.dataset.tryLink, 4000);
}</${"script"}>`;

const description = "Type a chord, a Harte label or a bit of chart and see how barmark reads it.";
const chip =
	"px-3 py-1 rounded-full border text-sm font-mono border-white/45 hover-border-accent focus-visible-(outline-2 outline-accent outline-offset-2)";
</script>

<svelte:head>
	{@html SHARED_LINK}
	<title>Try it · barmark</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="{LINKS.origin}/try" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{LINKS.origin}/try" />
	<meta property="og:title" content="Try it · barmark" />
	<meta property="og:description" content={description} />
</svelte:head>

<main class="home-page-x-padding py-10 flex flex-col gap-6 min-w-0">
	<div>
		<h1 class="marketing-headline text-ink">Try it</h1>
		<p class="max-w-prose opacity-80">
			Type a chord symbol, a Harte label, a set of notes or a few bars, and see what barmark makes of
			it, with the guide rows that go with it.
		</p>
	</div>

	<div class="flex flex-col gap-6 min-w-0 [html[data-try-link]_&]:invisible">
		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-1.5 min-w-0">
				<label for="try-input" class="text-xs uppercase tracking-wider opacity-60">barmark to read</label>
				<textarea
					id="try-input"
					bind:this={box}
					bind:value={text}
					{rows}
					autocomplete="off"
					spellcheck="false"
					wrap="off"
					class="w-full rounded-md border border-white/45 bg-transparent px-3 py-2 font-mono resize-y focus-visible-(border-accent outline-2 outline-accent/40)"
				></textarea>
				{#if link === null}
					<p class="text-xs opacity-60">Too long to keep in the link: copy the text to share it.</p>
				{/if}
			</div>
			<div role="group" aria-label="Examples" class="flex flex-wrap gap-2">
				{#each EXAMPLES as example (example)}
					<button type="button" data-example class={chip} onclick={() => (text = example)}>{example}</button>
				{/each}
			</div>
		</div>

		<Window title="barmark reads">
			<TryReading {reading} text={settled} ontry={tryFix} />
		</Window>

		{#if query === null}
			<p class="text-sm opacity-80">
				<a href="/syntax" class="underline decoration-accent/60 underline-offset-3 hover-text-accent"
					>See the whole syntax</a
				>
			</p>
		{/if}
		<div hidden={query === null} class="flex flex-col gap-4 min-w-0">
			<GuideTable query={query ?? { q: "", cat: null, sort: "category" }} />
		</div>
	</div>
</main>
