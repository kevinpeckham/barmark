<script lang="ts">
import ChartRender from "#lib/components/ChartRender.svelte";
import Code from "#lib/components/Code.svelte";
import Window from "#lib/components/Window.svelte";
import { LINKS } from "#lib/site.js";
import {
	CLI_CI,
	INSTALL_LISTEN,
	INSTALL_MIDI,
	INSTALL_MUSICXML,
	INSTALL_PARSER,
	INSTALL_RENDER,
	INSTALL_SCORE,
	INSTALL_SYNC,
	LIVE_EDITOR,
	PACKAGES,
	SAMPLE_CHART,
	USE_BINARY,
	USE_CLI,
	USE_ELEMENT,
	USE_LISTEN,
	USE_MIDI,
	USE_MUSICXML,
	USE_PARSER,
	USE_PERFORM,
	USE_RENDER,
	USE_SCORE_ELEMENT,
	USE_SCORE_ENGRAVER,
	USE_SCORE_SERVER,
	USE_SYNC,
	VITE_CONFIG,
} from "#lib/start.js";

const description =
	"Write a Barmark chart, read it with the parser, draw it with @barmark/render or the <barmark-chart> web component, show it as a full score with @barmark/score, convert it to and from MusicXML with @barmark/musicxml and MIDI with @barmark/midi, check charts from the terminal with @barmark/cli, and line a chart up with a recording with @barmark/sync and @barmark/listen.";
const step = "font-serif text-xl text-ink";
const link = "underline decoration-accent/60 underline-offset-3 hover-text-accent";
const code = "font-mono text-accent";
const cell = "px-3 py-3 align-top lt-sm:(block px-0 py-1)";
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
			draws the bar grid as HTML or as a web component. The rest build on those two:
			<code class={code}>@barmark/score</code> shows the same chart as a full score beside the grid,
			<code class={code}>@barmark/musicxml</code> and <code class={code}>@barmark/midi</code> convert charts
			to and from MusicXML and MIDI, <code class={code}>@barmark/sync</code> and
			<code class={code}>@barmark/listen</code> line a chart up with a recording, and
			<code class={code}>@barmark/cli</code> puts them in the terminal, for checking charts without
			writing any code. The libraries are ESM, with TypeScript types, and run in Node 20 or later, Bun
			and the browser; the score's element runs in the browser, and its
			<code class={code}>renderScoreHtml</code> in Node or Bun. Every package is before 1.0, so pin the
			versions you use: each release's changes are in its changelog.
		</p>
	</div>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 id="packages" class="{step} scroll-mt-6">The packages</h2>
		<p class="max-w-prose opacity-80">
			Install only what you use. Each has a step below with a short example, and its README has the
			whole API.
		</p>
		<table class="w-full border-collapse text-left lt-sm:block">
			<thead class="text-xs uppercase tracking-wider opacity-60 border-b border-line lt-sm:sr-only">
				<tr>
					<th scope="col" class="px-3 py-2 font-400">Package</th>
					<th scope="col" class="px-3 py-2 font-400">What it does</th>
					<th scope="col" class="px-3 py-2 font-400">Use it for</th>
				</tr>
			</thead>
			<tbody class="lt-sm:(flex flex-col gap-3)">
				{#each PACKAGES as pkg (pkg.name)}
					<tr
						data-package={pkg.name}
						class="border-b border-line lt-sm:(block rounded-lg border border-line bg-row p-4)"
					>
						<th scope="row" class="{cell} font-400 whitespace-nowrap">
							<a href={pkg.step} class={link}><code class={code}>{pkg.name}</code></a>
							<a href={pkg.readme} class="block text-xs opacity-60 {link}">README</a>
						</th>
						<td class="{cell} max-w-sm opacity-80">{pkg.does}</td>
						<td class="{cell} max-w-xs opacity-80">{pkg.when}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

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
		<h2 id="parser" class="{step} scroll-mt-6">2. Read it with the parser</h2>
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
		<h2 id="render" class="{step} scroll-mt-6">3. Render it as HTML</h2>
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
		<h2 id="score" class="{step} scroll-mt-6">5. Or show it as a full score</h2>
		<p class="max-w-prose opacity-80">
			<code class={code}>&lt;barmark-score&gt;</code>, from <code class={code}>@barmark/score</code>, is
			<code class={code}>&lt;barmark-chart&gt;</code> with a Grid / Score switch above it. Score draws the
			same chart engraved on staves: chord symbols over rhythm slashes, a singer's melody and its lyrics
			as notes, and each part on a staff of its own. It takes the same sources and attributes as
			<code class={code}>&lt;barmark-chart&gt;</code>, plus <code class={code}>view="score"</code> to open
			on the score, and engraves again when its text changes.
		</p>
		<Code title="Terminal" code={INSTALL_SCORE} />
		<Window title="The example song · press Score">
			<div class="p-4 min-w-[26rem]">
				<ChartRender text={SAMPLE_CHART} score label="The example song, as a grid or a score" />
			</div>
		</Window>
		<Code title="index.html" code={USE_SCORE_ELEMENT} />
		<p class="max-w-prose opacity-80">
			The score is the heavier of the two. Its engraver, Verovio, is several megabytes, so it loads only
			the first time a reader presses Score, in a background worker, and one copy serves every score on
			the page. A reader who stays on the grid never downloads it; when the grid is all you need, use
			<code class={code}>&lt;barmark-chart&gt;</code>. To have the score sooner,
			<code class={code}>preload="intent"</code> starts loading Verovio when a reader reaches for Score,
			and <code class={code}>preload="idle"</code> once the page is idle. With
			<code class={code}>verovio-url</code> and <code class={code}>verovio-integrity</code> it comes from
			a CDN, checked against its digest; the package exports jsDelivr's as
			<code class={code}>VEROVIO_CDN_URL</code> and <code class={code}>VEROVIO_CDN_INTEGRITY</code>.
		</p>
		<p id="engraver" class="max-w-prose opacity-80 scroll-mt-6">
			Or load <code class={code}>@barmark/engraver</code>, a smaller build of the same Verovio made by
			Barmark: under half the download of stock, drawing the same score. Its WebAssembly is
			a file of its own, so it takes a second digest,
			<code class={code}>verovio-wasm-integrity</code>. The package exports jsDelivr's three as
			<code class={code}>ENGRAVER_CDN_URL</code>, <code class={code}>ENGRAVER_CDN_INTEGRITY</code> and
			<code class={code}>ENGRAVER_WASM_INTEGRITY</code>, which this site uses. If either file fails its
			digest, the element loads its own copy of stock Verovio instead.
		</p>
		<Code title="index.html" code={USE_SCORE_ENGRAVER} />
		<p class="max-w-prose opacity-80">
			On a server or a static site, <code class={code}>renderScoreHtml</code> draws the grid and the
			switch with no script, as <code class={code}>renderChart</code> does; the element takes it over in
			the browser.
		</p>
		<Code title="page.ts" code={USE_SCORE_SERVER} />
		<p class="max-w-prose opacity-80">
			Vite 8 draws a score with no configuration, but with <code class={code}>verovio-url</code> it needs
			<code class={code}>worker: {"{"} format: "es" {"}"}</code>, or the worker carries its own copy of Verovio
			and a reader downloads it twice. Vite 7 needs that setting in any case, and one more, so the worker
			can find Verovio:
		</p>
		<Code title="vite.config.js" code={VITE_CONFIG} />
		<p class="max-w-prose opacity-80">
			<code class={code}>@barmark/score</code> is MIT, like every Barmark package. It depends on
			<a href={LINKS.verovio} class={link}>Verovio</a>, which is licensed
			<a href={LINKS.verovioLicense} class={link}>LGPL-3.0</a>, as an ordinary npm package, loaded
			unchanged, or, if you choose it, the modified build <code class={code}>@barmark/engraver</code>
			(LGPL-3.0-only, <a href={LINKS.engraverRelease} class={link}>its source</a> published with each
			release). A site that bundles the score ships Verovio inside its bundle; the README says how to keep
			it a separate file and its notice.
		</p>
		<p class="max-w-prose opacity-80">
			Without a web page, <a href="#terminal" class={link}>the CLI</a>'s
			<code class={code}>render --score</code> writes the same score as a page to print.
		</p>
		<p class="text-sm opacity-80">
			Every attribute, the worker and the licence are in the
			<a href={LINKS.scoreReadme} class={link}>score package's README</a>.
		</p>
	</section>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 id="musicxml" class="{step} scroll-mt-6">6. Convert to and from MusicXML</h2>
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
		<h2 id="midi" class="{step} scroll-mt-6">7. Hear it as MIDI</h2>
		<p class="max-w-prose opacity-80">
			<code class={code}>exportMidi</code> writes a chart's play order as a Standard MIDI File, to hear
			it in a DAW, a practice player or a notation program: each chord as a block chord on piano (or
			on its part's instrument), with the tempo map, time and key signatures, a marker for each section,
			and the lyrics. It is a guide to the harmony, not an arrangement.
			<code class={code}>importMidi</code> reads a MIDI file back as a chart, naming each chord from
			the notes that sound; repeats come back written out, and a change between beats lands on the beat.
			Neither throws: what MIDI can't hold comes back as a loss or a diagnostic, each with its bar.
		</p>
		<Code title="Terminal" code={INSTALL_MIDI} />
		<Code title="midi.ts" code={USE_MIDI} />
		<p class="max-w-prose opacity-80">
			For a player of your own, the <code class={code}>@barmark/midi/perform</code> subpath gives the
			same performance as notes with no file: each with its pitch, velocity and time, in exact fractions
			of a quarter note that <code class={code}>secondsAt</code> turns into seconds through the tempo
			map. It loads none of the MIDI file code.
		</p>
		<Code title="player.ts" code={USE_PERFORM} />
		<p class="text-sm opacity-80">
			How each chord is voiced, swing, pushes and the pedal, and what import reads are in the
			<a href={LINKS.midiReadme} class={link}>MIDI package's README</a>. Export has been checked in
			MuseScore 4.7.6, and other programs are untested; the CLI's <code class={code}>export --midi</code> does it
			<a href="#terminal" class={link}>from the terminal</a>.
		</p>
	</section>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 id="terminal" class="{step} scroll-mt-6">8. Check charts from the terminal</h2>
		<p class="max-w-prose opacity-80">
			<code class={code}>@barmark/cli</code> is the <code class={code}>barmark</code> command. It
			checks a folder of charts and names each problem by file and line, rewrites charts in their
			standard form, transposes them, renders one as a page that opens in any browser (the bar grid, or
			the full score), exports one as MusicXML or MIDI, imports a MusicXML score or a MIDI file as a
			chart, and with <code class={code}>part</code> pulls one part out of a chart of several. It runs
			with <code class={code}>npx</code> on Node 20.6 or later, with nothing to install.
		</p>
		<Code title="Terminal" code={USE_CLI} />
		<p class="max-w-prose opacity-80">
			Without Node, download the standalone binary for your system from the CLI's
			<a href={LINKS.cliReleases} class={link}>GitHub releases</a>: one file, with the parser, the
			renderer, the converters and Verovio inside. Make it executable, and run it as you would
			<code class={code}>barmark</code>.
		</p>
		<Code title="Terminal" code={USE_BINARY} />
		<p class="max-w-prose opacity-80">
			<code class={code}>render --score</code> writes a standalone HTML page of the full engraved score,
			the one <code class={code}>&lt;barmark-score&gt;</code> shows: open it in a browser and print it to
			PDF from there. <code class={code}>--width</code> sets the width it is laid out for (320 to 40000
			pixels, 900 by default), which decides how many bars go on a line, and
			<code class={code}>--part</code> engraves one part alone. Verovio is built into the CLI and its
			standalone binaries, so there is nothing else to install; it is LGPL-3.0, and the binaries' release
			carries its licence as <code class={code}>Verovio-LGPL-3.0.txt</code>.
		</p>
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
		<h2 id="sync" class="{step} scroll-mt-6">9. Sync a chart with a recording</h2>
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
		<p class="max-w-prose opacity-80">
			A player that only reads timing maps can import <code class={code}>barAt</code> and
			<code class={code}>secondsAtBar</code> from <code class={code}>@barmark/sync/timing</code>, which
			leaves the builder out.
		</p>
		<p class="text-sm opacity-80">
			The input it reads, the timing map's format and every diagnostic are in the
			<a href={LINKS.syncReadme} class={link}>sync package's README</a>.
		</p>
	</section>

	<section class="flex flex-col gap-4 min-w-0">
		<h2 id="listen" class="{step} scroll-mt-6">10. Or start from the recording</h2>
		<p class="max-w-prose opacity-80">
			<code class={code}>@barmark/listen</code> is the newest package, at 0.1: the recording-to-chart
			code of <a href={LINKS.stemShovel} class={link}>Stem Shovel</a>, ported with the app's arithmetic in
			the app's order, so the app and other tools run one copy. From a recording's samples and a chord model's runs,
			<code class={code}>chartFromRecording</code> finds the bar lines and bar one, then writes the
			chart and its timing map with <code class={code}>@barmark/sync</code>.
			<code class={code}>alignChart</code> lines up a chart you already have with a recording instead.
		</p>
		<p class="max-w-prose opacity-80">
			It detects neither chords, nor tempo, nor meter. The chords come from a chord model of your own,
			and you declare the tempo and meter: a wrong one gives a faithful chart on the wrong bars, so treat
			what it writes as a draft for a person to check. Every call returns a result or its refusals, and
			never throws.
		</p>
		<Code title="Terminal" code={INSTALL_LISTEN} />
		<Code title="listen.ts" code={USE_LISTEN} />
		<p class="text-sm opacity-80">
			The features it reads, each option and every refusal are in the
			<a href={LINKS.listenReadme} class={link}>listen package's README</a>.
		</p>
	</section>
</main>
