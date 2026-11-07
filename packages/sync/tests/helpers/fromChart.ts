import { beatsOf, type ChartParse, type PlayedBar, type Slot, toHarte } from "barmark";
import type { Change, ChordRun, Detections } from "../../src/build/types.js";
import type { Seconds } from "../../src/timing/index.js";
import { mulberry32 } from "./fuzz.js";

/** One stretch of a bar's slots, in fractions of the bar: what sounds there. */
type Piece = {
	from: number;
	to: number;
	sound: "chord" | "nc" | "none" | "hold";
	harte?: string;
	classes?: string;
};

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch classes of note names ("C", "Bb", "F#"), sorted and comma-joined. */
function classesOf(pitches: string[]): string {
	const set = new Set(
		pitches.map((n) => {
			const shift = [...n.slice(1)].reduce((a, c) => a + (c === "#" ? 1 : c === "b" ? -1 : 0), 0);
			return ((((LETTERS[n[0] as string] as number) + shift) % 12) + 12) % 12;
		}),
	);
	return [...set].sort((a, b) => a - b).join(",");
}

type SimpleSlot = Extract<Slot, { kind: "group" }>["members"][number];

function pieceOf(s: SimpleSlot, from: number, to: number): Piece {
	if (s.kind === "chord")
		return {
			from,
			to,
			sound: "chord",
			harte: toHarte(s.chord),
			classes: classesOf(s.chord.pitches),
		};
	if (s.kind === "nc") return { from, to, sound: "nc" };
	if (s.kind === "hold") return { from, to, sound: "hold" };
	return { from, to, sound: "none" };
}

/** A bar's slots as pieces; a group's members share their slot, a dotted one taking three of every four. */
function piecesOf(bar: PlayedBar): Piece[] {
	const width = 1 / bar.slots.length;
	return bar.slots.flatMap((slot, i): Piece[] => {
		const from = i * width;
		if (slot.kind !== "group") return [pieceOf(slot, from, from + width)];
		const weights = slot.members.map((m) => (m.dotted ? 3 : 1));
		const total = weights.reduce((a, b) => a + b, 0);
		let at = from;
		return slot.members.map((m, k) => {
			const to = at + (width * (weights[k] as number)) / total;
			const piece = pieceOf(m, at, to);
			at = to;
			return piece;
		});
	});
}

/** The bars after a pickup, which is a first bar shorter than the second. */
function pickupOf(bars: PlayedBar[]): boolean {
	const [first, second] = bars;
	return !!first && !!second && beatsOf(first.meter) < beatsOf(second.meter);
}

const meterText = (b: PlayedBar) => `${b.meter.n}/${b.meter.d}`;
const keyText = (b: PlayedBar) => (b.key ? `${b.key.tonic} ${b.key.mode}` : null);

type Options = { startAt: Seconds; tempo: number; jitter?: number; drift?: number; seed?: number };

/** Where each played bar starts, plus where the last ends, at the bar's own tempo. */
function barStarts(bars: PlayedBar[], o: Options): Seconds[] {
	const starts: Seconds[] = [];
	let t = o.startAt;
	for (const b of bars) {
		starts.push(t);
		t += lengthOf(b, o);
	}
	return [...starts, t];
}

const beatOf = (b: PlayedBar, o: Options) => 60 / (b.tempo ?? o.tempo);
const lengthOf = (b: PlayedBar, o: Options) => beatsOf(b.meter) * beatOf(b, o);

/** Appends a bar's chords to `runs`, a hold lengthening the run before it; returns where the last run nominally ends. */
function addBarRuns(
	runs: ChordRun[],
	nominalEnd: Seconds,
	at: (f: number) => Seconds,
	edge: (f: number) => Seconds,
	b: PlayedBar,
) {
	let end = nominalEnd;
	for (const p of piecesOf(b)) {
		const last = runs.at(-1);
		if (p.sound === "hold") {
			if (last && Math.abs(end - at(p.from)) < 1e-9) {
				last.end = edge(p.to);
				end = at(p.to);
			}
		} else if (p.sound !== "none") {
			end = at(p.to);
			runs.push({
				start: edge(p.from),
				end: edge(p.to),
				label: p.sound === "nc" ? "N" : (p.harte as string),
			});
		}
	}
	return end;
}

/** One run per chord, edges nudged by the jitter and the drift. */
function chordRuns(
	bars: PlayedBar[],
	starts: Seconds[],
	o: Options,
	noise: (size: number) => number,
) {
	const runs: ChordRun[] = [];
	let nominalEnd = Number.NaN;
	for (const [i, b] of bars.entries()) {
		const len = lengthOf(b, o);
		const at = (f: number) => (starts[i] as number) + f * len;
		const edge = (f: number) =>
			at(f) + (o.drift ?? 0) * len + noise((o.jitter ?? 0) * beatOf(b, o));
		nominalEnd = addBarRuns(runs, nominalEnd, at, edge, b);
	}
	return runs;
}

/** What changes at `b` from the bar before it. */
function changesAt(b: PlayedBar, before: PlayedBar, start: Seconds): Change[] {
	const key = keyText(b);
	return [
		...(key && key !== keyText(before) ? [{ kind: "key" as const, start, value: key }] : []),
		...(meterText(b) !== meterText(before)
			? [{ kind: "meter" as const, start, value: meterText(b) }]
			: []),
		...(b.tempo !== null && b.tempo !== before.tempo
			? [{ kind: "tempo" as const, start, value: b.tempo }]
			: []),
	];
}

/** The changes and sections the chart writes, from `first` on, at their true bar starts. */
function marksOf(bars: PlayedBar[], starts: Seconds[], first: number) {
	const changes: Change[] = [];
	const sections: { name: string; start: Seconds }[] = [];
	for (let i = first; i < bars.length; i++) {
		const b = bars[i] as PlayedBar;
		const before = i > first ? bars[i - 1] : undefined;
		const start = starts[i] as Seconds;
		if (b.section !== null && b.section !== before?.section)
			sections.push({ name: b.section, start });
		if (before) changes.push(...changesAt(b, before, start));
	}
	return { changes, sections };
}

/**
 * What a detector would hear if it played `parse`'s bars at `tempo`: the grid,
 * a run of `toHarte` per chord (a hold lengthens the one before, `N.C.` is
 * `N`, a rest or `?` is silence) and the key, meter, tempo, changes and
 * sections the chart writes. `jitter` (a fraction of a beat) moves each bar
 * start and each chord edge by its own random amount; `drift` (a fraction of
 * its bar) delays the chord edges in every bar.
 */
export function runsFromChart(parse: ChartParse, o: Options): Detections {
	const rand = mulberry32(o.seed ?? 1);
	const noise = (size: number) => (rand() * 2 - 1) * size;
	const bars = parse.bars;
	const first = pickupOf(bars) ? 1 : 0;
	const lead = bars[first] as PlayedBar;
	const starts = barStarts(bars, o);
	const runs = chordRuns(bars, starts, o, noise);
	const jitter = (o.jitter ?? 0) * beatOf(lead, o);
	return {
		grid: { bars: starts.slice(first).map((s) => s + noise(jitter)) },
		chords: { runs },
		key: keyText(lead),
		meter: meterText(lead),
		...(lead.tempo === null ? {} : { tempo: lead.tempo }),
		...marksOf(bars, starts, first),
		...(first ? { pickup: { start: starts[0] as Seconds } } : {}),
	};
}

/** The sounding chord's pitch classes (sorted, comma-joined) for each beat of each bar; "" for `N.C.`, `?`, rests and gaps. */
export function soundingByBeat(parse: ChartParse): string[] {
	const out: string[] = [];
	let sounding = "";
	for (const b of parse.bars) {
		const heard = piecesOf(b).map((p) => {
			if (p.sound === "chord") sounding = p.classes as string;
			else if (p.sound !== "hold") sounding = "";
			return { ...p, text: sounding };
		});
		const beats = beatsOf(b.meter);
		for (let k = 0; k < beats; k++) {
			const lo = k / beats;
			const hi = (k + 1) / beats;
			let best = { overlap: 0, text: "" };
			for (const p of heard) {
				const overlap = Math.min(hi, p.to) - Math.max(lo, p.from);
				if (overlap > best.overlap + 1e-9) best = { overlap, text: p.text };
			}
			out.push(best.text);
		}
	}
	return out;
}
