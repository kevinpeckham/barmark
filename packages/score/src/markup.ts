export type ScoreTheme = "auto" | "light" | "dark";

const GEOMETRY = ["x", "y", "width", "height", "transform", "class", "id"];

/** The elements Verovio emits, each with the attributes it may carry; everything else goes. */
const ALLOWED: Record<string, readonly string[]> = {
	div: ["class"],
	svg: [
		...GEOMETRY,
		"viewBox",
		"version",
		"xmlns",
		"xmlns:xlink",
		"overflow",
		"color",
		"font-family",
	],
	g: ["id", "class", "transform"],
	defs: [],
	desc: [],
	title: ["class"],
	symbol: ["id", "viewBox"],
	clipPath: ["id"],
	path: ["transform", "d", "stroke-width", "stroke-linecap", "stroke-linejoin", "class"],
	text: ["x", "y", "text-anchor", "font-size", "class"],
	tspan: [
		"id",
		"class",
		"font-size",
		"font-weight",
		"font-style",
		"x",
		"y",
		"text-anchor",
		"font-family",
		"fill",
		"xml:space",
	],
	use: ["xlink:href", "href", "transform", "x", "y"],
	ellipse: ["cx", "cy", "rx", "ry", "transform"],
	rect: ["x", "y", "height", "width", "transform"],
	polygon: ["points"],
	polyline: ["points", "stroke-width"],
	line: ["x1", "y1", "x2", "y2", "stroke-width"],
	style: ["type"],
};

/** The stylesheets Verovio writes (one with a random id, one embedding its font); any other `<style>` is dropped. */
const STYLE_ID = /^#([A-Za-z0-9]+) g\.ending,/;
const STYLE_TEMPLATE =
	"#@ g.ending, #@ g.fing, #@ g.reh, #@ g.tempo {font-weight:bold;}#@ g.dir, #@ g.dynam, #@ g.mNum {font-style:italic;}#@ g.label {font-weight:normal;}#@ ellipse, #@ path, #@ polygon, #@ polyline, #@ rect {stroke:currentColor}#@ g.cursor {fill:dodgerblue; color:dodgerblue;}#@ g.cursor.chord {fill:limegreen; color:limegreen;}#@ g.placeholder {visibility:hidden}";

/** The one embedded font Verovio adds for some scores: Leipzig as a base64 woff2, nothing else. */
const FONT_FACE =
	/^@font-face \{\s*font-family: 'Leipzig';\s*src: url\(data:application\/font-woff2;charset=utf-8;base64,[A-Za-z0-9+/=]+\) format\('woff2'\);\s*font-weight: normal;\s*font-style: normal;\s*\}$/;

/** Whether a stylesheet is Verovio's embedded Leipzig face, exactly (and nothing else). */
export const isLeipzigFace = (css: string) => FONT_FACE.test(css);

function isVerovioStyle(css: string): boolean {
	if (isLeipzigFace(css)) return true;
	const id = STYLE_ID.exec(css)?.[1];
	return id !== undefined && css === STYLE_TEMPLATE.replaceAll("@", id);
}

const NAME = /^[A-Za-z][A-Za-z0-9:_.-]*/;
const WHITESPACE = /\s/;

class Unclean extends Error {}

function fail(why: string): never {
	throw new Unclean(`The score markup is not clean SVG: ${why}`);
}

/** Elements whose content the HTML parser reads as raw text, even when written `<x/>`. */
const RAW_TEXT = new Set([
	"style",
	"script",
	"title",
	"textarea",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
	"noscript",
	"plaintext",
]);

function refuseSelfClosingRawText(tag: Tag): void {
	if (tag.selfClosing && RAW_TEXT.has(tag.name.toLowerCase()))
		fail("a self-closing raw-text element");
}

function keepAttribute(name: string, value: string): boolean {
	// Verovio writes no entities in attributes; a character reference could decode to `url(` or `javascript:`.
	if (value.includes("&")) return false;
	if ((name === "href" || name === "xlink:href") && !value.startsWith("#")) return false;
	if (/url\(/i.test(value.replace(/url\(\s*#/gi, ""))) return false;
	return true;
}

type Tag = {
	name: string;
	attrs: [string, string][];
	selfClosing: boolean;
	spaced: boolean;
	end: number;
};

const skipSpace = (src: string, from: number): number => {
	let p = from;
	while (WHITESPACE.test(src[p] ?? "x")) p++;
	return p;
};

/** A quoted attribute value from `q`, free of `<`. */
function readValue(src: string, q: number): { value: string; end: number } {
	const quote = src[q];
	if (quote !== '"' && quote !== "'") fail("an unquoted attribute value");
	const close = src.indexOf(quote, q + 1);
	if (close < 0) fail("an unbalanced quote");
	const value = src.slice(q + 1, close);
	if (value.includes("<")) fail("a < in an attribute value");
	return { value, end: close + 1 };
}

/** One `name="value"` from `p`. */
function readAttribute(src: string, p: number): { name: string; value: string; end: number } {
	const name = /^[^\s/>=<"']+/.exec(src.slice(p))?.[0] ?? fail("a bad attribute name");
	const eq = skipSpace(src, p + name.length);
	if (src[eq] !== "=") fail("an attribute with no value");
	return { name, ...readValue(src, skipSpace(src, eq + 1)) };
}

/** Where a start tag's attributes stop (`>` or `/>`), reading each into `attrs`. */
function readAttributes(src: string, from: number, attrs: [string, string][]): number {
	let p = from;
	while (src[p] !== undefined && src[p] !== ">" && !(src[p] === "/" && src[p + 1] === ">")) {
		if (src[p] === "/" || WHITESPACE.test(src[p] ?? "")) {
			p++;
			continue;
		}
		const attr = readAttribute(src, p);
		attrs.push([attr.name, attr.value]);
		p = attr.end;
	}
	if (src[p] === undefined) fail("a tag that never ends");
	return p;
}

/** One start tag from `i` (at `<`); `/` and whitespace both separate attributes. Throws on anything unclean. */
function readStartTag(src: string, i: number): Tag {
	const name = NAME.exec(src.slice(i + 1))?.[0] ?? fail("a tag with no name");
	const attrs: [string, string][] = [];
	const p = readAttributes(src, i + 1 + name.length, attrs);
	const selfClosing = src[p] === "/";
	const spaced = selfClosing && WHITESPACE.test(src[p - 1] ?? "");
	return { name, attrs, selfClosing, spaced, end: p + (selfClosing ? 2 : 1) };
}

function writeTag(tag: Tag): string {
	const allowed = ALLOWED[tag.name] ?? [];
	const attrs = tag.attrs
		.filter(([n, v]) => allowed.includes(n) && keepAttribute(n, v))
		.map(([n, v]) => ` ${n}="${v.replaceAll('"', "&quot;")}"`)
		.join("");
	return `<${tag.name}${attrs}${tag.selfClosing ? (tag.spaced ? " />" : "/>") : ">"}`;
}

type Open = { name: string; emit: boolean };

/** A closing tag from `i`; returns where it ends, writing it if its element was written. */
function readEndTag(src: string, i: number, open: Open[], out: string[]): number {
	const name = NAME.exec(src.slice(i + 2))?.[0] ?? fail("a closing tag with no name");
	const p = skipSpace(src, i + 2 + name.length);
	if (src[p] !== ">") fail("a closing tag that never ends");
	const top = open.pop();
	if (top?.name !== name) fail("a closing tag that matches nothing");
	if (top.emit) out.push(`</${name}>`);
	return p + 1;
}

/** A `<style>`'s text after `tag`: kept only if it is one of Verovio's. Returns where its end tag starts. */
function readStyle(src: string, tag: Tag, emit: boolean, open: Open[], out: string[]): number {
	const close = src.indexOf("</style", tag.end);
	const css = src.slice(tag.end, close < 0 ? undefined : close);
	if (close < 0 || css.includes("<")) fail("a style that never ends");
	const write = emit && isVerovioStyle(css);
	if (write) out.push(writeTag(tag), css);
	open.push({ name: "style", emit: write });
	return close;
}

/**
 * Verovio's SVG reduced to what Verovio emits: only the listed elements and
 * attributes survive, an unlisted element goes with its content, links keep
 * only `#` targets. Hand-scanned, no DOM. Throws if the markup cannot be read
 * cleanly (unbalanced quotes, comments, a stray `<`, unclosed elements): the
 * caller treats that as "could not draw".
 */
export function cleanSvg(svg: string): string {
	const out: string[] = [];
	// Open elements, each with whether it is written (false inside an unlisted element).
	const open: Open[] = [];
	let i = 0;
	while (i < svg.length) {
		const lt = svg.indexOf("<", i);
		if (open.every((o) => o.emit)) out.push(svg.slice(i, lt < 0 ? undefined : lt));
		if (lt < 0) break;
		i = readTag(svg, lt, open, out);
	}
	if (open.length) fail("an element that never closes");
	return out.join("");
}

/** The tag at `i` (a `<`), written or dropped; returns where it ends. */
function readTag(svg: string, i: number, open: Open[], out: string[]): number {
	if (svg[i + 1] === "/") return readEndTag(svg, i, open, out);
	if (!/[A-Za-z]/.test(svg[i + 1] ?? "")) fail("a < that starts no tag");
	const emit = open.every((o) => o.emit);
	const tag = readStartTag(svg, i);
	refuseSelfClosingRawText(tag);
	if (tag.name === "style" && !tag.selfClosing) return readStyle(svg, tag, emit, open, out);
	const write = emit && tag.name in ALLOWED;
	if (write) out.push(writeTag(tag));
	if (!tag.selfClosing) open.push({ name: tag.name, emit: write });
	return tag.end;
}

/**
 * The score's own layout. Colour comes from `@barmark/render`'s stylesheet
 * (the `.bm-chart` wrapper that `scorePane` writes), which must be in the same
 * shadow root; Verovio draws in `currentColor`, but its inner page svg carries `color="black"`, which `color:inherit` overrides.
 */
export const scoreStyles = `.bms-score{padding:1rem;color:inherit;background:transparent}
.bms-score-page{width:100%}
.bms-score-page svg{display:block;width:100%;height:auto}
.bms-score-page svg{fill:currentColor}
.bms-score-page svg svg{color:inherit}`;

/** Text made safe for HTML content and quoted attribute values (`&` first, so nothing is escaped twice). */
export const escapeHtml = (text: string) =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

/**
 * The cleaned pages in a themed pane: render's `.bm-chart` supplies the
 * palette. The score is one image to assistive technology, named `label`
 * (the chart's title, say), or "Score".
 */
export function scorePane(svg: string, theme: ScoreTheme, label = "Score"): string {
	return `<div class="bm-chart" data-theme="${theme}"><div class="bms-score" role="img" aria-label="${escapeHtml(label)}">${cleanSvg(svg)}</div></div>`;
}
