/**
 * `/` holds whatever was sounding (grammar 2.3): a note set's notes tie on,
 * a rest stays a rest, and only a chord's hold is a slash.
 */
import { describe, expect, test } from "bun:test";
import { measures, notes, xmlOf } from "./helpers.js";

/** A note's pitch, or `/` for a slash and `r` for a rest. */
function what(n: string): string {
	if (n.includes("<rest")) return "r";
	if (n.includes("<notehead>slash</notehead>")) return "/";
	const pitch = /<step>(\w)<\/step>(?:<alter>-?\d<\/alter>)?<octave>(\d)/.exec(n);
	return `${pitch?.[1]}${pitch?.[2]}`;
}

const tied = (n: string, type: "start" | "stop") =>
	n.includes(`<tie type="${type}"/>`) ? "~" : "";

/** Each note as what it is and its type, `+` for a chord member, `~` around ties and `.` for a dot. */
const read = (measure: string) =>
	notes(measure).map((n) => {
		const type = /<type>(\w+)<\/type>/.exec(n)?.[1];
		const chord = n.includes("<chord/>") ? "+" : "";
		const dot = n.includes("<dot/>") ? "." : "";
		return `${chord}${tied(n, "stop")}${what(n)}${tied(n, "start")}:${type}${dot}`;
	});

describe("holds", () => {
	test("a hold in the same bar lengthens the note set it holds", () => {
		const [m = ""] = measures(xmlOf("| {G2} / {D2} / |"));
		expect(read(m)).toEqual(["G2:half", "D2:half"]);
		const [eighths = ""] = measures(xmlOf("| {G2} / / {G2} {D2} / {G2} / |"));
		expect(read(eighths)).toEqual(["G2:quarter.", "G2:eighth", "D2:quarter", "G2:quarter"]);
	});
	test("a chord of notes is held whole", () => {
		const [m = ""] = measures(xmlOf("| {C4 E4} / |"));
		expect(read(m)).toEqual(["C4:whole", "+E4:whole"]);
	});
	test("a voicing's hold lengthens its notes, with no second harmony", () => {
		const [m = ""] = measures(xmlOf("| G{G3 B3} / / / |"));
		expect(read(m)).toEqual(["G3:whole", "+B3:whole"]);
		expect(m.match(/<harmony>/g)).toHaveLength(1);
	});
	test("words before a hold keep it a note of its own, tied", () => {
		const [m = ""] = measures(xmlOf('| {G2} "let ring" / |'));
		expect(read(m)).toEqual(["G2~:half", "~G2:half"]);
	});
	test("a held note set ties across bar lines, and its bars are not slashed", () => {
		const [one = "", two = "", three = ""] = measures(xmlOf("| {D2} | / | / |"));
		expect(read(one)).toEqual(["D2~:whole"]);
		expect(read(two)).toEqual(["~D2~:whole"]);
		expect(read(three)).toEqual(["~D2:whole"]);
		expect(two).not.toContain('<slash type="start"');
		expect(two).not.toContain("<notehead>slash</notehead>");
	});
	test("a hold after a silence is a rest", () => {
		const [m = ""] = measures(xmlOf("| G -- / / |"));
		expect(read(m)).toEqual(["/:quarter", "r:quarter", "r:half"]);
	});
	test("a hold after a chord stays a slash", () => {
		const ms = measures(xmlOf("| {C4} G / / | / |"));
		expect(read(ms[0] ?? "")).toEqual(["C4:quarter", "/:quarter", "/:quarter", "/:quarter"]);
		expect(read(ms[1] ?? "")).toEqual(["/:quarter", "/:quarter", "/:quarter", "/:quarter"]);
	});
});
