/**
 * What an export sounds, frozen: every later notation change must leave
 * each corpus chart's sounding notes and harmonies exactly as they are.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { exportMusicXml } from "../src/index.js";
import { corpus } from "./charts.js";
import { xmlOf } from "./helpers.js";
import { type Sounded, sounding } from "./sounding.js";

const fixture: Record<string, Record<string, Sounded>> = JSON.parse(
	readFileSync(new URL("fixtures/sounding.json", import.meta.url), "utf8"),
);

const measure = (body: string) =>
	`<score-partwise version="4.0"><part id="P1"><measure number="1">${body}</measure></part></score-partwise>`;
const note = (step: string, octave: number, duration: number, extra = "") =>
	`<note>${extra}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice><type>quarter</type></note>`;

describe("sounding", () => {
	test("notes with their onsets and lengths, in quarters", () => {
		expect(sounding(xmlOf("| {C4} / {E4} {G4} |")).notes).toEqual([
			{ pitch: 60, at: "0/1", length: "2/1" },
			{ pitch: 64, at: "2/1", length: "1/1" },
			{ pitch: 67, at: "3/1", length: "1/1" },
		]);
	});
	test("tied notes are one note", () => {
		expect(sounding(xmlOf("| {D2} | / |")).notes).toEqual([
			{ pitch: 38, at: "0/1", length: "8/1" },
		]);
	});
	test("a part's octave transposition sounds", () => {
		const xml = measure(
			`<attributes><divisions>1</divisions><transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose></attributes>${note("E", 3, 4)}`,
		);
		expect(sounding(xml).notes).toEqual([{ pitch: 40, at: "0/1", length: "4/1" }]);
	});
	test("backup returns the clock, for a second voice; notes come in the order they sound", () => {
		const xml = measure(
			`<attributes><divisions>1</divisions></attributes>${note("C", 5, 4)}<backup><duration>4</duration></backup>${note("C", 3, 2)}${note("G", 3, 2)}`,
		);
		expect(sounding(xml).notes).toEqual([
			{ pitch: 48, at: "0/1", length: "2/1" },
			{ pitch: 72, at: "0/1", length: "4/1" },
			{ pitch: 55, at: "2/1", length: "2/1" },
		]);
	});
	test("harmonies with their onsets", () => {
		expect(sounding(xmlOf("| G D |")).harmonies).toEqual([
			{ text: "G", at: "0/1" },
			{ text: "D", at: "2/1" },
		]);
	});
	for (const [name, text] of corpus())
		test(`${name} sounds as it did`, () => {
			const r = exportMusicXml(text);
			if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
			const parts = [...r.xml.matchAll(/<part id="(P\d+)">/g)].map((m) => m[1] ?? "");
			expect(Object.fromEntries(parts.map((p) => [p, sounding(r.xml, p)]))).toEqual(
				fixture[name] ?? {},
			);
		});
});
