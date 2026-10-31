<script lang="ts">
import Button from "#lib/components/Button.svelte";
import ChartRender from "#lib/components/ChartRender.svelte";
import SourceEditor from "#lib/components/SourceEditor.svelte";
import Window from "#lib/components/Window.svelte";
import demo from "#lib/demo.chart.md?raw";
import { HEADLINE, LINKS, TAGLINE_AFTER, TAGLINE_BEFORE, TAGLINE_LINK } from "#lib/site.js";

let text = $state(demo);
const description =
	"barmark is a markdown-inspired plain-text notation for chord charts. Edit a chart and watch it render.";
</script>

<svelte:head>
	<title>barmark: plain-text chord charts</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="{LINKS.origin}/" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{LINKS.origin}/" />
	<meta property="og:title" content="barmark: plain-text chord charts" />
	<meta property="og:description" content={description} />
</svelte:head>

<main class="home-page-x-padding py-10 lg:py-14 flex flex-col gap-8 min-w-0">
	<div>
		<h1 class="marketing-headline text-ink">{HEADLINE}</h1>
		<p class="max-w-prose opacity-80">
			{TAGLINE_BEFORE}<a
				href={LINKS.stemShovel}
				rel="noopener"
				class="underline decoration-accent/60 underline-offset-3 hover-text-accent">{TAGLINE_LINK}</a
			>{TAGLINE_AFTER}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Button href="/syntax" variant="accent">Read the syntax</Button>
		<Button href={LINKS.github} external>
			<span class="i-ph-github-logo" aria-hidden="true"></span>GitHub
		</Button>
		<Button href={LINKS.npm} external><code class="font-mono text-sm">npm i barmark</code></Button>
		<Button href={LINKS.article} external>Why we built it</Button>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4">
		<Window title="Source · edit me">
			<div class="flex flex-col h-full">
				<SourceEditor bind:value={text} label="barmark source of the chart" />
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
		<Window title="Rendered · @barmark/render">
			<div class="p-4">
				<ChartRender {text} label="The chart, rendered" />
			</div>
		</Window>
	</div>
</main>
