<script lang="ts">
import ChartRender from "#lib/components/ChartRender.svelte";
import Code from "#lib/components/Code.svelte";
import Window from "#lib/components/Window.svelte";
import { LINKS } from "#lib/site.js";
import {
	INSTALL_PARSER,
	INSTALL_RENDER,
	LIVE_EDITOR,
	SAMPLE_CHART,
	USE_ELEMENT,
	USE_PARSER,
	USE_RENDER,
} from "#lib/start.js";

const description =
	"Write a Barmark chart, read it with the barmark parser, and draw it with @barmark/render or the <barmark-chart> web component.";
const step = "font-serif text-xl text-ink";
const link = "underline decoration-accent/60 underline-offset-3 hover-text-accent";
const code = "font-mono text-accent";
</script>

<svelte:head>
	<title>Get Started · barmark</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="{LINKS.origin}/get-started" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{LINKS.origin}/get-started" />
	<meta property="og:title" content="Get Started · barmark" />
	<meta property="og:description" content={description} />
</svelte:head>

<main class="home-page-x-padding py-10 flex flex-col gap-10 min-w-0">
	<div>
		<h1 class="marketing-headline text-ink">Get started</h1>
		<p class="max-w-prose opacity-80">
			A Barmark chart is a plain-text file. Two packages read and draw it:
			<code class={code}>barmark</code>, the parser, and <code class={code}>@barmark/render</code>, which
			draws the bar grid as HTML or as a web component. Both are ESM, with TypeScript types, and run in
			Node 20 or later, Bun, Deno and the browser.
		</p>
	</div>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 class={step}>1. Write a chart</h2>
		<p class="max-w-prose opacity-80">
			Bars sit between pipes, sections start with <code class={code}>##</code>, and the key, meter and
			tempo are written out. Save it with the extension <code class={code}>.chart.md</code>: a Barmark
			file is a markdown file, so any markdown viewer shows it. The
			<a href="/syntax" class={link}>Syntax Guide</a> has every rule, and you can
			<a href="/try" class={link}>try it</a> in the browser.
		</p>
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<Code title="example-song.chart.md" code={SAMPLE_CHART} />
			<Window title="Rendered">
				<div class="p-4 min-w-[26rem]">
					<ChartRender text={SAMPLE_CHART} label="The example song, rendered" />
				</div>
			</Window>
		</div>
	</section>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 class={step}>2. Read it with barmark</h2>
		<p class="max-w-prose opacity-80">
			<code class={code}>parseChart</code> gives you every bar in play order, with its chords, section,
			key, meter and tempo, and a list of problems, each with a line number. It never throws on what
			you type. The same package prints a chart in its standard form, transposes it, and converts
			chords to and from Harte labels.
		</p>
		<Code title="Terminal" code={INSTALL_PARSER} />
		<Code title="app.ts" code={USE_PARSER} />
		<p class="text-sm opacity-80">
			Everything it exports is in the <a href={LINKS.parserReadme} class={link}>barmark README</a>.
		</p>
	</section>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 class={step}>3. Render it as HTML</h2>
		<p class="max-w-prose opacity-80">
			<code class={code}>renderChart</code> returns the chart as HTML for a server or a static site. It
			carries its own styles in a declarative shadow root, so it shows without JavaScript and your
			page's CSS can't disturb the bars. It follows light and dark mode, scales with the reader's
			text size, and reads to a screen reader as music.
		</p>
		<Code title="Terminal" code={INSTALL_RENDER} />
		<Code title="page.ts" code={USE_RENDER} />
	</section>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 class={step}>4. Or use the web component</h2>
		<p class="max-w-prose opacity-80">
			In the browser, <code class={code}>&lt;barmark-chart&gt;</code> draws a chart from a file, from
			the text inside it, or from its <code class={code}>text</code> property, and draws it again when
			any of them change. Attributes set the theme, bar numbers, rehearsal letters and a Nashville or
			Roman numeral view.
		</p>
		<Code title="index.html" code={USE_ELEMENT} />
		<p class="max-w-prose opacity-80">For a live editor, set its text as the reader types:</p>
		<Code title="editor.js" code={LIVE_EDITOR} />
		<p class="text-sm opacity-80">
			Every option and attribute is in the
			<a href={LINKS.renderReadme} class={link}>@barmark/render README</a>.
		</p>
	</section>
</main>
