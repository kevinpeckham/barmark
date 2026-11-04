/** Eighths and shorter beam within a beat; in 4/4 a beat pair of plain eighths beams within its half bar. */
import { describe, expect, test } from "bun:test";
import { measures, notes, xmlOf } from "./helpers.js";

/** Each note's beams, level by level ("" for none): `begin`, `begin+begin`, … */
const beams = (text: string, bar = 0) =>
	notes(measures(xmlOf(text))[bar] ?? "")
		.filter((n) => !n.includes("<chord/>"))
		.map((n) => [...n.matchAll(/<beam number="\d">([^<]+)<\/beam>/g)].map((b) => b[1]).join("+"));

describe("beams", () => {
	test("4/4: eight eighths beam in two halves", () => {
		expect(beams("| {C4} {D4} {E4} {F4} {G4} {A4} {B4} {C5} |")).toEqual([
			"begin",
			"continue",
			"continue",
			"end",
			"begin",
			"continue",
			"continue",
			"end",
		]);
	});
	test("3/4: six eighths beam in pairs", () => {
		expect(beams("time: 3/4\n| {C4} {D4} {E4} {F4} {G4} {A4} |")).toEqual([
			"begin",
			"end",
			"begin",
			"end",
			"begin",
			"end",
		]);
	});
	test("6/8: six eighths beam in threes", () => {
		expect(beams("time: 6/8\n| {C4} {D4} {E4} {F4} {G4} {A4} |")).toEqual([
			"begin",
			"continue",
			"end",
			"begin",
			"continue",
			"end",
		]);
	});
	test("sixteenths beam on two levels", () => {
		expect(beams("| {C4}_{D4}_{E4}_{F4} {G4} {A4} {B4} |")).toEqual([
			"begin+begin",
			"continue+continue",
			"continue+continue",
			"end+end",
			"",
			"",
			"",
		]);
	});
	test("a rest breaks a beam", () => {
		expect(beams("| {C4}_--_{E4}_{F4} {G4} {A4} {B4} |")).toEqual([
			"",
			"",
			"begin+begin",
			"end+end",
			"",
			"",
			"",
		]);
	});
	test("a quarter in a half bar keeps its eighths to their beat", () => {
		expect(beams("| {C4}_{D4} {E4} {F4} {G4} |")).toEqual(["begin", "end", "", "", ""]);
	});
	test("a triplet of eighths beams together", () => {
		expect(beams("| {C4}_{D4}_{E4} {F4} {G4} {A4} |")).toEqual([
			"begin",
			"continue",
			"end",
			"",
			"",
			"",
		]);
	});
	test("a dotted eighth and a sixteenth: the sixteenth hooks back", () => {
		expect(beams("| {C4}_/_/_{D4} {E4} {F4} {G4} |")).toEqual([
			"begin",
			"end+backward hook",
			"",
			"",
			"",
		]);
	});
	test("an eighth alone is not beamed", () => {
		expect(beams("| D / / /_G |")).toEqual(["", "", ""]);
	});
	test("stemless slashes are not beamed", () => {
		expect(beams("| C / /_/ / |")).toEqual(["", "", "", "", ""]);
	});
	test("a chord's beam is written once, on its first note", () => {
		const ns = notes(measures(xmlOf("| {C4 E4}_{D4 F4} {G4} {A4} {B4} |"))[0] ?? "");
		expect(ns.filter((n) => n.includes("<beam")).length).toBe(2);
	});
});
