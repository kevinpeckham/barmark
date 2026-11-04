import type { ChartDiagnostic, DeclaredPart, Line, Part, SimpleSlot, Slot } from "./types.js";

type Labelled = Extract<Line, { kind: "bars" | "invalid" }>;
type BarsLine = Extract<Line, { kind: "bars" }>;

/** At most this many lines per part (grammar 7.6). */
export const MAX_LINES = 4;

const isLabelled = (l: Line): l is Labelled =>
	(l.kind === "bars" || l.kind === "invalid") && l.part !== undefined;

const members = (s: Slot): SimpleSlot[] => (s.kind === "group" ? s.members : [s]);
const slotsOf = (l: BarsLine): SimpleSlot[] =>
	l.cells.flatMap((c) => (c.kind === "slots" ? c.slots.flatMap(members) : []));

/** Why a line that is not its part's first in a system can't be what it is, or null (grammar 7.6). */
function notesOnlyProblem(l: BarsLine): string | null {
	const slots = slotsOf(l);
	const harmony = slots.some(
		(s) =>
			s.kind === "nc" ||
			s.kind === "unknown" ||
			(s.kind === "chord" && (s.chord.kind !== "notes" || s.voicing !== undefined)),
	);
	if (harmony)
		return "chord symbols go on the part's first line; write a note set here, or a voicing on the first line";
	return slots.some((s) => s.kind === "chord" && s.pedal)
		? "a pedal mark goes on the part's first line"
		: null;
}

/** Each part's line names in first-appearance order, each line renamed to its first spelling; a fifth is an error. */
function nameLines(
	lines: Line[],
	report: (l: Labelled, message: string) => Line,
): { lines: Line[]; names: Map<string, string[]> } {
	const names = new Map<string, string[]>();
	const out = lines.map((l) => {
		if (!isLabelled(l) || l.lineName === undefined) return l;
		const own = names.get(l.part ?? "") ?? [];
		const known = own.find((n) => n.toLowerCase() === l.lineName?.toLowerCase());
		if (known) return { ...l, lineName: known };
		if (own.length >= MAX_LINES) return report(l, "a part has at most four lines");
		names.set(l.part ?? "", [...own, l.lineName]);
		return l;
	});
	return { lines: out, names };
}

/** Why a part's later line in a system can't stand, or null. */
function laterLineProblem(own: Labelled[], l: Labelled): string | null {
	if (own.some((o) => o.lineName === undefined))
		return "a system writes a part as one bare line or as its lines, not both";
	return l.kind === "bars" ? notesOnlyProblem(l) : null;
}

/** A system's lines of each part, after the first: notes only, and all lines or one bare line. */
function checkSystem(system: Labelled[], report: (l: Labelled, message: string) => void) {
	const byPart = new Map<string, Labelled[]>();
	for (const l of system) byPart.set(l.part ?? "", [...(byPart.get(l.part ?? "") ?? []), l]);
	for (const own of byPart.values())
		for (const l of own.slice(1)) {
			const problem = laterLineProblem(own, l);
			if (problem) report(l, problem);
		}
}

/**
 * Check a chart's part lines (grammar 7.6), after systems are numbered:
 * names, the four-line limit, and that only a part's first line in a
 * system holds harmony or pedal marks. A line that breaks a rule is an
 * error and is marked `dropped`. Never throws.
 */
export function checkLines(
	lines: Line[],
	parts: Part[],
): { lines: Line[]; parts: DeclaredPart[]; diagnostics: ChartDiagnostic[] } {
	const diagnostics: ChartDiagnostic[] = [];
	const failed = new Set<number>();
	const report = (l: Labelled, message: string): Line => {
		diagnostics.push({ line: l.line, severity: "error", message, token: l.part ?? "" });
		failed.add(l.line);
		return l;
	};
	const named = nameLines(lines, report);
	const systems = new Map<number, Labelled[]>();
	for (const l of named.lines)
		if (isLabelled(l) && l.system !== undefined && !failed.has(l.line))
			systems.set(l.system, [...(systems.get(l.system) ?? []), l]);
	for (const system of systems.values()) checkSystem(system, report);
	const out = named.lines.map((l) =>
		l.kind === "bars" && failed.has(l.line) ? { ...l, dropped: true as const } : l,
	);
	const declared = parts.map((p) => {
		const own = named.names.get(p.label ?? "");
		return own ? { ...p, lines: own } : p;
	});
	return { lines: out, parts: declared, diagnostics };
}
