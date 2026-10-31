import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fontFaceCss, renderChart } from "../src/index.js";

const fonts = join(import.meta.dir, "../fonts");

describe("the font ships unmodified", () => {
	test("Edwin-Roman.otf is byte for byte MuseScore's (OFL: a modified font may not be called Edwin)", () => {
		const sha = createHash("sha256")
			.update(readFileSync(join(fonts, "Edwin-Roman.otf")))
			.digest("hex");
		expect(sha).toBe("edf9bddcdf7a62d0d799151d863556cf5e0958ad0a01e9f1d46afbaaa5a36e1c");
	});
	test("with its licence and the Reserved Font Name notice", () => {
		const ofl = readFileSync(join(fonts, "OFL.txt"), "utf8");
		expect(ofl).toContain('Reserved Font Name "Edwin"');
		expect(ofl).toContain("SIL Open Font License, Version 1.1");
	});
});

describe("fontFaceCss", () => {
	test("one @font-face rule naming the family barmark Edwin", () => {
		const css = fontFaceCss("/fonts/Edwin-Roman.otf");
		expect(css.match(/@font-face/g)?.length).toBe(1);
		expect(css).toContain('font-family:"barmark Edwin"');
		expect(css).toContain('url("/fonts/Edwin-Roman.otf")');
	});
	test("a URL cannot break out of the rule", () => {
		expect(fontFaceCss('x") } body { color: red } @import url("y')).not.toContain('") }');
	});
});

describe("renderChart's fontUrl", () => {
	test("emits the rule once, before the chart", () => {
		const html = renderChart("| D |", { fontUrl: "/f.otf" });
		expect(html.match(/@font-face/g)?.length).toBe(1);
		expect(html.indexOf("@font-face")).toBeLessThan(html.indexOf("<barmark-chart"));
	});
	test("without it there is no @font-face", () => {
		expect(renderChart("| D |")).not.toContain("@font-face");
	});
});
