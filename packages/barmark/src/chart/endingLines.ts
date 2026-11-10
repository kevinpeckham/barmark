import type { Line } from "./types.js";

type BarsLine = Extract<Line, { kind: "bars" }>;

/** Lines that may sit between endings, and between an ending's lines (grammar 5.1): they mean nothing to the timeline. */
export const BETWEEN_ENDINGS = new Set<Line["kind"]>(["text", "credit", "lyrics", "break"]);

/** A line, or a system's lines together (grammar 7.4), with the line its structure is read from. */
type Unit = { lines: Line[]; ref: Line };

const inSystem = (l: Line) => (l.kind === "bars" || l.kind === "invalid") && l.system !== undefined;
const systemOf = (l: Line) => (l.kind === "bars" || l.kind === "invalid" ? l.system : undefined);

/** The chart's lines as units: each system's lines read as one, by its first line that reads and agrees. */
function unitsOf(lines: Line[]): Unit[] {
	const units: Unit[] = [];
	for (const l of lines) {
		const last = units.at(-1);
		const first = last?.lines[0];
		if (last && first && inSystem(l) && systemOf(first) === systemOf(l)) last.lines.push(l);
		else units.push({ lines: [l], ref: l });
	}
	for (const u of units)
		u.ref = u.lines.find((l) => l.kind === "bars" && !l.dropped) ?? (u.lines[0] as Line);
	return units;
}

const bars = (l: Line): BarsLine | null => (l.kind === "bars" ? l : null);
/** A bar line with no repeat start and no ending: one an ending can continue onto. */
const plain = (l: Line) => l.kind === "bars" && !l.opens && !l.ending;
const startsEnding = (l: Line | undefined) => l?.kind === "bars" && l.ending !== null;

/** The unit after `from` that isn't a line between endings. */
function nextHeard(units: Unit[], from: number): Line | undefined {
	return units.slice(from).find((u) => !BETWEEN_ENDINGS.has(u.ref.kind))?.ref;
}

/**
 * The units an unclosed ending at `at` continues onto: the plain bar lines
 * after it, up to its `:|` or the next ending, when another ending follows
 * (grammar 5.1). The last ending has none, so it ends at its own line.
 */
function continuation(units: Unit[], at: number): number[] {
	const run: number[] = [];
	for (let k = at + 1; k < units.length; k++) {
		const ref = (units[k] as Unit).ref;
		if (BETWEEN_ENDINGS.has(ref.kind)) continue;
		if (startsEnding(ref)) return run;
		if (!plain(ref)) return [];
		run.push(k);
		if (bars(ref)?.closes) return startsEnding(nextHeard(units, k + 1)) ? run : [];
	}
	return [];
}

/**
 * Where a section's repeats stand, as `pairRepeats` pairs them: a `|:`
 * waiting for its `:|`, or a repeat's endings being collected.
 */
type Pairing = { open: boolean; endings: boolean };

/** Whether `l` is an ending of a paired repeat, moving the pairing past it. */
function paired(p: Pairing, l: Line): boolean {
	if (l.kind === "bars" && l.ending) {
		p.endings = p.open || p.endings;
		p.open = false;
		return p.endings;
	}
	if (p.endings && BETWEEN_ENDINGS.has(l.kind)) return false;
	p.endings = false;
	if (l.kind === "section") p.open = false;
	if (l.kind === "bars") p.open = l.closes ? false : p.open || l.opens;
	return false;
}

/**
 * Mark the plain bar lines that continue an ending onto further lines
 * (grammar 5.1, Kevin's decision 2026-11-10): each gets the ending's
 * passes as `continues`. Only an ending of a paired repeat continues, so
 * an ending with no `|:` before it leaves a stray `:|` stray. Never throws.
 */
export function continueEndings(lines: Line[]): Line[] {
	const units = unitsOf(lines);
	const marked = new Map<Line, number[]>();
	const pairing: Pairing = { open: false, endings: false };
	for (let i = 0; i < units.length; i++) {
		const ref = (units[i] as Unit).ref;
		if (!paired(pairing, ref) || ref.kind !== "bars" || !ref.ending || ref.closes) continue;
		const run = continuation(units, i);
		for (const k of run) for (const l of (units[k] as Unit).lines) marked.set(l, ref.ending);
		// The lines it continues onto belong to the ending: the pairing goes on after them.
		i = run.at(-1) ?? i;
	}
	if (!marked.size) return lines;
	return lines.map((l) => {
		const passes = marked.get(l);
		return passes && l.kind === "bars" ? { ...l, continues: passes } : l;
	});
}
