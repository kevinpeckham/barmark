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
 * warns, so stderr is read: it may hold "Running in reference mode.",
 * each warning's indented echo of its source line, and two warnings only
 * where the chart beside the sheet (same name, .chart.md) expects them:
 * "Unknown chord" (and its "No chord diagram defined for" summary) for a
 * chord of that chart that `isGap` calls a gap, unless the sheet defines
 * it before its first use, and "Song is missing {key} directive" for a
 * chart with no `key:`. Anything else fails, and so does an expected
 * warning that does not come, so the gap rules never go stale.
 *
 * Prints one line per sheet; exits 1 on any failure, 2 when the tool is
 * not installed. Writes nothing into the repository.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { type ChartParse, type ChordRecord, parseChart, type Slot } from "barmark";
import { isGap, spelled } from "../packages/lyricsheet/src/export/spell.js";
import { type ChoLine, readCho } from "../packages/lyricsheet/tests/read-cho.js";

const PERL5 = join(homedir(), ".local/perl5");
const TOOL = join(PERL5, "bin/chordpro");
const FIXTURES = join(import.meta.dir, "../packages/lyricsheet/tests/fixtures");

/** Every chord record a slot holds, a group's members included. */
const chordsOf = (slots: Slot[]): ChordRecord[] =>
	slots
		.flatMap((s) => (s.kind === "group" ? s.members : [s]))
		.flatMap((s) => (s.kind === "chord" ? [s.chord] : []));

type Slotted = { slots: Slot[]; lines?: { slots: Slot[] }[] };

/** A bar's or a part's chords, its lines' included. */
const ownChords = (b: Slotted): ChordRecord[] => [
	...chordsOf(b.slots),
	...(b.lines ?? []).flatMap((l) => chordsOf(l.slots)),
];

/** Every chord the chart plays, in every part and line. */
const chartChords = (parse: ChartParse): ChordRecord[] =>
	parse.bars.flatMap((bar) => [
		...ownChords(bar),
		...(bar.parts ?? []).flatMap((p) => (p ? ownChords(p) : [])),
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

/** The names used before any `{define}` of them: those the reference has no diagram for when it meets them. */
function usedUndefined(lines: ChoLine[]): Set<string> {
	const defined = new Set<string>();
	const used = new Set<string>();
	for (const line of lines) {
		defined.add(definedBy(line) ?? "");
		for (const name of namesOf(line).filter((n) => !defined.has(n))) used.add(name);
	}
	return used;
}

type Expected = { gaps: Set<string>; noKey: boolean };

/** The warnings a sheet may give, from the chart beside it. */
function expectedOf(cho: string, chart: string): Expected {
	const parse = parseChart(readFileSync(chart, "utf8"));
	const used = usedUndefined(readCho(readFileSync(cho, "utf8")));
	const gaps = new Set(
		chartChords(parse)
			.filter(isGap)
			.map(spelled)
			.filter((n) => used.has(n)),
	);
	return { gaps, noKey: !parse.bars[0]?.key };
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
		/^"[^"]*", line \d+, Unknown chord: "?(.*?)"?$/,
		([, name = ""], e, warned) => {
			warned.add(name);
			return e.gaps.has(name) ? null : `unexpected Unknown chord ${name}`;
		},
	],
	[
		/^"[^"]*": No chord diagram defined for (.*) \(skipped\)$/,
		([, list = ""], e) => {
			const stray = summaryNames(list).filter((n) => !e.gaps.has(n));
			return stray.length ? `no diagram for ${stray.join(", ")}` : null;
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
function checkWith(cho: string, chart: string, out: string): Checked {
	const e = expectedOf(cho, chart);
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
	const chart = cho.replace(/\.cho$/, ".chart.md");
	if (!existsSync(chart))
		return { problems: [`no chart beside it (${basename(chart)})`], expected: [] };
	try {
		return checkWith(cho, chart, out);
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
