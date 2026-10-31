<script lang="ts">
import { onMount } from "svelte";
import CategoryChips from "#lib/components/CategoryChips.svelte";
import GuideSearch from "#lib/components/GuideSearch.svelte";
import GuideTable from "#lib/components/GuideTable.svelte";
import { type GuideQuery, readQuery, writeQuery } from "#lib/guide/query.js";
import { LINKS } from "#lib/site.js";
import { replaceState } from "$app/navigation";

// The prerendered page has no query, so every row shows without
// JavaScript; a shared link's query is read once the page runs.
let query: GuideQuery = $state({ q: "", cat: null, sort: "category" });
let ready = $state(false);

onMount(() => {
	query = readQuery(new URLSearchParams(location.search));
	ready = true;
});

$effect(() => {
	const search = writeQuery(query);
	if (!ready) return;
	replaceState(search ? `?${search}` : location.pathname, {});
});

const description =
	"Everything you can write in barmark, one row each: search it, filter it, and see each example rendered.";
</script>

<svelte:head>
	<title>Syntax · barmark</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="{LINKS.origin}/syntax" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{LINKS.origin}/syntax" />
	<meta property="og:title" content="Syntax · barmark" />
	<meta property="og:description" content={description} />
</svelte:head>

<main class="home-page-x-padding py-10 flex flex-col gap-6 min-w-0">
	<div>
		<h1 class="marketing-headline text-ink">The syntax</h1>
		<p class="max-w-prose opacity-80">
			Everything you can write in a barmark chart, one row each, with an example and how it
			renders. A line is chords only when it starts with <code class="font-mono text-accent">|</code
			>; everything else is a heading, a directive or text.
		</p>
	</div>

	<div class="flex flex-col gap-4">
		<div class="flex flex-wrap items-end gap-4">
			<GuideSearch bind:value={query.q} />
			<div class="flex flex-col gap-1.5">
				<label for="guide-sort" class="text-xs uppercase tracking-wider opacity-60">Sort</label>
				<select
					id="guide-sort"
					bind:value={query.sort}
					class="rounded-md border border-white/25 bg-dark px-3 py-2 focus-visible-(outline-2 outline-accent)"
				>
					<option value="category">By category</option>
					<option value="name">By name</option>
				</select>
			</div>
		</div>
		<CategoryChips bind:value={query.cat} />
	</div>

	<GuideTable {query} />

	<p class="text-sm opacity-80">
		The full rules are in the
		<a href={LINKS.grammar} rel="noopener" class="underline decoration-accent/60 underline-offset-3 hover-text-accent"
			>barmark grammar</a
		>, which this guide follows.
	</p>
</main>
