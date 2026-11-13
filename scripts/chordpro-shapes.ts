/**
 * Compare @barmark/fretboard's shapes with ChordPro's own guitar table.
 * VM only, never in CI, and never imported by a package or a test: advice
 * for a person, like the Dorico and MuseScore checks.
 *
 *   bun scripts/chordpro-shapes.ts [--json]
 *
 * Downloads ChordPro's lib/ChordPro/res/config/guitar.json at a pinned
 * commit into a fresh temporary directory, reads it there and removes the
 * directory. It writes nothing into the repository, and ChordPro's data
 * is never copied into our table (design section 3: option c). Prints the
 * totals, then the lists: ChordPro's shapes that do not sound their name,
 * and where our first choice differs from ChordPro's, by family. It fails
 * only on a download or parse error.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Shape, shapeFor, shapesFor, soundsChord } from "@barmark/fretboard";
import { type ChordRecord, parseChord } from "barmark";

const COMMIT = "4b25408";
const URL_ = `https://raw.githubusercontent.com/ChordPro/chordpro/${COMMIT}/lib/ChordPro/res/config/guitar.json`;

type Entry = { name: string; copy?: string; base?: number; frets?: (number | string)[] };
type Diff = { name: string; ours: string; theirs: string };
type Failure = { name: string; frets: string };

/** ChordPro's file as JSON, tolerating comments and trailing commas if a version has them. */
function parseRelaxed(text: string): { chords: Entry[] } {
	try {
		return JSON.parse(text);
	} catch {
		const plain = text
			.replace(/^\s*\/\/.*$/gm, "")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/,(\s*[}\]])/g, "$1");
		return JSON.parse(plain);
	}
}

/** A ChordPro fret as an absolute one: relative to `base`, -1 or x muted, 0 open. */
function absoluteFret(f: number | string, base: number): number {
	const n = String(f).toLowerCase() === "x" ? -1 : Number(f);
	return n > 0 ? n + base - 1 : n;
}

/** The entry an alias copies, followed to the end (at most ten hops). */
function original(byName: Map<string, Entry>, entry: Entry): Entry | undefined {
	let at: Entry | undefined = entry;
	for (let hops = 0; at?.copy && hops < 10; hops++) at = byName.get(at.copy);
	return at;
}

/** The table's names with their absolute frets; an alias takes its original's shape. */
function resolve(chords: Entry[]): Map<string, number[]> {
	const byName = new Map(chords.map((c) => [c.name, c]));
	const out = new Map<string, number[]>();
	for (const c of chords) {
		const at = original(byName, c);
		const frets = at?.frets?.map((f) => absoluteFret(f, at.base ?? 1));
		if (frets) out.set(c.name, frets);
	}
	return out;
}

const textOf = (frets: number[]): string => {
	const marks = frets.map((f) => (f < 0 ? "x" : String(f)));
	return frets.every((f) => f < 10) ? marks.join("") : marks.join(" ");
};

/** The groups a difference is listed under, tried in order on what follows a name's root. */
const FAMILIES: [family: string, test: RegExp][] = [
	["slash", /\//],
	["power", /^5/],
	["alterations", /[(#]|b\d|alt/],
	["extensions", /^(?!.*6\/?9)(?=.*(9|11|13))/],
	["sixths", /6/],
	["sevenths", /7/],
	["triads", /^(m|dim|aug|sus[24]?|)$/],
];

/** The chord form of a name, by what follows its root. */
function family(name: string): string {
	const form = name.replace(/^[A-G][#b♯♭]?/, "");
	return FAMILIES.find(([, test]) => test.test(form))?.[0] ?? "other";
}

/** What comparing one name found: whether ChordPro's shape sounds it, and ours beside theirs when we answer. */
type Judged = { sounds: boolean; ours?: string; theirs: string; inShapesFor: boolean };

/** Compare ChordPro's shape for a read name with ours. */
function judge(chord: ChordRecord, theirs: number[]): Judged {
	const text = textOf(theirs);
	const sounds = soundsChord({ frets: theirs, base: 1 }, chord);
	const ours = shapeFor(chord);
	if (!ours.ok) return { sounds, theirs: text, inShapesFor: false };
	const inShapesFor = shapesFor(chord).some((s: Shape) => textOf(s.frets) === text);
	return { sounds, ours: textOf(ours.shape.frets), theirs: text, inShapesFor };
}

type Tally = {
	names: number;
	own: number;
	aliases: number;
	read: number;
	theirsSound: number;
	answered: number;
	same: number;
	theirsInShapesFor: number;
};

type Report = { t: Tally; failures: Failure[]; diffs: Map<string, Diff[]> };

/** File a difference under its family. */
function addDiff(diffs: Map<string, Diff[]>, d: Diff): void {
	const fam = family(d.name);
	diffs.set(fam, [...(diffs.get(fam) ?? []), d]);
}

/** Add one judged name to the report. */
function add(report: Report, name: string, j: Judged): void {
	const { t, failures } = report;
	t.read++;
	t.theirsSound += Number(j.sounds);
	if (!j.sounds) failures.push({ name, frets: j.theirs });
	if (j.ours === undefined) return;
	t.answered++;
	t.theirsInShapesFor += Number(j.inShapesFor);
	t.same += Number(j.ours === j.theirs);
	if (j.ours !== j.theirs) addDiff(report.diffs, { name, ours: j.ours, theirs: j.theirs });
}

/** Judge every name of the table that barmark reads. */
function compareAll(chords: Entry[]): Report {
	const shapes = resolve(chords);
	const t: Tally = {
		names: 0,
		own: 0,
		aliases: 0,
		read: 0,
		theirsSound: 0,
		answered: 0,
		same: 0,
		theirsInShapesFor: 0,
	};
	const report: Report = { t, failures: [], diffs: new Map() };
	for (const c of chords.filter((e) => e.name !== "NC" && e.name !== "N.C.")) {
		t.names++;
		t.aliases += Number(c.copy !== undefined);
		t.own += Number(c.copy === undefined);
		const theirs = shapes.get(c.name);
		const parsed = parseChord(c.name);
		if (theirs && parsed.ok) add(report, c.name, judge(parsed.value, theirs));
	}
	return report;
}

/** Fetch the table into a fresh temporary directory, read it there and remove the directory. */
async function load(): Promise<{ chords: Entry[] }> {
	const dir = await mkdtemp(join(tmpdir(), "chordpro-shapes-"));
	try {
		const res = await fetch(URL_);
		if (!res.ok) throw new Error(`download failed: ${res.status} ${URL_}`);
		const file = join(dir, "guitar.json");
		await writeFile(file, await res.text());
		return parseRelaxed(await readFile(file, "utf8"));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

const pct = (n: number, of: number): string => (of ? `${((100 * n) / of).toFixed(1)}%` : "n/a");

/** The totals, with the shares worked out. */
function totalsOf(t: Tally): Record<string, string | number> {
	return {
		commit: COMMIT,
		...t,
		theirsSoundShare: pct(t.theirsSound, t.read),
		sameShare: pct(t.same, t.answered),
		theirsInShapesForShare: pct(t.theirsInShapesFor, t.answered),
	};
}

const byFamily = (diffs: Map<string, Diff[]>): [string, Diff[]][] =>
	[...diffs].sort(([a], [b]) => (a < b ? -1 : 1));

/** The lists of differences, by family, as lines. */
function differenceLines(diffs: Map<string, Diff[]>): string[] {
	return byFamily(diffs).flatMap(([fam, list]) => [
		`\nDifferences: ${fam} (${list.length})   name  ours  theirs`,
		...list.map((d) => `  ${d.name}  ${d.ours}  ${d.theirs}`),
	]);
}

/** The report as text: the totals, then the lists. */
function textOfReport(report: Report): string[] {
	return [
		`ChordPro guitar.json at ${COMMIT}`,
		...Object.entries(totalsOf(report.t)).map(([k, v]) => `  ${k}: ${v}`),
		`\nChordPro shapes that do not sound their name (${report.failures.length})`,
		...report.failures.map((f) => `  ${f.name}  ${f.frets}`),
		...differenceLines(report.diffs),
	];
}

/** The report as JSON: the same totals and lists. */
function jsonOfReport(report: Report): string {
	const differences = Object.fromEntries(byFamily(report.diffs));
	return JSON.stringify(
		{ totals: totalsOf(report.t), failures: report.failures, differences },
		null,
		2,
	);
}

async function main(): Promise<void> {
	const report = compareAll((await load()).chords);
	console.log(
		process.argv.includes("--json") ? jsonOfReport(report) : textOfReport(report).join("\n"),
	);
}

await main().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});
