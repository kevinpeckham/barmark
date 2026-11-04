/**
 * The sustain pedal (barmark's grammar 2.9) as the score writes it: a
 * start at each press, a stop then a start where a press finds it down, a
 * stop at each release, and a stop where the part falls tacet or the
 * chart ends with it down. Walked in written order.
 */
import type { MeasureEvents, SoundEvent } from "./events.js";
import { el, text } from "./xml.js";

export type PedalMark = "start" | "stop";

/** What a press or release asks of an event: its own mark, not a push's early note's twin. */
function marksAt(e: SoundEvent, down: boolean): PedalMark[] {
	if (e.slot.kind !== "chord" || !e.slot.pedal || !e.harmony) return [];
	if (e.slot.pedal === "release") return down ? ["stop"] : [];
	return down ? ["stop", "start"] : ["start"];
}

/** Each event's pedal marks, and a bar's lift at its start (tacet) or end (the chart's last). */
export function applyPedals(bars: MeasureEvents[]): MeasureEvents[] {
	let down = false;
	const out = bars.map((bar): MeasureEvents => {
		if (bar.measure.tacet && down) {
			down = false;
			return { ...bar, lift: "start" };
		}
		const events = bar.events.map((e) => {
			const pedal = marksAt(e, down);
			if (pedal.length === 0) return e;
			down = pedal.at(-1) === "start";
			return { ...e, pedal };
		});
		return { ...bar, events };
	});
	const last = out.at(-1);
	if (down && last) out[out.length - 1] = { ...last, lift: "end" };
	return out;
}

/** A pedal mark under the part's lowest staff (`staff` on a keyboard), with its playback. */
export const pedalXml = (mark: PedalMark, staff: number | null) =>
	el("direction", { placement: "below" }, [
		el("direction-type", {}, el("pedal", { type: mark, sign: "yes" })),
		staff === null ? "" : text("staff", staff),
		el("sound", { "damper-pedal": mark === "start" ? "yes" : "no" }),
	]);
