import type { ChartDiagnostic, Directives, Feel, Key, Meter, Mode, TempoChange } from "./types.js";

export const DIRECTIVE_NAMES = ["key", "time", "tempo", "feel"] as const;
type Name = (typeof DIRECTIVE_NAMES)[number];

const MODES: Mode[] = [
	"major",
	"minor",
	"ionian",
	"dorian",
	"phrygian",
	"lydian",
	"mixolydian",
	"aeolian",
	"locrian",
];
const FEELS: Feel[] = ["straight", "swing", "shuffle", "swing 16"];

/** `n/d` with n from 1 to 32 and d in 2, 4, 8, 16. */
export function parseMeter(text: string): Meter | null {
	const m = /^(\d{1,2})\/(\d{1,2})$/.exec(text.trim());
	if (!m) return null;
	const n = Number(m[1]);
	const d = Number(m[2]);
	if (n < 1 || n > 32 || ![2, 4, 8, 16].includes(d)) return null;
	return { n, d };
}

/** Beats per bar: compound meters (6/8, 9/8, 12/8) count dotted quarters. */
export function beatsOf(m: Meter): number {
	return m.d === 8 && [6, 9, 12].includes(m.n) ? m.n / 3 : m.n;
}

function parseKey(text: string): Key | null {
	const m = /^([A-G])([#b♯♭]?)(m|\s+([A-Za-z]+))?$/.exec(text);
	if (!m) return null;
	const tonic = `${m[1]}${(m[2] ?? "").replace("♯", "#").replace("♭", "b")}`;
	if (m[3] === "m") return { tonic, mode: "minor" };
	if (m[4] === undefined) return { tonic, mode: "major" };
	const mode = m[4].toLowerCase() as Mode;
	return MODES.includes(mode) ? { tonic, mode } : null;
}

function parseTempo(text: string): number | null {
	const m = /^(\d+(?:\.\d+)?)(?:\s*bpm)?$/i.exec(text);
	const n = m ? Number(m[1]) : 0;
	return n >= 1 && n <= 999 ? n : null;
}

const CHANGE = /^(?:(rit|rall|ritardando|rallentando)|accel|accelerando)\.?(?:\s+to\s+(.+))?$/i;

/** `rit.`, `accel.` (and their long and `rall.` spellings), optionally `to` a tempo; or `a tempo`. */
function parseTempoChange(text: string): TempoChange | null {
	if (/^a\s+tempo$/i.test(text)) return { kind: "a tempo" };
	const m = CHANGE.exec(text);
	if (!m) return null;
	const kind = m[1] ? "rit" : "accel";
	const to = m[2] === undefined ? null : parseTempo(m[2]);
	return m[2] !== undefined && to === null ? null : { kind, to };
}

/** The amount that means the same as the bare word: the triplet feel, ⅔ written to one decimal. */
const TRIPLET_PERCENT = 66.7;

type FeelValue = { feel: Feel; swingPercent?: number } | { error: string };

const FEEL_ERROR =
	"feel must be straight, swing, shuffle or swing 16, optionally with an amount (swing 58%)";

/** A feel and an amount: `swing 16 55%` is "swing 16", "55", "%". */
const WITH_AMOUNT = /^(.*?)\s*(\d+(?:\.\d+)?)(%?)$/;

/** Why `head digits sign` isn't a feel with an amount, or null when it is (7.1). */
function amountError(head: string, digits: string, sign: string): string | null {
	const feel = FEELS.find((f) => f === head);
	if (head && !feel) return FEEL_ERROR;
	if (!feel) return `a swing amount follows a feel: swing ${digits}%`;
	if (feel === "straight") return `straight takes no amount; write swing ${digits}%`;
	if (!sign) return `a swing amount needs a % sign: ${feel} ${digits}%`;
	if (/\.\d{2}/.test(digits)) return "a swing amount takes at most one decimal place";
	const amount = Number(digits);
	return amount < 50 || amount > 75 ? "a swing amount must be from 50% to 75%" : null;
}

/** `swing`, `swing 58%`, `swing 16 55%`: a kind, then an optional amount (7.1). */
function parseFeel(text: string): FeelValue {
	const lower = text.toLowerCase();
	const bare = FEELS.find((f) => f === lower);
	if (bare) return { feel: bare };
	const [, head = "", digits = "", sign = ""] = WITH_AMOUNT.exec(lower) ?? [];
	const error = digits ? amountError(head, digits, sign) : FEEL_ERROR;
	const feel = FEELS.find((f) => f === head);
	if (error || !feel) return { error: error ?? FEEL_ERROR };
	const amount = Number(digits);
	return amount === TRIPLET_PERCENT ? { feel } : { feel, swingPercent: amount };
}

/**
 * A directive line: one or more `name: value` parts separated by commas.
 * Returns null when the line does not start with a directive name and a colon.
 */
export function parseDirectiveLine(
	text: string,
	line: number,
): { set: Directives; diagnostics: ChartDiagnostic[] } | null {
	const head = /^(\w+)\s*:/.exec(text.trim());
	if (!head || !DIRECTIVE_NAMES.includes(head[1]?.toLowerCase() as Name)) return null;
	const set: Directives = {};
	const seen = new Set<Name>();
	const diagnostics: ChartDiagnostic[] = [];
	const error = (message: string, token: string) =>
		diagnostics.push({ line, severity: "error", message, token });
	for (const part of text
		.split(",")
		.map((p) => p.trim())
		.filter(Boolean)) {
		const m = /^(\w+)\s*:\s*(.*)$/.exec(part);
		const name = m?.[1]?.toLowerCase() as Name | undefined;
		const value = m?.[2]?.trim() ?? "";
		if (name === ("part" as string)) {
			error("part: goes on a line of its own; the name runs to the end of the line", part);
			continue;
		}
		if (!m || !name || !DIRECTIVE_NAMES.includes(name)) {
			error("unknown directive (key, time, tempo, feel)", part);
			continue;
		}
		if (seen.has(name)) {
			error(`${name} is given twice on this line`, name);
			continue;
		}
		seen.add(name);
		if (name === "key") {
			const key = parseKey(value);
			if (key) set.key = key;
			else error("key must be a root with optional m or a mode", value);
		} else if (name === "time") {
			const time = parseMeter(value);
			if (time) set.time = time;
			else error("time must be n/d with d of 2, 4, 8 or 16", value);
		} else if (name === "tempo") {
			const tempo = parseTempo(value);
			const change = tempo ? null : parseTempoChange(value);
			if (tempo) set.tempo = tempo;
			else if (change) set.tempoChange = change;
			else error("tempo must be beats per minute (1 to 999), rit., accel. or a tempo", value);
		} else {
			const feel = parseFeel(value);
			if ("error" in feel) error(feel.error, value);
			else Object.assign(set, feel);
		}
	}
	return { set, diagnostics };
}
