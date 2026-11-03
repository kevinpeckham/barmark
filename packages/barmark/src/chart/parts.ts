import type { Cell, Line, Part } from "./types.js";

type BarsLine = Extract<Line, { kind: "bars" }>;
type Labelled = Extract<Line, { kind: "bars" | "invalid" }>;

/** A bar of `N.C.` where the part rests; the system's marks stay (grammar 7.4). */
const standInCell = (c: Cell): Cell =>
	c.kind === "slots" || c.kind === "simile"
		? {
				kind: "slots",
				meter: c.kind === "slots" ? c.meter : null,
				slots: [{ kind: "nc" }],
				tacet: true,
			}
		: c;

/** A system no line of which reads: kept as an error line, so its bars still count. */
function unread(first: Labelled | undefined): Line {
	const invalid = first?.kind === "invalid" ? first : null;
	return {
		kind: "invalid",
		line: first?.line ?? 0,
		text: invalid?.text ?? "",
		written: invalid?.written ?? 0,
	};
}

/** The line a system's structure is read from: its first line that reads and agrees. */
const referenceOf = (system: Labelled[]) =>
	system.find((l): l is BarsLine => l.kind === "bars" && !l.dropped);

/**
 * The system's structure with every bar a tacet bar, numbered `at`: the
 * part's own line when it has one that errs, so its error stays its own,
 * or else the reference line, which has none.
 */
function standIn(system: Labelled[], at: Labelled): Line {
	const ref = referenceOf(system);
	if (!ref) return unread(at);
	const { part: _p, system: _s, dropped: _d, ...rest } = ref;
	return { ...rest, line: at.line, cells: ref.cells.map(standInCell) };
}

/** A part's own line, as a single-part chart writes it. */
function unlabelled(l: Labelled): Line {
	if (l.kind === "invalid") {
		const { part: _p, system: _s, ...rest } = l;
		return rest;
	}
	const { part: _p, system: _s, dropped: _d, ...rest } = l;
	return rest;
}

const plays = (l: Labelled, key: string) =>
	l.part?.toLowerCase() === key && l.kind === "bars" && !l.dropped;

const inSystem = (l: Line): l is Labelled & { system: number } =>
	(l.kind === "bars" || l.kind === "invalid") && l.system !== undefined;

function systemsOf(lines: Line[]): Map<number, Labelled[]> {
	const systems = new Map<number, Labelled[]>();
	for (const l of lines)
		if (inSystem(l)) systems.set(l.system, [...(systems.get(l.system) ?? []), l]);
	return systems;
}

/** What one line becomes in the part's chart: itself, its unlabelled self, a stand-in, or nothing. */
function projectLine(l: Line, key: string, systems: Map<number, Labelled[]>): Line | null {
	if (l.kind === "part") return l.label?.toLowerCase() === key ? l : null;
	return inSystem(l) ? projectSystemLine(l, key, systems.get(l.system) ?? []) : l;
}

/** A system's line in one part's chart: the part's own line, a stand-in where it rests, or nothing. */
function projectSystemLine(l: Labelled, key: string, system: Labelled[]): Line | null {
	const own = system.find((m) => m.part?.toLowerCase() === key);
	if (own === l && plays(l, key)) return unlabelled(l);
	const at = own ?? referenceOf(system) ?? system[0];
	return at === l ? standIn(system, l) : null;
}

/**
 * One part of a multi-part chart as a single-part chart's lines (grammar
 * 7.4): the tutti lines, the part's own lines, and a bar of `N.C.` marked
 * `tacet` for each bar of a system it doesn't play. Never throws.
 */
export function projectPart(lines: Line[], parts: Part[], label: string): Line[] {
	if (!parts.length) return lines;
	const key = label.toLowerCase();
	const systems = systemsOf(lines);
	return lines.map((l) => projectLine(l, key, systems)).filter((l): l is Line => l !== null);
}
