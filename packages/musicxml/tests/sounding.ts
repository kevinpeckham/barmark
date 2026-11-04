/**
 * What a part of an export sounds, for the tests: each real note with its
 * sounding pitch, onset and length (ties merged, every staff and voice
 * read), and each harmony with its onset. Slashes and rests sound nothing.
 * Notation can change freely; this must not.
 */
import { harmonyText } from "./play.js";

export type Sounded = {
	notes: { pitch: number; at: string; length: string }[];
	harmonies: { text: string; at: string }[];
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
/** A count of divisions as a fraction of a quarter note, "n/d". */
const quarters = (n: number, divisions: number) => {
	const g = gcd(n, divisions) || 1;
	return `${n / g}/${divisions / g}`;
};

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const num = (body: string, tag: string) =>
	Number(new RegExp(`<${tag}>(-?\\d+)</${tag}>`).exec(body)?.[1] ?? 0);

/** A note's sounding MIDI number: its written pitch moved by the part's transposition. */
function pitchOf(note: string, transpose: number): number | null {
	const step = /<step>([A-G])<\/step>/.exec(note)?.[1];
	if (!step || note.includes("<notehead>slash</notehead>")) return null;
	return 12 * (num(note, "octave") + 1) + (SEMITONES[step] ?? 0) + num(note, "alter") + transpose;
}

/** The reader's place: the clock, in divisions, and what it has heard. */
type State = {
	divisions: number;
	transpose: number;
	/** Where the cursor is, the furthest it has reached in this measure, and the last note's onset. */
	at: number;
	end: number;
	onset: number;
	notes: { pitch: number; at: number; end: number }[];
	harmonies: { text: string; at: number }[];
};

function attributes(el: string, s: State): void {
	if (el.includes("<divisions>")) s.divisions = num(el, "divisions");
	if (el.includes("<transpose>"))
		s.transpose = num(el, "chromatic") + 12 * num(el, "octave-change");
}

function move(el: string, s: State): void {
	s.at += el.startsWith("<backup>") ? -num(el, "duration") : num(el, "duration");
	s.end = Math.max(s.end, s.at);
}

/** A note sounds from its onset: a chord member shares the note before's, a tie stop lengthens it. */
function note(el: string, s: State): void {
	const duration = num(el, "duration");
	if (!el.includes("<chord/>")) {
		s.onset = s.at;
		move(el, s);
	}
	const pitch = pitchOf(el, s.transpose);
	if (pitch === null) return;
	const tied = el.includes('<tie type="stop"/>')
		? s.notes.findLast((n) => n.pitch === pitch && n.end === s.onset)
		: undefined;
	if (tied) tied.end = s.onset + duration;
	else s.notes.push({ pitch, at: s.onset, end: s.onset + duration });
}

const ELEMENTS =
	/<attributes>[\s\S]*?<\/attributes>|<harmony>[\s\S]*?<\/harmony>|<note[ >][\s\S]*?<\/note>|<backup>[\s\S]*?<\/backup>|<forward>[\s\S]*?<\/forward>/g;

function element(el: string, s: State): void {
	if (el.startsWith("<attributes>")) attributes(el, s);
	else if (el.startsWith("<harmony>")) s.harmonies.push({ text: harmonyText(el), at: s.at });
	else if (el.startsWith("<note")) note(el, s);
	else move(el, s);
}

/** One part's sounding notes and harmonies, measure after measure in written order. */
export function sounding(xml: string, part = "P1"): Sounded {
	const body = xml.split(`<part id="${part}">`)[1]?.split("</part>")[0] ?? "";
	const s: State = {
		divisions: 1,
		transpose: 0,
		at: 0,
		end: 0,
		onset: 0,
		notes: [],
		harmonies: [],
	};
	for (const [measure = ""] of body.matchAll(/<measure [\s\S]*?<\/measure>/g)) {
		s.at = s.end;
		for (const [el = ""] of measure.matchAll(ELEMENTS)) element(el, s);
	}
	const q = (n: number) => quarters(n, s.divisions);
	return {
		notes: s.notes.map((n) => ({ pitch: n.pitch, at: q(n.at), length: q(n.end - n.at) })),
		harmonies: s.harmonies.map((h) => ({ text: h.text, at: q(h.at) })),
	};
}
