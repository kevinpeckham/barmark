/**
 * Regenerates the MuseScore files the import tests read
 * (packages/musicxml/tests/fixtures/import/): each `.mscx` source we wrote,
 * converted by MuseScore 4 to `.musicxml` (and to a
 * compressed `.mxl`), and each one's import as its expected `.chart.md`,
 * to read over before committing. It runs on the VM only, where `~/.local/bin/mscore`
 * runs MuseScore's AppImage under `xvfb-run` (FINDINGS.md); CI reads the
 * checked-in outputs and never needs MuseScore. It then checks that our
 * export's lyrics survive MuseScore; `--lyrics` runs that check alone.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportMusicXml, importMusicXml } from "../packages/musicxml/src/index.js";
import { convert, requireMscore } from "./mscore.js";

const DIR = fileURLToPath(new URL("../packages/musicxml/tests/fixtures/import/", import.meta.url));

/** Each source and the formats it is converted to. */
const SOURCES: [string, string[]][] = [
	["lead-sheet", ["musicxml", "mxl"]],
	["comping-guitar", ["musicxml", "mxl"]],
	["piano", ["musicxml", "mxl"]],
	["band", ["musicxml", "mxl"]],
	["hymn", ["musicxml", "mxl"]],
];

/** The importer must take the file as another program's: MuseScore names itself in `<software>`. */
function checkSoftware(xml: string): void {
	if (!readFileSync(xml, "utf8").includes("<software>MuseScore"))
		throw new Error(`${xml} doesn't name MuseScore as its software`);
}

requireMscore();
/** Regenerates every fixture from its `.mscx`, and the chart each `.musicxml` imports to. */
function regenerate(): void {
	for (const [name, formats] of SOURCES)
		for (const format of formats) {
			convert(`${DIR}${name}.mscx`, `${DIR}${name}.${format}`);
			console.log(`${name}.${format}`);
			if (format !== "musicxml") continue;
			checkSoftware(`${DIR}${name}.${format}`);
			const chart = importMusicXml(readFileSync(`${DIR}${name}.${format}`, "utf8")).text;
			writeFileSync(`${DIR}${name}.chart.md`, chart);
			console.log(`${name}.chart.md`);
		}
}

/** A lead sheet with two verses, a melisma and an elision, for the lyrics check. */
const LYRICS_CHART = `# Lyrics Check
part: Vox = Voice, instrument: voice
key: G, time: 3/4
Vox       | [1/4] N.C.    | G                           | C               / /      | G              |
Vox.Mel   | [1/4] {D4}:A- | {G4}:maz- / {B4}:ing_{G4}:/ | {E4}:the~end / {C4}:of | {D4}:it / /    |
lyrics 2: | 'Twas         | grace / that                | taught / my            | heart / /      |
`;

/** MuseScore writes an elision as SMuFL's lyrics elision glyph (U+E551) in a text of its own, not `<elision/>`. */
const ELISION = /<elision\/>|<text[^>]*>\uE551<\/text>/g;

/** The first group `re` matches in `s`, or "". */
const found = (re: RegExp, s: string) => re.exec(s)?.[1] ?? "";

/** One `<lyric>` as text: number, syllabic, its syllables (elided with ~) and + where an extension starts. */
function lyricText(n: string, body: string): string {
	const parts = body.split(ELISION).map((part) => found(/<text[^>]*>([^<]*)<\/text>/, part));
	const extend = body.includes("<extend") ? " +" : "";
	return `${n} ${found(/<syllabic>(\w+)<\/syllabic>/, body)} ${parts.join("~")}${extend}`;
}

/** Each lyric with text, as `lyricText`; an `<extend/>` alone, on a held note, is left out. */
function lyricsIn(xml: string): string[] {
	const lyrics = [...xml.matchAll(/<lyric number="(\d+)"[^>]*>([\s\S]*?)<\/lyric>/g)];
	return lyrics
		.filter(([, , body = ""]) => body.includes("<text"))
		.map(([, n = "", body = ""]) => lyricText(n, body).replaceAll("&apos;", "'"));
}

/**
 * Our export's lyrics go through MuseScore unchanged: their numbers,
 * syllabic, elisions and extensions. MuseScore keeps a melisma's
 * extension on its syllable and drops the held notes' `<extend/>`s, so
 * only lyrics with text are compared (FINDINGS.md).
 */
function checkLyrics(): void {
	const result = exportMusicXml(LYRICS_CHART);
	if (!result.ok) throw new Error(result.diagnostics.map((d) => d.message).join("; "));
	const dir = mkdtempSync(join(tmpdir(), "barmark-lyrics-"));
	const ours = join(dir, "ours.musicxml");
	const theirs = join(dir, "theirs.musicxml");
	writeFileSync(ours, result.xml);
	convert(ours, theirs);
	const want = lyricsIn(result.xml);
	const got = lyricsIn(readFileSync(theirs, "utf8"));
	rmSync(dir, { recursive: true, force: true });
	const shown = (l: string[]) => l.join("\n");
	if (shown(want) !== shown(got))
		throw new Error(
			`MuseScore changed the lyrics:\nours:\n${shown(want)}\nMuseScore's:\n${shown(got)}`,
		);
	console.log(`lyrics: ${want.length} survive MuseScore`);
}

// `--lyrics` runs the lyrics check alone, leaving the fixtures as they are.
if (!process.argv.includes("--lyrics")) regenerate();
checkLyrics();
