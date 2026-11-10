import type { ChartDiagnostic, Pedal, PlayedBar, SimpleSlot, Slot } from "./types.js";

const pedalOf = (s: SimpleSlot): Pedal | undefined => (s.kind === "chord" ? s.pedal : undefined);
const membersOf = (s: Slot): SimpleSlot[] => (s.kind === "group" ? s.members : [s]);

/**
 * One slot's effect on the pedal (grammar 2.9): `+` presses or changes it,
 * `*` lifts it, and so does `--`. `onRelease` hears each `*`, with whether
 * the pedal was down.
 */
function step(slot: Slot, down: boolean, onRelease: (wasDown: boolean) => void): boolean {
	let now = down;
	for (const m of membersOf(slot)) {
		const pedal = pedalOf(m);
		if (pedal === "release") onRelease(now);
		if (pedal) now = pedal === "press";
		else if (m.kind === "silence") now = false;
	}
	return now;
}

/** Whether the pedal is down at the end of each slot of each bar, in play order. The chart's end lifts it. */
export function pedalStates(bars: PlayedBar[]): boolean[][] {
	let down = false;
	return bars.map((bar) => {
		// A tacet bar lifts the pedal.
		if (bar.tacet) down = false;
		return bar.slots.map((slot) => {
			down = step(slot, down, () => {});
			return down && !bar.tacet;
		});
	});
}

/** What a bar's slots do to the pedal, from up and from down: where it ends, and whether a `*` finds it up. */
type Effect = { end: boolean; idle: boolean };

/** Each written bar's slots walked once from each state: a bar played again shares its walk. */
function effects(): (slots: Slot[], down: boolean) => Effect {
	const seen = new WeakMap<Slot[], [Effect, Effect]>();
	const walk = (slots: Slot[], from: boolean): Effect => {
		let idle = false;
		let down = from;
		for (const slot of slots)
			down = step(slot, down, (was) => {
				if (!was) idle = true;
			});
		return { end: down, idle };
	};
	return (slots, down) => {
		let both = seen.get(slots);
		if (!both) {
			both = [walk(slots, false), walk(slots, true)];
			seen.set(slots, both);
		}
		return both[down ? 1 : 0];
	};
}

/**
 * A warning for each `*` played with the pedal already up, once per line.
 * One pass over the bars with the pedal's state; each written bar's slots
 * are walked at most twice however often it plays.
 */
export function pedalWarnings(bars: PlayedBar[]): ChartDiagnostic[] {
	const lines = new Set<number>();
	const effect = effects();
	let down = false;
	for (const bar of bars) {
		const e = effect(bar.slots, down && !bar.tacet);
		if (e.idle) lines.add(bar.line);
		down = e.end;
	}
	return [...lines].map((line) => ({
		line,
		severity: "warning",
		message: "* lifts the pedal, and it is already up here",
		token: "*",
	}));
}
