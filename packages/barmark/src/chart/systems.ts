import { printDirection } from "./direction.js";
import type { Cell, ChartDiagnostic, Line, Repeat } from "./types.js";

type BarsLine = Extract<Line, { kind: "bars" }>;
type Labelled = Extract<Line, { kind: "bars" | "invalid" }>;

const repeatOf = (r: Repeat) => (r === null ? "" : r === "open" ? " x ..." : ` x${r}`);

function cellShape(c: Cell): string {
	switch (c.kind) {
		case "slots":
			return c.meter ? `B[${c.meter.n}/${c.meter.d}]` : "B";
		case "simile":
			return "B";
		case "fermata":
			return "...";
		case "rehearsal":
			return `@${c.label}`;
		default:
			return printDirection(c.direction);
	}
}

const opening = (l: BarsLine) => (l.opens ? "|:" : l.ending ? `|${l.ending.join(",")}` : "|");
const closing = (l: BarsLine) => `${l.closes ? ":|" : "|"}${repeatOf(l.repeat)}`;

/** The marks of a bar line that shape the timeline, which every line of a system shares (grammar 7.4). */
export function structureOf(l: BarsLine): string {
	return `${opening(l)} ${l.cells.map(cellShape).join(" ")} ${closing(l)}`;
}

const barCount = (l: BarsLine) =>
	l.cells.filter((c) => c.kind === "slots" || c.kind === "simile").length;

/** Why a system's line differs from its first, or null. */
function differs(l: BarsLine, ref: BarsLine): string | null {
	const n = barCount(ref);
	if (barCount(l) !== n)
		return `this system's lines have ${n} bars (line ${ref.line}); this one has ${barCount(l)}`;
	if (opening(l) !== opening(ref) || closing(l) !== closing(ref))
		return `every line of a system writes the same repeat marks (line ${ref.line})`;
	if (structureOf(l) !== structureOf(ref))
		return `every line of a system writes the same marks in the same places (line ${ref.line})`;
	return null;
}

const isLabelled = (l: Line): l is Labelled =>
	(l.kind === "bars" || l.kind === "invalid") && l.part !== undefined;

/** Number each run of labelled lines with no label twice (grammar 7.4). */
function numberSystems(lines: Line[]): Line[] {
	let system = -1;
	let seen: Set<string> | null = null;
	return lines.map((l) => {
		if (!isLabelled(l)) {
			seen = null;
			return l;
		}
		const label = l.part ?? "";
		if (!seen || seen.has(label)) {
			system++;
			seen = new Set();
		}
		seen.add(label);
		return { ...l, system };
	});
}

/**
 * Group a multi-part chart's labelled bar lines into systems and check that
 * each system's lines share their bars and structure. A line that differs is
 * an error and is marked `dropped`. Never throws.
 */
export function groupSystems(lines: Line[]): { lines: Line[]; diagnostics: ChartDiagnostic[] } {
	const diagnostics: ChartDiagnostic[] = [];
	const numbered = numberSystems(lines);
	const first = new Map<number, BarsLine>();
	const out = numbered.map((l) => {
		if (l.kind !== "bars" || l.system === undefined) return l;
		const ref = first.get(l.system);
		if (!ref) {
			first.set(l.system, l);
			return l;
		}
		const problem = differs(l, ref);
		if (!problem) return l;
		diagnostics.push({ line: l.line, severity: "error", message: problem, token: l.part ?? "" });
		return { ...l, dropped: true as const };
	});
	return { lines: out, diagnostics };
}
