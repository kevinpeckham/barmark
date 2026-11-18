import { describe, expect, test } from "bun:test";
import { exportMusicXml } from "@barmark/musicxml";
import { engraveChart, forVerovio } from "../src/engrave.js";
import { loadToolkit } from "./helpers/toolkit.js";

const HIDDEN = '<degree print-object="no"><degree-value>7</degree-value></degree>';
const SHOWN = "<degree><degree-value>9</degree-value></degree>";

describe("forVerovio", () => {
	test("drops a hidden degree and keeps a printed one", () => {
		expect(forVerovio(`<harmony>${HIDDEN}${SHOWN}${HIDDEN}</harmony>`)).toBe(
			`<harmony>${SHOWN}</harmony>`,
		);
	});

	test("leaves an opener with no closer as it is", () => {
		const xml = `<a>${HIDDEN}<degree print-object="no"><b/></a>`;
		expect(forVerovio(xml)).toBe('<a><degree print-object="no"><b/></a>');
	});

	test("takes linear time on many openers with no closer", () => {
		const xml = '<degree print-object="no">'.repeat(200_000);
		const start = performance.now();
		expect(forVerovio(xml)).toBe(xml);
		expect(performance.now() - start).toBeLessThan(500);
	});
});

/** A lyric row with no melody: the export gives it a one-line rhythm staff of slashes. */
const LYRIC_ROW =
	"# T\nkey: G, time: 3/4\n\n        | G          | C           |\nlyrics: | maz- / ing | grace / how |\n";
const AT_MIDDLE =
	"<unpitched><display-step>B</display-step><display-octave>4</display-octave></unpitched>";
const ON_LINE =
	"<unpitched><display-step>E</display-step><display-octave>4</display-octave></unpitched>";
const ledgers = (svg: string) => svg.match(/class="ledgerLines/g)?.length ?? 0;

describe("forVerovio: a rhythm staff's slash sits on its line", () => {
	test("the export writes a lyric row's slashes at the middle of a five-line staff", () => {
		// The rewrite below matches this text exactly: if the export changes it, this fails first.
		const exported = exportMusicXml(LYRIC_ROW);
		expect(exported.ok && exported.xml.split(AT_MIDDLE).length - 1).toBe(4);
	});

	test("moves each one to the line Verovio draws for a one-line staff", () => {
		const note = (at: string) => `<note>${at}<duration>2</duration></note>`;
		expect(forVerovio(note(AT_MIDDLE) + note(AT_MIDDLE))).toBe(note(ON_LINE) + note(ON_LINE));
	});

	test("leaves a pitched B4 and any other unpitched position alone", () => {
		const pitched = "<note><pitch><step>B</step><octave>4</octave></pitch></note>";
		const other =
			"<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched></note>";
		expect(forVerovio(pitched + other)).toBe(pitched + other);
	});

	test("engraved, a lyric row has no ledger lines; read as exported, Verovio draws them", async () => {
		const vrv = await loadToolkit();
		const exported = exportMusicXml(LYRIC_ROW);
		if (!exported.ok) throw new Error("the lyric row did not export");
		// The fault this guards: Verovio puts a one-line staff's line where a treble staff has E4.
		expect(vrv.loadData(exported.xml)).toBeTruthy();
		expect(ledgers(vrv.renderToSVG(1))).toBeGreaterThan(0);
		const engraved = engraveChart(vrv, LYRIC_ROW, { width: 800 });
		if (!engraved.ok) throw new Error(engraved.reason);
		expect(ledgers(engraved.svg)).toBe(0);
	});
});
