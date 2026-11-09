import { describe, expect, test } from "bun:test";
import { forVerovio } from "../src/engrave.js";

const HIDDEN = '<degree print-object="no"><degree-value>7</degree-value></degree>';
const SHOWN = "<degree><degree-value>9</degree-value></degree>";

describe("forVerovio", () => {
	test("drops a hidden degree and keeps a printed one", () => {
		expect(forVerovio(`<harmony>${HIDDEN}${SHOWN}${HIDDEN}</harmony>`)).toBe(
			`<harmony>${SHOWN}</harmony>`,
		);
	});

	test("leaves an opener with no closer as it is", () => {
		const xml = `<a>${HIDDEN}<degree print-object="no"><b/></a>`;
		expect(forVerovio(xml)).toBe('<a><degree print-object="no"><b/></a>');
	});

	test("takes linear time on many openers with no closer", () => {
		const xml = '<degree print-object="no">'.repeat(200_000);
		const start = performance.now();
		expect(forVerovio(xml)).toBe(xml);
		expect(performance.now() - start).toBeLessThan(500);
	});
});
