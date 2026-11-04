import { readDocument } from "./document.js";
import { expand, flattenBars } from "./expand.js";
import { projectPart, projectPartLines } from "./parts.js";
import { pedalWarnings } from "./pedal.js";
import type {
	ChartDiagnostic,
	ChartEvent,
	ChartParse,
	DeclaredPart,
	Line,
	LineBar,
	PartBar,
	PlayedBar,
} from "./types.js";

const RANK = { error: 0, warning: 1 };

/** Sorted by line, errors before warnings. */
const sortDiagnostics = (all: ChartDiagnostic[]) =>
	all.sort((a, b) => a.line - b.line || RANK[a.severity] - RANK[b.severity]);

const keyOf = (d: ChartDiagnostic) => `${d.line}\u0000${d.severity}\u0000${d.message}`;

/** What every part reported, a problem the parts share once: each kept as often as one part reports it. */
function mergeReports(each: ChartDiagnostic[][]): ChartDiagnostic[] {
	const most = new Map<string, ChartDiagnostic[]>();
	for (const list of each) {
		const mine = new Map<string, ChartDiagnostic[]>();
		for (const d of list) mine.set(keyOf(d), [...(mine.get(keyOf(d)) ?? []), d]);
		for (const [k, ds] of mine) if (ds.length > (most.get(k)?.length ?? 0)) most.set(k, ds);
	}
	return [...most.values()].flat();
}

const partBar = (b: PlayedBar): PartBar =>
	b.tacet ? null : { line: b.line, slots: b.slots, ...(b.words && { words: b.words }) };

const meterText = (b: PlayedBar) => `${b.meter.n}/${b.meter.d}`;

/** One bar of every part: shared fields from the first, the meter from the first that plays. */
function zipBar(bars: PlayedBar[], report: (d: ChartDiagnostic) => void): PlayedBar {
	const [first, ...rest] = bars as [PlayedBar, ...PlayedBar[]];
	const playing = bars.filter((b) => !b.tacet);
	const meter = playing[0]?.meter ?? first.meter;
	const meters = [...new Set(playing.map(meterText))];
	// A `%` copies its bar's one-bar meter, so parts can disagree: say so on every line that plays the bar.
	if (meters.length > 1)
		for (const line of new Set(playing.map((b) => b.line)))
			report({
				line,
				severity: "error",
				message: `the parts disagree on this bar's meter (${meters.join(", ")})`,
				token: "|",
			});
	return { ...first, meter, parts: [first, ...rest].map(partBar) };
}

const lineOf = (e: ChartEvent) => (e.kind === "bar" ? e.bar.line : e.line);

/** The first event at which some part's timeline differs in shape from the lead's, or -1. */
function stepAt(each: ChartEvent[][]): number {
	const [lead = []] = each;
	const longest = Math.max(...each.map((events) => events.length));
	for (let i = 0; i < longest; i++)
		if (each.some((events) => events[i]?.kind !== lead[i]?.kind)) return i;
	return -1;
}

/**
 * Each part's events, played in lockstep: the shapes match because every
 * line of a system shares its structure. Where they don't, the lead's
 * shape is kept and the first place they part is an error.
 */
export function zipEvents(
	each: ChartEvent[][],
	report: (d: ChartDiagnostic) => void,
): ChartEvent[] {
	const [lead = []] = each;
	const apart = stepAt(each);
	const at = lead[apart] ?? lead[lead.length - 1];
	if (apart >= 0 && at)
		report({
			line: lineOf(at),
			severity: "error",
			message:
				"the parts fall out of step here; check that every line of this system writes the same marks",
			token: "|",
		});
	return lead.map((e, i) => {
		const peers = each.map((events) => events[i] ?? e);
		if (e.kind === "bar")
			return {
				kind: "bar",
				bar: zipBar(
					peers.map((p) => (p.kind === "bar" ? p.bar : e.bar)),
					report,
				),
			};
		if (e.kind === "open")
			return {
				...e,
				events: zipEvents(
					peers.map((p) => (p.kind === "open" ? p.events : e.events)),
					report,
				),
			};
		return e;
	});
}

/** One played stream: a part, or one of its lines (grammar 7.6); `part` indexes the parts shown. */
type Stream = { part: number; label: string; name: string | null };

const streamsOf = (shown: DeclaredPart[]): Stream[] =>
	shown.flatMap((p, part): Stream[] =>
		p.lines?.length
			? p.lines.map((name) => ({ part, label: p.label ?? "", name }))
			: [{ part, label: p.label ?? "", name: null }],
	);

/** A part's share of a bar from its streams' shares: its first playing line leads (grammar 7.6). */
function partOf(p: DeclaredPart, own: [Stream, PartBar][]): PartBar {
	const playing = own.filter((e): e is [Stream, NonNullable<PartBar>] => e[1] !== null);
	const lead = playing[0]?.[1];
	if (!lead) return null;
	if (!p.lines?.length) return lead;
	const lines = playing.map(
		([s, b]): LineBar => ({
			name: s.name ?? "",
			line: b.line,
			slots: b.slots,
			...(b.words && { words: b.words }),
		}),
	);
	return { ...lead, lines };
}

/** A zipped bar of streams as a bar of parts; with one part shown, its lines sit on the bar itself. */
function foldBar(bar: PlayedBar, streams: Stream[], shown: DeclaredPart[]): PlayedBar {
	const each = bar.parts ?? [];
	const parts = shown.map((p, i) =>
		partOf(
			p,
			streams.flatMap((s, j): [Stream, PartBar][] => (s.part === i ? [[s, each[j] ?? null]] : [])),
		),
	);
	const { parts: _p, words: _w, tacet: _t, ...shared } = bar;
	const lead = parts[0];
	const top: PlayedBar = lead
		? { ...shared, line: lead.line, slots: lead.slots, ...(lead.words && { words: lead.words }) }
		: bar;
	if (shown.length > 1) return { ...top, parts };
	const { parts: _q, ...alone } = top;
	return lead?.lines ? { ...alone, lines: lead.lines } : alone;
}

function foldEvents(events: ChartEvent[], streams: Stream[], shown: DeclaredPart[]): ChartEvent[] {
	return events.map((e) => {
		if (e.kind === "bar") return { kind: "bar", bar: foldBar(e.bar, streams, shown) };
		if (e.kind === "open") return { ...e, events: foldEvents(e.events, streams, shown) };
		return e;
	});
}

/** A part's own bars from a folded bar: tacet where none of its lines plays. */
function partView(b: PlayedBar, i: number, shown: number): PlayedBar {
	if (shown === 1) return b;
	const own = b.parts?.[i];
	return own ? { ...b, line: own.line, slots: own.slots } : { ...b, slots: [], tacet: true };
}

/** The pedal warnings of each part that writes lines, walked on the part, not one line (grammar 2.9, 7.6). */
function linedPedalWarnings(events: ChartEvent[], shown: DeclaredPart[]): ChartDiagnostic[] {
	const bars = flattenBars(events);
	return shown.flatMap((p, i) =>
		p.lines?.length ? pedalWarnings(bars.map((b) => partView(b, i, shown.length))) : [],
	);
}

/**
 * Parts and their lines: each stream projected and played, zipped into one
 * timeline, then folded into the parts shown (grammar 7.4, 7.6).
 */
function playStreams(lines: Line[], parts: DeclaredPart[], shown: DeclaredPart[]) {
	const streams = streamsOf(shown);
	const played = streams.map((s) =>
		expand(
			projectPart(lines, parts, s.label, s.name),
			s.name === null ? s.label : `${s.label}.${s.name}`,
			streams.length,
			s.name === null,
		),
	);
	const diagnostics = mergeReports(played.map((p) => p.diagnostics));
	const zipped = zipEvents(
		played.map((p) => p.events),
		(d) => diagnostics.push(d),
	);
	const events = foldEvents(zipped, streams, shown);
	diagnostics.push(...linedPedalWarnings(events, shown));
	return { events, sections: played[0]?.sections ?? [], diagnostics };
}

const lined = (parts: DeclaredPart[]) => parts.some((p) => p.lines?.length);

/** Read a whole barmark chart: the document as written and the bars in play order. Never throws. */
export function parseChart(text: string): ChartParse {
	const doc = readDocument(text);
	const played =
		doc.parts.length > 1 || lined(doc.parts)
			? playStreams(doc.lines, doc.parts, doc.parts)
			: expand(doc.lines);
	return {
		title: doc.title,
		part: doc.part,
		parts: doc.parts,
		credits: doc.credits,
		lines: doc.lines,
		events: played.events,
		bars: flattenBars(played.events),
		sections: played.sections,
		diagnostics: sortDiagnostics([...doc.diagnostics, ...played.diagnostics]),
	};
}

type Doc = ReturnType<typeof readDocument>;
type Played = Pick<ReturnType<typeof expand>, "events" | "sections" | "diagnostics">;

/** What an extract holds and plays: one of the part's lines, the part with its lines, or the part. */
function extractOf(
	doc: Doc,
	part: DeclaredPart,
	lineName?: string,
): { lines: Line[]; played: Played } | null {
	const label = part.label ?? "";
	if (lineName !== undefined) {
		const name = part.lines?.find((n) => n.toLowerCase() === lineName.toLowerCase());
		if (!name) return null;
		const lines = projectPart(doc.lines, doc.parts, label, name);
		return { lines, played: expand(lines, `${label}.${name}`) };
	}
	if (part.lines?.length)
		return {
			lines: projectPartLines(doc.lines, label),
			played: playStreams(doc.lines, doc.parts, [part]),
		};
	const lines = doc.parts.length > 1 ? projectPart(doc.lines, doc.parts, label) : doc.lines;
	return { lines, played: expand(lines, part.label) };
}

/**
 * One part of a chart as a single-part chart (grammar 7.4): the tutti bars,
 * its own bars, and `N.C.` marked `tacet` where it rests. With `lineName`,
 * one of the part's lines alone (grammar 7.6), as a converter writes each
 * line: the part's first line also plays its bare and tutti lines, and a
 * line rests where it isn't written. Null when the chart declares no part
 * with that label, or the part no line of that name. Never throws.
 */
export function extractPart(text: string, label: string, lineName?: string): ChartParse | null {
	const doc = readDocument(text);
	const part = doc.parts.find((p) => p.label?.toLowerCase() === label.toLowerCase());
	const extract = part ? extractOf(doc, part, lineName) : null;
	if (!part || !extract) return null;
	const { lines, played } = extract;
	const kept = new Set(lines.map((l) => l.line));
	// A stand-in may sit on another part's line; that part's problems are not this one's.
	for (const l of doc.lines)
		if ((l.kind === "bars" || l.kind === "invalid") && l.part && l.part !== part.label)
			kept.delete(l.line);
	return {
		title: doc.title,
		part,
		parts: [part],
		credits: doc.credits,
		lines,
		events: played.events,
		bars: flattenBars(played.events),
		sections: played.sections,
		diagnostics: sortDiagnostics([
			...doc.diagnostics.filter((d) => kept.has(d.line)),
			...played.diagnostics,
		]),
	};
}
