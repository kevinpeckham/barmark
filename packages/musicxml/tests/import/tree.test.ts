import { describe, expect, test } from "bun:test";
import { child, children, parseXml, readXml, textOf } from "../../src/import/tree.js";

test("keeps document order across element names", () => {
	const t = parseXml("<m><note/><backup/><note/></m>");
	expect(t?.children.map((c) => c.name)).toEqual(["note", "backup", "note"]);
});
test("reads a processing instruction inside an element", () => {
	const t = parseXml("<note><?barmark root?><pitch/></note>");
	expect(t?.pis).toEqual(["barmark root"]);
});
test("malformed XML is null, not a throw", () => {
	expect(parseXml("<a><b></a>")).toBeNull();
});
test("never resolves the DOCTYPE", () => {
	const t = parseXml(
		'<!DOCTYPE score-partwise PUBLIC "x" "http://example.invalid/x.dtd"><score-partwise/>',
	);
	expect(t?.name).toBe("score-partwise");
});
test("reads attributes, text and entities, and finds children", () => {
	const t = parseXml('<a id="1"><b>x &amp; y</b><b>z</b><c> 4 </c></a>');
	expect(t?.attrs).toEqual({ id: "1" });
	expect(children(t as never, "b").map((b) => b.text)).toEqual(["x & y", "z"]);
	expect(child(t as never, "c")?.text).toBe(" 4 ");
	expect(textOf(t ?? undefined, "c")).toBe("4");
	expect(textOf(undefined, "c")).toBe("");
	expect(textOf(child(t as never, "b"))).toBe("x & y");
});

describe("bounds", () => {
	const laughs = () => {
		let entities = '<!ENTITY a0 "lollollollollollollollollollol">';
		for (let i = 1; i < 10; i++) entities += `<!ENTITY a${i} "${`&a${i - 1};`.repeat(10)}">`;
		return `<!DOCTYPE r [${entities}]><r>&a9;</r>`;
	};

	test("billion laughs never expands", () => {
		const start = performance.now();
		const read = readXml(laughs());
		expect(performance.now() - start).toBeLessThan(1000);
		expect(typeof read === "string" ? read : read.text.length).not.toBeGreaterThan(1000);
	});

	test("entities expanding past 100,000 characters are refused", () => {
		const big = `<!DOCTYPE r [<!ENTITY big "${"x".repeat(9999)}">]><r>${"&big;".repeat(20)}</r>`;
		expect(readXml(big)).toBe("XML entities expand past 100000 characters");
	});

	test("nesting past 100 elements is refused, and says so", () => {
		const deep = (n: number) => `<r>${"<a>".repeat(n)}${"</a>".repeat(n)}</r>`;
		expect(typeof readXml(deep(98))).toBe("object");
		expect(readXml(deep(150))).toBe("XML nested too deeply (more than 100 elements)");
		expect(parseXml(deep(150))).toBeNull();
	});

	test("malformed XML", () => {
		expect(readXml("<a>")).toBe("not well-formed XML");
	});
});
