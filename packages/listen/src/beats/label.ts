/**
 * The tracker's tempo and meter, ported from the app's
 * `utils/beatThisGrid.ts` (stem-bench Study 41's rule).
 */
import { median } from "./bars.js";
import { firstAfter, firstAtLeast } from "./snap.js";

export type BeatsMeter = "4/4" | "3/4" | "6/8";

export type BeatsLabel = {
	/** 60 / the median inter-beat interval, whole bpm; null under 2 beats (the app's `tempo`). */
	beatTempo: number | null;
	/** The beat tempo in the meter's counting unit: dotted quarters in 6/8 (the app's `chartTempo`). */
	tempo: number | null;
	/** The modal beats per bar, the smallest on a tie; null under 2 downbeats. */
	beatsPerBar: number | null;
	meter: BeatsMeter | null;
	/** How many bars had each beat count. */
	counts: Record<number, number>;
};

function tempoOf(beats: readonly number[]): number | null {
	if (beats.length < 2) return null;
	const intervals = beats.slice(1).map((b, i) => b - (beats[i] as number));
	return Math.round(60 / median(intervals));
}

/** The most frequent count, the smallest on a tie; null for none. */
function modalOf(counts: Record<number, number>): number | null {
	let best: number | null = null;
	for (const [key, n] of Object.entries(counts)) {
		const k = Number(key);
		if (best === null || n > (counts[best] as number) || (n === counts[best] && k < best)) best = k;
	}
	return best;
}

function meterOf(beatsPerBar: number | null): BeatsMeter | null {
	if (beatsPerBar === null) return null;
	if (beatsPerBar === 6) return "6/8";
	return beatsPerBar === 3 ? "3/4" : "4/4";
}

/**
 * The tempo and meter from a beat tracker's beats and downbeats (seconds).
 * Tempo is 60 over the median inter-beat interval, rounded to a whole bpm.
 * Each bar's beat count is the beats strictly between two downbeats plus
 * one, and the modal count names the meter: 6 is "6/8", counted in dotted
 * quarters so its tempo is a third of the beat tempo; 3 is "3/4"; any
 * other count reads as "4/4" at the beat tempo.
 */
export function beatsLabel(beats: readonly number[], downbeats: readonly number[]): BeatsLabel {
	const beatTempo = tempoOf(beats);
	const counts: Record<number, number> = {};
	for (let i = 1; i < downbeats.length; i++) {
		const between =
			firstAtLeast(beats, downbeats[i] as number) - firstAfter(beats, downbeats[i - 1] as number);
		const n = Math.max(0, between) + 1;
		counts[n] = (counts[n] ?? 0) + 1;
	}
	const beatsPerBar = modalOf(counts);
	const meter = meterOf(beatsPerBar);
	const tempo = beatTempo !== null && meter === "6/8" ? Math.round(beatTempo / 3) : beatTempo;
	return { beatTempo, tempo, beatsPerBar, meter, counts };
}
