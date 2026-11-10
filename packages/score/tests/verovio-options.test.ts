/**
 * The option limits: @barmark/engraver is built for what score asks of
 * Verovio (Leipzig only, footer "none", no tablature tunings, no .mxl), so
 * score must never ask for more. A fake toolkit records every call.
 */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { exportMusicXml } from "@barmark/musicxml";
import { VerovioToolkit } from "verovio/esm";
import { engraverCorpus } from "../../../scripts/engraver-corpus.js";
import { engraveChart, LAYOUT } from "../src/engrave.js";

const ALLOWED = [
	"adjustPageHeight",
	"breaks",
	"footer",
	"header",
	"justifyVertically",
	"pageHeight",
	"pageWidth",
	"scale",
	"svgViewBox",
];

test("LAYOUT, scale and pageWidth stay within what @barmark/engraver supports", () => {
	expect([...Object.keys(LAYOUT), "scale", "pageWidth"].sort()).toEqual(ALLOWED);
});

test("no footer, no font, no tuning or tablature option", () => {
	expect(LAYOUT.footer).toBe("none");
	expect(Object.keys(LAYOUT).filter((k) => /^font|tuning|tab/i.test(k))).toEqual([]);
});

test("over the corpus, engraveChart calls only setOptions, loadData (MusicXML text), getPageCount and renderToSVG", () => {
	const calls = new Set<string>();
	const loads: string[] = [];
	const optionKeys = new Set<string>();
	const fake = {
		setOptions: (o: object) => {
			calls.add("setOptions");
			for (const k of Object.keys(o)) optionKeys.add(k);
		},
		loadData: (d: string) => {
			calls.add("loadData");
			loads.push(d);
			return true;
		},
		getPageCount: () => {
			calls.add("getPageCount");
			return 1;
		},
		renderToSVG: () => {
			calls.add("renderToSVG");
			return "<svg/>";
		},
	};
	const recorded = new Proxy(fake, {
		get: (t, k) => {
			if (!(k in t)) throw new Error(`unexpected call: ${String(k)}`);
			return t[k as keyof typeof t];
		},
	});
	for (const [, text] of engraverCorpus()) engraveChart(recorded as never, text, { width: 375 });
	expect([...calls].sort()).toEqual(["getPageCount", "loadData", "renderToSVG", "setOptions"]);
	expect([...optionKeys].sort()).toEqual(ALLOWED);
	expect(loads.every((d) => d.startsWith("<?xml"))).toBe(true);
});

test("the corpus's MusicXML asks for no tuning and no music font", () => {
	let exported = 0;
	for (const [name, text] of engraverCorpus()) {
		const r = exportMusicXml(text);
		if (!r.ok) continue;
		exported++;
		expect({
			name,
			tuning: r.xml.includes("<staff-tuning"),
			font: r.xml.includes("<music-font"),
		}).toEqual({ name, tuning: false, font: false });
	}
	// Not vacuous: a corpus whose every export failed would check nothing.
	expect(exported).toBeGreaterThan(0);
});

// Every toolkit method, from Verovio itself, so a method added upstream is covered too.
const METHODS = Object.getOwnPropertyNames(VerovioToolkit.prototype).filter(
	(m) => m !== "constructor",
);
const SRC = new URL("../src/", import.meta.url);
/** Score's other sources and the CLI's score command, each with the toolkit methods it may call. */
const OTHERS: [file: URL, allowed: string[]][] = [
	...readdirSync(SRC)
		.filter((f) => f.endsWith(".ts") && f !== "engrave.ts")
		.map((f): [URL, string[]] => [new URL(f, SRC), f === "worker.ts" ? ["getVersion"] : []]),
	[new URL("../../cli/src/score.ts", import.meta.url), []],
];

test("only engrave.ts calls Verovio's toolkit, but for the worker's getVersion", () => {
	expect(METHODS).toContain("setOptions");
	const found = OTHERS.flatMap(([file, allowed]) => {
		const source = readFileSync(file, "utf8");
		return METHODS.filter((m) => !allowed.includes(m))
			.filter((m) => new RegExp(`\\.\\s*${m}\\s*\\(|\\[\\s*["'\`]${m}["'\`]\\s*\\]`).test(source))
			.map((m) => `${file.pathname.split("/packages/")[1]}: ${m}`);
	});
	expect(found).toEqual([]);
});
