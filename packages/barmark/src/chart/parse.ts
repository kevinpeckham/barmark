import { readDocument } from "./document.js";
import { expand, flattenBars } from "./expand.js";
import { projectPart } from "./parts.js";
import type { ChartDiagnostic, ChartEvent, ChartParse, Part, PartBar, PlayedBar } from "./types.js";

const RANK = { error: 0, warning: 1 };

/** Sorted by line, errors before warnings, each reported once. */
function sortDiagnostics(all: ChartDiagnostic[]): ChartDiagnostic[] {
	const seen = new Set<string>();
	return all
		.filter((d) => {
			const key = `${d.line}\u0000${d.severity}\u0000${d.message}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => a.line - b.line || RANK[a.severity] - RANK[b.severity]);
}

const partBar = (b: PlayedBar): PartBar =>
	b.tacet ? null : { line: b.line, slots: b.slots, ...(b.words && { words: b.words }) };

/** One bar of every part: shared fields from the first, the meter from the first that plays. */
function zipBar(bars: PlayedBar[], report: (d: ChartDiagnostic) => void): PlayedBar {
	const [first, ...rest] = bars as [PlayedBar, ...PlayedBar[]];
	const playing = bars.filter((b) => !b.tacet);
	const meter = playing[0]?.meter ?? first.meter;
	if (playing.some((b) => b.meter.n !== meter.n || b.meter.d !== meter.d))
		report({
			line: playing[1]?.line ?? first.line,
			severity: "error",
			message: "the parts disagree on this bar's meter",
			token: "|",
		});
	return { ...first, meter, parts: [first, ...rest].map(partBar) };
}

/** Each part's events, played in lockstep: the shapes match because every line of a system shares its structure. */
function zipEvents(each: ChartEvent[][], report: (d: ChartDiagnostic) => void): ChartEvent[] {
	const [lead = []] = each;
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

/** Several parts: each projected and played, then zipped into one timeline (grammar 7.4). */
function playParts(lines: ReturnType<typeof readDocument>["lines"], parts: Part[]) {
	const played = parts.map((p) => expand(projectPart(lines, parts, p.label ?? ""), p.label));
	const diagnostics = played.flatMap((p) => p.diagnostics);
	const events = zipEvents(
		played.map((p) => p.events),
		(d) => diagnostics.push(d),
	);
	return { events, sections: played[0]?.sections ?? [], diagnostics };
}

/** Read a whole barmark chart: the document as written and the bars in play order. Never throws. */
export function parseChart(text: string): ChartParse {
	const doc = readDocument(text);
	const played = doc.parts.length > 1 ? playParts(doc.lines, doc.parts) : expand(doc.lines);
	return {
		title: doc.title,
		part: doc.part,
		parts: doc.parts,
		lines: doc.lines,
		events: played.events,
		bars: flattenBars(played.events),
		sections: played.sections,
		diagnostics: sortDiagnostics([...doc.diagnostics, ...played.diagnostics]),
	};
}

/**
 * One part of a chart as a single-part chart (grammar 7.4): the tutti bars,
 * its own bars, and `N.C.` marked `tacet` where it rests. Null when the
 * chart declares no part with that label. Never throws.
 */
export function extractPart(text: string, label: string): ChartParse | null {
	const doc = readDocument(text);
	const part = doc.parts.find((p) => p.label?.toLowerCase() === label.toLowerCase());
	if (!part) return null;
	const lines = doc.parts.length > 1 ? projectPart(doc.lines, doc.parts, label) : doc.lines;
	const played = expand(lines, part.label);
	const kept = new Set(lines.map((l) => l.line));
	return {
		title: doc.title,
		part,
		parts: [part],
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
