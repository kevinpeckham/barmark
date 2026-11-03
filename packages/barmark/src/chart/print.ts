import { isBar } from "./barLine.js";
import { printDirection } from "./direction.js";
import { beatsOf } from "./directives.js";
import { parseChart } from "./parse.js";
import type {
	Cell,
	ChartParse,
	Directives,
	Key,
	Line,
	Repeat,
	SimpleSlot,
	Slot,
	TempoChange,
	Words,
} from "./types.js";

/** A slot with no attack of its own continues whatever sounds before it. A repeated chord name is a re-attack. */
function continues(sounding: SimpleSlot | null, s: Slot): boolean {
	if (s.kind === "hold") return true;
	if (s.kind === "silence" || s.kind === "nc") return sounding?.kind === s.kind;
	return false;
}

/**
 * The fewest slots with the same timeline: `G / D /` is `G D`, `-- --` is `--`.
 * Only a slot with no attack of its own merges (`/`, a repeated `--` or
 * `N.C.`); a repeated chord name never does, and a group never heads a merged
 * block, because stretching it would move its members. Given the bar's beat
 * count, the result is never an uneven slot count unless the input's was the
 * same count, so printing adds no warning.
 */
export function reduceSlots(slots: Slot[], beats?: number): Slot[] {
	const k = slots.length;
	const cont: boolean[] = [];
	let sounding: SimpleSlot | null = null;
	for (const s of slots) {
		cont.push(continues(sounding, s));
		const last = s.kind === "group" ? s.members.at(-1) : s;
		if (last && last.kind !== "hold") sounding = last;
	}
	for (let m = 1; m <= k; m++) {
		if (k % m !== 0) continue;
		const size = k / m;
		if (beats !== undefined && m !== k && beats % m !== 0 && m % beats !== 0) continue;
		const merges = (c: boolean, i: number) =>
			i % size === 0 ? size === 1 || slots[i]?.kind !== "group" : c;
		if (cont.every(merges)) return slots.filter((_, i) => i % size === 0);
	}
	return slots;
}

const SYMBOLS = { hold: "/", nc: "N.C.", silence: "--", unknown: "?" } as const;

function printSimple(s: SimpleSlot): string {
	return s.kind === "chord" ? s.chord.canonical : SYMBOLS[s.kind];
}

/** A slot in canonical spelling; a group's members are joined with `_`. */
export function printSlot(s: Slot): string {
	return s.kind === "group" ? s.members.map(printSimple).join("_") : printSimple(s);
}

/** Each slot with the words written before it, and any words after the last. */
function withWords(slots: string[], words: Words[] = []): string {
	const said = (at: number) => words.filter((w) => w.at === at).map((w) => `"${w.text}"`);
	return [...slots.flatMap((s, i) => [...said(i), s]), ...said(slots.length)].join(" ");
}

/** The fewest slots, unless merging them would lose the place of some words. */
function reduceWithWords(
	slots: Slot[],
	words: Words[] | undefined,
	beats?: number,
): [Slot[], Words[]] {
	const reduced = reduceSlots(slots, beats);
	const size = slots.length / reduced.length;
	if (!words) return [reduced, []];
	if (words.some((w) => w.at % size !== 0)) return [slots, words];
	return [reduced, words.map((w) => ({ ...w, at: w.at / size }))];
}

/** A cell in canonical form: `%`, `...`, a mark, or an optional `[n/d]` and the fewest slots, with any words. */
export function printCell(c: Cell, beats?: number): string {
	if (c.kind === "simile") return withWords(["%"], c.words);
	if (c.kind === "fermata") return "...";
	if (c.kind === "direction") return printDirection(c.direction);
	if (c.kind === "rehearsal") return `@${c.label}`;
	const meter = c.meter ? `[${c.meter.n}/${c.meter.d}] ` : "";
	const [slots, words] = reduceWithWords(c.slots, c.words, beats);
	return meter + withWords(slots.map(printSlot), words);
}

/** An ending's passes as printed after its `|`: in order, runs of three or more as a range (`1-3`, `1,2`, `1,3-5`). */
export function printPasses(passes: number[]): string {
	const runs: number[][] = [];
	for (const p of passes) {
		const run = runs.at(-1);
		if (run && run.at(-1) === p - 1) run.push(p);
		else runs.push([p]);
	}
	return runs.flatMap((r) => (r.length >= 3 ? [`${r[0]}-${r.at(-1)}`] : r.map(String))).join(",");
}

const printRepeat = (r: Repeat) => (r === null ? "" : r === "open" ? " x ..." : ` x${r}`);

function printKey(k: Key): string {
	if (k.mode === "major") return k.tonic;
	if (k.mode === "minor") return `${k.tonic}m`;
	return `${k.tonic} ${k.mode}`;
}

function printTempoChange(c: TempoChange): string {
	if (c.kind === "a tempo") return "a tempo";
	return `${c.kind}.${c.to === null ? "" : ` to ${c.to}`}`;
}

function printDirectives(d: Directives): string {
	const parts: string[] = [];
	if (d.key) parts.push(`key: ${printKey(d.key)}`);
	if (d.time) parts.push(`time: ${d.time.n}/${d.time.d}`);
	if (d.tempo !== undefined) parts.push(`tempo: ${d.tempo}`);
	if (d.tempoChange) parts.push(`tempo: ${printTempoChange(d.tempoChange)}`);
	if (d.feel)
		parts.push(`feel: ${d.feel}${d.swingPercent === undefined ? "" : ` ${d.swingPercent}%`}`);
	return parts.join(", ");
}

/**
 * One parsed line in canonical form. Text and invalid lines print as stored.
 * `beats` gives each cell's beat count where known, so reduction adds no warning.
 */
export function printLine(l: Line, beats: (number | undefined)[] = []): string {
	switch (l.kind) {
		case "title":
			return `# ${l.text}`;
		case "section":
			return `## ${l.name.replace(/\s+/g, " ")}${printRepeat(l.repeat)}${l.elided ? " ->" : ""}`;
		case "directive":
			return printDirectives(l.set);
		case "bars":
			return `${l.opens ? "|:" : l.ending ? `|${printPasses(l.ending)}` : "|"} ${l.cells.map((c, i) => printCell(c, beats[i])).join(" | ")} ${l.closes ? ":|" : "|"}${printRepeat(l.repeat)}`;
		default:
			return l.text;
	}
}

/**
 * A chart in canonical form (spec §8). Spelling and layout only: lines with
 * errors and text lines print as written, and the author's blank lines and
 * fences stay. Never throws.
 */
export function printChart(text: string): string {
	return printParsed(text, parseChart(text));
}

/**
 * `printChart` over a parse you already have (`parseChart(text)`), so the
 * text isn't read twice. `edit`, if given, changes each line before it prints.
 */
export function printParsed(
	text: string,
	parsed: ChartParse,
	edit: (l: Line) => Line = (l) => l,
): string {
	const byLine = new Map(parsed.lines.map((l) => [l.line, l]));
	const errored = new Set(
		parsed.diagnostics.filter((d) => d.severity === "error").map((d) => d.line),
	);
	// Each cell's beat count on its first play, which is when its slot count is checked.
	const firstPlay = new Map<number, number[]>();
	for (const b of parsed.bars) {
		const l = byLine.get(b.line);
		const meters = firstPlay.get(b.line) ?? [];
		const cells = l?.kind === "bars" ? l.cells.filter(isBar).length : 0;
		if (meters.length < cells) firstPlay.set(b.line, [...meters, beatsOf(b.meter)]);
	}
	const beatsFor = (l: Line) => {
		if (l.kind !== "bars") return [];
		const meters = firstPlay.get(l.line) ?? [];
		let next = 0;
		return l.cells.map((c) => (isBar(c) ? meters[next++] : undefined));
	};
	const out: string[] = [];
	let lastWasHeading = false;
	const physical = text.replace(/^\uFEFF/, "").split(/\r?\n/);
	for (const [i, raw] of physical.entries()) {
		const t = raw.trim();
		if (!t) {
			if (out.length > 0 && out.at(-1) !== "") out.push("");
			continue;
		}
		const l = t.startsWith("```") ? undefined : byLine.get(i + 1);
		// Consecutive headings (a run of replays) stay together, as the spec's examples write them.
		if (l?.kind === "section" && !lastWasHeading && out.length > 0 && out.at(-1) !== "")
			out.push("");
		lastWasHeading = l?.kind === "section";
		if (!l) out.push(t.startsWith("```") ? t : raw.trimEnd());
		else
			out.push(
				l.kind === "text" || errored.has(l.line) ? raw.trimEnd() : printLine(edit(l), beatsFor(l)),
			);
	}
	while (out.at(-1) === "") out.pop();
	return out.length ? `${out.join("\n")}\n` : "";
}
