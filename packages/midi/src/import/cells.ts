/**
 * A bar's text (spec 6.1, ruling 2): each point's token is its note set,
 * `/` for a hold or `--` for a rest; a bar with anything inside a beat is
 * one slot a beat (a beat of several parts a group joined with `_`, or a
 * dotted figure), any other bar the fewest slots that keep its rhythm.
 * One pass over the points.
 */

import type { State } from "./ends.js";
import type { Named } from "./pitch.js";
import type { Quantized, Struck } from "./quantize.js";

/** Every pitch of a struck point's attacks, each once, low to high, by its name: `{F3 F4 A4}`. */
export function noteSet(struck: Struck<Named>): string {
	const names = new Map<number, string>();
	for (const a of struck.attacks)
		a.pitches.forEach((pitch, i) => {
			names.set(pitch, a.names[i] ?? "");
		});
	const sorted = [...names].sort(([a], [b]) => a - b);
	return `{${sorted.map(([, name]) => name).join(" ")}}`;
}

/** A point's token. */
function token(state: State<Named>): string {
	if (state.kind === "attack") return noteSet(state.struck);
	return state.kind === "hold" ? "/" : "--";
}

/** A beat of several parts: a group, or a dotted figure when four parts read attack, hold, hold, attack or attack, attack, hold, hold. */
function group(points: State<Named>[]): string {
	const kinds = points.map((s) => s.kind[0]).join("");
	const tokens = points.map(token);
	if (points.length === 4) {
		if (kinds === "ahha") return `${tokens[0]}._${tokens[3]}`;
		if (kinds === "aahh") return `${tokens[0]}_${tokens[1]}.`;
	}
	return tokens.join("_");
}

/** Whether a beat may sit inside the slot before it: a hold, or a rest that does not start there. */
function inside(points: State<Named>[] | undefined): boolean {
	const s = points?.[0];
	return s?.kind === "hold" || (s?.kind === "rest" && !s.first);
}

/** The slots of a bar of one-part beats: the smallest divisor of the count no slot is broken into. */
function slots(beats: State<Named>[][]): string[] {
	const count = beats.length;
	for (let d = 1; d < count; d++) {
		const size = count / d;
		if (count % d === 0 && beats.every((points, b) => b % size === 0 || inside(points)))
			return Array.from({ length: d }, (_, k) => token(beats[k * size]?.[0] as State<Named>));
	}
	return beats.map((points) => token(points[0] as State<Named>));
}

/** One bar's text from its beats' states. */
function barText(beats: State<Named>[][]): string {
	if (!beats.some((points) => points.length > 1)) return slots(beats).join(" ");
	return beats
		.map((points) => (points.length > 1 ? group(points) : token(points[0] as State<Named>)))
		.join(" ");
}

/** One text per bar of the grid (no `%`, no meter prefix). */
export function barTexts(states: State<Named>[][], q: Quantized<Named>): string[] {
	const bars: State<Named>[][][] = [];
	q.beats.forEach(({ bar }, b) => {
		const beats = bars[bar] ?? [];
		beats.push(states[b] ?? []);
		bars[bar] = beats;
	});
	return Array.from(bars, (beats) => barText(beats ?? []));
}

/** Bars equal to the bar before, starting with a note and for which `same(i)`, written `%`. */
export function withSimile(texts: string[], same: (bar: number) => boolean): string[] {
	return texts.map((text, i) =>
		i > 0 && text === texts[i - 1] && text.startsWith("{") && same(i) ? "%" : text,
	);
}
