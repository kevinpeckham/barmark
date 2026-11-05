import { describe, expect, test } from "bun:test";
import { Losses } from "../../src/import/losses.js";
import { playedOrder } from "../../src/import/order.js";
import { readScore } from "../../src/import/read.js";
import { parseXml } from "../../src/import/tree.js";
import { exportMusicXml } from "../../src/index.js";
import { corpus } from "../charts.js";
import { play } from "../play.js";
import { attributes, measure, measuresOf, note, xml } from "./helpers.js";

/** The written bar numbers a part's measures play, in played order. */
function shownInOrder(text: string, part: number): number[] {
	const root = parseXml(text);
	const score = root ? readScore(root, new Losses()) : null;
	const measures = score?.parts[part]?.measures ?? [];
	return playedOrder(measures).map((i) => Number(measures[i]?.written));
}

describe("played order", () => {
	for (const [name, chart] of corpus())
		test(`${name}: as tests/play.ts plays its export`, () => {
			const r = exportMusicXml(chart);
			if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
			const parts = r.xml.match(/<part id=/g)?.length ?? 0;
			for (let p = 0; p < parts; p++)
				expect(shownInOrder(r.xml, p)).toEqual(play(r.xml, `P${p + 1}`).shown);
		});

	test("a jump to a sign that isn't there plays on", () => {
		const bar = note("C", 4, 4);
		const ms = measuresOf(
			xml`${measure(1, attributes("<divisions>1</divisions>") + bar)}${measure(2, `${bar}<sound dalsegno="s9"/>`)}${measure(3, bar)}`,
		);
		expect(playedOrder(ms)).toEqual([0, 1, 2]);
	});

	test("a segno without a <sound> is still the sign", () => {
		const bar = note("C", 4, 4);
		const segno =
			'<direction placement="above"><direction-type><segno/></direction-type></direction>';
		const ms = measuresOf(
			xml`${measure(1, attributes("<divisions>1</divisions>") + bar)}${measure(2, segno + bar)}${measure(3, `${bar}<sound dalsegno="segno"/>`)}`,
		);
		expect(playedOrder(ms)).toEqual([0, 1, 2, 1, 2]);
	});
});
