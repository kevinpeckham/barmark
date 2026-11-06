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
	return (playedOrder(measures) ?? []).map((i) => Number(measures[i]?.written));
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

describe("repeats as notation programs play them", () => {
	const bar = note("C", 4, 4);
	const left = (inner: string) => `<barline location="left">${inner}</barline>`;
	const right = (inner: string) => `<barline location="right">${inner}</barline>`;
	const forward = left('<repeat direction="forward"/>');
	const backward = (times = "") => right(`<repeat direction="backward"${times}/>`);
	const ending = (n: string, type: string, side = left) =>
		side(`<ending number="${n}" type="${type}"/>`);
	const orderOf = (...bodies: string[]) =>
		playedOrder(
			measuresOf(
				xml`${bodies.map((b, i) => measure(i + 1, (i === 0 ? attributes("<divisions>1</divisions>") : "") + b)).join("")}`,
			),
		);

	test("a backward repeat with none before it goes back to the bar after the last repeat", () => {
		expect(orderOf(bar + backward(), bar + backward())).toEqual([0, 0, 1, 1]);
	});

	test("back-to-back repeats", () => {
		expect(orderOf(forward + bar + backward(), forward + bar + backward())).toEqual([0, 0, 1, 1]);
	});

	// MuseScore pairs a backward repeat with the innermost forward one still open,
	// and an inner repeat plays again on each pass of the outer: A, B, B, C, then again.
	test("nested repeats play as MuseScore plays them", () => {
		expect(orderOf(forward + bar, forward + bar + backward(), bar + backward())).toEqual([
			0, 1, 1, 2, 0, 1, 1, 2,
		]);
	});

	test("a third ending plays though times is absent", () => {
		expect(
			orderOf(
				forward + bar,
				bar,
				ending("1", "start") + bar + ending("1", "stop", right) + backward(),
				ending("2", "start") + bar + ending("2", "stop", right) + backward(),
				ending("3", "start") + bar,
				bar + ending("3", "discontinue", right),
			),
		).toEqual([0, 1, 2, 0, 1, 3, 0, 1, 4, 5]);
	});

	test('an ending numbered "1, 2"', () => {
		expect(
			orderOf(
				forward + bar,
				ending("1, 2", "start") + bar + ending("1, 2", "stop", right) + backward(' times="3"'),
				ending("3", "start") + bar + ending("3", "discontinue", right),
			),
		).toEqual([0, 1, 0, 1, 0, 2]);
	});

	test("dalsegno with no segno, and tocoda with no coda, play on to the end", () => {
		expect(orderOf(bar, `${bar}<sound dalsegno="s1"/>`, bar)).toEqual([0, 1, 2]);
		expect(orderOf(bar, `${bar}<sound dacapo="yes"/>`, `${bar}<sound tocoda="c1"/>`)).toEqual([
			0, 1, 0, 1, 2,
		]);
	});

	test("a To Coda is taken once, after the jump, and only forward", () => {
		const coda =
			'<direction><direction-type><coda/></direction-type><sound coda="c1"/></direction>';
		const start = performance.now();
		// The coda sign before the To Coda: a jump back would loop for ever.
		expect(
			orderOf(`${coda}${bar}`, `${bar}<sound tocoda="c1"/>`, `${bar}<sound dacapo="yes"/>`),
		).toEqual([0, 1, 2, 0, 1, 2]);
		expect(performance.now() - start).toBeLessThan(100);
		// Two To Codas: the second, reached in the coda, isn't taken again.
		expect(
			orderOf(
				`${bar}<sound tocoda="c1"/>`,
				`${bar}<sound dacapo="yes"/>`,
				`${coda}${bar}`,
				`${bar}<sound tocoda="c1"/>`,
				bar,
			),
		).toEqual([0, 1, 0, 2, 3, 4]);
	});

	test("a play order longer than four times the measures (at least 64) is refused, with a loss", () => {
		const losses = new Losses();
		const ms = measuresOf(
			xml`${measure(1, `${attributes("<divisions>1</divisions>")}${forward}${bar}${backward(' times="20000"')}`)}`,
		);
		const start = performance.now();
		expect(playedOrder(ms, losses)).toBeNull();
		expect(performance.now() - start).toBeLessThan(100);
		expect(losses.list().map((d) => d.message)).toEqual([
			"play order runs past 64 bars; bars written once each, in written order",
		]);
	});

	test("a play order of 64 bars or four times the measures is kept", () => {
		const ms = measuresOf(
			xml`${measure(1, `${attributes("<divisions>1</divisions>")}${forward}${bar}${backward(' times="64"')}`)}`,
		);
		expect(playedOrder(ms)).toHaveLength(64);
	});
});
