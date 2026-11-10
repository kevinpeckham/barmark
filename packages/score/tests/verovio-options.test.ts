/**
 * The option limits: @barmark/engraver is built for what score asks of
 * Verovio (Leipzig only, footer "none", no tablature tunings, no .mxl), so
 * score must never ask for more. A fake toolkit records every call.
 */
import { expect, test } from "bun:test";
import { exportMusicXml } from "@barmark/musicxml";
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
	for (const [name, text] of engraverCorpus()) {
		const r = exportMusicXml(text);
		if (!r.ok) continue;
		expect({
			name,
			tuning: r.xml.includes("<staff-tuning"),
			font: r.xml.includes("<music-font"),
		}).toEqual({ name, tuning: false, font: false });
	}
});
