import type { ChartDiagnostic, Directives, Line } from "./types.js";

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

/** The same lines, and directive lines too: what an ending would continue past if directives could sit in it. */
const PAST_DIRECTIVES = new Set<Line["kind"]>([...BETWEEN_ENDINGS, "directive"]);

/** The first unit from `from` whose kind isn't one of `past`; reads only up to it. */
function nextHeard(units: Unit[], from: number, past: Set<Line["kind"]>): Line | undefined {
	let k = from;
	while (k < units.length && past.has((units[k] as Unit).ref.kind)) k++;
	return units[k]?.ref;
}

/**
 * The units an unclosed ending at `at` continues onto: the plain bar lines
 * after it, up to its `:|` or the next ending, when another ending follows
 * (grammar 5.1). The last ending has none, so it ends at its own line.
 * `past` are the lines that may sit among them.
 */
function continuation(units: Unit[], at: number, past = BETWEEN_ENDINGS): number[] {
	const run: number[] = [];
	for (let k = at + 1; k < units.length; k++) {
		const ref = (units[k] as Unit).ref;
		if (past.has(ref.kind)) continue;
		if (startsEnding(ref)) return run;
		if (!plain(ref)) return [];
		run.push(k);
		if (bars(ref)?.closes) return startsEnding(nextHeard(units, k + 1, past)) ? run : [];
	}
	return [];
}

/** A directive line's own name, as its token: `time:`, `tempo:`. */
function directiveName(set: Directives): string {
	const first = Object.keys(set)[0] ?? "key";
	const name = { tempoChange: "tempo", swingPercent: "feel" }[first] ?? first;
	return `${name}:`;
}

/**
 * The directive line that stopped an ending continuing, when without it
 * the ending would have continued: named, beside the errors that follow
 * (grammar 5.1). Null when nothing would have continued anyway.
 */
function directiveInside(units: Unit[], at: number, head: BarsLine): ChartDiagnostic | null {
	if (continuation(units, at).length || !continuation(units, at, PAST_DIRECTIVES).length)
		return null;
	for (let k = at + 1; k < units.length; k++) {
		const ref = (units[k] as Unit).ref;
		if (startsEnding(ref)) break;
		if (ref.kind === "directive")
			return {
				line: ref.line,
				severity: "error",
				message: `a directive line ends the ending |${head.ending?.join(",")} above it; an ending's lines can't hold one`,
				token: directiveName(ref.set),
			};
	}
	return null;
}

/**
 * Where a section's repeats stand, as `pairRepeats` pairs them: a `|:`
 * waiting for its `:|`, or a repeat's endings being collected.
 */
type Pairing = { open: boolean; endings: boolean };

/** Whether a `|:` is waiting for its `:|` after `l`: a heading or a `:|` ends it, a `|:` opens one. */
function stillOpen(open: boolean, l: Line): boolean {
	if (l.kind === "section") return false;
	if (l.kind !== "bars") return open;
	return !l.closes && (open || l.opens);
}

/** Whether `l` is an ending of a paired repeat, moving the pairing past it. */
function paired(p: Pairing, l: Line): boolean {
	if (l.kind === "bars" && l.ending) {
		p.endings = p.open || p.endings;
		p.open = false;
		return p.endings;
	}
	if (!(p.endings && BETWEEN_ENDINGS.has(l.kind))) {
		p.endings = false;
		p.open = stillOpen(p.open, l);
	}
	return false;
}

/**
 * Mark the plain bar lines that continue an ending onto further lines
 * (grammar 5.1, Kevin's decision 2026-11-10): each gets the ending's
 * passes as `continues`. Only an ending of a paired repeat continues, so
 * an ending with no `|:` before it leaves a stray `:|` stray. Never throws.
 */
export function continueEndings(lines: Line[]): { lines: Line[]; diagnostics: ChartDiagnostic[] } {
	const units = unitsOf(lines);
	const marked = new Map<Line, number[]>();
	const diagnostics: ChartDiagnostic[] = [];
	const pairing: Pairing = { open: false, endings: false };
	for (let i = 0; i < units.length; i++) {
		const ref = (units[i] as Unit).ref;
		if (!paired(pairing, ref) || ref.kind !== "bars" || !ref.ending || ref.closes) continue;
		const run = continuation(units, i);
		for (const k of run) for (const l of (units[k] as Unit).lines) marked.set(l, ref.ending);
		const inside = directiveInside(units, i, ref);
		if (inside) diagnostics.push(inside);
		// The lines it continues onto belong to the ending: the pairing goes on after them.
		i = run.at(-1) ?? i;
	}
	if (!marked.size) return { lines, diagnostics };
	const out = lines.map((l) => {
		const passes = marked.get(l);
		return passes && l.kind === "bars" ? { ...l, continues: passes } : l;
	});
	return { lines: out, diagnostics };
}
