import type { Cell, DeclaredPart, Line, Meter } from "./types.js";

type BarsLine = Extract<Line, { kind: "bars" }>;
type Labelled = Extract<Line, { kind: "bars" | "invalid" }>;
/** The one-bar meter (or null) each `%` copies from its line's bar before it (grammar 2.4). */
type Copied = Map<Cell, Meter | null>;

/** The stream a labelled line plays (its part, and its line's name), or null for a tutti line. */
const streamOf = (l: BarsLine) =>
	l.part === undefined ? null : `${l.part}\u0000${l.lineName ?? ""}`.toLowerCase();

/** Each `%` on a line gets the meter of the bar before it; returns the meter of the line's last bar. */
function copyAlong(cells: Cell[], before: Meter | null, out: Copied): Meter | null {
	let meter = before;
	for (const c of cells) {
		if (c.kind === "simile") out.set(c, meter);
		else if (c.kind === "slots") meter = c.meter;
	}
	return meter;
}

/** Each chart's copied meters, worked out once however many parts are projected from it. */
const copiedOf = new WeakMap<Line[], Copied>();

/**
 * What each `%` copies its meter from: the bar before it on its part's
 * line (a part's line, or a tutti line, which every part plays), across
 * line breaks, so a stand-in for it is a bar of the same length.
 */
function copiedMeters(lines: Line[]): Copied {
	const known = copiedOf.get(lines);
	if (known) return known;
	const out: Copied = new Map();
	copiedOf.set(lines, out);
	const last = new Map<string, Meter | null>();
	let tutti: Meter | null = null;
	for (const l of lines) {
		if (l.kind !== "bars") continue;
		const key = streamOf(l);
		if (key === null) {
			tutti = copyAlong(l.cells, tutti, out);
			last.clear();
		} else last.set(key, copyAlong(l.cells, last.has(key) ? (last.get(key) ?? null) : tutti, out));
	}
	return out;
}

/** A bar of `N.C.` where the part rests, as long as the bar it stands for; the system's marks stay (grammar 7.4). */
const standInCell =
	(copied: Copied) =>
	(c: Cell): Cell =>
		c.kind === "slots" || c.kind === "simile"
			? {
					kind: "slots",
					meter: c.kind === "slots" ? c.meter : (copied.get(c) ?? null),
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
function standIn(system: System, at: Labelled, copied: Copied): Line {
	const ref = system.reference;
	if (!ref) return unread(at);
	const { part: _p, system: _s, dropped: _d, ...rest } = ref;
	return { ...rest, line: at.line, cells: ref.cells.map(standInCell(copied)) };
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
type Stream = {
	key: string;
	/** The line's name, lower-cased. */
	name: string | null;
	first: boolean;
	copied: Copied;
	/** Its own line in each system, found once: every line of a system asks for it. */
	own: Map<System, Labelled | undefined>;
};

/**
 * A system's lines, each part's lines among them (by lowercased label),
 * and the line its structure is read from: each stream looks up its own
 * lines instead of scanning the system.
 */
type System = {
	lines: Labelled[];
	byPart: Map<string, Labelled[]>;
	reference: BarsLine | undefined;
};

/** The stream's own line in a system, if written; a bare line dropped from a part's lines is none of them (grammar 7.6). */
const findOwn = (system: System, s: Stream) =>
	(system.byPart.get(s.key) ?? []).find((m) =>
		s.name === null
			? true
			: m.lineName === undefined
				? s.first && !(m.kind === "bars" && m.dropped)
				: m.lineName.toLowerCase() === s.name,
	);

function ownLine(system: System, s: Stream): Labelled | undefined {
	if (s.own.has(system)) return s.own.get(system);
	const own = findOwn(system, s);
	s.own.set(system, own);
	return own;
}

/** A tutti line as a stream other than its part's first hears it: tacet. */
const restingTutti = (l: Line, copied: Copied): Line =>
	l.kind === "bars" ? { ...l, cells: l.cells.map(standInCell(copied)) } : l;

const inSystem = (l: Line): l is Labelled & { system: number } =>
	(l.kind === "bars" || l.kind === "invalid") && l.system !== undefined;

/** Each chart's systems, indexed once however many parts are projected from it. */
const systemsKnown = new WeakMap<Line[], Map<number, System>>();

function systemsOf(lines: Line[]): Map<number, System> {
	const known = systemsKnown.get(lines);
	if (known) return known;
	const systems = new Map<number, System>();
	for (const l of lines) {
		if (!inSystem(l)) continue;
		let system = systems.get(l.system);
		if (!system) {
			system = { lines: [], byPart: new Map(), reference: undefined };
			systems.set(l.system, system);
		}
		system.lines.push(l);
		const key = l.part?.toLowerCase();
		if (key === undefined) continue;
		const own = system.byPart.get(key);
		if (own) own.push(l);
		else system.byPart.set(key, [l]);
	}
	for (const system of systems.values()) system.reference = referenceOf(system.lines);
	systemsKnown.set(lines, systems);
	return systems;
}

const NO_SYSTEM: System = { lines: [], byPart: new Map(), reference: undefined };

/** The line a system's stand-ins are written at, for a part that has no line of its own there. */
const anchorOf = (system: System): Labelled | undefined => system.reference ?? system.lines[0];

/**
 * The lines that can play in some stream, by index: those every stream
 * reads (outside any system, and each system's anchor) and each part's
 * own (its declaration and its lines, by lowercased label). Any other
 * line projects to nothing, so a stream reads only these, not the chart.
 */
type Reading = { common: number[]; byPart: Map<string, number[]> };

const readingKnown = new WeakMap<Line[], Reading>();

/** The part a line belongs to, by lowercased label; undefined for a line every stream reads. */
const partKey = (l: Line) =>
	l.kind === "part"
		? (l.label?.toLowerCase() ?? "")
		: inSystem(l)
			? l.part?.toLowerCase()
			: undefined;

function readingOf(lines: Line[], systems: Map<number, System>): Reading {
	const known = readingKnown.get(lines);
	if (known) return known;
	const reading: Reading = { common: [], byPart: new Map() };
	lines.forEach((l, i) => {
		const anchored = inSystem(l) && anchorOf(systems.get(l.system) ?? NO_SYSTEM) === l;
		if (anchored || (l.kind !== "part" && !inSystem(l))) reading.common.push(i);
		const key = partKey(l);
		if (key === undefined) return;
		const own = reading.byPart.get(key);
		if (own) own.push(i);
		else reading.byPart.set(key, [i]);
	});
	readingKnown.set(lines, reading);
	return reading;
}

/** Two ascending lists of indices merged, each index once. */
function* inOrder(a: number[], b: number[]): Generator<number> {
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		const at = Math.min(a[i] ?? Number.POSITIVE_INFINITY, b[j] ?? Number.POSITIVE_INFINITY);
		if (a[i] === at) i++;
		if (b[j] === at) j++;
		yield at;
	}
}

const labelsKnown = new WeakMap<DeclaredPart[], Map<string, DeclaredPart>>();

/** The declared parts by lowercased label, the first of each; indexed once however many parts are projected. */
function partsByLabel(parts: DeclaredPart[]): Map<string, DeclaredPart> {
	const known = labelsKnown.get(parts);
	if (known) return known;
	const by = new Map<string, DeclaredPart>();
	for (const p of parts) {
		const key = p.label?.toLowerCase();
		if (key !== undefined && !by.has(key)) by.set(key, p);
	}
	labelsKnown.set(parts, by);
	return by;
}

/** What one line becomes in the stream's chart: itself, its unlabelled self, a stand-in, or nothing. */
function projectLine(l: Line, s: Stream, systems: Map<number, System>): Line | null {
	if (l.kind === "part") return l.label?.toLowerCase() === s.key ? l : null;
	if (inSystem(l)) return projectSystemLine(l, s, systems.get(l.system) ?? NO_SYSTEM);
	return s.first ? l : restingTutti(l, s.copied);
}

/** A system's line in one stream's chart: its own line, a stand-in where it rests, or nothing. */
function projectSystemLine(l: Labelled, s: Stream, system: System): Line | null {
	const own = ownLine(system, s);
	if (own === l && plays(l)) return unlabelled(l);
	const at = own ?? anchorOf(system);
	return at === l ? standIn(system, l, s.copied) : null;
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
	/** Past this many lines the part reads no more (`expand`'s share of the work), so none past it is built. */
	limit = Number.POSITIVE_INFINITY,
): Line[] {
	if (!parts.length) return lines;
	const key = label.toLowerCase();
	const first = partsByLabel(parts).get(key)?.lines?.[0];
	const s: Stream = {
		key,
		name: lineName?.toLowerCase() ?? null,
		first: lineName === null || lineName === first,
		copied: copiedMeters(lines),
		own: new Map(),
	};
	const systems = systemsOf(lines);
	const { common, byPart } = readingOf(lines, systems);
	const out: Line[] = [];
	for (const i of inOrder(common, byPart.get(key) ?? [])) {
		const projected = projectLine(lines[i] as Line, s, systems);
		if (projected) out.push(projected);
		// One past the limit, so the reader knows there was more.
		if (out.length > limit) break;
	}
	return out;
}

/** A system's line in a part's extract: its own lines as written, or one stand-in where it doesn't play. */
function extractSystemLine(l: Labelled, key: string, system: System, copied: Copied): Line | null {
	const own = system.byPart.get(key) ?? [];
	if (own.length) return own.includes(l) ? l : null;
	return anchorOf(system) === l ? standIn(system, l, copied) : null;
}

/** One part's lines kept as written, labels and all, with a stand-in for each system it doesn't play: what an extract prints (grammar 7.6). */
export function projectPartLines(lines: Line[], label: string): Line[] {
	const key = label.toLowerCase();
	const systems = systemsOf(lines);
	const copied = copiedMeters(lines);
	return lines
		.map((l): Line | null => {
			if (l.kind === "part") return l.label?.toLowerCase() === key ? l : null;
			if (!inSystem(l)) return l;
			return extractSystemLine(l, key, systems.get(l.system) ?? NO_SYSTEM, copied);
		})
		.filter((l): l is Line => l !== null);
}
