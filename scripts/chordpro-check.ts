/**
 * Check lyric sheets against ChordPro's own Perl `chordpro` (spec 5.3).
 * VM only, never in CI: the tool is installed in ~/.local/perl5.
 *
 *   bun scripts/chordpro-check.ts [--keep] [file.cho…]
 *
 * With no files, checks every packages/lyricsheet/tests/fixtures/*.cho.
 * Each sheet is run as
 *
 *   PERL5LIB=~/.local/perl5/lib/perl5 chordpro --reference --strict -o <out>.pdf <file>.cho
 *
 * (and once more to a .txt, for a person to read), into a fresh temporary
 * directory, removed after unless --keep. The tool exits 0 even when it
 * warns, so stderr is read against the chart beside the sheet, named as
 * the tests name fixtures (`tests/fixtures.ts`): `name.cho` is
 * `name.chart.md` exported as is, `name@Label.cho` the same chart's part
 * `Label`, and a `+guitar` suffix adds diagrams. It may hold "Running in
 * reference mode." and each warning's indented echo of its source line,
 * and:
 *
 * - `Unknown chord: "X"` (quoted: the tool's chord parser rejects X) only
 *   for a chord of the chart that `isGap` calls a gap, and every such gap
 *   of the part the export writes (the one named, else the first that
 *   writes chords) MUST draw it, unless the sheet defines the name before
 *   its first use;
 * - `Unknown chord: X` (bare: X parses, but the tool's built-in table has
 *   no diagram for it) and the "No chord diagram defined for" summary for
 *   any chord of the chart not defined before its first use; neither is
 *   required;
 * - "Song is missing {key} directive" exactly when the chart has no key the
 *   header writes (none, or a church mode), and then it is required.
 *
 * Anything else fails, so the gap rules never go stale.
 *
 * Prints one line per sheet; exits 1 on any failure, 2 when the tool is
 * not installed. Writes nothing into the repository.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { type ChartParse, type ChordRecord, parseChart, type Slot } from "barmark";
import { headerLines } from "../packages/lyricsheet/src/export/meta.js";
import { isGap, spelled } from "../packages/lyricsheet/src/export/spell.js";
import { fixtureOf } from "../packages/lyricsheet/tests/fixtures.js";
import { type ChoLine, readCho } from "../packages/lyricsheet/tests/read-cho.js";

const PERL5 = join(homedir(), ".local/perl5");
const TOOL = join(PERL5, "bin/chordpro");
const FIXTURES = join(import.meta.dir, "../packages/lyricsheet/tests/fixtures");

/** Every chord symbol a slot holds, a group's members included; a note set is written as text, not a chord. */
const chordsOf = (slots: Slot[]): ChordRecord[] =>
	slots
		.flatMap((s) => (s.kind === "group" ? s.members : [s]))
		.flatMap((s) => (s.kind === "chord" && s.chord.kind === "chord" ? [s.chord] : []));

/** The chords of part `i` (the top-level slots are the first part's). */
const partChords = (parse: ChartParse, i: number): ChordRecord[] =>
	parse.bars.flatMap((bar) => chordsOf(bar.parts?.[i]?.slots ?? (i === 0 ? bar.slots : [])));

/** The chords of the part the export writes: the one named, else the first that writes chord symbols (spec 4.4). */
function writtenChords(parse: ChartParse, part: string | undefined): ChordRecord[] {
	const label = part?.toLowerCase();
	if (label !== undefined)
		return partChords(
			parse,
			parse.parts.findIndex((p) => p.label?.toLowerCase() === label),
		);
	const each = Array.from({ length: Math.max(1, parse.parts.length) }, (_, i) =>
		partChords(parse, i),
	);
	return each.find((chords) => chords.length > 0) ?? [];
}

/** Every chord the chart plays, in every part. */
const allChords = (parse: ChartParse): ChordRecord[] =>
	parse.bars.flatMap((bar) => [
		...chordsOf(bar.slots),
		...(bar.parts ?? []).flatMap((p) => chordsOf(p?.slots ?? [])),
	]);

/** The chord names a line writes: lyric chords that are not annotations, and grid cells. */
function namesOf(line: ChoLine): string[] {
	if (line.kind === "grid") return line.cells.flatMap((c) => c.split("~"));
	if (line.kind !== "lyrics") return [];
	return line.tokens.flatMap((t) => ("chord" in t && !t.chord.startsWith("*") ? [t.chord] : []));
}

/** The name a `{define: name …}` line defines, or null. */
const definedBy = (line: ChoLine): string | null =>
	line.kind === "directive" && line.name === "define" ? (line.value.split(" ")[0] ?? "") : null;

/** Each name the sheet writes, at the index of the line that first writes it. */
function firstUses(lines: ChoLine[]): Map<string, number> {
	const first = new Map<string, number>();
	lines.forEach((line, i) => {
		for (const n of namesOf(line).filter((n) => !first.has(n))) first.set(n, i);
	});
	return first;
}

/** The names the sheet defines before their first use (or never uses): the reference is quiet about them. */
function definedFirst(lines: ChoLine[]): Set<string> {
	const first = firstUses(lines);
	const before = (name: string, i: number) => (first.get(name) ?? lines.length) > i;
	return new Set(
		lines.flatMap((line, i) => {
			const name = definedBy(line);
			return name !== null && before(name, i) ? [name] : [];
		}),
	);
}

type Expected = { gaps: Set<string>; names: Set<string>; noKey: boolean };

/** Whether the header writes a `{key}` for the chart (none for a church mode it leaves out). */
const hasKey = (parse: ChartParse) =>
	headerLines(parse, undefined).some((l) => l.startsWith("{key:"));

/** The warnings a sheet may give, and must, from the chart beside it. */
function expectedOf(cho: string, chart: string, part: string | undefined): Expected {
	const parse = parseChart(readFileSync(chart, "utf8"));
	const quiet = definedFirst(readCho(readFileSync(cho, "utf8")));
	const loud = (chords: ChordRecord[]) => new Set(chords.map(spelled).filter((n) => !quiet.has(n)));
	const gaps = loud(writtenChords(parse, part).filter(isGap));
	return { gaps, names: loud(allChords(parse)), noKey: !hasKey(parse) };
}

/** The tool's run on one sheet, writing into `out`: its stderr. */
function run(cho: string, out: string): string {
	const env = { ...process.env, PERL5LIB: join(PERL5, "lib/perl5") };
	const name = basename(cho, ".cho");
	const args = (ext: string) => ["--reference", "--strict", "-o", join(out, `${name}.${ext}`), cho];
	spawnSync(TOOL, args("txt"), { env, encoding: "utf8" });
	const r = spawnSync(TOOL, args("pdf"), { env, encoding: "utf8" });
	return r.status === 0 ? r.stderr : `${r.stderr}\nchordpro exited ${r.status}`;
}

/** The names in a summary: `"A", "B" and "C"`. */
const summaryNames = (list: string) => [...list.matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? "");

type Judge = (m: RegExpExecArray, e: Expected, warned: Set<string>) => string | null;

/** Each stderr line the tool may print, and what is wrong with it given what is expected (null: nothing). */
const LINES: [RegExp, Judge][] = [
	// The banner, a warning's indented echo of its source line, and the end.
	[/^(?:Running in reference mode\.|\s.*|)$/, () => null],
	[
		// Quoted: the tool's chord parser rejects the name.
		/^"[^"]*", line \d+, Unknown chord: "(.*)"$/,
		([, name = ""], e, warned) => {
			warned.add(name);
			return e.gaps.has(name) ? null : `the parser rejects ${name}`;
		},
	],
	[
		// Bare: the name parses; the tool's own table has no diagram for it.
		/^"[^"]*", line \d+, Unknown chord: ([^"].*)$/,
		([, name = ""], e) =>
			e.names.has(name) ? null : `no diagram for ${name}, not a chord of the chart`,
	],
	[
		/^"[^"]*": No chord diagram defined for (.*) \(skipped\)$/,
		([, list = ""], e) => {
			const stray = summaryNames(list).filter((n) => !e.names.has(n));
			return stray.length ? `no diagram for ${stray.join(", ")}, not chords of the chart` : null;
		},
	],
	[
		/^"[^"]*": Song is missing \{key\} directive$/,
		(_, e, warned) => {
			warned.add("{key}");
			return e.noKey ? null : "missing {key}, but the chart has a key";
		},
	],
];

/** What is wrong with one stderr line; null when nothing. */
function judge(line: string, e: Expected, warned: Set<string>): string | null {
	for (const [pattern, judged] of LINES) {
		const m = pattern.exec(line);
		if (m) return judged(m, e, warned);
	}
	return line;
}

/** The expected warnings that did not come. */
function missing(e: Expected, warned: Set<string>): string[] {
	const out = [...e.gaps].filter((g) => !warned.has(g)).map((g) => `gap ${g} did not warn`);
	return e.noKey && !warned.has("{key}") ? [...out, "no key, but no warning"] : out;
}

type Checked = { problems: string[]; expected: string[] };

/** Every problem with one sheet whose chart is beside it, and the warnings it expected. */
function checkWith(cho: string, chart: string, part: string | undefined, out: string): Checked {
	const e = expectedOf(cho, chart, part);
	const warned = new Set<string>();
	const found = run(cho, out)
		.split("\n")
		.map((l) => judge(l, e, warned))
		.filter((p): p is string => p !== null);
	const expected = [...e.gaps, ...(e.noKey ? ["no key"] : [])];
	return { problems: [...found, ...missing(e, warned)], expected };
}

/** Every problem with one sheet. */
function check(cho: string, out: string): Checked {
	let made: ReturnType<typeof fixtureOf>;
	try {
		made = fixtureOf(basename(cho));
	} catch (err) {
		return { problems: [(err as Error).message], expected: [] };
	}
	const chart = join(dirname(cho), made.chart);
	if (!existsSync(chart))
		return { problems: [`no chart beside it (${basename(chart)})`], expected: [] };
	try {
		return checkWith(cho, chart, made.options.part, out);
	} catch (err) {
		return { problems: [(err as Error).message], expected: [] };
	}
}

/** One line for a sheet. */
function report(file: string, r: Checked): string {
	if (r.problems.length) return `FAIL ${file}: ${r.problems.join("; ")}`;
	return r.expected.length ? `ok   ${file} (expected: ${r.expected.join(", ")})` : `ok   ${file}`;
}

/** The sheets named, or every fixture sheet. */
function sheets(given: string[]): string[] {
	if (given.length) return given;
	return readdirSync(FIXTURES)
		.filter((f) => f.endsWith(".cho"))
		.sort()
		.map((f) => join(FIXTURES, f));
}

function main(): number {
	if (!existsSync(TOOL)) {
		console.error(`chordpro is not installed at ${TOOL} (this script runs on the VM only)`);
		return 2;
	}
	const args = process.argv.slice(2);
	const out = mkdtempSync(join(tmpdir(), "chordpro-check-"));
	const results = sheets(args.filter((a) => a !== "--keep")).map((f) => {
		const r = check(f, out);
		console.log(report(f, r));
		return r.problems.length === 0;
	});
	if (args.includes("--keep")) console.log(`output kept in ${out}`);
	else rmSync(out, { recursive: true, force: true });
	return results.every(Boolean) ? 0 : 1;
}

process.exit(main());
