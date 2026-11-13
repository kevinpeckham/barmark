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

/** A list's length, read once, and the list. */
type Listed = { list: unknown[]; length: number };

/** The sentence for the time at `index` (0-based) that cannot be a beat or a downbeat. */
function badTime(field: string, index: number, length: number, outOfRange: boolean): Refusal {
	const noun = field === "beats" ? "Beat" : "Downbeat";
	const message = outOfRange
		? `${noun} ${index + 1} of ${length} is not a time in seconds between 0 and the recording's length.`
		: `${noun} ${index + 1} does not come after the one before it.`;
	return refusal("invalid-input", message, { field, index });
}

/** One list copied element by element, to the length read once, or why it cannot be read. */
function readTimes({ list, length }: Listed, field: string, duration: number): number[] | Refusal {
	const copy: number[] = [];
	for (let i = 0; i < length; i++) {
		const t: unknown = list[i];
		if (!isNumber(t) || t < 0 || t > duration) return badTime(field, i, length, true);
		if (i > 0 && t <= (copy[i - 1] as number)) return badTime(field, i, length, false);
		copy.push(t);
	}
	return copy;
}

/** The declared meter, when given and not null, or why it cannot be read. */
function readDeclaredMeter(text: unknown): Meter | null | Refusal {
	if (text === undefined || text === null) return null;
	const meter = typeof text === "string" ? parseMeter(text) : null;
	return meter ?? invalid("declared.meter", "The declared meter must read as a meter, as 4/4.");
}

/** The declared tempo, when given and not null, or why it cannot be read. */
function readDeclaredTempo(tempo: unknown): { tempo: number | null } | Refusal {
	if (tempo === undefined || tempo === null) return { tempo: null };
	if (isTempo(tempo)) return { tempo };
	return invalid("declared.tempo", "The declared tempo must be a number from 1 to 999.");
}

/** The declared meter and tempo, either part optional or null, or why they cannot be read. */
function readDeclaredParts(declared: unknown): BeatsDeclared | Refusal {
	if (declared === undefined || declared === null) return { meter: null, tempo: null };
	if (typeof declared !== "object" || Array.isArray(declared))
		return invalid("declared", "The declared meter and tempo must be an object.");
	const { meter: text, tempo } = declared as Record<string, unknown>;
	const meter = readDeclaredMeter(text);
	if (meter !== null && isRefusal(meter)) return meter;
	const given = readDeclaredTempo(tempo);
	return isRefusal(given) ? given : { meter, tempo: given.tempo };
}

/** `beats` or `downbeats` as a list of at most `MAX_BEATS`, its length read once, or why it is not. */
function readList(given: Record<string, unknown>, field: string): Listed | Refusal {
	const list = given[field];
	if (!Array.isArray(list)) return invalid(field, `The ${field} must be a list of times.`);
	const length = list.length;
	if (length > MAX_BEATS)
		return invalid(field, `The ${field} may hold at most ${MAX_BEATS} times.`);
	return { list, length };
}

/** `beats` and `downbeats` (copied) in `given`, or why they cannot be read. */
function readBothLists(
	given: Record<string, unknown>,
	duration: number,
): { beats: number[]; downbeats: number[] } | Refusal {
	const lists = [readList(given, "beats"), readList(given, "downbeats")];
	for (const list of lists) if (isRefusal(list)) return list;
	const beats = readTimes(lists[0] as Listed, "beats", duration);
	if (isRefusal(beats)) return beats;
	const downbeats = readTimes(lists[1] as Listed, "downbeats", duration);
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
