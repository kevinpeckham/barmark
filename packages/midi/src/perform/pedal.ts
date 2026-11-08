/** The sustain pedal (spec 3.6, grammar 2.9): controller 64's presses and lifts, a part's in play order. */
import type { ChartParse, PlayedBar, SimpleSlot } from "barmark";
import { pushOf } from "./figures.js";
import { add, barQuarters, slotQuarters, sub, ZERO } from "./quarters.js";
import type { Quarters } from "./types.js";

/**
 * One part's bars: the chart's own for `null` (a chart with no parts, or
 * the first part, whose slots are the top-level ones); for part `i` its
 * own slots, tacet where it doesn't play, since `pedalStates` and this
 * walk read a bar's top-level slots.
 */
function barsOf(parse: ChartParse, part: number | null): PlayedBar[] {
	if (part === null) return parse.bars;
	return parse.bars.map((bar) => {
		const own = bar.parts?.[part];
		return { ...bar, slots: own?.slots ?? [], ...(own === null ? { tacet: true as const } : {}) };
	});
}

/** What a slot does to the pedal: press (or change), lift, or nothing. */
function pedalOf(slot: SimpleSlot): boolean | undefined {
	if (slot.kind === "silence") return false;
	return slot.kind === "chord" && slot.pedal ? slot.pedal === "press" : undefined;
}

/**
 * A part's pedal events: `+` presses at its slot's attack (pushed, if the
 * slot is), or, with the pedal down, lifts and presses at once, lift
 * first; `*`, `--`, a tacet bar's start and the chart's end lift it. The
 * walk is barmark's `pedalStates`, timed: just before each slot's end the
 * pedal is down exactly where `pedalStates` says so.
 */
export function pedalEvents(
	parse: ChartParse,
	part: number | null,
): { at: Quarters; down: boolean }[] {
	const events: { at: Quarters; down: boolean }[] = [];
	let down = false;
	const set = (at: Quarters, press: boolean) => {
		if (down) events.push({ at, down: false });
		if (press) events.push({ at, down: true });
		down = press;
	};
	let barAt = ZERO;
	for (const bar of barsOf(parse, part)) {
		const slots = bar.tacet ? [] : slotQuarters(bar.slots, bar.meter);
		if (bar.tacet) set(barAt, false);
		for (const { slot, at } of slots) {
			const press = pedalOf(slot);
			if (press !== undefined) set(sub(add(barAt, at), pushOf(slot) ?? ZERO), press);
		}
		barAt = add(barAt, barQuarters(bar.meter));
	}
	set(barAt, false);
	return events;
}
