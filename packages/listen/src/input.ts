/**
 * The checks of a call's input that more than one stage shares (design
 * §4.1's `invalid-input`): the declared meter and tempo, and the start of
 * bar one.
 */
import { type Meter, parseMeter } from "barmark";
import { type Refusal, refusal } from "./result.js";

/** `invalid-input` naming the field. */
export const invalid = (field: string, message: string): Refusal =>
	refusal("invalid-input", message, { field });

export const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const isRefusal = (v: object): v is Refusal => "reason" in v;

/** A tempo in grammar 2.1's beat: a finite number from 1 to 999. */
export const isTempo = (v: unknown): v is number => isNumber(v) && v >= 1 && v <= 999;

/** The declared meter and tempo, or why they cannot be read. */
export function readDeclared(declared: unknown): { meter: Meter; tempo: number } | Refusal {
	if (typeof declared !== "object" || declared === null)
		return invalid("declared", "The declared meter and tempo must be an object.");
	const { meter: text, tempo } = declared as Record<string, unknown>;
	const meter = typeof text === "string" ? parseMeter(text) : null;
	if (!meter) return invalid("declared.meter", "The declared meter must read as a meter, as 4/4.");
	if (!isTempo(tempo))
		return invalid("declared.tempo", "The declared tempo must be a number from 1 to 999.");
	return { meter, tempo };
}

/** `startAt` (null when not given), or why it cannot be read. */
export function readStart(startAt: unknown): { startAt: number | null } | Refusal {
	if (startAt === undefined || startAt === null) return { startAt: null };
	if (isNumber(startAt) && startAt >= 0) return { startAt };
	return invalid("startAt", "The start of bar one must be a time in seconds from 0.");
}

/** `recording.id` (absent: none), or why it cannot be read. */
export function readRecording(recording: unknown) {
	if (recording === undefined) return { id: undefined };
	if (typeof recording !== "object" || recording === null)
		return invalid("recording", "The recording must be an object with an optional id.");
	const { id } = recording as Record<string, unknown>;
	if (id === undefined || typeof id === "string") return { id };
	return invalid("recording.id", "The recording's id must be a string.");
}
