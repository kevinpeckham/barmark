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

const parser = new XMLParser({
	preserveOrder: true,
	ignoreAttributes: false,
	processEntities: true,
	ignorePiTags: false,
	parseTagValue: false,
	trimValues: false,
	// Without it a processing instruction's words vanish: `<?barmark root?>` is
	// the tag `?barmark` with a boolean attribute `root`.
	allowBooleanAttributes: true,
});

type Raw = Record<string, unknown>;

const attrsOf = (raw: Raw): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries((raw[":@"] as Raw | undefined) ?? {}))
		out[k.replace(/^@_/, "")] = String(v);
	return out;
};

function build(name: string, raw: Raw): XNode {
	const node: XNode = { name, attrs: attrsOf(raw), children: [], text: "", pis: [] };
	for (const item of raw[name] as Raw[]) {
		const [key] = Object.keys(item).filter((k) => k !== ":@");
		if (key === undefined) continue;
		if (key === "#text") node.text += String(item[key]);
		else if (key.startsWith("?"))
			node.pis.push([key.slice(1), ...Object.keys(attrsOf(item))].join(" "));
		else node.children.push(build(key, item));
	}
	return node;
}

/** The document's root element, or null when the XML is malformed. Never throws, never fetches the DTD. */
export function parseXml(xml: string): XNode | null {
	try {
		if (XMLValidator.validate(xml) !== true) return null;
		for (const item of parser.parse(xml) as Raw[]) {
			const [key] = Object.keys(item).filter((k) => k !== ":@");
			if (key !== undefined && !key.startsWith("?") && key !== "#text") return build(key, item);
		}
	} catch {
		// malformed in a way the validator let through
	}
	return null;
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
