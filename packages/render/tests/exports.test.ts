/** What drawers other than HTML (a PDF, a canvas) need from the renderer (issue #151). */
import { expect, test } from "bun:test";
import { parseChord } from "barmark";
import * as render from "../src/index.js";
import { layoutChart } from "../src/index.js";

test("the chord typesetting is exported: typesetChord, glyphs, typesetNumeral and NUMERALS", () => {
	expect(typeof render.typesetChord).toBe("function");
	expect(typeof render.glyphs).toBe("function");
	expect(typeof render.typesetNumeral).toBe("function");
	expect(render.NUMERALS).toEqual(["nashville", "roman"]);
	const parsed = parseChord("F#m7/C#");
	if (!parsed.ok || !parsed.value.parts) throw new Error("F#m7/C# should parse");
	expect(render.typesetChord(parsed.value.parts)).toEqual(
		expect.objectContaining({ root: expect.stringContaining("♯") }),
	);
	expect(render.glyphs("Bb")).toBe("B♭");
});

test("a section block counts its bars beside its columns: fermata, direction and rehearsal cells aren't bars", () => {
	const block = layoutChart("## A\n| C | ... | G | @A | D |").blocks[0];
	expect(block?.columns).toBe(5);
	expect(block?.bars).toBe(3);
});
