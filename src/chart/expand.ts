import { beatsOf } from "./directives.js";
import type {
	ChartDiagnostic,
	ChartEvent,
	Directives,
	Feel,
	Key,
	Line,
	Meter,
	PlayedBar,
	Repeat,
	SectionOccurrence,
	Slot,
} from "./types.js";

/** Nested repeats multiply; expansion stops here rather than run away. */
export const MAX_EXPANDED_BARS = 10_000;
/** Repeats of bodies that play no bars (fermatas only) are bounded too. */
const MAX_WORK = MAX_EXPANDED_BARS * 10;

type BarsLine = Extract<Line, { kind: "bars" }>;
type SectionLine = Extract<Line, { kind: "section" }>;
type Section = { heading: SectionLine | null; lines: Line[] };
/** A cell with `%` already resolved to the slots it copies. */
type Played =
	| { kind: "bar"; meter: Meter | null; slots: Slot[]; written: boolean }
	| { kind: "fermata" };
type Entry = { line: Line; repeat: Repeat };
type Item =
	| ({ kind: "line" } & Entry)
	| { kind: "bracket"; line: number; entries: Entry[]; repeat: Repeat };

const normalize = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

/** Every played bar in order, with an open repeat's pass included once. */
export function flattenBars(events: ChartEvent[]): PlayedBar[] {
	return events.flatMap((e) =>
		e.kind === "bar" ? [e.bar] : e.kind === "open" ? flattenBars(e.events) : [],
	);
}

/** Remove the last bar, looking inside a final open pass and past a final fermata. */
function removeLastBar(events: ChartEvent[]): boolean {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e?.kind === "bar") {
			events.splice(i, 1);
			return true;
		}
		if (e?.kind === "open" && removeLastBar(e.events)) return true;
	}
	return false;
}

/**
 * Turn the written chart into the bars in play order: sections and their
 * replays, repeats, directive changes, `%` and elision.
 */
export function expand(lines: Line[]): {
	events: ChartEvent[];
	sections: SectionOccurrence[];
	diagnostics: ChartDiagnostic[];
} {
	const diagnostics: ChartDiagnostic[] = [];
	const error = (line: number, message: string, token: string) =>
		diagnostics.push({ line, severity: "error", message, token });

	const sections: Section[] = [{ heading: null, lines: [] }];
	for (const l of lines) {
		if (l.kind === "section") sections.push({ heading: l, lines: [] });
		else if (l.kind !== "title") sections.at(-1)?.lines.push(l);
	}

	// % copies the bar written before it, so a section plays the same wherever it is replayed.
	const resolved = new Map<BarsLine, Played[]>();
	let previous: Slot[] | null = null;
	for (const l of sections.flatMap((s) => s.lines)) {
		if (l.kind !== "bars") continue;
		const cells: Played[] = [];
		for (const c of l.cells) {
			if (c.kind === "fermata") cells.push({ kind: "fermata" });
			else if (c.kind === "simile") {
				if (!previous) error(l.line, "% has no bar before it to repeat", "%");
				cells.push({
					kind: "bar",
					meter: null,
					slots: previous ?? [{ kind: "hold" }],
					written: false,
				});
			} else {
				const first = c.slots[0];
				const head = first?.kind === "group" ? first.members[0] : first;
				if (!previous && head?.kind === "hold")
					error(l.line, "/ has nothing before it to hold", "/");
				cells.push({ kind: "bar", meter: c.meter, slots: c.slots, written: true });
				previous = c.slots;
			}
		}
		resolved.set(l, cells);
	}

	// Pair |: and :| within each section.
	const itemsOf = new Map<Section, Item[]>();
	for (const s of sections) {
		const items: Item[] = [];
		let open: { line: number; entries: Entry[] } | null = null;
		for (const l of s.lines) {
			const bars = l.kind === "bars" ? l : null;
			if (bars?.opens) {
				if (open) error(bars.line, "|: inside another |:", "|:");
				else open = { line: bars.line, entries: [] };
			}
			if (bars?.closes) {
				if (!open) {
					error(bars.line, ":| has no |: before it in this section", ":|");
					items.push({ kind: "line", line: bars, repeat: null });
					continue;
				}
				open.entries.push({ line: bars, repeat: null });
				items.push({
					kind: "bracket",
					line: open.line,
					entries: open.entries,
					repeat: bars.repeat ?? 2,
				});
				open = null;
				continue;
			}
			const entry = { line: l, repeat: bars?.repeat ?? null };
			if (open) open.entries.push(entry);
			else items.push({ kind: "line", ...entry });
		}
		if (open) {
			error(open.line, "|: is never closed in this section", "|:");
			items.push(...open.entries.map((e): Item => ({ kind: "line", ...e })));
		}
		itemsOf.set(s, items);
	}

	const state: { key: Key | null; time: Meter; tempo: number | null; feel: Feel } = {
		key: null,
		time: { n: 4, d: 4 },
		tempo: null,
		feel: "straight",
	};
	const apply = (set: Directives) => {
		if (set.key) state.key = set.key;
		if (set.time) state.time = set.time;
		if (set.tempo) state.tempo = set.tempo;
		if (set.feel) state.feel = set.feel;
	};
	let count = 0;
	let work = 0;
	let capped = false;
	let openDepth = 0;
	const checked = new Set<Played>();
	const stop = (line: number) => {
		capped = true;
		error(line, `expansion stopped at ${MAX_EXPANDED_BARS} bars`, "x");
	};
	let sectionName: string | null = null;

	const emit = (p: Played, line: number, out: ChartEvent[]) => {
		if (capped) return;
		if (++work > MAX_WORK) return stop(line);
		if (p.kind === "fermata") {
			out.push({ kind: "fermata", line });
			return;
		}
		if (count >= MAX_EXPANDED_BARS) return stop(line);
		count++;
		const meter = p.meter ?? state.time;
		if (p.written && !checked.has(p)) {
			checked.add(p);
			const k = p.slots.length;
			const b = beatsOf(meter);
			if (b % k !== 0 && k % b !== 0)
				diagnostics.push({
					line,
					severity: "warning",
					message: `${k} slots divide ${b} beats unevenly`,
					token: `${k}`,
				});
		}
		const { key, tempo, feel } = state;
		out.push({
			kind: "bar",
			bar: {
				index: 0,
				line,
				section: sectionName,
				meter,
				key,
				tempo,
				feel,
				slots: p.slots,
			},
		});
	};
	/** Play `body` `repeat` times into `out`; an open repeat plays one pass inside an open event. */
	const times = (
		repeat: Repeat,
		line: number,
		out: ChartEvent[],
		body: (into: ChartEvent[]) => void,
	) => {
		if (repeat === "open") {
			if (openDepth > 0) {
				error(line, "an open repeat inside another open repeat", "x ...");
				body(out);
				return;
			}
			const inner: ChartEvent[] = [];
			openDepth++;
			body(inner);
			openDepth--;
			out.push({ kind: "open", line, events: inner });
			return;
		}
		for (let i = 0; i < (repeat ?? 1) && !capped; i++) {
			if (++work > MAX_WORK) return stop(line);
			body(out);
		}
	};

	const playLine = ({ line: l, repeat }: Entry, out: ChartEvent[]) => {
		if (l.kind === "directive") apply(l.set);
		if (l.kind !== "bars") return;
		times(repeat, l.line, out, (into) => {
			for (const c of resolved.get(l) ?? []) emit(c, l.line, into);
		});
	};
	const playItems = (items: Item[], out: ChartEvent[]) => {
		for (const it of items) {
			if (it.kind === "line") playLine(it, out);
			else
				times(it.repeat, it.line, out, (into) => {
					for (const e of it.entries) playLine(e, into);
				});
		}
	};

	const events: ChartEvent[] = [];
	const occurrences: [SectionOccurrence, ChartEvent[]][] = [];
	const definitions = new Map<string, Section>();
	for (const s of sections) {
		const h = s.heading;
		const items = itemsOf.get(s) ?? [];
		if (!h) {
			sectionName = null;
			playItems(items, events);
			continue;
		}
		sectionName = h.name;
		const out: ChartEvent[] = [];
		const isDefinition = s.lines.some((l) => l.kind === "bars");
		let replayOf: number | null = null;
		if (isDefinition) {
			definitions.set(normalize(h.name), s);
			if (h.elided) error(h.line, "-> is only for a replay; leave the bar out instead", "->");
			times(h.repeat, h.line, out, (into) => playItems(items, into));
		} else {
			const source = definitions.get(normalize(h.name));
			if (!source?.heading) {
				error(h.line, `no earlier section named "${h.name}" to replay`, h.name);
				continue;
			}
			replayOf = source.heading.line;
			playItems(items, out);
			const body = itemsOf.get(source) ?? [];
			times(h.repeat, h.line, out, (into) => playItems(body, into));
		}
		const elided = !isDefinition && h.elided;
		if (elided) removeLastBar(out);
		events.push(...out);
		occurrences.push([
			{ name: h.name, line: h.line, replayOf, firstBar: 0, lastBar: 0, elided },
			out,
		]);
	}

	flattenBars(events).forEach((b, i) => {
		b.index = i + 1;
	});
	const sectionsOut = occurrences.map(([occ, out]) => {
		const bars = flattenBars(out);
		return { ...occ, firstBar: bars[0]?.index ?? 0, lastBar: bars.at(-1)?.index ?? 0 };
	});
	// A replayed section repeats its structural errors; report each once.
	const seen = new Set<string>();
	const unique = diagnostics.filter((d) => {
		const k = `${d.line}|${d.severity}|${d.message}|${d.token}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
	return { events, sections: sectionsOut, diagnostics: unique };
}
