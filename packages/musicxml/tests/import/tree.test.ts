import { expect, test } from "bun:test";
import { child, children, parseXml, textOf } from "../../src/import/tree.js";

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
