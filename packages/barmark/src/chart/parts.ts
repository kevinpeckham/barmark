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

/** The system's structure with every bar a tacet bar, at the system's first line. */
function standIn(system: Labelled[]): Line {
	const ref = system.find((l): l is BarsLine => l.kind === "bars" && !l.dropped);
	if (!ref) return unread(system[0]);
	const { part: _p, system: _s, dropped: _d, ...rest } = ref;
	return { ...rest, line: system[0]?.line ?? ref.line, cells: ref.cells.map(standInCell) };
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
	if (!inSystem(l)) return l;
	const system = systems.get(l.system) ?? [];
	const own = system.find((m) => plays(m, key));
	if (own === l) return unlabelled(l);
	return !own && system[0] === l ? standIn(system) : null;
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
