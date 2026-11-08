/**
 * The home page's Key menu: the chart drawn in another key, as Stem Shovel's
 * chord charts offer it (its ChartKeyChoice). A viewing choice: the source
 * never changes, only the text the chart is drawn from.
 */
import { parseChart, transposeChart } from "barmark";

export type ChartKey = { tonic: string; mode: string };
export type KeyChoice = { semitones: number; label: string; checked: boolean };

/** The fixed spelling of a moved key, by pitch class. */
const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** −5..+6: every key once, the shorter way round. */
export function normalize(n: number): number {
	const pc = ((Math.round(n) % 12) + 12) % 12;
	return pc > 6 ? pc - 12 : pc;
}

/** The pitch class (C = 0) of a tonic such as "F#" or "Bb"; null when it is not one. */
function pitchClass(tonic: string): number | null {
	let pc = LETTERS[tonic[0] ?? ""];
	if (pc === undefined) return null;
	for (const ch of tonic.slice(1)) {
		if (ch === "#" || ch === "♯") pc += 1;
		else if (ch === "b" || ch === "♭") pc -= 1;
		else return null;
	}
	return (pc + 12) % 12;
}

/** A bar line: `|` first, or a part label (no spaces; not `|`, `#`, `@` or a digit first) and a space before it. */
const BAR_LINE = /^\s*(?:[^\s|#@\d][^\s|]*\s+)?\|/;
/** Lines that look like bar lines but read as text (an undeclared label) are passed over, up to this many. */
const TRIES = 5;

/**
 * The key of the chart's first bar, or null. Only the text up to the first
 * bar line is read: the key that bar plays in is written before it, and a
 * long chart would otherwise be parsed whole on every key typed. A chart
 * that changes key later is labelled by this first key; transposing still
 * moves every key in it.
 */
export function chartKey(text: string): ChartKey | null {
	const lines = text.split("\n");
	let tries = 0;
	for (let i = 0; i < lines.length && tries < TRIES; i++) {
		if (!BAR_LINE.test(lines[i] ?? "")) continue;
		tries++;
		const bar = parseChart(lines.slice(0, i + 1).join("\n")).bars[0];
		if (!bar) continue;
		const key = bar.key;
		return key && pitchClass(key.tonic) !== null ? { tonic: key.tonic, mode: key.mode } : null;
	}
	return null;
}

/** The key `semitones` from the chart's own (its own spelling at 0), or with no key the distance. */
export function keyLabel(key: ChartKey | null, semitones: number): string {
	const n = normalize(semitones);
	if (!key) {
		if (n === 0) return "Original";
		return n > 0 ? `+${n}` : `−${-n}`;
	}
	const suffix = key.mode === "minor" ? "m" : "";
	if (n === 0) return key.tonic + suffix;
	return KEY_NAMES[((pitchClass(key.tonic) ?? 0) + n + 12) % 12] + suffix;
}

/** The menu: the twelve keys up from the chart's own (or the distances when it names none), the current one checked. */
export function keyChoices(key: ChartKey | null, semitones: number): KeyChoice[] {
	const current = normalize(semitones);
	const steps = key
		? Array.from({ length: 12 }, (_, i) => normalize(i))
		: [0, 1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5];
	const label = (n: number) => {
		if (key) return n === 0 ? `${keyLabel(key, 0)} (original)` : keyLabel(key, n);
		if (n === 0) return "Original";
		return n > 0 ? `Up ${n}` : `Down ${-n}`;
	};
	return steps.map((n) => ({ semitones: n, label: label(n), checked: n === current }));
}

/** The text to draw: the source itself in the original key, else barmark's transposition. */
export function transposed(text: string, semitones: number): string {
	const n = normalize(semitones);
	return n === 0 ? text : transposeChart(text, { semitones: n }).text;
}
