import type { Cell, DeclaredPart, Line } from "./types.js";

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
		const { part: _p, lineName: _n, system: _s, ...rest } = l;
		return rest;
	}
	const { part: _p, lineName: _n, system: _s, dropped: _d, ...rest } = l;
	return rest;
}

const plays = (l: Labelled | undefined) => l?.kind === "bars" && !l.dropped;

/**
 * Which stream is projected: a part's label, and the line's name when the
 * part writes lines (grammar 7.6). `first` says the line is the part's
 * first, which also plays the part's bare lines and the tutti lines.
 */
type Stream = { key: string; name: string | null; first: boolean };

/** The stream's own line in a system, if written. */
const ownLine = (system: Labelled[], s: Stream) =>
	system.find(
		(m) =>
			m.part?.toLowerCase() === s.key &&
			(s.name === null
				? true
				: m.lineName === undefined
					? s.first
					: m.lineName.toLowerCase() === s.name.toLowerCase()),
	);

/** A tutti line as a stream other than its part's first hears it: tacet. */
const restingTutti = (l: Line): Line =>
	l.kind === "bars" ? { ...l, cells: l.cells.map(standInCell) } : l;

const inSystem = (l: Line): l is Labelled & { system: number } =>
	(l.kind === "bars" || l.kind === "invalid") && l.system !== undefined;

function systemsOf(lines: Line[]): Map<number, Labelled[]> {
	const systems = new Map<number, Labelled[]>();
	for (const l of lines)
		if (inSystem(l)) systems.set(l.system, [...(systems.get(l.system) ?? []), l]);
	return systems;
}

/** What one line becomes in the stream's chart: itself, its unlabelled self, a stand-in, or nothing. */
function projectLine(l: Line, s: Stream, systems: Map<number, Labelled[]>): Line | null {
	if (l.kind === "part") return l.label?.toLowerCase() === s.key ? l : null;
	if (inSystem(l)) return projectSystemLine(l, s, systems.get(l.system) ?? []);
	return s.first ? l : restingTutti(l);
}

/** A system's line in one stream's chart: its own line, a stand-in where it rests, or nothing. */
function projectSystemLine(l: Labelled, s: Stream, system: Labelled[]): Line | null {
	const own = ownLine(system, s);
	if (own === l && plays(l)) return unlabelled(l);
	const at = own ?? referenceOf(system) ?? system[0];
	return at === l ? standIn(system, l) : null;
}

/**
 * One part of a multi-part chart as a single-part chart's lines (grammar
 * 7.4): the tutti lines, the part's own lines, and a bar of `N.C.` marked
 * `tacet` for each bar of a system it doesn't play. With `lineName`, one
 * of the part's lines (grammar 7.6): the part's first line also plays
 * its bare lines and the tutti lines, and a line rests (tacet) wherever
 * it isn't written. Never throws.
 */
export function projectPart(
	lines: Line[],
	parts: DeclaredPart[],
	label: string,
	lineName: string | null = null,
): Line[] {
	if (!parts.length) return lines;
	const key = label.toLowerCase();
	const part = parts.find((p) => p.label?.toLowerCase() === key);
	const first = part?.lines?.[0];
	const s: Stream = { key, name: lineName, first: lineName === null || lineName === first };
	const systems = systemsOf(lines);
	return lines.map((l) => projectLine(l, s, systems)).filter((l): l is Line => l !== null);
}

/** One part's lines kept as written, labels and all, with a stand-in for each system it doesn't play: what an extract prints (grammar 7.6). */
export function projectPartLines(lines: Line[], label: string): Line[] {
	const key = label.toLowerCase();
	const systems = systemsOf(lines);
	return lines
		.map((l): Line | null => {
			if (l.kind === "part") return l.label?.toLowerCase() === key ? l : null;
			if (!inSystem(l)) return l;
			const system = systems.get(l.system) ?? [];
			const own = system.filter((m) => m.part?.toLowerCase() === key);
			if (own.length) return own.includes(l) ? l : null;
			const at = referenceOf(system) ?? system[0];
			return at === l ? standIn(system, l) : null;
		})
		.filter((l): l is Line => l !== null);
}
