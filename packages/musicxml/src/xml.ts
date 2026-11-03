/** XML as escaped strings, the way the renderer builds HTML. */

const ENTITIES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&apos;",
};

const escapeXml = (text: string) => text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

type Attrs = Record<string, string | number | undefined>;

/** `<name a="1">children</name>`, or `<name a="1"/>` with no children; undefined attributes are left out. */
export function el(name: string, attrs: Attrs = {}, children: string | string[] = ""): string {
	const at = Object.entries(attrs)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`)
		.join("");
	const inner = Array.isArray(children) ? children.join("") : children;
	return inner ? `<${name}${at}>${inner}</${name}>` : `<${name}${at}/>`;
}

/** An element holding text, escaped. */
export const text = (name: string, value: string | number, attrs: Attrs = {}) =>
	el(name, attrs, escapeXml(String(value)));
