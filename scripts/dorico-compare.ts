/**
 * What Dorico made of a MIDI file, against what the file plays: the
 * comparison behind scripts/dorico-midi.ts. Pure: a performance (`perform`
 * of the chart, as `exportMidi` plays it) and Dorico's MusicXML in, a
 * report out. Notes are compared as sounding pitches at onsets and lengths
 * in quarters from the first downbeat, tied notes joined; Dorico quantizes
 * what it imports, so a note within `TOLERANCE` of its place still matches,
 * and an exact match is counted on its own.
 */
import { keyFifths } from "../packages/midi/src/perform/keys.js";
import type { Performance, Quarters } from "../packages/midi/src/perform/types.js";
import { hasTie } from "../packages/musicxml/src/import/read.js";
import {
	child,
	children,
	parseXml,
	textOf,
	type XNode,
} from "../packages/musicxml/src/import/tree.js";

/** How far, in quarters, a note's onset or length may be from the file's and still match: a 32nd. */
export const TOLERANCE = 1 / 8;

export type Note = { pitch: number; at: number; length: number };
export type Lyric = { at: number; verse: number; text: string };
export type ScorePart = {
	id: string;
	name: string;
	measures: number;
	notes: Note[];
	lyrics: Lyric[];
};
/** Dorico's MusicXML as it sounds: signatures, tempi and marks are the score's (its parts', merged). */
export type Score = {
	parts: ScorePart[];
	times: { at: number; n: number; d: number }[];
	keys: { at: number; fifths: number; minor: boolean }[];
	tempos: { at: number; qpm: number }[];
	marks: { at: number; kind: "rehearsal" | "words"; text: string }[];
};

const EPSILON = 1e-6;
const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const UNITS: Record<string, number> = {
	whole: 4,
	half: 2,
	quarter: 1,
	eighth: 0.5,
	"16th": 0.25,
	"32nd": 0.125,
};
const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));

/** A `<time>`'s meter, if it has one. */
function meterOf(time: XNode | undefined): { n: number; d: number } | null {
	const n = num(textOf(time, "beats"));
	const d = num(textOf(time, "beat-type"));
	return n > 0 && d > 0 ? { n, d } : null;
}

/** A `<transpose>`'s move from written to sounding pitch, in semitones. */
const semitones = (t: XNode) =>
	(num(textOf(t, "chromatic")) || 0) + 12 * (num(textOf(t, "octave-change")) || 0);

/** A `<pitch>` as a MIDI note number, before transposition. */
const midiOf = (pitch: XNode) =>
	12 * (num(textOf(pitch, "octave")) + 1) +
	(STEPS[textOf(pitch, "step")] ?? 0) +
	(num(textOf(pitch, "alter")) || 0);

/** A note's lyrics, at `at`: each `<lyric>`'s text (elided syllables joined by a space). */
const lyricsOf = (n: XNode, at: number): Lyric[] =>
	children(n, "lyric").flatMap((l) => {
		const text = children(l, "text")
			.map((t) => t.text.trim())
			.join(" ");
		return text ? [{ at, verse: num(l.attrs.number ?? "1") || 1, text }] : [];
	});

/** A `<metronome>` in quarters a minute, if it says. */
function metronomeQpm(m: XNode): number | null {
	const unit = UNITS[textOf(m, "beat-unit")];
	const per = num(textOf(m, "per-minute"));
	const dots = children(m, "beat-unit-dot").length;
	return unit !== undefined && per > 0 ? per * unit * (2 - 0.5 ** dots) : null;
}

/** A part as read: its sounding notes (ties not yet joined, so each keeps its tie marks). */
type Tied = Note & { tieStart: boolean; tieStop: boolean };

/** What a part's measures set: what the score keeps from its first part. */
type Marks = Omit<Score, "parts">;

/** One `<part>`'s measures, in quarters from its first downbeat. */
class PartReader {
	divisions = 1;
	transpose = 0;
	start = 0;
	notes: Tied[] = [];
	lyrics: Lyric[] = [];
	readonly marks: Marks = { times: [], keys: [], tempos: [], marks: [] };
	private pos = 0;
	private onset = 0;
	private end = 0;
	private meter = 4;

	measure(m: XNode): void {
		this.pos = 0;
		this.end = 0;
		for (const el of m.children) this.element(el);
		this.start += this.end > EPSILON ? this.end : this.meter;
	}

	private quarters(n: XNode | undefined) {
		const d = num(textOf(n, "duration"));
		return Number.isFinite(d) ? d / this.divisions : 0;
	}

	private move(by: number) {
		this.pos += by;
		this.end = Math.max(this.end, this.pos);
	}

	private element(el: XNode): void {
		if (el.name === "attributes") this.attributes(el);
		else if (el.name === "backup") this.move(-this.quarters(el));
		else if (el.name === "forward") this.move(this.quarters(el));
		else if (el.name === "note") this.note(el);
		else if (el.name === "direction") this.direction(el);
		else if (el.name === "sound") this.sound(el, this.start + this.pos);
	}

	private attributes(a: XNode): void {
		const d = num(textOf(a, "divisions"));
		if (d > 0) this.divisions = d;
		const at = this.start + this.pos;
		const meter = meterOf(child(a, "time"));
		if (meter) {
			this.marks.times.push({ at, ...meter });
			this.meter = (4 * meter.n) / meter.d;
		}
		const key = child(a, "key");
		if (key && textOf(key, "fifths") !== "")
			this.marks.keys.push({
				at,
				fifths: num(textOf(key, "fifths")),
				minor: textOf(key, "mode") === "minor",
			});
		const t = child(a, "transpose");
		if (t) this.transpose = semitones(t);
	}

	/** Where a note starts: with the note before it if a chord's, else here (and the time moves on). */
	private place(n: XNode, length: number): number {
		if (child(n, "chord")) this.end = Math.max(this.end, this.onset + length);
		else {
			this.onset = this.pos;
			this.move(length);
		}
		return this.start + this.onset;
	}

	private note(n: XNode): void {
		if (child(n, "grace")) return;
		const length = this.quarters(n);
		const at = this.place(n, length);
		this.lyrics.push(...lyricsOf(n, at));
		const pitch = child(n, "pitch");
		if (!pitch || child(n, "cue")) return;
		this.notes.push({
			pitch: midiOf(pitch) + this.transpose,
			at,
			length,
			tieStart: hasTie(n, "start"),
			tieStop: hasTie(n, "stop"),
		});
	}

	private direction(d: XNode): void {
		const offset = num(textOf(d, "offset"));
		const at = this.start + this.pos + (Number.isFinite(offset) ? offset / this.divisions : 0);
		for (const type of children(d, "direction-type"))
			for (const el of type.children) this.directionType(el, at);
		const sound = child(d, "sound");
		if (sound) this.sound(sound, at);
	}

	private directionType(el: XNode, at: number): void {
		const text = el.text.trim();
		if ((el.name === "rehearsal" || el.name === "words") && text)
			this.marks.marks.push({ at, kind: el.name, text });
		const qpm = el.name === "metronome" ? metronomeQpm(el) : null;
		if (qpm !== null) this.marks.tempos.push({ at, qpm });
	}

	private sound(s: XNode, at: number): void {
		const qpm = num(s.attrs.tempo ?? "");
		if (qpm > 0) this.marks.tempos.push({ at, qpm });
	}
}

/** Tied notes as one: a note tied into joins the note of its pitch ending where it starts. */
function joinTies(notes: Tied[]): Note[] {
	const out: Note[] = [];
	const open = new Map<number, Note>();
	for (const n of [...notes].sort((a, b) => a.at - b.at)) {
		const held = open.get(n.pitch);
		if (n.tieStop && held && Math.abs(held.at + held.length - n.at) < EPSILON) {
			held.length += n.length;
			if (!n.tieStart) open.delete(n.pitch);
			continue;
		}
		const note = { pitch: n.pitch, at: n.at, length: n.length };
		out.push(note);
		if (n.tieStart) open.set(n.pitch, note);
		else open.delete(n.pitch);
	}
	return out.sort((a, b) => a.at - b.at || a.pitch - b.pitch);
}

/** Items once each, by `key`, in time order. */
const unique = <T extends { at: number }>(items: T[], key: (t: T) => string) => {
	const seen = new Set<string>();
	return items
		.filter((t) => {
			const k = `${t.at.toFixed(4)}|${key(t)}`;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		})
		.sort((a, b) => a.at - b.at);
};

/** Dorico's MusicXML as sounding notes, signatures, tempi and marks; null if it isn't a score-partwise. */
export function readMusicXml(xml: string): Score | null {
	const root = parseXml(xml);
	if (root?.name !== "score-partwise") return null;
	const names = new Map(
		children(child(root, "part-list") ?? root, "score-part").map((p) => [
			p.attrs.id ?? "",
			textOf(p, "part-name"),
		]),
	);
	const readers = children(root, "part").map((p) => {
		const r = new PartReader();
		const measures = children(p, "measure");
		for (const m of measures) r.measure(m);
		const id = p.attrs.id ?? "";
		return { r, part: { id, name: names.get(id) ?? id, measures: measures.length } };
	});
	const first = readers[0]?.r.marks;
	const all = readers.map(({ r }) => r.marks);
	return {
		parts: readers.map(({ r, part }) => ({
			...part,
			notes: joinTies(r.notes),
			lyrics: [...r.lyrics].sort((a, b) => a.at - b.at || a.verse - b.verse),
		})),
		times: unique(first?.times ?? [], (t) => `${t.n}/${t.d}`),
		keys: unique(first?.keys ?? [], (k) => `${k.fifths}${k.minor}`),
		tempos: unique(
			all.flatMap((m) => m.tempos),
			(t) => t.qpm.toFixed(2),
		),
		marks: unique(
			all.flatMap((m) => m.marks),
			(m) => `${m.kind}|${m.text}`,
		),
	};
}

export type NoteMatch = {
	exact: number;
	/** Matched, not exactly: onset and length each within the tolerance. */
	withinTolerance: number;
	/** At its place (within the tolerance), with a length beyond it. */
	lengthDiffers: { expected: Note; found: Note }[];
	missing: Note[];
	extra: Note[];
};

/** Each expected note to the nearest found note of its pitch within `tolerance` of its onset. */
export function matchNotes(expected: Note[], found: Note[], tolerance = TOLERANCE): NoteMatch {
	const byPitch = new Map<number, Note[]>();
	for (const f of found) byPitch.set(f.pitch, [...(byPitch.get(f.pitch) ?? []), f]);
	const used = new Set<Note>();
	const m: NoteMatch = { exact: 0, withinTolerance: 0, lengthDiffers: [], missing: [], extra: [] };
	const order = [...expected].sort((a, b) => a.at - b.at || a.pitch - b.pitch);
	for (const e of order) {
		const near = (byPitch.get(e.pitch) ?? [])
			.filter((f) => !used.has(f) && Math.abs(f.at - e.at) <= tolerance + EPSILON)
			.sort(
				(a, b) =>
					Math.abs(a.at - e.at) - Math.abs(b.at - e.at) ||
					Math.abs(a.length - e.length) - Math.abs(b.length - e.length),
			)[0];
		if (!near) {
			m.missing.push(e);
			continue;
		}
		used.add(near);
		const dLength = Math.abs(near.length - e.length);
		if (Math.abs(near.at - e.at) < EPSILON && dLength < EPSILON) m.exact++;
		else if (dLength <= tolerance + EPSILON) m.withinTolerance++;
		else m.lengthDiffers.push({ expected: e, found: near });
	}
	m.extra = found.filter((f) => !used.has(f)).sort((a, b) => a.at - b.at || a.pitch - b.pitch);
	return m;
}

/** A place in the performance: its played bar (from 1), the chart's bar, and the beat in quarters (from 1). */
type Place = { bar: number; chartBar: number; beat: number };
/** A note listed where it falls. */
export type PlacedNote = Place & { pitch: string; length: number };
/** A mark (signature, tempo, marker, lyric) listed where it falls: `value` as the chart has it. */
export type PlacedMark = { at: number; bar: number; value: string };
export type Kept = {
	kept: number;
	changed: (PlacedMark & { found: string })[];
	dropped: PlacedMark[];
	/** Dorico's, where the file has none. */
	added: PlacedMark[];
};

export type PartReport = {
	track: string;
	/** The Dorico part it was compared with; null when none was left for it. */
	part: string | null;
	measures: number | null;
	notes: {
		expected: number;
		found: number;
		exact: number;
		withinTolerance: number;
		lengthDiffers: (PlacedNote & { found: { at: number; length: number } })[];
		missing: PlacedNote[];
		extra: PlacedNote[];
	};
	lyrics: Kept;
};

export type FileReport = {
	name: string;
	playedBars: number;
	tolerance: number;
	/** What Dorico's MIDI Import Options window showed, as mac-bench recorded it. */
	importWindow: unknown;
	/** Why there is nothing to compare (unreadable MusicXML). */
	error?: string;
	parts: PartReport[];
	/** Dorico's parts no track was compared with. */
	extraParts: string[];
	time: Kept;
	keys: Kept;
	tempos: Kept;
	markers: Kept;
};

const n = (q: Quarters) => q.n / q.d;
const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const pitchName = (p: number) => `${NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
/** A pitch moved by octaves into 0–127, as exportMidi writes it. */
const fold = (p: number) =>
	p > 127 ? p - 12 * Math.ceil((p - 127) / 12) : p < 0 ? p + 12 * Math.ceil(-p / 12) : p;
const round = (x: number) => Math.round(x * 1000) / 1000;

function placer(p: Performance): (at: number) => Place {
	const bars = p.bars.map((b) => ({ index: b.index, at: n(b.at) }));
	return (at) => {
		let i = bars.findLastIndex((b) => b.at <= at + EPSILON);
		if (i < 0) i = 0;
		const b = bars[i];
		return { bar: i + 1, chartBar: b?.index ?? 1, beat: round(at - (b?.at ?? 0) + 1) };
	};
}

/**
 * Expected marks against Dorico's: at the same place (within the
 * tolerance), the same value is kept and another is changed; none there is
 * dropped; Dorico's left over are added.
 */
function keptOf<T extends { at: number }>(
	expected: T[],
	found: T[],
	value: (t: T) => string,
	bar: (at: number) => number,
): Kept {
	const used = new Set<T>();
	const r: Kept = { kept: 0, changed: [], dropped: [], added: [] };
	const mark = (t: T): PlacedMark => ({ at: round(t.at), bar: bar(t.at), value: value(t) });
	for (const e of expected) {
		const here = found.filter((f) => !used.has(f) && Math.abs(f.at - e.at) <= TOLERANCE + EPSILON);
		const same = here.find((f) => value(f) === value(e));
		const other = same ?? here[0];
		if (other) used.add(other);
		if (same) r.kept++;
		else if (other) r.changed.push({ ...mark(e), found: value(other) });
		else r.dropped.push(mark(e));
	}
	r.added = found.filter((f) => !used.has(f)).map(mark);
	return r;
}

/** Dorico's name for a destination instrument ("Treble staff 1") without its number. */
const unnumbered = (s: string) => s.replace(/\s+\d+$/, "").trim();

type WindowTrack = { name?: unknown; destination?: unknown };
const windowTracks = (w: unknown): WindowTrack[] => {
	const tracks = (w as { tracks?: unknown } | null)?.tracks;
	return Array.isArray(tracks) ? (tracks as WindowTrack[]) : [];
};

/**
 * Which Dorico part each track became: through the import window (track
 * name, then its destination instrument, then the part of that name), then
 * the tracks with notes, in order, take the parts left.
 */
function pairParts(p: Performance, score: Score, w: unknown): (ScorePart | null)[] {
	const left = [...score.parts];
	const rows = [...windowTracks(w)];
	const take = (pick: (s: ScorePart) => boolean) => {
		const i = left.findIndex(pick);
		return i < 0 ? null : (left.splice(i, 1)[0] ?? null);
	};
	const pairs: (ScorePart | null)[] = p.tracks.map((t) => {
		const row = rows.findIndex((r) => r.name === t.name);
		if (row < 0) return null;
		const dest = String(rows.splice(row, 1)[0]?.destination ?? "");
		return dest ? take((s) => s.name === dest || unnumbered(s.name) === unnumbered(dest)) : null;
	});
	return pairs.map(
		(pair, i) => pair ?? ((p.tracks[i]?.notes.length ?? 0) > 0 ? take(() => true) : null),
	);
}

/** A lyric's words as both sides write them: no hyphen, elisions as spaces. */
const words = (s: string) =>
	s
		.replace(/[‿~_]/g, " ")
		.replace(/-+\s*$/, "")
		.trim();

function partReport(
	t: Performance["tracks"][number],
	part: ScorePart | null,
	place: (at: number) => Place,
): PartReport {
	const expected = t.notes.map((x) => ({ pitch: fold(x.pitch), at: n(x.at), length: n(x.length) }));
	const found = part?.notes ?? [];
	const m = matchNotes(expected, found);
	const placed = (x: Note): PlacedNote => ({
		pitch: pitchName(x.pitch),
		...place(x.at),
		length: round(x.length),
	});
	const lyrics = (ls: Lyric[]) => ls.map((l) => ({ at: l.at, text: words(l.text) }));
	return {
		track: t.name,
		part: part?.name ?? null,
		measures: part?.measures ?? null,
		notes: {
			expected: expected.length,
			found: found.length,
			exact: m.exact,
			withinTolerance: m.withinTolerance,
			lengthDiffers: m.lengthDiffers.map(({ expected: e, found: f }) => ({
				...placed(e),
				found: { at: round(f.at), length: round(f.length) },
			})),
			missing: m.missing.map(placed),
			extra: m.extra.map(placed),
		},
		lyrics: keptOf(
			lyrics(t.lyrics.map((l) => ({ at: n(l.at), verse: l.verse, text: l.text }))),
			lyrics(part?.lyrics ?? []),
			(l) => l.text,
			(at) => place(at).bar,
		),
	};
}

const NONE: Kept = { kept: 0, changed: [], dropped: [], added: [] };

/** The report for one file: the performance `p` exportMidi wrote, against Dorico's MusicXML. */
export function compareFile(
	name: string,
	p: Performance,
	xml: string,
	importWindow: unknown,
): FileReport {
	const base = { name, playedBars: p.bars.length, tolerance: TOLERANCE, importWindow };
	const score = readMusicXml(xml);
	if (!score)
		return {
			...base,
			error: "not MusicXML Dorico could have written (no score-partwise)",
			parts: [],
			extraParts: [],
			time: NONE,
			keys: NONE,
			tempos: NONE,
			markers: NONE,
		};
	const place = placer(p);
	const bar = (at: number) => place(at).bar;
	const pairs = pairParts(p, score, importWindow);
	const used = new Set(pairs);
	const times = p.bars
		.filter((b, i) => {
			const before = p.bars[i - 1]?.meter;
			return before?.n !== b.meter.n || before?.d !== b.meter.d;
		})
		.map((b) => ({ at: n(b.at), meter: `${b.meter.n}/${b.meter.d}` }));
	const key = (fifths: number, minor: boolean) => `${fifths}${minor ? " minor" : " major"}`;
	return {
		...base,
		parts: p.tracks.map((t, i) => partReport(t, pairs[i] ?? null, place)),
		extraParts: score.parts.filter((s) => !used.has(s)).map((s) => s.name),
		time: keptOf(
			times,
			score.times.map((t) => ({ at: t.at, meter: `${t.n}/${t.d}` })),
			(t) => t.meter,
			bar,
		),
		keys: keptOf(
			p.keys.map((k) => {
				const { fifths, minor } = keyFifths(k.key);
				return { at: n(k.at), key: key(fifths, minor) };
			}),
			score.keys.map((k) => ({ at: k.at, key: key(k.fifths, k.minor) })),
			(k) => k.key,
			bar,
		),
		tempos: keptOf(
			p.tempos.map((t) => ({ at: n(t.at), qpm: String(round(t.qpm)) })),
			score.tempos.map((t) => ({ at: t.at, qpm: String(round(t.qpm)) })),
			(t) => t.qpm,
			bar,
		),
		markers: keptOf(
			p.markers.map((m) => ({ at: n(m.at), text: m.text.trim() })),
			score.marks.map((m) => ({ at: m.at, text: m.text })),
			(m) => m.text,
			bar,
		),
	};
}

const LIST = 8;
const listed = <T>(items: T[], line: (t: T) => string, indent: string) => [
	...items.slice(0, LIST).map((t) => `${indent}${line(t)}`),
	...(items.length > LIST ? [`${indent}… ${items.length - LIST} more`] : []),
];
const at = (x: Place) =>
	`bar ${x.bar}${x.chartBar !== x.bar ? ` (chart bar ${x.chartBar})` : ""} beat ${x.beat}`;

function keptLines(what: string, k: Kept, indent: string): string[] {
	const head = `${indent}${what}: ${k.kept} kept, ${k.changed.length} changed, ${k.dropped.length} dropped, ${k.added.length} added`;
	return [
		head,
		...listed(k.changed, (c) => `${c.value} at bar ${c.bar}: changed to ${c.found}`, `${indent}  `),
		...listed(k.dropped, (d) => `${d.value} at bar ${d.bar}: dropped`, `${indent}  `),
		...listed(k.added, (a) => `${a.value} at bar ${a.bar}: added by Dorico`, `${indent}  `),
	];
}

function windowLines(w: unknown): string[] {
	const tracks = windowTracks(w) as Record<string, unknown>[];
	if (w === null || w === undefined) return ["  import window: not recorded"];
	const box = (k: string) => {
		const v = (w as Record<string, unknown>)[k];
		return v === true ? "on" : v === false ? "off" : "?";
	};
	return [
		`  import window: track memory ${box("useTrackMemory")}, General MIDI ${box("interpretAsGeneralMidi")}`,
		...tracks.map((t) => {
			const named = t.name !== undefined;
			const cells = Array.isArray(t.cells) ? (t.cells as string[]).join(" | ") : "";
			return named
				? `    ${String(t.name)} → ${String(t.destination ?? "?")} (${String(t.instrument ?? "?")}, ${String(t.notes ?? "?")} notes${t.enabled === false ? ", disabled" : ""})`
				: `    cells: ${cells}`;
		}),
	];
}

/** The report as text, to read. */
export function formatReport(r: FileReport): string {
	const lines = [`${r.name}: ${r.playedBars} played bars (tolerance ±${r.tolerance} quarter)`];
	lines.push(...windowLines(r.importWindow));
	if (r.error) return [...lines, `  couldn't read Dorico's file: ${r.error}`].join("\n");
	for (const p of r.parts) {
		const n = p.notes;
		const measures =
			p.measures === null
				? "no part"
				: `${p.measures} measures${p.measures === r.playedBars ? "" : ` (played: ${r.playedBars})`}`;
		lines.push(
			`  ${p.track} → Dorico part ${p.part === null ? "none" : `"${p.part}"`}: ${measures}`,
			`    notes: ${n.expected} played, ${n.found} in Dorico's: ${n.exact} exact, ${n.withinTolerance} within tolerance, ${n.lengthDiffers.length} length differs, ${n.missing.length} missing, ${n.extra.length} extra`,
			...listed(
				n.lengthDiffers,
				(x) => `${x.pitch} at ${at(x)}: ${x.length} quarters, Dorico ${x.found.length}`,
				"      ",
			),
			...listed(
				n.missing,
				(x) => `missing ${x.pitch} at ${at(x)} (${x.length} quarters)`,
				"      ",
			),
			...listed(n.extra, (x) => `extra ${x.pitch} at ${at(x)} (${x.length} quarters)`, "      "),
		);
		if (p.lyrics.kept + p.lyrics.changed.length + p.lyrics.dropped.length + p.lyrics.added.length)
			lines.push(...keptLines("lyrics", p.lyrics, "    "));
	}
	if (r.extraParts.length) lines.push(`  Dorico's parts with no track: ${r.extraParts.join(", ")}`);
	lines.push(
		...keptLines("time signatures", r.time, "  "),
		...keptLines("key signatures", r.keys, "  "),
		...keptLines("tempi", r.tempos, "  "),
		...keptLines("markers", r.markers, "  "),
	);
	return lines.join("\n");
}
