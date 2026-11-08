import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";
import { cleanSvg, engraveChart, scorePane, scoreStyles } from "../src/index.js";

const vrv = new VerovioToolkit(await createVerovioModule());

const engrave = (text: string) => {
	const r = engraveChart(vrv, text, { width: 800 });
	if (!r.ok) throw new Error(r.reason);
	return r.svg;
};

const hostile = [
	"# <svg onload=alert(1)>",
	"",
	"| C | F |",
	"</text><script>x()</script>",
	'<a href="javascript:x">words</a>',
].join("\n");

describe("cleanSvg", () => {
	test("markup in chart text never becomes markup", () => {
		const cleaned = cleanSvg(engrave(hostile));
		const { document } = parseHTML(`<body>${cleaned}</body>`);
		expect(document.querySelectorAll("script, foreignObject, foreignobject").length).toBe(0);
		for (const el of document.querySelectorAll("*")) {
			for (const a of el.getAttributeNames()) {
				expect(a.toLowerCase().startsWith("on")).toBe(false);
				if (a === "href" || a === "xlink:href")
					expect(el.getAttribute(a)?.startsWith("#")).toBe(true);
			}
		}
		// linkedom's body.textContent skips SVG, so read the text elements.
		const text = [...document.querySelectorAll("tspan")].map((t) => t.textContent).join("|");
		expect(text).toContain("<svg onload=alert(1)>");
		expect(text).toContain("</text><script>x()</script>");
	});

	test("drops what is unsafe and keeps what is not", () => {
		const dirty =
			'<svg onload="x()"><script>x()</script><foreignObject><p>x</p></foreignObject>' +
			'<use href="#a" xlink:href="http://e.com/x"/><a href="javascript:x()"><path d="M0 0" onclick="y()"/></a></svg>';
		const out = cleanSvg(dirty);
		expect(out).not.toMatch(/script|foreignObject|onload|onclick|javascript|http/i);
		expect(out).toContain('href="#a"');
		expect(out).toContain('d="M0 0"');
	});
});

describe("scorePane", () => {
	const svg = engrave("| C | F |");

	test("score takes the theme palette", () => {
		const { document } = parseHTML(`<body>${scorePane(svg, "dark")}</body>`);
		const wrap = document.querySelector(".bm-chart");
		expect(wrap?.getAttribute("data-theme")).toBe("dark");
		expect(wrap?.querySelector("svg")).not.toBeNull();
		expect(svg).toContain("currentColor");
		expect(svg).not.toMatch(/(fill|stroke)[:=]\s*"?(#000\b|#000000|black|rgb\(0,\s*0,\s*0\))/i);
		expect(scoreStyles).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\bblack\b|\bwhite\b/i);
	});

	test("each theme is passed through, and the pane is a bms-score", () => {
		for (const t of ["auto", "light", "dark"] as const) {
			const { document } = parseHTML(`<body>${scorePane(svg, t)}</body>`);
			expect(document.querySelector(`.bm-chart[data-theme="${t}"] .bms-score`)).not.toBeNull();
		}
	});

	test("the pane is cleaned", () => {
		const out = scorePane('<svg onload="x()"><script>1</script></svg>', "auto");
		expect(out).not.toMatch(/onload|script/);
	});

	test("styles lay pages out full width", () => {
		expect(scoreStyles).toContain(".bms-score-page");
		expect(scoreStyles).toMatch(/width:\s*100%/);
		expect(scoreStyles).toMatch(/height:\s*auto/);
	});
});
