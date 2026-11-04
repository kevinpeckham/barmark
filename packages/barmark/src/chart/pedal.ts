import type { ChartDiagnostic, Pedal, PlayedBar, SimpleSlot, Slot } from "./types.js";

const pedalOf = (s: SimpleSlot): Pedal | undefined => (s.kind === "chord" ? s.pedal : undefined);
const membersOf = (s: Slot): SimpleSlot[] => (s.kind === "group" ? s.members : [s]);

/**
 * Walk a part's bars in play order with the pedal (grammar 2.9): `+`
 * presses or changes it, `*` lifts it, and so do `--` and a tacet bar.
 * `onRelease` hears each `*`, with whether the pedal was down.
 */
function walk(
	bars: PlayedBar[],
	onRelease: (bar: PlayedBar, wasDown: boolean) => void = () => {},
): boolean[][] {
	let down = false;
	return bars.map((bar) => {
		if (bar.tacet) down = false;
		return bar.slots.map((slot) => {
			for (const m of membersOf(slot)) {
				const pedal = pedalOf(m);
				if (pedal === "release") onRelease(bar, down);
				if (pedal) down = pedal === "press";
				else if (m.kind === "silence") down = false;
			}
			return down && !bar.tacet;
		});
	});
}

/** Whether the pedal is down at the end of each slot of each bar, in play order. The chart's end lifts it. */
export function pedalStates(bars: PlayedBar[]): boolean[][] {
	return walk(bars);
}

/** A warning for each `*` played with the pedal already up, once per line. */
export function pedalWarnings(bars: PlayedBar[]): ChartDiagnostic[] {
	const lines = new Set<number>();
	walk(bars, (bar, wasDown) => {
		if (!wasDown) lines.add(bar.line);
	});
	return [...lines].map((line) => ({
		line,
		severity: "warning",
		message: "* lifts the pedal, and it is already up here",
		token: "*",
	}));
}
