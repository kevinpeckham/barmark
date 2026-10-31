import { describe, expect, test } from "bun:test";
import { readDocument } from "../../src/chart/document.js";
import type { Line } from "../../src/chart/types.js";
import { AT_A_GLANCE } from "./fixtures.js";

const only = (text: string): Line | undefined => readDocument(text).lines[0];
const suggestionFor = (text: string) => readDocument(text).diagnostics[0]?.suggestion;

describe("the spec's At a glance example", () => {
	const doc = readDocument(AT_A_GLANCE);
	test("title", () => expect(doc.title).toBe("Example Song"));
	test("line kinds in order", () => {
		expect(doc.lines.map((l) => l.kind)).toEqual([
			"title",
			"directive",
			"section",
			"bars",
			"section",
			"bars",
			"bars",
			"section",
			"bars",
			"bars",
			"section",
			"section",
			"section",
			"directive",
			"bars",
			"bars",
			"directive",
			"section",
			"bars",
		]);
	});
	test("one warning: the ? in the bridge", () => {
		expect(doc.diagnostics).toHaveLength(1);
		expect(doc.diagnostics[0]?.severity).toBe("warning");
		expect(doc.diagnostics[0]?.token).toBe("?");
	});
});

describe("headings", () => {
	test("repeat and elision", () => {
		expect(only("## Chorus x2 ->")).toEqual({
			kind: "section",
			line: 1,
			name: "Chorus",
			repeat: 2,
			elided: true,
		});
	});
	test("→ elides", () => {
		const l = only("## Chorus →");
		expect(l?.kind === "section" && l.elided).toBe(true);
	});
	test("open repeat on a heading", () => {
		const l = only("## Out x …");
		expect(l?.kind === "section" && l.repeat).toBe("open");
	});
	test("a name ending in x is not a repeat", () => {
		const l = only("## Box2");
		expect(l?.kind === "section" && l.name).toBe("Box2");
	});
	test("a heading with no name is an error", () => {
		const d = readDocument("## x2").diagnostics;
		expect(d.map((x) => x.severity)).toEqual(["error"]);
	});
	test("deeper headings are text", () => expect(only("### Notes")?.kind).toBe("text"));
	test("a second title is text with a warning", () => {
		const doc = readDocument("# One\n# Two");
		expect(doc.title).toBe("One");
		expect(doc.lines[1]?.kind).toBe("text");
		expect(doc.diagnostics.map((d) => [d.line, d.severity])).toEqual([[2, "warning"]]);
	});
});

describe("text-line warnings for old formats", () => {
	test("[Chorus]", () => expect(suggestionFor("[Chorus]")).toBe("## Chorus"));
	test("Chorus:", () => expect(suggestionFor("Chorus:")).toBe("## Chorus"));
	test("bare chords", () => expect(suggestionFor("D A Bm G")).toBe("| D | A | Bm | G |"));
	test("bpm:", () => expect(suggestionFor("bpm: 120")).toBe("tempo: 120"));
	test("meter: and groove:", () => {
		expect(suggestionFor("meter: 3/4")).toBe("time: 3/4");
		expect(suggestionFor("groove: swing")).toBe("feel: swing");
	});
	test("prose is left alone", () =>
		expect(readDocument("Watch for the cutoff").diagnostics).toEqual([]));
	test("text lines stay text", () => expect(only("D A Bm G")?.kind).toBe("text"));
});

describe("physical layout", () => {
	test("BOM, CRLF and tabs read like clean LF text", () => {
		const messy = readDocument("﻿# T\r\n\tkey: D\r\n| D |\r\n");
		const clean = readDocument("# T\nkey: D\n| D |\n");
		expect(messy).toEqual(clean);
		expect(messy.lines.map((l) => l.line)).toEqual([1, 2, 3]);
	});
	test("fences are ignored and their contents read", () => {
		const doc = readDocument("# T\n```barmark\n| D |\n```\n");
		expect(doc.lines.map((l) => [l.kind, l.line])).toEqual([
			["title", 1],
			["bars", 3],
		]);
	});
	test("blank lines count toward line numbers", () => {
		expect(readDocument("\n\n| D | Hm |").diagnostics[0]?.line).toBe(3);
	});
	test("a bar line with an error is kept only as invalid", () => {
		expect(readDocument("| D | Hm |\n| A |").lines.map((l) => [l.kind, l.line])).toEqual([
			["invalid", 1],
			["bars", 2],
		]);
	});
});
