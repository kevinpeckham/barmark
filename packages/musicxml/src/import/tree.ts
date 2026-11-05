/** MusicXML text as a plain tree that keeps document order, which `<backup>` and `<forward>` depend on. */
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type XNode = {
	name: string;
	attrs: Record<string, string>;
	children: XNode[];
	text: string;
	/** Processing instructions directly inside, e.g. `"barmark root"`. */
	pis: string[];
};

/** The deepest nesting read: a MusicXML score is about ten deep. */
const MAX_DEPTH = 100;
/** The longest text entities may expand to, in all. */
const MAX_EXPANDED = 100_000;

const parser = new XMLParser({
	preserveOrder: true,
	ignoreAttributes: false,
	// The bounds are written out, at the library's own defaults or tighter,
	// so a version bump can't loosen them: an internal entity expands only so
	// far (billion laughs), and external entities are never fetched.
	processEntities: {
		enabled: true,
		maxEntitySize: 10_000,
		maxEntityCount: 100,
		maxExpansionDepth: 10,
		maxTotalExpansions: 1000,
		maxExpandedLength: MAX_EXPANDED,
	},
	maxNestedTags: MAX_DEPTH,
	ignorePiTags: false,
	parseTagValue: false,
	trimValues: false,
	// Without it a processing instruction's words vanish: `<?barmark root?>` is
	// the tag `?barmark` with a boolean attribute `root`.
	allowBooleanAttributes: true,
});

/** C0 and C1 controls, DEL included. */
export const CONTROLS = /\p{Cc}/gu;
/** Text keeps tab, newline and return (whitespace the readers collapse); every other control goes. */
const cleanText = (s: string) => s.replace(/(?![\t\n\r])\p{Cc}/gu, "");
/** An attribute value is one line: whitespace controls become a space, the rest go. */
const cleanAttr = (s: string) => s.replace(/[\t\n\r]/g, " ").replace(CONTROLS, "");

type Raw = Record<string, unknown>;

const attrsOf = (raw: Raw): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries((raw[":@"] as Raw | undefined) ?? {}))
		out[k.replace(/^@_/, "")] = cleanAttr(String(v));
	return out;
};

function build(name: string, raw: Raw): XNode {
	const node: XNode = { name, attrs: attrsOf(raw), children: [], text: "", pis: [] };
	for (const item of raw[name] as Raw[]) {
		const [key] = Object.keys(item).filter((k) => k !== ":@");
		if (key === undefined) continue;
		if (key === "#text") node.text += cleanText(String(item[key]));
		else if (key.startsWith("?"))
			node.pis.push([key.slice(1), ...Object.keys(attrsOf(item))].join(" "));
		else node.children.push(build(key, item));
	}
	return node;
}

const NESTED = `XML nested too deeply (more than ${MAX_DEPTH} elements)`;
const EXPANDED = `XML entities expand past ${MAX_EXPANDED} characters`;

/** What stopped the parser, as the user's problem: nesting, entities, or plain malformed XML. */
function problemOf(e: unknown): string {
	const message = e instanceof Error ? e.message : "";
	if (/nested tags/i.test(message)) return NESTED;
	if (/expanded content length/i.test(message)) return EXPANDED;
	return "not well-formed XML";
}

/** The document's root element, or what is wrong with the XML. Never throws, never fetches the DTD. */
export function readXml(xml: string): XNode | string {
	try {
		if (XMLValidator.validate(xml) !== true) return "not well-formed XML";
		for (const item of parser.parse(xml) as Raw[]) {
			const [key] = Object.keys(item).filter((k) => k !== ":@");
			if (key !== undefined && !key.startsWith("?") && key !== "#text") return build(key, item);
		}
	} catch (e) {
		return problemOf(e);
	}
	return "not well-formed XML";
}

/** The document's root element, or null when the XML can't be read. */
export function parseXml(xml: string): XNode | null {
	const read = readXml(xml);
	return typeof read === "string" ? null : read;
}

export const children = (n: XNode, name: string): XNode[] =>
	n.children.filter((c) => c.name === name);
export const child = (n: XNode, name: string): XNode | undefined =>
	n.children.find((c) => c.name === name);

/** The trimmed text of a node, or of its child `name`; empty when absent. */
export function textOf(n: XNode | undefined, name?: string): string {
	const target = name === undefined || n === undefined ? n : child(n, name);
	return target?.text.trim() ?? "";
}
