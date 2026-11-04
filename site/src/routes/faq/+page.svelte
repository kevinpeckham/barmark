<script lang="ts">
import { onMount } from "svelte";
import { LINKS } from "#lib/site.js";

const description =
	"What Barmark is, who makes it, how it compares with other chord notations, what it suits, and how it is licensed.";
const link = "underline decoration-accent/60 underline-offset-3 hover-text-accent";
const code = "font-mono text-accent";
const question = "font-serif text-xl text-ink scroll-mt-6";

/** The questions, in order; each answer below carries the same id. */
const QUESTIONS = [
	["what", "What is Barmark?"],
	["look", "What does a chart look like?"],
	["stem-shovel", "What is Stem Shovel?"],
	["who", "Who is behind Barmark?"],
	["different", "How is Barmark different from other chord notations?"],
	["fit", "What is Barmark a good fit for?"],
	["not-fit", "What isn't it for?"],
	["open-source", "Is Barmark open source?"],
	["stable", "Is the notation finished?"],
	["cli", "Can I check my charts without writing code?"],
	["numerals", "Can I write Nashville numbers or Roman numerals?"],
	["lyrics", "Can a chart hold lyrics?"],
	["tested", "How do you know it reads charts correctly?"],
	["help", "How do I report a problem or suggest a change?"],
] as const;

/** The question being read: the last one whose heading has reached the top of the window. */
let current: string = $state(QUESTIONS[0][0]);
const TOP = 120;

onMount(() => {
	const headings = QUESTIONS.map(([id]) => document.getElementById(id)).filter((h) => h !== null);
	let frame = 0;
	const update = () => {
		frame = 0;
		const passed = headings.filter((h) => h.getBoundingClientRect().top <= TOP);
		current = (passed.at(-1) ?? headings[0])?.id ?? current;
	};
	const onScroll = () => {
		frame ||= requestAnimationFrame(update);
	};
	update();
	addEventListener("scroll", onScroll, { passive: true });
	return () => {
		removeEventListener("scroll", onScroll);
		cancelAnimationFrame(frame);
	};
});
</script>

<svelte:head>
	<title>FAQ · Barmark</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="{LINKS.origin}/faq" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{LINKS.origin}/faq" />
	<meta property="og:title" content="FAQ · Barmark" />
	<meta property="og:description" content={description} />
</svelte:head>

{#snippet heading(id: string)}
	<h2 {id} class={question}>{QUESTIONS.find(([key]) => key === id)?.[1]}</h2>
{/snippet}

<main class="home-page-x-padding py-10 flex flex-col gap-6 min-w-0">
	<h1 class="marketing-headline text-ink">Frequently asked questions</h1>

	<!-- Wide: the questions in a column that stays in view beside the answers. Narrow: above them. -->
	<div class="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] gap-10 lg:gap-14 items-start">
		<aside class="lg:(sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto)">
			<nav aria-label="Questions">
				<h2 class="window-label mb-3">Questions</h2>
				<ul class="flex flex-col text-sm">
					{#each QUESTIONS as [id, text] (id)}
						<li>
							<a
								href="#{id}"
								aria-current={current === id ? "true" : undefined}
								class="block border-l-2 border-line pl-3 py-1.5 opacity-75 hover-(opacity-100 text-accent) aria-[current=true]:(border-accent text-accent opacity-100) focus-visible-(outline-2 outline-accent)"
								>{text}</a
							>
						</li>
					{/each}
				</ul>
			</nav>
		</aside>

		<div class="flex flex-col gap-10 max-w-prose min-w-0 [&_p]:opacity-85 [&_section]:(flex flex-col gap-3)">
			<section>
				{@render heading("what")}
				<p>
					Barmark is a plain-text notation for chord charts: the bar grid musicians already write on
					whiteboards and in notes apps (<code class={code}>| D | A | Bm | G |</code>), with rules precise
					enough that software reads a chart the same way a band does. A chart says which chords sound in
					which bars, in which sections, in what key, meter and tempo, and in what order the song plays.
				</p>
				<p>
					It is also three npm packages: <code class={code}>barmark</code> reads and writes charts,
					<code class={code}>@barmark/render</code> draws them as a clean bar grid on any web page, and
					<code class={code}>@barmark/cli</code> does both from the terminal.
				</p>
			</section>

			<section>
				{@render heading("look")}
				<p>
					Like this. Sections start with <code class={code}>##</code>, a repeat sign plays a line twice,
					and two chords in a bar split it in half:
				</p>
				<pre class="rounded-lg border border-line bg-row p-4 font-mono text-sm overflow-x-auto">key: D, time: 4/4

## Verse
|: D | A | Bm | G :|

## Chorus
| G D | A | Bm A | G |</pre>
				<p>
					The <a href="/syntax" class={link}>Syntax Guide</a> shows every rule with an example, and
					<a href="/try" class={link}>Try It</a> reads whatever you type.
				</p>
			</section>

			<section>
				{@render heading("stem-shovel")}
				<p>
					<a href={LINKS.stemShovel} class={link}>Stem Shovel</a> is an open-source, web-based
					collaboration tool for musicians, songwriters, bands and producers. Its chart reader lines up a
					band's chord chart with the recording, so it can find each section in the audio. Barmark is that
					reader's rules, written down and published on their own.
				</p>
			</section>

			<section>
				{@render heading("who")}
				<p>
					Barmark is made by <a href={LINKS.lightningJar} class={link}>Lightning Jar</a>, a small web
					studio founded in 2002, and led by its principal, Kevin Peckham, who also built Stem Shovel.
					<a href={LINKS.article} class={link}>Introducing Barmark</a> tells why we built it.
				</p>
			</section>

			<section>
				{@render heading("different")}
				<p>
					Most chord notations hang chords on lyrics, or live inside one app. Barmark is anchored to bars,
					and it is plain text.
				</p>
				<ul class="flex flex-col gap-2 list-disc pl-5 opacity-85">
					<li>
						<strong class="text-ink">ChordPro</strong> is the established format for lyrics with chords,
						and the right choice for a songbook. It places chords over words; Barmark places them in bars,
						so it can say how long each one lasts.
					</li>
					<li>
						<strong class="text-ink">iReal Pro</strong> is the best-known digital bar grid, but its charts
						live in its app. A Barmark chart is a text file you can keep, diff and share anywhere.
					</li>
					<li>
						<strong class="text-ink">ChartDown</strong> writes charts in Nashville numbers. It is a
						neighbor rather than a rival: Barmark writes chord names, and its renderer can show them as
						numbers.
					</li>
					<li>
						<strong class="text-ink">Harte labels</strong> are the academic standard for naming chords in
						music research. Barmark converts every chord to and from a Harte label, so its output fits
						that work.
					</li>
				</ul>
				<p>
					And unlike the informal charts it grew from, Barmark settles the ambiguous cases. An empty bar,
					the reach of <code class={code}>x2</code> at the end of a line, and a slash inside a bar each
					have one meaning.
				</p>
			</section>

			<section>
				{@render heading("fit")}
				<ul class="flex flex-col gap-2 list-disc pl-5 opacity-85">
					<li>
						Bands and session players who want charts everyone reads the same way, kept in plain files
						that last.
					</li>
					<li>
						Music apps that store, transpose, display or play back chord progressions, and want a format
						that is easy for people to write and exact for code to read.
					</li>
					<li>
						Websites, blogs and docs that show chord charts: one element, no image to export, readable by
						screen readers.
					</li>
					<li>
						Practice and teaching tools that switch a chart between chord names, Nashville numbers and
						Roman numerals.
					</li>
					<li>
						Music research and audio tools that align chords with recordings, where every bar has to be
						accounted for.
					</li>
				</ul>
			</section>

			<section>
				{@render heading("not-fit")}
				<p>
					Barmark describes harmony in time, not who plays what. It doesn't write melodies, rhythms note
					by note or individual parts; that is the job of standard notation and formats such as
					MusicXML. For lyrics with chords above the words, ChordPro is the better fit.
				</p>
			</section>

			<section>
				{@render heading("open-source")}
				<p>
					Yes. The code is MIT-licensed (<a href={LINKS.license} class={link}>LICENSE</a>) and on
					<a href={LINKS.github} class={link}>GitHub</a>, and the packages are free on
					<a href={LINKS.npm} class={link}>npm</a>. The <a href={LINKS.grammar} class={link}>grammar</a>
					is licensed under CC BY 4.0 (<a href={LINKS.specLicense} class={link}>licence</a>): anyone may
					copy it, adapt it or write their own reader for it, as long as they credit it. The
					Syntax Guide is licensed the same way.
				</p>
			</section>

			<section>
				{@render heading("stable")}
				<p>
					Not yet. The <a href={LINKS.grammar} class={link}>grammar</a> is a v0.1 draft, and the packages
					are at 0.x, so a minor release can still change the notation or the API. Every change is
					recorded in the packages' changelogs.
				</p>
			</section>

			<section>
				{@render heading("cli")}
				<p>
					Yes. With Node installed, <code class={code}>npx @barmark/cli check songs</code> reads every
					chart in a folder and names each problem by file and line, and
					<code class={code}>format --write</code> puts them in standard form. Run in GitHub Actions, it
					fails a pull request that breaks a chart and marks the line;
					<a href={LINKS.songs} class={link}>kevinpeckham/songs</a> works this way. There are also
					standalone binaries that need no Node. <a href="/get-started#terminal" class={link}>Get
					Started</a> shows the commands.
				</p>
			</section>

			<section>
				{@render heading("numerals")}
				<p>
					You write chord names, and the renderer can show them as numbers. Set
					<code class={code}>numerals="nashville"</code> or <code class={code}>numerals="roman"</code> on
					the chart and each chord appears as its degree in the key: Bm in D is 6m, or vi. The home page's
					chart has a switch for it.
				</p>
			</section>

			<section>
				{@render heading("lyrics")}
				<p>
					Yes. Any line that isn't bars, a heading or a directive is text, so lyrics, cues and notes go on
					lines of their own between the rows of bars, and the renderer shows them there. Barmark doesn't
					align chords to syllables.
				</p>
			</section>

			<section>
				{@render heading("tested")}
				<p>
					The rules come from software that already worked: Stem Shovel's chart reader, checked against
					real recordings with the band's own section markings as the answer key. The parser's tests
					include real charts exactly as a band wrote them, every example in the grammar, and randomly
					generated charts that must print and read back with the same meaning.
				</p>
			</section>

			<section>
				{@render heading("help")}
				<p>
					Open an issue on <a href={LINKS.issues} class={link}>GitHub</a>: a chart that reads wrongly, a
					rule that is unclear, or notation you need that Barmark lacks.
				</p>
			</section>
		</div>
	</div>
</main>
