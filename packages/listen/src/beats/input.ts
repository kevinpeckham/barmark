/**
 * The input of `gridFromBeats`, checked in design §4.1's order: the first
 * problem refused as `invalid-input`, each array read once into a copy.
 */
import { type Meter, parseMeter } from "barmark";
import { invalid, isNumber, isRefusal, isTempo } from "../input.js";
import { type Refusal, refusal } from "../result.js";

/** The most beats, or downbeats, a call reads: about 18 hours at 180 bpm. */
export const MAX_BEATS = 200_000;

/** What the song is set to; either part may be missing. */
export type BeatsDeclared = { meter: Meter | null; tempo: number | null };

/** The input, checked and copied. */
export type CheckedBeats = {
	beats: number[];
	downbeats: number[];
	duration: number;
	declared: BeatsDeclared;
};

/** One list copied element by element, or why it cannot be read. */
function readTimes(list: unknown[], field: string, duration: number): number[] | Refusal {
	const copy: number[] = [];
	for (let i = 0; i < list.length; i++) {
		const t: unknown = list[i];
		const bad = !isNumber(t) || t < 0 || t > duration || (i > 0 && t <= (copy[i - 1] as number));
		if (bad)
			return refusal(
				"invalid-input",
				`The ${field}'s time ${i} must be a time in seconds from 0 to the duration, after the one before it.`,
				{ field, index: i },
			);
		copy.push(t);
	}
	return copy;
}

/** The declared meter, when given, or why it cannot be read. */
function readDeclaredMeter(text: unknown): Meter | null | Refusal {
	if (text === undefined) return null;
	const meter = typeof text === "string" ? parseMeter(text) : null;
	return meter ?? invalid("declared.meter", "The declared meter must read as a meter, as 4/4.");
}

/** The declared meter and tempo, either part optional, or why they cannot be read. */
function readDeclaredParts(declared: unknown): BeatsDeclared | Refusal {
	if (declared === undefined || declared === null) return { meter: null, tempo: null };
	if (typeof declared !== "object")
		return invalid("declared", "The declared meter and tempo must be an object.");
	const { meter: text, tempo } = declared as Record<string, unknown>;
	const meter = readDeclaredMeter(text);
	if (meter !== null && isRefusal(meter)) return meter;
	if (tempo === undefined) return { meter, tempo: null };
	if (!isTempo(tempo))
		return invalid("declared.tempo", "The declared tempo must be a number from 1 to 999.");
	return { meter, tempo };
}

/** `beats` or `downbeats` as a list of at most `MAX_BEATS`, or why it is not. */
function readList(given: Record<string, unknown>, field: string): unknown[] | Refusal {
	const list = given[field];
	if (!Array.isArray(list)) return invalid(field, `The ${field} must be a list of times.`);
	if (list.length > MAX_BEATS)
		return invalid(field, `The ${field} may hold at most ${MAX_BEATS} times.`);
	return list;
}

/** `beats` and `downbeats` (copied) in `given`, or why they cannot be read. */
function readBothLists(
	given: Record<string, unknown>,
	duration: number,
): { beats: number[]; downbeats: number[] } | Refusal {
	const lists = [readList(given, "beats"), readList(given, "downbeats")];
	for (const list of lists) if (isRefusal(list)) return list;
	const beats = readTimes(lists[0] as unknown[], "beats", duration);
	if (isRefusal(beats)) return beats;
	const downbeats = readTimes(lists[1] as unknown[], "downbeats", duration);
	return isRefusal(downbeats) ? downbeats : { beats, downbeats };
}

function readBeatsOnce(input: unknown): CheckedBeats | Refusal {
	if (typeof input !== "object" || input === null)
		return invalid("input", "The input must be an object.");
	const given = input as Record<string, unknown>;
	const duration = given.duration;
	if (!isNumber(duration) || duration <= 0)
		return invalid("duration", "The duration must be a number of seconds above 0.");
	const lists = readBothLists(given, duration);
	if (isRefusal(lists)) return lists;
	const declared = readDeclaredParts(given.declared);
	return isRefusal(declared) ? declared : { ...lists, duration, declared };
}

/** The input checked in spec §4.1's order; the first problem refused. Never throws. */
export function readBeats(input: unknown): CheckedBeats | Refusal {
	try {
		return readBeatsOnce(input);
	} catch {
		return invalid("input", "The input could not be read.");
	}
}
