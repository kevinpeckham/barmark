import { expect, test } from "bun:test";
import { type PlayedBar, parseChart, type Slot } from "barmark";
import { slotTimes } from "../../barmark/src/chart/shares.js";
import { AT_A_GLANCE } from "../../barmark/tests/chart/fixtures.js";
import { corpus } from "../../musicxml/tests/charts.js";
import { slotQuarters, toNumber } from "../src/perform/quarters.js";

/** Every line of slots a played bar holds: its own, each part's and each part line's. */
const slotLists = (bar: PlayedBar): Slot[][] => [
	bar.slots,
	...(bar.lines ?? []).map((l) => l.slots),
	...(bar.parts ?? []).flatMap((p) => (p ? [p.slots, ...(p.lines ?? []).map((l) => l.slots)] : [])),
];

test("slotQuarters is barmark's slotTimes", () => {
	let compared = 0;
	for (const [, text] of [["at a glance", AT_A_GLANCE], ...corpus()]) {
		for (const bar of parseChart(text ?? "").bars) {
			for (const slots of slotLists(bar)) {
				const ours = slotQuarters(slots, bar.meter);
				const theirs = slotTimes(slots, bar.meter);
				expect(ours.length).toBe(theirs.length);
				ours.forEach((o, i) => {
					expect(o.slot).toBe(theirs[i]?.slot as (typeof ours)[number]["slot"]);
					expect(toNumber(o.at)).toBe((theirs[i]?.at ?? Number.NaN) * 4);
					expect(toNumber(o.length)).toBe((theirs[i]?.length ?? Number.NaN) * 4);
					compared++;
				});
			}
		}
	}
	expect(compared).toBeGreaterThan(500);
});
