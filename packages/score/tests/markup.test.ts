import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { VerovioToolkit } from "verovio/esm";
import { cleanSvg, engraveChart, engraveXml, scorePane, scoreStyles } from "../src/index.js";
import { loadToolkit } from "./helpers/toolkit.js";

const vrv = await loadToolkit();

const examples = join(import.meta.dir, "../../../examples");
const fixtures = join(import.meta.dir, "../../musicxml/tests/fixtures/import");
const everything = (): { name: string; svg: string }[] => [
	...readdirSync(examples)
		.filter((f) => f.endsWith(".chart.md"))
		.map((f) => ({ name: f, svg: engrave(readFileSync(join(examples, f), "utf8")) })),
	...readdirSync(fixtures)
		.filter((f) => f.endsWith(".musicxml"))
		.map((f) => ({
			name: f,
			svg: engraveXml(vrv, readFileSync(join(fixtures, f), "utf8"), { width: 800 }).svg,
		})),
];

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

	test("Verovio's own output passes unchanged", () => {
		const all = everything();
		expect(all.length).toBeGreaterThan(10);
		for (const { name, svg } of all) expect([name, cleanSvg(svg)]).toEqual([name, svg]);
	});

	test("the exact style Verovio emits is kept, any other is not", () => {
		const css = /<style[\s\S]*?<\/style>/.exec(engrave("| C |"))?.[0] ?? "";
		expect(css).toContain("<style");
		expect(cleanSvg(`<svg>${css}</svg>`)).toContain("<style");
		expect(cleanSvg("<svg><style>@import url(x)</style></svg>")).toBe("<svg></svg>");
		expect(cleanSvg(`<svg>${css.replace("bold", "bolder")}</svg>`)).toBe("<svg></svg>");
	});

	test("only Verovio's own font-face is kept", () => {
		const face =
			"@font-face {\n    font-family: 'Leipzig';\n    src: url(data:application/font-woff2;charset=utf-8;base64,AAAA) format('woff2');\n    font-weight: normal;\n    font-style: normal;\n}";
		expect(cleanSvg(`<svg><style type="text/css">${face}</style></svg>`)).toContain("Leipzig");
		const evil = face.replace("AAAA", "AAAA) , url(http://e.com/x");
		expect(cleanSvg(`<svg><style>${evil}</style></svg>`)).toBe("<svg></svg>");
	});

	const clean = (s: string) => {
		try {
			return cleanSvg(s);
		} catch {
			return null; // failing closed
		}
	};
	const hostileCases: [string, string][] = [
		["slash as separator", "<svg/onload=x></svg>"],
		["slash then quoted", "<svg/onload=\"x()\"><path/onclick='y()'/></svg>"],
		["upper-case script", "<svg><SCRIPT>x()</SCRIPT></svg>"],
		["closing tag with space", "<svg><script>x()</script ></svg>"],
		["animate", '<svg><animate attributeName="href" to="javascript:x"/></svg>'],
		["set", '<svg><set attributeName="href" to="javascript:x"/></svg>'],
		["data href", '<svg><use href="data:image/svg+xml;base64,AAAA"/></svg>'],
		["spaced javascript", '<svg><a xlink:href=" javascript:x">t</a></svg>'],
		["external use", '<svg><use xlink:href="http://e.com/x#a"/></svg>'],
		["unbalanced quote", '<svg><path d="M0 0 onload=x()/></svg>'],
		["style attribute", '<svg><path style="fill:url(http://e.com)" d="M0 0"/></svg>'],
		["image", '<svg><image href="http://e.com/x.png"/></svg>'],
		["foreignObject", "<svg><foreignObject><p>x</p></foreignObject></svg>"],
		["comment", "<svg><!-- x --></svg>"],
		["cdata", "<svg><![CDATA[x]]></svg>"],
		["stray <", "<svg>a < b</svg>"],
		["unterminated tag", '<svg><path d="M0 0"'],
		["unclosed element", "<svg><g>"],
		["mismatched close", "<svg><g></svg></g>"],
	];

	test("hostile markup is removed or fails closed", () => {
		for (const [name, input] of hostileCases) {
			const out = clean(input);
			if (out === null) continue;
			expect([
				name,
				/script|foreignObject|animate|<set|<image|\son\w*=|javascript|data:|http|style=|<!--|CDATA/i.test(
					out,
				),
			]).toEqual([name, false]);
		}
	});

	test("entity-coded values are dropped", () => {
		for (const v of ["&#117;rl(http://e.com/x)", "url&#40;http://e.com/x)", "&#x75;rl(x)"]) {
			expect([v, clean(`<svg><path fill="${v}" d="M0 0"/></svg>`)]).toEqual([
				v,
				'<svg><path d="M0 0"/></svg>',
			]);
		}
		expect(clean('<svg><use xlink:href="#a&#x26;b"/></svg>')).toBe("<svg><use/></svg>");
	});

	test("a self-closing raw-text element fails closed", () => {
		for (const name of ["style", "title", "script", "textarea", "xmp", "noscript"])
			expect([name, clean(`<svg><${name}/>@import url(x)</svg>`)]).toEqual([name, null]);
		expect(clean("<svg><style/>@import url(x)</svg>")).toBeNull();
	});

	test("these fail closed, not just clean", () => {
		for (const name of ["unbalanced quote", "comment", "cdata", "stray <", "unterminated tag"]) {
			const input = hostileCases.find(([n]) => n === name)?.[1] ?? "";
			expect([name, clean(input)]).toEqual([name, null]);
		}
	});

	test("unlisted elements go with their content, attributes are filtered", () => {
		expect(cleanSvg("<svg><SCRIPT>x()</SCRIPT><g><path d='M0 0'/></g></svg>")).toBe(
			'<svg><g><path d="M0 0"/></g></svg>',
		);
		expect(clean("<svg/onload=x></svg>")).toBeNull(); // unquoted: fail closed
		expect(clean('<svg/onload="x"></svg>')).toBe("<svg></svg>");
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

	test("Verovio's own color attribute cannot reset the theme", () => {
		const { document } = parseHTML(`<body>${scorePane(svg, "dark")}</body>`);
		const painted = [...document.querySelectorAll("[color]")];
		expect(painted.length).toBeGreaterThan(0);
		// A presentation attribute loses to any rule: the stylesheet must reach every one of them.
		expect(scoreStyles).toMatch(/\.bms-score-page svg svg\s*\{[^}]*color:\s*inherit/);
		for (const el of painted) expect(el.matches(".bms-score-page svg svg")).toBe(true);
		expect(scoreStyles).toMatch(/\.bms-score-page svg\s*\{[^}]*fill:\s*currentColor/);
	});

	test("each theme is passed through, and the pane is a bms-score", () => {
		for (const t of ["auto", "light", "dark"] as const) {
			const { document } = parseHTML(`<body>${scorePane(svg, t)}</body>`);
			expect(document.querySelector(`.bm-chart[data-theme="${t}"] .bms-score`)).not.toBeNull();
		}
	});

	test("the score is an image named for the chart, or Score", () => {
		const named = parseHTML(`<body>${scorePane(svg, "auto", 'Tom & "Jerry"')}</body>`).document;
		const score = named.querySelector(".bms-score");
		expect(score?.getAttribute("role")).toBe("img");
		expect(score?.getAttribute("aria-label")).toBe('Tom & "Jerry"');
		const plain = parseHTML(`<body>${scorePane(svg, "auto")}</body>`).document;
		expect(plain.querySelector(".bms-score")?.getAttribute("aria-label")).toBe("Score");
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

describe("engraveChart", () => {
	test("says it could not draw when the SVG cannot be cleaned", () => {
		const stub = {
			setOptions: () => undefined,
			loadData: () => true,
			getPageCount: () => 1,
			renderToSVG: () => '<svg><path d="M0 0 onload=x()/></svg>',
		} as unknown as VerovioToolkit;
		const r = engraveChart(stub, "| C |", { width: 800 });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toContain("not clean");
	});
});
