/** Directions: words, marks and sounds above or below a measure (tempo, feel, jumps, text lines). */
import { beatsOf, type Direction, type Meter } from "barmark";
import type { Measure } from "./measures.js";
import { el, text } from "./xml.js";

const direction = (types: string, sound = "", placement = "above") =>
	el("direction", { placement }, [el("direction-type", {}, types), sound]);

/**
 * A mark of the whole score (a heading, a rehearsal mark, tempo, feel, a
 * jump), written in the top part only: Dorico ignores MusicXML 4.0's
 * `system` and shows a mark written in every part over every staff.
 * `system="only-top"` stays for the programs that read it. `offset` (in
 * divisions) moves it from where it is written.
 */
export const scoreDirection = (types: string, sound = "", offset?: number) =>
	el("direction", { placement: "above", system: "only-top" }, [
		el("direction-type", {}, types),
		offset === undefined ? "" : text("offset", offset),
		sound,
	]);

/**
 * Text from the chart, with every word "a" held to the next by a no-break
 * space: Dorico reads a lone "a" as the article in "a tempo" and drops it,
 * at the start ("A" vanishes, "A section" shows "section") and mid-sentence
 * ("every note a quarter." shows "every note  quarter."). A word is
 * whatever whitespace delimits, and the whitespace after an "a" (a tab too)
 * becomes the no-break space, so "a.k.a." and "(a)" are written as they are.
 */
export const ownText = (s: string) => s.replace(/(?<!\S)([Aa])(?:\s|$)/g, "$1\u00a0");

export const wordsXml = (words: string) => direction(text("words", ownText(words)));

const JUMP_WORDS = { start: "D.C.", segno: "D.S." };
const AL_WORDS = { fine: " al Fine", coda: " al Coda" };

/** Segno, Coda, To Coda, Fine and the jump, each with the <sound> that plays it. */
export function jumpXml(d: Direction): string {
	if (d.kind === "segno") return scoreDirection(el("segno"), el("sound", { segno: "s1" }));
	if (d.kind === "coda") return scoreDirection(el("coda"), el("sound", { coda: "c1" }));
	if (d.kind === "to coda")
		return scoreDirection(text("words", "To Coda"), el("sound", { tocoda: "c1" }));
	if (d.kind === "fine") return scoreDirection(text("words", "Fine"), el("sound", { fine: "yes" }));
	const words = JUMP_WORDS[d.to] + (d.al ? AL_WORDS[d.al] : "");
	return scoreDirection(
		text("words", words),
		el("sound", d.to === "start" ? { dacapo: "yes" } : { dalsegno: "s1" }),
	);
}

/** 6/8, 9/8 and 12/8 only (grammar 2.1): barmark's own rule, where a beat is three of the bottom note. */
const compound = (m: Meter) => beatsOf(m) !== m.n;
const UNITS: Record<number, string> = {
	1: "whole",
	2: "half",
	4: "quarter",
	8: "eighth",
	16: "16th",
	32: "32nd",
};

/** The beat `tempo:` counts (grammar 2.1): the bottom number, or a dotted note in compound meters. */
function beatXml(m: Meter): string {
	if (!compound(m)) return text("beat-unit", UNITS[m.d] ?? "quarter");
	return text("beat-unit", UNITS[m.d / 2] ?? "quarter") + el("beat-unit-dot");
}

/** <sound tempo> counts quarter notes a minute. */
function soundTempo(bpm: number, m: Meter): string {
	const quarters = (4 * m.n) / (m.d * beatsOf(m));
	return el("sound", { tempo: Number((bpm * quarters).toFixed(2)) });
}

const metronome = (bpm: number, m: Meter) =>
	scoreDirection(el("metronome", {}, [beatXml(m), text("per-minute", bpm)]), soundTempo(bpm, m));

/** The meter `tempo:` counts: the `time:` in force, also in a one-bar meter (grammar 2.4). */
const tempoMeter = (m: Measure) => m.time ?? m.meter;

const sameChange = (a: Measure | null, b: Measure | null) =>
	a?.tempoChange?.kind === b?.tempoChange?.kind && a?.tempoChange?.to === b?.tempoChange?.to;

/** A gradual change: its words where it starts, and its target tempo on its last bar. */
function changeXml(m: Measure, prev: Measure | null, next: Measure | null): string {
	const change = m.tempoChange;
	if (!change) return "";
	const words = sameChange(m, prev)
		? ""
		: scoreDirection(text("words", change.kind === "rit" ? "rit." : "accel."));
	const target =
		change.to !== null && !sameChange(m, next) ? soundTempo(change.to, tempoMeter(m)) : "";
	return words + target;
}

/** A tempo where it is set or changes; "a tempo" where a change returns to it. */
export function tempoXml(m: Measure, prev: Measure | null, next: Measure | null): string {
	if (m.tempoChange) return changeXml(m, prev, next);
	if (m.tempo === null || (prev && prev.tempo === m.tempo && !prev.tempoChange)) return "";
	if (prev?.tempoChange && prev.tempo === m.tempo)
		return scoreDirection(text("words", "a tempo"), soundTempo(m.tempo, tempoMeter(m)));
	return metronome(m.tempo, tempoMeter(m));
}

const feelName = (m: Measure) =>
	m.swingPercent === undefined ? m.feel : `${m.feel} ${m.swingPercent}%`;

function swingXml(m: Measure): string {
	if (m.feel === "straight") return el("swing", {}, el("straight"));
	const p = m.swingPercent === undefined ? null : Math.round(m.swingPercent);
	return el("swing", {}, [
		text("first", p ?? 2),
		text("second", p === null ? 1 : 100 - p),
		text("swing-type", m.feel === "swing 16" ? "16th" : "eighth"),
		m.feel === "shuffle" ? text("swing-style", "shuffle") : "",
	]);
}

/** The feel where it is set (a straight start is the default, and not written). */
export function feelXml(m: Measure, prev: Measure | null): string {
	if (prev ? feelName(prev) === feelName(m) : m.feel === "straight") return "";
	return scoreDirection(text("words", feelName(m)), el("sound", {}, swingXml(m)));
}

/** Lyric, note and prose lines, below the measure; `###` notes in italics. */
export const textXml = (lines: Measure["text"]) =>
	lines
		.map((l) =>
			direction(
				text("words", ownText(l.text), l.note ? { "font-style": "italic" } : {}),
				"",
				"below",
			),
		)
		.join("");
