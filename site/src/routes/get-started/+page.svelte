<script lang="ts">
import ChartRender from "#lib/components/ChartRender.svelte";
import Code from "#lib/components/Code.svelte";
import Window from "#lib/components/Window.svelte";
import { LINKS } from "#lib/site.js";
import {
	CLI_CI,
	INSTALL_MUSICXML,
	INSTALL_PARSER,
	INSTALL_RENDER,
	INSTALL_SYNC,
	LIVE_EDITOR,
	SAMPLE_CHART,
	USE_CLI,
	USE_ELEMENT,
	USE_MUSICXML,
	USE_PARSER,
	USE_RENDER,
	USE_SYNC,
} from "#lib/start.js";

const description =
	"Write a Barmark chart, read it with the parser, draw it with @barmark/render or the <barmark-chart> web component, convert it to and from MusicXML with @barmark/musicxml, check charts from the terminal with @barmark/cli, and sync a chart with a recording with @barmark/sync.";
const step = "font-serif text-xl text-ink";
const link = "underline decoration-accent/60 underline-offset-3 hover-text-accent";
const code = "font-mono text-accent";
</script>

<svelte:head>
	<title>Get Started · Barmark</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="{LINKS.origin}/get-started" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{LINKS.origin}/get-started" />
	<meta property="og:title" content="Get Started · Barmark" />
	<meta property="og:description" content={description} />
</svelte:head>

<main class="home-page-x-padding py-10 flex flex-col gap-10 min-w-0">
	<div>
		<h1 class="marketing-headline text-ink">Get started</h1>
		<p class="max-w-prose opacity-80">
			A Barmark chart is a plain-text file. Two packages read and draw it:
			<code class={code}>barmark</code>, the parser, and <code class={code}>@barmark/render</code>, which
			draws the bar grid as HTML or as a web component. <code class={code}>@barmark/musicxml</code> converts
			charts to and from MusicXML, and <code class={code}>@barmark/sync</code> syncs a chart with a
			recording. All four are ESM, with TypeScript types, and run in Node 20 or later, Bun, Deno and
			the browser. <code class={code}>@barmark/cli</code> puts them in the terminal, for checking
			charts without writing any code.
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
		<h2 class={step}>2. Read it with the parser</h2>
		<p class="max-w-prose opacity-80">
			<code class={code}>parseChart</code> gives you every bar in play order, with its chords, section,
			key, meter and tempo, and a list of problems, each with a line number. It never throws on what
			you type. The same package prints a chart in its standard form, transposes it, and converts
			chords to and from Harte labels.
		</p>
		<Code title="Terminal" code={INSTALL_PARSER} />
		<Code title="app.ts" code={USE_PARSER} />
		<p class="text-sm opacity-80">
			Everything it exports is in the <a href={LINKS.parserReadme} class={link}>parser's README</a>.
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
			<a href={LINKS.renderReadme} class={link}>renderer's README</a>.
		</p>
	</section>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 class={step}>5. Convert to and from MusicXML</h2>
		<p class="max-w-prose opacity-80">
			<code class={code}>exportMusicXml</code> writes a chart as MusicXML 4.0, so it opens in MuseScore,
			Dorico, Sibelius or Finale with the same bars, chords, repeats, sections and parts, and plays in
			the chart's play order. <code class={code}>importMusicXml</code> reads a score back into a chart:
			its chord symbols, sections, repeats and endings, parts, and a singer's melody and verses. Neither
			throws; what can't come over is a warning.
		</p>
		<Code title="Terminal" code={INSTALL_MUSICXML} />
		<Code title="convert.ts" code={USE_MUSICXML} />
		<p class="text-sm opacity-80">
			What each direction keeps is in the <a href={LINKS.musicxmlReadme} class={link}>MusicXML package's
			README</a>, with a note on compressed <code class={code}>.mxl</code> files.
		</p>
	</section>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 id="terminal" class="{step} scroll-mt-6">6. Check charts from the terminal</h2>
		<p class="max-w-prose opacity-80">
			<code class={code}>@barmark/cli</code> is the <code class={code}>barmark</code> command. It
			checks a folder of charts and names each problem by file and line, rewrites charts in their
			standard form, transposes them, renders one as a page that opens in any browser, and exports one
			as MusicXML for MuseScore, Dorico or Sibelius. It runs
			with <code class={code}>npx</code> on Node 20.6 or later, with nothing to install; without Node,
			download a standalone binary from its
			<a href={LINKS.cliReleases} class={link}>GitHub releases</a>.
		</p>
		<Code title="Terminal" code={USE_CLI} />
		<p class="max-w-prose opacity-80">
			In CI it keeps a repository of charts readable: a chart with a mistake fails the build, and on
			GitHub each problem is marked on its line in the pull request. Pin the version, so a new release
			arrives as a change you review.
		</p>
		<Code title=".github/workflows/check.yml" code={CLI_CI} />
		<p class="text-sm opacity-80">
			Every command and flag is in the <a href={LINKS.cliReadme} class={link}>CLI's README</a>, and
			<a href={LINKS.songs} class={link}>kevinpeckham/songs</a> is a repository of charts checked this
			way.
		</p>
	</section>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 id="sync" class="{step} scroll-mt-6">7. Sync a chart with a recording</h2>
		<p class="max-w-prose opacity-80">
			<code class={code}>@barmark/sync</code> is for audio tools. <code class={code}>chartFromDetections</code>
			takes what a chord detector hears in a recording, its bar starts and chord runs in seconds, and
			writes a chart from it, with the title, sections, key, meter and tempo it is given. Beside the
			chart it returns a timing map, which says when each played bar starts, so a player can show the
			bar that is sounding or jump to a bar. It never throws; what it changed or couldn't use comes
			back as a diagnostic.
		</p>
		<Code title="Terminal" code={INSTALL_SYNC} />
		<Code title="sync.ts" code={USE_SYNC} />
		<p class="text-sm opacity-80">
			The input it reads, the timing map's format and every diagnostic are in the
			<a href={LINKS.syncReadme} class={link}>sync package's README</a>.
		</p>
	</section>
</main>
