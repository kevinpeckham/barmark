/**
 * scripts/dorico-compare.ts, the comparison behind scripts/dorico-midi.ts
 * (Dorico's MusicXML from a MIDI import against what the file plays), on
 * hand-built MusicXML. Here because the root `bun test` runs packages/ only.
 */
import { describe, expect, test } from "bun:test";
import {
	compareFile,
	formatReport,
	matchNotes,
	type Note,
	readMusicXml,
	TOLERANCE,
} from "../../../scripts/dorico-compare.js";
import { DORICO_CHARTS } from "../../../scripts/dorico-midi-charts.js";
import { exportMidi } from "../src/index.js";
import type { Performance, PerformedTrack } from "../src/perform/index.js";

/** A score-partwise of the given parts (`[name, measures xml]`). */
const score = (...parts: [string, string][]) =>
	`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list>${parts
		.map(([name], i) => `<score-part id="P${i + 1}"><part-name>${name}</part-name></score-part>`)
		.join("")}</part-list>${parts
		.map(([, body], i) => `<part id="P${i + 1}">${body}</part>`)
		.join("")}</score-partwise>`;

const note = (step: string, octave: number, duration: number, extra = "") =>
	`<note>${extra.includes("<chord/>") ? "<chord/>" : ""}<pitch><step>${step}</step>${
		extra.includes("alter") ? "<alter>1</alter>" : ""
	}<octave>${octave}</octave></pitch><duration>${duration}</duration>${extra.replace("<chord/>", "").replace("alter", "")}</note>`;
const rest = (duration: number) => `<note><rest/><duration>${duration}</duration></note>`;
const ATTRS = (time = "4/4", fifths = 0, extra = "") => {
	const [beats, type] = time.split("/");
	return `<attributes><divisions>2</divisions><key><fifths>${fifths}</fifths><mode>major</mode></key><time><beats>${beats}</beats><beat-type>${type}</beat-type></time>${extra}</attributes>`;
};

describe("readMusicXml", () => {
	test("notes in quarters from the start, chords, a second voice, ties merged, rests and grace notes left out", () => {
		const xml = score([
			"Piano",
			`<measure number="1">${ATTRS()}${note("C", 4, 2)}${note("E", 4, 2, "<chord/>")}${note("G", 4, 6, '<tie type="start"/>')}<backup><duration>8</duration></backup>${note("C", 3, 8)}</measure>` +
				`<measure number="2"><note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>${note("G", 4, 2, '<tie type="stop"/>')}${note("F", 4, 6, "alter")}</measure>`,
		]);
		const s = readMusicXml(xml);
		expect(s).not.toBeNull();
		const part = s?.parts[0];
		expect(part?.name).toBe("Piano");
		expect(part?.measures).toBe(2);
		expect(part?.notes).toEqual([
			{ pitch: 48, at: 0, length: 4 },
			{ pitch: 60, at: 0, length: 1 },
			{ pitch: 64, at: 0, length: 1 },
			{ pitch: 67, at: 1, length: 4 }, // tied over the bar line
			{ pitch: 66, at: 5, length: 3 },
		]);
	});

	test("a transposing part's written pitch is moved to sounding", () => {
		const xml = score([
			"Guitar",
			`<measure number="1">${ATTRS("4/4", 0, "<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>")}${note("E", 4, 8)}</measure>`,
		]);
		expect(readMusicXml(xml)?.parts[0]?.notes).toEqual([{ pitch: 52, at: 0, length: 4 }]);
	});

	test("time and key signatures, tempi, rehearsal marks, words and lyrics at their places", () => {
		const xml = score([
			"Voice",
			`<measure number="1">${ATTRS("3/4", -1)}<direction><direction-type><rehearsal>A</rehearsal></direction-type></direction><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type><sound tempo="100"/></direction>${note("C", 4, 2, '<lyric number="1"><syllabic>begin</syllabic><text>Shen</text></lyric>')}${note("D", 4, 4, '<lyric number="1"><syllabic>end</syllabic><text>an</text></lyric><lyric number="2"><text>long</text></lyric>')}</measure>` +
				`<measure number="2"><attributes><key><fifths>2</fifths><mode>minor</mode></key><time><beats>6</beats><beat-type>8</beat-type></time></attributes><direction><direction-type><words>Verse</words></direction-type><offset>2</offset></direction><direction><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>60</per-minute></metronome></direction-type></direction>${note("E", 4, 6)}</measure>`,
		]);
		const s = readMusicXml(xml);
		expect(s?.times).toEqual([
			{ at: 0, n: 3, d: 4 },
			{ at: 3, n: 6, d: 8 },
		]);
		expect(s?.keys).toEqual([
			{ at: 0, fifths: -1, minor: false },
			{ at: 3, fifths: 2, minor: true },
		]);
		expect(s?.tempos).toEqual([
			{ at: 0, qpm: 100 },
			{ at: 3, qpm: 90 },
		]);
		expect(s?.marks).toEqual([
			{ at: 0, kind: "rehearsal", text: "A" },
			{ at: 4, kind: "words", text: "Verse" },
		]);
		expect(s?.parts[0]?.lyrics).toEqual([
			{ at: 0, verse: 1, text: "Shen" },
			{ at: 1, verse: 1, text: "an" },
			{ at: 1, verse: 2, text: "long" },
		]);
	});

	test("not MusicXML: null", () => {
		expect(readMusicXml("<html/>")).toBeNull();
		expect(readMusicXml("not xml <")).toBeNull();
	});
});

describe("matchNotes", () => {
	const n = (pitch: number, at: number, length = 1): Note => ({ pitch, at, length });

	test("exact, within the tolerance, a length that differs, missing and extra", () => {
		const m = matchNotes(
			[n(60, 0), n(62, 1), n(64, 2), n(65, 3), n(67, 4)],
			[n(60, 0), n(62, 1 + TOLERANCE), n(64, 2, 0.5), n(67, 4.5), n(72, 0)],
		);
		expect(m.exact).toBe(1);
		expect(m.withinTolerance).toBe(1);
		expect(m.lengthDiffers).toEqual([{ expected: n(64, 2), found: n(64, 2, 0.5) }]);
		expect(m.missing).toEqual([n(65, 3), n(67, 4)]);
		expect(m.extra).toEqual([n(72, 0), n(67, 4.5)]);
	});

	test("each found note matches once, the nearest", () => {
		const m = matchNotes([n(60, 1), n(60, 1.1)], [n(60, 1.1), n(60, 1)]);
		expect(m.exact).toBe(2);
		expect(m.missing).toEqual([]);
		expect(m.extra).toEqual([]);
	});
});

const track = (
	name: string,
	notes: Note[],
	lyrics: PerformedTrack["lyrics"] = [],
): PerformedTrack => ({
	name,
	part: null,
	line: null,
	role: "line",
	program: 1,
	notes: notes.map((x) => ({
		pitch: x.pitch,
		at: { n: x.at * 2, d: 2 },
		length: { n: x.length * 2, d: 2 },
		velocity: 80,
	})),
	pedal: [],
	lyrics,
	words: [],
});

/** Two bars of 4/4 and one of 2/4, C major, 120 then 90, a marker. */
const PERF = (tracks: PerformedTrack[]): Performance => ({
	title: "T",
	credits: { composer: [], lyricist: [], arranger: [], copyright: [] },
	bars: [
		{ index: 1, at: { n: 0, d: 1 }, meter: { n: 4, d: 4 } },
		{ index: 2, at: { n: 4, d: 1 }, meter: { n: 4, d: 4 } },
		{ index: 3, at: { n: 8, d: 1 }, meter: { n: 2, d: 4 } },
	],
	tempos: [
		{ at: { n: 0, d: 1 }, qpm: 120 },
		{ at: { n: 4, d: 1 }, qpm: 90 },
	],
	keys: [{ at: { n: 0, d: 1 }, key: { tonic: "C", mode: "major" } }],
	markers: [{ at: { n: 0, d: 1 }, text: "Verse" }],
	tracks,
	end: { n: 10, d: 1 },
	losses: [],
});

describe("compareFile", () => {
	const melody = [
		{ pitch: 60, at: 0, length: 4 },
		{ pitch: 62, at: 4, length: 2 },
		{ pitch: 64, at: 6, length: 2 },
		{ pitch: 65, at: 8, length: 2 },
	];
	const xml = score(
		[
			"Piano",
			`<measure number="1">${ATTRS()}<direction><direction-type><rehearsal>Verse</rehearsal></direction-type></direction><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>${note("C", 4, 8, '<lyric number="1"><text>la</text></lyric>')}</measure>` +
				`<measure number="2">${note("D", 4, 4)}${note("E", 4, 3)}${rest(1)}</measure>` +
				`<measure number="3">${note("A", 4, 4)}</measure>`,
		],
		[
			"Strings",
			`<measure number="1">${ATTRS()}${rest(8)}</measure><measure number="2">${rest(8)}</measure><measure number="3">${rest(8)}</measure>`,
		],
	);
	const window = {
		tracks: [{ name: "Chart", destination: "Piano 1" }],
	};

	test("parts, measures, notes, signatures, tempi, markers and lyrics, kept or not", () => {
		const r = compareFile(
			"t",
			PERF([track("Chart", melody, [{ at: { n: 0, d: 1 }, verse: 1, text: "la " }])]),
			xml,
			window,
		);
		expect(r.playedBars).toBe(3);
		expect(r.tolerance).toBe(TOLERANCE);
		expect(r.parts).toHaveLength(1);
		const p = r.parts[0];
		expect(p).toMatchObject({ track: "Chart", part: "Piano", measures: 3 });
		expect(p?.notes).toMatchObject({ expected: 4, found: 4, exact: 2, withinTolerance: 0 });
		expect(p?.notes.lengthDiffers).toEqual([
			{ pitch: "E4", bar: 2, chartBar: 2, beat: 3, length: 2, found: { at: 6, length: 1.5 } },
		]);
		expect(p?.notes.missing).toEqual([{ pitch: "F4", bar: 3, chartBar: 3, beat: 1, length: 2 }]);
		expect(p?.notes.extra).toEqual([{ pitch: "A4", bar: 3, chartBar: 3, beat: 1, length: 2 }]);
		expect(p?.lyrics).toMatchObject({ kept: 1, changed: [], dropped: [] });
		expect(r.extraParts).toEqual(["Strings"]);
		// 2/4 in bar 3 is dropped: Dorico kept 4/4 (and made bar 3 a 4/4 bar)
		expect(r.time).toMatchObject({
			kept: 1,
			changed: [],
			dropped: [{ at: 8, bar: 3, value: "2/4" }],
		});
		expect(r.keys).toMatchObject({ kept: 1, dropped: [] });
		expect(r.tempos).toMatchObject({ kept: 1, dropped: [{ at: 4, bar: 2, value: "90" }] });
		expect(r.markers).toMatchObject({ kept: 1, dropped: [] });
		expect(r.importWindow).toEqual(window);
	});

	test("a changed lyric and a changed marker are named with what Dorico has", () => {
		const changed = xml
			.replace("<rehearsal>Verse</rehearsal>", "<rehearsal>A</rehearsal>")
			.replace("<text>la</text>", "<text>lo</text>");
		const r = compareFile(
			"t",
			PERF([track("Chart", melody, [{ at: { n: 0, d: 1 }, verse: 1, text: "la " }])]),
			changed,
			null,
		);
		expect(r.markers.changed).toEqual([{ at: 0, bar: 1, value: "Verse", found: "A" }]);
		expect(r.parts[0]?.lyrics.changed).toEqual([{ at: 0, bar: 1, value: "la", found: "lo" }]);
	});

	test("without the window, tracks with notes take Dorico's parts in order", () => {
		const r = compareFile("t", PERF([track("Empty", []), track("Chart", melody)]), xml, null);
		expect(r.parts.map((p) => [p.track, p.part])).toEqual([
			["Empty", null],
			["Chart", "Piano"],
		]);
	});

	test("the readable report states the tolerance and lists what's missing by bar and beat", () => {
		const text = formatReport(compareFile("t", PERF([track("Chart", melody)]), xml, window));
		expect(text).toContain("tolerance ±0.125 quarter");
		expect(text).toContain("missing F4 at bar 3 beat 1");
		expect(text).toContain("Chart → Piano 1");
		expect(text).toContain("2/4 at bar 3: dropped");
	});

	test("unreadable MusicXML is a report that says so", () => {
		const r = compareFile("t", PERF([track("Chart", melody)]), "nope", null);
		expect(r.error).toContain("MusicXML");
		expect(formatReport(r)).toContain("couldn't read");
	});
});

describe("the hand-written charts", () => {
	test("each exports with no error", () => {
		for (const [name, text] of DORICO_CHARTS) {
			const r = exportMidi(text);
			expect({
				name,
				ok: r.ok,
				errors: r.diagnostics.filter((d) => d.severity === "error"),
			}).toEqual({
				name,
				ok: true,
				errors: [],
			});
		}
	});
});
