/**
 * A small MusicXML player for the tests: it follows repeats, endings and
 * jumps as a notation program plays them, and reports what it played. The
 * export's play order must equal the parser's (`expected`).
 */
import { type ChordRecord, type PlayedBar, parseChart, type Slot } from "barmark";

type PlayedOrder = { shown: number[]; harmony: string[] };

type M = {
	shown: number;
	harmony: string[];
	forward: boolean;
	backward: { times: number } | null;
	ending: { numbers: number[]; start: boolean; stop: boolean } | null;
	sound: Record<string, string>;
};

const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

const noteName = (step: string, alter: number) =>
	step + (alter > 0 ? "#".repeat(alter) : "b".repeat(-alter));

const match = (re: RegExp, body: string) => re.exec(body) ?? [];

/** A harmony as barmark spells it: root, the kind's text, and a slash bass. */
export function harmonyText(body: string): string {
	const [, kindText = "", kind] = match(/<kind text="([^"]*)">([^<]*)<\/kind>/, body);
	if (kind === "none") return kindText;
	const [, step = "", alter = "0"] = match(
		/<root-step>(\w)<\/root-step>(?:<root-alter>(-?\d+)<\/root-alter>)?/,
		body,
	);
	const [bass, bassStep = "", bassAlter = "0"] = match(
		/<bass-step>(\w)<\/bass-step>(?:<bass-alter>(-?\d+)<\/bass-alter>)?/,
		body,
	);
	const slash = bass ? `/${noteName(bassStep, Number(bassAlter))}` : "";
	return `${noteName(step, Number(alter))}${kindText}${slash}`;
}

const harmonies = (m: string) =>
	[...m.matchAll(/<harmony>([\s\S]*?)<\/harmony>/g)].map((h) => harmonyText(h[1] ?? ""));

/** The measure's ending marks, from its bar lines. */
function endingOf(m: string): M["ending"] {
	const ends = [...m.matchAll(/<ending [^>]*>/g)].map((e) => e[0]);
	const [first] = ends;
	if (!first) return null;
	return {
		numbers: (attr(first, "number") ?? "").split(/,\s*/).map(Number),
		start: ends.some((e) => attr(e, "type") === "start"),
		stop: ends.some((e) => /type="(stop|discontinue)"/.test(e)),
	};
}

/** Every <sound> attribute in the measure. */
function soundOf(m: string): Record<string, string> {
	const sound: Record<string, string> = {};
	for (const [, attrs = ""] of m.matchAll(/<sound ([^>]*)\/>/g))
		for (const [, name = "", value = ""] of attrs.matchAll(/(\w+)="([^"]*)"/g)) sound[name] = value;
	return sound;
}

function readMeasure(m: string): M {
	const backward = /<repeat direction="backward"[^>]*>/.exec(m)?.[0];
	return {
		shown: Number(/<measure [^>]*text="(\d+)"/.exec(m)?.[1]),
		harmony: harmonies(m),
		forward: m.includes('<repeat direction="forward"/>'),
		// No times: an open repeat, played once (as the parser counts it).
		backward: backward ? { times: Number(attr(backward, "times") ?? 1) } : null,
		ending: endingOf(m),
		sound: soundOf(m),
	};
}

/** The highest pass of the endings that start at `i`: the pass taken after a jump. */
function lastPass(ms: M[], i: number): number {
	let max = 0;
	for (let j = i; j < ms.length && ms[j]?.ending?.start; ) {
		max = Math.max(max, ...(ms[j]?.ending?.numbers ?? []));
		while (j < ms.length && !ms[j]?.ending?.stop) j++;
		j++;
	}
	return max;
}

type State = { jumped: boolean; start: number; passes: Map<number, number> };

const at = (ms: M[], name: string, value: string | undefined) =>
	ms.findIndex((x) => x.sound[name] === value);

/** To Coda and Fine after the jump, and the jump itself: where play goes, null to stop, undefined for neither. */
function jump(ms: M[], m: M, s: State): number | null | undefined {
	if (s.jumped) {
		if (m.sound.tocoda) return at(ms, "coda", m.sound.tocoda);
		return m.sound.fine ? null : undefined;
	}
	if (!m.sound.dalsegno && !m.sound.dacapo) return undefined;
	s.jumped = true;
	return m.sound.dacapo ? 0 : at(ms, "segno", m.sound.dalsegno);
}

/** The end of a measure: a jump, else a backward repeat (repeats play once after the jump), else on. */
function next(ms: M[], i: number, s: State): number | null {
	const m = ms[i] as M;
	const to = jump(ms, m, s);
	if (to !== undefined) return to;
	if (!m.backward || s.jumped) return i + 1;
	const pass = s.passes.get(s.start) ?? 1;
	if (pass < m.backward.times) {
		s.passes.set(s.start, pass + 1);
		return s.start;
	}
	s.passes.delete(s.start);
	return i + 1;
}

const stops = (m: M | undefined) => m?.ending?.stop === true;

/** Where play goes from an ending this pass doesn't take: past its last measure. Null when it takes it. */
function skipEnding(ms: M[], i: number, s: State): number | null {
	const ending = (ms[i] as M).ending;
	if (!ending?.start) return null;
	const pass = s.jumped ? lastPass(ms, i) : (s.passes.get(s.start) ?? 1);
	if (ending.numbers.includes(pass)) return null;
	let j = i;
	while (j < ms.length && !stops(ms[j])) j++;
	return j + 1;
}

/** Plays one part of the score (P1 by default). */
export function play(xml: string, part = "P1"): PlayedOrder {
	const body = xml.split(`<part id="${part}">`)[1]?.split("</part>")[0] ?? "";
	const ms = (body.match(/<measure [\s\S]*?<\/measure>/g) ?? []).map(readMeasure);
	const out: PlayedOrder = { shown: [], harmony: [] };
	const s: State = { jumped: false, start: 0, passes: new Map() };
	let i: number | null = 0;
	for (let guard = 0; i !== null && i < ms.length && guard < 10000; guard++) {
		const m = ms[i] as M;
		if (m.forward) s.start = i;
		const skip = skipEnding(ms, i, s);
		if (skip !== null) {
			i = skip;
			continue;
		}
		out.shown.push(m.shown);
		out.harmony.push(...m.harmony);
		i = next(ms, i, s);
	}
	return out;
}

const symbols = (slots: Slot[]): string[] =>
	slots
		.flatMap((s) => (s.kind === "group" ? s.members : [s]))
		.flatMap((s) => {
			if (s.kind === "nc") return ["N.C."];
			return s.kind === "chord" && s.chord.kind === "chord"
				? [(s.chord as ChordRecord).canonical]
				: [];
		});

/** What the parser plays: each bar's written number, and the chord symbols in order. */
export const expected = (text: string) => expectedBars(parseChart(text).bars);

export function expectedBars(bars: PlayedBar[]): PlayedOrder {
	return {
		shown: bars.map((b) => b.written),
		harmony: bars.flatMap((b) => (b.tacet ? [] : symbols(b.slots))),
	};
}
