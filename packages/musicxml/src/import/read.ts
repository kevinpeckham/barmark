/** Reads a MusicXML score-partwise into parts, lines and marks at exact positions. */
import type { Credits, Key, Meter } from "barmark";
import { MODE_FIFTHS } from "../measure-xml.js";
import { cmp, type Frac, frac, minus, plus, ZERO } from "../rhythm.js";
import { writtenPitch } from "../written.js";
import type { Losses } from "./losses.js";
import { child, children, textOf, type XNode } from "./tree.js";

export type Attack = {
	at: Frac;
	length: Frac;
	kind: "notes" | "slash" | "rest";
	pitches: { name: string; octave: number; root: boolean }[];
	tieIn: boolean;
	tieOut: boolean;
	fermata: boolean;
	lyrics: {
		verse: number;
		syllabic: "single" | "begin" | "middle" | "end";
		text: string;
		elision: boolean;
	}[];
};

export type HarmonyMark = { at: Frac; node: XNode };

export type Mark = {
	at: Frac;
	kind: "words" | "rehearsal" | "segno" | "coda" | "metronome" | "sound" | "swing";
	placement: "above" | "below" | null;
	bold: boolean;
	text: string;
	node: XNode;
};

export type ReadMeasure = {
	number: string;
	/** The measure's `text` attribute: the export's written bar number. */
	written: string | null;
	length: Frac;
	implicit: boolean;
	time: Meter | null;
	/** A bar of its own meter: a `<time>` that reverts on the next measure, or an implicit pickup in the running meter's beat unit; null when it is neither, or the length isn't expressible. */
	oneBar: Meter | null;
	key: Key | null;
	repeatStart: boolean;
	repeatEnd: { times: number } | null;
	ending: { numbers: number[]; type: "start" | "stop" | "discontinue" } | null;
	fermataEnd: boolean;
	marks: Mark[];
	harmonies: HarmonyMark[];
	/** One line per place in the design's staff/voice table; an empty list rests the measure. */
	lines: Attack[][];
};

export type ReadPart = {
	id: string;
	name: string;
	abbreviation: string | null;
	instrumentName: string | null;
	midiProgram: number | null;
	staves: number;
	/** Distinct staff/voice pairs seen; more than four cannot be lines. */
	voices: number;
	transpose: { chromatic: number; octave: number };
	measures: ReadMeasure[];
};

export type ReadScore = {
	title: string | null;
	credits: Credits;
	software: string | null;
	parts: ReadPart[];
};

const STEPS = "CDEFGAB";
const DEFAULT_METER: Meter = { n: 4, d: 4 };

const num = (s: string, fallback = 0): number => {
	const n = Number(s);
	return s.trim() !== "" && Number.isFinite(n) ? n : fallback;
};
const sameMeter = (a: Meter | null, b: Meter | null) => a?.n === b?.n && a?.d === b?.d;
const barOf = (m: Meter): Frac => frac(4 * m.n, m.d);

/** A part's state while its measures are read. */
type PartState = {
	id: string;
	name: string;
	divisions: number;
	meter: Meter;
	declaredStaves: number;
	chromatic: number;
	diatonic: number | null;
	octave: number;
	/** `staff|voice` in order of first appearance. */
	places: string[];
	/** Lyric `number`s in order of first appearance. */
	verses: string[];
};

/** A measure as read, before its voices become lines. */
type RawMeasure = Omit<ReadMeasure, "lines"> & { voices: Map<string, Attack[]> };

type Cursor = { at: Frac; end: Frac; last: Attack | null };

/** The spelled name of a pitch at its sounding place, through the part's transposition. */
function soundingPitch(note: XNode, p: PartState): { name: string; octave: number } {
	const alter = Math.round(num(textOf(child(note, "pitch"), "alter")));
	const pitch = child(note, "pitch");
	const step = textOf(pitch, "step");
	const written = {
		step: STEPS.includes(step) && step !== "" ? step : "C",
		alter,
		octave: num(textOf(pitch, "octave"), 4),
	};
	const by = { diatonic: p.diatonic ?? Math.round((p.chromatic * 7) / 12), chromatic: p.chromatic };
	const out = writtenPitch(written, {
		diatonic: by.diatonic + 7 * p.octave,
		chromatic: by.chromatic + 12 * p.octave,
	});
	const mark = out.alter > 0 ? "#".repeat(out.alter) : "b".repeat(-out.alter);
	return { name: out.step + mark, octave: out.octave };
}

const LYRIC_SYLLABIC = ["single", "begin", "middle", "end"] as const;

/** A lyric's text, its `<elision>`s joining the texts around them. */
function lyricText(l: XNode): { text: string; elision: boolean } {
	const parts = l.children.filter((c) => c.name === "text" || c.name === "elision");
	return {
		text: parts.map((c) => (c.name === "elision" && c.text === "" ? " " : c.text)).join(""),
		elision: parts.some((c) => c.name === "elision"),
	};
}

const syllabicOf = (l: XNode) =>
	LYRIC_SYLLABIC.find((s) => s === textOf(l, "syllabic")) ?? "single";

function lyricsOf(note: XNode, p: PartState): Attack["lyrics"] {
	return children(note, "lyric").flatMap((l) => {
		const key = l.attrs.number ?? l.attrs.name ?? "";
		if (!p.verses.includes(key)) p.verses.push(key);
		const { text, elision } = lyricText(l);
		return text === ""
			? []
			: [{ verse: p.verses.indexOf(key) + 1, syllabic: syllabicOf(l), text, elision }];
	});
}

const hasTie = (note: XNode, type: string) =>
	children(note, "tie").some((t) => t.attrs.type === type) ||
	children(note, "notations").some((n) => children(n, "tied").some((t) => t.attrs.type === type));

const fermataOn = (note: XNode) => children(note, "notations").some((n) => child(n, "fermata"));

const advance = (cur: Cursor, by: Frac): void => {
	cur.at = plus(cur.at, by);
	if (cmp(cur.at, cur.end) > 0) cur.end = cur.at;
};

const kindOf = (n: XNode): Attack["kind"] => {
	if (child(n, "rest")) return "rest";
	return child(n, "pitch") && textOf(n, "notehead") !== "slash" ? "notes" : "slash";
};

/** A note's own part of an attack: its pitch, ties, fermata and lyrics. */
function addNote(attack: Attack, n: XNode, p: PartState): void {
	if (attack.kind === "notes" && child(n, "pitch"))
		attack.pitches.push({ ...soundingPitch(n, p), root: n.pis.includes("barmark root") });
	attack.tieIn ||= hasTie(n, "stop");
	attack.tieOut ||= hasTie(n, "start");
	attack.fermata ||= fermataOn(n);
	attack.lyrics.push(...lyricsOf(n, p));
}

/** The voice's attack list for a note's place, registering the place on first sight. */
function attacksFor(n: XNode, p: PartState, raw: RawMeasure): Attack[] {
	const place = `${num(textOf(n, "staff"), 1)}|${textOf(n, "voice") || "1"}`;
	if (!p.places.includes(place)) p.places.push(place);
	const attacks = raw.voices.get(place) ?? [];
	raw.voices.set(place, attacks);
	return attacks;
}

const newAttack = (n: XNode, at: Frac, length: Frac): Attack => ({
	at,
	length,
	kind: kindOf(n),
	pitches: [],
	tieIn: false,
	tieOut: false,
	fermata: false,
	lyrics: [],
});

/** One `<note>` into its voice's attacks; a chord note joins the attack before it. A whole-measure rest only registers its voice. */
function readNote(n: XNode, p: PartState, raw: RawMeasure, cur: Cursor): void {
	if (child(n, "grace")) return;
	const duration = frac(num(textOf(n, "duration")), p.divisions);
	const attacks = attacksFor(n, p, raw);
	const chord = child(n, "chord") !== undefined;
	if (child(n, "rest")?.attrs.measure !== "yes") {
		if (!chord) {
			cur.last = newAttack(n, cur.at, duration);
			attacks.push(cur.last);
		}
		if (cur.last) addNote(cur.last, n, p);
	}
	if (!chord) advance(cur, duration);
}

const intOf = (s: string | undefined) => Math.round(num(s ?? ""));

/** Fifths of the key a major tonic names (F is -1, B is 5), as a note name. */
function tonicName(fifths: number): string {
	const i = fifths + 1;
	const letter = "FCGDAEB"[((i % 7) + 7) % 7] ?? "C";
	const acc = Math.floor(i / 7);
	return letter + (acc > 0 ? "#".repeat(acc) : "b".repeat(-acc));
}

/** A `<key>` at sounding pitch: a transposing part's written key moves by the interval's fifths. */
function keyOf(k: XNode, p: PartState): Key | null {
	const fifthsText = textOf(k, "fifths");
	if (fifthsText === "") return null;
	const mode = textOf(k, "mode");
	const name = (mode in MODE_FIFTHS ? mode : "major") as Key["mode"];
	const diatonic = p.diatonic ?? Math.round((p.chromatic * 7) / 12);
	const sounding = num(fifthsText) + 7 * p.chromatic - 12 * diatonic;
	return { tonic: tonicName(sounding - MODE_FIFTHS[name]), mode: name };
}

function timeOf(t: XNode): Meter | null {
	const beats = textOf(t, "beats")
		.split("+")
		.reduce((sum, b) => sum + num(b), 0);
	const d = num(textOf(t, "beat-type"));
	return beats > 0 && d > 0 ? { n: beats, d } : null;
}

function readAttributes(a: XNode, p: PartState, raw: RawMeasure): void {
	const divisions = num(textOf(a, "divisions"));
	if (divisions > 0) p.divisions = divisions;
	const staves = num(textOf(a, "staves"));
	if (staves > 0) p.declaredStaves = staves;
	const transpose = child(a, "transpose");
	if (transpose) {
		p.chromatic = num(textOf(transpose, "chromatic"));
		p.octave = num(textOf(transpose, "octave-change"));
		p.diatonic = textOf(transpose, "diatonic") === "" ? null : num(textOf(transpose, "diatonic"));
	}
	const time = child(a, "time");
	const meter = time ? timeOf(time) : null;
	if (meter) {
		raw.time = meter;
		p.meter = meter;
	}
	const key = child(a, "key");
	const read = key ? keyOf(key, p) : null;
	if (read) raw.key = read;
}

const placementOf = (d: XNode): Mark["placement"] =>
	d.attrs.placement === "above" || d.attrs.placement === "below" ? d.attrs.placement : null;

/** The marks a `<sound>` carries: itself when it has attributes, and its `<swing>`. */
function soundMarks(s: XNode, at: Frac, placement: Mark["placement"]): Mark[] {
	const mark = (kind: Mark["kind"], node: XNode): Mark => ({
		at,
		kind,
		placement,
		bold: false,
		text: "",
		node,
	});
	const swing = child(s, "swing");
	return [
		...(Object.keys(s.attrs).length > 0 ? [mark("sound", s)] : []),
		...(swing ? [mark("swing", swing)] : []),
	];
}

const DIRECTION_KINDS = ["words", "rehearsal", "segno", "coda", "metronome"] as const;

function readDirection(d: XNode, p: PartState, at: Frac): Mark[] {
	const placement = placementOf(d);
	const where = plus(at, offsetOf(d, p));
	const marks: Mark[] = [];
	for (const type of children(d, "direction-type"))
		for (const c of type.children) {
			const kind = DIRECTION_KINDS.find((k) => k === c.name);
			if (!kind) continue;
			const text = kind === "metronome" ? textOf(c, "per-minute") : textOf(c);
			marks.push({
				at: where,
				kind,
				placement,
				bold: c.attrs["font-weight"] === "bold",
				text,
				node: c,
			});
		}
	for (const s of children(d, "sound")) marks.push(...soundMarks(s, where, placement));
	return marks;
}

/** `"1, 2"` and `"1-3"` as the numbers they name. */
function endingNumbers(text: string): number[] {
	return text.split(/[,\s]+/).flatMap((part) => {
		const [from, to] = part.split("-").map((x) => Number.parseInt(x, 10));
		if (from === undefined || Number.isNaN(from)) return [];
		const last = to === undefined || Number.isNaN(to) ? from : to;
		return Array.from({ length: Math.max(0, last - from) + 1 }, (_, i) => from + i);
	});
}

const ENDING_TYPES = ["start", "stop", "discontinue"] as const;

/** A barline's ending; a one-bar ending starts on the left barline and stops on the right, and the start is what is kept. */
function readEnding(b: XNode, raw: RawMeasure): void {
	const ending = child(b, "ending");
	const type = ENDING_TYPES.find((t) => t === ending?.attrs.type);
	if (ending && type && raw.ending?.type !== "start")
		raw.ending = { numbers: endingNumbers(ending.attrs.number ?? ""), type };
}

function readBarline(b: XNode, raw: RawMeasure): void {
	const repeat = child(b, "repeat");
	if (repeat?.attrs.direction === "forward") raw.repeatStart = true;
	if (repeat?.attrs.direction === "backward")
		raw.repeatEnd = { times: Math.max(1, intOf(repeat.attrs.times ?? "2")) };
	if (b.attrs.location !== "left" && child(b, "fermata")) raw.fermataEnd = true;
	readEnding(b, raw);
}

const blankMeasure = (node: XNode): RawMeasure => ({
	number: node.attrs.number ?? "",
	written: node.attrs.text ?? null,
	length: ZERO,
	implicit: node.attrs.implicit === "yes",
	time: null,
	oneBar: null,
	key: null,
	repeatStart: false,
	repeatEnd: null,
	ending: null,
	fermataEnd: false,
	marks: [],
	harmonies: [],
	voices: new Map(),
});

type Reader = (c: XNode, p: PartState, raw: RawMeasure, cur: Cursor) => void;

const offsetOf = (c: XNode, p: PartState) => frac(num(textOf(c, "offset")), p.divisions);
const divisionsOf = (c: XNode, p: PartState) => frac(num(textOf(c, "duration")), p.divisions);

/** What each child of a `<measure>` does, in document order. */
const READERS: Record<string, Reader> = {
	attributes: (c, p, raw) => readAttributes(c, p, raw),
	note: readNote,
	backup: (c, p, _raw, cur) => {
		cur.at = minus(cur.at, divisionsOf(c, p));
	},
	forward: (c, p, _raw, cur) => advance(cur, divisionsOf(c, p)),
	direction: (c, p, raw, cur) => raw.marks.push(...readDirection(c, p, cur.at)),
	sound: (c, _p, raw, cur) => raw.marks.push(...soundMarks(c, cur.at, null)),
	harmony: (c, p, raw, cur) => raw.harmonies.push({ at: plus(cur.at, offsetOf(c, p)), node: c }),
	barline: (c, _p, raw) => readBarline(c, raw),
};

function readMeasure(node: XNode, p: PartState): RawMeasure {
	const raw = blankMeasure(node);
	const cur: Cursor = { at: ZERO, end: ZERO, last: null };
	for (const c of node.children) READERS[c.name]?.(c, p, raw, cur);
	raw.length = raw.implicit && cmp(cur.end, ZERO) > 0 ? cur.end : barOf(p.meter);
	return raw;
}

/** The bar's length in the meter's beat unit (its denominator), or null when it isn't whole. */
function pickupMeter(length: Frac, meter: Meter): Meter | null {
	const n = frac(length.n * meter.d, length.d * 4);
	return n.d === 1 && n.n > 0 ? { n: n.n, d: meter.d } : null;
}

const NOT_WHOLE = "a short bar's length isn't a whole number of beats; read as a full bar";

/** Whether a `<time>` that differs from the running meter reverts on the next measure. */
const reverts = (m: RawMeasure, next: RawMeasure | undefined, running: Meter | null) =>
	m.time !== null &&
	running !== null &&
	!sameMeter(m.time, running) &&
	sameMeter(next?.time ?? null, running);

/** An implicit bar short of the running meter is a pickup bar of its own. */
function settlePickup(m: RawMeasure, meter: Meter, partName: string, losses: Losses): void {
	if (!m.implicit || cmp(m.length, barOf(meter)) === 0) return;
	m.oneBar = cmp(m.length, barOf(meter)) < 0 ? pickupMeter(m.length, meter) : null;
	if (!m.oneBar) losses.add("oneBar", NOT_WHOLE, partName, m.number);
}

/** Settles which measures are bars of their own meter, and which `<time>`s are directives. */
function settleMeters(measures: RawMeasure[], part: PartState, losses: Losses): void {
	let running: Meter | null = null;
	measures.forEach((m, i) => {
		const next = measures[i + 1];
		if (next && reverts(m, next, running)) {
			m.oneBar = m.time;
			m.time = null;
			next.time = null;
			return;
		}
		running = m.time ?? running;
		settlePickup(m, running ?? DEFAULT_METER, part.name, losses);
	});
}

/** Each place's line index: the staves' first voices, then their second voices, as the export writes them. */
function lineIndexes(places: string[], staves: number): Map<string, number> {
	const rank = new Map<number, number>();
	const out = new Map<string, number>();
	for (const place of places) {
		const staff = Number.parseInt(place, 10);
		const r = rank.get(staff) ?? 0;
		rank.set(staff, r + 1);
		out.set(place, r * staves + (staff - 1));
	}
	return out;
}

/** The measures with each voice's attacks on its line; every measure has every line. */
function withLines(raws: RawMeasure[], index: Map<string, number>): ReadMeasure[] {
	const count = Math.max(1, ...[...index.values()].map((i) => i + 1));
	return raws.map(({ voices, ...m }): ReadMeasure => {
		const lines: Attack[][] = Array.from({ length: count }, () => []);
		for (const [place, attacks] of voices) lines[index.get(place) ?? 0] = attacks;
		return { ...m, lines };
	});
}

type Meta = {
	name: string;
	abbreviation: string | null;
	instrumentName: string | null;
	midiProgram: number | null;
};

function readPart(node: XNode, meta: Meta, losses: Losses): ReadPart {
	const id = node.attrs.id ?? "";
	const p: PartState = {
		id,
		name: meta.name,
		divisions: 1,
		meter: DEFAULT_METER,
		declaredStaves: 1,
		chromatic: 0,
		diatonic: null,
		octave: 0,
		places: [],
		verses: [],
	};
	const raws = children(node, "measure").map((m) => readMeasure(m, p));
	settleMeters(raws, p, losses);
	const staves = Math.max(p.declaredStaves, ...p.places.map((x) => Number.parseInt(x, 10)));
	const measures = withLines(raws, lineIndexes(p.places, staves));
	return {
		id,
		name: p.name,
		abbreviation: meta.abbreviation,
		instrumentName: meta.instrumentName,
		midiProgram: meta.midiProgram,
		staves,
		voices: p.places.length,
		transpose: { chromatic: p.chromatic, octave: p.octave },
		measures,
	};
}

const noMeta = (id: string): Meta => ({
	name: id,
	abbreviation: null,
	instrumentName: null,
	midiProgram: null,
});

function partMeta(list: XNode | undefined): Map<string, Meta> {
	const out = new Map<string, Meta>();
	for (const sp of children(list ?? ({ children: [] } as unknown as XNode), "score-part")) {
		const program = textOf(child(sp, "midi-instrument"), "midi-program");
		out.set(sp.attrs.id ?? "", {
			name: textOf(sp, "part-name") || (sp.attrs.id ?? ""),
			abbreviation: textOf(sp, "part-abbreviation") || null,
			instrumentName: textOf(child(sp, "score-instrument"), "instrument-name") || null,
			midiProgram: program === "" ? null : num(program),
		});
	}
	return out;
}

const ROLES = ["composer", "lyricist", "arranger"] as const;

function creditsOf(identification: XNode | undefined): Credits {
	const named = (name: string) =>
		children(
			identification ?? { name: "", attrs: {}, children: [], text: "", pis: [] },
			name,
		).filter((c) => textOf(c) !== "");
	const creators = named("creator");
	return {
		composer: [],
		lyricist: [],
		arranger: [],
		...Object.fromEntries(
			ROLES.map((role) => [
				role,
				creators.filter((c) => c.attrs.type === role).map((c) => textOf(c)),
			]),
		),
		copyright: named("rights").map((r) => textOf(r)),
	};
}

/** The score, or null (with an error) when the file isn't a score-partwise. */
export function readScore(root: XNode, losses: Losses): ReadScore | null {
	if (root.name !== "score-partwise") {
		losses.note({
			severity: "error",
			message:
				root.name === "score-timewise"
					? "score-timewise isn't supported; save as partwise"
					: `not a MusicXML score: the root element is <${root.name}>`,
		});
		return null;
	}
	const meta = partMeta(child(root, "part-list"));
	const identification = child(root, "identification");
	return {
		title: textOf(child(root, "work"), "work-title") || textOf(root, "movement-title") || null,
		credits: creditsOf(identification),
		software: textOf(child(identification ?? root, "encoding"), "software") || null,
		parts: children(root, "part").map((part) =>
			readPart(part, meta.get(part.attrs.id ?? "") ?? noMeta(part.attrs.id ?? ""), losses),
		),
	};
}
